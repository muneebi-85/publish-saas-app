/**
 * Entitlement rules — the pure decision layer behind plan gating.
 *
 * Separate from `session.ts` on purpose. That module is the I/O shell: it pulls
 * in Prisma and React's request `cache`, both of which only work inside a server
 * runtime. The rules below decide who keeps paid access and who loses it, and
 * they are the part worth pinning down with tests, so they live where a plain
 * Node process can import them.
 *
 * Everything here is pure and takes the current time as an argument. No clock,
 * no database, no environment.
 */

/**
 * Tier identities and allowances live in `plans.ts` — the one catalogue the
 * client hook, the billing registry and both pricing surfaces also read. They are
 * re-exported here so existing importers keep working, and so that nothing can
 * define a second, competing set of limits.
 */
export type { Plan } from './plans';
export { PLAN_LIMITS, PLAN_ORDER, planRank, isUpgrade } from './plans';

import type { Plan } from './plans';

/**
 * Paid access is honoured this far past `periodEnd`. A renewal webhook that is
 * slow, retried, or briefly lost must never lock out someone who has paid — we
 * would rather give away three days than break a customer's workflow.
 */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How long a failing card keeps access while Lemon Squeezy retries the charge.
 * LS gives up after roughly two weeks of dunning, so this is the outer bound.
 */
export const DUNNING_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Subscription statuses that still represent a live, paid-for entitlement. */
const LIVE_STATUSES = new Set(['active', 'on_trial']);
/** Statuses where the charge is failing but LS has not given up yet. */
const RETRYING_STATUSES = new Set(['past_due', 'unpaid']);

/**
 * Coerce a stored tier string to a known plan. Anything unrecognized — a typo, a
 * renamed tier, a value written by a future version — resolves to `free` rather
 * than silently granting a paid allowance.
 */
export function normalizePlan(plan: string): Plan {
  const p = plan.toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'agency') return p;
  return 'free';
}

/**
 * True once a paid period is far enough past its end to be worth checking the
 * subscription record. Kept separate so the extra query stays on the rare
 * overdue path rather than running on every read.
 */
export function isPaidPeriodOverdue(periodEnd: Date, now: number): boolean {
  return now - periodEnd.getTime() > RENEWAL_GRACE_MS;
}

/** The minimal subscription shape the entitlement decision needs. */
export interface SubscriptionFacts {
  status: string;
  currentPeriodEnd: Date;
  lsSubscriptionId: string;
}

export interface EntitlementVerdict {
  /** The tier the user is actually entitled to. */
  plan: Plan;
  /** What the caller must persist as a result. */
  write: 'none' | 'extend-period' | 'downgrade';
  /** The corrected boundary, set only when `write` is `extend-period`. */
  periodEnd?: Date;
  /** Why, for the log line. Always present for `downgrade` and for anomalies. */
  reason?: string;
  /** Paid access was kept despite an inconsistent local record — worth logging. */
  anomaly?: boolean;
}

/**
 * Decide what a stored paid tier is really entitled to, given the subscription
 * record behind it.
 *
 * Callers must have already established that `stored` is a paid tier and that
 * `periodEnd` is overdue (see `isPaidPeriodOverdue`) — the cheap checks stay in
 * the caller so the common case costs nothing.
 *
 * The bias is deliberate and asymmetric: revoke only on positive evidence that
 * the entitlement is over. Ambiguity — Lemon Squeezy still reports "active" but
 * our period boundary looks stale — keeps access and reports an anomaly, because
 * wrongly locking out a payer is far worse than a late sweep.
 */
export function decideEntitlement(
  stored: Plan,
  periodEnd: Date,
  sub: SubscriptionFacts | null,
  now: number,
): EntitlementVerdict {
  if (!sub) {
    return {
      plan: 'free',
      write: 'downgrade',
      reason: 'paid period ended and no subscription is on record',
    };
  }

  const status = sub.status.toLowerCase();
  const live = LIVE_STATUSES.has(status);

  // A newer period than the user row knows about: the renewal landed on the
  // subscription but the user row was not carried forward. Trust the newer one.
  // The one-minute floor keeps ordinary clock skew from reading as a renewal.
  if (sub.currentPeriodEnd.getTime() - periodEnd.getTime() > 60_000 && live) {
    return { plan: stored, write: 'extend-period', periodEnd: sub.currentPeriodEnd };
  }

  if (live) {
    return {
      plan: stored,
      write: 'none',
      anomaly: true,
      reason:
        `is past periodEnd but subscription ${sub.lsSubscriptionId} still reads "${status}" — ` +
        `keeping "${stored}". A renewal webhook was likely missed.`,
    };
  }

  if (RETRYING_STATUSES.has(status)) {
    if (now - periodEnd.getTime() <= DUNNING_GRACE_MS) {
      return { plan: stored, write: 'none' };
    }
    return {
      plan: 'free',
      write: 'downgrade',
      reason: `payment has been failing since ${periodEnd.toISOString()}`,
    };
  }

  // cancelled / expired / paused, or a status we do not recognize — and the
  // period they paid for is over. Unknown is treated as finished, not as live:
  // only a recognized live status justifies keeping a lapsed tier.
  return {
    plan: 'free',
    write: 'downgrade',
    reason: `subscription status "${status}" with the paid period ended`,
  };
}

/**
 * Thrown by the quota debit when the plan's monthly allowance is spent.
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
