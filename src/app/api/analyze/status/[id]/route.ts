/**
 * GET /api/analyze/status/[id] — poll a review job.
 *
 * IDOR guard: ownership is part of the query predicate, so another user's job id
 * resolves to 404 rather than 403 — the response never confirms that someone
 * else's job exists.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api-guards';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const jobId = v.id(params.id, 'jobId');
  if (!jobId.ok) return NextResponse.json({ error: jobId.error }, { status: 400 });

  // Polling is cheap but unbounded from the client's side, so it gets the READ
  // budget rather than none at all.
  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'job-status'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const job = await prisma.analysisJob.findFirst({
    where: { id: jobId.value, userId: authCtx.dbUserId },
    select: {
      id: true,
      projectId: true,
      title: true,
      targetPlatform: true,
      status: true,
      reportId: true,
      error: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(
    {
      jobId: job.id,
      projectId: job.projectId,
      title: job.title,
      targetPlatform: job.targetPlatform,
      status: job.status.toLowerCase(),
      // Only ever set once a report row genuinely exists, so the UI can never
      // link to a report that has not been written yet.
      reportId: job.reportId,
      reportUrl: job.reportId ? `/analysis/${job.reportId}` : null,
      // `error` is already a user-safe sentence written by the job runner; raw
      // exception text never reaches this field.
      error: job.error,
      queuedAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
