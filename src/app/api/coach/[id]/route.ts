/**
 * GET    /api/coach/[id] — one persisted thread with its full message history.
 * DELETE /api/coach/[id] — remove a thread (ownership-scoped).
 *
 * History is stored as JSON on the CoachThread row; this route is the read
 * back for the coach UI when a user reopens a conversation.
 */

import { NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const parsed = v.id(params.id, 'id');
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'coach'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Ownership is part of the query, so another user's thread id resolves to
  // 404 — it never confirms the thread exists.
  const thread = await prisma.coachThread.findFirst({
    where: { id: parsed.value, userId: authCtx.dbUserId },
    select: { id: true, title: true, reportId: true, messages: true, updatedAt: true },
  });
  if (!thread) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  return NextResponse.json(
    {
      id: thread.id,
      title: thread.title,
      reportId: thread.reportId,
      updatedAt: thread.updatedAt.toISOString(),
      messages,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const parsed = v.id(params.id, 'id');
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'coach'),
    LIMITS.PROJECT_WRITE.limit,
    LIMITS.PROJECT_WRITE.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const result = await prisma.coachThread.deleteMany({
    where: { id: parsed.value, userId: authCtx.dbUserId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
