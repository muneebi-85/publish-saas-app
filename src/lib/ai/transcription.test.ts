import { describe, it, expect } from 'vitest';
import { computeIsMonotone } from './transcription';

/**
 * The null path this guards: `isMonotone: false` is a MEASURED claim that
 * pitch varies naturally (the authenticity engine pays +8 for it), so a
 * degenerate timing set (every word end === start, mean duration 0) must
 * report `null` — not computable — rather than a fabricated `false`.
 * The old implementation could never return null: `isFinite && (cv < t)`
 * evaluates to false, never null, when the CV is NaN.
 */
const word = (start: number, end: number) => ({ word: 'x', start, end });

describe('computeIsMonotone', () => {
  it('returns null on degenerate timings (all zero durations)', () => {
    expect(computeIsMonotone([word(0, 0), word(0.5, 0.5), word(1.2, 1.2)])).toBeNull();
  });

  it('returns null on an empty word list', () => {
    expect(computeIsMonotone([])).toBeNull();
  });

  it('returns true for uniform durations (robotic pacing)', () => {
    expect(computeIsMonotone([word(0, 0.4), word(0.4, 0.8), word(0.8, 1.2)])).toBe(true);
  });

  it('returns false for varied durations (natural pacing)', () => {
    expect(
      computeIsMonotone([word(0, 0.1), word(0.1, 0.9), word(0.9, 1.0), word(1.0, 1.6)]),
    ).toBe(false);
  });

  it('a null (unmeasured) is distinguishable from a measured false', () => {
    const degenerate = computeIsMonotone([word(0, 0)]);
    const natural = computeIsMonotone([word(0, 0.1), word(0.1, 0.9)]);
    expect(degenerate).not.toEqual(natural);
    expect(degenerate === null).toBe(true);
    expect(natural === false).toBe(true);
  });
});
