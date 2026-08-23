/**
 * POST /api/coach — ask the AI Coach a question, persisted as a CoachThread.
 * GET  /api/coach — list the caller's threads (newest first).
 *
 * Thread persistence (the audit's "coach that remembers") lives here:
 *  - A `threadId` continues an existing conversation — history is re-read from
 *    the DB, not trusted from the client, and both new messages are appended.
 *  - A `reportId` (optionally with a new conversation) grounds the coach in the
 *    report's actual scores and top fixes — see coach-engine's reportContext.
 *  - No threadId/reportId starts a fresh conversation titled from the question.
 *
 * The route is gated exactly like the other creator AI tools: paid plan,
 * rate-limited per user, body size-capped, model reply scrubbed, canned
 * fallback when the model is unavailable. A failed persist must never lose the
 * reply — we return it either way and only note whether it was saved.
 */

import { NextResponse } from 'next/server';
import { getCoachReply, CoachMessage } from '@/lib/ai/coach-engine';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requirePaidPlan } from '@/lib/api-guards';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 50;

const MAX_HISTORY = 20;
/** Hard cap on persisted messages — a long-lived chat drops its oldest turns. */
const MAX_THREAD_MESSAGES = 50;
const MAX_THREAD_TITLE = 80;

interface PersistedMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Deterministic fallback — mirrors the keyword replies the chat used before
 *  the API existed, so behavior is unchanged when the model is unreachable. */
function cannedReply(input: string): string {
  const text = input.toLowerCase();
  if (text.includes('hook')) {
    return 'The first 3-5 seconds decide whether a viewer stays. Lead with the boldest outcome or the most surprising moment, cut any greeting from the first 10 seconds, and open a loop: hint at a payoff the viewer has to keep watching for. A sharper hook commonly improves early retention by 5-10 points (estimated) — A/B test it against your current open.';
  }
  if (text.includes('title')) {
    return 'Try these title angles on your topic: the bold result ("What 30 Days of ___ Actually Did"), the contrarian take ("Everyone\'s Wrong About __"), the specific number ("7 ___ Mistakes Costing You Views"), the open loop ("I Tried ___ So You Don\'t Have To"), or the transformation ("How I Went From ___ to ___"). Curiosity- and outcome-led titles tend to lift CTR by a few points (estimated) — keep the thumbnail honest to the title.';
  }
  if (text.includes('retention') || text.includes('drop')) {
    return 'Drop-offs usually cluster at three points: a slow intro, a mid-video lull, or an unearned tangent. Check your retention graph for the first big cliff and rewatch that exact moment. Tighten pacing — remove pauses and setup that delays the payoff — and add a pattern interrupt (b-roll, a cut, a question) every 20-30 seconds. Fixing the first cliff usually recovers the most watch time (estimated).';
  }
  if (text.includes('human') || text.includes('script')) {
    return 'AI-flavored scripts over-use transitions ("furthermore", "in conclusion") and uniform sentence length. Read it out loud and rewrite anything you would never actually say, vary sentence length, and add a personal detail only you could give. The Script Optimizer tool can do a first pass for you.';
  }
  return 'Start from the viewer\'s promise — what did the title lead them to expect? Deliver on that promise sooner and more clearly than you think you need to, and cut anything that doesn\'t move the story or payoff forward. Tell me your topic, title, or paste a script section and I\'ll give you specific notes. Any numbers I share are best-practice estimates, not guarantees.';
}

/** Coerce an unknown stored value into a validated message array. */
function asMessages(value: unknown): PersistedMessage[] {
  if (!Array.isArray(value)) return [];
  const out: PersistedMessage[] = [];
  for (const m of value) {
    const rec = (m ?? {}) as Record<string, unknown>;
    if (rec.role !== 'user' && rec.role !== 'assistant') continue;
    if (typeof rec.content !== 'string' || !rec.content.trim()) continue;
    out.push({ role: rec.role, content: rec.content.slice(0, 2000) });
    if (out.length >= MAX_THREAD_MESSAGES) break;
  }
  return out;
}

/** Build the report-context block for the coach, or null when absent/unreadable. */
async function loadReportContext(
  reportId: string | null,
  clerkId: string,
): Promise<{
  title: string;
  platform: string;
  overall: number;
  scores: Record<string, number>;
  topFixes: string[];
} | null> {
  if (!reportId) return null;
  const row = await prisma.analysisReport.findFirst({
    where: { id: reportId, user: { clerkId } },
    select: { title: true, targetPlatform: true, overallScore: true, report: true },
  });
  if (!row) return null;
  const raw = (row.report ?? {}) as Record<string, unknown>;
  const scoresRaw =
    raw.scores !== null && typeof raw.scores === 'object'
      ? (raw.scores as Record<string, unknown>)
      : {};
  const scores: Record<string, number> = {};
  for (const [k, value] of Object.entries(scoresRaw)) {
    const n = Number(value);
    if (Number.isFinite(n)) scores[k] = Math.round(Math.min(100, Math.max(0, n)));
  }
  const issues = Array.isArray(raw.scriptIssues)
    ? raw.scriptIssues.map((i) => String((i as Record<string, unknown>)?.text ?? '').trim()).filter(Boolean)
    : [];
  return {
    title: row.title,
    platform: row.targetPlatform,
    overall: row.overallScore,
    scores,
    topFixes: issues.slice(0, 4),
  };
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

  let threadId: string | null = null;
  if (typeof parsed.value.threadId === 'string' && parsed.value.threadId) {
    const t = v.id(parsed.value.threadId, 'threadId');
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
    threadId = t.value;
  }
  let reportId: string | null = null;
  if (typeof parsed.value.reportId === 'string' && parsed.value.reportId) {
    const r = v.id(parsed.value.reportId, 'reportId');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    reportId = r.value;
  }

  // History from the client is advisory context only — never trusted for
  // identity or quota. When a threadId is given, the authoritative history is
  // re-read from the DB below.
  let clientHistory: CoachMessage[] = [];
  if (Array.isArray(parsed.value.history)) {
    clientHistory = parsed.value.history
      .slice(-MAX_HISTORY)
      .map((m: unknown) => {
        const rec = (m ?? {}) as Record<string, unknown>;
        if (rec.role !== 'user' && rec.role !== 'assistant') return null;
        const content = v.string(rec.content, { min: 1, max: 2000, field: 'history.content' });
        return content.ok ? { role: rec.role as CoachMessage['role'], content: content.value } : null;
      })
      .filter((m: unknown): m is CoachMessage => m !== null);
  }

  // ── Resolve the thread this message belongs to ───────────────────────────
  let thread: { id: string; title: string; messages: PersistedMessage[]; reportId: string | null } | null = null;
  if (threadId) {
    const row = await prisma.coachThread.findFirst({
      where: { id: threadId, userId: authCtx.dbUserId },
      select: { id: true, title: true, messages: true, reportId: true },
    });
    if (!row) {
      return NextResponse.json({ error: 'That conversation no longer exists.' }, { status: 404 });
    }
    thread = { id: row.id, title: row.title, messages: asMessages(row.messages), reportId: row.reportId };
  }

  const context = await loadReportContext(reportId ?? thread?.reportId ?? null, authCtx.clerkId);
  const history = thread ? thread.messages.slice(-MAX_HISTORY) : clientHistory;

  // ── Get the reply (model first, canned fallback) ─────────────────────────
  let reply: string;
  try {
    reply = (await getCoachReply(message.value, history, context)) ?? cannedReply(message.value);
  } catch (err) {
    console.error('[POST /api/coach] error:', err);
    reply = cannedReply(message.value);
  }

  // ── Persist (best-effort: a failed save must not lose the reply) ─────────
  const nextMessages: PersistedMessage[] = [
    ...(thread?.messages ?? []),
    { role: 'user' as const, content: message.value },
    { role: 'assistant' as const, content: reply },
  ].slice(-MAX_THREAD_MESSAGES);

  let savedId = thread?.id ?? null;
  const title = thread?.title ?? message.value.slice(0, MAX_THREAD_TITLE);
  if (thread?.reportId && !reportId) reportId = thread.reportId;

  try {
    const upserted = await prisma.coachThread.upsert({
      where: { id: thread?.id ?? 'no-such-thread' },
      create: {
        userId: authCtx.dbUserId,
        title,
        reportId,
        messages: nextMessages as unknown as object,
      },
      update: {
        title,
        messages: nextMessages as unknown as object,
      },
      select: { id: true },
    });
    savedId = upserted.id;
  } catch (err) {
    console.error('[POST /api/coach] persist failed:', err);
  }

  return NextResponse.json(
    {
      reply,
      threadId: savedId,
      saved: savedId !== null,
      grounded: Boolean(context),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'coach'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const threads = await prisma.coachThread.findMany({
    where: { userId: authCtx.dbUserId },
    select: { id: true, title: true, reportId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(
    {
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        reportId: t.reportId,
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
