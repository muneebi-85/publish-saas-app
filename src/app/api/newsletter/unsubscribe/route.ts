/**
 * GET /api/newsletter/unsubscribe?token=… — one-click opt-out.
 *
 * The token is an HMAC over the subscriber's email (see src/lib/newsletter-token.ts),
 * minted at signup and embedded in every campaign's unsubscribe footer. GET (the
 * link a mail client opens) performs the opt-out and redirects to the /unsubscribe
 * confirmation page; RFC 8058's one-click POST (List-Unsubscribe-Post) lands on the
 * same route and is answered with 200 + JSON so mail clients can auto-unsubscribe
 * without opening a browser.
 *
 * Behavior rules, matching CAN-SPAM/GDPR:
 *   - Idempotent: unsubscribing twice is fine; the row keeps `unsubscribedAt`.
 *   - An unknown address with a VALID token still "succeeds" — the address was
 *     never on the list, which is the state the visitor wants, and responding
 *     differently would let anyone probe list membership by minting their own
 *     email+token pair.
 *   - An INVALID token is a 400 with no state information, whatever address it
 *     claims to carry.
 *
 * Resubscribing afterwards (typing the address into the landing form again)
 * is an explicit request to start receiving mail and clears the opt-out —
 * that is the POST /api/newsletter route's documented contract.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { verifyUnsubscribeToken } from '@/lib/newsletter-token';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, 'newsletter-unsub'), LIMITS.NEWSLETTER.limit, LIMITS.NEWSLETTER.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.redirect(`${env.APP_URL}/unsubscribe?state=invalid`, { status: 303 });
  }

  try {
    await prisma.newsletterSubscriber.updateMany({
      where: { email },
      data: { unsubscribedAt: new Date() },
    });
  } catch (err) {
    console.error('[newsletter unsubscribe] write failed', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${env.APP_URL}/unsubscribe?state=error`, { status: 303 });
  }

  return NextResponse.redirect(`${env.APP_URL}/unsubscribe?state=ok`, { status: 303 });
}

/** RFC 8058 List-Unsubscribe-One-Click: POST from the mail client itself. */
export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, 'newsletter-unsub'), LIMITS.NEWSLETTER.limit, LIMITS.NEWSLETTER.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await prisma.newsletterSubscriber.updateMany({
      where: { email },
      data: { unsubscribedAt: new Date() },
    });
  } catch (err) {
    console.error('[newsletter unsubscribe] write failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'temporary' }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
