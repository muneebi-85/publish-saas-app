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
import { prisma } from '@/lib/db';
import { setUserPlan, resetQuota, PLAN_LIMITS, Plan } from '@/lib/session';
import { sendPaymentFailed, sendPlanActivated } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ranking used only to decide whether a mid-cycle change deserves a fresh allowance. */
const PLAN_RANK: Record<Plan, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

/** Dedup rows are only useful for as long as Lemon Squeezy might retry. */
const DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function asPlan(value?: string | null): Plan | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'starter' || v === 'pro' || v === 'agency' || v === 'free') return v;
  return null;
}

/**
 * Resolve the plan from the purchased variant id — the authoritative record of
 * what was actually paid for. Falls back to the signed custom_data plan (set by
 * our own checkout route), then the variant name.
 *
 * Returns null when nothing matches. Callers MUST treat null as "unknown", not
 * as "free": an unmapped LS_VARIANT_* env var is an operator mistake, and the
 * customer should not pay for it.
 */
function resolvePlan(
  variantId?: string | number | null,
  customPlan?: string | null,
  variantName?: string | null,
): Plan | null {
  const vid = String(variantId ?? '').trim();
  if (vid) {
    if (vid === env.LS_VARIANT_AGENCY) return 'agency';
    if (vid === env.LS_VARIANT_PRO) return 'pro';
    if (vid === env.LS_VARIANT_STARTER) return 'starter';
  }
  // custom_data.plan is signed inside the webhook body and originally came from
  // our own authenticated checkout route, so it is trustworthy here.
  const byCustom = asPlan(customPlan);
  if (byCustom && byCustom !== 'free') return byCustom;
  const byName = asPlan(variantName);
  if (byName && byName !== 'free') return byName;
  return null;
}

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

/** Parse an LS timestamp defensively — a malformed date must not poison periodEnd. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return existing;
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
  const raw = await req.text();
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
              },
              update: {
                status: attrs.status ?? 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelledAt: null,
              },
            });
          }
          break;
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
          },
        });

        const userPlan = asPlan(sub.user.plan) ?? 'free';
        if (nextPlan !== userPlan) {
          await setUserPlan(sub.userId, nextPlan, periodEnd);
          // Upgrading mid-cycle should immediately grant the larger allowance.
          // Downgrading must NOT reset — that would hand out extra reviews.
          if (PLAN_RANK[nextPlan] > PLAN_RANK[userPlan]) {
            await resetQuota(sub.userId);
          }
        } else {
          // Same tier, new period boundary (e.g. plan renewal date moved).
          await setUserPlan(sub.userId, nextPlan, periodEnd);
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
            },
          });
          await setUserPlan(user.id, resolvedPlan, periodEnd);
          await resetQuota(user.id);
          appliedPlan = resolvedPlan;
          break;
        }

        const paidPlan = resolvedPlan ?? asPlan(sub.plan) ?? 'free';
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status: 'active',
            plan: paidPlan,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
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
        await prisma.subscription.updateMany({
          where: { lsSubscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            // ends_at is authoritative once cancelled — access runs to that date.
            currentPeriodEnd: parseDate(attrs.ends_at) ?? periodEnd,
          },
        });
        break;
      }

      case 'subscription_expired': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({ where: { lsSubscriptionId } });
        if (!sub) break;
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'expired' },
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
        await setUserPlan(sub.userId, 'free');
        // Fresh counter so the free tier's own allowance starts clean.
        await resetQuota(sub.userId);
        appliedPlan = 'free';
        break;
      }

      case 'subscription_payment_failed': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });
        if (!sub) break;
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
