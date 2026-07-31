/**
 * POST /api/billing/restore — re-attach an existing Lemon Squeezy subscription.
 *
 * Needed because a buyer can pay through a Lemon Squeezy-hosted link that never
 * carried our signed `custom_data.user_id`, or can sign in with a different
 * provider afterwards. Without this they would have paid and have nothing.
 *
 * SECURITY: a user may only restore a subscription that belongs to THEIR OWN
 * authenticated account. We never accept an email from the request body — that
 * would let anyone claim another person's plan by typing their address. We use
 * the verified email on the Clerk session, confirm an ACTIVE subscription for
 * exactly that email at Lemon Squeezy, and only then set the plan.
 *
 * The quota reset is deliberately conditional. Resetting on every call would turn
 * this endpoint into an unlimited-audits button: restore, reset, spend, repeat.
 */

import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { rateLimit, userKey, tooManyRequests } from '@/lib/ratelimit';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api-guards';
import { setUserPlan, resetQuota, Plan } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Map a purchased variant to a tier. Returns null when unmapped — never guesses. */
function planFromVariant(variantId: string): Plan | null {
  if (!variantId) return null;
  if (variantId === env.LS_VARIANT_AGENCY) return 'agency';
  if (variantId === env.LS_VARIANT_PRO) return 'pro';
  if (variantId === env.LS_VARIANT_STARTER) return 'starter';
  return null;
}

export async function POST(_req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(userKey(authCtx.clerkId, 'restore'), 5, 60_000);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  if (!env.LS_API_KEY || !env.LS_STORE_ID) {
    return NextResponse.json(
      { error: 'Billing is not configured on this deployment.' },
      { status: 503 },
    );
  }

  // Only the verified session email is trusted — never a body-supplied one.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;

  if (!email) {
    return NextResponse.json(
      { error: 'No verified email on your account. Contact billing@genapps.online.' },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions?filter[user_email]=${encodeURIComponent(email)}&filter[store_id]=${encodeURIComponent(env.LS_STORE_ID)}`,
      {
        headers: {
          Authorization: `Bearer ${env.LS_API_KEY}`,
          Accept: 'application/vnd.api+json',
        },
        signal: controller.signal,
        cache: 'no-store',
      },
    );
    if (!res.ok) throw new Error(`LS API ${res.status}`);

    const data = await res.json();
    const subs: Array<{ id: string; attributes: Record<string, unknown> }> = data?.data ?? [];

    // Require a genuinely live subscription — not cancelled/expired/unpaid.
    const active = subs.find((s) => {
      const status = String(s.attributes?.status ?? '');
      return status === 'active' || status === 'on_trial';
    });

    if (!active) {
      return NextResponse.json({ found: false, reason: 'no_active_subscription' }, { status: 404 });
    }

    const plan = planFromVariant(String(active.attributes?.variant_id ?? ''));
    if (!plan) {
      // A real subscription on an unmapped variant. Do not guess a paid tier and
      // do not silently give them 'free' — tell them, and log it for the operator.
      console.error(
        `[POST /api/billing/restore] variant_id=${String(active.attributes?.variant_id)} is not mapped. ` +
          `Set LEMONSQUEEZY_VARIANT_STARTER / _PRO / _AGENCY.`,
      );
      return NextResponse.json({ found: false, reason: 'unrecognized_variant' }, { status: 404 });
    }

    // Another account may already hold this subscription (e.g. the buyer signed
    // up twice). Moving it would silently strip the first account's access.
    const existing = await prisma.subscription.findUnique({
      where: { lsSubscriptionId: active.id },
      select: { userId: true },
    });
    if (existing && existing.userId !== authCtx.dbUserId) {
      console.warn(
        `[POST /api/billing/restore] subscription ${active.id} is already attached to another account.`,
      );
      return NextResponse.json(
        {
          found: false,
          reason: 'already_claimed',
          error:
            'This subscription is already linked to another account. Sign in with that account, or contact billing@genapps.online.',
        },
        { status: 409 },
      );
    }

    const renewsAt = active.attributes?.renews_at
      ? new Date(String(active.attributes.renews_at))
      : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
    const periodEnd = Number.isNaN(renewsAt.getTime())
      ? new Date(Date.now() + 32 * 24 * 60 * 60 * 1000)
      : renewsAt;

    // Mirror the subscription row so the webhook lifecycle and the portal work.
    await prisma.subscription.upsert({
      where: { lsSubscriptionId: active.id },
      create: {
        userId: authCtx.dbUserId,
        lsSubscriptionId: active.id,
        plan,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
      update: { plan, status: 'active', currentPeriodEnd: periodEnd, cancelledAt: null },
    });

    const customerId = active.attributes?.customer_id;
    if (customerId != null) {
      await prisma.user
        .update({ where: { id: authCtx.dbUserId }, data: { lsCustomerId: String(customerId) } })
        .catch(() => undefined);
    }

    // Only a genuine tier change earns a fresh allowance. Restoring the plan you
    // already have must not hand out another 100 reviews.
    const changedTier = authCtx.plan !== plan;
    await setUserPlan(authCtx.dbUserId, plan, periodEnd);
    if (changedTier) await resetQuota(authCtx.dbUserId);

    return NextResponse.json({ found: true, plan, quotaReset: changedTier });
  } catch (err) {
    console.error('[POST /api/billing/restore]', err);
    return NextResponse.json(
      { error: 'Could not reach Lemon Squeezy. Please try again in a moment.' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
