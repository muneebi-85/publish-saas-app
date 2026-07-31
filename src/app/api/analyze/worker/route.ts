/**
 * QStash worker — POST /api/analyze/worker
 *
 * Only reachable with a valid QStash signature. The message body carries just a
 * job id; every other fact (owner, plan, validated input) is re-read from the
 * AnalysisJob row, so a replayed or forged message cannot target another user's
 * account or smuggle in unvalidated input.
 *
 * Retry semantics: `runReviewJob` rethrows on a retryable failure, which becomes
 * a 500 here and lets QStash redeliver. Once attempts are exhausted it refunds
 * the audit and resolves, so we answer 200 and the retries stop.
 */

import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { runReviewJob } from '@/lib/jobs/run-review';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const maxDuration = 300; // the full six-engine pipeline, worst case

async function handler(req: Request): Promise<Response> {
  const parsed = await v.jsonBody(req, { maxBytes: 4_000 });
  if (!parsed.ok) {
    // A malformed body will never become valid — 400 so QStash stops retrying.
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const jobId = v.id(parsed.value.jobId, 'jobId');
  if (!jobId.ok) return NextResponse.json({ error: jobId.error }, { status: 400 });

  // A throw here propagates as a 500, which is exactly the signal QStash needs
  // in order to redeliver a retryable failure.
  const outcome = await runReviewJob(jobId.value);

  switch (outcome.status) {
    case 'completed':
      return NextResponse.json({
        success: true,
        reportId: outcome.reportId,
        duplicate: outcome.duplicate,
      });
    case 'not_found':
      // The job row is gone (e.g. the account was deleted). Nothing to retry.
      return NextResponse.json({ success: false, reason: 'job_not_found' });
    case 'failed':
      // Terminal: attempts exhausted and the audit refunded. Ack so QStash stops
      // redelivering work that can no longer succeed.
      return NextResponse.json({ success: false, reason: outcome.error });
  }
}

// QStash verifies the signature so only Upstash can invoke this route. Wrapped
// lazily so `next build` page-data collection does not need the signing keys at
// module-load time — they are read only when a request actually arrives.
export async function POST(req: Request): Promise<Response> {
  try {
    const verified = verifySignatureAppRouter(handler);
    return await verified(req);
  } catch (err) {
    // Raised when QStash signing keys are unset at request time. A raw throw
    // would surface as a 500; this deployment simply cannot verify queue
    // messages yet, so answer 503 like the other unconfigured endpoints.
    console.error('[POST /api/analyze/worker] queue verification unavailable:', err);
    return NextResponse.json(
      { error: 'Queue verification is not configured on this deployment.' },
      { status: 503 },
    );
  }
}
