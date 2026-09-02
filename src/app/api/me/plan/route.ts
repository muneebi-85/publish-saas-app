import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserPlanState } from '@/lib/session';
import { rateLimit, userKey, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * True when every tier's yearly Lemon Squeezy variant is configured. The
 * pricing page hides the "Yearly" option when false — offering an interval
 * whose checkout would fail is worse than not offering it, and the client
 * cannot read env vars to know.
 */
function yearlyAvailable(): boolean {
  return Boolean(
    env.LS_VARIANT_STARTER_YEARLY && env.LS_VARIANT_PRO_YEARLY && env.LS_VARIANT_AGENCY_YEARLY,
  );
}

/**
 * Authoritative plan + quota state, read straight from the database.
 *
 * This is the ONLY source the client trusts. It cannot be forged: it derives
 * entirely from the authenticated Clerk session and the User row. Cookies are
 * never consulted. Plan changes happen exclusively through the Lemon Squeezy
 * webhook after a signature-verified payment event.
 */
export async function GET(req: Request) {
  // The client polls this on every focus and dashboard render; a reconcile can
  // WRITE, so it gets the cheap authenticated-read budget. Unauthenticated
  // callers are keyed by IP so a poll flood cannot share one user's bucket.
  const { userId } = auth();

  if (!userId) {
    const limit = await rateLimit(
      clientKey(req, 'plan-anon'),
      LIMITS.READ.limit,
      LIMITS.READ.windowMs,
    );
    if (!limit.success) {
      const r = tooManyRequests(limit);
      return NextResponse.json(r.body, r.init);
    }
    return NextResponse.json(
      { plan: 'free', auditsUsed: 0, auditsLimit: 1, canAnalyze: false, authenticated: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );  }

  const limit = await rateLimit(
    userKey(userId, 'plan'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const state = await getUserPlanState(userId);
  const percentUsed =
    state.auditsLimit > 0
      ? Math.min(100, Math.round((state.auditsUsed / state.auditsLimit) * 100))
      : 0;

  return NextResponse.json(
    {
      plan: state.plan,
      auditsUsed: state.auditsUsed,
      auditsLimit: state.auditsLimit,
      // Bonus reviews from referrals/challenges. Shown by the quota meter and
      // already reflected in `canAnalyze` — a full meter with credits left is
      // still open for business.
      referralCredits: state.referralCredits,
      canAnalyze: state.canAnalyze,
      isNearLimit: state.isNearLimit,
      periodEnd: state.periodEnd,
      percentUsed,
      authenticated: true,
      yearlyAvailable: yearlyAvailable(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
