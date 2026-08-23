/**
 * Turn a score into advice, by asking the model counterfactual questions.
 *
 * Mirror of `ml/publishml/recommend.py`. The reasoning lives there in full; the
 * short version, because it governs every line below:
 *
 * A per-feature sweep — nudge each column, keep the ones that helped — produces
 * confident nonsense, for three reasons.
 *
 *   1. FEATURES MOVE TOGETHER. `title_len` cannot change without `title_words`,
 *      `title_avg_word_len`, and possibly `title_truncated` changing. Nudging one
 *      alone asks the model about a title that cannot exist, and it answers.
 *   2. SOME FEATURES ARE NOT CHOICES. Subscriber count and video age predict views
 *      superbly, so a naive sweep advises "have more subscribers".
 *   3. EXTRAPOLATION IS FREE. Trees are flat outside their training range, so
 *      pushing `title_exclaim` to 40 lands in a leaf built from three rows.
 *
 * So advice is generated at the level of a LEVER: a named edit a creator could
 * actually make, moving a coherent group of features to a target drawn from the
 * videos that ALREADY reached the top decile of the same niche cell. No lever can
 * propose a value nobody in that niche has achieved, and no lever can touch a
 * CONTEXT feature — those are re-pinned to the original row before the model is
 * asked, so the reported lift is only ever attributable to the edit itself.
 */

import { CONTEXT_FEATURES, SHORTS_MAX_SECONDS, type FeatureRow } from './features';
import { scoreNamed } from './gbdt';
import { modelState, type NicheDistribution } from './index';

/**
 * Minimum predicted change, in percentile points, worth saying out loud.
 *
 * Below roughly this the difference sits inside the model's own noise, and twelve
 * suggestions worth 0.3 points each are worse than three worth 6 — they cost the
 * creator the same reading time and carry no information.
 */
export const MIN_LIFT = 1.5;

/** Past this the creator stops reading, and the tail is always the weakest advice. */
export const MAX_SUGGESTIONS = 6;

/** Index into `PublishModel.percentiles` (`[10, 25, 50, 75, 90]`) meaning p50. */
const P50 = 2;

export type Suggestion = {
  key: string;
  label: string;
  /** Predicted change in the 0–100 niche percentile. The model's opinion, not a promise. */
  lift: number;
  from: number;
  to: number;
  advice: string;
  /** Every feature this edit moves — so a UI can show what it actually changed. */
  touches: string[];
};

type Applier = (row: FeatureRow, niche: NicheDistribution) => FeatureRow | null;

type Lever = {
  key: string;
  label: string;
  touches: string[];
  apply: Applier;
  /** `{target}` is substituted with the new value of `touches[0]`. */
  advice: string;
  /** How to render `{target}`: a rounded count, or a percentage of the frame. */
  format: 'count' | 'percent';
};

/**
 * The value to move a feature toward: a percentile of the videos that succeeded.
 *
 * `null` when the niche has no distribution for this feature — a cell too thin to
 * have a top-decile sample. That suppresses the lever entirely rather than falling
 * back to a guess, which is why a creator in an unusual niche gets fewer
 * suggestions rather than worse ones.
 */
function target(
  niche: NicheDistribution,
  name: string,
  current: number,
  index: number = P50,
): number | null {
  const stats = niche[name];
  if (!stats || index >= stats.length) return null;
  const value = stats[index];
  if (!Number.isFinite(value)) return null;
  return Math.abs(value - current) < 1e-9 ? null : value;
}

/** Move title length toward the successful median, keeping the rest coherent. */
function retitleLength(row: FeatureRow, niche: NicheDistribution): FeatureRow | null {
  const current = row.title_len ?? 0;
  const goal = target(niche, 'title_len', current);
  // Under four characters is not a rewrite anyone would make, and the model
  // cannot resolve a difference that small anyway.
  if (goal === null || Math.abs(goal - current) < 4) return null;

  const out: FeatureRow = { ...row };
  out.title_len = goal;
  if (current > 0) {
    // Word count scales with length at the title's own current words-per-character
    // rate, so the counterfactual describes a title that could exist.
    const ratio = goal / current;
    out.title_words = Math.max(1, Math.round((row.title_words ?? 1) * ratio));
  }
  out.title_truncated = goal > 60 ? 1 : 0;
  out.title_avg_word_len = goal / Math.max(1, out.title_words);
  return out;
}

/** A lever that moves exactly one feature — only for the genuinely independent ones. */
function simple(name: string, minDelta = 0, index: number = P50): Applier {
  return (row, niche) => {
    const current = row[name] ?? 0;
    const goal = target(niche, name, current, index);
    if (goal === null || Math.abs(goal - current) <= minDelta) return null;
    return { ...row, [name]: goal };
  };
}

/** Text overlay: area and block count are one design decision, not two. */
function thumbText(row: FeatureRow, niche: NicheDistribution): FeatureRow | null {
  const current = row.thumb_text_area ?? 0;
  const goal = target(niche, 'thumb_text_area', current);
  if (goal === null || Math.abs(goal - current) < 0.01) return null;
  const out: FeatureRow = { ...row, thumb_text_area: goal };
  const blocks = target(niche, 'thumb_text_blocks', row.thumb_text_blocks ?? 0);
  if (blocks !== null) out.thumb_text_blocks = blocks;
  return out;
}

/** A face is present or it is not; area and count cannot disagree. */
function thumbFace(row: FeatureRow, niche: NicheDistribution): FeatureRow | null {
  const currentArea = row.thumb_face_area ?? 0;
  const goal = target(niche, 'thumb_face_area', currentArea);
  // Only ever suggests adding or enlarging a face. "Make the face smaller" is
  // advice the geometric features are far too crude to support.
  if (goal === null || goal <= currentArea + 0.01) return null;
  return {
    ...row,
    thumb_face_area: goal,
    thumb_face_count: Math.max(1, row.thumb_face_count ?? 0),
  };
}

/** Contrast, brightness, saturation and colourfulness are one grading decision. */
function thumbGrade(row: FeatureRow, niche: NicheDistribution): FeatureRow | null {
  const out: FeatureRow = { ...row };
  let moved = false;
  for (const name of [
    'thumb_contrast',
    'thumb_brightness',
    'thumb_saturation',
    'thumb_colorfulness',
  ]) {
    const goal = target(niche, name, row[name] ?? 0);
    if (goal !== null) {
      out[name] = goal;
      moved = true;
    }
  }
  return moved ? out : null;
}

/**
 * Every lever, in declaration order. Ranking is by predicted lift, so this order
 * only decides ties.
 */
export const LEVERS: readonly Lever[] = [
  {
    key: 'title_length',
    label: 'Title length',
    touches: ['title_len', 'title_words', 'title_avg_word_len', 'title_truncated'],
    apply: retitleLength,
    advice:
      'Rewrite the title to about {target} characters — the median length among videos that reached the top 10% of your niche.',
    format: 'count',
  },
  {
    key: 'title_number',
    label: 'Number in the title',
    touches: ['title_has_number'],
    apply: simple('title_has_number', 0.4),
    advice: 'Put a concrete number in the title — a count, a price, a year, a result.',
    format: 'count',
  },
  {
    key: 'title_question',
    label: 'Question framing',
    touches: ['title_question'],
    apply: simple('title_question', 0.4),
    advice: 'Frame the title as a question the viewer wants answered.',
    format: 'count',
  },
  {
    key: 'title_second_person',
    label: 'Speak to the viewer',
    touches: ['title_second_person'],
    apply: simple('title_second_person', 0.4),
    advice: "Address the viewer directly — 'you' or 'your' in the title.",
    format: 'count',
  },
  {
    key: 'title_curiosity',
    label: 'Open a gap',
    touches: ['title_curiosity'],
    apply: simple('title_curiosity', 0.4),
    advice: 'Add a curiosity gap: what, why, or what happened — without answering it.',
    format: 'count',
  },
  {
    key: 'title_caps',
    label: 'Capitalisation',
    touches: ['title_caps_ratio'],
    apply: simple('title_caps_ratio', 0.05),
    advice:
      'Adjust capitalisation toward {target} of letters — shouting reads as spam in this niche, and all-lowercase reads as unfinished.',
    format: 'percent',
  },
  {
    key: 'title_brackets',
    label: 'Bracketed qualifier',
    touches: ['title_brackets'],
    apply: simple('title_brackets', 0.4),
    advice:
      'Add a bracketed qualifier — [2026], (full guide), (no code) — to carry detail without lengthening the main clause.',
    format: 'count',
  },
  {
    key: 'desc_first_line',
    label: 'First description line',
    touches: ['desc_first_line_len'],
    apply: simple('desc_first_line_len', 15),
    advice:
      "Rewrite the first line of the description to about {target} characters. It is the only part shown before 'Show more'.",
    format: 'count',
  },
  {
    key: 'desc_timestamps',
    label: 'Chapters',
    touches: ['desc_timestamps'],
    apply: simple('desc_timestamps', 1),
    advice:
      'Add {target} timestamped chapters. They change the surface YouTube renders and give the viewer a reason to believe the video is organised.',
    format: 'count',
  },
  {
    key: 'desc_length',
    label: 'Description depth',
    touches: ['desc_len'],
    apply: simple('desc_len', 150),
    advice:
      'Expand the description toward {target} characters — it is what search indexes, and what the top performers in your niche write.',
    format: 'count',
  },
  {
    key: 'tags',
    label: 'Tags',
    touches: ['tag_count'],
    apply: simple('tag_count', 2),
    advice: 'Use about {target} tags.',
    format: 'count',
  },
  {
    key: 'duration',
    label: 'Length',
    touches: ['duration_seconds', 'duration_log', 'is_shorts'],
    apply: simple('duration_seconds', 60),
    advice: 'Videos in the top decile of your niche run about {target} seconds.',
    format: 'count',
  },
  {
    key: 'captions',
    label: 'Captions',
    touches: ['has_captions'],
    apply: simple('has_captions', 0.4),
    advice:
      'Upload a caption track. It is indexed, and it is the single cheapest thing on this list.',
    format: 'count',
  },
  {
    key: 'thumb_text',
    label: 'Thumbnail text',
    touches: ['thumb_text_area', 'thumb_text_blocks'],
    apply: thumbText,
    advice:
      'Change how much of the thumbnail is text — the successful ones in your niche sit near {target} of the frame.',
    format: 'percent',
  },
  {
    key: 'thumb_face',
    label: 'Face in the thumbnail',
    touches: ['thumb_face_area', 'thumb_face_count'],
    apply: thumbFace,
    advice: 'Put a face in the thumbnail at around {target} of the frame.',
    format: 'percent',
  },
  {
    key: 'thumb_grade',
    label: 'Thumbnail contrast and colour',
    touches: ['thumb_contrast', 'thumb_brightness', 'thumb_saturation', 'thumb_colorfulness'],
    apply: thumbGrade,
    advice:
      'Push contrast and saturation toward what works in your niche — the thumbnail competes at 168px wide on a phone.',
    format: 'percent',
  },
  {
    key: 'thumb_composition',
    label: 'Thumbnail composition',
    touches: ['thumb_third_offset'],
    apply: simple('thumb_third_offset', 0.05),
    advice: 'Move the subject off dead centre, toward a rule-of-thirds intersection.',
    format: 'count',
  },
];

/**
 * Keep `duration_log` and `is_shorts` consistent after a duration change.
 *
 * Without this a "make it 8 minutes" counterfactual leaves `is_shorts = 1` and a
 * `duration_log` from the old value, and the model is asked about an eight-minute
 * Short — a thing that does not exist and whose leaves are therefore arbitrary.
 */
export function durationCoupled(row: FeatureRow): FeatureRow {
  const seconds = row.duration_seconds ?? 0;
  return {
    ...row,
    duration_log: Math.log1p(Math.max(0, seconds)),
    is_shorts: seconds > 0 && seconds <= SHORTS_MAX_SECONDS ? 1 : 0,
  };
}

/** Substitute `{target}` in a lever's advice string. */
function fillAdvice(advice: string, value: number, format: Lever['format']): string {
  const rendered =
    format === 'percent' ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
  return advice.replace('{target}', rendered);
}

export type RecommendOptions = {
  maxSuggestions?: number;
  minLift?: number;
};

/**
 * Rank the levers by the model's predicted lift, largest first.
 *
 * `predict` is injected rather than imported so this function can be tested
 * against a known scoring function, and so the same code serves the exported
 * model, a fixture, and anything else that can score a row.
 */
export function recommend(
  predict: (row: FeatureRow) => number,
  row: FeatureRow,
  nicheTop: NicheDistribution,
  options: RecommendOptions = {},
): Suggestion[] {
  const maxSuggestions = options.maxSuggestions ?? MAX_SUGGESTIONS;
  const minLift = options.minLift ?? MIN_LIFT;
  const base = predict(row);
  const out: Suggestion[] = [];

  for (const lever of LEVERS) {
    let changed = lever.apply(row, nicheTop);
    if (changed === null) continue;
    if (lever.touches.includes('duration_seconds')) changed = durationCoupled(changed);

    // Re-pin every context feature to the original value. An applier has no reason
    // to touch one, but the guarantee has to hold by construction rather than by
    // review — otherwise a future lever could quietly start reporting the lift from
    // a subscriber count the creator cannot change.
    for (const name of CONTEXT_FEATURES) changed[name] = row[name] ?? 0;

    const lift = predict(changed) - base;
    if (lift < minLift) continue;

    const primary = lever.touches[0];
    const to = changed[primary] ?? 0;
    out.push({
      key: lever.key,
      label: lever.label,
      lift: Math.round(lift * 100) / 100,
      from: Math.round((row[primary] ?? 0) * 10_000) / 10_000,
      to: Math.round(to * 10_000) / 10_000,
      advice: fillAdvice(lever.advice, to, lever.format),
      touches: lever.touches,
    });
  }

  out.sort((a, b) => b.lift - a.lift);
  return out.slice(0, maxSuggestions);
}

export type NicheAdvice = {
  suggestions: Suggestion[];
  /** The cell the advice was drawn from, and how many videos stood behind it. */
  cell: string;
  cellSize: number;
  topSize: number;
  /**
   * How many levers had a target in this niche and produced a coherent edit.
   *
   * Zero and non-zero mean completely different things when `suggestions` is empty:
   * zero is "this niche has no distribution to aim at", non-zero is "we tried N edits
   * and the model would not back any of them".
   */
  considered: number;
  /**
   * The largest lift that fell below the threshold, or null if none did.
   *
   * Carried so a caller can say "no single change is predicted to move the score by
   * more than 0.6 points" instead of rendering an unexplained blank. Suppressing the
   * weak advice is right; suppressing the fact that it was weak is not.
   */
  bestRejectedLift: number | null;
};

/**
 * Advice for a row in a named niche cell, using the loaded model.
 *
 * `null` — not an empty list — when there is no model, no such cell, or the cell
 * has no top-decile distribution. An empty list means "we looked and found nothing
 * worth changing", which is a completely different message to show a creator.
 */
export function adviseInNiche(
  row: FeatureRow,
  cell: string,
  options: RecommendOptions = {},
): NicheAdvice | null {
  const state = modelState();
  if (!state.available) return null;
  const niche = state.model.nicheStats[cell];
  if (!niche) return null;
  // `top` is empty for cells with fewer than ten top-decile videos. Falling back to
  // `all` would mean advising the creator toward the niche's average video, which
  // is the opposite of the point.
  const distribution = niche.top && Object.keys(niche.top).length > 0 ? niche.top : null;
  if (!distribution) return null;

  // Raw ensemble output, deliberately NOT clamped to 0-100. A lift is a
  // difference between two predictions, and clamping both ends would silently
  // report 0 for a real improvement on a row already predicted near 100.
  const model = state.model;
  const predict = (candidate: FeatureRow): number => scoreNamed(model, candidate);

  // One pass over every lever, unfiltered, then split. Running `recommend` twice with
  // different thresholds would double the tree walks for no reason, and filtering here
  // is what makes `considered` and `bestRejectedLift` free.
  const everything = recommend(predict, row, distribution, {
    minLift: -Infinity,
    maxSuggestions: Number.MAX_SAFE_INTEGER,
  });
  const minLift = options.minLift ?? MIN_LIFT;
  const maxSuggestions = options.maxSuggestions ?? MAX_SUGGESTIONS;
  const rejected = everything.filter((s) => s.lift < minLift);

  return {
    suggestions: everything.filter((s) => s.lift >= minLift).slice(0, maxSuggestions),
    cell,
    cellSize: niche.n,
    topSize: niche.nTop,
    considered: everything.length,
    // `everything` is already sorted by lift descending, so the first rejection is the
    // best one.
    bestRejectedLift: rejected.length > 0 ? rejected[0].lift : null,
  };
}
