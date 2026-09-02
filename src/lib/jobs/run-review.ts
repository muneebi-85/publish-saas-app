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
import { refundAuditInTx } from '../session';
import { sendReportReady } from '../email';
import { env } from '../env';
import type { PlatformName } from '../ai/platform-engine';
import type { ScriptIssue } from '../types';
import type { VideoFrameInput } from '../ai/video-engine';

/** Shape persisted in AnalysisJob.input by the enqueue route. */
export interface ReviewJobInput {
  title: string;
  description?: string;
  scriptText?: string;
  thumbnailUrl?: string;
  audioUrl?: string;
  /**
   * Frames the browser decoded, already validated by the enqueue route.
   *
   * Persisted in the job row like every other input, so a QStash retry an hour
   * later analyses the same sheets. The sheet URLs outlive the browser tab that
   * made them; the numbers alongside them cannot be recomputed server-side.
   */
  videoFrames?: VideoFrameInput;
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
    include: { user: { select: { clerkId: true, email: true, productEmails: true } } },
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
  // `attempts` counts claims, so increment it here — the read at the top of
  // this function predates the claim and must not be double-counted by the
  // catch block below (which reads it from the row, not from that snapshot).
  //
  // A FAILED row is re-runnable ONLY while its charge is still held
  // (`quotaCharged: true`) — that is a worker retry that will either complete
  // or refund. The enqueue path and the cron sweep write FAILED *after
  // refunding* (quotaCharged: false); those rows are terminal, and re-running
  // one would hand the creator a free report on top of the refunded slot.
  const claimed = await prisma.analysisJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: 'QUEUED' }, { status: 'FAILED', quotaCharged: true }],
    },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    // Someone else holds the lock, or the row is already terminal. Report the
    // current state rather than racing.
    const fresh = await prisma.analysisJob.findUnique({
      where: { id: jobId },
      select: { status: true, reportId: true, error: true },
    });
    if (fresh?.status === 'COMPLETED' && fresh.reportId) {
      return { status: 'completed', reportId: fresh.reportId, duplicate: true };
    }
    return {
      status: 'failed',
      error:
        fresh?.status === 'RUNNING'
          ? 'Review is already in progress.'
          : fresh?.error ?? 'Review could not be completed.',
    };
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
      videoFrames: input.videoFrames,
      targetPlatform: (input.targetPlatform ?? job.targetPlatform) as PlatformName,
      durationSeconds: input.durationSeconds,
      aiGenerated: input.aiGenerated,
      hasWatermark: input.hasWatermark,
      isVertical: input.isVertical,
      musicSource: input.musicSource,
      folder: input.folder,
    });

    // Persist the report, close out the job, and pay any deferred referral
    // credit — all in ONE transaction. The referral payment must be atomic
    // with completion: running it after the commit left a window where a
    // process crash (or a QStash timeout after the response) skipped the
    // referrer's credit entirely, and it would only have been paid if the
    // referee happened to run another completed review later. The conditional
    // stamp (referrerCreditedAt: null) is the once-only guard under any
    // redelivery order.
    const reportId = await prisma.$transaction(async (tx) => {
      // Conditional completion claim: the reconcile sweep may have closed this
      // job as FAILED + refunded while the pipeline was still running (its
      // staleness horizon is 15 minutes; a long pipeline can cross it). An
      // unconditional write would overwrite the sweep's verdict and hand the
      // creator BOTH the refund and the report. The `quotaCharged: true`
      // predicate is the same contention token the sweep flips — count 0 means
      // we lost the race, and aborting the whole transaction (including the
      // report row and the referral payment) leaves the sweep's refund as the
      // user's only outcome. Exactly one of the two wins, never both.
      const claim = await tx.analysisJob.updateMany({
        where: { id: job.id, quotaCharged: true, status: { not: 'COMPLETED' } },
        data: {
          status: 'COMPLETED',
          reportId: null,
          error: null,
          finishedAt: new Date(),
        },
      });
      if (claim.count !== 1) {
        throw new Error('job was closed out by the reconciler while the review ran');
      }

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

      // Point the job at the report only after the report row exists (the
      // claim above reserved the slot without a report id yet).
      await tx.analysisJob.update({
        where: { id: job.id },
        data: { reportId: persisted.id },
      });

      // The referrer's referral credit is paid on the referee's first COMPLETED
      // review, not at signup (Referral.referrerCreditedAt): paying at attach
      // let a farmer mint audits from throwaway accounts.
      const paid = await tx.referral.updateMany({
        where: {
          refereeId: job.userId,
          referrerCreditedAt: null,
          granted: true,
        },
        data: { referrerCreditedAt: new Date() },
      });
      if (paid.count > 0) {
        const referral = await tx.referral.findUnique({
          where: { refereeId: job.userId },
          select: { referrerId: true },
        });
        if (referral) {
          await tx.user.update({
            where: { id: referral.referrerId },
            data: { referralCredits: { increment: paid.count } },
          });
        }
      }

      return persisted.id;
    });

    // Email is best-effort: a delivery failure must never fail a paid review.
    // `productEmails` is the documented opt-out for exactly this mail
    // (review-ready notices); transactional billing/security mail is the only
    // category deliberately not switchable, and none of that is sent here.
    if (job.user?.email && job.user.productEmails) {
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

    // The reconcile sweep closed the job (FAILED + refunded) while the
    // pipeline was running, and the completion claim above correctly aborted.
    // The sweep's verdict stands: the user has the refund, NOT the report, and
    // the generic failure paths below must not overwrite the sweep's error
    // copy or attempt a second refund (quotaCharged is already false).
    if (message.includes('closed out by the reconciler')) {
      return { status: 'failed', error: 'The review was closed out automatically and refunded.' };
    }

    // The claim at the top incremented `attempts` after this function's read
    // of the row, so re-read the authoritative count rather than deriving it
    // from the stale snapshot (a duplicate delivery burning a claim would
    // otherwise flip the job terminal one attempt early).
    const freshRow = await prisma.analysisJob
      .findUnique({ where: { id: job.id }, select: { attempts: true } })
      .catch(() => null);
    const attempts = freshRow?.attempts ?? job.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;

    // Refund only on the final attempt, and only once. The claim and the refund
    // run in ONE transaction: the conditional `updateMany` claim (quotaCharged
    // still true, status still RUNNING) and the user-row refund either both
    // commit or both roll back. The old split order — flag flipped first, then
    // a `.catch`-swallowed refund — left a loss window: a crash or a transient
    // DB error between the two permanently dropped the creator's slot, because
    // every later delivery saw quotaCharged=false and early-returned, and no
    // sweep re-scans FAILED rows. If this whole transaction fails, the row keeps
    // quotaCharged=true, so the next delivery (or the reconcile sweep, which
    // re-claims under the same predicate) retries the refund — exactly-once is
    // preserved by the claim predicate, not by the ordering.
    // `paidWithCredits` records which pool the debit took, so the refund
    // restores the allowance or the credit exactly as it was paid. Keyed by
    // the job's own userId: requiring the user RELATION to be loaded would
    // strand the refund in the (impossible-by-FK, but racy) case where the
    // include resolves null.
    if (terminal && job.quotaCharged) {
      try {
        await prisma.$transaction(async (tx) => {
          const released = await tx.analysisJob.updateMany({
            where: { id: job.id, quotaCharged: true, status: 'RUNNING' },
            data: {
              status: 'FAILED',
              quotaCharged: false,
              error: 'The review could not be completed. Your allowance was refunded.',
              finishedAt: new Date(),
            },
          });
          if (released.count === 1) {
            await refundAuditInTx(tx, job.userId, job.paidWithCredits);
          }
        });
      } catch (e) {
        console.error('[review-job] terminal refund transaction failed:', e);
      }
      // Whether we claimed it, lost the race, or the transaction failed, the
      // job is done for this delivery — a failed transaction leaves
      // quotaCharged=true so the next delivery or the sweep retries the refund.
      return { status: 'failed', error: 'The review could not be completed.' };
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
