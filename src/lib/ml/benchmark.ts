/**
 * Compare one video against its own niche.
 *
 * The score alone is a verdict with no evidence: "68" tells a creator nothing they
 * can act on, and nothing they can check. This module produces the evidence — for
 * a handful of features a person can actually see, it says what the creator did,
 * what is normal in their niche, and what the videos that reached the top decile
 * of that niche did.
 *
 * WHY A CURATED SUBSET AND NOT ALL 56 CONTROLLABLE FEATURES
 * A table of 56 rows is not a comparison, it is a data dump, and most of the
 * columns are things nobody edits directly (`title_avg_word_len`,
 * `thumb_border_fraction`). The set below is the features a creator can look at,
 * recognise, and change in one action.
 *
 * WHY THE PERCENTILE POSITION IS APPROXIMATE AND SAYS SO
 * The artefact stores five percentiles per feature (p10/p25/p50/p75/p90), not the
 * full distribution — the full thing would be tens of megabytes. So "you are around
 * the 62nd percentile" is linear interpolation between two stored points, and
 * anything past p90 or below p10 is reported as an inequality rather than a number
 * we cannot support. That is a deliberate limit, not a rounding error.
 */

import { type FeatureRow } from './features';
import { modelState, type NicheCell, type NicheDistribution } from './index';
import { categoryName, cellKey, sizeBucket } from './categories';

export {
  CATEGORY_NAMES,
  UNKNOWN_CATEGORY,
  categoryName,
  cellKey,
  sizeBucket,
} from './categories';

/** How to render a value to a person. */
export type ValueFormat = 'count' | 'characters' | 'seconds' | 'percent' | 'ratio' | 'yesno';

type Benchmarked = {
  feature: string;
  label: string;
  format: ValueFormat;
  /** Which end is better, when the top-decile band cannot settle it. */
  direction?: 'higher' | 'lower' | 'band';
};

/**
 * The comparisons worth showing, in the order a creator works: title, then
 * description, then the video, then the thumbnail.
 */
export const BENCHMARKED: readonly Benchmarked[] = [
  { feature: 'title_len', label: 'Title length', format: 'characters', direction: 'band' },
  { feature: 'title_words', label: 'Words in title', format: 'count', direction: 'band' },
  { feature: 'title_caps_ratio', label: 'Capitalised letters', format: 'percent', direction: 'band' },
  { feature: 'title_has_number', label: 'Number in title', format: 'yesno', direction: 'higher' },
  { feature: 'title_question', label: 'Question in title', format: 'yesno', direction: 'band' },
  { feature: 'title_brackets', label: 'Bracketed qualifiers', format: 'count', direction: 'band' },
  { feature: 'desc_len', label: 'Description length', format: 'characters', direction: 'higher' },
  { feature: 'desc_first_line_len', label: 'First line of description', format: 'characters', direction: 'band' },
  { feature: 'desc_timestamps', label: 'Chapters', format: 'count', direction: 'higher' },
  { feature: 'desc_links', label: 'Links in description', format: 'count', direction: 'band' },
  { feature: 'tag_count', label: 'Tags', format: 'count', direction: 'band' },
  { feature: 'duration_seconds', label: 'Video length', format: 'seconds', direction: 'band' },
  { feature: 'has_captions', label: 'Caption track', format: 'yesno', direction: 'higher' },
  { feature: 'thumb_text_area', label: 'Thumbnail text coverage', format: 'percent', direction: 'band' },
  { feature: 'thumb_face_area', label: 'Face in thumbnail', format: 'percent', direction: 'band' },
  { feature: 'thumb_contrast', label: 'Thumbnail contrast', format: 'ratio', direction: 'band' },
  { feature: 'thumb_saturation', label: 'Thumbnail saturation', format: 'ratio', direction: 'band' },
  { feature: 'thumb_third_offset', label: 'Subject off-centre', format: 'ratio', direction: 'band' },
];

/** Where a value sits relative to the top-decile interquartile band. */
export type Standing = 'below' | 'inside' | 'above' | 'unknown';

export type Comparison = {
  feature: string;
  label: string;
  format: ValueFormat;
  /** What this video does. */
  value: number;
  /** Percentile of `value` within the whole niche, interpolated. Null when unknown. */
  nichePercentile: number | null;
  /** True when `nichePercentile` is pinned at an end of the stored grid rather than measured. */
  percentileIsBound: boolean;
  /** The niche's median. */
  nicheMedian: number;
  /** The top decile's median, and its p25–p75 band. Null when the cell is too thin. */
  topMedian: number | null;
  topBand: [number, number] | null;
  standing: Standing;
  /** One sentence, already formatted for display. */
  sentence: string;
};

export type BenchmarkReport = {
  cell: string;
  /** Videos behind the `all` distribution, and behind the `top` one. */
  cellSize: number;
  topSize: number;
  comparisons: Comparison[];
  /** The subset a creator should look at first: outside the top decile's band. */
  gaps: Comparison[];
};

/** Render a raw feature value the way a person would say it. */
export function formatValue(value: number, format: ValueFormat): string {
  switch (format) {
    case 'percent':
      return `${Math.round(value * 100)}%`;
    case 'seconds': {
      const seconds = Math.max(0, Math.round(value));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    }
    case 'characters':
      return `${Math.round(value)} characters`;
    case 'yesno':
      return value >= 0.5 ? 'yes' : 'no';
    case 'ratio':
      return value.toFixed(2);
    case 'count':
    default:
      return `${Math.round(value)}`;
  }
}

/**
 * Interpolate a percentile position from the five stored points.
 *
 * Returns `bound: true` when the value falls outside p10–p90, because there the
 * honest answer is "below the 10th" rather than a fabricated 3rd.
 */
export function percentileOf(
  value: number,
  stops: readonly number[],
  percentiles: readonly number[],
): { percentile: number; bound: boolean } | null {
  if (stops.length === 0 || stops.length !== percentiles.length) return null;
  if (value <= stops[0]) return { percentile: percentiles[0], bound: true };
  const last = stops.length - 1;
  if (value >= stops[last]) return { percentile: percentiles[last], bound: true };
  for (let i = 0; i < last; i++) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (value >= lo && value <= hi) {
      // A flat segment (many videos share the value) has no interior to
      // interpolate; report the lower stop rather than dividing by zero.
      if (hi - lo < 1e-12) return { percentile: percentiles[i], bound: false };
      const t = (value - lo) / (hi - lo);
      return {
        percentile: percentiles[i] + t * (percentiles[i + 1] - percentiles[i]),
        bound: false,
      };
    }
  }
  return null;
}

function standingOf(
  value: number,
  band: [number, number] | null,
  direction: Benchmarked['direction'],
): Standing {
  if (!band) return 'unknown';
  const [lo, hi] = band;
  const under = value < lo;
  const over = value > hi;
  if (!under && !over) return 'inside';
  // Direction decides whether leaving the band is a gap at all. For a
  // higher-is-better feature (description length, chapters, captions) being ABOVE
  // p75 of the winners is not a problem to flag — it is already better than most
  // of them. Only the deficient side counts.
  if (direction === 'higher') return under ? 'below' : 'inside';
  if (direction === 'lower') return over ? 'above' : 'inside';
  return under ? 'below' : 'above';
}

function sentenceFor(
  entry: Benchmarked,
  value: number,
  topMedian: number | null,
  band: [number, number] | null,
  standing: Standing,
  nicheMedian: number,
): string {
  const mine = formatValue(value, entry.format);

  if (topMedian === null || band === null) {
    // No top-decile sample: say so and fall back to the niche median, rather than
    // implying the comparison is to winners when it is not.
    return `${entry.label}: ${mine}. Your niche's median is ${formatValue(nicheMedian, entry.format)}; this niche has too few top-decile videos to compare against.`;
  }

  const winners = formatValue(topMedian, entry.format);
  const range = `${formatValue(band[0], entry.format)}–${formatValue(band[1], entry.format)}`;

  if (entry.format === 'yesno') {
    const most = topMedian >= 0.5;
    if (value >= 0.5 === most) {
      return `${entry.label}: ${mine} — the same as most top-decile videos in your niche.`;
    }
    return `${entry.label}: ${mine}, where most top-decile videos in your niche say ${winners}.`;
  }

  switch (standing) {
    case 'below':
      return `${entry.label}: ${mine}. Top-decile videos in your niche sit at ${winners} (${range}) — you are under that range.`;
    case 'above':
      return `${entry.label}: ${mine}. Top-decile videos in your niche sit at ${winners} (${range}) — you are over that range.`;
    default:
      return `${entry.label}: ${mine}, inside the ${range} range top-decile videos in your niche use.`;
  }
}

/** Build the comparison list for one row against one already-resolved cell. */
export function compareToCell(
  row: FeatureRow,
  niche: NicheCell,
  percentiles: readonly number[],
  cell: string,
): BenchmarkReport {
  const all: NicheDistribution = niche.all ?? {};
  const top: NicheDistribution = niche.top ?? {};
  const median = percentiles.indexOf(50);
  const p25 = percentiles.indexOf(25);
  const p75 = percentiles.indexOf(75);

  const comparisons: Comparison[] = [];
  for (const entry of BENCHMARKED) {
    const allStops = all[entry.feature];
    // No distribution for this feature means the cell predates it or is empty.
    // Skipping is right: an invented baseline is worse than a shorter table.
    if (!allStops || median < 0 || median >= allStops.length) continue;

    const value = Number.isFinite(row[entry.feature]) ? row[entry.feature] : 0;
    const topStops = top[entry.feature];
    const topMedian =
      topStops && median < topStops.length ? topStops[median] : null;
    const topBand: [number, number] | null =
      topStops && p25 >= 0 && p75 >= 0 && p75 < topStops.length
        ? [topStops[p25], topStops[p75]]
        : null;

    const position = percentileOf(value, allStops, percentiles);
    const standing = standingOf(value, topBand, entry.direction);

    comparisons.push({
      feature: entry.feature,
      label: entry.label,
      format: entry.format,
      value,
      nichePercentile: position ? Math.round(position.percentile * 10) / 10 : null,
      percentileIsBound: position ? position.bound : false,
      nicheMedian: allStops[median],
      topMedian,
      topBand,
      standing,
      sentence: sentenceFor(entry, value, topMedian, topBand, standing, allStops[median]),
    });
  }

  return {
    cell,
    cellSize: niche.n ?? 0,
    topSize: niche.nTop ?? 0,
    comparisons,
    gaps: comparisons.filter((c) => c.standing === 'below' || c.standing === 'above'),
  };
}

/**
 * Benchmark a row against a named niche cell using the loaded model.
 *
 * `null` when there is no model or no such cell — the caller must not render a
 * comparison to a niche it has no data for.
 */
export function benchmark(row: FeatureRow, cell: string): BenchmarkReport | null {
  const state = modelState();
  if (!state.available) return null;
  const niche = state.model.nicheStats[cell];
  if (!niche) return null;
  return compareToCell(row, niche, state.model.percentiles, cell);
}

/**
 * The closest cell the model actually has, when the exact one is missing.
 *
 * A creator in a category the training run never reached would otherwise see
 * nothing. Falling back one subscriber bucket at a time — never across form, since
 * a Short and a 20-minute video are not comparable — keeps the comparison
 * defensible while widening coverage. Returns the key and whether it is exact, so
 * the UI can say "compared against a similar niche".
 */
export function resolveCell(
  categoryId: string,
  subscribers: number,
  isShorts: boolean,
): { cell: string; exact: boolean } | null {
  const state = modelState();
  if (!state.available) return null;
  const cells = state.model.nicheStats;

  const exact = cellKey(categoryId, subscribers, isShorts);
  if (cells[exact]) return { cell: exact, exact: true };

  const form = isShorts ? 'short' : 'long';
  const order = ['nano', 'micro', 'small', 'mid', 'large', 'mega'];
  const from = order.indexOf(sizeBucket(subscribers));
  // Walk outward from the creator's own bucket: one smaller, one larger, two
  // smaller, and so on, so the substitute is always the nearest available size.
  for (let step = 1; step < order.length; step++) {
    for (const index of [from - step, from + step]) {
      if (index < 0 || index >= order.length) continue;
      const candidate = `${categoryName(categoryId)}|${order[index]}|${form}`;
      if (cells[candidate]) return { cell: candidate, exact: false };
    }
  }
  return null;
}
