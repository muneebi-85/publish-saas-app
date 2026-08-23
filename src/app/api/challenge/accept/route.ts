/**
 * POST /api/challenge/accept — close the "challenge a friend" loop.
 *
 * Flow: a creator shares a score card (/share/[id]). The recipient reviews the
 * SAME script (prefilled from the share API), gets their own score, and lands
 * on their analysis page with ?challenge=<targetReportId>. This route links the
 * two reports and returns the head-to-head comparison.
 *
 * Credits: the challenger (owner of the shared report) earns one free audit per
 * unique accepter — that is the reward for sharing, and it is the growth loop
 * the audit asked for. The accepter already spent their own audit on the
 * challenge review, so they get no extra credit. The `granted`-style guard is
 * the Challenge row itself: the (reportId, acceptedByUserId) pair is unique, so
 * a retried accept can never pay the challenger twice for the same accepter.
 *
 * Abuse guards:
 *  - You cannot challenge yourself (target must belong to someone else).
 *  - `myReportId` must belong to the caller (ownership is part of the query).
 *  - Both ids must look like real cuids before they reach the DB.
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

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'challenge'),
    LIMITS.CHANNELS.limit, // challenge accepts are rare; reuse the channels budget
    LIMITS.CHANNELS.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const parsed = await v.jsonBody(req, { maxBytes: 2_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const targetId = v.id(parsed.value.targetReportId, 'targetReportId');
  if (!targetId.ok) return NextResponse.json({ error: targetId.error }, { status: 400 });
  const mineId = v.id(parsed.value.myReportId, 'myReportId');
  if (!mineId.ok) return NextResponse.json({ error: mineId.error }, { status: 400 });

  // Load both reports. The accepter's report is ownership-scoped in the same
  // query, so another user's id simply resolves to nothing (404, never a hint
  // that the report exists).
  const [target, mine] = await Promise.all([
    prisma.analysisReport.findUnique({
      where: { id: targetId.value },
      select: { id: true, title: true, overallScore: true, targetPlatform: true, userId: true },
    }),
    prisma.analysisReport.findFirst({
      where: { id: mineId.value, user: { clerkId: authCtx.clerkId } },
      select: { id: true, title: true, overallScore: true, targetPlatform: true },
    }),
  ]);

  if (!target) {
    return NextResponse.json({ error: 'That score card no longer exists.' }, { status: 404 });
  }
  if (!mine) {
    return NextResponse.json(
      { error: 'Report not found — only your own reports can accept a challenge.' },
      { status: 404 },
    );
  }
  if (target.userId === authCtx.dbUserId) {
    return NextResponse.json({ error: 'You cannot challenge your own score.' }, { status: 400 });
  }

  const comparison = {
    target: {
      id: target.id,
      title: target.title,
      score: target.overallScore,
      platform: target.targetPlatform,
    },
    mine: {
      id: mine.id,
      title: mine.title,
      score: mine.overallScore,
      platform: mine.targetPlatform,
    },
    outcome:
      mine.overallScore > target.overallScore
        ? 'won'
        : mine.overallScore < target.overallScore
          ? 'lost'
          : 'tied',
  } as const;

  // Idempotent accept: a retried request for the same (target, accepter) pair
  // returns the already-committed state instead of minting new credits.
  const existing = await prisma.challenge.findFirst({
    where: { reportId: target.id, acceptedByUserId: authCtx.dbUserId },
    select: { id: true, acceptedReportId: true, challengerId: true },
  });

  if (existing) {
    // The accepter re-ran the script and improved their score — point the
    // challenge at the newer report, but never re-credit.
    if (existing.acceptedReportId !== mine.id) {
      await prisma.challenge
        .update({
          where: { id: existing.id },
          data: { acceptedReportId: mine.id, acceptedAt: new Date() },
        })
        .catch(() => undefined);
    }
    return NextResponse.json(
      { ...comparison, creditsEarned: 0, already: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Fresh accept: record it and pay the challenger, in one transaction so we
  // can never end up with a paid share that has no Challenge row (or vice versa).
  try {
    await prisma.$transaction(async (tx) => {
      await tx.challenge.create({
        data: {
          reportId: target.id,
          challengerId: target.userId,
          acceptedByUserId: authCtx.dbUserId,
          acceptedReportId: mine.id,
          acceptedAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: target.userId },
        data: { referralCredits: { increment: 1 } },
      });
    });
  } catch (err) {
    // Unique (reportId, acceptedByUserId) from a concurrent accept — treat as
    // done, same as the idempotent path above.
    if ((err as { code?: string }).code !== 'P2002') {
      console.error('[POST /api/challenge/accept] failed:', err);
      return NextResponse.json(
        { error: 'The challenge could not be recorded. Please try again.' },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(
    { ...comparison, creditsEarned: 1, already: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
