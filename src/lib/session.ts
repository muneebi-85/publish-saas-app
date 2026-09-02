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
  canStartReview,
  decideEntitlement,
  decideDebit,
  isFreeWindowElapsed,
  isPaidPeriodOverdue,
  LIVE_STATUSES,
  normalizePlan,
  PLAN_LIMITS,
  FREE_PERIOD_MS,
  RENEWAL_GRACE_MS,
  type EntitlementVerdict,
  type Plan,
} from './entitlement';

// The rules themselves live in `entitlement.ts`, which is pure and unit-tested.
// They are re-exported here because this module has always been the import site
// for plan types and limits, and every route depends on that.
export {
  PLAN_LIMITS,
  QuotaExceededError,
  canStartReview,
  decideDebit,
  decideEntitlement,
  isPaidPeriodOverdue,
  normalizePlan,
} from './entitlement';
export type { Plan, SubscriptionFacts, EntitlementVerdict, DebitDecision } from './entitlement';

import { QuotaExceededError } from './entitlement';
import { sendQuotaWarning } from './email';

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
  /**
   * Bonus reviews earned from referrals and challenges. They extend the wall
   * past the plan's monthly allowance, so `canAnalyze` can be true even when
   * the meter is full — the UI shows them alongside the counter.
   */
  referralCredits: number;
}

/**
 * Drop a stale paid tier back to free and start a clean free-tier counter.
 * Mirrors exactly what the `subscription_expired` webhook does, so a webhook we
 * never received and a sweep that notices it produce identical state. The
 * free window is stamped at downgrade so the monthly free allowance restarts
 * from the downgrade date rather than from whatever stale paid boundary the
 * row still carries.
 */
export async function downgradeToFree(userId: string, why: string): Promise<void> {
  console.warn(`[entitlement] downgrading ${userId} to free — ${why}`);
  // Throws on failure rather than swallowing: the billing webhook calls this
  // inside its own try/catch, and a swallowed write made it answer 200 with
  // `appliedPlan: 'free'` for a downgrade that never landed — a false success
  // with the delivery marked processed and never retried. The read-path
  // reconciler catches locally so a transient DB error degrades, not throws.
  await prisma.user.update({ where: { id: userId }, data: { plan: 'free', auditsUsed: 0, periodStart: new Date() } });
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
 *
 * Returns the verdict so the caller can hand the UI the CORRECTED periodEnd on
 * the same request that computed it; reading the pre-reconciliation snapshot
 * showed a user whose renewal just landed an expired-looking date until the
 * next request came in.
 */
async function reconcileEntitlement(user: {
  id: string;
  plan: string;
  periodEnd: Date | null;
}): Promise<EntitlementVerdict & { plan: Plan }> {
  const stored = normalizePlan(user.plan);
  if (stored === 'free') return { plan: stored, write: 'none' };
  // No period boundary at all means the tier was granted out of band (an admin
  // comp, a seed). Nothing to expire against, so leave it be.
  if (!user.periodEnd) return { plan: stored, write: 'none' };
  if (!isPaidPeriodOverdue(user.periodEnd, Date.now())) return { plan: stored, write: 'none' };

  // Only now — on the rare overdue path — do we pay for the extra queries.
  // Live rows first: `subscription_cancelled` writes status 'cancelled' with a
  // currentPeriodEnd months out, and an orderBy-by-periodEnd alone would let
  // that dead-but-future-dated row shadow a live monthly renewal whose webhook
  // was missed — the very case this reconciliation exists to repair. Only when
  // no live-status row exists at all do we read the newest dead row, because a
  // genuinely-expired sub is the signal that the tier really ended.
  const live = await prisma.subscription.findFirst({
    where: { userId: user.id, status: { in: [...LIVE_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodEnd: true, lsSubscriptionId: true },
  });
  const sub =
    live ??
    (await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, lsSubscriptionId: true },
    }));

  const verdict = decideEntitlement(stored, user.periodEnd, sub, Date.now());

  if (verdict.anomaly && verdict.reason) {
    console.warn(`[entitlement] ${user.id} ${verdict.reason}`);
  }

  if (verdict.write === 'downgrade') {
    // Self-healing read path: a transient DB error here must degrade (the next
    // read re-attempts), not break the page the user is loading. The billing
    // webhook calls downgradeToFree directly and propagates the throw instead.
    await downgradeToFree(user.id, verdict.reason ?? 'entitlement expired').catch((e) =>
      console.error('[entitlement] downgrade write failed:', e),
    );
  } else if (verdict.write === 'extend-period' && verdict.periodEnd) {
    // A newer period means the renewal landed on the subscription but the
    // user row was never carried forward — the payment_success webhook that
    // would have reset the monthly counter was missed. Repairing the boundary
    // alone leaves a customer who just paid 402-blocked on a full counter for
    // the whole period, so the repair carries the counter reset the missed
    // webhook would have made.
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          auditsUsed: 0,
          periodStart: user.periodEnd ?? verdict.periodEnd,
          periodEnd: verdict.periodEnd,
        },
      })
      .catch(() => undefined);
  }

  return verdict;
}

/**
 * Read the current plan state for gating UI + API. Cached per request.
 */
export const getUserPlanState = cache(async (clerkId: string): Promise<UserPlanState> => {
  const user = await ensureUser(clerkId);
  const verdict = await reconcileEntitlement(user);
  const plan = verdict.plan;
  const auditsLimit = PLAN_LIMITS[plan];
  // A downgrade zeroes the counter, so read it back from the reconciled tier
  // rather than the pre-reconciliation snapshot.
  let auditsUsed = plan === normalizePlan(user.plan) ? user.auditsUsed : 0;

  // The free tier has no billing webhook to maintain its window, so the read
  // path rolls it: once 30 days have passed since `periodStart` (or the stamp
  // is missing, which means the row predates window tracking), the monthly
  // counter starts over. The persisted reset is best-effort — the debit path
  // applies the same roll inside its transaction, which is what actually
  // enforces it; this write keeps the meter the UI shows truthful.
  if (plan === 'free' && isFreeWindowElapsed(user.periodStart, Date.now())) {
    auditsUsed = 0;
    if (user.auditsUsed !== 0) {
      await prisma.user
        .updateMany({
          where: {
            id: user.id,
            plan: 'free',
            OR: [
              { periodStart: null },
              { periodStart: { lt: new Date(Date.now() - FREE_PERIOD_MS) } },
            ],
          },
          data: { auditsUsed: 0, periodStart: new Date() },
        })
        .catch(() => undefined);
    }
  }

  const remaining = auditsLimit - auditsUsed;
  const referralCredits = Math.max(0, user.referralCredits);

  return {
    plan,
    role: user.role,
    auditsUsed,
    auditsLimit,
    // The pure gate the debit uses too, so the meter and the enforcement can
    // never disagree about whether a bonus credit keeps the wall open.
    canAnalyze: canStartReview(auditsUsed, auditsLimit, referralCredits),
    // The reconciled boundary, not the pre-reconciliation snapshot: when a
    // missed renewal was just corrected, the UI sees the new date on the same
    // request that corrected it.
    periodEnd: verdict.periodEnd ?? user.periodEnd,
    isNearLimit: remaining > 0 && remaining <= Math.max(1, Math.ceil(auditsLimit * 0.1)),
    referralCredits,
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
    if (next.plan === 'free') downgraded += 1;
  }
  return { scanned: candidates.length, downgraded };
}

/**
 * Atomically debit one review. Uses an interactive transaction plus
 * conditional predicates (`WHERE auditsUsed = <value read>` /
 * `WHERE referralCredits > 0`) on every write, so two concurrent requests
 * cannot both squeeze past the boundary: the losers' predicates stop matching
 * and they re-decide against freshly read state or hit the honest 402.
 *
 * Payment order matches the documented promise: the plan's monthly allowance
 * first, then a referral/challenge credit when the allowance is spent. A credit
 * payment does NOT touch `auditsUsed` — the monthly counter only ever counts
 * allowance-paid reviews — so the meter stays truthful and a period rollover
 * cannot resurrect spent credits.
 *
 * The free tier's monthly window is rolled inside this same transaction
 * (`isFreeWindowElapsed`): the debit is what authoritatively enforces the
 * free plan's monthly allowance, since no billing webhook exists for it.
 *
 * Throws QuotaExceededError when both pools are empty. Returns the state *after*
 * the debit, which callers must use for the response: getUserPlanState() is
 * React-cache()'d per request and would still report the pre-debit value.
 *
 * Crossing the near-limit threshold schedules a quota-warning email (the
 * Settings copy promises one). It is fired AFTER the transaction commits and
 * never awaited here — a mail outage must not block or fail a paid review —
 * and honours the `productEmails` opt-out that governs exactly this mail.
 */
export async function incrementAuditsInTx(clerkId: string): Promise<{
  plan: Plan;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
  /** True when this review was paid with a referral/challenge credit. */
  usedReferralCredit: boolean;
  referralCredits: number;
}> {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { clerkId },
      create: { clerkId },
      update: {},
    });

    const plan = normalizePlan(user.plan);
    const limit = PLAN_LIMITS[plan];
    const referralCredits = Math.max(0, user.referralCredits);

    // Roll the free-tier window before deciding, inside the same transaction
    // the debit runs in — this is the authoritative enforcement of the free
    // plan's monthly allowance. Paid tiers skip it: their window is maintained
    // by billing webhooks, and re-stamping it here would fight the webhook.
    let auditsUsed = user.auditsUsed;
    if (plan === 'free' && isFreeWindowElapsed(user.periodStart, Date.now())) {
      auditsUsed = 0;
      // Conditional so two concurrent debits cannot each mint a fresh window
      // and each get a free audit: only the one that still sees the elapsed
      // stamp wins; the loser's predicate no longer matches and it re-reads.
      const rolled = await tx.user.updateMany({
        where: {
          id: user.id,
          plan: 'free',
          OR: [
            { periodStart: null },
            { periodStart: { lt: new Date(Date.now() - FREE_PERIOD_MS) } },
          ],
        },
        data: { auditsUsed: 0, periodStart: new Date() },
      });
      if (rolled.count === 0) {
        // A concurrent debit already rolled the window — use the counter it
        // left behind instead of the stale pre-roll snapshot.
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { auditsUsed: true },
        });
        auditsUsed = fresh?.auditsUsed ?? auditsUsed;
      }
    }

    const debit = decideDebit(auditsUsed, limit, referralCredits);

    if (!debit.ok) {
      throw new QuotaExceededError(plan, auditsUsed, limit);
    }

    if (debit.source === 'referral_credit') {
      // Spend a credit; the monthly counter is untouched. The conditional
      // predicate keeps a concurrent debit from spending the same credit.
      const updated = await tx.user.updateMany({
        where: { id: user.id, referralCredits: { gt: 0 } },
        data: { referralCredits: { decrement: 1 } },
      });
      if (updated.count === 1) {
        const creditsLeft = referralCredits - 1;
        return {
          user,
          plan,
          auditsUsed,
          auditsLimit: limit,
          canAnalyze: creditsLeft > 0 || auditsUsed < limit,
          usedReferralCredit: true,
          referralCredits: creditsLeft,
        };
      }
      // The credit vanished between the read and the write (a concurrent
      // challenge/refund raced us). Re-throw as the honest boundary outcome —
      // the caller answers 402 and the user retries.
      throw new QuotaExceededError(plan, auditsUsed, limit);
    }

    // Allowance debit. The conditional predicate is the race guard: a plain
    // increment under READ COMMITTED lets N concurrent debits that all read
    // `auditsUsed < limit` each increment past the boundary. Asserting the
    // pre-read value in the WHERE clause means only one of them can win;
    // the losers see count 0, re-read, and either debit against the now-full
    // counter's real state or hit the honest 402.
    const updated = await tx.user.updateMany({
      where: { id: user.id, auditsUsed },
      data: { auditsUsed: { increment: 1 } },
    });
    if (updated.count === 0) {
      // Lost the race — re-read the authoritative counter and retry once,
      // with the same conditional predicates the primary branches use.
      const fresh = await tx.user.findUnique({
        where: { id: user.id },
        select: { auditsUsed: true, referralCredits: true },
      });
      const nowUsed = fresh?.auditsUsed ?? auditsUsed;
      const nowCredits = Math.max(0, fresh?.referralCredits ?? referralCredits);
      const retryDebit = decideDebit(nowUsed, limit, nowCredits);
      if (!retryDebit.ok) {
        throw new QuotaExceededError(plan, nowUsed, limit);
      }
      const retried = retryDebit.source === 'referral_credit'
        ? await tx.user.updateMany({
            where: { id: user.id, referralCredits: { gt: 0 } },
            data: { referralCredits: { decrement: 1 } },
          })
        : await tx.user.updateMany({
            where: { id: user.id, auditsUsed: nowUsed },
            data: { auditsUsed: { increment: 1 } },
          });
      if (retried.count === 0) {
        // The counter and/or credits moved again mid-retry. Answer 402 rather
        // than guessing a third time — a retrying client succeeds on the next
        // pass, which decides against genuinely current state.
        throw new QuotaExceededError(plan, nowUsed, limit);
      }
      const usedCredit = retryDebit.source === 'referral_credit';
      const afterUsed = usedCredit ? nowUsed : nowUsed + 1;
      const afterCredits = usedCredit ? nowCredits - 1 : nowCredits;
      return {
        user,
        plan,
        auditsUsed: afterUsed,
        auditsLimit: limit,
        canAnalyze: canStartReview(afterUsed, limit, afterCredits),
        usedReferralCredit: usedCredit,
        referralCredits: afterCredits,
      };
    }

    return {
      user,
      plan,
      auditsUsed: auditsUsed + 1,
      auditsLimit: limit,
      canAnalyze: canStartReview(auditsUsed + 1, limit, referralCredits),
      usedReferralCredit: false,
      referralCredits,
    };
  });

  maybeSendQuotaWarning(
    result.user,
    result.auditsUsed,
    result.auditsLimit,
    result.plan,
    result.usedReferralCredit,
  );
  return result;
}

/**
 * Fire the near-limit quota warning exactly once per boundary crossing: only
 * when the just-completed debit landed ON the threshold (not every audit
 * after it), only for allowance-paid debits, only when the user has not
 * opted out of product mail.
 *
 * `usedReferralCredit` skips the mail on credit-paid debits: those debits run
 * with `auditsUsed === auditsLimit` by definition (credits are only spent
 * once the allowance is full), so without the check every bonus review would
 * email "you have used 100% of your quota" while the credits that paid for
 * it keep the wall open — false copy the Settings page makes a promise about.
 */
function maybeSendQuotaWarning(
  user: { email: string | null; productEmails: boolean },
  auditsUsed: number,
  auditsLimit: number,
  plan: Plan,
  usedReferralCredit: boolean,
): void {
  if (usedReferralCredit) return;
  if (!user.email || !user.productEmails) return;
  if (auditsLimit <= 0) return;
  // The warning lands when usage reaches 80% (or exactly the limit), on the
  // audit that crossed it — `auditsUsed === threshold`, not `>=`, is what
  // makes it once-per-period rather than once-per-review.
  const threshold = Math.max(1, Math.floor(auditsLimit * 0.8));
  if (auditsUsed !== threshold && auditsUsed !== auditsLimit) return;

  void sendQuotaWarning({
    to: user.email,
    used: auditsUsed,
    limit: auditsLimit,
    plan,
  }).catch((e) => console.error('[session] quota warning mail failed:', e));
}

/**
 * Give back one review. Called when a charged review ultimately failed, so the
 * creator is never billed for a report they did not receive.
 *
 * `usedReferralCredit` must mirror how the debit was paid (the caller knows —
 * the enqueue route from `incrementAuditsInTx`, the async sweeps from the job
 * row): an allowance debit restores the monthly counter, a credit debit
 * restores the credit. Restoring the wrong pool would either hand out free
 * monthly capacity or silently destroy a credit the user earned.
 *
 * The allowance refund floors at zero so a double-refund can't hand out free
 * capacity; the credit refund is unbounded upward by design because the credit
 * was genuinely taken.
 *
 * One implementation, keyed by row id: the two exported wrappers resolve the
 * Clerk id to the row and call it, so the pool-selection logic cannot drift
 * between the sync and async callers.
 */
async function refundAuditById(userId: string, usedReferralCredit: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await refundAuditInTx(tx, userId, usedReferralCredit);
  });
}

/**
 * The refund's write logic, parameterized by the transaction client so a caller
 * that already holds a transaction can fold the refund into it. Callers that
 * claim a job's `quotaCharged` flag and refund the slot in one transaction
 * close the loss window the flag/refund split otherwise leaves: a crash (or a
 * swallowed DB error) between the claim and the refund permanently dropped
 * the creator's slot under the split order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function refundAuditInTx(tx: any, userId: string, usedReferralCredit: boolean): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { auditsUsed: true },
  });
  if (!user) return;
  if (usedReferralCredit) {
    await tx.user.update({
      where: { id: userId },
      data: { referralCredits: { increment: 1 } },
    });
    return;
  }
  if (user.auditsUsed <= 0) return;
  // Conditional so the floor holds even under a concurrent debit/rollover
  // that moved the counter between the read and this write.
  await tx.user.updateMany({
    where: { id: userId, auditsUsed: { gt: 0 } },
    data: { auditsUsed: { decrement: 1 } },
  });
}

export async function refundAudit(clerkId: string, usedReferralCredit = false): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) return;
  await refundAuditById(user.id, usedReferralCredit);
}

/**
 * Same refund, keyed by our internal id. Used by the scheduled reconciler and
 * the review worker, which work from job rows and never see a Clerk id.
 */
export async function refundAuditByUserId(
  userId: string,
  usedReferralCredit = false,
): Promise<void> {
  await refundAuditById(userId, usedReferralCredit);
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
