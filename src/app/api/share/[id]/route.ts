/**
 * The share API — publish, revoke, and the public read behind the OG image.
 *
 * PUBLIC BY DESIGN (GET): it exposes the same fields the public share page
 * renders — score, title, platform, layer scores — and ONLY for a report the
 * creator published (`sharedAt` stamped by clicking "Share score"). The fixes
 * and private layers never leave the auth wall.
 *
 * OWNER-ONLY (POST/DELETE): publishing and revoking are the creator's actions.
 * POST stamps `sharedAt` (idempotent — re-sharing does not restamp the original
 * publication date); DELETE clears it, which immediately un-publishes every
 * public surface (page, badge, OG image, community link, challenge accepts)
 * because they all gate on the same column.
 *
 * `scriptText` is included deliberately on GET: the "challenge a friend" loop
 * runs the SAME script through the audit on the challenger's side, and the only
 * way to do that is to hand the script to whoever holds the published link —
 * a link the creator chose to post.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientKey, LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit';
import { requireAuth } from '@/lib/api-guards';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function layerScores(report: unknown): { label: string; value: number | null }[] {
  const obj =
    report !== null && typeof report === 'object' && !Array.isArray(report)
      ? (report as Record<string, unknown>)
      : {};
  const scores =
    obj.scores !== null && typeof obj.scores === 'object' && !Array.isArray(obj.scores)
      ? (obj.scores as Record<string, unknown>)
      : {};
  const num = (v: unknown): number | null => {
    // Explicit null check first: `Number(null)` is 0, which would print a
    // measured-looking 0 for a layer that never ran.
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : null;
  };
  return [
    { label: 'Monetization', value: num(scores.monetization) },
    { label: 'Retention', value: num(scores.hook) },
    { label: 'Copyright', value: num(scores.copyright) },
    { label: 'Brand safety', value: num(scores.brandSafety) },
    { label: 'SEO', value: num(scores.seo) },
    { label: 'Authenticity', value: num(scores.humanAuthenticity) },
  ];
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Public and DB-backed: an unthrottled findFirst is free load on the
  // database from arbitrary IPs, matching the budget every other public
  // route already applies.
  const rl = await rateLimit(clientKey(req, 'share'), LIMITS.READ.limit, LIMITS.READ.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Shape-check before the DB: this is the one public route where the param
  // reached the DB unvalidated, letting arbitrary multi-KB strings hit the
  // query planner.
  const id = v.id(params.id, 'id');
  if (!id.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = await prisma.analysisReport.findFirst({
    where: { id: id.value, sharedAt: { not: null } },
    select: { title: true, targetPlatform: true, overallScore: true, report: true },
  });
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const obj =
    row.report !== null && typeof row.report === 'object' && !Array.isArray(row.report)
      ? (row.report as Record<string, unknown>)
      : {};
  const assets =
    obj.assets !== null && typeof obj.assets === 'object' && !Array.isArray(obj.assets)
      ? (obj.assets as Record<string, unknown>)
      : {};
  const scriptText = typeof assets.scriptText === 'string' ? assets.scriptText.slice(0, 20_000) : null;

  return NextResponse.json(
    {
      title: row.title,
      targetPlatform: row.targetPlatform,
      overallScore: row.overallScore,
      layers: layerScores(row.report),
      // For the challenge loop — see the header comment.
      scriptText,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * POST — the creator publishes the score card. Idempotent: an already-shared
 * report keeps its original publication date rather than restamping, so
 * re-clicking "Share score" never looks like a fresh share.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(userKey(authCtx.clerkId, 'share-write'), LIMITS.PROJECT_WRITE.limit, LIMITS.PROJECT_WRITE.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const id = v.id(params.id, 'id');
  if (!id.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ownership in the predicate (never a 403 existence oracle).
  const row = await prisma.analysisReport.findFirst({
    where: { id: id.value, user: { clerkId: authCtx.clerkId } },
    select: { id: true, sharedAt: true },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!row.sharedAt) {
    await prisma.analysisReport.update({
      where: { id: row.id },
      data: { sharedAt: new Date() },
    });
  }

  return NextResponse.json(
    { shared: true, sharedAt: (row.sharedAt ?? new Date()).toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * DELETE — the creator revokes the score card. Every public surface keys on
 * `sharedAt`, so this immediately un-publishes the page, badge, OG image and
 * community exposure; the community board re-queries live and drops it on the
 * next request. Cancelling is instant and re-sharing later starts a fresh
 * publication date.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(userKey(authCtx.clerkId, 'share-write'), LIMITS.PROJECT_WRITE.limit, LIMITS.PROJECT_WRITE.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const id = v.id(params.id, 'id');
  if (!id.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const released = await prisma.analysisReport.updateMany({
    where: { id: id.value, user: { clerkId: authCtx.clerkId }, sharedAt: { not: null } },
    data: { sharedAt: null },
  });

  // 404 for both "never existed" and "not yours" — no existence oracle.
  if (released.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ shared: false }, { headers: { 'Cache-Control': 'no-store' } });
}
