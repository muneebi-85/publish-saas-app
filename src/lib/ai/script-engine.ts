/**
 * Real script analyzer, backed by NVIDIA NIM.
 *
 * Given raw script text, returns detected issues with rewrites. Falls back to a
 * deterministic mock if no NVIDIA key is configured — this keeps `next dev`
 * runnable during onboarding without any keys.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden } from './guardrails';
import { ScriptIssue } from '../types';

type IssueSeverity = 'critical' | 'warning' | 'info';
type AffectedPlatform = 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';

interface RawScriptResponse {
  gptProbability: number;   // 0..100
  storytellingArc: string;
  issues: {
    type: 'gpt-phrase' | 'repetition' | 'weak-hook' | 'weak-cta';
    severity: 'high' | 'medium' | 'low';
    reviewSeverity?: IssueSeverity;
    text: string;
    suggestion: string;
    specific_fix?: string;
    platform_specific?: AffectedPlatform[];
    viralityImpact?: 'boost' | 'neutral' | 'suppress';
    monetizationImpact?: 'none' | 'demoted' | 'demonetized';
    line: number;
  }[];
}

export interface ScriptAnalysisResult {
  gptProbability: number;
  storytellingArc: string;
  issues: ScriptIssue[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

ROLE
You are Publish's script-review engine. You review video scripts BEFORE publish to catch four
classes of problem, in strict priority order:

  1. POLICY RISK — anything that risks demonetization, age restriction, or removal.
  2. AUTHENTICITY RISK — anything that reads AI-generated to a human viewer.
  3. VIRALITY / RETENTION RISK — anything that will kill the hook, pacing, or payoff.
  4. MONETIZATION LEVERAGE — anything that would materially raise CPM or retention.

You are grounded in real platform policy (YouTube Ad-Friendly Content, TikTok Community
Guidelines, Meta Monetization Eligibility, LinkedIn Professional Community Policies). You do
NOT fabricate policy names or rule numbers. When uncertain, mark reviewSeverity="warning"
rather than "critical".

You NEVER promise revenue, view counts, or guaranteed monetization outcomes. You describe
mechanisms ("opens with generic hook → 5s retention typically drops below 30%") not results
("this will get you 1M views").

WHAT TO LOOK FOR (choose the highest-severity 6)

A. POLICY (highest priority)
  • Profanity within first 7 seconds (YouTube Ad-Friendly: strong profanity in the opening
    section limits ad suitability).
  • Sensitive-claim domains without disclaimers: medical, financial, legal, political.
    Medical/financial advice needs "not medical/financial advice" language.
  • AI-generated content without disclosure — flag when the script reads as clearly AI
    output (dense with "delve", "landscape", "furthermore", tri-colon lists, no personal
    anecdotes). YouTube 2026 synthetic-content rules and EU AI Act Article 50 apply.
  • Sensationalized health/injury/violence framing that trips brand-safety filters.
  • Absolute earnings/get-rich claims ("I made $X in Y days") in the first line — high
    demonetization risk on YouTube and LinkedIn.

B. AUTHENTICITY / AI-FINGERPRINT
  • Corporate GPT phrasing: "delve into", "landscape of", "it is important to note",
    "furthermore", "cutting-edge", "in today's fast-paced world", "let's explore".
  • Over-uniform sentence length (a real human varies rhythm).
  • Abstract nouns stacked without concrete example or number.
  • Transition-word overuse ("furthermore", "moreover", "additionally", "in conclusion").
  • Passive voice where an active verb would carry more energy.

C. VIRALITY / HOOK / RETENTION
  • Weak opener (first 2 sentences do not establish stakes, curiosity, or specificity).
    Score the hook on: specificity (0-10), curiosity gap (0-10), stakes (0-10), pattern
    interrupt (0-10). If SUM < 20, flag as critical for TikTok/Instagram (both hard-punish
    slow openers within 3 seconds).
  • Buried payoff (main takeaway announced after 30% of script).
  • Missing pattern interrupts every ~30-45 seconds on long-form.
  • Weak or generic CTA ("smash the like button", "don't forget to subscribe").
  • Repetition of the same claim without new information.

D. MONETIZATION LEVERAGE
  • Missing "value stack" moment (viewer sees why staying is worth it).
  • Missing timestamped chapters in scripts >5 minutes (YouTube long-form CPM lift).
  • Weak retention loop between sections.

FOR EACH ISSUE RETURN:
  - type: "gpt-phrase" | "repetition" | "weak-hook" | "weak-cta"
  - severity: "high" | "medium" | "low"
  - reviewSeverity: "critical" | "warning" | "info"
  - text: offending excerpt, max 180 chars, verbatim from the script
  - suggestion: a concrete rewrite the creator can accept as-is (not a description of what
    to do — an actual rewrite)
  - specific_fix: single imperative sentence describing exactly what to change
    (imperative voice, no hedging, no "consider", no "you might want to")
  - platform_specific: platforms materially affected, from
    ["YouTube","TikTok","Instagram","Facebook","LinkedIn"]. Use all five when universal;
    narrow when a platform specifically punishes it.
  - viralityImpact: "boost" | "neutral" | "suppress" — how fixing THIS issue will affect
    virality
  - monetizationImpact: "none" | "demoted" | "demonetized" — worst case if left as-is
  - line: 1-indexed source line

ALSO RETURN:
  - gptProbability: 0-100, your best estimate this script was AI-written (be honest;
    the goal is to help the creator ship authentic content, not to flatter them)
  - storytellingArc: one short phrase describing the structure (e.g. "Problem → payoff",
    "Curiosity loop", "Slow open", "List with weak ending")

Return valid JSON of shape:
{
  "gptProbability": number,
  "storytellingArc": string,
  "issues": [{
    "type": "gpt-phrase" | "repetition" | "weak-hook" | "weak-cta",
    "severity": "high" | "medium" | "low",
    "reviewSeverity": "critical" | "warning" | "info",
    "text": string,
    "suggestion": string,
    "specific_fix": string,
    "platform_specific": ("YouTube"|"TikTok"|"Instagram"|"Facebook"|"LinkedIn")[],
    "viralityImpact": "boost" | "neutral" | "suppress",
    "monetizationImpact": "none" | "demoted" | "demonetized",
    "line": number
  }]
}`;

export async function analyzeScript(scriptText: string): Promise<ScriptAnalysisResult> {
  const trimmed = scriptText.trim();
  if (!trimmed) {
    return { gptProbability: 0, storytellingArc: 'No script provided', issues: [] };
  }

  const raw = await chatJSON<RawScriptResponse>(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Script:\n\n"""${trimmed.slice(0, 8000)}"""` },
    ],
    { model: 'reasoning', temperature: 0.3, maxTokens: 1400 },
  );

  if (!raw) return mockScriptAnalysis(trimmed);

  const issues: ScriptIssue[] = (raw.issues ?? [])
    .slice(0, 6)
    .map((it, i) => ({
      id: `s-${i + 1}`,
      type: it.type,
      severity: it.severity,
      reviewSeverity: it.reviewSeverity,
      text: scrubForbidden(it.text ?? '').clean,
      suggestion: scrubForbidden(it.suggestion ?? '').clean,
      specific_fix: it.specific_fix ? scrubForbidden(it.specific_fix).clean : undefined,
      platform_specific: it.platform_specific,
      viralityImpact: it.viralityImpact,
      monetizationImpact: it.monetizationImpact,
      line: Math.max(1, Math.round(it.line ?? 1)),
    }));

  return {
    gptProbability: Math.max(0, Math.min(100, Math.round(raw.gptProbability ?? 0))),
    storytellingArc: scrubForbidden(raw.storytellingArc ?? 'Structure detected').clean,
    issues,
  };
}

// ─── Deterministic fallback for mock mode ──────────────
export function mockScriptAnalysis(script: string): ScriptAnalysisResult {
  const patterns: { re: RegExp; issue: Omit<ScriptIssue, 'id' | 'line'> }[] = [
    {
      re: /delve into|landscape of|it is important to note|furthermore|cutting-edge/gi,
      issue: {
        type: 'gpt-phrase',
        severity: 'medium',
        text: 'AI-flavored phrasing detected in the opening.',
        suggestion:
          'Swap corporate GPT phrases ("delve", "furthermore", "landscape") for conversational openers like "Today we\'re looking at..."',
      },
    },
    {
      re: /like and subscribe|smash the like/gi,
      issue: {
        type: 'weak-cta',
        severity: 'low',
        text: 'Generic engagement CTA present.',
        suggestion:
          'Replace with a value-driven prompt: "Drop your biggest question in the comments — I\'ll answer the top 5 next week."',
      },
    },
    {
      re: /^\s*In this video/i,
      issue: {
        type: 'weak-hook',
        severity: 'high',
        text: 'Opens with "In this video…" — signals throat-clearing.',
        suggestion:
          'Open with the payoff or the strongest tension: "3 years ago nobody saw this coming. Today…"',
      },
    },
  ];

  const issues: ScriptIssue[] = [];
  const lines = script.split(/\n/);
  patterns.forEach((p, idx) => {
    for (let i = 0; i < lines.length; i++) {
      if (p.re.test(lines[i])) {
        issues.push({ id: `s-${idx + 1}`, ...p.issue, line: i + 1 });
        break;
      }
    }
  });

  return {
    gptProbability: /delve|furthermore|landscape/i.test(script) ? 68 : 18,
    storytellingArc: issues.some((i) => i.type === 'weak-hook') ? 'Slow open' : 'Problem → payoff',
    issues,
  };
}
