import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createCheckoutUrl, PLANS, PlanId } from '@/lib/billing/lemonsqueezy';
import { rateLimit, clientKey } from '@/lib/ratelimit';
import { ensureUser } from '@/lib/session';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';

const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/**
 * Create a Lemon Squeezy checkout.
 *
 * SECURITY: the user id and email attached to checkout_data.custom come from the
 * authenticated Clerk session — NEVER from the request body. This is what binds
 * the eventual signed webhook to the correct account. A client cannot cause a
 * payment to credit a different user, nor pre-set a plan; the plan is only the
 * variant being purchased, and entitlement is granted solely by the webhook.
 */
export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = await rateLimit(clientKey(req, 'checkout'), 20, 60_000);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const plan = v.enumOf<PlanId>(body.planId, PLAN_IDS, 'planId');
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

  const user = await currentUser();
  const email = user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses?.[0]?.emailAddress
    ?? undefined;

  // Make sure the DB row exists so the webhook's user_id lookup resolves.
  await ensureUser(userId, email);

  try {
    const checkout = await createCheckoutUrl({
      planId: plan.value,
      userEmail: email,
      userId,               // server-trusted identity, not from the body
    });
    return NextResponse.json({ url: checkout.url, id: checkout.checkoutId });
  } catch (err) {
    console.error('[POST /api/billing/checkout] error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Checkout creation failed.' },
      { status: 500 },
    );
  }
}
