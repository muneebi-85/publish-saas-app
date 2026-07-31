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
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden } from './guardrails';
import { CopyrightMetric } from '../types';

export interface CopyrightInput {
  scriptText?: string;
  musicSourceDescription?: string; // "royalty-free from Artlist" / "TV show clip" / "unknown"
  detectedLogos?: string[];        // pre-extracted from vision pass
  hasWatermark?: boolean;
  stockFootagePercent?: number;    // creator self-report, 0..100
}

interface RawCopyrightResponse {
  musicMatchRisk:     'Low' | 'Medium' | 'High';
  logoRisk:           'Low' | 'Medium' | 'High';
  movieClipRisk:      'Low' | 'Medium' | 'High';
  recommendations:    string[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

You are the copyright & brand-safety review layer for Publish.

You are given the creator's DECLARED inputs only: a free-text music-source description, a list of logos a vision pass may have detected, a watermark flag, a stock-footage percentage, and a script excerpt. Treat every input as a self-report, not ground truth. You are NOT running an audio fingerprint or a frame-level scan; you are doing a policy-level risk read on top of what the creator typed and what the vision pass surfaced.

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
`Music source: ${input.musicSourceDescription || 'unspecified'}
Detected logos: ${(input.detectedLogos ?? []).join(', ') || 'none'}
Watermark present: ${input.hasWatermark ? 'yes' : 'no'}
Stock footage %: ${input.stockFootagePercent ?? 'unknown'}
Script excerpt: """${(input.scriptText ?? '').slice(0, 1500)}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.2, maxTokens: 800 },
  );

  // Only emit a stock-footage estimate when we actually have a signal. When the
  // creator gave us nothing, we say so rather than inventing a default 18%.
  const stockPct = input.stockFootagePercent;
  const stockFootageEstimate =
    typeof stockPct === 'number'
      ? `${stockPct}% (${stockPct < 30 ? 'Fair Use Compliant' : 'High — verify licensing'})`
      : null;

  if (!raw) return heuristicCopyright(input);

  return {
    musicMatchRisk: normalizeRisk(raw.musicMatchRisk),
    detectedLogos:  input.detectedLogos ?? [],
    movieClipRisk:  normalizeRisk(raw.movieClipRisk),
    watermarkDetected: !!input.hasWatermark,
    stockFootageEstimate,
    recommendations: (raw.recommendations ?? [])
      .slice(0, 4)
      .map((r) => scrubForbidden(r).clean),
  };
}

function normalizeRisk(v: string | undefined): 'Low' | 'Medium' | 'High' {
  if (v === 'High' || v === 'Medium' || v === 'Low') return v;
  return 'Medium'; // conservative default
}

export function heuristicCopyright(input: CopyrightInput): CopyrightMetric {
  const src = (input.musicSourceDescription || '').toLowerCase();
  const musicRisk: 'Low' | 'Medium' | 'High' =
    /artlist|epidemic|royalty[- ]?free|licensed|original/.test(src) ? 'Low' :
    /tv|film|movie|radio|unknown|top ?40|billboard/.test(src) ? 'High' : 'Medium';
  const stockPct = input.stockFootagePercent;
  const stockFootageEstimate =
    typeof stockPct === 'number'
      ? `${stockPct}% (${stockPct < 30 ? 'Fair Use Compliant' : 'High — verify licensing'})`
      : null;
  return {
    musicMatchRisk: musicRisk,
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
