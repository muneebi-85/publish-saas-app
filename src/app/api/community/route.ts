/**
 * GET /api/community — public "best scores this week" leaderboard.
 *
 * Only reports whose owner explicitly opted in (User.leaderboardOptIn) AND
 * published the score card (`AnalysisReport.sharedAt`) can appear. One entry
 * per creator (their best report this week) so a prolific power user cannot
 * monopolize the board. Each entry links to the public score card — the same
 * opt-in exposure as a share link, nothing more.
 *
 * PUBLIC BY DESIGN and rate-limited by IP, since it is a public read endpoint
 * with no auth to key on.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Monday of the current week, local server time. */
function weekStart(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  return start;
}

export async function GET(req: Request) {
  const rl = await rateLimit(
    clientKey(req, 'community'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const since = weekStart();

  const rows = await prisma.analysisReport.findMany({
    where: {
      createdAt: { gte: since },
      user: { leaderboardOptIn: true },
      // The board links to the public score card, so it may only list reports
      // the creator published (`sharedAt`) — an id alone is not publication.
      sharedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      targetPlatform: true,
      overallScore: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    // A wide net is fine: the opt-in population is small, and the JS below
    // reduces to one row per creator before the response is shaped.
    orderBy: { overallScore: 'desc' },
    take: 400,
  });

  // One entry per creator — their best score this week. Keyed by the user's
  // database id, never their name: names are neither unique nor guaranteed,
  // and keying two creators as "creator" (both unnamed) or "Alex Kim" (two
  // people) would silently drop a real creator from the board.
  const byUser = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byUser.get(row.user.id);
    if (!existing || row.overallScore > existing.overallScore) byUser.set(row.user.id, row);
  }

  const entries = [...byUser.values()]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      title: r.title,
      platform: r.targetPlatform,
      score: r.overallScore,
      createdAt: r.createdAt.toISOString(),
      creator: r.user.name || 'Anonymous creator',
    }));

  return NextResponse.json(
    { weekOf: since.toISOString(), entries },
    { headers: { 'Cache-Control': 'public, max-age=120' } },
  );
}
