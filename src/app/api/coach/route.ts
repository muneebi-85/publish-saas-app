/**
 * POST /api/coach — ask the AI Coach a question.
 *
 * Gated exactly like the other creator AI tools: requires a paid plan
 * (server-side, DB-derived), rate-limited per user, body size-capped, and the
 * model reply is scrubbed for absolute claims. When the model is unavailable
 * the route degrades to deterministic canned answers, so the chat never breaks
 * on a bare deploy.
 */

import { NextResponse } from 'next/server';
import { getCoachReply, CoachMessage } from '@/lib/ai/coach-engine';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requirePaidPlan } from '@/lib/api-guards';

export const runtime = 'nodejs';
export const maxDuration = 50;

const MAX_HISTORY = 20;

/** Deterministic fallback — mirrors the keyword replies the chat used before
 *  the API existed, so behavior is unchanged when the model is unreachable. */
function cannedReply(input: string): string {
  const text = input.toLowerCase();
  if (text.includes('hook')) {
    return 'The first 3-5 seconds decide whether a viewer stays. Lead with the boldest outcome or the most surprising moment, cut any greeting from the first 10 seconds, and open a loop: hint at a payoff the viewer has to keep watching for. A sharper hook commonly improves early retention by 5-10 points (estimated) — A/B test it against your current open.';
  }
  if (text.includes('title')) {
    return 'Try these title angles on your topic: the bold result ("What 30 Days of ___ Actually Did"), the contrarian take ("Everyone\'s Wrong About ___"), the specific number ("7 ___ Mistakes Costing You Views"), the open loop ("I Tried ___ So You Don\'t Have To"), or the transformation ("How I Went From ___ to ___"). Curiosity- and outcome-led titles tend to lift CTR by a few points (estimated) — keep the thumbnail honest to the title.';
  }
  if (text.includes('retention') || text.includes('drop')) {
    return 'Drop-offs usually cluster at three points: a slow intro, a mid-video lull, or an unearned tangent. Check your retention graph for the first big cliff and rewatch that exact moment. Tighten pacing — remove pauses and setup that delays the payoff — and add a pattern interrupt (b-roll, a cut, a question) every 20-30 seconds. Fixing the first cliff usually recovers the most watch time (estimated).';
  }
  if (text.includes('human') || text.includes('script')) {
    return 'AI-flavored scripts over-use transitions ("furthermore", "in conclusion") and uniform sentence length. Read it out loud and rewrite anything you would never actually say, vary sentence length, and add a personal detail only you could give. The Script Optimizer tool can do a first pass for you.';
  }
  return 'Start from the viewer\'s promise — what did the title lead them to expect? Deliver on that promise sooner and more clearly than you think you need to, and cut anything that doesn\'t move the story or payoff forward. Tell me your topic, title, or paste a script section and I\'ll give you specific notes. Any numbers I share are best-practice estimates, not guarantees.';
}

export async function POST(req: Request) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'coach'),
    LIMITS.COACH.limit,
    LIMITS.COACH.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const parsed = await v.jsonBody(req, { maxBytes: 12_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const message = v.string(parsed.value.message, { min: 1, max: 2000, field: 'message' });
  if (!message.ok) return NextResponse.json({ error: message.error }, { status: 400 });

  // History is advisory context only — never trusted for identity or quota.
  let history: CoachMessage[] = [];
  if (Array.isArray(parsed.value.history)) {
    history = parsed.value.history
      .slice(-MAX_HISTORY)
      .map((m: unknown) => {
        const rec = (m ?? {}) as Record<string, unknown>;
        if (rec.role !== 'user' && rec.role !== 'assistant') return null;
        const content = v.string(rec.content, { min: 1, max: 2000, field: 'history.content' });
        return content.ok ? { role: rec.role as CoachMessage['role'], content: content.value } : null;
      })
      .filter((m: unknown): m is CoachMessage => m !== null);
  }

  try {
    const reply = (await getCoachReply(message.value, history)) ?? cannedReply(message.value);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[POST /api/coach] error:', err);
    // Even a total failure answers — the canned reply is honest, branded
    // guidance and keeps the chat usable.
    return NextResponse.json({ reply: cannedReply(message.value) });
  }
}
