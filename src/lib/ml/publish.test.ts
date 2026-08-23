/**
 * The assembly: `publishReport` and the provenance lines that travel with a score.
 *
 * The pieces are tested elsewhere — `parity.test.ts` proves the scorer agrees with
 * Python, `model.test.ts` proves the loader, recommender and benchmarks behave. What
 * is left to prove here is the wiring, and specifically the two ways wiring fails
 * quietly: producing a number when there is no model behind it, and producing advice
 * drawn from a niche that isn't the video's.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONTEXT_FEATURES, FEATURE_NAMES } from './features';
import { resetModelCache } from './index';
import { publishReport, provenanceLines, type PublishReport } from './publish';
import type { ModelCard, PublishModel, Tree } from './gbdt';

const NOW = new Date('2026-08-21T12:00:00Z');
const PERCENTILES = [10, 25, 50, 75, 90];

const featureIndex = (name: string): number => {
  const i = FEATURE_NAMES.indexOf(name as (typeof FEATURE_NAMES)[number]);
  if (i < 0) throw new Error(`${name} is not a feature`);
  return i;
};

function stump(feature: string, threshold: number, low: number, high: number): Tree {
  return {
    root: 0,
    feature: [featureIndex(feature)],
    threshold: [threshold],
    left: [-1],
    right: [-2],
    leaf: [low, high],
  };
}

const CARD: ModelCard = {
  trainedAt: '2026-08-21T12:00:00Z',
  videos: 128_400,
  channels: 3_100,
  dateRange: ['2024-09-01T00:00:00Z', '2026-07-15T00:00:00Z'],
  form: 'long',
  backend: 'lightgbm',
  trees: 2,
  features: FEATURE_NAMES.length,
  spearman: 0.34,
  topDecileAuc: 0.73,
  channelDisjointSpearman: 0.29,
  holdout: 12_800,
  limitations: ['Correlational. Says nothing about causation.'],
};

const TOP: Record<string, number[]> = {
  desc_timestamps: [4, 6, 8, 10, 12],
  has_captions: [1, 1, 1, 1, 1],
  title_len: [40, 46, 51, 58, 64],
};

const ALL: Record<string, number[]> = {
  desc_timestamps: [0, 0, 2, 6, 11],
  has_captions: [0, 0, 0, 1, 1],
  title_len: [28, 40, 52, 66, 80],
  desc_len: [120, 400, 900, 1600, 2600],
};

/**
 * Two long-form cells in category 22 and one Shorts cell in category 27.
 *
 * The `small` cell is complete; `mid` deliberately has no `top` sample, which is the
 * case where a score is defensible and advice is not.
 */
function testModel(): PublishModel {
  return {
    format: 'publish-gbdt-1',
    objective: 'percentile-rank-within-niche',
    baseScore: 40,
    features: [...FEATURE_NAMES],
    controllable: [],
    context: [...CONTEXT_FEATURES],
    percentiles: [...PERCENTILES],
    trees: [stump('desc_timestamps', 2, 0, 18), stump('channel_subs_log', 5, 0, 25)],
    // Keyed by category NAME, not id - `labels.py` resolves the id before building
    // the key, and a test keyed by id would pass against a `cellKey` that never matches
    // a real artefact.
    nicheStats: {
      'People & Blogs|small|long': { n: 900, nTop: 90, all: ALL, top: TOP },
      'People & Blogs|mid|long': { n: 300, nTop: 4, all: ALL, top: {} },
      'Education|small|short': { n: 500, nTop: 50, all: ALL, top: TOP },
    },
    card: CARD,
  };
}

const VIDEO = {
  title: 'How I Fixed The Thing In Under Ten Minutes',
  description: 'A short description with no chapters at all.',
  tags: ['diy', 'repair'],
  duration: 'PT11M4S',
  publishedAt: '2026-03-04T09:00:00Z',
  definition: 'hd',
  caption: false,
};

const CHANNEL = { subscribers: 48_200, videoCount: 210, publishedAt: '2021-05-02T00:00:00Z' };

/** Narrow to the available branch, failing the test rather than silently skipping. */
function scored(report: PublishReport) {
  if (!report.available) throw new Error(`expected a score, got: ${report.reason}`);
  return report;
}

describe('publishReport with no model deployed', () => {
  const originalPath = process.env.PUBLISH_MODEL_PATH;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'publish-none-'));
    process.env.PUBLISH_MODEL_PATH = path.join(dir, 'absent.json');
    resetModelCache();
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PUBLISH_MODEL_PATH;
    else process.env.PUBLISH_MODEL_PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
    resetModelCache();
  });

  it('returns no score at all, and says why', () => {
    // The failure this prevents is the one the product already had: a number
    // presented as "trained on 12.7M videos" with nothing behind it. A fallback
    // heuristic here would be indistinguishable from a real score.
    const report = publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW });
    expect(report.available).toBe(false);
    expect(report.available === false && report.reason.length).toBeGreaterThan(0);
  });

  it('carries no field a caller could mistake for a score', () => {
    const report = publishReport({ video: VIDEO, now: NOW });
    expect(Object.keys(report).sort()).toEqual(['available', 'reason']);
  });

  it('produces no provenance lines', () => {
    expect(provenanceLines(publishReport({ video: VIDEO, now: NOW }))).toEqual([]);
  });
});

describe('publishReport with a model', () => {
  const originalPath = process.env.PUBLISH_MODEL_PATH;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'publish-report-'));
    const file = path.join(dir, 'publish-model.json');
    writeFileSync(file, JSON.stringify(testModel()), 'utf8');
    process.env.PUBLISH_MODEL_PATH = file;
    resetModelCache();
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PUBLISH_MODEL_PATH;
    else process.env.PUBLISH_MODEL_PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
    resetModelCache();
  });

  it('scores, resolves the niche, and advises in one pass', () => {
    const report = scored(
      publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }),
    );
    // base 40 + no chapters 0 + log1p(48200) > 5 → 25 = 65.
    expect(report.raw).toBeCloseTo(65, 10);
    expect(report.score).toBeCloseTo(65, 10);
    expect(report.cell).toBe('People & Blogs|small|long');
    expect(report.cellExact).toBe(true);
    expect(report.suggestions?.map((s) => s.key)).toContain('desc_timestamps');
    expect(report.benchmark?.cell).toBe('People & Blogs|small|long');
    expect(report.features.desc_timestamps).toBe(0);
  });

  it('quotes the advice in the units a creator reads', () => {
    const report = scored(
      publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }),
    );
    const chapters = report.suggestions?.find((s) => s.key === 'desc_timestamps');
    expect(chapters?.from).toBe(0);
    expect(chapters?.to).toBe(8);
    expect(chapters?.lift).toBeCloseTo(18, 10);
    expect(chapters?.advice).toContain('8 timestamped chapters');
  });

  it('scores without a category, and suppresses everything that needs a niche', () => {
    // A draft has no category yet. A score still stands — the trees do not need one —
    // but advice drawn from an arbitrary cell would be advice about someone else's niche.
    const report = scored(publishReport({ video: VIDEO, channel: CHANNEL, now: NOW }));
    expect(report.raw).toBeCloseTo(65, 10);
    expect(report.cell).toBeNull();
    expect(report.cellExact).toBe(false);
    expect(report.suggestions).toBeNull();
    expect(report.benchmark).toBeNull();
    // Null rather than 0: zero would read as "we tried nothing", when the truth is
    // that there was no niche to try against.
    expect(report.suggestionsConsidered).toBeNull();
    expect(report.bestRejectedLift).toBeNull();
  });

  it('gives a score but null advice when the niche has no top-decile sample', () => {
    // `22|mid|long` exists (so the benchmark against the niche average is real) but has
    // only 4 top-decile videos, so there is nothing to aim at. Null, not empty: an empty
    // list would tell the creator their video is already optimal.
    const report = scored(
      publishReport({
        video: VIDEO,
        channel: { ...CHANNEL, subscribers: 400_000 },
        categoryId: '22',
        now: NOW,
      }),
    );
    expect(report.cell).toBe('People & Blogs|mid|long');
    expect(report.suggestions).toBeNull();
    expect(report.benchmark).not.toBeNull();
  });

  it('marks a substituted niche as inexact', () => {
    // 800 subscribers is `nano`; the nearest cell with data is `small`.
    const report = scored(
      publishReport({
        video: VIDEO,
        channel: { ...CHANNEL, subscribers: 800 },
        categoryId: '22',
        now: NOW,
      }),
    );
    expect(report.cell).toBe('People & Blogs|small|long');
    expect(report.cellExact).toBe(false);
    expect(provenanceLines(report)).toContain(
      'Compared against a similar niche — yours has too little data of its own.',
    );
  });

  it('never compares a Short against long-form cells', () => {
    // Category 22 has no Shorts cell. Substituting the long-form one would compare a
    // 40-second video against 11-minute videos and call the result a niche benchmark.
    const report = scored(
      publishReport({
        video: { ...VIDEO, duration: 'PT41S' },
        channel: CHANNEL,
        categoryId: '22',
        now: NOW,
      }),
    );
    expect(report.features.is_shorts).toBe(1);
    expect(report.cell).toBeNull();
    expect(report.benchmark).toBeNull();
  });

  it('routes a Short to the Shorts cell of a category that has one', () => {
    const report = scored(
      publishReport({
        video: { ...VIDEO, duration: 'PT41S' },
        channel: CHANNEL,
        categoryId: '27',
        now: NOW,
      }),
    );
    expect(report.cell).toBe('Education|small|short');
    expect(report.cellExact).toBe(true);
  });

  it('scores a row with nothing in it rather than throwing', () => {
    // No thumbnail, no description, no tags, no publish date, hidden subscriber count.
    // Training rows had the same gaps, zero-filled the same way.
    const report = scored(publishReport({ video: { title: 'x' }, now: NOW }));
    expect(Number.isFinite(report.raw)).toBe(true);
    expect(report.features.has_thumb).toBe(0);
    expect(report.features.desc_lines).toBe(0);
    expect(report.features.publish_dow).toBe(0);
  });

  it('uses thumbnail features when they are supplied', () => {
    const withThumb = scored(
      publishReport({
        video: VIDEO,
        channel: CHANNEL,
        thumb: { thumb_text_area: 0.12, thumb_face_area: 0.2, thumb_contrast: 0.7 },
        now: NOW,
      }),
    );
    expect(withThumb.features.has_thumb).toBe(1);
    expect(withThumb.features.thumb_text_area).toBeCloseTo(0.12, 10);
    // A PARTIAL thumb dict leaves the keys it did not supply ABSENT, matching
    // `features.py`'s `if name in thumb`. `toVector` substitutes 0 for an absent key,
    // so the score is identical either way - but the row must not claim a measured
    // saturation of 0 for an image whose saturation was never measured.
    expect('thumb_saturation' in withThumb.features).toBe(false);
    // The all-absent case is different: no thumbnail at all zero-fills every key,
    // because that is the row shape the trainer saw for videos with no image.
    const noThumb = scored(publishReport({ video: VIDEO, now: NOW }));
    expect(noThumb.features.thumb_saturation).toBe(0);
  });

  it('treats an empty thumb object as no thumbnail', () => {
    // Python's `if thumb:` is false for an empty dict; JavaScript's `if (thumb)` is not.
    const report = scored(publishReport({ video: VIDEO, thumb: {}, now: NOW }));
    expect(report.features.has_thumb).toBe(0);
  });

  it('is deterministic for the same input and clock', () => {
    const a = scored(publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }));
    const b = scored(publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }));
    expect(a.raw).toBe(b.raw);
    expect(a.suggestions).toEqual(b.suggestions);
  });

  describe('provenance', () => {
    it('states the sample size, the window, and what was actually measured', () => {
      const report = publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW });
      const lines = provenanceLines(report).join('\n');
      expect(lines).toContain('128,400 videos');
      expect(lines).toContain('3,100 channels');
      expect(lines).toContain('2024-09');
      expect(lines).toContain('2026-07');
      expect(lines).toContain('0.34');
      // The claim is a rank correlation, because that is what was measured. Not a
      // "68% higher chance of going viral", which was measured by nobody.
      expect(lines).toContain('Rank correlation');
      expect(lines).toContain('channels the model never saw');
      expect(lines).toContain('AUC 0.73');
      expect(lines).not.toMatch(/viral|guarantee|\d+% higher chance/i);
    });

    it('omits a line for every number the card does not have', () => {
      // A card with unmeasured fields must produce fewer sentences, not sentences
      // containing "null" or a zero standing in for a missing measurement.
      const bare = testModel();
      bare.card = {
        ...CARD,
        channels: null,
        dateRange: null,
        spearman: null,
        topDecileAuc: null,
        channelDisjointSpearman: null,
      };
      writeFileSync(process.env.PUBLISH_MODEL_PATH!, JSON.stringify(bare), 'utf8');
      resetModelCache();

      const lines = provenanceLines(
        publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }),
      );
      expect(lines).toEqual(['Trained on 128,400 videos.']);
      expect(lines.join('\n')).not.toMatch(/null|NaN|undefined/);
    });

    it('distinguishes "nothing helps" from "nothing to compare against"', () => {
      // A model with one tiny leaf: the chapters edit is worth 0.4 points, which is
      // real but below MIN_LIFT. Every lever is tried and every one is rejected.
      const weak = testModel();
      weak.trees = [stump('desc_timestamps', 2, 0, 0.4)];
      writeFileSync(process.env.PUBLISH_MODEL_PATH!, JSON.stringify(weak), 'utf8');
      resetModelCache();

      const report = scored(
        publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }),
      );
      // Empty, not null: we looked. The count is what makes the empty list legible.
      expect(report.suggestions).toEqual([]);
      expect(report.suggestionsConsidered).toBeGreaterThan(0);
      expect(report.bestRejectedLift).toBeCloseTo(0.4, 10);
      expect(provenanceLines(report).join('\n')).toContain(
        'none is predicted to move the score by more than 0.4 points',
      );
    });

    it('claims nothing was tried when nothing could be', () => {
      // The cell has a `top` distribution, but its only feature is CONTEXT — no lever
      // is allowed to aim at it. Printing "we tried N changes, none helps" here would
      // report a measurement that was never taken.
      const barren = testModel();
      barren.nicheStats['People & Blogs|small|long'] = {
        n: 900,
        nTop: 90,
        all: ALL,
        top: { has_thumb: [1, 1, 1, 1, 1] },
      };
      writeFileSync(process.env.PUBLISH_MODEL_PATH!, JSON.stringify(barren), 'utf8');
      resetModelCache();

      const report = scored(
        publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '22', now: NOW }),
      );
      expect(report.suggestions).toEqual([]);
      expect(report.suggestionsConsidered).toBe(0);
      expect(report.bestRejectedLift).toBeNull();
      expect(provenanceLines(report).join('\n')).not.toMatch(/Tried \d+ changes/);
    });

    it('says so when the category has no training data', () => {
      const lines = provenanceLines(
        publishReport({ video: VIDEO, channel: CHANNEL, categoryId: '99', now: NOW }),
      );
      expect(lines).toContain('No niche comparison: this category has no training data yet.');
    });
  });
});
