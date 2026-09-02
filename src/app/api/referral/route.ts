/**
 * Referral program API.
 *
 *   GET  /api/referral            → { code, credits, signups } for the caller
 *   POST /api/referral  { code }  → attach a referral code (both sides credited)
 *
 * The credit logic lives in src/lib/referrals.ts (pure, unit-testable). This
 * file is the auth + rate-limit shell. Attach is idempotent — retries return
 * the already-committed state instead of double-paying.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { attachReferral, getReferralStatus } from '@/lib/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'referral'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const { body, init } = tooManyRequests(limit);
    return NextResponse.json(body, init);
  }

  const status = await getReferralStatus(authCtx.dbUserId);
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'referral'),
    LIMITS.CHANNELS.limit,
    LIMITS.CHANNELS.windowMs,
  );
  if (!limit.success) {
    const { body, init } = tooManyRequests(limit);
    return NextResponse.json(body, init);
  }

  const parsed = await v.jsonBody(req, { maxBytes: 2_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const code = v.string(parsed.value.code, { min: 1, max: 16, field: 'code' });
  if (!code.ok) return NextResponse.json({ error: code.error }, { status: 400 });

  const result = await attachReferral(code.value, authCtx.dbUserId);
  if (!result.ok) {
    // retryable marks a server-side fault (DB outage and friends), not bad
    // input — answer 503 so the client knows to retry rather than blame the code.
    return NextResponse.json({ error: result.error }, { status: result.retryable ? 503 : 400 });
  }

  return NextResponse.json(
    { ok: true, credits: result.credits, signups: result.signups },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
