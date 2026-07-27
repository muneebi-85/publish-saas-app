import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { rateLimit, clientKey } from '@/lib/ratelimit';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { setUserPlan, resetQuota, ensureUser, Plan } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Restore purchase.
 *
 * SECURITY: a user may only restore a subscription that belongs to THEIR OWN
 * authenticated account. We never accept an email from the request body — that
 * would let anyone claim another person's plan by typing their address. Instead
 * we use the verified email on the Clerk session, confirm an ACTIVE subscription
 * for exactly that email at Lemon Squeezy, and only then set the plan in the DB.
 */
function planFromVariant(variantId: string): Plan {
  if (variantId && variantId === env.LS_VARIANT_AGENCY) return 'agency';
  if (variantId && variantId === env.LS_VARIANT_PRO) return 'pro';
  if (variantId && variantId === env.LS_VARIANT_STARTER) return 'starter';
  return 'free';
}

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = await rateLimit(clientKey(req, 'restore'), 5, 60_000);
  if (!rl.success) return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 });

  if (!env.LS_API_KEY) {
    return NextResponse.json({ error: 'Billing not configured.' }, { status: 503 });
  }

  // Only the verified session email is trusted — never a body-supplied one.
  const user = await currentUser();
  const email = user?.emailAddresses?.find(
    (e) => e.id === user.primaryEmailAddressId,
  )?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  if (!email) {
    return NextResponse.json(
      { error: 'No verified email on your account. Contact billing@genapps.online.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions?filter[user_email]=${encodeURIComponent(email)}&filter[store_id]=${env.LS_STORE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${env.LS_API_KEY}`,
          Accept: 'application/vnd.api+json',
        },
      },
    );
    if (!res.ok) throw new Error(`LS API ${res.status}`);

    const data = await res.json();
    const subs: Array<{ id: string; attributes: Record<string, unknown> }> = data?.data ?? [];

    // Require a genuinely ACTIVE (or on-trial) subscription — not cancelled/expired.
    const active = subs.find((s) => {
      const status = String(s.attributes?.status ?? '');
      return status === 'active' || status === 'on_trial';
    });

    if (!active) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    const variantId = String(active.attributes?.variant_id ?? '');
    const plan = planFromVariant(variantId);
    if (plan === 'free') {
      // Recognized subscription but unknown variant — do not guess a paid tier.
      return NextResponse.json({ found: false, reason: 'unrecognized_variant' }, { status: 404 });
    }

    const renewsAt = active.attributes?.renews_at
      ? new Date(String(active.attributes.renews_at))
      : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);

    const dbUser = await ensureUser(userId, email);

    // Mirror the subscription row so the webhook lifecycle stays coherent.
    await prisma.subscription.upsert({
      where: { lsSubscriptionId: active.id },
      create: {
        userId: dbUser.id,
        lsSubscriptionId: active.id,
        plan,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: renewsAt,
      },
      update: { userId: dbUser.id, plan, status: 'active', currentPeriodEnd: renewsAt, cancelledAt: null },
    });

    await setUserPlan(dbUser.id, plan, renewsAt);
    await resetQuota(dbUser.id);

    return NextResponse.json({ found: true, plan });
  } catch (err) {
    console.error('[POST /api/billing/restore]', err);
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
  }
}
