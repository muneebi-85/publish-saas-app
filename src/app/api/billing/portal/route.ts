import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit, clientKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * Customer portal redirect.
 *
 * Lemon Squeezy provides a self-serve portal where customers can:
 *   - Update payment method
 *   - Cancel subscription
 *   - Download invoices
 *   - Change plan
 *
 * We look up the customer's portal URL via the LS API and redirect them.
 * The portal URL is single-use and expires after 24h.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, 'portal'), 10, 60_000);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const subscriptionId = searchParams.get('subscription_id');

  if (!subscriptionId) {
    return NextResponse.redirect(new URL('/settings?tab=billing', req.url));
  }

  if (!env.LS_API_KEY) {
    return NextResponse.redirect(new URL('/settings?tab=billing&error=billing_not_configured', req.url));
  }

  try {
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}/customer-portal`,
      {
        headers: {
          Authorization: `Bearer ${env.LS_API_KEY}`,
          Accept: 'application/vnd.api+json',
        },
      },
    );

    if (!res.ok) throw new Error(`LS API ${res.status}`);
    const data = await res.json();
    const portalUrl = data?.data?.attributes?.url;

    if (!portalUrl) throw new Error('No portal URL returned');
    return NextResponse.redirect(portalUrl);
  } catch (err) {
    console.error('[GET /api/billing/portal]', err);
    return NextResponse.redirect(
      new URL('/settings?tab=billing&error=portal_unavailable', req.url),
    );
  }
}
