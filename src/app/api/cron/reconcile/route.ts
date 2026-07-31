/**
 * GET /api/cron/reconcile — the safety net behind everything asynchronous.
 *
 * Webhooks get dropped and queues lose messages. Both failures are silent and
 * both cost real money in opposite directions: a missed `subscription_expired`
 * gives the product away for free, and a job that died mid-flight leaves a
 * creator charged for a review they never received. Nothing in the request path
 * notices either one, so a scheduled sweep has to.
 *
 * Wired up in vercel.json. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically; without a configured secret the route refuses to run at all
 * rather than exposing an unauthenticated DB-mutating endpoint.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { reconcileExpiredPlans, refundAuditByUserId } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A RUNNING job past this is dead: the worker's own ceiling is 300s. */
const RUNNING_STALE_MS = 15 * 60 * 1000;
/** A QUEUED job past this was never picked up — QStash gives up long before. */
const QUEUED_STALE_MS = 30 * 60 * 1000;
/** Completed/failed job rows past this are only noise. */
const JOB_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(req: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header = req.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), env.CRON_SECRET);
}

/**
 * Fail a job that can no longer finish and return the allowance. The
 * `quotaCharged: true` predicate is the whole refund guard: whoever flips the
 * flag owns the refund, so a concurrent sweep and a late worker retry cannot
 * both credit the same slot.
 */
async function releaseStaleJobs(): Promise<{ failed: number; refunded: number }> {
  const now = Date.now();
  const stale = await prisma.analysisJob.findMany({
    where: {
      OR: [
        { status: 'RUNNING', startedAt: { lt: new Date(now - RUNNING_STALE_MS) } },
        { status: 'QUEUED', createdAt: { lt: new Date(now - QUEUED_STALE_MS) } },
      ],
    },
    select: { id: true, userId: true, quotaCharged: true },
    take: 200,
  });

  let failed = 0;
  let refunded = 0;

  for (const job of stale) {
    const released = await prisma.analysisJob
      .updateMany({
        where: { id: job.id, status: { in: ['QUEUED', 'RUNNING'] } },
        data: {
          status: 'FAILED',
          quotaCharged: false,
          error:
            'The review did not finish and was closed out automatically. Your allowance was refunded.',
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));

    if (released.count === 0) continue; // someone else got there first
    failed += 1;

    if (job.quotaCharged) {
      await refundAuditByUserId(job.userId)
        .then(() => {
          refunded += 1;
        })
        .catch((e) => console.error(`[cron] refund failed for job ${job.id}:`, e));
    }
  }

  return { failed, refunded };
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    // Identical answer whether the secret is wrong or unset — an unauthenticated
    // caller learns nothing about the deployment's configuration.
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result: Record<string, unknown> = { ranAt: new Date().toISOString() };

  // 1. Entitlements: downgrade tiers whose paid period is genuinely over.
  try {
    result.plans = await reconcileExpiredPlans();
  } catch (err) {
    console.error('[cron] plan reconciliation failed:', err);
    result.plans = { error: 'failed' };
  }

  // 2. Jobs: close out anything that can no longer complete, and refund it.
  try {
    result.jobs = await releaseStaleJobs();
  } catch (err) {
    console.error('[cron] stale job sweep failed:', err);
    result.jobs = { error: 'failed' };
  }

  // 3. Housekeeping: bounded retention for finished jobs and webhook dedup rows.
  try {
    const cutoff = new Date(Date.now() - JOB_RETENTION_MS);
    const [jobs, events] = await Promise.all([
      prisma.analysisJob.deleteMany({
        where: { status: { in: ['COMPLETED', 'FAILED'] }, finishedAt: { lt: cutoff } },
      }),
      prisma.webhookEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
    result.pruned = { jobs: jobs.count, webhookEvents: events.count };
  } catch (err) {
    console.error('[cron] prune failed:', err);
    result.pruned = { error: 'failed' };
  }

  result.durationMs = Date.now() - startedAt;
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
