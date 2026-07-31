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

export type Plan = 'free' | 'starter' | 'pro' | 'agency';

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 25,
  pro: 100,
  agency: 500,
};

/**
 * Paid access is honoured this far past `periodEnd`. A renewal webhook that is
 * slow, retried, or briefly lost must never lock out someone who has paid — we
 * would rather give away three days than break a customer's workflow.
 */
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How long a failing card keeps access while Lemon Squeezy retries the charge.
 * LS gives up after roughly two weeks of dunning, so this is the outer bound.
 */
const DUNNING_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Subscription statuses that still represent a live, paid-for entitlement. */
const LIVE_STATUSES = new Set(['active', 'on_trial']);
/** Statuses where the charge is failing but LS has not given up yet. */
const RETRYING_STATUSES = new Set(['past_due', 'unpaid']);

function normalizePlan(plan: string): Plan {
  const p = plan.toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'agency') return p;
  return 'free';
}

/**
 * Upsert a User row keyed by Clerk id. Cached per request.
 */
export const ensureUser = cache(async (clerkId: string, email?: string) => {
  // Try to find first to avoid unnecessary write transactions if the user exists and email hasn't changed.
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing && (!email || existing.email === email)) {
    return existing;
  }
  
  return prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, email: email ?? null },
    update: email ? { email } : {},
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
 * The bias is deliberate and asymmetric: we only revoke when the local record
 * gives us positive evidence that the entitlement is over. Ambiguity (LS still
 * reports "active" but our period boundary looks stale) keeps access and logs an
 * anomaly, because wrongly locking out a payer is far worse than a late sweep.
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

  const overdueMs = Date.now() - user.periodEnd.getTime();
  if (overdueMs <= RENEWAL_GRACE_MS) return stored;

  // Only now — on the rare overdue path — do we pay for the extra query.
  const sub = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodEnd: true, lsSubscriptionId: true },
  });

  if (!sub) {
    await downgradeToFree(user.id, 'paid period ended and no subscription is on record');
    return 'free';
  }

  const status = sub.status.toLowerCase();

  // A newer period than the user row knows about: the renewal landed on the
  // subscription but the user row was not carried forward. Trust the newer one.
  if (sub.currentPeriodEnd.getTime() - user.periodEnd.getTime() > 60_000 && LIVE_STATUSES.has(status)) {
    await prisma.user
      .update({ where: { id: user.id }, data: { periodEnd: sub.currentPeriodEnd } })
      .catch(() => undefined);
    return stored;
  }

  if (LIVE_STATUSES.has(status)) {
    console.warn(
      `[entitlement] ${user.id} is past periodEnd but subscription ${sub.lsSubscriptionId} ` +
        `still reads "${status}" — keeping "${stored}". A renewal webhook was likely missed.`,
    );
    return stored;
  }

  if (RETRYING_STATUSES.has(status)) {
    if (overdueMs <= DUNNING_GRACE_MS) return stored;
    await downgradeToFree(user.id, `payment has been failing since ${user.periodEnd.toISOString()}`);
    return 'free';
  }

  // cancelled / expired / paused, and the period they paid for is over.
  await downgradeToFree(user.id, `subscription status "${status}" with the paid period ended`);
  return 'free';
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
 * Thrown by incrementAuditsInTx when the plan's monthly allowance is spent.
 * A distinct class so routes can answer 402 (payment required) instead of
 * mistaking a quota boundary for a 500.
 */
export class QuotaExceededError extends Error {
  readonly plan: Plan;
  readonly auditsUsed: number;
  readonly auditsLimit: number;

  constructor(plan: Plan, auditsUsed: number, auditsLimit: number) {
    super(`Audit limit reached for plan "${plan}" (${auditsUsed}/${auditsLimit}).`);
    this.name = 'QuotaExceededError';
    this.plan = plan;
    this.auditsUsed = auditsUsed;
    this.auditsLimit = auditsLimit;
  }
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
