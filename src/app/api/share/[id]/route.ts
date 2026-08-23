/**
 * GET /api/share/[id] — the score-card payload for the OG image generator.
 *
 * The opengraph-image route runs on the Edge runtime (next/og on Windows would
 * otherwise hit a broken font path inside @vercel/og's node build, and Edge
 * cannot read the Postgres database), so this Node route is the bridge that
 * supplies it with data.
 *
 * PUBLIC BY DESIGN: it exposes the same fields the public share page renders —
 * score, title, platform, layer scores — for a report id that is an unguessable
 * cuid and is only reachable if a creator shared the link. The fixes and
 * private layers never leave the auth wall.
 *
 * `scriptText` is included deliberately: the "challenge a friend" loop runs the
 * SAME script through the audit on the challenger's side, and the only way to
 * do that is to hand the script to whoever holds the (already shared) link. A
 * share link is opt-in publication of that script; withholding it would break
 * the entire feature.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const row = await prisma.analysisReport.findUnique({
    where: { id: params.id },
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
