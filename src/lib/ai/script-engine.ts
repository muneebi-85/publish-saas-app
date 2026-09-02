/**
 * Script analyzer, backed by NVIDIA NIM.
 *
 * Given raw script text, returns detected issues with rewrites. When the model
 * is unreachable it falls back to `heuristicScriptAnalysis()`, which pattern-
 * matches the creator's own text for the same issue classes so the review still
 * returns something actionable instead of failing.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, fenceSafe } from './guardrails';
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
    reasoning?: string;
    estimated_metric_impact?: string;
  }[];
}

export interface ScriptAnalysisResult {
  gptProbability: number;
  storytellingArc: string;
  issues: ScriptIssue[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

ROLE
You are Publish's script-review engine. You review video scripts BEFORE publish and catch four
classes of problem, in strict priority order:

  1. POLICY RISK — anything that risks demonetization, age restriction, or removal.
  2. AUTHENTICITY RISK — anything that reads AI-generated to a human viewer.
  3. VIRALITY / RETENTION RISK — anything that kills the hook, pacing, or payoff.
  4. MONETIZATION LEVERAGE — anything that would materially raise CPM or retention.

You are grounded in real, current platform policy (YouTube Advertiser-Friendly Content Guidelines,
YouTube 2026 synthetic-content disclosure, TikTok Community Guidelines, Meta Content Monetization
Policies, LinkedIn Professional Community Policies). You do NOT fabricate policy names or rule
numbers. When uncertain about a policy, set reviewSeverity="warning", not "critical".

HONESTY CONTRACT (violating any of these makes the output worthless)
  • You NEVER promise revenue, views, or monetization outcomes. Platforms decide.
  • You NEVER invent a measured number about THIS creator's video. You have the script text and
    nothing else — no analytics, no retention curve, no CTR. Any figure you state must be either
    (a) a published platform rule ("the first 3–5s window"), or (b) an explicit illustrative
    RANGE clearly framed as typical/mechanistic, never a point estimate presented as this video's
    result. Prefer naming the mechanism over any number.
  • When impact depends on data you don't have, say so plainly and say what connecting a data
    source would unlock — phrased as a strategist, e.g. "the recoverable amount depends on your
    current opening-retention curve, which isn't measured here."

BANNED — GENERIC ADVICE BLOCKLIST (before emitting any string, reject and rewrite it if it
matches any of these; each is an automatic failure)
  • "improve/optimize your thumbnail/title", "make it more engaging/compelling", "add value",
    "be more authentic", "sound more human", "this hook is weak", "hook them faster" — any advice
    that does not name the exact word/line/element, the exact reason, and the exact replacement.
  • Any replacement opener that is itself throat-clearing filler ("Today we're looking at…",
    "In this video…", "So basically…").
  • Any fabricated statistic used as flavour ("90% of creators…", "studies show…") unless it is a
    real, citable platform rule.
  • Any guarantee or absolute ("will get you", "guaranteed", "100% safe", "definitely monetized").

EVERY ISSUE'S suggestion + reasoning + estimated_metric_impact MUST, between them, deliver all of:
  - EXACTLY WHERE: the precise element — the verbatim offending words, the line number, or a
    timestamp/window (e.g. "the phrase 'delve into' on line 4", "the first 3 seconds").
  - EXACTLY WHY: the mechanism plus the specific platform behaviour/rule it triggers.
  - EXACTLY WHAT: a copy-paste-ready rewrite the creator can accept as-is, shown as a
    before → after pair whenever a rewrite is involved.
  - HONEST IMPACT: a mechanism or an explicit typical RANGE with a caveat — never a guarantee,
    never a point estimate dressed as this video's measured result.
No preamble, no "consider", no "you might want to", no hedging inside the imperative fix.

EXAMPLES OF BAD VS. GOOD
  BAD:  "This hook is weak." / "Make it sound more human."
  GOOD (rewrite): before "Let's delve into email onboarding" → after "Your welcome email is where
        most subscribers quit."
  GOOD (impact, honest): "Removes a documented AI-writing fingerprint; the first-30s retention
        delta isn't measured here — connect Analytics to quantify it."

WHAT TO LOOK FOR (choose the highest-severity 6)

A. POLICY (highest priority)
  • Strong profanity within first 7 seconds (YouTube Advertiser-Friendly: opening-section
    profanity limits ad suitability).
  • Sensitive-claim domains without disclaimers: medical, financial, legal, political
    (medical/financial advice needs explicit "not medical/financial advice" language).
  • AI-generated content without disclosure — flag when the script reads as clearly AI output
    (dense "delve/landscape/furthermore", tri-colon lists, zero personal anecdotes). YouTube 2026
    synthetic-content disclosure and EU AI Act Article 50 apply.
  • Sensationalized health/injury/violence framing that trips brand-safety filters.
  • Absolute earnings/get-rich claims ("I made $X in Y days") in the opening — high demonetization
    risk on YouTube and LinkedIn.

B. AUTHENTICITY / AI-FINGERPRINT
  • Corporate GPT connectors: "delve into", "landscape of", "it is important to note",
    "furthermore", "cutting-edge", "in today's fast-paced world", "let's explore".
  • Over-uniform sentence length; abstract nouns stacked with no concrete example or number;
    transition-word overuse; passive voice where an active verb carries more energy.

C. VIRALITY / HOOK / RETENTION
  • Weak opener (first 2 sentences establish no stakes, curiosity, or specificity). Score the hook
    on specificity (0-10), curiosity gap (0-10), stakes (0-10), pattern interrupt (0-10); if
    SUM < 20 flag critical for TikTok/Instagram (both hard-punish slow opens within ~3s).
  • Buried payoff (main takeaway after 30% of the script); missing pattern interrupts every
    ~30-45s on long-form; generic CTA; repetition of a claim with no new information.

D. MONETIZATION LEVERAGE
  • Missing "value stack" moment; missing timestamped chapters in scripts >5 min (YouTube
    long-form CPM/retention lift); weak retention loop between sections.

FOR EACH ISSUE RETURN:
  - type: "gpt-phrase" | "repetition" | "weak-hook" | "weak-cta"
  - severity: "high" | "medium" | "low"
  - reviewSeverity: "critical" | "warning" | "info"
  - text: offending excerpt, max 180 chars, verbatim from the script
  - suggestion: an actual copy-paste rewrite (a before → after where applicable), not a description
    of what to do
  - specific_fix: one imperative sentence naming exactly what to change (no hedging)
  - platform_specific: platforms materially affected, from
    ["YouTube","TikTok","Instagram","Facebook","LinkedIn"]; all five when universal, narrowed when
    one platform specifically punishes it
  - viralityImpact: "boost" | "neutral" | "suppress" — effect of FIXING this issue
  - monetizationImpact: "none" | "demoted" | "demonetized" — worst case if left as-is
  - line: 1-indexed source line
  - reasoning: one sentence — the mechanism plus the specific platform rule/behaviour it triggers
  - estimated_metric_impact: an HONEST outcome — the mechanism, or a typical range with a caveat,
    or an explicit "unmeasured; connect a data source to quantify". NEVER a revenue/view promise,
    NEVER a point estimate presented as this video's measured result.

ALSO RETURN:
  - gptProbability: 0-100, honest estimate this script was AI-written (goal is authentic shipping,
    not flattery)
  - storytellingArc: one short phrase for the structure (e.g. "Problem → payoff", "Curiosity loop",
    "Slow open", "List with weak ending")

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
    "line": number,
    "reasoning": string,
    "estimated_metric_impact": string
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
      { role: 'user', content: `Script:\n\n"""${fenceSafe(trimmed.slice(0, 8000))}"""` },
    ],
    { model: 'reasoning', temperature: 0.3, maxTokens: 1400 },
  );

  if (!raw) return heuristicScriptAnalysis(trimmed);

  const issues: ScriptIssue[] = (raw.issues ?? [])
    .slice(0, 6)
    .map((it, i) => ({
      id: `s-${i + 1}`,
      type: normalizeIssueType(it.type),
      severity: normalizeIssueSeverity(it.severity),
      reviewSeverity: normalizeReviewSeverity(it.reviewSeverity),
      text: scrubForbidden(it.text ?? '').clean,
      suggestion: scrubForbidden(it.suggestion ?? '').clean,
      specific_fix: it.specific_fix ? scrubForbidden(it.specific_fix).clean : undefined,
      platform_specific: normalizePlatforms(it.platform_specific),
      viralityImpact: normalizeViralityImpact(it.viralityImpact),
      monetizationImpact: normalizeMonetizationImpact(it.monetizationImpact),
      line: Math.max(1, Math.round(Number(it.line) || 1)),
      reasoning: it.reasoning ? scrubForbidden(it.reasoning).clean : undefined,
      estimatedMetricImpact: it.estimated_metric_impact ? scrubForbidden(it.estimated_metric_impact).clean : undefined,
    }));

  return {
    gptProbability: Math.max(0, Math.min(100, Math.round(Number(raw.gptProbability) || 0))),
    storytellingArc: scrubForbidden(raw.storytellingArc ?? 'Structure detected').clean,
    issues,
  };
}

// ─── Enum normalization for LLM output ─────────────────
// `ScriptIssue` declares string-literal unions. A model that returns
// "critical" for severity or "Demonetized" for monetizationImpact would store
// rows violating that contract — and the strict `===` comparisons in the
// orchestrator (blockingCount/highCount) would silently miss them, deflating
// the safety-critical counts. Unknown values default to the conservative
// option, mirroring normalizeRisk in the other engines.
function normalizeIssueType(v: unknown): ScriptIssue['type'] {
  return v === 'gpt-phrase' || v === 'repetition' || v === 'weak-hook' || v === 'weak-cta'
    ? v
    : 'gpt-phrase';
}

function normalizeIssueSeverity(v: unknown): ScriptIssue['severity'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
}

function normalizeReviewSeverity(v: unknown): ScriptIssue['reviewSeverity'] {
  if (v === 'critical' || v === 'warning' || v === 'info') return v;
  // An unparseable review severity is treated as the more serious band, never
  // dropped: a lost "critical" is the failure this guard exists to prevent.
  return 'warning';
}

type PlatformNameLiterals = NonNullable<ScriptIssue['platform_specific']>[number];

function normalizePlatforms(v: unknown): ScriptIssue['platform_specific'] {
  const KNOWN: readonly PlatformNameLiterals[] = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'];
  if (!Array.isArray(v)) return undefined;
  const kept = KNOWN.filter((p) => (v as unknown[]).includes(p));
  return kept.length ? kept : undefined;
}

function normalizeViralityImpact(v: unknown): ScriptIssue['viralityImpact'] {
  return v === 'boost' || v === 'neutral' || v === 'suppress' ? v : 'neutral';
}

function normalizeMonetizationImpact(v: unknown): ScriptIssue['monetizationImpact'] {
  const lower = typeof v === 'string' ? v.toLowerCase() : '';
  if (lower === 'demonetized' || lower === 'demoted' || lower === 'none') return lower;
  // Unknown impact read as "demoted": worse than the safe "none", not as bad
  // as a full demonetization we cannot confirm.
  return 'demoted';
}

// ─── Deterministic fallback ────────────────────────────
export function heuristicScriptAnalysis(script: string): ScriptAnalysisResult {
  // Each pattern quotes the actual offending text from the script (not a generic
  // label) and describes a MECHANISM rather than an invented percentage. We never
  // promise "+15% engagement" from a regex match we can't measure.
  const patterns: {
    re: RegExp;
    build: (match: string) => Omit<ScriptIssue, 'id' | 'line'>;
  }[] = [
    {
      re: /delve into|landscape of|it is important to note|furthermore|cutting-edge/i,
      build: (match) => ({
        type: 'gpt-phrase',
        severity: 'medium',
        reviewSeverity: 'warning',
        text: `"${match}"`,
        suggestion:
          "Cut the flagged connector ('delve into' / 'furthermore' / 'landscape of') and open mid-thought on the concrete subject: rewrite 'Let\\'s delve into email onboarding' → 'Your welcome email is where most subscribers quit.'",
        viralityImpact: 'boost',
        monetizationImpact: 'none',
        reasoning:
          "These connectors are the highest-frequency lexical AI tells; viewers who register 'generated copy' in the opening lines disengage before the payoff, and YouTube's 2026 synthetic-content signals key on the same markers.",
        estimatedMetricImpact:
          "Removes a documented AI-writing fingerprint and raises perceived authenticity; the actual first-30s retention delta isn't measured here — connect Analytics to quantify it. No view or revenue outcome is implied.",
      }),
    },
    {
      re: /like and subscribe|smash the like/i,
      build: (match) => ({
        type: 'weak-cta',
        severity: 'low',
        reviewSeverity: 'info',
        text: `"${match}"`,
        suggestion:
          "Swap the generic 'like and subscribe' at this line for one low-effort, answerable question tied to the topic: 'Which of these three would you try first — 1, 2, or 3?' A numbered choice drops the reply cost to a single digit; don't promise follow-up you won't deliver.",
        viralityImpact: 'boost',
        monetizationImpact: 'none',
        reasoning:
          'A blanket like/subscribe ask gives viewers no reason to act, while a specific one-tap question converts passive watchers into commenters — early comments are one input YouTube and TikTok appear to use when deciding whether to keep distributing, though the exact weighting isn\'t public.',
        estimatedMetricImpact:
          "Mechanism: turns a zero-friction ask into a one-tap reply prompt that can raise comment rate; the magnitude is unknowable without your channel's baseline comments-per-view (connect Analytics to measure it).",
      }),
    },
    {
      re: /^\s*In this video/i,
      build: (match) => ({
        type: 'weak-hook',
        severity: 'high',
        reviewSeverity: 'warning',
        text: `"${match.trim()}"`,
        suggestion:
          "Delete the 'In this video…' throat-clear on this line and lead with the sharpest stake already in your script: rewrite 'In this video I\\'ll show you my morning routine' → 'The one morning habit I dropped that fixed my whole day.'",
        viralityImpact: 'boost',
        monetizationImpact: 'demoted',
        reasoning:
          'Throat-clearing openers push the payoff past the first 3–5 seconds — the window where TikTok and YouTube Shorts decide whether to keep serving the video — so a slow open forfeits reach before the content is even judged.',
        estimatedMetricImpact:
          "Mechanism: moving the payoff into the first 3–5s reduces early drop-off; the recoverable amount depends on your current opening-retention curve, which isn't measured here — connect Analytics to see it. Not a views guarantee.",
      }),
    },
  ];

  const issues: ScriptIssue[] = [];
  const lines = script.split(/\n/);
  patterns.forEach((p, idx) => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(p.re);
      if (m) {
        issues.push({ id: `s-${idx + 1}`, ...p.build(m[0]), line: i + 1 });
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
