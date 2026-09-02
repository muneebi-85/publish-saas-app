/**
 * POST /api/me/profile — update the caller's display name.
 *
 * Scope is deliberately one field. The email address is owned by Clerk and the
 * plan is owned by the billing webhook; neither may be written from a client
 * request, so neither is accepted here even if the body contains it.
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
    userKey(authCtx.clerkId, 'profile'),
    LIMITS.ACCOUNT.limit,
    LIMITS.ACCOUNT.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const body = await v.jsonBody(req, { maxBytes: 2_000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const name = v.string(body.value.name, { min: 0, max: 80, field: 'name' });
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  // An empty submission clears the name rather than storing "". The UI then
  // falls back to the email local part instead of rendering a blank header.
  //
  // P2025 = row vanished mid-request (the purge sweep racing this write). The
  // preferences and brand-kit siblings catch it and answer 409; an unhandled
  // throw here surfaced as a raw framework 500 instead.
  let updated: { name: string | null };
  try {
    updated = await prisma.user.update({
      where: { id: authCtx.dbUserId },
      data: { name: name.value.length > 0 ? name.value : null },
      select: { name: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: 'Your account is no longer available — it may have been deleted. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('[POST /api/me/profile] update failed:', err);
    return NextResponse.json(
      { error: 'Could not save your profile. Please try again.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { success: true, name: updated.name ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
