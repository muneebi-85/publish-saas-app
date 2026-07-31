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
import { hasBilling } from '@/lib/env';
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

  // Prefer the verified primary address so the LS customer record matches the
  // account the webhook will credit.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    authCtx.email ??
    undefined;

  try {
    const checkout = await createCheckoutUrl({
      planId: plan.value,
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
