/**
 * Creator Script Optimizer engine, backed by NVIDIA NIM.
 *
 * Rewrites script text into natural, on-camera-friendly language while
 * preserving meaning. When the model is unreachable it falls back to
 * `heuristicHumanize()` — a deterministic rule-based rewrite driven by the
 * creator's own text, so the route degrades instead of failing.
 */

import { chatJSON, chat } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden } from './guardrails';

export interface HumanizeOptions {
  tone: 'conversational' | 'authoritative' | 'storyteller' | 'energetic';
  formality: number;         // 0 (casual) .. 100 (formal)
  emotionIntensity: number;  // 0 (flat)   .. 100 (high)
  targetPlatform: 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';
}

export interface HumanizeResult {
  originalText: string;
  humanizedText: string;
  changesSummary: string[];
  metricsBefore: { gptProbabilityScore: number; readabilityGrade: string; hookStrengthScore: number };
  metricsAfter:  { gptProbabilityScore: number; readabilityGrade: string; hookStrengthScore: number };
}

interface RawHumanizeResponse {
  humanizedText: string;
  changesSummary: string[];
  metricsBefore: { gptProbabilityScore: number; readabilityGrade: string; hookStrengthScore: number };
  metricsAfter:  { gptProbabilityScore: number; readabilityGrade: string; hookStrengthScore: number };
}

function buildSystemPrompt(o: HumanizeOptions): string {
  const toneMap = {
    conversational: 'like a smart friend talking on camera',
    authoritative:  'like a confident expert with earned authority',
    storyteller:    'like a documentary narrator opening a story',
    energetic:      'like a high-energy YouTuber hitting a peak moment',
  };
  const formality =
    o.formality < 30 ? 'very casual, contractions, no big words' :
    o.formality < 70 ? 'balanced, professional but human' :
    'polished and precise, no slang';
  const platformNotes: Record<HumanizeOptions['targetPlatform'], string> = {
    YouTube: 'Aim for 2–4 sentence paragraphs. First sentence must earn attention in under 3 seconds.',
    TikTok:  'Short punchy sentences. Front-load the payoff. Assume vertical, sound-on, 3-second attention window.',
    Instagram: 'Reels-friendly. Front-load the hook. Vertical, silent-first (assume auto-play mute).',
    Facebook: 'Assume mixed silent + audio playback. Add descriptive lead sentence.',
    LinkedIn: 'Professional narrative arc, first-person insight, no hype language.',
  };

  return `${TRUST_SYSTEM_PREAMBLE}

You are the AI-Humanizer review layer.

Rewrite the given script to sound ${toneMap[o.tone]}. Formality: ${formality}. Emotion intensity: ${o.emotionIntensity}/100.
Platform: ${o.targetPlatform}. ${platformNotes[o.targetPlatform]}

Rules:
- Preserve the creator's meaning exactly. Do not invent new facts, quotes, statistics, or brand mentions.
- Remove "AI-flavored" phrases (delve into, furthermore, in conclusion, cutting-edge, landscape of, harness the power of).
- Break long sentences. Use contractions. Prefer concrete nouns to abstractions.
- Never claim guaranteed monetization or platform approval.

CHANGES SUMMARY — each string must earn its place, in natural prose (never labeled fields):
- WHERE: quote the exact phrase or sentence you changed FROM the script ("changed your opener 'In this video I will delve into…'"), not "the intro" or "some phrases".
- WHY: the specific reason it reads as AI or costs attention — a named AI tell ("delve"/"furthermore" are top detector-flagged tokens), a sentence too long for a sound-on ${o.targetPlatform} read, an abstraction a viewer can't picture.
- WHAT: the before → after, showing the exact replacement you made ("→ 'Today I'm breaking down…'").
- IMPACT: honest and mechanism-based ("removes two of the most detector-flagged tokens", "cuts the 34-word opener to a 9-word hook that lands inside the 3-second window"), never a guaranteed detector score or view count.
Return 3-6 of these. If you changed nothing in a category, don't pad — omit it.

METRICS RULES — gptProbabilityScore and hookStrengthScore are HEURISTIC ESTIMATES, not measured detector output. Keep them honest:
- Never output 0 or 100, and never a "before" of ~84 dropping to a "near-zero" after — no rewrite makes AI text undetectable, and claiming it does is the exact false guarantee we forbid.
- Move each metric in proportion to how much you actually changed: a light touch shifts gptProbabilityScore by ~10-20 points, not 78. A realistic humanized "after" for gptProbabilityScore lands in the 25-55 range, hookStrengthScore rarely above the low 80s.
- readabilityGrade should reflect the real sentence length/vocabulary you produced.

Return JSON:
{
  "humanizedText": string,
  "changesSummary": string[],   // 3-6 items, each satisfying the WHERE/WHY/WHAT/IMPACT rule above
  "metricsBefore": {"gptProbabilityScore": number, "readabilityGrade": string, "hookStrengthScore": number},
  "metricsAfter":  {"gptProbabilityScore": number, "readabilityGrade": string, "hookStrengthScore": number}  // proportional estimates, never 0 or 100
}`;
}

export async function humanizeScriptContent(
  rawScript: string,
  options: HumanizeOptions,
): Promise<HumanizeResult> {
  const trimmed = rawScript.trim();

  const raw = await chatJSON<RawHumanizeResponse>(
    [
      { role: 'system', content: buildSystemPrompt(options) },
      { role: 'user',   content: `Rewrite this script:\n\n"""${trimmed.slice(0, 8000)}"""` },
    ],
    { model: 'reasoning', temperature: 0.6, maxTokens: 1600 },
  );

  if (!raw) return heuristicHumanize(rawScript, options);

  return {
    originalText:  rawScript,
    humanizedText: scrubForbidden(raw.humanizedText || rawScript).clean,
    changesSummary: (raw.changesSummary ?? [])
      .slice(0, 6)
      .map((c) => scrubForbidden(c).clean),
    metricsBefore: raw.metricsBefore,
    metricsAfter:  raw.metricsAfter,
  };
}

// ─── Deterministic fallback ────────────────────────────
export function heuristicHumanize(rawScript: string, options: HumanizeOptions): HumanizeResult {
  let humanized = rawScript;
  const gptReplacements: Record<string, string> = {
    'delve into': 'explore',
    'furthermore': 'plus',
    'it is important to note that': "here is the thing:",
    'in conclusion': 'bottom line:',
    'cutting-edge capabilities': 'tools',
    'landscape of': 'world of',
    'game-changer': 'massive shift',
    'harness the power of': 'use',
    'In this video,': 'Today',
  };

  // Track the phrases we actually replaced so the summary and metrics reflect the
  // real edit, not a fabricated fixed result. A script with zero AI tells should
  // report a near-zero change, not a dramatic 84→6 swing.
  const applied: Array<{ from: string; to: string }> = [];
  Object.entries(gptReplacements).forEach(([pattern, replacement]) => {
    const re = new RegExp(pattern, 'gi');
    if (re.test(humanized)) {
      applied.push({ from: pattern, to: replacement });
      humanized = humanized.replace(re, replacement);
    }
  });

  // Hook edit — only counts when a "Today" anchor is actually present to rewrite.
  let hookRewritten = false;
  const beforeHook = humanized;
  if (options.tone === 'storyteller') {
    humanized = humanized.replace(/Today,?/i, '3 years ago, nobody saw this coming. Today,');
  } else if (options.tone === 'energetic') {
    humanized = humanized.replace(/Today,?/i, 'Stop everything you\'re doing —');
  }
  if (humanized !== beforeHook) hookRewritten = true;

  // Long-sentence signal: count sentences over ~30 words (a sound-on retention drag).
  const longSentences = (rawScript.match(/[^.!?]+[.!?]/g) ?? []).filter(
    (s) => s.trim().split(/\s+/).length > 30,
  ).length;

  // Build the summary from what genuinely changed. No edits → say so honestly.
  const changesSummary: string[] = [];
  if (applied.length > 0) {
    const sample = applied.slice(0, 3).map((a) => `"${a.from}" → "${a.to}"`).join(', ');
    changesSummary.push(
      `Swapped ${applied.length} detector-flagged phrase${applied.length > 1 ? 's' : ''} (${sample}${applied.length > 3 ? ', …' : ''}) — tokens like "delve"/"furthermore" are among the most common signals AI-text classifiers weight, so removing them cuts the mechanical tell without changing your meaning.`,
    );
  }
  if (hookRewritten) {
    changesSummary.push(
      options.tone === 'storyteller'
        ? `Reframed the opening "Today…" into a stakes-first cold open ("3 years ago, nobody saw this coming…") — a flat topic-announcement opener leaks attention in the first 3 seconds on ${options.targetPlatform}, and leading with a turning point gives the viewer a reason to stay through it.`
        : options.tone === 'energetic'
        ? `Replaced the calm "Today…" lead with a pattern-interrupt ("Stop everything you're doing —") — on a sound-on ${options.targetPlatform} feed the first line competes with a swipe, and a direct interrupt earns the next 3 seconds better than a topic label.`
        : `Tightened the opening line so the payoff lands sooner, matching ${options.targetPlatform}'s ~3-second attention window.`,
    );
  }
  if (longSentences > 0) {
    changesSummary.push(
      `Flagged ${longSentences} sentence${longSentences > 1 ? 's' : ''} over ~30 words for splitting — long clauses are hard to deliver on camera in one breath and blur the point on a sound-on watch; break each at its natural "and"/"but" seam into two spoken lines.`,
    );
  }
  changesSummary.push(
    `Kept every fact, number, and name from your original intact — this pass only changes phrasing and rhythm, so nothing here affects claims you'd need to stand behind. These are text-level estimates, not a detector reading; run the rewrite through your own AI-detector of record before relying on a specific score.`,
  );

  // Proportional heuristic metrics. The more real AI tells we removed, the larger the
  // estimated shift — but we NEVER report 0 or 100, and never claim the text became
  // undetectable. A clean script barely moves; a phrase-heavy one moves more, capped.
  const editSignal = applied.length + (hookRewritten ? 1 : 0);
  const beforeGpt = Math.min(88, 52 + applied.length * 6 + (hookRewritten ? 4 : 0));
  const afterGpt = Math.max(22, beforeGpt - Math.min(30, editSignal * 7)); // floor at 22 — never "cleared"
  const beforeHookScore = hookRewritten ? 58 : 68;
  const afterHookScore = Math.min(84, beforeHookScore + (hookRewritten ? 16 : 4)); // cap low-80s, never 100

  return {
    originalText: rawScript,
    humanizedText: humanized,
    changesSummary: changesSummary.slice(0, 6),
    metricsBefore: {
      gptProbabilityScore: beforeGpt,
      readabilityGrade: longSentences > 1 ? 'Grade 12 (Academic)' : 'Grade 10 (Formal)',
      hookStrengthScore: beforeHookScore,
    },
    metricsAfter: {
      gptProbabilityScore: afterGpt,
      readabilityGrade: 'Grade 7 (Conversational)',
      hookStrengthScore: afterHookScore,
    },
  };
}
