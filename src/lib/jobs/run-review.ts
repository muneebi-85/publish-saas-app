/**
 * The review job runner.
 *
 * Single implementation shared by the QStash worker and the inline fallback in
 * POST /api/analyze, so both paths have identical semantics:
 *
 *   - Idempotent. A retried delivery for a job that already COMPLETED returns
 *     the existing reportId instead of running the pipeline twice and creating
 *     a duplicate report.
 *   - Ownership comes from the job row (userId / clerkId), never from the queue
 *     message, so a forged or replayed message cannot target another account.
 *   - On terminal failure the charged audit is refunded exactly once, guarded by
 *     the `quotaCharged` flag so a retry storm cannot mint free capacity.
 */

import { prisma } from '../db';
import { runFullReview } from '../ai/orchestrator';
import { refundAudit } from '../session';
import { sendReportReady } from '../email';
import { env } from '../env';
import type { PlatformName } from '../ai/platform-engine';
import type { ScriptIssue } from '../types';

/** Shape persisted in AnalysisJob.input by the enqueue route. */
export interface ReviewJobInput {
  title: string;
  description?: string;
  scriptText?: string;
  thumbnailUrl?: string;
  audioUrl?: string;
  targetPlatform: PlatformName;
  durationSeconds?: number;
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  isVertical?: boolean;
  musicSource?: string;
  folder?: string;
}

export type RunReviewOutcome =
  | { status: 'completed'; reportId: string; duplicate: boolean }
  | { status: 'failed'; error: string }
  | { status: 'not_found' };

/** Retries beyond this are treated as permanent so we stop burning compute. */
const MAX_ATTEMPTS = 3;

export async function runReviewJob(jobId: string): Promise<RunReviewOutcome> {
  const job = await prisma.analysisJob.findUnique({
    where: { id: jobId },
    include: { user: { select: { clerkId: true, email: true } } },
  });

  if (!job) return { status: 'not_found' };

  // ── Idempotency ───────────────────────────────────────────────────────────
  // A QStash retry (or a duplicate inline call) must not re-run the pipeline.
  if (job.status === 'COMPLETED' && job.reportId) {
    return { status: 'completed', reportId: job.reportId, duplicate: true };
  }
  if (job.status === 'FAILED' && job.attempts >= MAX_ATTEMPTS) {
    return { status: 'failed', error: job.error ?? 'Review failed.' };
  }
  // Another delivery of the same message is already mid-flight. Claim the row
  // only if it is not currently RUNNING, using a conditional update as a lock.
  const claimed = await prisma.analysisJob.updateMany({
    where: { id: jobId, status: { in: ['QUEUED', 'FAILED'] } },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    // Someone else holds the lock. Report the current state rather than racing.
    const fresh = await prisma.analysisJob.findUnique({
      where: { id: jobId },
      select: { status: true, reportId: true, error: true },
    });
    if (fresh?.status === 'COMPLETED' && fresh.reportId) {
      return { status: 'completed', reportId: fresh.reportId, duplicate: true };
    }
    return { status: 'failed', error: 'Review is already in progress.' };
  }

  const input = (job.input ?? {}) as unknown as ReviewJobInput;

  try {
    const report = await runFullReview({
      projectId: job.projectId,
      title: input.title ?? job.title,
      description: input.description,
      scriptText: input.scriptText,
      thumbnailUrl: input.thumbnailUrl,
      audioUrl: input.audioUrl,
      targetPlatform: (input.targetPlatform ?? job.targetPlatform) as PlatformName,
      durationSeconds: input.durationSeconds,
      aiGenerated: input.aiGenerated,
      hasWatermark: input.hasWatermark,
      isVertical: input.isVertical,
      musicSource: input.musicSource,
      folder: input.folder,
    });

    // Persist the report and close out the job in one transaction so we can
    // never end up with a report the job does not point at, or vice versa.
    const reportId = await prisma.$transaction(async (tx) => {
      const persisted = await tx.analysisReport.create({
        data: {
          userId: job.userId,
          projectId: job.projectId,
          title: input.title ?? job.title,
          targetPlatform: (input.targetPlatform ?? job.targetPlatform) as string,
          monetizationScore: report.scores.monetization,
          overallScore: report.scores.overall,
          report: report as unknown as object,
        },
        select: { id: true },
      });

      await tx.analysisJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          reportId: persisted.id,
          error: null,
          finishedAt: new Date(),
        },
      });

      return persisted.id;
    });

    // Email is best-effort: a delivery failure must never fail a paid review.
    if (job.user?.email) {
      const criticalIssues = (report.scriptIssues as ScriptIssue[]).filter(
        (i) => i.reviewSeverity === 'critical',
      ).length;
      await sendReportReady({
        to: job.user.email,
        projectTitle: input.title ?? job.title,
        reportUrl: `${env.APP_URL}/analysis/${reportId}`,
        monetizationScore: report.scores.monetization,
        criticalIssues,
      }).catch((err) => console.error('[review-job] email failed:', err));
    }

    return { status: 'completed', reportId, duplicate: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[review-job] ${jobId} failed:`, message);

    const attempts = job.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;

    // Refund only on the final attempt, and only once — clearing quotaCharged
    // in the same update makes the refund idempotent under concurrent retries.
    if (terminal && job.quotaCharged) {
      const released = await prisma.analysisJob.updateMany({
        where: { id: job.id, quotaCharged: true },
        data: { quotaCharged: false },
      });
      if (released.count === 1 && job.user?.clerkId) {
        await refundAudit(job.user.clerkId).catch((e) =>
          console.error('[review-job] refund failed:', e),
        );
      }
    }

    await prisma.analysisJob
      .update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          // Never leak an internal stack/message to the client-facing field.
          error: terminal
            ? 'The review could not be completed. Your allowance was refunded.'
            : 'A step failed and will be retried.',
          finishedAt: terminal ? new Date() : null,
        },
      })
      .catch(() => undefined);

    // Rethrow on a retryable failure so QStash redelivers; swallow when terminal.
    if (!terminal) throw err;
    return { status: 'failed', error: 'The review could not be completed.' };
  }
}
