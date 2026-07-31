/**
 * GET /api/billing/portal — hand the customer to the Lemon Squeezy portal.
 *
 * The portal is where a subscriber updates their card, changes plan, downloads
 * invoices, and cancels. Because it is the cancellation path, it must work even
 * when something else is broken — every failure here redirects back to Settings
 * with a reason code rather than showing an error page.
 *
 * Two things this route is careful about:
 *   - Ownership is verified against the DB before we ever ask LS for a portal
 *     link, so a guessed subscription id cannot open someone else's billing.
 *   - The returned URL is host-checked before we redirect to it. It comes from an
 *     upstream JSON response, and an open redirect out of an authenticated
 *     billing route is exactly the primitive a phishing page wants.
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit, userKey } from '@/lib/ratelimit';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Statuses whose portal link is still worth opening. */
const MANAGEABLE = ['active', 'on_trial', 'past_due', 'unpaid', 'cancelled', 'paused'];

/** Only Lemon Squeezy is an acceptable redirect target. */
function isLemonSqueezyUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'lemonsqueezy.com' || u.hostname.endsWith('.lemonsqueezy.com'))
    );
  } catch {
    return false;
  }
}

function backToBilling(reason?: string) {
  // env.APP_URL is the canonical origin. Deriving it from x-forwarded-host would
  // let a spoofed header decide where an authenticated user gets sent.
  const url = new URL('/settings', env.APP_URL);
  url.searchParams.set('tab', 'billing');
  if (reason) url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(userKey(authCtx.clerkId, 'portal'), 10, 60_000);
  if (!rl.success) return backToBilling('rate_limited');

  try {
    const requested = new URL(req.url).searchParams.get('subscription_id');

    // Resolve the subscription to manage. When the client names one we must
    // confirm ownership; when it doesn't we pick the caller's own latest.
    let lsSubscriptionId: string | null = null;

    if (requested) {
      const owned = await prisma.subscription.findFirst({
        where: { lsSubscriptionId: requested, userId: authCtx.dbUserId },
        select: { lsSubscriptionId: true },
      });
      // Ownership is in the predicate, so another user's id is indistinguishable
      // from one that does not exist.
      if (!owned) return backToBilling('unauthorized');
      lsSubscriptionId = owned.lsSubscriptionId;
    } else {
      const mine = await prisma.subscription.findFirst({
        where: { userId: authCtx.dbUserId, status: { in: MANAGEABLE } },
        orderBy: { createdAt: 'desc' },
        select: { lsSubscriptionId: true },
      });
      lsSubscriptionId = mine?.lsSubscriptionId ?? null;
    }

    if (!lsSubscriptionId) {
      // Nothing to manage — most likely a free account. Not an error.
      return backToBilling('no_subscription');
    }

    if (!env.LS_API_KEY) return backToBilling('billing_not_configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let data: unknown;
    try {
      const res = await fetch(
        `https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(lsSubscriptionId)}`,
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
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const portalUrl = (data as { data?: { attributes?: { urls?: { customer_portal?: string } } } })
      ?.data?.attributes?.urls?.customer_portal;

    if (!portalUrl || !isLemonSqueezyUrl(portalUrl)) {
      console.error('[GET /api/billing/portal] unusable portal URL from Lemon Squeezy');
      return backToBilling('portal_unavailable');
    }

    const res = NextResponse.redirect(portalUrl);
    // The link is single-use and short-lived; nothing may cache it.
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (err) {
    console.error('[GET /api/billing/portal]', err);
    return backToBilling('portal_unavailable');
  }
}
