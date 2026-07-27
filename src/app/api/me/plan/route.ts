import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserPlanState } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authoritative plan + quota state, read straight from the database.
 *
 * This is the ONLY source the client trusts. It cannot be forged: it derives
 * entirely from the authenticated Clerk session and the User row. Cookies are
 * never consulted. Plan changes happen exclusively through the Lemon Squeezy
 * webhook after a signature-verified payment event.
 */
export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      { plan: 'free', auditsUsed: 0, auditsLimit: 1, canAnalyze: false, authenticated: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
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
      canAnalyze: state.canAnalyze,
      isNearLimit: state.isNearLimit,
      periodEnd: state.periodEnd,
      percentUsed,
      authenticated: true,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
