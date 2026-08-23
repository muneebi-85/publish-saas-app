'use client';

/**
 * Decode the uploaded video in the browser and measure it.
 *
 * WHY IN THE BROWSER
 * The file is already there. The review runs on Vercel serverless, which has no
 * ffmpeg and no video decoder, and the alternative — a separate worker box that
 * pulls the file back out of storage to decode it — costs a deploy target and a
 * gigabyte of egress per audit to obtain frames the uploader's own machine already
 * had decoded. `<video>` plus `<canvas>` is the whole dependency list.
 *
 * WHAT LEAVES THE BROWSER
 * Two JPEG contact sheets and about a dozen integers. Not the frames individually,
 * and not the video: the sheets are ~150 KB together, which is what makes this one
 * extra vision call rather than a video pipeline.
 *
 * WHEN IT RETURNS NULL
 * Unsupported codec (Safari-only HEVC, some MOV variants), a decoder that reports
 * zero dimensions, a seek that never completes, or the deadline. Null means the
 * server reports the layer as unmeasured — the same honest blank it showed before
 * this file existed. A partial or guessed result would be worse than none, because
 * the report cannot tell the reader which numbers came from a real decode.
 */

import {
  DIFF_H,
  DIFF_W,
  HOOK_FRAMES,
  PROBE_FRAMES,
  PROBE_INTERVAL,
  PROBE_WINDOWS,
  SHEET_FRAMES,
  foldProbe,
  hookTimestamps,
  lumaDelta,
  probeBoundaries,
  probeWindows,
  sampleTimestamps,
  sheetGeometry,
} from './frame-signals';

/** Whole-run ceiling. Past this we return what is complete, or null. */
const DEADLINE_MS = 30_000;

/** One seek. A decoder that has not produced a frame by now is not going to. */
const SEEK_TIMEOUT_MS = 4_000;

/** Contact-sheet encoding quality. Above ~0.75 the file grows without the model seeing more. */
const JPEG_QUALITY = 0.72;

export type FrameSignals = {
  width: number;
  height: number;
  durationSeconds: number;
  sizeBytes: number;
  /** Frames that made it into the contact sheet. */
  sheetFrames: number;
  /** Frame pairs compared inside the probe bursts. */
  comparisons: number;
  cuts: number;
  staticPairs: number;
  /** Mean luma delta across probe pairs, in per-mille so it survives integer validation. */
  meanDeltaPermille: number;
  probedSeconds: number;
  /** Contact sheet across the whole runtime. */
  sheet: Blob;
  /** Contact sheet of the opening three seconds. Null on a video too short to have one. */
  hookSheet: Blob | null;
};

type Grabber = {
  video: HTMLVideoElement;
  /** Draws the frame at `t` into the sheet cell `index`, and returns its diff buffer. */
  grab: (t: number) => Promise<Uint8ClampedArray | null>;
  drawInto: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
  dispose: () => void;
};

/**
 * Measure a video file. Resolves null when the browser cannot decode it.
 *
 * `onProgress` reports 0..1 across the whole decode. It exists because this runs
 * for fifteen to thirty seconds on a long file and a frozen upload button reads as
 * a hang.
 */
export async function extractFrameSignals(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<FrameSignals | null> {
  const deadline = Date.now() + DEADLINE_MS;
  let grabber: Grabber | null = null;

  try {
    grabber = await openVideo(file);
    if (!grabber) return null;

    const { video } = grabber;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;

    // A decoder that reports no dimensions has not decoded anything. Some MOV and
    // HEVC files reach `loadedmetadata` in this state and then draw transparent
    // black forever, which would produce a full set of confident zeroes.
    if (!(width > 0) || !(height > 0) || !Number.isFinite(duration) || duration <= 0) return null;

    const sheetTimes = sampleTimestamps(duration, SHEET_FRAMES);
    const hookTimes = hookTimestamps(duration, HOOK_FRAMES);
    const probeTimes = probeWindows(duration, PROBE_WINDOWS, PROBE_FRAMES, PROBE_INTERVAL);
    const total = sheetTimes.length + hookTimes.length + probeTimes.length;
    let done = 0;
    const tick = () => onProgress?.(total === 0 ? 1 : ++done / total);

    // ── Contact sheet across the runtime ──────────────────────────────────────
    const geo = sheetGeometry(width, height, sheetTimes.length);
    const sheetCanvas = makeCanvas(geo.sheetW, geo.sheetH);
    const sheetCtx = sheetCanvas.getContext('2d');
    if (!sheetCtx) return null;
    // Black ground, so a cell whose seek failed reads as absent rather than as a
    // transparent square the JPEG encoder would turn white.
    sheetCtx.fillStyle = '#000';
    sheetCtx.fillRect(0, 0, geo.sheetW, geo.sheetH);

    let drawn = 0;
    for (const [i, t] of sheetTimes.entries()) {
      if (Date.now() > deadline) break;
      const ok = await grabber.grab(t);
      if (ok) {
        const col = i % geo.cols;
        const row = Math.floor(i / geo.cols);
        grabber.drawInto(sheetCtx, col * geo.cellW, row * geo.cellH, geo.cellW, geo.cellH);
        drawn++;
      }
      tick();
    }
    // Fewer than half the cells means the decoder is failing, not that the video is
    // short. Reporting a two-frame sheet as "analyzed" would be the fabrication.
    if (drawn < Math.ceil(sheetTimes.length / 2)) return null;

    // ── Hook sheet: the opening three seconds, at cell resolution ─────────────
    let hookSheet: Blob | null = null;
    if (hookTimes.length > 1 && Date.now() < deadline) {
      const hookGeo = sheetGeometry(width, height, hookTimes.length);
      const hookCanvas = makeCanvas(hookGeo.cellW * hookTimes.length, hookGeo.cellH);
      const hookCtx = hookCanvas.getContext('2d');
      if (hookCtx) {
        hookCtx.fillStyle = '#000';
        hookCtx.fillRect(0, 0, hookCanvas.width, hookCanvas.height);
        let hookDrawn = 0;
        for (const [i, t] of hookTimes.entries()) {
          if (Date.now() > deadline) break;
          if (await grabber.grab(t)) {
            grabber.drawInto(hookCtx, i * hookGeo.cellW, 0, hookGeo.cellW, hookGeo.cellH);
            hookDrawn++;
          }
          tick();
        }
        if (hookDrawn >= 2) hookSheet = await encode(hookCanvas);
      }
    }

    // ── Probe bursts: the only source of a real cut rate ──────────────────────
    const deltas: (number | null)[] = [];
    let previous: Uint8ClampedArray | null = null;
    for (const t of probeTimes) {
      if (Date.now() > deadline) break;
      const buffer = await grabber.grab(t);
      deltas.push(buffer && previous ? lumaDelta(previous, buffer) : null);
      previous = buffer ?? previous;
      tick();
    }
    const probe = foldProbe(deltas, probeBoundaries(PROBE_WINDOWS, PROBE_FRAMES), PROBE_INTERVAL);

    const sheet = await encode(sheetCanvas);
    if (!sheet) return null;
    onProgress?.(1);

    return {
      width,
      height,
      durationSeconds: Math.round(duration),
      sizeBytes: file.size,
      sheetFrames: drawn,
      comparisons: probe.comparisons,
      cuts: probe.cuts,
      staticPairs: probe.staticPairs,
      meanDeltaPermille: Math.round(probe.meanDelta * 1000),
      probedSeconds: Math.round(probe.probedSeconds),
      sheet,
      hookSheet,
    };
  } catch {
    // Decoder faults surface as DOM exceptions of a dozen different kinds. Every
    // one of them means the same thing to the caller: no measurement.
    return null;
  } finally {
    grabber?.dispose();
  }
}

/** Load the file into a detached `<video>` and hand back a seek-and-draw interface. */
async function openVideo(file: File): Promise<Grabber | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  // Required for `drawImage` to be allowed even on a blob URL in some engines, and
  // harmless on a same-origin object URL.
  video.crossOrigin = 'anonymous';
  video.src = url;

  const diff = makeCanvas(DIFF_W, DIFF_H);
  const diffCtx = diff.getContext('2d', { willReadFrequently: true });

  const dispose = () => {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      // Discarding the decoder is best-effort; the object URL below is what leaks.
    }
    URL.revokeObjectURL(url);
  };

  const ready = await once(video, 'loadedmetadata', SEEK_TIMEOUT_MS * 2);
  if (!ready || !diffCtx) {
    dispose();
    return null;
  }

  const grab = async (t: number): Promise<Uint8ClampedArray | null> => {
    video.currentTime = Math.max(0, t);
    if (!(await once(video, 'seeked', SEEK_TIMEOUT_MS))) return null;
    try {
      diffCtx.drawImage(video, 0, 0, DIFF_W, DIFF_H);
      return diffCtx.getImageData(0, 0, DIFF_W, DIFF_H).data;
    } catch {
      // A tainted canvas or a decoder that has not produced a frame yet.
      return null;
    }
  };

  const drawInto = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    try {
      ctx.drawImage(video, x, y, w, h);
    } catch {
      // Leaves the black ground in place for this cell.
    }
  };

  return { video, grab, drawInto, dispose };
}

/**
 * Resolve on the next `event`, or false on timeout.
 *
 * The timeout is the point. A seek into a damaged region of a file simply never
 * fires `seeked`, and without a ceiling the upload button waits forever with no
 * error anywhere to explain it.
 */
function once(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      resolve(ok);
    };
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
  });
}
