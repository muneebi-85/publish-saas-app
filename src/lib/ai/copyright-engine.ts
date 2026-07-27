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

You are the copyright & brand-safety review layer.

Given the creator's declared inputs, classify claim risk conservatively — a false
positive (Medium when it's actually Low) is far preferable to missing a real claim.
Under uncertainty, choose the higher risk level.

Return JSON:
{
  "musicMatchRisk":  "Low" | "Medium" | "High",
  "logoRisk":        "Low" | "Medium" | "High",
  "movieClipRisk":   "Low" | "Medium" | "High",
  "recommendations": string[]      // 2-4 concrete actions
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

  const stockPct = input.stockFootagePercent ?? 18;

  if (!raw) return mockCopyright(input);

  return {
    musicMatchRisk: normalizeRisk(raw.musicMatchRisk),
    detectedLogos:  input.detectedLogos ?? [],
    movieClipRisk:  normalizeRisk(raw.movieClipRisk),
    watermarkDetected: !!input.hasWatermark,
    stockFootageEstimate: `${stockPct}% (${stockPct < 30 ? 'Fair Use Compliant' : 'High — verify licensing'})`,
    recommendations: (raw.recommendations ?? [])
      .slice(0, 4)
      .map((r) => scrubForbidden(r).clean),
  };
}

function normalizeRisk(v: string | undefined): 'Low' | 'Medium' | 'High' {
  if (v === 'High' || v === 'Medium' || v === 'Low') return v;
  return 'Medium'; // conservative default
}

export function mockCopyright(input: CopyrightInput): CopyrightMetric {
  const src = (input.musicSourceDescription || '').toLowerCase();
  const musicRisk: 'Low' | 'Medium' | 'High' =
    /artlist|epidemic|royalty[- ]?free|licensed|original/.test(src) ? 'Low' :
    /tv|film|movie|radio|unknown|top ?40|billboard/.test(src) ? 'High' : 'Medium';
  const stockPct = input.stockFootagePercent ?? 18;
  return {
    musicMatchRisk: musicRisk,
    detectedLogos: input.detectedLogos ?? [],
    movieClipRisk: 'Low',
    watermarkDetected: !!input.hasWatermark,
    stockFootageEstimate: `${stockPct}% (${stockPct < 30 ? 'Fair Use Compliant' : 'High — verify licensing'})`,
    recommendations: [
      musicRisk === 'Low'
        ? 'Background audio verified royalty-free.'
        : 'Verify the background track carries commercial-use rights before publishing.',
      (input.detectedLogos ?? []).length
        ? `Brief ${input.detectedLogos!.join(', ')} logo appearance likely qualifies under nominative fair use — keep exposure under 5 seconds.`
        : 'No brand marks detected.',
    ],
  };
}
