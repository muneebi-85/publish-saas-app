/**
 * Route-handler helpers that centralize auth + plan gating.
 * A route returns whatever requireAuth() / requirePaidPlan() returns if it's a
 * NextResponse (short-circuit); otherwise you get the resolved user context.
 */
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { ensureUser, getUserPlanState, Plan } from './session';

export type AuthedContext = {
  clerkId: string;
  email: string | null;
  dbUserId: string;
  plan: Plan;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
};

export async function requireAuth(): Promise<AuthedContext | NextResponse> {
  const { userId: clerkId } = auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const dbUser = await ensureUser(clerkId, email ?? undefined);
  const state = await getUserPlanState(clerkId);
  return {
    clerkId,
    email,
    dbUserId: dbUser.id,
    plan: state.plan,
    auditsUsed: state.auditsUsed,
    auditsLimit: state.auditsLimit,
    canAnalyze: state.canAnalyze,
  };
}

export async function requirePaidPlan(): Promise<AuthedContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.plan === 'free') {
    return NextResponse.json(
      {
        error: 'This feature requires a paid plan (Starter, Pro, or Agency).',
        upgradeRequired: true,
        plan: ctx.plan,
      },
      { status: 402 },
    );
  }
  return ctx;
}
