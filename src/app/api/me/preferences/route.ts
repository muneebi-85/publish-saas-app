/**
 * POST /api/me/preferences — update the caller's notification preferences.
 *
 * Only productEmails is settable. Transactional mail (receipts, payment
 * failures, deletion notices) is not opt-out: those are contractual, and the
 * subscription terms promise they keep arriving.
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

  const productEmails = v.boolean(body.value.productEmails, 'productEmails');
  if (!productEmails.ok) {
    return NextResponse.json({ error: productEmails.error }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: authCtx.dbUserId },
    data: { productEmails: productEmails.value },
    select: { productEmails: true },
  });

  return NextResponse.json(
    { success: true, productEmails: updated.productEmails },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
