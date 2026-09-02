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
import { reconcileExpiredPlans, refundAuditInTx } from '@/lib/session';
import { RUNNING_STALE_MS, QUEUED_STALE_MS, isClaimableJob } from '@/lib/jobs/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
        // A non-terminal worker failure stamps FAILED but KEEPS the charge,
        // waiting for a QStash redelivery to resume. If that redelivery never
        // comes — the exact "queues lose messages" case this sweep exists for —
        // the row is stranded: invisible to the QUEUED/RUNNING scan above and
        // never pruned (the retention cutoff needs a finishedAt it does not
        // have). Without this arm, the creator's debit is gone forever.
        // `updatedAt` (the failure stamp) anchors staleness, not createdAt: an
        // old row that failed one attempt five minutes ago still has a live
        // redelivery coming and must not be swept early.
        {
          status: 'FAILED',
          quotaCharged: true,
          updatedAt: { lt: new Date(now - QUEUED_STALE_MS) },
        },
      ],
    },
    // `paidWithCredits` says which pool the debit took, so the refund below
    // restores the allowance or the credit exactly as it was paid.
    select: { id: true, userId: true, quotaCharged: true, paidWithCredits: true, status: true, createdAt: true, updatedAt: true },
    take: 200,
  });

  let failed = 0;
  let refunded = 0;

  for (const job of stale) {
    // The tested predicate in lib/jobs/sweep.ts, applied to the row as loaded
    // (Prisma Dates normalized to the epoch-millis the predicate expects).
    if (!isClaimableJob({
      status: job.status,
      quotaCharged: job.quotaCharged,
      createdAt: job.createdAt.getTime(),
      updatedAt: job.updatedAt.getTime(),
    })) continue;
    // Claim and refund in ONE transaction. The conditional `quotaCharged` flag
    // IS the refund guard: whoever flips it owns the refund, so a concurrent
    // sweep and a late worker retry cannot both credit the same slot. The
    // claim admits any status EXCEPT COMPLETED (the SQL predicate mirrors
    // isClaimableJob): a row may legitimately have moved QUEUED/RUNNING →
    // FAILED between the scan and the claim (the resume arm above), while a
    // COMPLETED row keeps quotaCharged: true by design — the debit was
    // consumed by a real report and must never be refunded.
    // Committing claim + refund atomically closes the loss window the split
    // order left.
    let claimed = false;
    try {
      await prisma.$transaction(async (tx) => {
        const released = await tx.analysisJob.updateMany({
          // `isClaimableJob` is the tested predicate: charged + not COMPLETED.
          // COMPLETED rows keep quotaCharged: true by design (the debit was
          // consumed by a real report) and must never be swept into a refund.
          where: { id: job.id, quotaCharged: true, status: { not: 'COMPLETED' } },
          data: {
            status: 'FAILED',
            quotaCharged: false,
            error:
              'The review did not finish and was closed out automatically. Your allowance was refunded.',
            finishedAt: new Date(),
          },
        });
        if (released.count === 1) {
          await refundAuditInTx(tx, job.userId, job.paidWithCredits);
          claimed = true;
        }
      });
    } catch (e) {
      console.error(`[cron] refund transaction failed for job ${job.id}:`, e);
      continue; // row untouched, next sweep retries
    }
    if (claimed) failed += 1;
    if (claimed && job.quotaCharged) refunded += 1;
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
