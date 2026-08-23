/**
 * Evaluate an exported gradient-boosted tree ensemble.
 *
 * This is a mirror of `ml/publishml/gbdt.py`. The two are kept honest by
 * `src/lib/ml/gbdt.test.ts`, which scores a fixture exported from Python and
 * asserts agreement to 1e-4. Without that test this file is a guess about a
 * binary format, and a wrong guess here produces confident, plausible, wrong
 * scores rather than an error.
 *
 * WHY A HAND-WRITTEN TREE WALKER
 * A GBDT is a list of `<=` comparisons. Running one in TypeScript needs no
 * native module, no `onnxruntime` binary, no Python sidecar, and no cold start —
 * so a score costs microseconds in a Node route or at the edge. The alternative
 * (a Python inference service) would be the most expensive component of the
 * entire product, to run 30 comparisons.
 */

/** One tree, in the flat parallel-array layout `ml/publishml/export.py` writes. */
export type Tree = {
  /** Child encoding: `>= 0` is an internal node index, `< 0` is leaf `-root - 1`. */
  root: number;
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  leaf: number[];
};

/** Percentile arrays per feature, in the order given by `PublishModel.percentiles`. */
export type NicheDistribution = Record<string, number[]>;

export type NicheCell = {
  n: number;
  nTop: number;
  /** What is normal in this niche. */
  all: NicheDistribution;
  /** What the top-decile videos in this niche look like. Empty when the cell is thin. */
  top: NicheDistribution;
};

export type ModelCard = {
  trainedAt: string;
  videos: number;
  channels: number | null;
  dateRange: [string, string] | null;
  form: string | null;
  backend: string;
  trees: number;
  features: number;
  spearman: number | null;
  topDecileAuc: number | null;
  channelDisjointSpearman: number | null;
  holdout: number | null;
  limitations: string[];
};

export type PublishModel = {
  format: string;
  objective: string;
  /** Intercept. LightGBM folds it into tree 1 and leaves this 0; sklearn does not. */
  baseScore: number;
  /** Column order. Anything that builds a feature vector MUST use this. */
  features: string[];
  controllable: string[];
  context: string[];
  percentiles: number[];
  trees: Tree[];
  nicheStats: Record<string, NicheCell>;
  card: ModelCard;
};

/** The format string this file knows how to read. */
export const SUPPORTED_FORMAT = 'publish-gbdt-1';

/**
 * Sum every tree's leaf for one feature vector.
 *
 * `row` must already be in `model.features` order — use `scoreNamed` if you have
 * a keyed object, rather than assuming an object's insertion order matches.
 */
export function score(model: PublishModel, row: readonly number[]): number {
  let total = model.baseScore ?? 0;
  for (const tree of model.trees) {
    const { feature, threshold, left, right } = tree;
    let node = tree.root;
    // A single-leaf stump has a negative root and no internal nodes. LightGBM
    // emits these once splitting stops paying, so this loop must tolerate zero
    // iterations.
    while (node >= 0) {
      node = row[feature[node]] <= threshold[node] ? left[node] : right[node];
    }
    total += tree.leaf[-node - 1];
  }
  return total;
}

/** Same, from a named feature map. Missing features are 0, matching the trainer. */
export function scoreNamed(model: PublishModel, row: Readonly<Record<string, number>>): number {
  const vector = new Array<number>(model.features.length);
  for (let i = 0; i < model.features.length; i++) {
    const value = row[model.features[i]];
    vector[i] = Number.isFinite(value) ? value : 0;
  }
  return score(model, vector);
}

/**
 * Validate a parsed model before anything trusts it.
 *
 * Returns the reason it is unusable, or null. Called at load time so a bad or
 * stale artefact disables the feature loudly instead of scoring against shifted
 * columns — which looks exactly like a working model and is unfalsifiable from
 * the outside.
 */
export function validate(model: unknown, expectedFeatures?: readonly string[]): string | null {
  if (!model || typeof model !== 'object') return 'not an object';
  const m = model as Partial<PublishModel>;
  if (m.format !== SUPPORTED_FORMAT) return `unsupported format ${String(m.format)}`;
  if (!Array.isArray(m.features) || m.features.length === 0) return 'no feature list';
  if (!Array.isArray(m.trees) || m.trees.length === 0) return 'no trees';
  for (let i = 0; i < m.trees.length; i++) {
    const t = m.trees[i];
    if (
      !t ||
      !Array.isArray(t.feature) ||
      !Array.isArray(t.threshold) ||
      !Array.isArray(t.left) ||
      !Array.isArray(t.right) ||
      !Array.isArray(t.leaf) ||
      typeof t.root !== 'number'
    ) {
      return `tree ${i} is malformed`;
    }
    if (t.feature.length !== t.threshold.length || t.feature.length !== t.left.length) {
      return `tree ${i} has mismatched node arrays`;
    }
  }
  if (expectedFeatures) {
    // Order matters, not just membership: the vector is positional.
    if (expectedFeatures.length !== m.features.length) {
      return `feature count mismatch: model has ${m.features.length}, extractor produces ${expectedFeatures.length}`;
    }
    for (let i = 0; i < expectedFeatures.length; i++) {
      if (expectedFeatures[i] !== m.features[i]) {
        return `feature ${i} mismatch: model says "${m.features[i]}", extractor says "${expectedFeatures[i]}"`;
      }
    }
  }
  return null;
}

/**
 * Clamp a raw prediction into the 0–100 the model was trained to output.
 *
 * The target is a percentile rank, so anything outside 0–100 is extrapolation
 * from summed leaf values rather than a claim the model can support.
 */
export function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, raw));
}
