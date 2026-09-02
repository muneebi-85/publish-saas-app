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
import { getCoachReply, CoachMessage, type CoachHistoryContext } from '@/lib/ai/coach-engine';
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
  // The FIX, not the problem excerpt: `text` is the offending quote the report
  // found; the actionable content is `specific_fix` (preferred) or
  // `suggestion`. Sending `text` here made the coach's prompt say "Their top
  // fixes: - 'delve into'" — the bug it found, labeled as the thing to do.
  const issues = Array.isArray(raw.scriptIssues)
    ? raw.scriptIssues.map((i) => {
        const rec = (i ?? {}) as Record<string, unknown>;
        const fix =
          (typeof rec.specific_fix === 'string' && rec.specific_fix.trim() && rec.specific_fix) ||
          (typeof rec.suggestion === 'string' && rec.suggestion.trim() && rec.suggestion) ||
          (typeof rec.text === 'string' && `Fix: ${rec.text}`) ||
          '';
        return fix.trim();
      }).filter(Boolean)
    : [];
  return {
    title: row.title,
    platform: row.targetPlatform,
    overall: row.overallScore,
    scores,
    topFixes: issues.slice(0, 4),
  };
}

/** Layer ids the history scan knows how to name for the coach. */
const LAYER_LABELS: Record<string, string> = {
  monetization: 'Monetization',
  copyright: 'Copyright',
  hook: 'Retention/Hook',
  humanAuthenticity: 'Authenticity',
  originality: 'Originality',
  brandSafety: 'Brand safety',
  seo: 'SEO',
  editing: 'Editing/pacing',
};

/**
 * The coach's longitudinal memory: trend + recurring weaknesses across the
 * creator's recent reviews. Only reads rows the caller owns (scoped by
 * clerkId), and returns null when there is too little history to say anything —
 * one or two reviews are a data point, not a pattern, and a manufactured
 * "pattern" would be exactly the fabrication the engines refuse to emit.
 */
async function loadHistoryContext(
  clerkId: string,
  selectedReportTitle?: string,
): Promise<CoachHistoryContext | null> {
  const rows = await prisma.analysisReport.findMany({
    where: { user: { clerkId } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { overallScore: true, report: true },
  });
  // Three reviews is the smallest honest sample for "recurring" — a weakness
  // seen twice may be coincidence; three times is a habit.
  if (rows.length < 3) return null;

  const layerStats: Record<string, { sum: number; n: number }> = {};
  for (const r of rows) {
    const raw = (r.report ?? {}) as Record<string, unknown>;
    const scores =
      raw.scores !== null && typeof raw.scores === 'object'
        ? (raw.scores as Record<string, unknown>)
        : {};
    for (const [k, v] of Object.entries(scores)) {
      // null = layer never ran on that review; skipping it keeps the average
      // over reports that actually measured the layer.
      if (v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || !LAYER_LABELS[k]) continue;
      const stat = (layerStats[k] ??= { sum: 0, n: 0 });
      stat.sum += Math.min(100, Math.max(0, n));
      stat.n += 1;
    }
  }

  // A layer is a recurring weakness when it averaged below 70 (the band the
  // product's own gauge calls "Fair") on at least half of the history window.
  const minSamples = Math.max(3, Math.ceil(rows.length / 2));
  const recurring = Object.entries(layerStats)
    .filter(([, s]) => s.n >= minSamples)
    .map(([k, s]) => ({ layer: LAYER_LABELS[k], avg: s.sum / s.n }))
    .filter((s) => s.avg < 70)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3)
    .map((s) => `${s.layer} (avg ${Math.round(s.avg)})`);

  // Trend over the window, oldest → newest. +5/-5 overall points across ten
  // reviews is a real move; inside that band, call it flat.
  const chron = [...rows].reverse().map((r) => r.overallScore);
  const first = chron[0];
  const last = chron[chron.length - 1];
  const delta = last - first;
  const scoreTrend: CoachHistoryContext['scoreTrend'] =
    delta >= 5 ? 'improving' : delta <= -5 ? 'declining' : 'flat';

  return {
    reviewCount: rows.length,
    scoreTrend,
    recurringWeaknesses: recurring,
    selectedReportTitle,
  };
}
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
  const historyContext = await loadHistoryContext(
    authCtx.clerkId,
    context?.title,
  ).catch((e) => {
    // Longitudinal context is an enhancement, never a dependency: a DB hiccup
    // here must not break the reply.
    console.error('[POST /api/coach] history context failed:', e);
    return null;
  });

  // ── Get the reply (model first, canned fallback) ─────────────────────────
  let reply: string;
  try {
    reply =
      (await getCoachReply(message.value, history, context, historyContext)) ??
      cannedReply(message.value);
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

  // Only ever set when a write actually committed. Pre-initializing this to
  // thread.id made the response claim `saved: true` with a threadId that may
  // no longer exist (the row was deleted mid-flight, or the lock transaction
  // threw) — the client would keep posting into "no longer exists" 404s while
  // the reply text above said everything worked.
  let savedId: string | null = null;
  const title = thread?.title ?? message.value.slice(0, MAX_THREAD_TITLE);
  if (thread?.reportId && !reportId) reportId = thread.reportId;

  try {
    if (thread) {
      // Continuing: the merge is anchored to the exact message count we read.
      // Under Postgres READ COMMITTED a plain read-then-write in a transaction
      // is NOT atomic — two concurrent posts to one thread could both pass the
      // count check and the second unconditional update would silently drop
      // the first's exchange pair. `SELECT … FOR UPDATE` inside the same
      // transaction serializes writers on the row: the second delivery blocks
      // at the lock and then sees the first's committed messages, so the
      // mismatch branch (re-read + retry) below is the remaining path, never
      // a silent overwrite.
      const baseCount = thread.messages.length;
      const appended: PersistedMessage[] = [
        { role: 'user' as const, content: message.value },
        { role: 'assistant' as const, content: reply },
      ];

      const committed = await prisma.$transaction(async (tx) => {
        // Row lock first: everything after it reads state no concurrent writer
        // can be mid-flight on. Harmless when there is no contention.
        await tx.$queryRaw`SELECT id FROM "CoachThread" WHERE id = ${thread!.id} FOR UPDATE`;
        const fresh = await tx.coachThread.findUnique({
          where: { id: thread!.id },
          select: { messages: true },
        });
        if (!fresh) return null;
        const stored = asMessages(fresh.messages);
        if (stored.length !== baseCount) return null;
        const merged = [...stored, ...appended].slice(-MAX_THREAD_MESSAGES);
        const written = await tx.coachThread.update({
          where: { id: thread!.id },
          data: { title, messages: merged as unknown as object },
          select: { id: true },
        });
        return written;
      });

      if (committed) {
        savedId = committed.id;
      } else {
        // Lost the race: re-read, append, retry once — under the same row
        // lock, so the retry merge cannot itself be overwritten. A second
        // mismatch means heavy concurrency on one thread — give up on saving
        // (the reply is still returned) rather than looping.
        const fresh = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "CoachThread" WHERE id = ${thread.id} FOR UPDATE`;
          const row = await tx.coachThread.findUnique({
            where: { id: thread.id },
            select: { messages: true, id: true },
          });
          if (!row) return null;
          const merged = [...asMessages(row.messages), ...appended].slice(-MAX_THREAD_MESSAGES);
          return tx.coachThread.update({
            where: { id: thread.id },
            data: { title, messages: merged as unknown as object },
            select: { id: true },
          });
        });
        if (fresh) savedId = fresh.id;
      }
    } else {
      const created = await prisma.coachThread.create({
        data: {
          userId: authCtx.dbUserId,
          title,
          reportId,
          messages: nextMessages as unknown as object,
        },
        select: { id: true },
      });
      savedId = created.id;
    }
  } catch (err) {
    console.error('[POST /api/coach] persist failed:', err);
  }

  return NextResponse.json(
    {
      reply,
      threadId: savedId,
      saved: savedId !== null,
      grounded: Boolean(context),
      historyAware: historyContext !== null,
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
