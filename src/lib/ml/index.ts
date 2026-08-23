/**
 * Load the trained Publish model, or run without one.
 *
 * THE DEFAULT STATE OF THIS MODULE IS "NO MODEL".
 * `publish-model.json` is produced by `python -m publishml.export` from data
 * collected with a YouTube API key. A fresh checkout has neither, and every
 * deployment before the first training run has neither. So the honest design is
 * not "load the model" but "report whether there is one" — and every caller has to
 * handle the absent case, because the absent case is normal.
 *
 * WHY NOT `import model from './publish-model.json'`
 * A static import of a file that legitimately may not exist turns a missing
 * artefact into a build failure. It also inlines several hundred KB into every
 * bundle that touches this module. A lazy `readFileSync` behind a cached result
 * costs one stat on first use and nothing after.
 *
 * WHAT COUNTS AS "HAVING A MODEL"
 * Not the file existing. The file must parse, declare a format this code knows,
 * carry a non-empty ensemble, AND list exactly the 64 features in exactly the order
 * `features.ts` produces. A model that fails any of those is treated as absent and
 * the reason is logged once — because the alternative, scoring a video against
 * columns that have shifted by one, produces confident numbers that are wrong and
 * gives no symptom anyone could trace.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { FEATURE_NAMES } from './features';
import { clampScore, score, scoreNamed, validate, type ModelCard, type PublishModel } from './gbdt';

/** Where the artefact lives, relative to the repo root. */
const DEFAULT_MODEL_PATH = path.join('src', 'lib', 'ml', 'publish-model.json');

export type ModelState =
  | { available: true; model: PublishModel; path: string }
  | { available: false; reason: string; path: string | null };

let cached: ModelState | null = null;

/**
 * Candidate paths, most explicit first.
 *
 * `PUBLISH_MODEL_PATH` exists so a deploy can mount the artefact outside the repo
 * — it is regenerated data, not source, and a 500 KB JSON blob in git history is
 * a cost that compounds every time the model is retrained.
 */
function candidatePaths(): string[] {
  const paths: string[] = [];
  const override = process.env.PUBLISH_MODEL_PATH?.trim();
  if (override) paths.push(path.isAbsolute(override) ? override : path.resolve(override));
  paths.push(path.resolve(process.cwd(), DEFAULT_MODEL_PATH));
  return paths;
}

function load(): ModelState {
  const candidates = candidatePaths();
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    return {
      available: false,
      // Naming the paths searched is the difference between a five-minute fix and
      // an afternoon: the usual cause is a working directory, not a missing file.
      reason: `no model artefact at ${candidates.join(' or ')}. Run \`python -m publishml.export\` and copy the result there, or set PUBLISH_MODEL_PATH.`,
      path: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(found, 'utf8'));
  } catch (error) {
    return {
      available: false,
      reason: `model at ${found} is not valid JSON: ${(error as Error).message}`,
      path: found,
    };
  }

  const problem = validate(parsed, FEATURE_NAMES);
  if (problem) return { available: false, reason: `model at ${found} rejected: ${problem}`, path: found };

  return { available: true, model: parsed as PublishModel, path: found };
}

/**
 * The model, or the reason there isn't one. Cached for the process lifetime.
 *
 * Cached rather than re-read because the artefact only changes on deploy, and a
 * per-request `readFileSync` of a few hundred KB would be the slowest thing in a
 * scoring request by two orders of magnitude.
 */
export function modelState(): ModelState {
  if (!cached) {
    cached = load();
    if (!cached.available) {
      // Logged once, at warn level. Silence here would mean the scoring feature
      // is off in production and nothing anywhere says why.
      console.warn(`[publish-model] scoring disabled: ${cached.reason}`);
    }
  }
  return cached;
}

/** Drop the cache. For tests, and for a reload after replacing the artefact. */
export function resetModelCache(): void {
  cached = null;
}

export function modelAvailable(): boolean {
  return modelState().available;
}

/**
 * The provenance the UI must show alongside any score.
 *
 * Returned rather than kept private because a score with no stated sample size,
 * date range, or measured correlation is the thing this whole subsystem was built
 * to replace. The card carries the real numbers; whatever renders a score is
 * expected to render these too.
 */
export function modelCard(): ModelCard | null {
  const state = modelState();
  return state.available ? state.model.card : null;
}

export type PublishPrediction = {
  /** 0–100 percentile rank within the video's own niche. */
  score: number;
  /** The raw ensemble output before clamping — useful when a score pins at 0 or 100. */
  raw: number;
  card: ModelCard;
};

/**
 * Score one feature row. `null` when there is no usable model.
 *
 * Returning `null` rather than a fallback number is deliberate: a made-up 50 is
 * indistinguishable from a real 50, and a caller that forgets to check would
 * publish a number the model never produced.
 */
export function predict(row: Readonly<Record<string, number>>): PublishPrediction | null {
  const state = modelState();
  if (!state.available) return null;
  const raw = scoreNamed(state.model, row);
  return { score: clampScore(raw), raw, card: state.model.card };
}

/** Same, from a vector already in the model's column order. */
export function predictVector(vector: readonly number[]): PublishPrediction | null {
  const state = modelState();
  if (!state.available) return null;
  const raw = score(state.model, vector);
  return { score: clampScore(raw), raw, card: state.model.card };
}

export {
  clampScore,
  score,
  scoreNamed,
  validate,
  SUPPORTED_FORMAT,
  type ModelCard,
  type NicheCell,
  type NicheDistribution,
  type PublishModel,
  type Tree,
} from './gbdt';

export {
  extract,
  toVector,
  durationSeconds,
  titleFeatures,
  descriptionFeatures,
  tagFeatures,
  FEATURE_NAMES,
  CONTEXT_FEATURES,
  CONTROLLABLE_FEATURES,
  THUMB_FEATURE_NAMES,
  SHORTS_MAX_SECONDS,
  type ChannelInput,
  type FeatureRow,
  type ThumbFeatures,
  type VideoInput,
} from './features';
