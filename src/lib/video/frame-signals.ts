/**
 * The measurement half of video analysis: where to sample, and how to compare.
 *
 * WHY THIS FILE HAS NO DOM IN IT
 * `extract-frames.ts` owns the `<video>` element and the canvases, which means it
 * can only run in a browser and can only be tested with a real decoder. Everything
 * here is arithmetic over numbers and pixel arrays, so it is unit-testable — and
 * the arithmetic is the part that decides whether a reported cut rate is a
 * measurement or a fabrication.
 *
 * THE SAMPLING PROBLEM, WHICH IS THE WHOLE DESIGN
 * The obvious approach — take twelve frames spread across the video and count how
 * many differ from their predecessor — produces a number that looks like a cut
 * rate and is not one. Twelve samples across ten minutes sit fifty seconds apart;
 * almost every consecutive pair differs, so the answer is always "eleven cuts"
 * regardless of the edit. That is the same class of invented figure as the
 * "12.7M videos" claim this codebase already removed.
 *
 * So there are two sampling strategies here, for two different questions:
 *
 *   SPREAD (`sampleTimestamps`) — twelve frames across the whole runtime, for the
 *     vision model. "What does this video look like" is a question a spread
 *     genuinely answers.
 *   PROBE (`probeWindows`) — short bursts at a fixed small interval, in a few
 *     places. Consecutive probe frames are 400ms apart, so a luma spike between
 *     them really is a cut, and the rate is reported over the probed seconds
 *     rather than extrapolated across the runtime.
 */

/** Frames in the contact sheet handed to the vision model. */
export const SHEET_FRAMES = 12;

/** Seconds between frames inside one probe burst. Small enough that a spike is a cut. */
export const PROBE_INTERVAL = 0.4;

/** Frames per burst. Eight at 400ms covers 2.8s of real footage per window. */
export const PROBE_FRAMES = 8;

/** Bursts, spread over the runtime so one static stretch cannot dominate. */
export const PROBE_WINDOWS = 3;

/**
 * Mean absolute luma difference above which two frames are treated as a cut.
 *
 * Calibrated to sit above camera motion and lighting drift at 400ms and below a
 * genuine scene change. Handheld pans land around 0.04-0.10; a hard cut between
 * unrelated shots lands well past 0.20.
 */
export const CUT_THRESHOLD = 0.18;

/** Below this two frames are the same picture: a hold, a freeze, or padding. */
export const STATIC_THRESHOLD = 0.012;

/** Longest opening treated as "the hook" — the window platforms decide on. */
export const HOOK_SECONDS = 3;

/** Frames sampled inside the hook window. */
export const HOOK_FRAMES = 4;

/** Width and height of the small buffer frames are compared at. */
export const DIFF_W = 64;
export const DIFF_H = 36;

/** Target pixel area of one contact-sheet cell, i.e. 320x180. */
const CELL_AREA = 320 * 180;

export type Geometry = {
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  sheetW: number;
  sheetH: number;
};

/**
 * Cell size and grid shape for a contact sheet of `count` frames.
 *
 * The cell keeps the video's own aspect ratio rather than being letterboxed into a
 * fixed box. Squashing a 9:16 frame into a 16:9 cell would misrepresent exactly
 * what the vision model is being asked to judge — framing and composition — and
 * bars would spend a third of the image on black.
 *
 * Portrait video gets more columns for the same reason: six-by-two keeps the sheet
 * roughly landscape, where four-by-three would produce a 1280x1707 tower.
 */
export function sheetGeometry(width: number, height: number, count: number): Geometry {
  const safeW = width > 0 ? width : 16;
  const safeH = height > 0 ? height : 9;
  const aspect = safeW / safeH;

  const cellW = Math.max(96, Math.round(Math.sqrt(CELL_AREA * aspect)));
  const cellH = Math.max(96, Math.round(cellW / aspect));

  const cols = aspect < 1 ? 6 : 4;
  const rows = Math.max(1, Math.ceil(count / cols));

  return {
    cellW,
    cellH,
    cols,
    rows,
    sheetW: cellW * Math.min(cols, Math.max(1, count)),
    sheetH: cellH * rows,
  };
}

/**
 * `count` timestamps spread across the runtime, for the contact sheet.
 *
 * The first and last 2% are skipped: openings are frequently a black frame or a
 * fade, and the tail is an end card. Neither describes the video, and both are
 * what a naive `0` and `duration` would land on.
 */
export function sampleTimestamps(duration: number, count = SHEET_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count < 1) return [];
  const start = duration * 0.02;
  const end = duration * 0.98;
  if (count === 1) return [round3((start + end) / 2)];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => round3(start + step * i));
}

/**
 * Timestamps inside the opening `HOOK_SECONDS`, for the hook sheet.
 *
 * Starts at 0.1s rather than 0: the very first frame of an export is routinely
 * black, and a black frame is not the hook.
 */
export function hookTimestamps(duration: number, count = HOOK_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const end = Math.min(HOOK_SECONDS, duration);
  if (end <= 0.1) return [round3(Math.max(0, duration / 2))];
  const step = (end - 0.1) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => round3(0.1 + step * i));
}

/**
 * Burst timestamps: `windows` groups of `frames`, each `interval` apart.
 *
 * Returned flat and ascending because seeking backwards is slower than seeking
 * forwards, and the caller walks them in one pass anyway. Window boundaries are
 * recoverable from `probeBoundaries`, which is what stops the gap between two
 * bursts from being miscounted as a cut.
 */
export function probeWindows(
  duration: number,
  windows = PROBE_WINDOWS,
  frames = PROBE_FRAMES,
  interval = PROBE_INTERVAL,
): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || windows < 1 || frames < 2) return [];

  const burst = (frames - 1) * interval;
  // A video shorter than one burst gets a single burst covering what exists,
  // rather than several overlapping ones that would count the same cut twice.
  if (duration <= burst) {
    const step = duration / frames;
    return Array.from({ length: frames }, (_, i) => round3(i * step)).filter((t) => t < duration);
  }

  const out: number[] = [];
  for (let w = 0; w < windows; w++) {
    // Anchors at 25%, 50%, 75% for three windows: past the intro, mid-body, and
    // before the outro, none of which is representative of the others.
    const anchor = duration * ((w + 1) / (windows + 1));
    const start = Math.min(Math.max(0, anchor - burst / 2), duration - burst);
    for (let f = 0; f < frames; f++) out.push(round3(start + f * interval));
  }
  return out;
}

/** Indices in a flat `probeWindows` list that begin a new burst. */
export function probeBoundaries(windows = PROBE_WINDOWS, frames = PROBE_FRAMES): Set<number> {
  const out = new Set<number>();
  for (let w = 0; w < windows; w++) out.add(w * frames);
  return out;
}

/**
 * Mean absolute luma difference between two RGBA buffers, 0..1.
 *
 * Luma only. Comparing raw RGB channels makes a colour grade look like a cut, and
 * a white-balance shift mid-shot is not an edit. Rec. 601 weights.
 */
export function lumaDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const len = Math.min(a.length, b.length);
  if (len < 4) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < len; i += 4) {
    const la = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000;
    const lb = (b[i] * 299 + b[i + 1] * 587 + b[i + 2] * 114) / 1000;
    sum += Math.abs(la - lb);
    n++;
  }
  return n === 0 ? 0 : sum / n / 255;
}

export type ProbeResult = {
  /** Frame pairs actually compared. The denominator behind every rate below. */
  comparisons: number;
  /** Pairs whose delta cleared `CUT_THRESHOLD`. */
  cuts: number;
  /** Pairs below `STATIC_THRESHOLD` — the same picture twice. */
  staticPairs: number;
  /** Mean delta across every compared pair, 0..1. */
  meanDelta: number;
  /** Real footage the comparisons cover, in seconds. */
  probedSeconds: number;
};

/**
 * Fold a burst's deltas into counts, skipping the seams between bursts.
 *
 * `deltas[i]` is the difference between probe frame `i` and `i - 1`, so index 0 is
 * always meaningless and any index that starts a new burst spans the gap between
 * two distant parts of the video. Counting those would put one guaranteed false
 * cut into every window — three of them in a three-window probe, which is most of
 * a fabricated cut rate.
 */
export function foldProbe(
  deltas: (number | null)[],
  boundaries: Set<number>,
  interval = PROBE_INTERVAL,
): ProbeResult {
  let comparisons = 0;
  let cuts = 0;
  let staticPairs = 0;
  let sum = 0;

  for (let i = 1; i < deltas.length; i++) {
    if (boundaries.has(i)) continue;
    const d = deltas[i];
    if (d === null || !Number.isFinite(d)) continue;
    comparisons++;
    sum += d;
    if (d >= CUT_THRESHOLD) cuts++;
    if (d <= STATIC_THRESHOLD) staticPairs++;
  }

  return {
    comparisons,
    cuts,
    staticPairs,
    meanDelta: comparisons === 0 ? 0 : sum / comparisons,
    probedSeconds: round3(comparisons * interval),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
