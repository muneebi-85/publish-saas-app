/**
 * Hook & retention engine, backed by NVIDIA NIM.
 *
 * Given a video's opening script and target platform, predicts retention at
 * three known drop-off points (5s, 10s, 30s), diagnoses *why* viewers might
 * drop, and generates stronger hook alternatives.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore, fenceSafe } from './guardrails';
import { HookRetentionMetric } from '../types';

interface RawHookResponse {
  first5SecRetention:  number;
  first10SecRetention: number;
  first30SecRetention: number;
  hookDropoffReason:   string;
  recommendedHooks:    string[];
}

const SYSTEM = (platform: string) => `${TRUST_SYSTEM_PREAMBLE}

You are the hook-and-retention review layer for ${platform}. You write like a senior growth strategist who has scaled channels past 1M subs: precise, mechanism-driven, never generic.

INPUT: a video's opening script text (first ~30 seconds spoken).
TASK: predict viewer retention at 5s, 10s, and 30s; diagnose the single biggest cause of early drop-off; and rewrite the opener into 2-3 stronger hooks the creator can paste verbatim.

RETENTION MODEL (use this, don't guess blindly):
- ${platform} weights the first 3-5 seconds most heavily; that window drives the 5s drop-off and feeds Average View Duration / early-retention signals that gate further distribution.
- The 5s->10s slope is set by whether a concrete stakes or payoff was named in line 1. The 10s->30s slope is set by whether the promised payoff has started to deliver.
- first10SecRetention must be <= first5SecRetention + 5. first30SecRetention must be <= first10SecRetention + 5.

EVERY hookDropoffReason AND every recommendedHook MUST, woven into natural prose (never as labeled fields), contain all four:
1. WHERE — the exact location: quote the offending words, or name the second ("first 3s", "line 1", "the phrase 'in this video'"). Never say "the opening" without pointing at specific text.
2. WHY — the specific retention mechanism or ${platform} behaviour it triggers (e.g. "no stakes named before the 5s drop-off gate", "greeting delays the payoff past the AVD-weighted window").
3. WHAT — a copy-paste-ready rewrite, shown as a before -> after using the creator's OWN script words wherever possible.
4. EXPECTED IMPACT — an honest mechanism or range with a caveat ("typically recovers ~3-8% of first-30s retention on curiosity-led openers", "removes a known throat-clear drop-off pattern"). NEVER a guarantee, never a fabricated exact number you cannot know.

BANNED — never output any of these, in any wording:
- "Improve your thumbnail", "make it more engaging", "add value", "optimize your title", "be more authentic", "hook the viewer", "grab attention", "stronger opening" with no specifics.
- Fabricated statistics presented as fact ("90% of creators...", "studies show...") unless the number is given in the input.
- Clickbait framing that could trip misleading-metadata/clickbait rules: "loophole", "they don't want you to know", "you won't believe", or a promise the script does not actually deliver.
- Any guarantee of views, retention, monetization, or approval.

GOOD vs BAD calibration:
BAD (throat-clear, no stakes): "Hi guys, welcome back to my channel, today I'm going to show you..." -> the greeting spends the AVD-weighted first 3s before any reason to stay.
GOOD (stakes in line 1, honest, delivers): "If your first 5 seconds sound like this, you're losing half your viewers — here's the fix." -> names a concrete loss the video then resolves.

Return ONLY this JSON, no prose outside it:
{
  "first5SecRetention":  number,  // 0..100
  "first10SecRetention": number,  // 0..100, <= first5SecRetention + 5
  "first30SecRetention": number,  // 0..100, <= first10SecRetention + 5
  "hookDropoffReason":   string,  // one dense sentence naming WHERE + WHY + the fix direction; <= 140 chars
  "recommendedHooks":    string[] // 2-3 entries; each a paste-ready hook plus its WHY + honest impact; each <= 180 chars
}`;

/**
 * The explicit "this layer did not run" state — mirrors `unmeasuredVideo` /
 * `unmeasuredThumbnail`. Returned when there is no script or transcript, so
 * the numbers are never displayed (the page checks `analyzed`) and the
 * orchestrator excludes the layer from the weighted headline instead of
 * blending in a fabricated retention figure.
 */
export function unmeasuredHook(): HookRetentionMetric {
  return {
    first5SecRetention: 0,
    first10SecRetention: 0,
    first30SecRetention: 0,
    hookDropoffReason:
      'Not analyzed — no script or transcript was supplied, so there was no opening to read. Attach the script (or an audio track to transcribe) and re-review to get real retention predictions.',
    recommendedHooks: [],
    analyzed: false,
  };
}

export async function analyzeHook(
  openingScript: string,
  platform: string = 'YouTube',
): Promise<HookRetentionMetric> {
  const trimmed = openingScript.trim().slice(0, 2000);

  // No opening to read: say so rather than sending an empty fence to the model
  // and rendering whatever retention numbers come back as a prediction. The
  // same guard `analyzeScript` uses; `heuristicHook` would have the same
  // problem (its regex reads empty string and returns a passing 88).
  if (!trimmed) return unmeasuredHook();

  const raw = await chatJSON<RawHookResponse>(
    [
      { role: 'system', content: SYSTEM(platform) },
      { role: 'user',   content: `Opening script:\n\n"""${fenceSafe(trimmed)}"""` },
    ],
    { model: 'reasoning', temperature: 0.5, maxTokens: 900 },
  );

  if (!raw) return heuristicHook(openingScript);

  // Clamp the monotonic retention relationship the prompt mandates but a
  // schema-violating model may ignore (5s=40, 10s=90 would otherwise flow
  // straight into the overall score at 15% weight). Same philosophy as
  // conservativeScore: never trust the model's numbers unchecked.
  const first5 = conservativeScore(raw.first5SecRetention ?? 60);
  const first10 = Math.min(conservativeScore(raw.first10SecRetention ?? 55), first5 + 5);
  const first30 = Math.min(conservativeScore(raw.first30SecRetention ?? 50), first10 + 5);

  return {
    first5SecRetention:  first5,
    first10SecRetention: first10,
    first30SecRetention: first30,
    hookDropoffReason:   scrubForbidden(raw.hookDropoffReason ?? 'Opening lacks specificity.').clean,
    recommendedHooks:    (raw.recommendedHooks ?? [])
      .slice(0, 3)
      .map((h) => scrubForbidden(h).clean),
    basis: 'model',
  };
}

export function heuristicHook(script: string, platform: string = 'YouTube'): HookRetentionMetric {
  const opening = script.trim();
  if (!opening) return unmeasuredHook();
  const startsWeak = /^(hi|hey|in this video|welcome back|today we)/i.test(opening);
  const base = startsWeak ? 62 : 88;

  // Pull the creator's own subject (first few meaningful words) so the example
  // hooks are anchored to THIS script rather than a generic canned line.
  const STOP = new Set(['the', 'a', 'an', 'and', 'to', 'of', 'in', 'on', 'for', 'with', 'i', 'we', 'you', 'this', 'that', 'is', 'are']);
  const subject = opening
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()))
    .slice(0, 4)
    .join(' ');
  const topic = subject || 'this';

  return {
    first5SecRetention:  conservativeScore(base),
    first10SecRetention: conservativeScore(base - 8),
    first30SecRetention: conservativeScore(base - 18),
    // Basis marker: these retention numbers are a coarse pattern check, not a
    // model read. The UI discloses this; the score itself still flows through
    // the same conservative clamps, so a degraded deploy cannot inflate it.
    basis: 'heuristic',
    // WHERE + WHY + fix direction, branched on whether the opener throat-clears.
    hookDropoffReason: startsWeak
      ? `Your first line trips the greeting/"in this video" throat-clear pattern, spending ${platform}'s AVD-weighted first 3s before any stakes — lead with the ${topic} stakes instead ("Hi guys, welcome back" -> "Here's why ${topic} is quietly costing you views"); typically claws back a few points of first-30s retention.`
      : `No throat-clear detected, but this read came from pattern matching rather than the full model pass — the opener names ${topic} but not its payoff in line 1; connect ${platform} analytics to see the actual drop-off, and front-load the concrete promise to shave the warm-up before viewers commit.`,
    // Labeled as paste-ready templates the creator adapts — not measured guarantees.
    recommendedHooks: [
      `Stakes-first template for ${topic}: "The way most people do ${topic} is silently losing them views — here's what actually works." Naming a concrete loss inside the first 3s is what ${platform}'s early-retention gate rewards; swap in your real number once you know it.`,
      `Payoff-first template for ${topic}: "By the end of this you'll ${topic.toLowerCase()} — no fluff, starting now." Stating the outcome in line 1 pre-empts the 5-10s drop where curiosity-less intros bleed viewers; keep it under ~8 spoken words and only promise what the video delivers.`,
    ],
  };
}
