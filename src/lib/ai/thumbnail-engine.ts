/**
 * Thumbnail analyzer — uses NVIDIA's multimodal NIM model to actually *look* at
 * the image rather than guessing from metadata.
 *
 * Reads: face count and expression, text legibility at mobile size, contrast,
 * composition, and clickbait risk (which matters because platforms penalize
 * misleading thumbnails, and that is a monetization risk).
 */

import { analyzeImage } from './nvidia';
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

You are the thumbnail review layer for Publish. You are looking at an actual video thumbnail image. Assess it the way a senior YouTube growth strategist would when the frame is one browse-feed tile competing against 20 others.

EVALUATE (all judged at the size the viewer actually sees):
1. Faces: how many human faces are visible and the single dominant expression (facial expression drives parasocial click intent on browse/Suggested surfaces).
2. Text legibility at 320x180 (mobile feed size): would every overlaid word still be readable after downscale? Long overlays and thin fonts blur first.
3. Contrast: does the subject separate from the background by luminance/color contrast rather than fine detail? Detail is lost at feed size; contrast survives.
4. Composition: subject placement, visual hierarchy, negative space, and whether the focal point survives the bottom-right timestamp overlay and the mobile crop.
5. Clickbait risk: does the thumbnail's implied promise exceed what the title/video can deliver? A mismatch triggers YouTube's misleading-metadata demotion and the associated reach/revenue loss — flag it, never endorse it.

RECOMMENDATION RULES (every string in "recommendations" MUST satisfy all four, woven naturally as 1-2 sentences — not labeled fields):
- WHERE: name the exact region or element ("the top-left 40%", "the 6-word overlay", "the subject's eyeline", "the red-on-orange text"). Never a whole-image generality.
- WHY: the mechanism plus the specific platform behaviour it triggers (feed-size downscale, browse CTR, eye-tracking to faces, misleading-metadata demotion).
- WHAT: a copy-paste-ready change or a concrete before->after ("cut the overlay from 'HOW I BUILT MY ENTIRE STARTUP IN 7 DAYS' to '7-DAY STARTUP'").
- IMPACT: an honest mechanism or range, never a guarantee ("shorter overlays typically survive the 320x180 downscale that currently blurs this text"; "raising subject/background contrast is a known CTR lever on browse"). Do NOT invent a measured percentage or view/subscriber number you cannot observe.

BANNED — never output these or any paraphrase; if your draft recommendation matches one, rewrite it until it names WHERE + WHY + WHAT + IMPACT: "improve your thumbnail", "make it more engaging", "make it pop", "add value", "optimize the thumbnail", "be more authentic", "increase contrast" (with no region), "add text" (with no copy), "use a brighter color" (with no element), "make the face bigger" (with no reason or amount), or any advice lacking an exact location. Never guarantee monetization, approval, or a view/CTR number.

Return JSON only, exactly this schema and these field names:
{
  "ctrPredictionScore":   number,   // 0..100 predicted click-through strength at feed size
  "faceCount":            number,
  "dominantEmotion":      string,   // e.g. "Focused curiosity"; "N/A" if no face
  "textReadabilityScore": number,   // 0..100; 100 if no text present
  "contrastRating":       string,   // e.g. "High contrast (9.2:1)"
  "clickbaitRisk":        "Low" | "Medium" | "High",
  "compositionScore":     number,   // 0..100
  "recommendations":      string[]  // 2-3 strings, each obeying the WHERE/WHY/WHAT/IMPACT rules above
}`;

export async function analyzeThumbnail(
  imageUrl: string,
  videoTitle?: string,
): Promise<ThumbnailMetric> {
  const prompt = videoTitle
    ? `${VISION_PROMPT}\n\nThe video title is: "${videoTitle}". Judge clickbait risk against whether the thumbnail's implied promise matches this title.`
    : VISION_PROMPT;

  const rawText = await analyzeImage(imageUrl, prompt, { temperature: 0.3, maxTokens: 900 });

  if (!rawText) return unmeasuredThumbnail();

  // The vision model returns text; parse the JSON out of it.
  const parsed = extractJSON<RawThumbnailResponse>(rawText);
  if (!parsed) return unmeasuredThumbnail();

  return {
    measured:             true,
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

/**
 * The explicit "this layer did not run" result.
 *
 * No thumbnail image was analyzed by the vision model, so we do NOT fabricate a
 * CTR / composition / contrast score — every numeric is null and `measured` is
 * false so the UI renders "Not measured" instead of an invented number.
 */
export function unmeasuredThumbnail(): ThumbnailMetric {
  return {
    measured: false,
    ctrPredictionScore: null,
    faceCount: null,
    dominantEmotion: 'Not measured',
    textReadabilityScore: null,
    contrastRating: 'Not measured',
    clickbaitRisk: 'Low',
    compositionScore: null,
    recommendations: [
      "No thumbnail is attached, so CTR, contrast, composition, and clickbait scoring can't run — and on YouTube's browse and Suggested feeds, thumbnail click-through is the single biggest multiplier turning impressions into views, so this is the highest-leverage layer to unlock. Attach the exact 1280x720 (16:9) image you plan to upload and this layer will measure face count and expression, text legibility after the 320x180 mobile downscale, and subject-background contrast against your title.",
      "Until an image is attached, three click-deciding checks stay dark: whether your largest overlay text survives the feed-size downscale (short 2-4 word overlays tend to hold, long lines blur into noise), whether the subject separates from the background by contrast rather than fine detail that vanishes at tile size, and whether the frame's implied promise matches your title — a mismatch is exactly what triggers YouTube's misleading-metadata demotion and the reach loss that follows.",
    ],
  };
}
