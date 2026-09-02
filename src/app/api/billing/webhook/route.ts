/**
 * POST /api/billing/webhook — Lemon Squeezy subscription lifecycle receiver.
 *
 * This is the ONLY code path that grants or revokes a paid plan. The checkout
 * return URL grants nothing; the client can never assert a tier.
 *
 * Three properties this file has to guarantee, because money depends on them:
 *
 *   1. Authenticity — the raw body is HMAC-verified before it is parsed.
 *   2. Exactly-once *effect* — a duplicate delivery is a no-op, but a delivery we
 *      failed to process must stay retryable. That is why the dedup row is
 *      deleted again if the handler throws: recording "seen" before the work
 *      succeeds would silently drop a paid upgrade forever.
 *   3. Never downgrade on ambiguity — if we cannot map the purchased variant id
 *      to a plan we leave the tier alone and log loudly. Guessing 'free' here
 *      would lock a paying customer out of the product they just bought.
 */

import { NextResponse } from 'next/server';
import { verifyWebhookSignature, LemonEvent } from '@/lib/billing/lemonsqueezy';
import { resolvePlan, asPlan, parseDate } from '@/lib/billing/plan-resolution';
import { isUpgrade } from '@/lib/plans';
import { prisma } from '@/lib/db';
import { setUserPlan, resetQuota, downgradeToFree, PLAN_LIMITS, Plan } from '@/lib/session';
import { sendPaymentFailed, sendPlanActivated } from '@/lib/email';
import { env } from '@/lib/env';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Upgrade vs. downgrade is decided by `isUpgrade` from the plan catalogue —
// the one ladder the whole app shares. This route used to carry its own
// `{ free: 0, starter: 1, pro: 2, agency: 3 }` ranking, which is the id order
// rather than the price order: it read the cheaper Pro tier ($19) as an upgrade
// over the pricier Creator tier ($49) and reset the allowance on a mid-cycle
// DOWNGRADE, handing out free reviews, while a real upgrade the other way got
// no fresh allowance at all.

/** Dedup rows are only useful for as long as Lemon Squeezy might retry. */
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** The variant ids the webhook resolves against, from env. */
const VARIANT_MAP = {
  starter: env.LS_VARIANT_STARTER,
  pro: env.LS_VARIANT_PRO,
  agency: env.LS_VARIANT_AGENCY,
  starterYearly: env.LS_VARIANT_STARTER_YEARLY,
  proYearly: env.LS_VARIANT_PRO_YEARLY,
  agencyYearly: env.LS_VARIANT_AGENCY_YEARLY,
};

interface LSAttributes {
  status?: string;
  user_email?: string;
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  variant_name?: string;
  variant_id?: number | string;
  urls?: { update_payment_method?: string; customer_portal?: string };
  customer_id?: number | string;
}

interface LSPayload {
  meta?: {
    event_name?: LemonEvent;
    custom_data?: { user_id?: string; plan?: string };
  };
  data?: {
    id?: string;
    attributes?: LSAttributes;
  };
}

async function findOrCreateUser(clerkId: string | undefined, email: string | undefined) {
  if (clerkId) {
    return prisma.user.upsert({
      where: { clerkId },
      create: { clerkId, email: email ?? null },
      update: email ? { email } : {},
    });
  }
  // No signed user id (e.g. the buyer used a Lemon Squeezy-hosted link rather
  // than our checkout route). Match on the paying email instead. We never create
  // an account from an email alone — there would be no Clerk identity to attach.
  // The match is case-insensitive because the Clerk-sourced row and the
  // LS-captured billing email can differ purely in casing ("John@X.com" vs
  // "john@x.com") — a case-sensitive miss locked a paying customer out of
  // their entitlement. Clerk emails are unique per instance, so ONE matching
  // row is the healthy state and is attached deterministically. When several
  // rows genuinely share the address we refuse to guess: "attach to the
  // newest" silently granted the paid tier to whichever account most recently
  // claimed the address — an attacker registering the victim's email would
  // sit as the newest row and receive the entitlement instead of the buyer.
  // The callers ACK with a 500 so LS retries, and an operator can reconcile.
  if (email) {
    // `findFirst` with take:1, not findMany: the insensitive match seq-scans
    // (no functional index on lower(email)), and loading every matching row
    // to then use only the newest wastes the scan's whole payload.
    const newest = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!newest) return null;
    // Exactly one row is the healthy state — attach. More than one means the
    // address is claimed by several accounts (see the header comment): refuse
    // to pick one silently, because "newest wins" is exactly the ordering an
    // attacker registering the victim's address wins by. Returning null makes
    // the callers log + ACK-fail so LS retries and an operator reconciles.
    const duplicates = await prisma.user.count({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (duplicates > 1) {
      console.error(
        `[billing webhook] email ${email} matches ${duplicates} accounts — refusing to attach the entitlement automatically.`,
      );
      return null;
    }
    return newest;
  }
  return null;
}

/**
 * Opportunistic cleanup so WebhookEvent cannot grow without bound. Runs on a
 * small fraction of deliveries and never blocks the response on failure.
 */
let sinceLastPrune = 0;
async function maybePruneDedupRows() {
  sinceLastPrune += 1;
  if (sinceLastPrune < 50) return;
  sinceLastPrune = 0;
  await prisma.webhookEvent
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - DEDUP_RETENTION_MS) } } })
    .catch((e) => console.error('[billing webhook] dedup prune failed:', e));
}

export async function POST(req: Request) {
  // Every other public route is IP-throttled; the two webhook receivers were
  // the gap. Signature verification is cheap per request, but an unthrottled
  // flood of forgeries still buys unlimited HMAC work + log noise.
  const rl = await rateLimit(clientKey(req, 'webhook'), LIMITS.WEBHOOK.limit, LIMITS.WEBHOOK.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Cap before reading: webhook payloads are a few KB; the header claims
  // anything, and an uncapped `text()` read lets a forged multi-MB body burn
  // memory before the HMAC check even runs. 64 KB is comfortably above any
  // legitimate Lemon Squeezy delivery.
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > 64 * 1024) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  const raw = await req.text();
  if (raw.length > 256 * 1024) {
    // A chunked request with no content-length still cannot sneak past.
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  const sig = req.headers.get('x-signature');

  const ok = await verifyWebhookSignature(raw, sig);
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let payload: LSPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const event = payload.meta?.event_name;
  const clerkId = payload.meta?.custom_data?.user_id;
  const attrs = payload.data?.attributes ?? {};
  const lsSubscriptionId = payload.data?.id ?? '';
  const email = attrs.user_email;
  const lsCustomerId = attrs.customer_id != null ? String(attrs.customer_id) : null;

  const resolvedPlan = resolvePlan(
    attrs.variant_id,
    payload.meta?.custom_data?.plan,
    attrs.variant_name,
    VARIANT_MAP,
  );

  if (!event) {
    return NextResponse.json({ error: 'Missing meta.event_name' }, { status: 400 });
  }

  // ── Idempotency ───────────────────────────────────────────────────────────
  // event name + subscription id + the row's own updated_at uniquely identifies
  // one state transition, so a Lemon Squeezy retry of the SAME transition is a
  // no-op while a genuinely new transition still gets processed.
  const dedupKey = `${event}:${lsSubscriptionId}:${attrs.updated_at ?? attrs.created_at ?? ''}`;
  let holdsDedupRow = false;
  try {
    await prisma.webhookEvent.create({ data: { id: dedupKey } });
    holdsDedupRow = true;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true, deduped: true }, { status: 200 });
    }
    // The dedup table itself is unreachable. Fail closed with a 500 so Lemon
    // Squeezy retries rather than processing a payment event unguarded.
    console.error('[billing webhook] dedup insert failed:', err);
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
  }

  const periodStart = parseDate(attrs.created_at) ?? new Date();
  // A subscription that is ending has ends_at and a null renews_at; an active one
  // is the reverse. Only fall back to a computed month when LS sent neither.
  const periodEnd =
    parseDate(attrs.renews_at) ??
    parseDate(attrs.ends_at) ??
    new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);

  /** What the response reports back; only set when a tier was actually applied. */
  let appliedPlan: Plan | null = null;

  /**
   * Out-of-order delivery guard (monotonicity). The dedup key above catches a
   * redelivery of the SAME transition; it cannot catch a DIFFERENT, older
   * transition arriving late — last month's payment_success whose first
   * delivery 500'd and whose dedup row was released by design. Without this
   * guard that delivery reset the monthly counter to zero mid-cycle (free
   * reviews) and rolled the period boundary back. An event older than the
   * stamp is skipped; equal is the same transition (no-op); null stamp means
   * the row predates the guard and the event applies.
   */
  const eventAt = parseDate(attrs.updated_at) ?? parseDate(attrs.created_at);
  const isStale = (sub: { lastEventAt: Date | null }): boolean => {
    if (!sub.lastEventAt || !eventAt) return false;
    return eventAt.getTime() <= sub.lastEventAt.getTime();
  };

  try {
    switch (event) {
      case 'subscription_created':
      case 'subscription_resumed': {
        const user = await findOrCreateUser(clerkId, email);
        if (!user) {
          // Nothing we can safely attach the purchase to. Ack (a retry would hit
          // the same wall) but log everything an operator needs to fix it by hand.
          console.error(
            `[billing webhook] ${event} could not be matched to an account. ` +
              `subscription=${lsSubscriptionId} email=${email ?? 'none'} — link it manually.`,
          );
          break;
        }

        if (!resolvedPlan) {
          console.error(
            `[billing webhook] ${event}: variant_id=${String(attrs.variant_id)} ` +
              `("${attrs.variant_name ?? 'unnamed'}") is not mapped to a plan. ` +
              `Set LS_VARIANT_STARTER / LS_VARIANT_PRO / LS_VARIANT_AGENCY. ` +
              `Leaving ${user.id}'s plan at "${user.plan}" — a paid customer is NOT downgraded.`,
          );
          // Still record the subscription so the portal and reconciliation work.
          if (lsSubscriptionId) {
            await prisma.subscription.upsert({
              where: { lsSubscriptionId },
              create: {
                userId: user.id,
                lsSubscriptionId,
                plan: user.plan,
                status: attrs.status ?? 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                lastEventAt: eventAt,
              },
              update: {
                status: attrs.status ?? 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelledAt: null,
                lastEventAt: eventAt,
              },
            });
          }
          break;
        }

        // No-demote guard for the email-matched path (hosted payment links,
        // where custom_data.user_id is absent and LS does not verify receipt
        // email ownership): a cheap purchase made with someone else's email
        // must not overwrite that account's higher tier. The signed-clerkId
        // path (our own checkout) is exempt — that purchase IS the account's.
        if (!clerkId) {
          const currentPlan = asPlan(user.plan) ?? 'free';
          if (currentPlan !== 'free' && resolvedPlan !== currentPlan && !isUpgrade(currentPlan, resolvedPlan)) {
            console.error(
              `[billing webhook] ${event} via email match (${email}) would lower ` +
                `${user.id}'s "${currentPlan}" to "${resolvedPlan}" — refusing; the customer's tier is kept.`,
            );
            break;
          }
        }

        if (lsSubscriptionId) {
          await prisma.subscription.upsert({
            where: { lsSubscriptionId },
            create: {
              userId: user.id,
              lsSubscriptionId,
              plan: resolvedPlan,
              status: attrs.status ?? 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              lastEventAt: eventAt,
            },
            update: {
              // Re-assert ownership: a resumed subscription must follow the
              // account that actually holds it.
              userId: user.id,
              plan: resolvedPlan,
              status: attrs.status ?? 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelledAt: null,
              lastEventAt: eventAt,
            },
          });
        }

        await setUserPlan(user.id, resolvedPlan, periodEnd);
        // A new or resumed paid period starts with a full allowance.
        await resetQuota(user.id);
        if (lsCustomerId) {
          await prisma.user
            .update({ where: { id: user.id }, data: { lsCustomerId } })
            .catch(() => undefined);
        }
        appliedPlan = resolvedPlan;

        const notifyTo = email ?? user.email;
        if (notifyTo) {
          await sendPlanActivated({
            to: notifyTo,
            plan: resolvedPlan,
            dashboardUrl: `${env.APP_URL}/dashboard`,
          }).catch((e) => console.error('[billing webhook] activation email failed:', e));
        }
        break;
      }

      case 'subscription_updated': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });
        if (!sub) {
          // Out-of-order delivery: we have no row yet. Try to establish one so
          // the customer is not stuck without entitlement.
          const user = await findOrCreateUser(clerkId, email);
          if (user && resolvedPlan) {
            await prisma.subscription.create({
              data: {
                userId: user.id,
                lsSubscriptionId,
                plan: resolvedPlan,
                status: attrs.status ?? 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                lastEventAt: eventAt,
              },
            });
            await setUserPlan(user.id, resolvedPlan, periodEnd);
            await resetQuota(user.id);
            appliedPlan = resolvedPlan;
          } else {
            console.error(
              `[billing webhook] subscription_updated for unknown subscription ${lsSubscriptionId}` +
                ` (plan resolvable: ${Boolean(resolvedPlan)}).`,
            );
          }
          break;
        }

        // An older transition delivered late must not unwind a newer one
        // (stale portal plan-change or a rolled-back period boundary).
        if (isStale(sub)) {
          console.log(
            `[billing webhook] subscription_updated for ${lsSubscriptionId} is older than ` +
              `the last applied event — skipped (out-of-order delivery).`,
          );
          break;
        }

        // No mapping? Keep the tier the customer already has. Previously a
        // truthy-'free' fallback silently demoted them on any unmapped variant.
        const currentPlan = asPlan(sub.plan) ?? asPlan(sub.user.plan) ?? 'free';
        const nextPlan = resolvedPlan ?? currentPlan;
        if (!resolvedPlan) {
          console.error(
            `[billing webhook] subscription_updated: variant_id=${String(attrs.variant_id)} ` +
              `is not mapped to a plan; keeping "${currentPlan}".`,
          );
        }

        const status = attrs.status ?? sub.status;
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            plan: nextPlan,
            // LS reports a resumed subscription as active again.
            ...(status === 'active' ? { cancelledAt: null } : {}),
            lastEventAt: eventAt,
          },
        });

        const userPlan = asPlan(sub.user.plan) ?? 'free';
        if (nextPlan !== userPlan) {
          await setUserPlan(sub.userId, nextPlan, periodEnd);
          // Upgrading mid-cycle should immediately grant the larger allowance.
          // Downgrading must NOT reset — that would hand out extra reviews.
          if (isUpgrade(userPlan, nextPlan)) {
            await resetQuota(sub.userId);
          }
        } else {
          // Same tier, new period boundary (e.g. plan renewal date moved).
          await setUserPlan(sub.userId, nextPlan, periodEnd);
          // When the boundary genuinely advanced, a renewal landed through
          // subscription_updated — possibly without its payment_success
          // sibling, which is otherwise the only place the monthly counter
          // resets. Without this, the customer pays for the new period and
          // still 402s on every analyze until the next payment_success (up to
          // a month out). A null periodEnd on the user row means the boundary
          // was never stamped, so any real periodEnd is an advance.
          if (periodEnd.getTime() > (sub.user.periodEnd?.getTime() ?? 0)) {
            await resetQuota(sub.userId);
          }
        }
        appliedPlan = nextPlan;
        break;
      }

      case 'subscription_payment_success': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });

        if (!sub) {
          // Lemon Squeezy does not guarantee ordering, and this event can land
          // before subscription_created. Establish entitlement rather than
          // dropping a successful payment on the floor.
          const user = await findOrCreateUser(clerkId, email);
          if (!user || !resolvedPlan) {
            console.error(
              `[billing webhook] payment_success for unknown subscription ${lsSubscriptionId}; ` +
                `user matched: ${Boolean(user)}, plan resolved: ${Boolean(resolvedPlan)}.`,
            );
            break;
          }
          await prisma.subscription.create({
            data: {
              userId: user.id,
              lsSubscriptionId,
              plan: resolvedPlan,
              status: 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              lastEventAt: eventAt,
            },
          });
          await setUserPlan(user.id, resolvedPlan, periodEnd);
          await resetQuota(user.id);
          appliedPlan = resolvedPlan;
          break;
        }

        // The critical stale guard: a late-delivered LAST-cycle payment_success
        // resets the monthly counter to zero mid-cycle — free reviews for the
        // asking. The dedup key cannot catch this (different transition), so
        // the lastEventAt stamp is the only thing standing between a redelivered
        // old webhook and a free month.
        if (isStale(sub)) {
          console.log(
            `[billing webhook] payment_success for ${lsSubscriptionId} is older than the ` +
              `last applied event — skipped (out-of-order delivery; quota not reset).`,
          );
          break;
        }

        // Resolution failed → keep the tier the sub row already carries, not
        // 'free': a successful PAYMENT must never demote (the header's rule 3).
        const paidPlan = resolvedPlan ?? asPlan(sub.plan) ?? asPlan(sub.user.plan) ?? 'free';
        if (!resolvedPlan && paidPlan === 'free') {
          // A renewal on a variant no operator ever mapped (see the created
          // branch's handling of the same case). Writing the free "plan" here
          // would zero the user's free-tier counter mid-window and stamp paid
          // period fields onto a free row — quota state mutated on exactly the
          // ambiguity the header says the customer must not pay for. Record
          // the payment on the subscription row and leave the user row alone.
          console.error(
            `[billing webhook] payment_success on unmapped variant for ${lsSubscriptionId}; ` +
              `leaving user ${sub.userId}'s quota and plan untouched.`,
          );
          await prisma.subscription.update({
            where: { lsSubscriptionId },
            data: { status: 'active', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
          });
          break;
        }
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status: 'active',
            plan: paidPlan,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            lastEventAt: eventAt,
          },
        });
        // A renewal payment is what makes a monthly allowance feel fair: the
        // counter resets the moment the customer is charged, not a day later.
        await prisma.user.update({
          where: { id: sub.userId },
          data: { plan: paidPlan, auditsUsed: 0, periodStart, periodEnd },
        });
        appliedPlan = paidPlan;
        break;
      }

      case 'subscription_cancelled': {
        // Cancellation is not expiry. The customer paid through periodEnd, so we
        // record the intent and leave the plan intact; `subscription_expired`
        // (or the reconciliation sweep) performs the actual downgrade.
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
        });
        if (!sub) {
          // The row does not exist yet (LS exhausted its retries on created, or
          // it is still queued). ACKing here would make Lemon Squeezy drop this
          // event for good; when `created` finally lands its upsert writes
          // status active with no cancelledAt — a subscription the customer
          // cancelled recorded as live. Throwing (rather than returning the 500
          // directly) routes through the catch below, which RELEASES the dedup
          // row — a bare return would leave it in place and the LS retry would
          // be deduped into a silent no-op, losing the cancellation forever.
          throw new Error(
            `subscription_cancelled for unknown row ${lsSubscriptionId} — 500ing so LS retries after the created event lands.`,
          );
        }
        if (isStale(sub)) {
          // A cancelled event older than the last applied transition (e.g. it
          // 500'd once, the customer resumed in the meantime) must not
          // un-cancel a live subscription.
          console.log(
            `[billing webhook] subscription_cancelled for ${lsSubscriptionId} is older than ` +
              `the last applied event — skipped (out-of-order delivery).`,
          );
          break;
        }
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            // ends_at is authoritative once cancelled — access runs to that date.
            currentPeriodEnd: parseDate(attrs.ends_at) ?? periodEnd,
            lastEventAt: eventAt,
          },
        });
        break;
      }

      case 'subscription_expired': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({ where: { lsSubscriptionId } });
        if (!sub) break;
        if (isStale(sub)) {
          console.log(
            `[billing webhook] subscription_expired for ${lsSubscriptionId} is older than ` +
              `the last applied event — skipped (out-of-order delivery).`,
          );
          break;
        }
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'expired', lastEventAt: eventAt },
        });
        // Only strip the plan if this is still the subscription the account is
        // being billed on. If they already re-subscribed on a new id, the old
        // one expiring must not revoke the new one.
        const newer = await prisma.subscription.findFirst({
          where: {
            userId: sub.userId,
            lsSubscriptionId: { not: lsSubscriptionId },
            status: { in: ['active', 'on_trial', 'past_due', 'cancelled'] },
          },
        });
        if (newer) {
          console.log(
            `[billing] ${lsSubscriptionId} expired but ${newer.lsSubscriptionId} is still live — plan kept.`,
          );
          break;
        }
        // The downgradeToFree write re-anchors periodStart (so the free tier's
        // 30-day window starts from the downgrade, not from whenever the paid
        // period began) and zeroes the counter — the exact mirror of the
        // cron-reconciliation path, and the state setUserPlan+resetQuota used
        // to leave behind: a stale periodStart that could make the free window
        // read as already-elapsed plus a dangling paid periodEnd on a free row.
        await downgradeToFree(
          sub.userId,
          `subscription_expired webhook for ${lsSubscriptionId}`,
        );
        appliedPlan = 'free';
        break;
      }

      case 'subscription_payment_failed': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });
        if (!sub) {
          // A silent break here drops the customer's dunning email on the floor
          // — every sibling branch logs loudly for exactly this reason.
          console.error(
            `[billing webhook] payment_failed for unknown subscription ${lsSubscriptionId} — ` +
              `no row to mark past_due; the customer will not get the dunning email.`,
          );
          break;
        }
        // past_due keeps access alive while Lemon Squeezy retries the card. The
        // downgrade only happens if it ultimately expires.
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'past_due' },
        });
        const notifyTo = email ?? sub.user.email;
        if (notifyTo) {
          const portal =
            attrs.urls?.update_payment_method ??
            attrs.urls?.customer_portal ??
            `${env.APP_URL}/settings?tab=billing`;
          await sendPaymentFailed({
            to: notifyTo,
            plan: sub.plan,
            updatePaymentUrl: portal,
          }).catch((e) => console.error('[billing webhook] dunning email failed:', e));
        }
        break;
      }

      case 'subscription_payment_recovered': {
        // Dunning succeeded after a payment_failed: the card now works and the
        // charge went through. Clear past_due so the reconcile sweep does not
        // later read the stale status as "still failing" and downgrade a
        // customer who is fully paid up.
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
        });
        if (!sub) break;
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'active', currentPeriodEnd: periodEnd, lastEventAt: eventAt },
        });
        break;
      }

      case 'order_refunded':
      case 'subscription_payment_refunded': {
        // Lemon Squeezy can refund without cancelling the subscription. Without
        // this branch the reconcile sweep then sees a live status + future
        // period and PRESERVES access indefinitely — money returned, product
        // kept, no alert. We do not know whether the operator intends the
        // subscription to continue (a refund can be a goodwill credit), so the
        // honest action is to keep entitlement and page an operator loudly.
        console.error(
          `[billing webhook] REFUND received: event=${String(event)} ` +
            `subscription=${lsSubscriptionId || 'n/a'} email=${email ?? 'n/a'} ` +
            `order=${payload.data?.id ?? 'n/a'} — entitlement NOT auto-revoked; ` +
            `an operator must decide (refund policy: ${env.APP_URL}/legal/refund).`,
        );
        break;
      }

      case 'order_created':
        // One-time orders do not grant recurring entitlement; the subscription
        // events that follow do. Logged so an unexpected product is visible.
        console.log(`[billing] order_created (no entitlement granted) variant=${String(attrs.variant_id)}`);
        break;

      default:
        console.log(`[billing] unhandled event: ${String(event)}`);
    }
  } catch (err) {
    console.error(`[billing webhook] handler error on ${event}:`, err);
    // Release the dedup row so the retry is actually allowed to do the work.
    // Without this, one transient DB blip permanently loses a paid upgrade.
    if (holdsDedupRow) {
      await prisma.webhookEvent
        .delete({ where: { id: dedupKey } })
        .catch((e) => console.error('[billing webhook] could not release dedup row:', e));
    }
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  await maybePruneDedupRows();

  return NextResponse.json(
    {
      received: true,
      event,
      // Null when the event intentionally changed no entitlement.
      plan: appliedPlan,
      limit: appliedPlan ? PLAN_LIMITS[appliedPlan] : null,
    },
    { status: 200 },
  );
}
