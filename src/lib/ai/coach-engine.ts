/**
 * AI Coach engine, backed by NVIDIA NIM.
 *
 * A conversational growth-strategy coach for creators. Uses the same trust
 * preamble as every other engine so replies never guarantee outcomes, and
 * scrubs absolute claims before they reach the user.
 *
 * The model returns null when unavailable (no key, transient failure, timeout);
 * the route falls back to deterministic canned answers so the chat always works.
 */

import { chat } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, fenceSafe } from './guardrails';

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

const COACH_PERSONA = `${TRUST_SYSTEM_PREAMBLE}

You are the AI Coach for Publish — a growth-strategy coach for video creators.

Answer the creator's question about hooks, retention, titles, thumbnails, script
pacing, monetization risk, or platform policy.

Rules:
- Answer the specific question asked. Ask for the missing context only when the
  question cannot be answered at all without it — otherwise give the best
  concrete answer you can and note the one input that would sharpen it.
- Give actionable, copy-paste-ready guidance: name the exact fix, the mechanism,
  and a realistic expected effect labeled as an estimate.
- Never guarantee monetization, views, or platform approval.
- Use plain language a working creator can act on in five minutes.
- Keep answers under 180 words. Use at most one short bulleted list.`;

/**
 * Cross-report context: the coach's longitudinal memory. Derived from the
 * creator's recent reports server-side and passed in alongside (or instead of)
 * a single report's context — this is what turns "advice about this video"
 * into "advice about this creator", which is the retention story for a coach
 * product. Every field is optional so a first-time user (no history) and a
 * long-time user (rich history) both get an honest, correctly-sized context.
 */
export interface CoachHistoryContext {
  /** Reviews analysed so far, capped by the caller. */
  reviewCount: number;
  /** The trend across those reviews' overall scores. */
  scoreTrend: 'improving' | 'flat' | 'declining';
  /** Layer names that scored weakest across the history, strongest first. */
  recurringWeaknesses: string[];
  /** When present: the question is grounded in one of these reports. */
  selectedReportTitle?: string;
}

/**
 * Grounds the coach in a creator's actual report (scores + top fixes) instead
 * of generic advice. Deliberately a compact summary — the full report would
 * bloat the prompt and the coach is meant to advise, not re-analyze.
 */
function reportContextBlock(ctx: {
  title: string;
  platform: string;
  overall: number;
  scores: Record<string, number>;
  topFixes: string[];
}): string {
  const scores = Object.entries(ctx.scores)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const fixes = ctx.topFixes.length
    ? ctx.topFixes.slice(0, 4).map((f) => `- ${f}`).join('\n')
    : '- (no fixes listed on this report)'; // cannot happen in practice; defensive
  return `\nThe creator is asking about a REAL report they just received:\n` +
    `Title: """${fenceSafe(ctx.title.slice(0, 120))}""" (${ctx.platform})\n` +
    `Overall: ${ctx.overall}/100. Layer scores: ${scores}.\n` +
    `Their top fixes:\n${fixes}\n` +
    `When your advice touches one of these layers, reference the report's actual number or fix ` +
    `explicitly ("Your Retention at 54 is dragged by…") rather than speaking in generalities. ` +
    `If they ask something unrelated to the report, answer normally.`;
}

/**
 * The longitudinal block: what the creator's own history shows. Written in the
 * same voice as the report block so the two compose without style clash, and
 * phrased as observed data (counts, trends, names) — never a diagnosis the
 * numbers do not support.
 */
function historyContextBlock(ctx: CoachHistoryContext): string {
  const parts: string[] = [
    `\nAcross the creator's last ${ctx.reviewCount} reviews, their overall scores are ${ctx.scoreTrend}.`,
  ];
  if (ctx.recurringWeaknesses.length > 0) {
    parts.push(
      `Their weakest layers across those reviews (worst first): ${ctx.recurringWeaknesses.join(', ')}. ` +
      `When they ask what to fix, prefer advice that moves these recurring weaknesses — a fix ` +
      `that helps the same weakness twice is worth more than a one-off. Name the pattern when ` +
      `relevant ("this is the same weak-open pattern your last reviews showed"), because the ` +
      `creator cannot see these history blocks.`,
    );
  }
  if (ctx.selectedReportTitle) {
    parts.push(`They are currently asking about their report "${fenceSafe(ctx.selectedReportTitle.slice(0, 80))}".`);
  }
  return parts.join(' ');
}

export async function getCoachReply(
  message: string,
  history: CoachMessage[],
  reportContext?: {
    title: string;
    platform: string;
    overall: number;
    scores: Record<string, number>;
    topFixes: string[];
  } | null,
  historyContext?: CoachHistoryContext | null,
): Promise<string | null> {
  let system = COACH_PERSONA;
  if (reportContext) system += reportContextBlock(reportContext);
  if (historyContext && historyContext.reviewCount > 0) system += historyContextBlock(historyContext);
  const messages = [
    { role: 'system' as const, content: system },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  const raw = await chat(messages, {
    model: 'reasoning',
    temperature: 0.7,
    maxTokens: 500,
    timeoutMs: 45_000,
  });
  if (!raw) return null;

  const cleaned = raw.trim();
  if (!cleaned) return null;
  return scrubForbidden(cleaned).clean;
}
