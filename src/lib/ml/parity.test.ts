/**
 * Python ↔ TypeScript parity.
 *
 * The model is trained in Python and scored in TypeScript. Those are two
 * different implementations of the same 64-column feature vector and the same
 * tree walk, and if they disagree the app shows confident numbers the model never
 * produced. Nothing about that failure is visible from inside either language:
 * the TS code has no bug, the Python code has no bug, and the scores are wrong.
 *
 * So this file is the join. `ml/publishml/parity.py` writes `__fixtures__/parity.json`
 * containing inputs plus the values PYTHON computed for them; every test below
 * recomputes those values in TypeScript and demands they match.
 *
 * If a test here fails after you edited `features.py`, the fix is to make the
 * matching edit in `features.ts` and regenerate:
 *
 *     cd ml && python -m publishml.parity
 *
 * Regenerating without reading the diff defeats the entire point of the file.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { extract, toVector, durationSeconds, type ChannelInput, type VideoInput } from './features';
import { clampScore, score, scoreNamed, validate, type PublishModel } from './gbdt';

type FeatureCase = {
  name: string;
  video: Record<string, unknown>;
  channel: Record<string, unknown>;
  thumb: Record<string, number> | null;
  expected: Record<string, number>;
};

type ScoreVector = { name: string; vector: number[]; expected: number };

type Fixture = {
  generatedBy: string;
  now: string;
  featureNames: string[];
  cases: FeatureCase[];
  model: PublishModel;
  scoreVectors: ScoreVector[];
};

const fixture: Fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/parity.json', import.meta.url)), 'utf8'),
);

/** The clock Python used. Age features are meaningless without it. */
const NOW = new Date(fixture.now);

/**
 * Python rounded its expectations to 10 decimals, so the tolerance has to sit
 * below anything meaningful and above float formatting noise. 1e-9 on a feature
 * value, 1e-6 on a summed score (12 trees of accumulated addition).
 */
const FEATURE_TOLERANCE = 1e-9;
const SCORE_TOLERANCE = 1e-6;

/** JSON keys arrive as `unknown`; the extractor's input types are narrower. */
function asVideo(raw: Record<string, unknown>): VideoInput {
  return raw as VideoInput;
}
function asChannel(raw: Record<string, unknown>): ChannelInput {
  return raw as ChannelInput;
}

describe('parity fixture', () => {
  it('is the fixture this test expects, not a stale or hand-edited one', () => {
    expect(fixture.generatedBy).toBe('python -m publishml.parity');
    expect(fixture.cases.length).toBeGreaterThan(0);
    expect(fixture.scoreVectors.length).toBeGreaterThan(0);
    expect(Number.isNaN(NOW.getTime())).toBe(false);
  });

  it('has a feature list that is sorted and free of duplicates', () => {
    // `features.py` returns `sorted(CONTROLLABLE | CONTEXT)` precisely so the two
    // languages cannot disagree about which column is index 34. If that ordering
    // ever stops being sorted, the guarantee is gone.
    const sorted = [...fixture.featureNames].sort();
    expect(fixture.featureNames).toEqual(sorted);
    expect(new Set(fixture.featureNames).size).toBe(fixture.featureNames.length);
  });

  it('partitions every feature into exactly one of controllable or context', () => {
    // A feature in neither is a feature nothing can ever recommend and nothing
    // holds fixed — an invisible hole in the recommender.
    const controllable = new Set(fixture.model.controllable);
    const context = new Set(fixture.model.context);
    for (const name of fixture.featureNames) {
      const inControllable = controllable.has(name);
      const inContext = context.has(name);
      expect(inControllable || inContext, `${name} is in neither set`).toBe(true);
      expect(inControllable && inContext, `${name} is in both sets`).toBe(false);
    }
    expect(controllable.size + context.size).toBe(fixture.featureNames.length);
  });
});

describe('feature extraction matches Python', () => {
  for (const testCase of fixture.cases) {
    describe(testCase.name, () => {
      const row = extract(
        asVideo(testCase.video),
        asChannel(testCase.channel),
        testCase.thumb,
        NOW,
      );

      it('produces exactly the same set of feature names', () => {
        // Compared as sorted lists rather than sets so the failure message names
        // the missing or extra feature instead of just a count.
        expect(Object.keys(row).sort()).toEqual(Object.keys(testCase.expected).sort());
      });

      // One assertion per feature: a single deep-equal would report "objects
      // differ" for 64 numbers, and finding which one took the divergence is the
      // whole job.
      for (const [name, expected] of Object.entries(testCase.expected)) {
        it(`${name} = ${expected}`, () => {
          expect(row[name]).toBeCloseTo(expected, 9);
          expect(Math.abs(row[name] - expected)).toBeLessThan(FEATURE_TOLERANCE);
        });
      }
    });
  }
});

describe('the divergences this mirror exists to prevent', () => {
  // These re-state the three known Python/JS traps as direct assertions. The
  // fixture cases above would catch each one, but only as "some number is
  // different" — these say what broke.

  it('counts code points, not UTF-16 units', () => {
    // 😱 and 🔥 are one character each in Python and two in JavaScript.
    const row = extract({ title: 'ab😱🔥', description: '', tags: [] }, {}, null, NOW);
    expect('ab😱🔥'.length).toBe(6); // what the naive implementation would report
    expect(row.title_len).toBe(4);
  });

  it('treats an empty description as zero lines, not one empty line', () => {
    // `''.split('\n')` is `['']` — length 1. Python's `''.splitlines()` is `[]`.
    const row = extract({ title: 'x', description: '', tags: [] }, {}, null, NOW);
    expect(row.desc_lines).toBe(0);
  });

  it('does not count a trailing newline as an extra line', () => {
    const withTerminator = extract({ title: 'x', description: 'a\nb\n', tags: [] }, {}, null, NOW);
    const without = extract({ title: 'x', description: 'a\nb', tags: [] }, {}, null, NOW);
    expect(withTerminator.desc_lines).toBe(2);
    expect(without.desc_lines).toBe(2);
  });

  it('splits CRLF once, not twice', () => {
    const row = extract({ title: 'x', description: 'a\r\nb\r\nc', tags: [] }, {}, null, NOW);
    expect(row.desc_lines).toBe(3);
  });

  it('numbers weekdays from Monday, like Python', () => {
    // 2026-08-17 is a Monday, 2026-08-16 a Sunday.
    const monday = extract({ title: 'x', publishedAt: '2026-08-17T12:00:00Z' }, {}, null, NOW);
    const sunday = extract({ title: 'x', publishedAt: '2026-08-16T12:00:00Z' }, {}, null, NOW);
    expect(monday.publish_dow).toBe(0);
    expect(monday.publish_weekend).toBe(0);
    expect(sunday.publish_dow).toBe(6);
    expect(sunday.publish_weekend).toBe(1);
  });

  it('matches hashtags and words containing non-ASCII letters', () => {
    // JavaScript's `\w` is ASCII-only; Python's is not. `#café` must count.
    const row = extract({ title: 'x', description: '#café #españa', tags: [] }, {}, null, NOW);
    expect(row.desc_hashtags).toBe(2);
  });
});

describe('duration parsing', () => {
  const cases: Array<[string | null | undefined, number]> = [
    ['PT0S', 0],
    ['PT58S', 58],
    ['PT7M7S', 427],
    ['PT14M32S', 872],
    ['PT1H2M', 3720],
    ['P1DT2H3M4S', 93784],
    ['PT1H', 3600],
    // Anything unparseable is 0, matching Python — never NaN, which would
    // silently poison `duration_log` and every tree comparison downstream.
    ['garbage', 0],
    ['', 0],
    [null, 0],
    [undefined, 0],
  ];
  for (const [iso, expected] of cases) {
    it(`${String(iso)} → ${expected}s`, () => {
      expect(durationSeconds(iso)).toBe(expected);
    });
  }

  it('classifies a Short by the same cutoff the trainer used', () => {
    expect(extract({ title: 'x', duration: 'PT60S' }, {}, null, NOW).is_shorts).toBe(1);
    expect(extract({ title: 'x', duration: 'PT61S' }, {}, null, NOW).is_shorts).toBe(0);
    // Zero means "unknown duration", not "a zero-second Short".
    expect(extract({ title: 'x', duration: 'PT0S' }, {}, null, NOW).is_shorts).toBe(0);
  });
});

describe('tree walker matches Python', () => {
  for (const entry of fixture.scoreVectors) {
    it(`${entry.name} → ${entry.expected}`, () => {
      const actual = score(fixture.model, entry.vector);
      expect(Math.abs(actual - entry.expected)).toBeLessThan(SCORE_TOLERANCE);
    });
  }

  it('scores a named row identically to a positional one', () => {
    // `scoreNamed` is what the app actually calls; if it disagrees with `score`,
    // the parity proven above does not apply to production.
    for (const testCase of fixture.cases) {
      const row = extract(
        asVideo(testCase.video),
        asChannel(testCase.channel),
        testCase.thumb,
        NOW,
      );
      const positional = score(fixture.model, toVector(row, fixture.model.features));
      expect(scoreNamed(fixture.model, row)).toBeCloseTo(positional, 10);
    }
  });

  it('sends an exact threshold match left', () => {
    // Tree 1 in the fixture splits feature 0 at exactly 1.0, leaf 10 left and
    // -10 right. `<` instead of `<=` is the single easiest way to mis-mirror a
    // GBDT, and it costs about 1% of predictions — small enough to look fine.
    const onThreshold = new Array<number>(fixture.model.features.length).fill(0);
    onThreshold[0] = 1.0;
    const justAbove = [...onThreshold];
    justAbove[0] = 1.0 + 1e-9;
    expect(score(fixture.model, onThreshold) - score(fixture.model, justAbove)).toBeCloseTo(20, 6);
  });

  it('handles a tree whose root is a leaf', () => {
    // Tree 0 is a stump: root -1, no internal nodes. The walk loop must run zero
    // times rather than dereference `feature[-1]`.
    const stumpOnly: PublishModel = {
      ...fixture.model,
      baseScore: 0,
      trees: [fixture.model.trees[0]],
    };
    expect(score(stumpOnly, new Array(fixture.model.features.length).fill(0))).toBe(3.25);
  });

  it('includes baseScore in every prediction', () => {
    // sklearn keeps the intercept out of the trees. Dropping it shifts every
    // score by ~50 — a working-looking model that is uniformly wrong.
    const zeroed: PublishModel = { ...fixture.model, baseScore: 0 };
    const vector = new Array<number>(fixture.model.features.length).fill(0);
    expect(score(fixture.model, vector) - score(zeroed, vector)).toBeCloseTo(
      fixture.model.baseScore,
      10,
    );
  });

  it('treats a missing feature as 0, exactly as the trainer did', () => {
    // Rows whose thumbnail never downloaded reached training with every `thumb_*`
    // at 0. A score-time row with the same gap must land in the same leaves.
    const explicitZeros: Record<string, number> = {};
    for (const name of fixture.model.features) explicitZeros[name] = 0;
    expect(scoreNamed(fixture.model, {})).toBeCloseTo(scoreNamed(fixture.model, explicitZeros), 10);
  });
});

describe('model validation', () => {
  it('accepts the fixture against the extractor it was built from', () => {
    expect(validate(fixture.model, fixture.featureNames)).toBeNull();
  });

  it('rejects a model whose feature order drifted', () => {
    // The vector is positional. Same names in a different order is the worst
    // possible failure: every score is wrong and nothing throws.
    const swapped = [...fixture.model.features];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const reason = validate({ ...fixture.model, features: swapped }, fixture.featureNames);
    expect(reason).toMatch(/feature 0 mismatch/);
  });

  it('rejects a model with a different number of features', () => {
    const truncated = fixture.model.features.slice(0, -1);
    expect(validate({ ...fixture.model, features: truncated }, fixture.featureNames)).toMatch(
      /feature count mismatch/,
    );
  });

  it('rejects an unknown format string', () => {
    expect(validate({ ...fixture.model, format: 'publish-gbdt-2' }, fixture.featureNames)).toMatch(
      /unsupported format/,
    );
  });

  it('rejects an empty ensemble and a malformed tree', () => {
    expect(validate({ ...fixture.model, trees: [] })).toMatch(/no trees/);
    const broken = [...fixture.model.trees];
    broken[3] = { ...broken[3], threshold: broken[3].threshold.slice(0, -1) };
    expect(validate({ ...fixture.model, trees: broken })).toMatch(/tree 3 has mismatched/);
  });

  it('rejects things that are not models at all', () => {
    expect(validate(null)).toMatch(/not an object/);
    expect(validate(undefined)).toMatch(/not an object/);
    expect(validate('publish-gbdt-1')).toMatch(/not an object/);
    expect(validate({})).toMatch(/unsupported format/);
  });
});

describe('clampScore', () => {
  it('keeps in-range predictions untouched', () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(43.7)).toBe(43.7);
    expect(clampScore(100)).toBe(100);
  });

  it('clamps extrapolation back to the percentile range', () => {
    // The target is a percentile rank. Summed leaves can exceed it; the model
    // cannot support a claim outside 0–100.
    expect(clampScore(-12)).toBe(0);
    expect(clampScore(184)).toBe(100);
  });

  it('returns the midpoint rather than NaN', () => {
    // A NaN would propagate into the UI as "NaN/100"; 50 is at least honest
    // about being uninformative.
    expect(clampScore(NaN)).toBe(50);
    expect(clampScore(Infinity)).toBe(50);
    expect(clampScore(-Infinity)).toBe(50);
  });
});

describe('toVector', () => {
  it('uses the model column order, not the row insertion order', () => {
    const row = { b: 2, a: 1, c: 3 };
    expect(toVector(row, ['a', 'b', 'c'])).toEqual([1, 2, 3]);
    expect(toVector(row, ['c', 'a', 'b'])).toEqual([3, 1, 2]);
  });

  it('substitutes 0 for absent and non-finite values', () => {
    expect(toVector({ a: NaN, c: Infinity }, ['a', 'b', 'c'])).toEqual([0, 0, 0]);
  });
});
