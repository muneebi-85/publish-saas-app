/**
 * Session + plan-quota helpers.
 *
 * These wrap Prisma with our plan gating rules so route handlers don't have to
 * re-derive limits or worry about race conditions when incrementing usage.
 * All functions accept a Clerk user id (external identity) except the setters
 * which take our internal DB id.
 */

import { prisma } from './db';
import { Role } from '@prisma/client';
import { cache } from 'react';
import {
  decideEntitlement,
  isPaidPeriodOverdue,
  normalizePlan,
  PLAN_LIMITS,
  RENEWAL_GRACE_MS,
  type Plan,
} from './entitlement';

// The rules themselves live in `entitlement.ts`, which is pure and unit-tested.
// They are re-exported here because this module has always been the import site
// for plan types and limits, and every route depends on that.
export {
  PLAN_LIMITS,
  QuotaExceededError,
  decideEntitlement,
  isPaidPeriodOverdue,
  normalizePlan,
} from './entitlement';
export type { Plan, SubscriptionFacts, EntitlementVerdict } from './entitlement';

import { QuotaExceededError } from './entitlement';

/**
 * Upsert a User row keyed by Clerk id. Cached per request.
 *
 * `avatarUrl` is written here as well as in the Clerk webhook. The webhook only
 * fires for accounts created or edited after it was configured, so on its own it
 * leaves every pre-existing user with a null avatar forever — and Settings then
 * renders the initial-letter fallback for people who do have a profile picture.
 * This path runs on every authenticated request, so it backfills them.
 */
export const ensureUser = cache(async (clerkId: string, email?: string, avatarUrl?: string) => {
  // Read first so the common case (nothing changed) costs one query and no write
  // transaction. A write on every request would put the whole app behind the
  // primary and serialize concurrent requests from the same user.
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  const emailFresh = !email || existing?.email === email;
  const avatarFresh = !avatarUrl || existing?.avatarUrl === avatarUrl;
  if (existing && emailFresh && avatarFresh) {
    return existing;
  }

  return prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, email: email ?? null, avatarUrl: avatarUrl ?? null },
    // Only overwrite what Clerk actually gave us. Writing `undefined` through
    // would be a no-op in Prisma, but writing null would erase a good value on
    // a request where Clerk simply did not return the field.
    update: {
      ...(email ? { email } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    },
  });
});

export interface UserPlanState {
  plan: Plan;
  role: Role;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
  periodEnd: Date | null;
  isNearLimit: boolean;
}

/**
 * Drop a stale paid tier back to free and start a clean free-tier counter.
 * Mirrors exactly what the `subscription_expired` webhook does, so a webhook we
 * never received and a sweep that notices it produce identical state.
 */
async function downgradeToFree(userId: string, why: string): Promise<void> {
  console.warn(`[entitlement] downgrading ${userId} to free — ${why}`);
  await prisma.user
    .update({ where: { id: userId }, data: { plan: 'free', auditsUsed: 0 } })
    .catch((e) => console.error('[entitlement] downgrade write failed:', e));
}

/**
 * Reconcile the stored tier against what the subscription record actually
 * supports.
 *
 * Webhooks get lost. Without this, a missing `subscription_expired` leaves a
 * cancelled customer on Agency indefinitely — the paid product given away with
 * no charge behind it. The read path is the one place guaranteed to run, so the
 * check lives here and self-heals the row when it fires.
 *
 * This is the I/O shell only: the decision itself is `decideEntitlement`, which
 * is pure and unit-tested. The cheap guards stay here so the overdue path — and
 * its extra query — is the exception, not the rule.
 */
async function reconcileEntitlement(user: {
  id: string;
  plan: string;
  periodEnd: Date | null;
}): Promise<Plan> {
  const stored = normalizePlan(user.plan);
  if (stored === 'free') return stored;
  // No period boundary at all means the tier was granted out of band (an admin
  // comp, a seed). Nothing to expire against, so leave it be.
  if (!user.periodEnd) return stored;
  if (!isPaidPeriodOverdue(user.periodEnd, Date.now())) return stored;

  // Only now — on the rare overdue path — do we pay for the extra query.
  const sub = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodEnd: true, lsSubscriptionId: true },
  });

  const verdict = decideEntitlement(stored, user.periodEnd, sub, Date.now());

  if (verdict.anomaly && verdict.reason) {
    console.warn(`[entitlement] ${user.id} ${verdict.reason}`);
  }

  if (verdict.write === 'downgrade') {
    await downgradeToFree(user.id, verdict.reason ?? 'entitlement expired');
  } else if (verdict.write === 'extend-period' && verdict.periodEnd) {
    await prisma.user
      .update({ where: { id: user.id }, data: { periodEnd: verdict.periodEnd } })
      .catch(() => undefined);
  }

  return verdict.plan;
}

/**
 * Read the current plan state for gating UI + API. Cached per request.
 */
export const getUserPlanState = cache(async (clerkId: string): Promise<UserPlanState> => {
  const user = await ensureUser(clerkId);
  const plan = await reconcileEntitlement(user);
  const auditsLimit = PLAN_LIMITS[plan];
  // A downgrade zeroes the counter, so read it back from the reconciled tier
  // rather than the pre-reconciliation snapshot.
  const auditsUsed = plan === normalizePlan(user.plan) ? user.auditsUsed : 0;
  const remaining = auditsLimit - auditsUsed;

  return {
    plan,
    role: user.role,
    auditsUsed,
    auditsLimit,
    canAnalyze: auditsUsed < auditsLimit,
    periodEnd: user.periodEnd,
    isNearLimit: remaining > 0 && remaining <= Math.max(1, Math.ceil(auditsLimit * 0.1)),
  };
});

/**
 * Batch sweep for the scheduled reconciler (`/api/cron/reconcile`). Catches the
 * accounts that would otherwise only self-heal the next time their owner happens
 * to open the app — which, for a churned customer, may be never.
 */
export async function reconcileExpiredPlans(limit = 500): Promise<{
  scanned: number;
  downgraded: number;
}> {
  const candidates = await prisma.user.findMany({
    where: {
      plan: { not: 'free' },
      periodEnd: { lt: new Date(Date.now() - RENEWAL_GRACE_MS) },
    },
    select: { id: true, plan: true, periodEnd: true },
    orderBy: { periodEnd: 'asc' },
    take: limit,
  });

  let downgraded = 0;
  for (const candidate of candidates) {
    const next = await reconcileEntitlement(candidate);
    if (next === 'free') downgraded += 1;
  }
  return { scanned: candidates.length, downgraded };
}

/**
 * Atomically increments auditsUsed. Uses an interactive transaction so the
 * limit check and the increment happen against the same snapshot — two
 * concurrent requests can't both squeeze past the boundary.
 *
 * Throws QuotaExceededError when the allowance is spent. Returns the plan state
 * *after* the debit, which callers must use for the response: getUserPlanState()
 * is React-cache()'d per request and would still report the pre-debit value.
 */
export async function incrementAuditsInTx(clerkId: string): Promise<{
  plan: Plan;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { clerkId },
      create: { clerkId },
      update: {},
    });

    const plan = normalizePlan(user.plan);
    const limit = PLAN_LIMITS[plan];

    if (user.auditsUsed >= limit) {
      throw new QuotaExceededError(plan, user.auditsUsed, limit);
    }

    const updated = await tx.user.update({
      where: { id: user.id },
      data: { auditsUsed: { increment: 1 } },
    });

    return {
      plan,
      auditsUsed: updated.auditsUsed,
      auditsLimit: limit,
      canAnalyze: updated.auditsUsed < limit,
    };
  });
}

/**
 * Give back one audit. Called when a charged review ultimately failed, so the
 * creator is never billed an allowance slot for a report they did not receive.
 * Floors at zero so a double-refund can't hand out free capacity.
 */
export async function refundAudit(clerkId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { clerkId }, select: { id: true, auditsUsed: true } });
    if (!user || user.auditsUsed <= 0) return;
    await tx.user.update({
      where: { id: user.id },
      data: { auditsUsed: { decrement: 1 } },
    });
  });
}

/**
 * Same refund, keyed by our internal id. Used by the scheduled reconciler, which
 * works from job rows and never sees a Clerk id.
 */
export async function refundAuditByUserId(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { auditsUsed: true } });
    if (!user || user.auditsUsed <= 0) return;
    await tx.user.update({ where: { id: userId }, data: { auditsUsed: { decrement: 1 } } });
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
