/**
 * Frame sampling and comparison.
 *
 * This file is the reason the video layer is allowed to say "measured". Every
 * number the report shows for cut density, held frames, and probed seconds comes
 * out of `probeWindows` + `probeBoundaries` + `foldProbe`, so what is tested here
 * is not arithmetic trivia — it is whether a reported cut rate is a measurement or
 * a fabrication.
 *
 * The two tests that matter most:
 *
 *   • `foldProbe` skips burst boundaries. A boundary delta compares two frames
 *     from distant parts of the video, so counting it injects exactly one false
 *     cut per window. In a three-window probe that is three fabricated cuts —
 *     most of a plausible-looking cut rate on a video that never cuts.
 *   • `probedSeconds` counts only the pairs actually compared. Extrapolating the
 *     rate across the full runtime is the "twelve samples across ten minutes"
 *     mistake this module was built to avoid.
 */
import { describe, it, expect } from 'vitest';
import {
  CUT_THRESHOLD,
  HOOK_SECONDS,
  PROBE_FRAMES,
  PROBE_INTERVAL,
  PROBE_WINDOWS,
  STATIC_THRESHOLD,
  foldProbe,
  hookTimestamps,
  lumaDelta,
  probeBoundaries,
  probeWindows,
  sampleTimestamps,
  sheetGeometry,
} from './frame-signals';

/** An RGBA buffer of one flat grey, at the size the diff canvas produces. */
function flat(value: number, pixels = 64 * 36): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = value;
    buf[i + 1] = value;
    buf[i + 2] = value;
    buf[i + 3] = 255;
  }
  return buf;
}

describe('sheetGeometry', () => {
  it('keeps the video aspect ratio in the cell', () => {
    const wide = sheetGeometry(1920, 1080, 12);
    expect(wide.cellW / wide.cellH).toBeCloseTo(16 / 9, 1);

    const tall = sheetGeometry(1080, 1920, 12);
    expect(tall.cellW / tall.cellH).toBeCloseTo(9 / 16, 1);
  });

  it('lays portrait video out wider so the sheet does not become a tower', () => {
    // Six columns for 9:16, four for 16:9. Four columns of a 9:16 cell would give
    // the vision model a 1280x1707 image, most of which is one frame.
    expect(sheetGeometry(1080, 1920, 12).cols).toBe(6);
    expect(sheetGeometry(1920, 1080, 12).cols).toBe(4);
    expect(sheetGeometry(1080, 1920, 12).sheetH).toBeLessThan(
      sheetGeometry(1080, 1920, 12).sheetW,
    );
  });

  it('never returns a zero or negative canvas from a broken decoder', () => {
    // A decoder reporting 0x0 must not produce `canvas.width = 0`, which throws
    // on `drawImage` and would lose the whole pass to an exception.
    for (const [w, h] of [[0, 0], [-1, 720], [1920, 0]]) {
      const geo = sheetGeometry(w, h, 12);
      expect(geo.cellW).toBeGreaterThan(0);
      expect(geo.cellH).toBeGreaterThan(0);
      expect(geo.sheetW).toBeGreaterThan(0);
      expect(geo.sheetH).toBeGreaterThan(0);
    }
  });

  it('sizes the grid to hold every frame', () => {
    const geo = sheetGeometry(1920, 1080, 12);
    expect(geo.cols * geo.rows).toBeGreaterThanOrEqual(12);
  });
});

describe('sampleTimestamps', () => {
  it('spreads across the runtime without landing on the first or last frame', () => {
    // The opening frame of an export is routinely black and the tail is an end
    // card. Neither describes the video, and both are what 0 and `duration` hit.
    const ts = sampleTimestamps(600, 12);
    expect(ts).toHaveLength(12);
    expect(ts[0]).toBeGreaterThan(0);
    expect(ts[11]).toBeLessThan(600);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });

  it('returns nothing for a duration a decoder could not read', () => {
    expect(sampleTimestamps(0)).toEqual([]);
    expect(sampleTimestamps(NaN)).toEqual([]);
    expect(sampleTimestamps(Infinity)).toEqual([]);
    expect(sampleTimestamps(-4)).toEqual([]);
  });

  it('handles a single-frame request without dividing by zero', () => {
    const ts = sampleTimestamps(100, 1);
    expect(ts).toHaveLength(1);
    expect(Number.isFinite(ts[0])).toBe(true);
  });
});

describe('hookTimestamps', () => {
  it('stays inside the opening window and skips the black first frame', () => {
    const ts = hookTimestamps(120, 4);
    expect(ts).toHaveLength(4);
    expect(ts[0]).toBeGreaterThan(0);
    expect(Math.max(...ts)).toBeLessThanOrEqual(HOOK_SECONDS);
  });

  it('does not sample past the end of a video shorter than the hook window', () => {
    const ts = hookTimestamps(1.5, 4);
    expect(Math.max(...ts)).toBeLessThanOrEqual(1.5);
  });

  it('returns nothing for an unreadable duration', () => {
    expect(hookTimestamps(0)).toEqual([]);
    expect(hookTimestamps(NaN)).toEqual([]);
  });
});

describe('probeWindows', () => {
  it('emits bursts at a fixed small interval, which is what makes a spike a cut', () => {
    const ts = probeWindows(600, 3, 8, 0.4);
    expect(ts).toHaveLength(24);
    // Within a burst, consecutive frames are 400ms apart. Across the boundary they
    // are minutes apart — the gap `probeBoundaries` exists to mark.
    expect(ts[1] - ts[0]).toBeCloseTo(0.4, 3);
    expect(ts[8] - ts[7]).toBeGreaterThan(1);
  });

  it('spreads the bursts so one static stretch cannot decide the rate', () => {
    const ts = probeWindows(600, 3, 8, 0.4);
    const starts = [ts[0], ts[8], ts[16]];
    expect(starts[0]).toBeGreaterThan(100);
    expect(starts[1]).toBeGreaterThan(starts[0] + 100);
    expect(starts[2]).toBeGreaterThan(starts[1] + 100);
    expect(starts[2]).toBeLessThan(600);
  });

  it('stays inside the file at both ends', () => {
    const ts = probeWindows(12, 3, 8, 0.4);
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ts)).toBeLessThan(12);
  });

  it('uses a single burst on a video shorter than one burst', () => {
    // Three overlapping bursts on a 2s clip would sample the same moments three
    // times and count each cut three times.
    const ts = probeWindows(2, 3, 8, 0.4);
    expect(ts.length).toBeLessThanOrEqual(8);
    expect(new Set(ts).size).toBe(ts.length);
    expect(Math.max(...ts)).toBeLessThan(2);
  });

  it('returns nothing when there is nothing to probe', () => {
    expect(probeWindows(0)).toEqual([]);
    expect(probeWindows(NaN)).toEqual([]);
    expect(probeWindows(600, 0)).toEqual([]);
    expect(probeWindows(600, 3, 1)).toEqual([]);
  });
});

describe('probeBoundaries', () => {
  it('marks the index that begins each burst', () => {
    expect([...probeBoundaries(3, 8)]).toEqual([0, 8, 16]);
  });

  it('lines up with the flat list probeWindows returns', () => {
    const ts = probeWindows(600, PROBE_WINDOWS, PROBE_FRAMES, PROBE_INTERVAL);
    for (const i of probeBoundaries(PROBE_WINDOWS, PROBE_FRAMES)) {
      expect(i).toBeLessThan(ts.length);
    }
  });
});

describe('lumaDelta', () => {
  it('is zero for the same picture twice', () => {
    expect(lumaDelta(flat(120), flat(120))).toBe(0);
  });

  it('is one for black against white', () => {
    expect(lumaDelta(flat(0), flat(255))).toBeCloseTo(1, 2);
  });

  it('puts a hard cut above the threshold and lighting drift below it', () => {
    // The calibration the whole cut count rests on: a 12/255 exposure shift is not
    // an edit, and a 100/255 jump between unrelated shots is.
    expect(lumaDelta(flat(40), flat(52))).toBeLessThan(CUT_THRESHOLD);
    expect(lumaDelta(flat(40), flat(150))).toBeGreaterThan(CUT_THRESHOLD);
  });

  it('reads a repeated frame as static', () => {
    expect(lumaDelta(flat(90), flat(91))).toBeLessThan(STATIC_THRESHOLD);
  });

  it('survives buffers of different or degenerate length', () => {
    expect(lumaDelta(flat(10, 4), flat(10, 9))).toBe(0);
    expect(lumaDelta(new Uint8ClampedArray(0), flat(10))).toBe(0);
    expect(lumaDelta(new Uint8ClampedArray([1, 2]), flat(10))).toBe(0);
  });
});

describe('foldProbe', () => {
  const boundaries = probeBoundaries(3, 4);

  it('never counts a burst boundary as a cut', () => {
    // Every boundary delta is maximal — two unrelated parts of the video. Counting
    // them would report three cuts on footage that contains none.
    const deltas: (number | null)[] = [];
    for (let w = 0; w < 3; w++) {
      deltas.push(0.9); // the seam
      deltas.push(0.001, 0.001, 0.001); // three identical frames inside the burst
    }
    const out = foldProbe(deltas, boundaries, 0.4);
    expect(out.cuts).toBe(0);
    expect(out.comparisons).toBe(9);
    expect(out.staticPairs).toBe(9);
  });

  it('counts real cuts inside the bursts', () => {
    const deltas: (number | null)[] = [
      0.9, 0.5, 0.02, 0.02, // burst 1: one cut
      0.9, 0.02, 0.6, 0.02, // burst 2: one cut
      0.9, 0.02, 0.02, 0.02, // burst 3: none
    ];
    const out = foldProbe(deltas, boundaries, 0.4);
    expect(out.cuts).toBe(2);
    expect(out.comparisons).toBe(9);
  });

  it('reports probed seconds from the pairs compared, not from the runtime', () => {
    // 9 comparisons at 400ms is 3.6s of real footage, whatever the video's length.
    // Scaling this to the runtime is how a made-up cut rate gets made up.
    const deltas: (number | null)[] = Array.from({ length: 12 }, () => 0.05);
    const out = foldProbe(deltas, boundaries, 0.4);
    expect(out.comparisons).toBe(9);
    expect(out.probedSeconds).toBeCloseTo(3.6, 3);
  });

  it('drops frames that failed to decode instead of scoring them as zero', () => {
    // A null is a seek that produced nothing. Treating it as 0 would count a
    // failed decode as a held frame and inflate the static ratio.
    const deltas: (number | null)[] = [0.9, null, 0.5, null, 0.9, 0.005, null, 0.005];
    const out = foldProbe(deltas, probeBoundaries(2, 4), 0.4);
    // Three of the eight indices are comparable: two boundaries and three nulls
    // are dropped, and the probed seconds shrink with them rather than staying at
    // the length the sampler asked for.
    expect(out.comparisons).toBe(3);
    expect(out.probedSeconds).toBeCloseTo(1.2, 3);
    expect(out.cuts).toBe(1);
    expect(out.staticPairs).toBe(2);
  });

  it('ignores a non-finite delta', () => {
    const out = foldProbe([0.9, NaN, Infinity, 0.3], probeBoundaries(1, 4), 0.4);
    expect(out.comparisons).toBe(1);
    expect(out.cuts).toBe(1);
  });

  it('reports zero, not NaN, when nothing was comparable', () => {
    // The unmeasured case. A NaN here reaches the report as "NaN cuts per minute".
    const out = foldProbe([null, null, null], probeBoundaries(1, 4), 0.4);
    expect(out.comparisons).toBe(0);
    expect(out.cuts).toBe(0);
    expect(out.meanDelta).toBe(0);
    expect(out.probedSeconds).toBe(0);
  });

  it('averages only across compared pairs', () => {
    const out = foldProbe([0.9, 0.2, 0.4, null], probeBoundaries(1, 4), 0.4);
    expect(out.comparisons).toBe(2);
    expect(out.meanDelta).toBeCloseTo(0.3, 6);
  });
});
