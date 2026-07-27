/**
 * Real SEO engine, backed by NVIDIA NIM.
 *
 * Given a video title and target platform, produces:
 *   - platform-tuned optimized titles
 *   - tag suggestions
 *   - long-form description
 *   - qualitative scores
 *
 * Falls back to a deterministic generator in mock mode.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';

export interface SEOAnalysis {
  seoScore: number;
  keywordScore: number;
  cpmPotential: number;
  ctrPrediction: number;
  optimizedTitles: string[];
  tags: string[];
  description: string;
}

interface RawSEOResponse {
  seoScore: number;
  keywordScore: number;
  cpmPotential: number;
  ctrPrediction: number;
  optimizedTitles: string[];
  tags: string[];
  description: string;
}

const buildPrompt = (platform: string) => `${TRUST_SYSTEM_PREAMBLE}

You are the SEO review layer for ${platform}.

Given a proposed video title, produce platform-appropriate SEO recommendations.

For ${platform}, apply these constraints:
${platformConstraints(platform)}

Return JSON:
{
  "seoScore":         number,       // 0..100, how discoverable the current title is
  "keywordScore":     number,       // 0..100, keyword targeting quality
  "cpmPotential":     number,       // 0..100, ad-CPM friendliness of topic
  "ctrPrediction":    number,       // 0..100, click-through likelihood
  "optimizedTitles":  string[],     // 3 rewrites, each < 60 chars
  "tags":             string[],     // 8-12 platform-appropriate tags/keywords
  "description":      string        // 600-1000 char description including timestamps and CTA
}

The description must include timestamps, one clear CTA, and 3-5 hashtags. Do not claim monetization is guaranteed.`;

function platformConstraints(platform: string): string {
  const rules: Record<string, string> = {
    YouTube:   '- Titles ≤ 70 chars, curiosity + specificity, numbers work.\n- 8-12 tags, mix of head + long-tail terms.\n- Description first line must repeat the primary keyword.\n- Prefer high-CPM verticals: personal finance, tech, business.',
    TikTok:    '- Titles very short (< 40 chars), front-load the hook.\n- 6-10 hashtags in the description.\n- No timestamps (TikTok is short-form).\n- CTA should encourage saves/shares over subscribes.',
    Instagram: '- Reels-style tone, front-loaded value.\n- 8-10 hashtags, mix niche + broad.\n- No YouTube-style timestamps.',
    Facebook:  '- Assume silent auto-play.\n- Descriptive first line.\n- 5-8 tags.',
    LinkedIn:  '- Professional narrative.\n- 4-6 tags, industry-specific.\n- Include "Read the writeup" or similar knowledge-worker CTA.',
  };
  return rules[platform] ?? rules.YouTube;
}

export async function generateSEOAnalysis(
  title: string,
  platform: string,
): Promise<SEOAnalysis> {
  const raw = await chatJSON<RawSEOResponse>(
    [
      { role: 'system', content: buildPrompt(platform) },
      { role: 'user',   content: `Video title: "${title.trim()}"` },
    ],
    { model: 'fast', temperature: 0.7, maxTokens: 1400 },
  );

  if (!raw) return mockSEO(title, platform);

  return {
    seoScore:      conservativeScore(raw.seoScore ?? 60),
    keywordScore:  conservativeScore(raw.keywordScore ?? 60),
    cpmPotential:  conservativeScore(raw.cpmPotential ?? 60),
    ctrPrediction: conservativeScore(raw.ctrPrediction ?? 60),
    optimizedTitles: (raw.optimizedTitles ?? []).slice(0, 3).map((t) => scrubForbidden(t).clean.slice(0, 100)),
    tags:            (raw.tags ?? []).slice(0, 12).map((t) => scrubForbidden(t).clean.slice(0, 40)),
    description:     scrubForbidden(raw.description ?? '').clean,
  };
}

// ─── Deterministic fallback ────────────────────────────
export function mockSEO(title: string, platform: string): SEOAnalysis {
  const words = title.toLowerCase().split(' ');
  const hasNumber = /\d/.test(title);
  const hasHowTo = words.includes('how');
  const hasEmotional = ['secret', 'hack', 'mistake', 'truth', 'never'].some((w) => words.includes(w));

  const base = 60 + (hasNumber ? 10 : 0) + (hasHowTo ? 10 : 0) + (hasEmotional ? 10 : 0);
  const seoScore = conservativeScore(Math.min(100, base + 8));

  const optimizedTitles = [
    `${title} (What Nobody Tells You)`,
    `I Tested ${title.split(' ').slice(0, 4).join(' ')} — Here's What Happened`,
    `Stop Doing This: ${title}`,
  ];

  const baseTagMap: Record<string, string[]> = {
    YouTube:   ['youtube growth', 'content creator', 'monetization tips', 'youtube algorithm', 'creator tips', 'passive income', 'side hustle'],
    TikTok:    ['tiktok growth', 'viral content', 'fyp', 'tiktok tips', 'creator fund', 'trending'],
    Instagram: ['instagram reels', 'content strategy', 'instagram growth', 'reels tips', 'creator economy'],
    Facebook:  ['facebook reels', 'facebook monetization', 'video content', 'facebook algorithm'],
    LinkedIn:  ['linkedin creator', 'thought leadership', 'personal brand', 'linkedin growth'],
  };
  const tags = baseTagMap[platform] || baseTagMap.YouTube;

  const description = `${title}

I break down exactly what's working right now for creators on ${platform}. Whether you're just starting or scaling, this is the playbook I wish I'd had.

What you'll learn:
- The strategy behind consistent growth
- Common mistakes that limit your reach
- How to optimize for ${platform}'s algorithm

Timestamps:
0:00 Introduction
1:30 The problem
3:45 The solution
7:00 Results
9:30 Your action plan

Resources:
- Free review: publish.so
- Newsletter: publish.so/newsletter

#${platform.toLowerCase()} #creator #contentcreator #monetization`;

  return {
    seoScore,
    keywordScore:  conservativeScore(65 + (hasEmotional ? 10 : 0)),
    cpmPotential:  conservativeScore(70),
    ctrPrediction: conservativeScore(60 + (hasNumber ? 10 : 0) + (hasEmotional ? 8 : 0)),
    optimizedTitles,
    tags,
    description,
  };
}
