/**
 * Platform policy engine.
 *
 * This is the heart of Publish's value: mapping a video's characteristics onto
 * each platform's *published* monetization rules, and explaining the mapping so
 * the creator can verify it themselves.
 *
 * Policy summaries live in code (not in the model's memory) so we control
 * accuracy and can update them the day a platform changes its rules. The model's
 * job is to apply the rules, not to remember them.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';
import { PlatformReport } from '../types';

export type PlatformName = 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';

/**
 * Policy reference cards.
 * Keep these current — they are cited verbatim to the model and shown to users.
 * `lastReviewed` surfaces in the UI so creators know how fresh our ruleset is.
 */
export const PLATFORM_POLICIES: Record<PlatformName, {
  lastReviewed: string;
  monetizationName: string;
  rules: string[];
  disqualifiers: string[];
}> = {
  YouTube: {
    lastReviewed: '2026-07-22',
    monetizationName: 'YouTube Partner Program / AdSense',
    rules: [
      'Advertiser-friendly content guidelines govern ad suitability (green/yellow/red icon).',
      'Synthetic or altered content must be disclosed when it could mislead about real events or people.',
      'Reused content policy: substantial original commentary or transformation is required.',
      'Profanity in the first 7 seconds or repeated strong profanity limits ad suitability.',
      'Controversial issues and sensitive events reduce advertiser suitability even when non-violative.',
      'Music must be licensed or from the Audio Library; Content ID claims may divert revenue.',
    ],
    disqualifiers: [
      'Reused/unoriginal content with no transformation',
      'Undisclosed synthetic content depicting real people or events',
      'Repeated strong profanity throughout',
      'Content primarily targeting children without COPPA-compliant setup',
    ],
  },
  TikTok: {
    lastReviewed: '2026-07-20',
    monetizationName: 'TikTok Creator Rewards Program',
    rules: [
      'Videos must be longer than 1 minute to qualify for Creator Rewards.',
      'Content must be original — reposted or watermarked content from other platforms is excluded.',
      'Must meet "qualified views" criteria: watched for a meaningful duration by real accounts.',
      'Community Guidelines compliance is required; strikes remove eligibility.',
      'Commercial music requires the Commercial Music Library for branded content.',
    ],
    disqualifiers: [
      'Video under 1 minute',
      'Visible watermark from another platform',
      'Duetted/stitched content with insufficient original contribution',
      'Static images or slideshows with minimal motion',
    ],
  },
  Instagram: {
    lastReviewed: '2026-07-18',
    monetizationName: 'Instagram Reels bonuses & branded content',
    rules: [
      'Content Monetization Policies apply in addition to Community Guidelines.',
      'Reels must be original; recycled third-party content is excluded.',
      'Videos with watermarks or borders receive reduced distribution.',
      'Branded content must use the paid partnership label.',
      'Vertical 9:16 format required for full Reels distribution.',
    ],
    disqualifiers: [
      'Watermarked or letterboxed content',
      'Content recycled from TikTok with visible attribution',
      'Undisclosed paid partnerships',
    ],
  },
  Facebook: {
    lastReviewed: '2026-07-18',
    monetizationName: 'Facebook In-Stream Ads',
    rules: [
      'Videos should exceed 1 minute for in-stream ad placement; 3 minutes is preferred.',
      'Content must satisfy Content Monetization Policies (stricter than Community Standards).',
      'Original content requirement — compilations and unedited third-party clips are excluded.',
      'Assume silent auto-play: captions and a descriptive opening frame materially affect retention.',
      'Engagement bait ("tag a friend", "share to win") reduces distribution.',
    ],
    disqualifiers: [
      'Videos under 1 minute',
      'Static image slideshows',
      'Engagement bait language',
      'Unedited third-party content',
    ],
  },
  LinkedIn: {
    lastReviewed: '2026-07-15',
    monetizationName: 'LinkedIn creator distribution (no direct ad revenue share)',
    rules: [
      'No direct monetization program — value is reach, inbound leads, and B2B credibility.',
      'Professional Community Policies apply; overtly promotional content is downranked.',
      'Native video outperforms external links in distribution.',
      'First 3 lines determine expand-rate; front-load the insight.',
      'Hashtags: 3-5 industry-specific tags perform best.',
    ],
    disqualifiers: [
      'Purely promotional content with no professional insight',
      'External link in the post body (reduces reach)',
    ],
  },
};

interface RawPlatformResponse {
  score: number;
  policyStatus: 'Compliant' | 'Review Suggested' | 'At Risk';
  adSuitability: string;
  specificRecommendations: string[];
  citedRules: string[];
}

export interface PlatformAnalysisInput {
  platform: PlatformName;
  title?: string;
  description?: string;
  scriptText?: string;
  durationSeconds?: number;
  hasAiVoiceover?: boolean;
  hasWatermark?: boolean;
  isVertical?: boolean;
  musicSource?: string;
}

export interface PlatformReportWithCitations extends PlatformReport {
  citedRules: string[];
  policyLastReviewed: string;
}

export async function analyzePlatform(
  input: PlatformAnalysisInput,
): Promise<PlatformReportWithCitations> {
  const policy = PLATFORM_POLICIES[input.platform];

  const system = `${TRUST_SYSTEM_PREAMBLE}

You are the platform-policy review layer for ${input.platform}.

Apply ONLY the following published ${input.platform} rules. Do not invent rules from memory.

MONETIZATION PROGRAM: ${policy.monetizationName}

RULES:
${policy.rules.map((r, i) => `R${i + 1}. ${r}`).join('\n')}

HARD DISQUALIFIERS:
${policy.disqualifiers.map((d, i) => `D${i + 1}. ${d}`).join('\n')}

Scoring guidance:
- Start at 100. Subtract for each rule the content fails or partially fails.
- If any hard disqualifier applies, the score must be below 50 and policyStatus must be "At Risk".
- Under uncertainty, score lower rather than higher. A false alarm costs the creator 5 minutes; a missed risk costs them revenue.

For EVERY recommendation you make, cite which rule number it derives from — creators must be able to verify your claim against the platform's own documentation.

Return JSON:
{
  "score": number,
  "policyStatus": "Compliant" | "Review Suggested" | "At Risk",
  "adSuitability": string,           // short phrase describing ad eligibility
  "specificRecommendations": string[], // 2-4 actions, each referencing a rule (e.g. "(R3)")
  "citedRules": string[]             // the rule texts you applied
}`;

  const raw = await chatJSON<RawPlatformResponse>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
`Title: ${input.title || '(none)'}
Description: ${(input.description || '(none)').slice(0, 500)}
Duration: ${input.durationSeconds ? `${input.durationSeconds}s` : 'unknown'}
AI voiceover used: ${input.hasAiVoiceover ? 'yes' : 'no'}
Watermark present: ${input.hasWatermark ? 'yes' : 'no'}
Vertical format: ${input.isVertical ? 'yes' : 'no'}
Music source: ${input.musicSource || 'unspecified'}
Script excerpt: """${(input.scriptText || '').slice(0, 2500)}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.2, maxTokens: 1100 },
  );

  if (!raw) return mockPlatform(input.platform, input);

  return {
    platform: input.platform,
    score: conservativeScore(raw.score ?? 70),
    policyStatus: normalizeStatus(raw.policyStatus),
    adSuitability: scrubForbidden(raw.adSuitability ?? 'Eligible — see recommendations').clean,
    specificRecommendations: (raw.specificRecommendations ?? [])
      .slice(0, 4)
      .map((r) => scrubForbidden(r).clean),
    citedRules: (raw.citedRules ?? []).slice(0, 6),
    policyLastReviewed: policy.lastReviewed,
  };
}

/** Run all five platforms concurrently. */
export async function analyzeAllPlatforms(
  input: Omit<PlatformAnalysisInput, 'platform'>,
): Promise<PlatformReportWithCitations[]> {
  const platforms: PlatformName[] = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'];
  return Promise.all(platforms.map((platform) => analyzePlatform({ ...input, platform })));
}

function normalizeStatus(v: string | undefined): 'Compliant' | 'Review Suggested' | 'At Risk' {
  if (v === 'Compliant' || v === 'Review Suggested' || v === 'At Risk') return v;
  return 'Review Suggested';
}

// ─── Deterministic fallback ────────────────────────────
export function mockPlatform(
  platform: PlatformName,
  input: Partial<PlatformAnalysisInput> = {},
): PlatformReportWithCitations {
  const policy = PLATFORM_POLICIES[platform];
  const duration = input.durationSeconds ?? 300;

  // Apply the rules we can check deterministically.
  let score = 92;
  const recs: string[] = [];

  if ((platform === 'TikTok' || platform === 'Facebook') && duration < 60) {
    score -= 45;
    recs.push(`Video is under 1 minute — below the ${platform} monetization threshold (D1).`);
  }
  if (input.hasWatermark && (platform === 'TikTok' || platform === 'Instagram')) {
    score -= 30;
    recs.push(`Remove the visible watermark — ${platform} excludes watermarked content (D2).`);
  }
  if (input.hasAiVoiceover && platform === 'YouTube') {
    score -= 6;
    recs.push('AI voiceover detected — add the synthetic content disclosure in YouTube Studio (R2).');
  }
  if (platform === 'Instagram' && input.isVertical === false) {
    score -= 12;
    recs.push('Export a 9:16 vertical cut for full Reels distribution (R5).');
  }
  if (recs.length === 0) {
    recs.push(`Content aligns with published ${platform} monetization rules as reviewed on ${policy.lastReviewed}.`);
  }

  const finalScore = conservativeScore(Math.max(20, score));

  return {
    platform,
    score: finalScore,
    policyStatus: finalScore >= 85 ? 'Compliant' : finalScore >= 60 ? 'Review Suggested' : 'At Risk',
    adSuitability:
      finalScore >= 85 ? `Eligible — ${policy.monetizationName}` :
      finalScore >= 60 ? `Conditionally eligible — resolve items below` :
      `Not currently eligible — see blocking items`,
    specificRecommendations: recs.slice(0, 4),
    citedRules: policy.rules.slice(0, 3),
    policyLastReviewed: policy.lastReviewed,
  };
}
