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
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden } from './guardrails';

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

export async function getCoachReply(
  message: string,
  history: CoachMessage[],
): Promise<string | null> {
  const messages = [
    { role: 'system' as const, content: COACH_PERSONA },
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
