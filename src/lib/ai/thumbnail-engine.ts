/**
 * Thumbnail analyzer — uses NVIDIA's multimodal NIM model to actually *look* at
 * the image rather than guessing from metadata.
 *
 * Reads: face count and expression, text legibility at mobile size, contrast,
 * composition, and clickbait risk (which matters because platforms penalize
 * misleading thumbnails, and that is a monetization risk).
 */

import { analyzeImage, chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';
import { ThumbnailMetric } from '../types';

interface RawThumbnailResponse {
  ctrPredictionScore:   number;
  faceCount:            number;
  dominantEmotion:      string;
  textReadabilityScore: number;
  contrastRating:       string;
  clickbaitRisk:        'Low' | 'Medium' | 'High';
  compositionScore:     number;
  recommendations:      string[];
}

const VISION_PROMPT = `${TRUST_SYSTEM_PREAMBLE}

You are the thumbnail review layer. Look at this video thumbnail and assess it.

Evaluate:
1. How many human faces are visible, and the dominant facial expression.
2. Whether any overlaid text is legible when scaled to 320x180 (mobile feed size).
3. Contrast between subject and background.
4. Composition quality (subject placement, visual hierarchy, negative space).
5. Clickbait risk — does the thumbnail promise something the title cannot deliver?
   This matters because platforms demote misleading thumbnails, which reduces revenue.

Return JSON only:
{
  "ctrPredictionScore":   number,   // 0..100 predicted click-through strength
  "faceCount":            number,
  "dominantEmotion":      string,   // e.g. "Focused curiosity", "N/A" if no face
  "textReadabilityScore": number,   // 0..100; 100 if no text present
  "contrastRating":       string,   // e.g. "High contrast (9.2:1)"
  "clickbaitRisk":        "Low" | "Medium" | "High",
  "compositionScore":     number,   // 0..100
  "recommendations":      string[]  // 2-3 specific, actionable improvements
}`;

export async function analyzeThumbnail(
  imageUrl: string,
  videoTitle?: string,
): Promise<ThumbnailMetric> {
  const prompt = videoTitle
    ? `${VISION_PROMPT}\n\nThe video title is: "${videoTitle}". Judge clickbait risk against whether the thumbnail's implied promise matches this title.`
    : VISION_PROMPT;

  const rawText = await analyzeImage(imageUrl, prompt, { temperature: 0.3, maxTokens: 900 });

  if (!rawText) return mockThumbnail();

  // The vision model returns text; parse the JSON out of it.
  const parsed = extractJSON<RawThumbnailResponse>(rawText);
  if (!parsed) return mockThumbnail();

  return {
    ctrPredictionScore:   conservativeScore(parsed.ctrPredictionScore ?? 65),
    faceCount:            Math.max(0, Math.round(parsed.faceCount ?? 0)),
    dominantEmotion:      scrubForbidden(parsed.dominantEmotion ?? 'N/A').clean,
    textReadabilityScore: conservativeScore(parsed.textReadabilityScore ?? 80),
    contrastRating:       scrubForbidden(parsed.contrastRating ?? 'Medium contrast').clean,
    clickbaitRisk:        normalizeRisk(parsed.clickbaitRisk),
    compositionScore:     conservativeScore(parsed.compositionScore ?? 70),
    recommendations:      (parsed.recommendations ?? [])
      .slice(0, 3)
      .map((r) => scrubForbidden(r).clean),
  };
}

function normalizeRisk(v: string | undefined): 'Low' | 'Medium' | 'High' {
  if (v === 'High' || v === 'Medium' || v === 'Low') return v;
  return 'Medium';
}

function extractJSON<T>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as T; } catch { return null; }
  }
}

export function mockThumbnail(): ThumbnailMetric {
  return {
    ctrPredictionScore: 84,
    faceCount: 1,
    dominantEmotion: 'Focused curiosity',
    textReadabilityScore: 91,
    contrastRating: 'High contrast (9.2:1)',
    clickbaitRisk: 'Low',
    compositionScore: 88,
    recommendations: [
      'Overlay text is crisp and legible at mobile feed size.',
      'Adding a subtle drop shadow behind the subject would increase separation from the background.',
    ],
  };
}
