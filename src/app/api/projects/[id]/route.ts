import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import * as v from '@/lib/validate';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// A "project" is an analysis report: reports are created by the analyze
// pipeline (the `Project` table is never written), so the project id used by
// the UI is the report id — the only id that resolves as a route. Ownership is
// part of every predicate, so another user's report resolves to 404, not 403.
const OWNED = (id: string, userId: string) => ({ id, userId });

// PATCH/DELETE mutate a user's report, so they get the per-item write budget
// rather than the generous read budget. Not the ACCOUNT tier: clearing out a
// dozen old reports is normal use, and 5/hour would 429 that.
const limitWrite = (clerkId: string, action: string) =>
  rateLimit(userKey(clerkId, `project-${action}`), LIMITS.PROJECT_WRITE.limit, LIMITS.PROJECT_WRITE.windowMs);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuth();
    if (authCtx instanceof NextResponse) return authCtx;

    const limit = await limitWrite(authCtx.clerkId, 'update');
    if (!limit.success) {
      const r = tooManyRequests(limit);
      return NextResponse.json(r.body, r.init);
    }

    const id = v.id(params.id, 'id');
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const parsed = await v.jsonBody(req, { maxBytes: 1_000 });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const title = v.string(parsed.value.title, { min: 1, max: 200, field: 'title' });
    if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

    const updated = await prisma.analysisReport.updateMany({
      where: OWNED(id.value, authCtx.dbUserId),
      data: { title: title.value },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.value });
  } catch (err) {
    console.error('[PATCH /api/projects/:id]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuth();
    if (authCtx instanceof NextResponse) return authCtx;

    const limit = await limitWrite(authCtx.clerkId, 'delete');
    if (!limit.success) {
      const r = tooManyRequests(limit);
      return NextResponse.json(r.body, r.init);
    }

    const id = v.id(params.id, 'id');
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const deleted = await prisma.analysisReport.deleteMany({
      where: OWNED(id.value, authCtx.dbUserId),
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/projects/:id]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
