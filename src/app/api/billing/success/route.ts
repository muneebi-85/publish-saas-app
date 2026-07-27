import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Post-checkout return URL.
 *
 * SECURITY: this endpoint grants NOTHING. It is a public redirect target that
 * Lemon Squeezy sends the buyer to after checkout, and its query string is
 * fully attacker-controllable (anyone can open /api/billing/success?plan=agency).
 * Therefore it must never touch plan state or set a plan cookie.
 *
 * The user's plan is elevated exclusively by the `subscription_created` /
 * `subscription_payment_success` webhook events, which are HMAC-verified against
 * LEMONSQUEEZY_WEBHOOK_SECRET before any DB write. The webhook usually lands
 * before this redirect resolves; if not, the dashboard shows a short
 * "activating" state and /api/me/plan reflects the real tier once it arrives.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env.APP_URL || url.origin;
  // `pending=1` lets the dashboard show an "activating your plan" note without
  // ever asserting a tier the payment webhook hasn't confirmed.
  const redirectTo = new URL('/dashboard?checkout=complete&pending=1', base);
  const res = NextResponse.redirect(redirectTo);

  // Defensively clear any legacy client-trusted plan cookies from older builds
  // so a stale/forged value can't linger and mislead the UI.
  res.cookies.set('publish_plan', '', { path: '/', maxAge: 0 });
  res.cookies.set('publish_audits_used', '', { path: '/', maxAge: 0 });

  return res;
}
