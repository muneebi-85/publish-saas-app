/**
 * POST /api/analyze — enqueue a pre-publish review.
 *
 * Flow:
 *   1. Authenticate, rate-limit per *user* (not IP), validate the body.
 *   2. Debit one audit atomically. The debit happens HERE, not in the worker, so
 *      a user cannot fire N concurrent requests and get N reports for one slot.
 *   3. Create an AnalysisJob row — this is the real, ownable job id the client
 *      polls and the worker's idempotency anchor.
 *   4. Publish to QStash. When no queue is configured the review runs inline so
 *      a single-service deploy still works end to end.
 *
 * If step 3 or 4 fails after the debit, the audit is refunded before responding.
 */

import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { PlatformName } from '@/lib/ai/platform-engine';
import { requireAuth } from '@/lib/api-guards';
import { incrementAuditsInTx, refundAudit, QuotaExceededError } from '@/lib/session';
import { prisma } from '@/lib/db';
import { env, hasJobQueue } from '@/lib/env';
import { runReviewJob } from '@/lib/jobs/run-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;
const MUSIC_SOURCES = ['none', 'original', 'licensed', 'stock', 'popular', 'unknown'] as const;

/** Hard ceiling on the request body — a script plus metadata, nothing more. */
const MAX_BODY_BYTES = 200_000;

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // Rate limit is keyed to the authenticated user: forging X-Forwarded-For can't
  // reset the bucket, and one user behind a shared NAT can't exhaust it for others.
  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'analyze'),
    LIMITS.ANALYZE.limit,
    LIMITS.ANALYZE.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Cheap pre-check for a friendly message. Not the authority — the debit in
  // step 2 is, because this value comes from a per-request cached read.
  if (!authCtx.canAnalyze) {
    return NextResponse.json(
      {
        error: 'Monthly review limit reached on your current plan.',
        upgradeRequired: true,
        plan: authCtx.plan,
        auditsUsed: authCtx.auditsUsed,
        auditsLimit: authCtx.auditsLimit,
      },
      { status: 402 },
    );
  }

  const parsed = await v.jsonBody(req, { maxBytes: MAX_BODY_BYTES });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  const title = v.string(body.title, { min: 3, max: 200, field: 'title' });
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  const scriptText = v.string(body.scriptText ?? '', { max: 20_000, field: 'scriptText' });
  if (!scriptText.ok) return NextResponse.json({ error: scriptText.error }, { status: 400 });

  const platform = v.enumOf<PlatformName>(body.targetPlatform ?? 'YouTube', PLATFORMS, 'targetPlatform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });

  const description = v.string(body.description ?? '', { max: 5_000, field: 'description' });
  if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 });

  // Thumbnail URL is fetched server-side by the vision model, so it must clear
  // the SSRF guard (https only, no private/loopback hosts).
  let thumbnailUrl: string | undefined;
  if (typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.trim()) {
    const t = v.url(body.thumbnailUrl, { field: 'thumbnailUrl' });
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
    thumbnailUrl = t.value;
  }

  // Optional media track: when set (and Deepgram is configured) the review
  // transcribes the actual audio for measured voice metrics.
  let audioUrl: string | undefined;
  if (typeof body.audioUrl === 'string' && body.audioUrl.trim()) {
    const a = v.url(body.audioUrl, { field: 'audioUrl' });
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 400 });
    audioUrl = a.value;
  }

  let durationSeconds: number | undefined;
  if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
    // 12h ceiling: beyond that it is not a video upload, it is a typo.
    const d = v.integer(body.durationSeconds, { min: 0, max: 43_200, field: 'durationSeconds' });
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
    durationSeconds = d.value;
  }

  let musicSource: string | undefined;
  if (typeof body.musicSource === 'string' && body.musicSource.trim()) {
    const m = v.enumOf(body.musicSource.toLowerCase(), MUSIC_SOURCES, 'musicSource');
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 });
    musicSource = m.value;
  }

  const folder = v.string(body.folder ?? 'General', { min: 1, max: 60, field: 'folder' });
  if (!folder.ok) return NextResponse.json({ error: folder.error }, { status: 400 });

  const payload = {
    title: title.value,
    description: description.value || undefined,
    scriptText: scriptText.value,
    thumbnailUrl,
    audioUrl,
    targetPlatform: platform.value,
    durationSeconds,
    aiGenerated: body.aiGenerated === true,
    hasWatermark: body.hasWatermark === true,
    isVertical: body.isVertical === true,
    musicSource,
    folder: folder.value,
  };

  // ── 2. Debit the allowance atomically, before any work is queued ──────────
  let quota: { plan: string; auditsUsed: number; auditsLimit: number };
  try {
    quota = await incrementAuditsInTx(authCtx.clerkId);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          error: 'Monthly review limit reached on your current plan.',
          upgradeRequired: true,
          plan: err.plan,
          auditsUsed: err.auditsUsed,
          auditsLimit: err.auditsLimit,
        },
        { status: 402 },
      );
    }
    console.error('[POST /api/analyze] quota debit failed:', err);
    return NextResponse.json(
      { error: 'Could not start the review. Please retry — no charge was incurred.' },
      { status: 503 },
    );
  }

  // From here on, one audit is spent. Every failure path must refund it.
  let jobId: string | null = null;
  try {
    // ── 3. The job row: the client's handle and the worker's idempotency key ──
    const job = await prisma.analysisJob.create({
      data: {
        userId: authCtx.dbUserId,
        // projectId is the human-facing correlation id inside the report payload.
        projectId: `pub_${Date.now().toString(36)}`,
        title: payload.title,
        targetPlatform: payload.targetPlatform,
        input: payload as unknown as object,
        status: 'QUEUED',
        quotaCharged: true,
      },
      select: { id: true, projectId: true },
    });
    jobId = job.id;

    // ── 4. Hand off ───────────────────────────────────────────────────────────
    let inlineReportId: string | null = null;
    if (hasJobQueue()) {
      const qstash = new Client({ token: env.QSTASH_TOKEN });
      await qstash.publishJSON({
        url: `${env.APP_URL}/api/analyze/worker`,
        // The worker re-derives ownership from the job row, so the body carries
        // only the job id — a replayed message can never retarget another user.
        body: { jobId: job.id },
        retries: 2,
      });
    } else {
      // No queue configured: run inline. Slower for the caller but correct, and
      // it keeps a bare `vercel deploy` (no Upstash) fully functional.
      const outcome = await runReviewJob(job.id);
      if (outcome.status !== 'completed') {
        throw new Error(outcome.status === 'not_found' ? 'Job row vanished' : outcome.error);
      }
      inlineReportId = outcome.reportId;
    }

    const res = NextResponse.json(
      {
        jobId: job.id,
        projectId: job.projectId,
        status: inlineReportId ? 'completed' : 'queued',
        // Present only on the inline path; queued reviews get it from polling
        // GET /api/analyze/status/[jobId] once the worker finishes.
        reportId: inlineReportId,
        // Quota reflects the debit that just happened, not a cached pre-read.
        quota: {
          used: quota.auditsUsed,
          limit: quota.auditsLimit,
          plan: quota.plan,
        },
      },
      {
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      },
    );

    // Clear any legacy plan cookies from older builds so they can't mislead the UI.
    res.cookies.set('publish_plan', '', { path: '/', maxAge: 0 });
    res.cookies.set('publish_audits_used', '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[POST /api/analyze] enqueue failed:', err);

    // Refund the slot so the creator is not charged for a review that never ran.
    // Clearing `quotaCharged` conditionally is what makes this safe: the inline
    // runner may already have refunded and cleared the flag, and updateMany
    // returning 0 tells us not to refund a second time.
    if (jobId) {
      const released = await prisma.analysisJob
        .updateMany({
          where: { id: jobId, quotaCharged: true },
          data: {
            status: 'FAILED',
            quotaCharged: false,
            error: 'The review could not be started. Your allowance was refunded.',
            finishedAt: new Date(),
          },
        })
        .catch(() => ({ count: 0 }));

      if (released.count === 1) {
        await refundAudit(authCtx.clerkId).catch((e) =>
          console.error('[POST /api/analyze] refund failed:', e),
        );
      }
    } else {
      // The job row was never created, so nothing holds the flag — refund directly.
      await refundAudit(authCtx.clerkId).catch((e) =>
        console.error('[POST /api/analyze] refund failed:', e),
      );
    }

    return NextResponse.json(
      { error: 'Review could not be started. Please retry — your allowance was not charged.' },
      { status: 503 },
    );
  }
}
