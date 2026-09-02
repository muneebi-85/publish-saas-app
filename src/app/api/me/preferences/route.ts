/**
 * POST /api/me/preferences — update the caller's preferences.
 *
 * Settable fields:
 *  - productEmails: notification mail. Transactional mail (receipts, payment
 *    failures, deletion notices) is not opt-out: those are contractual.
 *  - leaderboardOptIn: whether the caller's reports may appear on the public
 *    /community leaderboard. Off by default; flipping it on is the only way
 *    a score can become public.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'prefs'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const body = await v.jsonBody(req, { maxBytes: 2_000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const data: { productEmails?: boolean; leaderboardOptIn?: boolean } = {};

  if ('productEmails' in body.value) {
    const productEmails = v.boolean(body.value.productEmails, 'productEmails');
    if (!productEmails.ok) return NextResponse.json({ error: productEmails.error }, { status: 400 });
    data.productEmails = productEmails.value;
  }
  if ('leaderboardOptIn' in body.value) {
    const leaderboardOptIn = v.boolean(body.value.leaderboardOptIn, 'leaderboardOptIn');
    if (!leaderboardOptIn.ok) return NextResponse.json({ error: leaderboardOptIn.error }, { status: 400 });
    data.leaderboardOptIn = leaderboardOptIn.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  // The row can vanish mid-request (account deletion racing this call), which
  // Prisma surfaces as P2025. Answer it as a 503 retry, not a raw framework
  // 500 — the same treatment the neighbouring me/* routes give their writes.
  let updated: { productEmails: boolean; leaderboardOptIn: boolean };
  try {
    updated = await prisma.user.update({
      where: { id: authCtx.dbUserId },
      data,
      select: { productEmails: true, leaderboardOptIn: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: 'Account is no longer available. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('[POST /api/me/preferences] write failed:', err);
    return NextResponse.json({ error: 'Could not save your preferences.' }, { status: 503 });
  }

  return NextResponse.json(
    { success: true, productEmails: updated.productEmails, leaderboardOptIn: updated.leaderboardOptIn },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
