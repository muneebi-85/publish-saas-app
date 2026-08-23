/**
 * The one function the app calls to get a Publish Score.
 *
 * Everything else in this directory is a piece: `features.ts` turns metadata into
 * numbers, `gbdt.ts` walks the trees, `recommend.ts` asks counterfactual questions,
 * `benchmark.ts` compares against the niche. This file is the assembly, and it
 * exists so that no route or component has to know the order of those steps or which
 * of them are allowed to fail.
 *
 * WHAT `available: false` MEANS AND WHY IT IS A FIRST-CLASS RESULT
 * There is no model until someone runs the training pipeline with a YouTube API key.
 * Until then this returns `{ available: false, reason }` — never a number. That is
 * the entire reason this subsystem was built: the product previously claimed a score
 * "trained on over 12.7M high-performing videos" with nothing behind it. A fallback
 * heuristic wearing the same label would recreate exactly that problem, so the
 * disabled path returns no score at all and says why.
 *
 * WHY THE CALLER IS HANDED A CARD IT DID NOT ASK FOR
 * A percentile with no sample size, no date range, and no measured correlation is
 * not a measurement, it is a vibe with a number on it. `card` travels with every
 * score so whatever renders one can render its provenance beside it.
 */

import { extract, type ChannelInput, type FeatureRow, type ThumbFeatures, type VideoInput } from './features';
import { clampScore, scoreNamed, type ModelCard } from './gbdt';
import { modelState } from './index';
import { adviseInNiche, type Suggestion } from './recommend';
import { benchmark, resolveCell, type BenchmarkReport } from './benchmark';

export type PublishInput = {
  video: VideoInput;
  channel?: ChannelInput;
  /** Output of `thumbs.py` for this thumbnail. Omit when it was not analysed. */
  thumb?: ThumbFeatures | null;
  /** YouTube category id as a string, e.g. `'22'`. Decides which niche to compare against. */
  categoryId?: string;
  /** Fixed clock, for tests and for reproducible scores. */
  now?: Date;
};

export type PublishReport =
  | {
      available: false;
      /** Why there is no score. Safe to log; not written for end users. */
      reason: string;
    }
  | {
      available: true;
      /** 0–100 percentile rank within this video's own niche. */
      score: number;
      /** Unclamped ensemble output. Differs from `score` only at the extremes. */
      raw: number;
      card: ModelCard;
      /** The niche cell used, or null when this video's niche has no training data. */
      cell: string | null;
      /**
       * False when `cell` is a neighbouring subscriber bucket rather than this
       * channel's own. The UI must say so — "compared against a similar niche" is a
       * weaker claim than "compared against yours", and the difference is real.
       */
      cellExact: boolean;
      /**
       * Ranked edits, largest predicted gain first. Empty means "we looked and found
       * nothing worth changing". Null means we could not look — no niche data.
       */
      suggestions: Suggestion[] | null;
      /**
       * How many edits were tried before the threshold filtered them, and the best
       * lift that did not clear it.
       *
       * An empty `suggestions` list has two very different causes, and a UI that
       * cannot tell them apart shows a blank panel for both. `considered: 0` means
       * this niche had nothing to aim at; `considered: 14` with a
       * `bestRejectedLift` of 0.6 means fourteen edits were tried and the model
       * would not back any of them by more than 0.6 points. The second is a real
       * finding about the video - it is close enough to the top decile that no
       * single change moves it - and saying so is better than saying nothing.
       */
      suggestionsConsidered: number | null;
      bestRejectedLift: number | null;
      /** Feature-by-feature comparison against the niche. Null for the same reason. */
      benchmark: BenchmarkReport | null;
      /** The extracted row, so a caller can cache or diff it. */
      features: FeatureRow;
    };

/**
 * Score one video, and say how to improve it.
 *
 * Never throws for missing data. A video with no thumbnail, no description, no
 * category and a hidden subscriber count still produces a report — with fewer parts
 * filled in. That is the point: the training rows had the same gaps, zero-filled the
 * same way, so a sparse row lands in the leaves the trainer built for sparse rows.
 */
export function publishReport(input: PublishInput): PublishReport {
  const state = modelState();
  if (!state.available) return { available: false, reason: state.reason };

  const features = extract(input.video, input.channel ?? {}, input.thumb ?? null, input.now);
  const raw = scoreNamed(state.model, features);

  // Category is optional because it is not always known at score time (a draft
  // upload has no category yet). Without it there is no niche, so the score stands
  // alone and the advice is suppressed rather than drawn from an arbitrary cell.
  const resolved = input.categoryId
    ? resolveCell(input.categoryId, input.channel?.subscribers ?? 0, features.is_shorts === 1)
    : null;

  const advice = resolved ? adviseInNiche(features, resolved.cell) : null;

  return {
    available: true,
    score: clampScore(raw),
    raw,
    card: state.model.card,
    cell: resolved?.cell ?? null,
    cellExact: resolved?.exact ?? false,
    suggestions: advice ? advice.suggestions : null,
    suggestionsConsidered: advice ? advice.considered : null,
    bestRejectedLift: advice ? advice.bestRejectedLift : null,
    benchmark: resolved ? benchmark(features, resolved.cell) : null,
    features,
  };
}

/**
 * The lines a UI can print above a score without inventing anything.
 *
 * Built here rather than in a component so the wording of the caveats lives next to
 * the code that knows whether they apply. Every sentence is conditional on a fact
 * the report actually carries.
 */
export function provenanceLines(report: PublishReport): string[] {
  if (!report.available) return [];
  const { card } = report;
  const lines: string[] = [];

  const channels = card.channels ? ` across ${card.channels.toLocaleString()} channels` : '';
  lines.push(`Trained on ${card.videos.toLocaleString()} videos${channels}.`);

  if (card.dateRange) {
    const [from, to] = card.dateRange;
    const year = (iso: string) => new Date(iso).toISOString().slice(0, 7);
    lines.push(`Videos published ${year(from)} to ${year(to)}.`);
  }

  if (card.spearman !== null) {
    // Stated as a correlation, not as "68% more likely to go viral". A rank
    // correlation is what was measured, so it is what gets claimed.
    lines.push(
      `Rank correlation with actual performance on held-out videos: ${card.spearman.toFixed(2)}` +
        (card.channelDisjointSpearman !== null
          ? ` (${card.channelDisjointSpearman.toFixed(2)} on channels the model never saw).`
          : '.'),
    );
  }

  if (card.topDecileAuc !== null) {
    lines.push(`Separating top-decile videos from the rest: AUC ${card.topDecileAuc.toFixed(2)}.`);
  }

  if (report.cell && !report.cellExact) {
    lines.push('Compared against a similar niche — yours has too little data of its own.');
  }
  if (!report.cell) {
    lines.push('No niche comparison: this category has no training data yet.');
  }

  // Only when edits were actually tried. Printed for `considered: 0` this would read
  // as a measurement ("we checked, nothing helps") when the truth is that there was
  // no top-decile distribution to check against.
  if (
    report.suggestions !== null &&
    report.suggestions.length === 0 &&
    (report.suggestionsConsidered ?? 0) > 0
  ) {
    const best = report.bestRejectedLift;
    lines.push(
      best !== null && best > 0
        ? `Tried ${report.suggestionsConsidered} changes: none is predicted to move the score by more than ${best.toFixed(1)} points.`
        : `Tried ${report.suggestionsConsidered} changes: none is predicted to improve the score.`,
    );
  }

  return lines;
}
