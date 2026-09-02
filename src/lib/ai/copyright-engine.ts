/**
 * Copyright + brand-safety review, backed by NVIDIA NIM.
 *
 * True copyright detection needs audio fingerprinting (ACRCloud/AudD) and
 * shot-level vision matching — this engine handles the *policy-level* review
 * (music-licensing exposure, brand-mark risk classification, watermark
 * detection heuristics from user disclosures), and coordinates the external
 * fingerprint call when that key is present.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, fenceSafe } from './guardrails';
import { CopyrightMetric } from '../types';

export interface CopyrightInput {
  scriptText?: string;
  musicSourceDescription?: string; // "royalty-free from Artlist" / "TV show clip" / "unknown"
  detectedLogos?: string[];        // pre-extracted from vision pass
  hasWatermark?: boolean;
  stockFootagePercent?: number;    // DERIVED estimate from declared signals — the UI has no stock-% field, so this is never a direct self-report
}

/**
 * Copyright composite, from the WORST of the risk bands the engine produces
 * (plus a watermark penalty), not music alone.
 *
 * The previous music-only mapping let a video with licensed music and a High
 * movie-clip risk score 96/100 — an overstated-safety direction. Lives HERE so
 * every consumer (the orchestrator's headline score and the scorecard card)
 * imports the one implementation and the two can never disagree.
 */
export function copyrightCompositeScore(c: {
  musicMatchRisk: string;
  movieClipRisk: string;
  watermarkDetected?: boolean;
}): number {
  const band = (r: string): number => (r === 'Low' ? 96 : r === 'Medium' ? 75 : 45);
  const worst = Math.min(band(c.musicMatchRisk), band(c.movieClipRisk));
  return c.watermarkDetected ? Math.min(worst, 75) : worst;
}

interface RawCopyrightResponse {
  musicMatchRisk:     'Low' | 'Medium' | 'High';
  logoRisk:           'Low' | 'Medium' | 'High';
  movieClipRisk:      'Low' | 'Medium' | 'High';
  recommendations:    string[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

You are the copyright & brand-safety review layer for Publish.

You are given the creator's DECLARED inputs only: a free-text music-source description, a list of logos a vision pass may have detected, a watermark flag, a stock-footage estimate DERIVED from those same declared signals (not a number the creator typed — the app has no stock-% field), and a script excerpt. Treat every input as a self-report, not ground truth. You are NOT running an audio fingerprint or a frame-level scan; you are doing a policy-level risk read on top of what the creator typed and what the vision pass surfaced.

RISK CLASSIFICATION
Classify each of musicMatchRisk, logoRisk, and movieClipRisk conservatively. A false positive (Medium when it is really Low) is far preferable to missing a real claim. Under uncertainty, choose the higher band. Anchor your reasoning in the actual claim mechanism: YouTube Content ID matches on the audio waveform and reference video/frames, NOT on the creator's typed description — so a "royalty-free" string is at best weak evidence and can never be called "verified" or "clean".

RECOMMENDATIONS — the part creators read. Return 2-4 strings. EVERY string MUST contain, woven into natural prose (never as labeled fields), all four of:
- WHERE: the exact element it concerns — the named track/source string, the specific logo(s), the watermark, the stock-footage %, or a script phrase. Never "your audio" in the abstract when you can name the source they typed.
- WHY: the precise mechanism and platform behaviour it triggers — name it (Content ID audio claim, manual copyright claim on footage, monetization diverted to the rights holder, watermark = another creator's Content ID reference, trademark ≠ copyright). Not the word "licensing" alone.
- WHAT: a copy-paste-ready action or a before→after — "replace with a track from the YouTube Audio Library or Epidemic Sound and paste the license ID into the source field", not "verify rights".
- IMPACT: an HONEST mechanism or range, never a guarantee — e.g. "an unlicensed commercial track typically draws a Content ID claim within minutes and can route 100% of ad revenue to the rights holder", or "removes the most common manual-claim vector". If you cannot know a number, say what is unmeasured and what connecting a real source (audio fingerprint / frame scan) would unlock — phrase it as a strategist, not a system error.

HARD RULES
- Never assert "verified", "cleared", "clean", "safe", or "confirmed" for anything you only inferred from a keyword or a self-report. Say what matched and what that does and does not prove.
- Never invent a duration safe-harbor (there is no "under 5 seconds" rule), a fair-use guarantee, or a fabricated percentage/measured number the inputs do not contain.
- Do not misapply doctrines: nominative fair use is trademark law and does not stop a Content ID or copyright claim on underlying footage.
- If an input is null/unknown, say so and name the single action that would resolve it — do not paper over it with a reassuring status line.

BANNED — never output these or anything equivalently generic (a recommendation that fails to say exactly where, exactly why, exactly what, and roughly how much it helps is invalid): "verify licensing", "make sure you have the rights", "double-check your audio", "no brand marks detected" as a standalone, "background audio verified royalty-free", "improve", "optimize", "be more careful", "add value", "consider", "you might want to".

Return EXACTLY this JSON and nothing else:
{
  "musicMatchRisk":  "Low" | "Medium" | "High",
  "logoRisk":        "Low" | "Medium" | "High",
  "movieClipRisk":   "Low" | "Medium" | "High",
  "recommendations": string[]
}`;

export async function analyzeCopyright(input: CopyrightInput): Promise<CopyrightMetric> {
  const raw = await chatJSON<RawCopyrightResponse>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
`Music source: """${fenceSafe(input.musicSourceDescription || 'unspecified')}"""
Detected logos: """${fenceSafe((input.detectedLogos ?? []).join(', ') || 'none')}"""
Watermark present: ${input.hasWatermark ? 'yes' : 'no'}
Stock footage %: ${input.stockFootagePercent !== undefined ? `${input.stockFootagePercent} (estimated by the app from the declared signals above — the creator did not type this number)` : 'unknown'}
Script excerpt: """${fenceSafe((input.scriptText ?? '').slice(0, 1500))}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.2, maxTokens: 800 },
  );

  // Only emit a stock-footage estimate when we actually have a signal. When the
  // creator gave us nothing, we say so rather than inventing a default 18%.
  // The label is factual, never a legal verdict: "Fair Use Compliant" stamped
  // from a creator self-report would be exactly the fair-use guarantee the
  // system prompt forbids the model from making.
  const stockFootageEstimate = describeStockFootage(input.stockFootagePercent);

  if (!raw) return heuristicCopyright(input);

  // The heuristic's read of the creator's own declared source is a FLOOR the
  // model output cannot go below — the same contract the voice engine applies
  // to AI-generated audio. The declared UI value is the one input the model
  // is shown verbatim, so a model pass that grades a declared commercial track
  // ("popular") safer than the declaration itself would be a false-safe, the
  // worst failure direction this engine has (and the fallback path would have
  // graded it High on a model-outage day, making the two paths disagree).
  const declaredFloor = musicSourceRisk((input.musicSourceDescription || '').toLowerCase());
  const flooredMusicRisk = maxRisk(normalizeRisk(raw.musicMatchRisk), declaredFloor);

  return {
    musicMatchRisk: flooredMusicRisk,
    musicSource: (input.musicSourceDescription || '').toLowerCase() || undefined,
    detectedLogos:  input.detectedLogos ?? [],
    movieClipRisk:  normalizeRisk(raw.movieClipRisk),
    watermarkDetected: !!input.hasWatermark,
    stockFootageEstimate,
    recommendations: (raw.recommendations ?? [])
      .slice(0, 4)
      .map((r) => scrubForbidden(r).clean),
  };
}

/** The higher of two risk bands — the floor's whole job. */
function maxRisk(a: 'Low' | 'Medium' | 'High', b: 'Low' | 'Medium' | 'High'): 'Low' | 'Medium' | 'High' {
  const order = { Low: 0, Medium: 1, High: 2 } as const;
  return order[a] >= order[b] ? a : b;
}

function normalizeRisk(v: string | undefined): 'Low' | 'Medium' | 'High' {
  if (v === 'High' || v === 'Medium' || v === 'Low') return v;
  return 'Medium'; // conservative default
}

/**
 * Factual stock-footage label. The percentage is DERIVED by the app from the
 * creator's declared signals (AI-generated source, watermark, stock music) —
 * there is no stock-% input field, so calling it "declared" would be false —
 * and it is not a legal test either: there is no "under 30% = fair use" safe
 * harbor, so the label names the threshold this app reviews above and never
 * issues a compliance verdict (the system prompt forbids exactly that for
 * the model).
 */
function describeStockFootage(stockPct: number | undefined): string | null {
  if (typeof stockPct !== 'number' || !Number.isFinite(stockPct)) return null;
  const pct = Math.max(0, Math.min(100, Math.round(stockPct)));
  return pct < 30
    ? `${pct}% estimated from declared signals — below the 30% review threshold, not a fair-use clearance; keep licensing receipts for any third-party clips`
    : `${pct}% estimated from declared signals — above the 30% review threshold; verify licensing for every third-party clip before publishing`;
}

/**
 * Music-source keyword read, shared by both paths. Negations are checked
 * FIRST: the unanchored royalty-free pattern used to match "licensed" inside
 * "unlicensed" (and "royalty free" inside "not royalty free"), grading the
 * exact opposite of the stated source — a false-safe, the worst failure
 * direction this engine has.
 *
 * The product UI does not send free text: it sends one of the canonical
 * values from `MUSIC_SOURCES` (none/original/licensed/stock/popular, plus
 * `unknown`). Those are mapped explicitly BEFORE the keyword pass, because the
 * literal tokens disagree with the keyword patterns in both directions —
 * "popular" is the UI's label for a commercial track (the one choice that
 * near-guarantees a Content ID claim) yet matched no pattern and graded
 * Medium, while "stock" is the UI's label for "Stock / royalty-free" and
 * must not grade below that.
 */
function musicSourceRisk(src: string): 'Low' | 'Medium' | 'High' {
  if (src === 'none' || src === 'original' || src === 'licensed' || src === 'stock') return 'Low';
  if (src === 'popular' || src === 'unknown') return 'High';
  if (/\bunlicensed\b|\bno\s+licen[cs]e\b|\bnot\s+royalty[- ]?free\b|\bstolen\b/.test(src)) {
    return 'High';
  }
  if (/\bartlist\b|\bepidemic\b|\broyalty[- ]?free\b|\blicensed\b|\boriginal\b/.test(src)) {
    return 'Low';
  }
  if (/\btv\b|\bfilm\b|\bmovie\b|\bradio\b|\bunknown\b|\btop\s?40\b|\bbillboard\b/.test(src)) {
    return 'High';
  }
  return 'Medium';
}

export function heuristicCopyright(input: CopyrightInput): CopyrightMetric {
  const src = (input.musicSourceDescription || '').toLowerCase();
  const musicRisk: 'Low' | 'Medium' | 'High' = musicSourceRisk(src);
  const stockFootageEstimate = describeStockFootage(input.stockFootagePercent);
  return {
    musicMatchRisk: musicRisk,
    musicSource: src || undefined,
    detectedLogos: input.detectedLogos ?? [],
    movieClipRisk: 'Low',
    watermarkDetected: !!input.hasWatermark,
    stockFootageEstimate,
    recommendations: [
      musicRisk === 'Low'
        ? "Your music-source field matched a royalty-free keyword (Artlist/Epidemic/licensed/original), so a Content ID claim is unlikely — but this is a keyword match on what you typed, not a waveform fingerprint, so keep the license PDF with its track ID on file; Content ID matches the audio itself, and a mismatched or expired license is the one thing that still turns this into a claim."
        : "Your music source didn't match any royalty-free license, so treat a Content ID audio claim as the default outcome: before publishing, swap the track for one from the YouTube Audio Library or your Epidemic Sound/Artlist account and paste that track's license ID into the source field — an unlicensed commercial track typically draws a claim within minutes of upload and can route 100% of the video's ad revenue to the rights holder until you dispute it.",
      (input.detectedLogos ?? []).length
        ? `The ${input.detectedLogos!.join(', ')} mark(s) showing on screen are usually fine on their own, but 'nominative fair use' is a trademark doctrine and does not stop a Content ID or manual copyright claim on the underlying footage — there is no 'under 5 seconds' safe harbor; if the logo is riding on a broadcast, ad, or film clip, that clip is the real claim risk, so confirm the footage under it is yours or licensed rather than trimming to an arbitrary length.`
        : "The vision pass flagged no brand marks — that's the absence of a detection, not proof none are present, so if you know a logo, jersey, or product label appears on screen, add it to the logo list so it gets risk-scored; wiring up a frame-level scan would upgrade this line from 'none detected' to a measured pass you can actually rely on.",
    ],
  };
}
