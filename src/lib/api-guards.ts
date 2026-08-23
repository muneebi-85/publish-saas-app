/**
 * Route-handler helpers that centralize auth + plan gating.
 * A route returns whatever requireAuth() / requirePaidPlan() returns if it's a
 * NextResponse (short-circuit); otherwise you get the resolved user context.
 */
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { ensureUser, getUserPlanState, Plan } from './session';
import { Role } from '@prisma/client';
import { primaryEmailOf } from './clerk-identity';

// Re-exported because routes have always imported it from here. The
// implementation lives in `clerk-identity.ts`, which has no framework imports
// and so can be unit-tested outside a server runtime.
export { primaryEmailOf } from './clerk-identity';
export type { ClerkUserLike } from './clerk-identity';

export type AuthedContext = {
  clerkId: string;
  email: string | null;
  dbUserId: string;
  plan: Plan;
  role: Role;
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
  const email = primaryEmailOf(user);
  const dbUser = await ensureUser(clerkId, email ?? undefined, user?.imageUrl || undefined);
  const state = await getUserPlanState(clerkId);
  return {
    clerkId,
    email,
    dbUserId: dbUser.id,
    plan: state.plan,
    role: state.role,
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

export async function requireRole(allowedRoles: Role[]): Promise<AuthedContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (!allowedRoles.includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden. Insufficient permissions.' }, { status: 403 });
  }
  return ctx;
}

export async function requirePageAuth() {
  const { userId: clerkId } = auth();
  if (!clerkId) {
    redirect('/sign-in');
  }
  const user = await currentUser();
  const email = primaryEmailOf(user);
  const dbUser = await ensureUser(clerkId, email ?? undefined, user?.imageUrl || undefined);
  const state = await getUserPlanState(clerkId);
  return {
    clerkId,
    email,
    dbUserId: dbUser.id,
    plan: state.plan,
    role: state.role,
    auditsUsed: state.auditsUsed,
    auditsLimit: state.auditsLimit,
    canAnalyze: state.canAnalyze,
  };
}
