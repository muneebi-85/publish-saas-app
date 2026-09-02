/**
 * The single score-band definition for the whole product.
 *
 * One object used by the gauge, the score cards, the lists, the projects
 * risk label, the public share page and the OG images — before this
 * existed the app ran four different thresholds (85/70, 85/65, 80/50,
 * 80/55), so the same report could read "Improve" on one screen and
 * "Safe to publish" on another.
 *
 * 85+ Strong · 70–84 Fair · below 70 Weak.
 */

export type ScoreBand = 'strong' | 'fair' | 'weak';

export const SCORE_STRONG_AT = 85;
export const SCORE_FAIR_AT = 70;

export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_STRONG_AT) return 'strong';
  if (score >= SCORE_FAIR_AT) return 'fair';
  return 'weak';
}

/** Tailwind classes per band — text, bar fill, and badge flavour. */
export const SCORE_BAND_UI: Record<
  ScoreBand,
  { label: string; text: string; bar: string; badge: 'success' | 'warning' | 'danger' }
> = {
  strong: { label: 'Strong', text: 'text-grass-700', bar: 'bg-grass-600', badge: 'success' },
  fair:   { label: 'Fair',   text: 'text-amber-700', bar: 'bg-amber-600', badge: 'warning' },
  weak:   { label: 'Weak',   text: 'text-crimson-700', bar: 'bg-crimson-600', badge: 'danger' },
};

/** Raw hex per band for the satori OG-image renderer, which cannot use CSS
 *  vars. Values are the light-theme token fills (grass-600 / amber-600 /
 *  crimson-600) so the share card matches the in-app bars. */
export const SCORE_BAND_HEX: Record<ScoreBand, string> = {
  strong: '#128040',
  fair:   '#A85C08',
  weak:   '#BE2318',
};

/** The same bands on a dark surface (the OG card, the community leaderboard):
 *  the dark-theme remaps of the same tokens — light enough to clear AA on a
 *  near-black canvas. */
export const SCORE_BAND_HEX_DARK: Record<ScoreBand, string> = {
  strong: '#4ADE80',
  fair:   '#FCD34D',
  weak:   '#FCA5A5',
};
