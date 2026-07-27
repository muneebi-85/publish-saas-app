/**
 * Session + plan-quota helpers.
 *
 * These wrap Prisma with our plan gating rules so route handlers don't have to
 * re-derive limits or worry about race conditions when incrementing usage.
 * All functions accept a Clerk user id (external identity) except the setters
 * which take our internal DB id.
 */

import { prisma } from './db';

export type Plan = 'free' | 'starter' | 'pro' | 'agency';

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 25,
  pro: 100,
  agency: 500,
};

function normalizePlan(plan: string): Plan {
  const p = plan.toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'agency') return p;
  return 'free';
}

/**
 * Upsert a User row keyed by Clerk id. Called on every authenticated request
 * so the local record stays in sync with Clerk's identity.
 */
export async function ensureUser(clerkId: string, email?: string) {
  return prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, email: email ?? null },
    update: email ? { email } : {},
  });
}

export interface UserPlanState {
  plan: Plan;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
  periodEnd: Date | null;
  isNearLimit: boolean;
}

/**
 * Read the current plan state for gating UI + API. Creates the user if the
 * row is missing so callers never have to null-check.
 */
export async function getUserPlanState(clerkId: string): Promise<UserPlanState> {
  const user = await ensureUser(clerkId);
  const plan = normalizePlan(user.plan);
  const auditsLimit = PLAN_LIMITS[plan];
  const auditsUsed = user.auditsUsed;
  const remaining = auditsLimit - auditsUsed;

  return {
    plan,
    auditsUsed,
    auditsLimit,
    canAnalyze: auditsUsed < auditsLimit,
    periodEnd: user.periodEnd,
    isNearLimit: remaining > 0 && remaining <= Math.max(1, Math.ceil(auditsLimit * 0.1)),
  };
}

/**
 * Atomically increments auditsUsed. Uses an interactive transaction so the
 * limit check and the increment happen against the same snapshot — two
 * concurrent requests can't both squeeze past the boundary.
 */
export async function incrementAuditsInTx(clerkId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { clerkId },
      create: { clerkId },
      update: {},
    });

    const plan = normalizePlan(user.plan);
    const limit = PLAN_LIMITS[plan];

    if (user.auditsUsed >= limit) {
      throw new Error(
        `Audit limit reached for plan "${plan}" (${user.auditsUsed}/${limit}).`,
      );
    }

    return tx.user.update({
      where: { id: user.id },
      data: { auditsUsed: { increment: 1 } },
    });
  });
}

/** Reset the running audit count — call at billing period rollover. */
export async function resetQuota(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { auditsUsed: 0 },
  });
}

/**
 * Update the plan tier and optionally the period boundary. When periodEnd is
 * supplied we also stamp periodStart to now so the window is coherent.
 */
export async function setUserPlan(userId: string, plan: Plan, periodEnd?: Date) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      ...(periodEnd
        ? { periodStart: new Date(), periodEnd }
        : {}),
    },
  });
}
