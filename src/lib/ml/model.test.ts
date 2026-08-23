/**
 * The runtime layer: model loading, recommendations, niche benchmarks.
 *
 * `parity.test.ts` proves the TypeScript scorer agrees with Python. This file
 * proves the layer built on top of it behaves — that a missing artefact disables
 * scoring instead of faking it, that advice is ranked by real predicted lift, and
 * that no suggestion can ever be attributed to something a creator cannot change.
 *
 * The model used here is hand-built rather than trained, so every expected lift is
 * arithmetic rather than a number copied out of a previous run. A test whose
 * expectations came from the code it tests proves only that the code is
 * deterministic.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONTEXT_FEATURES, FEATURE_NAMES, extract, type FeatureRow } from './features';
import { validate, type PublishModel, type Tree } from './gbdt';
import { modelAvailable, modelCard, modelState, predict, resetModelCache } from './index';
import {
  LEVERS,
  MAX_SUGGESTIONS,
  durationCoupled,
  recommend,
  type Suggestion,
} from './recommend';
import {
  BENCHMARKED,
  benchmark,
  categoryName,
  cellKey,
  compareToCell,
  formatValue,
  percentileOf,
  resolveCell,
  sizeBucket,
} from './benchmark';

// The real key shape: `labels.py` resolves category 22 to its NAME before building
// the cell key, so a cell is never `22|small|long`.
const CELL = 'People & Blogs|small|long';
const PERCENTILES = [10, 25, 50, 75, 90];

const index = (name: string): number => {
  const i = FEATURE_NAMES.indexOf(name as (typeof FEATURE_NAMES)[number]);
  if (i < 0) throw new Error(`${name} is not a feature`);
  return i;
};

/** A one-split tree: `feature <= threshold` scores `low`, otherwise `high`. */
function stump(feature: string, threshold: number, low: number, high: number): Tree {
  return {
    root: 0,
    feature: [index(feature)],
    threshold: [threshold],
    left: [-1],
    right: [-2],
    leaf: [low, high],
  };
}

/**
 * A model with three deliberately chosen splits.
 *
 * Chapters and captions are CONTROLLABLE, so levers may move them. Subscriber
 * count is CONTEXT and carries the LARGEST leaf in the ensemble — 40 points, twice
 * the biggest controllable effect. That is the trap: a recommender that let a
 * counterfactual touch context would rank a subscriber change first every time.
 */
function testModel(nicheTop: Record<string, number[]> = {}): PublishModel {
  return {
    format: 'publish-gbdt-1',
    objective: 'percentile-rank-within-niche',
    baseScore: 30,
    features: [...FEATURE_NAMES],
    controllable: [],
    context: [...CONTEXT_FEATURES],
    percentiles: [...PERCENTILES],
    trees: [
      stump('desc_timestamps', 2, 0, 20),
      stump('has_captions', 0.5, 0, 8),
      stump('channel_subs_log', 5, 0, 40),
    ],
    nicheStats: {
      [CELL]: {
        n: 400,
        nTop: 40,
        all: {
          title_len: [28, 40, 52, 66, 80],
          title_words: [4, 6, 8, 10, 13],
          title_caps_ratio: [0.05, 0.1, 0.16, 0.25, 0.5],
          title_has_number: [0, 0, 1, 1, 1],
          title_question: [0, 0, 0, 0, 1],
          title_brackets: [0, 0, 1, 2, 2],
          desc_len: [120, 400, 900, 1600, 2600],
          desc_first_line_len: [30, 55, 80, 110, 160],
          desc_timestamps: [0, 0, 3, 7, 12],
          desc_links: [0, 1, 2, 4, 7],
          tag_count: [0, 4, 10, 16, 22],
          duration_seconds: [180, 360, 620, 1100, 1800],
          has_captions: [0, 0, 0, 1, 1],
          thumb_text_area: [0.0, 0.03, 0.08, 0.14, 0.22],
          thumb_face_area: [0.0, 0.0, 0.09, 0.18, 0.3],
          thumb_contrast: [0.4, 0.55, 0.68, 0.8, 0.92],
          thumb_saturation: [0.2, 0.3, 0.42, 0.55, 0.7],
          thumb_third_offset: [0.02, 0.05, 0.1, 0.17, 0.26],
        },
        top: nicheTop,
      },
    },
    card: {
      trainedAt: '2026-08-21T12:00:00Z',
      videos: 4000,
      channels: 200,
      dateRange: ['2024-08-01T00:00:00Z', '2026-07-01T00:00:00Z'],
      form: 'long',
      backend: 'test',
      trees: 3,
      features: FEATURE_NAMES.length,
      spearman: 0.31,
      topDecileAuc: 0.71,
      channelDisjointSpearman: 0.28,
      holdout: 800,
      limitations: ['Hand-built for tests. Not trained on anything.'],
    },
  };
}

/** The top-decile distribution used by most lever tests: 8 chapters, captions on. */
const TOP: Record<string, number[]> = {
  desc_timestamps: [4, 6, 8, 10, 12],
  has_captions: [1, 1, 1, 1, 1],
};

/**
 * A top-decile distribution covering the benchmarked features, for the comparison
 * tests. Deliberately omits `tag_count` - a cell can have a `top` sample for one
 * feature and not another, and the missing case has to be exercised.
 */
const FULL_TOP: Record<string, number[]> = {
  ...TOP,
  title_len: [40, 46, 51, 58, 64],
  desc_len: [800, 1200, 1800, 2400, 3200],
  thumb_face_area: [0.05, 0.1, 0.16, 0.22, 0.3],
};

/** A baseline row: no chapters, no captions, a large channel. */
function baseRow(overrides: FeatureRow = {}): FeatureRow {
  const row: FeatureRow = {};
  for (const name of FEATURE_NAMES) row[name] = 0;
  row.desc_timestamps = 0;
  row.has_captions = 0;
  // Above the context split's threshold, so the 40-point context leaf is ACTIVE.
  // If a lever could move it, turning it off would look like a huge improvement.
  row.channel_subs_log = 11;
  return { ...row, ...overrides };
}

// --- model loading ----------------------------------------------------------

describe('model loading', () => {
  let dir: string;
  const originalPath = process.env.PUBLISH_MODEL_PATH;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'publish-model-'));
    resetModelCache();
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PUBLISH_MODEL_PATH;
    else process.env.PUBLISH_MODEL_PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
    resetModelCache();
  });

  function writeModel(contents: unknown): string {
    const file = path.join(dir, 'publish-model.json');
    writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
    process.env.PUBLISH_MODEL_PATH = file;
    resetModelCache();
    return file;
  }

  it('loads a valid artefact and reports the path it used', () => {
    const file = writeModel(testModel(TOP));
    const state = modelState();
    expect(state.available).toBe(true);
    expect(state.available && state.path).toBe(file);
    expect(modelAvailable()).toBe(true);
  });

  it('reports unavailable — and names the paths it searched — when there is no artefact', () => {
    process.env.PUBLISH_MODEL_PATH = path.join(dir, 'nope.json');
    resetModelCache();
    const state = modelState();
    expect(state.available).toBe(false);
    // The usual cause is a wrong working directory, so the paths tried matter more
    // than the fact of the failure.
    expect(state.available === false && state.reason).toContain('nope.json');
    expect(state.available === false && state.reason).toContain('publishml.export');
  });

  it('refuses a truncated or corrupt file instead of throwing at score time', () => {
    writeModel('{"format": "publish-gbdt-1", "trees": [');
    const state = modelState();
    expect(state.available).toBe(false);
    expect(state.available === false && state.reason).toMatch(/not valid JSON/);
  });

  it('refuses an artefact whose feature list does not match this extractor', () => {
    // The failure this prevents: a model trained before a feature was added loads
    // fine, and every column after the insertion point is read one place off. Every
    // score is then wrong, and nothing anywhere reports an error.
    const stale = testModel(TOP);
    stale.features = stale.features.filter((f) => f !== 'title_emoji');
    writeModel(stale);
    const state = modelState();
    expect(state.available).toBe(false);
    expect(state.available === false && state.reason).toMatch(/feature count mismatch/);
  });

  it('returns null from predict rather than a plausible number when disabled', () => {
    process.env.PUBLISH_MODEL_PATH = path.join(dir, 'absent.json');
    resetModelCache();
    // A fabricated 50 would be indistinguishable from a real 50 downstream.
    expect(predict(baseRow())).toBeNull();
    expect(modelCard()).toBeNull();
  });

  it('scores through the loaded model, clamping to the percentile range', () => {
    writeModel(testModel(TOP));
    // base 30 + chapters 20 + captions 8 + context 40 = 98.
    const good = predict(baseRow({ desc_timestamps: 9, has_captions: 1 }));
    expect(good?.raw).toBeCloseTo(98, 10);
    expect(good?.score).toBeCloseTo(98, 10);

    // base 30 + nothing + context 0 = 30.
    const bare = predict(baseRow({ channel_subs_log: 1 }));
    expect(bare?.raw).toBeCloseTo(30, 10);
  });

  it('surfaces the model card so a score is never shown without its provenance', () => {
    writeModel(testModel(TOP));
    const card = modelCard();
    expect(card?.videos).toBe(4000);
    expect(card?.spearman).toBeCloseTo(0.31, 10);
    expect(card?.limitations.length).toBeGreaterThan(0);
  });

  it('caches, so a scoring request never re-reads the artefact', () => {
    writeModel(testModel(TOP));
    expect(modelAvailable()).toBe(true);
    // Replace the file with rubbish. Without a cache the next call would fail.
    writeFileSync(process.env.PUBLISH_MODEL_PATH!, 'not json', 'utf8');
    expect(modelAvailable()).toBe(true);
    resetModelCache();
    expect(modelAvailable()).toBe(false);
  });

  it('accepts the hand-built test model as structurally valid', () => {
    // Guards the tests themselves: if `testModel` drifts out of spec, every
    // assertion below would be testing a model the app would reject.
    expect(validate(testModel(TOP), FEATURE_NAMES)).toBeNull();
  });
});

// --- recommendations --------------------------------------------------------

describe('recommend', () => {
  const model = testModel(TOP);
  const scoreRow = (row: FeatureRow): number => {
    let total = model.baseScore;
    for (const tree of model.trees) {
      const value = row[FEATURE_NAMES[tree.feature[0]]] ?? 0;
      total += value <= tree.threshold[0] ? tree.leaf[0] : tree.leaf[1];
    }
    return total;
  };

  it('finds both real levers and ranks the larger lift first', () => {
    const suggestions = recommend(scoreRow, baseRow(), TOP);
    expect(suggestions.map((s) => s.key)).toEqual(['desc_timestamps', 'captions']);
    expect(suggestions[0].lift).toBeCloseTo(20, 10);
    expect(suggestions[1].lift).toBeCloseTo(8, 10);
  });

  it('reports the actual before and after values, not just a direction', () => {
    const [chapters] = recommend(scoreRow, baseRow(), TOP);
    expect(chapters.from).toBe(0);
    expect(chapters.to).toBe(8); // p50 of the top-decile chapter counts
    expect(chapters.advice).toContain('8 timestamped chapters');
  });

  it('says nothing when the video already matches the top decile', () => {
    // An empty list is a real answer — "we looked and found nothing worth
    // changing" — and must not be confused with "we could not look".
    const already = baseRow({ desc_timestamps: 9, has_captions: 1 });
    expect(recommend(scoreRow, already, TOP)).toEqual([]);
  });

  it('suppresses every lever when the niche has no top-decile distribution', () => {
    // A thin cell must produce fewer suggestions, never invented targets.
    expect(recommend(scoreRow, baseRow(), {})).toEqual([]);
  });

  it('drops lifts below the threshold', () => {
    // Captions are worth 8; asking for 10 leaves only the 20-point lever.
    const suggestions = recommend(scoreRow, baseRow(), TOP, { minLift: 10 });
    expect(suggestions.map((s) => s.key)).toEqual(['desc_timestamps']);
  });

  it('never proposes a change that reduces the score', () => {
    // A lever whose target moves the row the wrong way must be discarded, not
    // reported with a negative lift.
    const backwards = { desc_timestamps: [0, 0, 0, 0, 0], has_captions: [0, 0, 0, 0, 0] };
    const row = baseRow({ desc_timestamps: 9, has_captions: 1 });
    expect(recommend(scoreRow, row, backwards)).toEqual([]);
  });

  it('honours the suggestion cap', () => {
    const suggestions = recommend(scoreRow, baseRow(), TOP, { maxSuggestions: 1 });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].key).toBe('desc_timestamps');
  });

  describe('context features cannot be touched', () => {
    it('holds every context feature byte-identical in every counterfactual', () => {
      // The core guarantee. `channel_subs_log` carries the biggest leaf in this
      // ensemble, so if any candidate row differed the lift numbers would be
      // dominated by a change the creator cannot make.
      const seen: FeatureRow[] = [];
      const spy = (row: FeatureRow): number => {
        seen.push({ ...row });
        return scoreRow(row);
      };
      const row = baseRow();
      recommend(spy, row, {
        ...TOP,
        // Deliberately offer targets for context features. Nothing should use them.
        channel_subs_log: [1, 1, 1, 1, 1],
        age_days_log: [0, 0, 0, 0, 0],
        made_for_kids: [1, 1, 1, 1, 1],
      });
      expect(seen.length).toBeGreaterThan(1);
      for (const candidate of seen) {
        for (const name of CONTEXT_FEATURES) {
          expect(candidate[name], `${name} drifted in a counterfactual`).toBe(row[name]);
        }
      }
    });

    it('pins a context feature the input row omitted', () => {
      // Proves the re-pin loop actually runs, rather than passing because no
      // applier happens to touch context today.
      const seen: FeatureRow[] = [];
      const row = baseRow();
      delete row.made_for_kids;
      recommend(
        (candidate) => {
          seen.push({ ...candidate });
          return scoreRow(candidate);
        },
        row,
        TOP,
      );
      const counterfactuals = seen.slice(1);
      expect(counterfactuals.length).toBeGreaterThan(0);
      for (const candidate of counterfactuals) {
        expect(candidate.made_for_kids).toBe(0);
      }
    });

    it('declares no lever that touches a context feature', () => {
      const context = new Set<string>(CONTEXT_FEATURES);
      for (const lever of LEVERS) {
        for (const touched of lever.touches) {
          expect(context.has(touched), `${lever.key} touches context ${touched}`).toBe(false);
        }
      }
    });
  });

  describe('lever coherence', () => {
    it('recomputes word count and truncation when it changes title length', () => {
      // A title-length change that left `title_words` alone would ask the model
      // about a 90-character title made of four words.
      const seen: FeatureRow[] = [];
      const row = baseRow({ title_len: 30, title_words: 5, title_avg_word_len: 6 });
      recommend(
        (candidate) => {
          seen.push({ ...candidate });
          return scoreRow(candidate);
        },
        row,
        { title_len: [50, 60, 72, 84, 96] },
      );
      const changed = seen.find((c) => c.title_len === 72);
      expect(changed).toBeDefined();
      // 30 → 72 is 2.4×, so 5 words becomes 12.
      expect(changed!.title_words).toBe(12);
      expect(changed!.title_truncated).toBe(1);
      expect(changed!.title_avg_word_len).toBeCloseTo(72 / 12, 10);
    });

    it('leaves a title-length change alone when it is under four characters', () => {
      const row = baseRow({ title_len: 50, title_words: 8 });
      const suggestions = recommend(scoreRow, row, { title_len: [48, 49, 52, 55, 60] });
      expect(suggestions.some((s) => s.key === 'title_length')).toBe(false);
    });

    it('keeps duration_log and is_shorts consistent with a duration change', () => {
      const coupled = durationCoupled({ duration_seconds: 480, duration_log: 0, is_shorts: 1 });
      expect(coupled.duration_log).toBeCloseTo(Math.log1p(480), 10);
      expect(coupled.is_shorts).toBe(0);

      const short = durationCoupled({ duration_seconds: 45, duration_log: 99, is_shorts: 0 });
      expect(short.duration_log).toBeCloseTo(Math.log1p(45), 10);
      expect(short.is_shorts).toBe(1);
    });

    it('only ever suggests adding or enlarging a face, never shrinking one', () => {
      // The thumbnail features are geometric proxies. "Make the face smaller" is
      // more precision than a skin-tone mask can support.
      const seen: FeatureRow[] = [];
      const row = baseRow({ thumb_face_area: 0.4, thumb_face_count: 2 });
      recommend(
        (candidate) => {
          seen.push({ ...candidate });
          return scoreRow(candidate);
        },
        row,
        { thumb_face_area: [0.0, 0.05, 0.1, 0.2, 0.3] },
      );
      expect(seen.every((c) => (c.thumb_face_area ?? 0) >= 0.4)).toBe(true);
    });

    it('moves thumbnail text area and block count together', () => {
      const seen: FeatureRow[] = [];
      recommend(
        (candidate) => {
          seen.push({ ...candidate });
          return scoreRow(candidate);
        },
        baseRow({ thumb_text_area: 0.01, thumb_text_blocks: 0 }),
        { thumb_text_area: [0.05, 0.08, 0.12, 0.16, 0.2], thumb_text_blocks: [1, 1, 2, 2, 3] },
      );
      const changed = seen.find((c) => c.thumb_text_area === 0.12);
      expect(changed?.thumb_text_blocks).toBe(2);
    });

    it('gives every lever a unique key and a non-empty touch list', () => {
      const keys = LEVERS.map((l) => l.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const lever of LEVERS) {
        expect(lever.touches.length, `${lever.key} touches nothing`).toBeGreaterThan(0);
        expect(lever.label.length).toBeGreaterThan(0);
        expect(lever.advice.length).toBeGreaterThan(0);
      }
    });

    it('substitutes a real number into every advice string that promises one', () => {
      // A leaked `{target}` in production copy is the kind of bug that survives a
      // review because the sentence still reads almost correctly.
      const suggestions = recommend(scoreRow, baseRow(), TOP, { minLift: 0 });
      expect(suggestions.length).toBeGreaterThan(0);
      for (const suggestion of suggestions) {
        expect(suggestion.advice).not.toContain('{target}');
      }
    });
  });

  it('caps at MAX_SUGGESTIONS by default', () => {
    // Every lever offered a target and a fabricated predictor that rewards all of
    // them, to check the default cap actually bites.
    const generous: Record<string, number[]> = {};
    for (const lever of LEVERS) {
      for (const name of lever.touches) generous[name] = [9, 9, 9, 9, 9];
    }
    const counter = (row: FeatureRow): number =>
      Object.values(row).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
    const suggestions: Suggestion[] = recommend(counter, baseRow(), generous);
    expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    // And sorted descending, which is what makes truncation defensible.
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].lift).toBeGreaterThanOrEqual(suggestions[i].lift);
    }
  });
});

// --- niche benchmarks -------------------------------------------------------

describe('percentileOf', () => {
  const stops = [10, 20, 40, 80, 160];

  it('interpolates between stored percentiles', () => {
    // Halfway between p50 (40) and p75 (80) is the 62.5th.
    const at60 = percentileOf(60, stops, PERCENTILES);
    expect(at60?.percentile).toBeCloseTo(62.5, 10);
    expect(at60?.bound).toBe(false);
  });

  it('lands exactly on a stored stop', () => {
    expect(percentileOf(40, stops, PERCENTILES)?.percentile).toBeCloseTo(50, 10);
  });

  it('reports the ends as bounds rather than inventing a number', () => {
    // Only five points are stored; anything past p90 could be the 91st or the 100th
    // and there is no information to tell them apart.
    const high = percentileOf(1000, stops, PERCENTILES);
    expect(high?.percentile).toBe(90);
    expect(high?.bound).toBe(true);
    const low = percentileOf(0, stops, PERCENTILES);
    expect(low?.percentile).toBe(10);
    expect(low?.bound).toBe(true);
  });

  it('survives a flat distribution without dividing by zero', () => {
    // Common for binary features: p10 through p90 are all 1.
    const flat = percentileOf(1, [1, 1, 1, 1, 1], PERCENTILES);
    expect(flat?.percentile).toBe(10);
    expect(Number.isFinite(flat!.percentile)).toBe(true);
  });

  it('refuses mismatched or empty inputs', () => {
    expect(percentileOf(5, [], PERCENTILES)).toBeNull();
    expect(percentileOf(5, [1, 2], PERCENTILES)).toBeNull();
  });
});

describe('formatValue', () => {
  it('renders each format the way a person would say it', () => {
    expect(formatValue(0.164, 'percent')).toBe('16%');
    expect(formatValue(45, 'seconds')).toBe('45s');
    expect(formatValue(620, 'seconds')).toBe('10m 20s');
    expect(formatValue(1800, 'seconds')).toBe('30m');
    expect(formatValue(3900, 'seconds')).toBe('1h 5m');
    expect(formatValue(52.4, 'characters')).toBe('52 characters');
    expect(formatValue(1, 'yesno')).toBe('yes');
    expect(formatValue(0, 'yesno')).toBe('no');
    expect(formatValue(0.6789, 'ratio')).toBe('0.68');
    expect(formatValue(7.5, 'count')).toBe('8');
  });
});

describe('sizeBucket and cellKey', () => {
  it('buckets subscriber counts on the same boundaries as config.py', () => {
    expect(sizeBucket(0)).toBe('nano');
    expect(sizeBucket(999)).toBe('nano');
    expect(sizeBucket(1_000)).toBe('micro');
    expect(sizeBucket(9_999)).toBe('micro');
    expect(sizeBucket(10_000)).toBe('small');
    expect(sizeBucket(100_000)).toBe('mid');
    expect(sizeBucket(1_000_000)).toBe('large');
    expect(sizeBucket(10_000_000)).toBe('mega');
    expect(sizeBucket(500_000_000)).toBe('mega');
  });

  it('treats a hidden subscriber count as nano rather than crashing', () => {
    expect(sizeBucket(NaN)).toBe('nano');
    expect(sizeBucket(-5)).toBe('nano');
  });

  it('builds the same key labels.py writes, with the category NAME', () => {
    // The bug this pins: `labels.py:199` maps the numeric id through
    // `config.CATEGORIES` before building the key. Using the raw id here would make
    // every lookup miss, and a miss shows an empty panel rather than an error.
    expect(cellKey('22', 48_200, false)).toBe('People & Blogs|small|long');
    expect(cellKey('27', 1_500_000, true)).toBe('Education|large|short');
  });

  it('maps category ids to the same names config.CATEGORIES does', () => {
    expect(categoryName('1')).toBe('Film & Animation');
    expect(categoryName('10')).toBe('Music');
    expect(categoryName('20')).toBe('Gaming');
    expect(categoryName('26')).toBe('Howto & Style');
    expect(categoryName('28')).toBe('Science & Technology');
    // Two ids share a name upstream; both must land in the one cell training built.
    expect(categoryName('23')).toBe('Comedy');
    expect(categoryName('34')).toBe('Comedy');
  });

  it('falls back to Other for an unknown id, exactly as Python does', () => {
    // `config.CATEGORIES.get(str(id), "Other")` - so `Other|small|long` is a real
    // cell that real training rows landed in, not a sentinel.
    expect(categoryName('999')).toBe('Other');
    expect(categoryName('')).toBe('Other');
    expect(categoryName(null)).toBe('Other');
    expect(categoryName(undefined)).toBe('Other');
    // Numeric input is accepted because a caller reading from JSON may not stringify.
    expect(categoryName(22)).toBe('People & Blogs');
    expect(cellKey('999', 500, false)).toBe('Other|nano|long');
  });

  it('passes an already-resolved category name through unchanged', () => {
    // A caller holding a name read back from a stored cell key must not be remapped to
    // `Other`, which would silently benchmark them against someone else's niche.
    expect(categoryName('Gaming')).toBe('Gaming');
    expect(categoryName('People & Blogs')).toBe('People & Blogs');
    expect(categoryName('Other')).toBe('Other');
    expect(cellKey('Gaming', 48_200, false)).toBe('Gaming|small|long');
    // Still rejects anything that is neither an id nor a real category name.
    expect(categoryName('Underwater Basket Weaving')).toBe('Other');
  });
});

describe('compareToCell', () => {
  const niche = testModel(FULL_TOP).nicheStats[CELL];

  it('names the gap in a sentence a creator can act on', () => {
    const report = compareToCell(baseRow({ title_len: 82 }), niche, PERCENTILES, CELL);
    const title = report.comparisons.find((c) => c.feature === 'title_len');
    expect(title?.standing).toBe('above');
    expect(title?.topMedian).toBe(51);
    expect(title?.sentence).toContain('82 characters');
    expect(title?.sentence).toContain('51 characters');
    expect(title?.sentence).toContain('over that range');
  });

  it('counts a value inside the top decile band as no gap', () => {
    const report = compareToCell(baseRow({ title_len: 52 }), niche, PERCENTILES, CELL);
    const title = report.comparisons.find((c) => c.feature === 'title_len');
    expect(title?.standing).toBe('inside');
    expect(report.gaps.some((g) => g.feature === 'title_len')).toBe(false);
  });

  it('does not flag exceeding a higher-is-better feature', () => {
    // 5,000 characters of description is past p75 of the winners. That is not a
    // problem to put in front of a creator.
    const report = compareToCell(baseRow({ desc_len: 5000 }), niche, PERCENTILES, CELL);
    const desc = report.comparisons.find((c) => c.feature === 'desc_len');
    expect(desc?.standing).toBe('inside');
    // Being short of it still is.
    const thin = compareToCell(baseRow({ desc_len: 50 }), niche, PERCENTILES, CELL);
    expect(thin.comparisons.find((c) => c.feature === 'desc_len')?.standing).toBe('below');
  });

  it('phrases a yes/no feature as agreement rather than a range', () => {
    const report = compareToCell(baseRow({ has_captions: 0 }), niche, PERCENTILES, CELL);
    const captions = report.comparisons.find((c) => c.feature === 'has_captions');
    expect(captions?.sentence).toContain('no');
    expect(captions?.sentence).toContain('yes');
    expect(captions?.sentence).not.toContain('–');
  });

  it('admits when a feature has no top-decile sample instead of implying one', () => {
    // `tag_count` is in the `all` distribution but not in `top`. The sentence must
    // not claim to compare against winners.
    const report = compareToCell(baseRow({ tag_count: 3 }), niche, PERCENTILES, CELL);
    const tags = report.comparisons.find((c) => c.feature === 'tag_count');
    expect(tags?.topMedian).toBeNull();
    expect(tags?.standing).toBe('unknown');
    expect(tags?.sentence).toContain('too few top-decile videos');
    expect(report.gaps.some((g) => g.feature === 'tag_count')).toBe(false);
  });

  it('marks an out-of-range percentile as a bound, not a measurement', () => {
    const report = compareToCell(baseRow({ desc_len: 999_999 }), niche, PERCENTILES, CELL);
    const desc = report.comparisons.find((c) => c.feature === 'desc_len');
    expect(desc?.percentileIsBound).toBe(true);
    expect(desc?.nichePercentile).toBe(90);
  });

  it('skips features the cell has no distribution for', () => {
    const thin = { n: 40, nTop: 0, all: { title_len: [40, 46, 51, 58, 64] }, top: {} };
    const report = compareToCell(baseRow(), thin, PERCENTILES, CELL);
    expect(report.comparisons.map((c) => c.feature)).toEqual(['title_len']);
  });

  it('carries the sample sizes the comparison rests on', () => {
    const report = compareToCell(baseRow(), niche, PERCENTILES, CELL);
    expect(report.cellSize).toBe(400);
    expect(report.topSize).toBe(40);
  });

  it('benchmarks only features the model actually has', () => {
    const names = new Set<string>(FEATURE_NAMES);
    for (const entry of BENCHMARKED) {
      expect(names.has(entry.feature), `${entry.feature} is not a model feature`).toBe(true);
    }
  });
});

describe('cell resolution against a loaded model', () => {
  let dir: string;
  const originalPath = process.env.PUBLISH_MODEL_PATH;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'publish-cells-'));
    const file = path.join(dir, 'publish-model.json');
    writeFileSync(file, JSON.stringify(testModel(FULL_TOP)), 'utf8');
    process.env.PUBLISH_MODEL_PATH = file;
    resetModelCache();
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PUBLISH_MODEL_PATH;
    else process.env.PUBLISH_MODEL_PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
    resetModelCache();
  });

  it('resolves an exact cell as exact', () => {
    expect(resolveCell('22', 48_200, false)).toEqual({ cell: CELL, exact: true });
  });

  it('substitutes the nearest subscriber bucket and says it is not exact', () => {
    // A nano-sized channel in category 22 has no cell of its own; comparing against
    // the `small` cell is defensible, and the caller needs to know it happened.
    expect(resolveCell('22', 500, false)).toEqual({ cell: CELL, exact: false });
  });

  it('never substitutes across form', () => {
    // A Short and a 20-minute video are not comparable, whatever the subscriber
    // count. Better to show nothing.
    expect(resolveCell('22', 48_200, true)).toBeNull();
  });

  it('returns null for a category the training run never reached', () => {
    expect(resolveCell('43', 48_200, false)).toBeNull(); // 'Shows' has no cell
  });

  it('benchmarks a real extracted row end to end', () => {
    const row = extract(
      {
        title: 'This Title Is Deliberately Far Too Long To Fit In The Search Result Column',
        description: 'one line',
        tags: [],
        duration: 'PT11M',
        publishedAt: '2026-03-04T09:00:00Z',
        caption: false,
      },
      { subscribers: 48_200, videoCount: 200 },
      null,
      new Date('2026-08-21T12:00:00Z'),
    );
    const report = benchmark(row, CELL);
    expect(report).not.toBeNull();
    expect(report!.comparisons.length).toBeGreaterThan(5);
    // The title is 74 characters against a niche median of 52 — this must surface.
    expect(report!.gaps.map((g) => g.feature)).toContain('title_len');
  });

  it('returns null for a cell the model does not have', () => {
    expect(benchmark(baseRow(), 'nonexistent|cell|long')).toBeNull();
  });
});
