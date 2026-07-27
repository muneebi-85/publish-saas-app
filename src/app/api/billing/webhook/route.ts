import { NextResponse } from 'next/server';
import { verifyWebhookSignature, LemonEvent } from '@/lib/billing/lemonsqueezy';
import { prisma } from '@/lib/db';
import { setUserPlan, resetQuota, PLAN_LIMITS, Plan } from '@/lib/session';
import { sendPaymentFailed, sendPlanActivated } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// Idempotency: reject duplicate event_ids within the process lifetime.
// TODO: move to Redis/Upstash for cross-process de-dup once wired.
const seenEvents = new Set<string>();

function normalizePlan(p?: string): Plan {
  const v = (p ?? '').toLowerCase();
  if (v === 'starter' || v === 'pro' || v === 'agency') return v;
  return 'free';
}

/**
 * Resolve the plan from the purchased Lemon Squeezy variant id — the
 * authoritative signal of what was actually paid for. Falls back to the
 * signed custom_data plan, then to the variant name, then 'free'.
 */
function resolvePlan(variantId?: string | number, customPlan?: string, variantName?: string): Plan {
  const vid = String(variantId ?? '');
  if (vid && vid === env.LS_VARIANT_AGENCY) return 'agency';
  if (vid && vid === env.LS_VARIANT_PRO) return 'pro';
  if (vid && vid === env.LS_VARIANT_STARTER) return 'starter';
  const byCustom = normalizePlan(customPlan);
  if (byCustom !== 'free') return byCustom;
  return normalizePlan(variantName);
}

interface LSAttributes {
  status?: string;
  user_email?: string;
  renews_at?: string;
  ends_at?: string;
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
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return existing;
  }
  return null;
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
  const attrsForPlan = payload.data?.attributes ?? {};
  const plan = resolvePlan(
    attrsForPlan.variant_id,
    payload.meta?.custom_data?.plan,
    attrsForPlan.variant_name,
  );
  const attrs = payload.data?.attributes ?? {};
  const lsSubscriptionId = payload.data?.id ?? '';
  const email = attrs.user_email;

  // Deduplicate. Event id (data.id) plus event name uniquely identifies a delivery.
  const dedupKey = `${event}:${lsSubscriptionId}:${attrs.updated_at ?? attrs.created_at ?? ''}`;
  if (dedupKey && seenEvents.has(dedupKey)) {
    return NextResponse.json({ received: true, deduped: true }, { status: 200 });
  }
  if (dedupKey) seenEvents.add(dedupKey);

  const periodStart = attrs.created_at ? new Date(attrs.created_at) : new Date();
  const periodEnd = attrs.renews_at
    ? new Date(attrs.renews_at)
    : attrs.ends_at
      ? new Date(attrs.ends_at)
      : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);

  try {
    switch (event) {
      case 'subscription_created':
      case 'subscription_resumed': {
        const user = await findOrCreateUser(clerkId, email);
        if (!user) {
          console.warn('[billing webhook] no user identifier on event', event);
          break;
        }
        if (lsSubscriptionId) {
          await prisma.subscription.upsert({
            where: { lsSubscriptionId },
            create: {
              userId: user.id,
              lsSubscriptionId,
              plan,
              status: attrs.status ?? 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
            update: {
              plan,
              status: attrs.status ?? 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelledAt: null,
            },
          });
        }
        await setUserPlan(user.id, plan, periodEnd);
        await resetQuota(user.id);
        if (user.email) {
          await sendPlanActivated({
            to: user.email,
            plan,
            dashboardUrl: `${env.APP_URL}/dashboard`,
          });
        }
        break;
      }

      case 'subscription_updated': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });
        if (!sub) break;
        const nextPlan = resolvePlan(attrs.variant_id, undefined, attrs.variant_name) || (sub.plan as Plan);
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status: attrs.status ?? sub.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            plan: nextPlan,
          },
        });
        if (nextPlan !== sub.user.plan) {
          await setUserPlan(sub.userId, nextPlan as Plan, periodEnd);
        }
        break;
      }

      case 'subscription_payment_success': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
        });
        if (!sub) break;
        // Reset the counter — this is what makes monthly subscription feel fair.
        await resetQuota(sub.userId);
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: {
            status: 'active',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        });
        await prisma.user.update({
          where: { id: sub.userId },
          data: { periodStart, periodEnd },
        });
        break;
      }

      case 'subscription_cancelled': {
        // Access remains until periodEnd — mark cancelledAt, do NOT strip plan yet.
        if (!lsSubscriptionId) break;
        await prisma.subscription.updateMany({
          where: { lsSubscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
          },
        });
        break;
      }

      case 'subscription_expired': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
        });
        if (!sub) break;
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'expired' },
        });
        await setUserPlan(sub.userId, 'free');
        // Reset counter so free tier's own limit starts fresh.
        await resetQuota(sub.userId);
        break;
      }

      case 'subscription_payment_failed': {
        if (!lsSubscriptionId) break;
        const sub = await prisma.subscription.findUnique({
          where: { lsSubscriptionId },
          include: { user: true },
        });
        if (!sub) break;
        await prisma.subscription.update({
          where: { lsSubscriptionId },
          data: { status: 'past_due' },
        });
        if (sub.user.email) {
          const portal = attrs.urls?.update_payment_method
            ?? attrs.urls?.customer_portal
            ?? `${env.APP_URL}/dashboard/settings`;
          await sendPaymentFailed({
            to: sub.user.email,
            plan: sub.plan,
            updatePaymentUrl: portal,
          });
        }
        break;
      }

      case 'order_created':
        // One-time purchase (add-on audit pack, etc.) — currently unused.
        break;

      default:
        console.log(`[billing] unhandled event: ${event}`);
    }
  } catch (err) {
    console.error('[billing webhook] handler error:', err);
    // Return 500 so Lemon Squeezy retries — handlers above are idempotent.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, plan, limit: PLAN_LIMITS[plan] }, { status: 200 });
}
