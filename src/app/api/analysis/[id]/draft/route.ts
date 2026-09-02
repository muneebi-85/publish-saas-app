/**
 * GET /api/analysis/[id]/draft — the inputs behind one report, for the
 * re-run handoff.
 *
 * "Re-run this review" used to carry the title + script + platform through
 * the querystring (/upload?script=<up to 20,000 chars>). Realistic scripts
 * blow past conservative request-line limits on CDNs and self-hosted proxies
 * (~4-8 KB), so the handoff truncated or 414'd and the creator re-ran a
 * PARTIAL script — a bogus before/after trend against their previous full
 * review.
 *
 * The job row already persists everything the review consumed, so the draft
 * endpoint hands the whole set back: title, script, platform, description,
 * thumbnail/audio URLs, the browser-measured frame block, and the
 * metadata flags. The uploader preloads it the same way it preloads a
 * challenge (fetch by id, apply untouched fields only).
 *
 * Owner-scoped like every report read: the ownership predicate is in the
 * query, so another user's id resolves to 404 without confirming it exists.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { requireAuth } from '@/lib/api-guards';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same ceiling the analyze route enforces on every string it accepts. */
const MAX_STR = 20_000;

/** Same enumeration the analyze route accepts — a re-run restores the same declaration. */
const MUSIC_SOURCES = ['none', 'original', 'licensed', 'stock', 'popular', 'unknown'] as const;
type MusicSource = (typeof MUSIC_SOURCES)[number];

function boundedString(value: unknown, max = MAX_STR): string | undefined {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : undefined;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(userKey(authCtx.clerkId, 'read'), LIMITS.READ.limit, LIMITS.READ.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const id = v.id(params.id, 'id');
  if (!id.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = await prisma.analysisReport.findFirst({
    where: { id: id.value, user: { clerkId: authCtx.clerkId } },
    select: { id: true, title: true, targetPlatform: true, report: true },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The report payload carries the resolved assets (script = written script or
  // transcript, whichever the engines read). Prefer the job's raw input when it
  // still exists — it is exactly what the review consumed, before the engines
  // resolved anything — and fall back to the report's assets for legacy rows.
  const job = await prisma.analysisJob.findFirst({
    where: { reportId: row.id },
    orderBy: { createdAt: 'desc' },
    select: { input: true },
  });

  const report =
    row.report !== null && typeof row.report === 'object' && !Array.isArray(row.report)
      ? (row.report as Record<string, unknown>)
      : {};
  const assets =
    report.assets !== null && typeof report.assets === 'object' && !Array.isArray(report.assets)
      ? (report.assets as Record<string, unknown>)
      : {};

  const input =
    job && job.input !== null && typeof job.input === 'object' && !Array.isArray(job.input)
      ? (job.input as Record<string, unknown>)
      : {};

  const draft = {
    title: boundedString(input.title, 200) ?? boundedString(assets.metaTitle, 200) ?? row.title,
    description:
      boundedString(input.description, 5_000) ??
      boundedString(assets.metaDescription, 5_000),
    scriptText:
      boundedString(input.scriptText) ?? boundedString(assets.scriptText) ?? '',
    targetPlatform:
      typeof input.targetPlatform === 'string' && input.targetPlatform
        ? input.targetPlatform
        : row.targetPlatform,
    // The declared signals the previous review consumed. Restoring these keeps
    // a re-run comparable to the original — a re-run that silently drops the
    // music-source declaration re-grades copyright from a blank slate.
    musicSource: MUSIC_SOURCES.includes(input.musicSource as MusicSource)
      ? (input.musicSource as MusicSource)
      : undefined,
    aiGenerated: input.aiGenerated === true ? true : undefined,
    thumbnailUrl: boundedString(input.thumbnailUrl, 2_048),
    // Re-run as a fresh review: media and frame signals come from the files
    // the creator re-attaches, not stale URLs from the previous run — an
    // audio/video object may have been purged or replaced since.
  };

  return NextResponse.json(draft, { headers: { 'Cache-Control': 'no-store' } });
}
