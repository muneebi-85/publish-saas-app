/**
 * Hook & retention engine, backed by NVIDIA NIM.
 *
 * Given a video's opening script and target platform, predicts retention at
 * three known drop-off points (5s, 10s, 30s), diagnoses *why* viewers might
 * drop, and generates stronger hook alternatives.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';
import { HookRetentionMetric } from '../types';

interface RawHookResponse {
  first5SecRetention:  number;
  first10SecRetention: number;
  first30SecRetention: number;
  hookDropoffReason:   string;
  recommendedHooks:    string[];
}

const SYSTEM = (platform: string) => `${TRUST_SYSTEM_PREAMBLE}

You are the hook-and-retention review layer for ${platform}.

Given a video's opening script text, predict viewer retention percentages at 5, 10, and
30 seconds. Diagnose the single most likely reason retention drops. Suggest 2-3
stronger opening hooks the creator can copy verbatim.

Return JSON:
{
  "first5SecRetention":  number,  // 0..100
  "first10SecRetention": number,  // 0..100, must be <= first5SecRetention + 5
  "first30SecRetention": number,  // 0..100, must be <= first10SecRetention + 5
  "hookDropoffReason":   string,  // one sentence, ≤ 140 chars
  "recommendedHooks":    string[] // 2-3 short opening lines, each ≤ 180 chars
}`;

export async function analyzeHook(
  openingScript: string,
  platform: string = 'YouTube',
): Promise<HookRetentionMetric> {
  const trimmed = openingScript.trim().slice(0, 2000);

  const raw = await chatJSON<RawHookResponse>(
    [
      { role: 'system', content: SYSTEM(platform) },
      { role: 'user',   content: `Opening script:\n\n"""${trimmed}"""` },
    ],
    { model: 'reasoning', temperature: 0.5, maxTokens: 900 },
  );

  if (!raw) return mockHook(openingScript);

  return {
    first5SecRetention:  conservativeScore(raw.first5SecRetention  ?? 60),
    first10SecRetention: conservativeScore(raw.first10SecRetention ?? 55),
    first30SecRetention: conservativeScore(raw.first30SecRetention ?? 50),
    hookDropoffReason:   scrubForbidden(raw.hookDropoffReason ?? 'Opening lacks specificity.').clean,
    recommendedHooks:    (raw.recommendedHooks ?? [])
      .slice(0, 3)
      .map((h) => scrubForbidden(h).clean),
  };
}

export function mockHook(script: string): HookRetentionMetric {
  const startsWeak = /^(hi|hey|in this video|welcome back|today we)/i.test(script.trim());
  const base = startsWeak ? 62 : 88;
  return {
    first5SecRetention:  conservativeScore(base),
    first10SecRetention: conservativeScore(base - 8),
    first30SecRetention: conservativeScore(base - 18),
    hookDropoffReason:   startsWeak
      ? 'Opening reads as throat-clearing before the payoff.'
      : 'Slight verbal drag before the visual payoff.',
    recommendedHooks: [
      '90% of creators are getting this one thing wrong — here\'s the fix in 60 seconds.',
      'Before you upload your next video, there\'s one monetization trap you need to check.',
    ],
  };
}
