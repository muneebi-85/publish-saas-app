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

/**
 * Resolve the address Clerk considers primary, not whichever one happens to sit
 * first in the array. Order is not guaranteed, and billing receipts plus every
 * transactional mail key off this — sending a payment failure to a stale
 * secondary address is a real, silent failure. Falls back to the first entry
 * only when no primary id is set.
 */
type ClerkUserLike = {
  primaryEmailAddressId?: string | null;
  emailAddresses?: { id: string; emailAddress: string }[];
} | null;

export function primaryEmailOf(user: ClerkUserLike): string | null {
  const addresses = user?.emailAddresses ?? [];
  if (addresses.length === 0) return null;
  const primaryId = user?.primaryEmailAddressId;
  if (primaryId) {
    const match = addresses.find((a) => a.id === primaryId);
    if (match?.emailAddress) return match.emailAddress;
  }
  return addresses[0]?.emailAddress ?? null;
}

export async function requireAuth(): Promise<AuthedContext | NextResponse> {
  const { userId: clerkId } = auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const user = await currentUser();
  const email = primaryEmailOf(user);
  const dbUser = await ensureUser(clerkId, email ?? undefined);
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
  const dbUser = await ensureUser(clerkId, email ?? undefined);
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
