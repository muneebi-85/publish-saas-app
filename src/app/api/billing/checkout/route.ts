/**
 * POST /api/billing/checkout — create a Lemon Squeezy checkout session.
 *
 * SECURITY: the user id and email attached to checkout_data.custom come from the
 * authenticated Clerk session — NEVER from the request body. This is what binds
 * the eventual signed webhook to the correct account. A client cannot cause a
 * payment to credit a different user, nor pre-set a plan; the plan is only the
 * variant being purchased, and entitlement is granted solely by the webhook.
 */

import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { createCheckoutUrl, PLANS, PlanId } from '@/lib/billing/lemonsqueezy';
import { rateLimit, userKey, tooManyRequests } from '@/lib/ratelimit';
import { requireAuth } from '@/lib/api-guards';
import { primaryEmailOf } from '@/lib/clerk-identity';
import { hasBilling } from '@/lib/env';
import { prisma } from '@/lib/db';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // Keyed to the account, not the IP: a shared office NAT should not share one
  // checkout budget, and rotating IPs should not reset it.
  const rl = await rateLimit(userKey(authCtx.clerkId, 'checkout'), 20, 60_000);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  if (!hasBilling()) {
    return NextResponse.json(
      {
        error:
          'Billing is not configured on this deployment yet. Set LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_WEBHOOK_SECRET.',
        billingUnavailable: true,
      },
      { status: 503 },
    );
  }

  const parsed = await v.jsonBody(req, { maxBytes: 1_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const plan = v.enumOf<PlanId>(parsed.value.planId, PLAN_IDS, 'planId');
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

  // A live subscription must be changed through the customer portal (it swaps
  // the variant on the existing sub), never by opening a second checkout —
  // that would bill the customer twice. The clients redirect to the portal on
  // their own, but this route is reachable directly, so the rule has to hold
  // server-side too.
  //
  // BLOCKING matches the app-wide BILLABLE set (account/delete, purge sweep):
  // 'on_trial', 'past_due' and 'unpaid' subscriptions are still being charged
  // or about to be, so a second checkout alongside them double-bills exactly
  // like an 'active' one. `cancelled` and `expired` are deliberately NOT
  // blocking — a customer who cancelled or lapsed and is re-subscribing is
  // exactly who a fresh checkout is for.
  const liveSubscription = await prisma.subscription.findFirst({
    where: {
      userId: authCtx.dbUserId,
      status: { in: ['active', 'on_trial', 'past_due', 'unpaid', 'paused'] },
    },
    select: { lsSubscriptionId: true },
  });
  if (liveSubscription) {
    return NextResponse.json(
      {
        error: 'You already have an active subscription. Use the billing portal to change plans.',
        portalRequired: true,
      },
      { status: 409 },
    );
  }

  // Billing interval is optional and defaults to monthly. The variant selected
  // for checkout changes, but the plan and the entitlement are identical.
  const interval =
    parsed.value.interval === 'yearly' ? ('yearly' as const) : ('monthly' as const);

  // Prefer the verified primary address so the LS customer record matches the
  // account the webhook will credit. primaryEmailOf() also drops blank entries,
  // which an inline `?.[0]?.emailAddress` would happily pass to the provider as
  // the customer's receipt address.
  const clerkUser = await currentUser();
  const email = primaryEmailOf(clerkUser) ?? authCtx.email ?? undefined;

  try {
    const checkout = await createCheckoutUrl({
      planId: plan.value,
      interval,
      userEmail: email,
      userId: authCtx.clerkId, // server-trusted identity, never from the body
    });

    if (!checkout.url) throw new Error('Lemon Squeezy returned no checkout URL');

    return NextResponse.json(
      { url: checkout.url, id: checkout.checkoutId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    // The upstream message can contain the store id, variant ids and API detail.
    // It goes to the server log; the client gets a sentence it can act on.
    console.error('[POST /api/billing/checkout]', err);
    return NextResponse.json(
      { error: 'Could not open checkout. Please try again in a moment.' },
      { status: 502 },
    );
  }
}
