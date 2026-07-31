/**
 * Activity feed endpoint.
 *
 * GET  → unread count for the header bell.
 * POST → marks everything up to now as seen.
 *
 * Both are scoped to the authenticated user's own database id; there is no
 * addressable identifier a caller could substitute for someone else's.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { getUnreadActivityCount, markActivitySeen } from '@/lib/activity';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // The bell polls this on every dashboard render, so the ceiling is the cheap
  // authenticated-read budget rather than a per-feature one.
  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'activity'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  try {
    const unread = await getUnreadActivityCount(authCtx.dbUserId);
    return NextResponse.json({ unread }, { headers: NO_STORE });
  } catch (err) {
    console.error('[GET /api/notifications] failed', err);
    // A bell that cannot count is not worth a visible error; report zero.
    return NextResponse.json({ unread: 0 }, { headers: NO_STORE });
  }
}

export async function POST() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'activity-seen'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  try {
    await markActivitySeen(authCtx.dbUserId);
  } catch (err) {
    console.error('[POST /api/notifications] mark seen failed', err);
    return NextResponse.json({ error: 'Could not update your feed. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, unread: 0 }, { headers: NO_STORE });
}
