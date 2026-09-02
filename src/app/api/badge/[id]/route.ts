/**
 * GET /api/badge/[id] — the embeddable "my script scored 87/100" badge.
 *
 * Serves a static-looking SVG that renders the share-page score for a report
 * the creator PUBLISHED (`sharedAt` — stamped by clicking "Share score"; the
 * embed snippet is only handed out from the published score card). The badge
 * links to the public score card, so every creator who embeds it on their site
 * gives Publish a backlink — the SEO loop the audit asked for.
 *
 * PUBLIC BY DESIGN: same exposure as /share/[id] and /api/share/[id] — score,
 * title, platform. Nothing private.
 */

import { prisma } from '@/lib/db';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BAND: [number, string][] = [
  [90, 'Excellent'],
  [80, 'Strong'],
  [70, 'Good'],
  [55, 'Fair'],
  [0, 'Needs work'],
];

function bandFor(score: number): string {
  return BAND.find(([min]) => score >= min)?.[1] ?? 'Needs work';
}

/** Escape XML text so a malicious title can't break out of the SVG. */
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Truncate a title to a display width by character budget (rough, fine for SVG). */
function clipTitle(title: string, maxChars = 30): string {
  return title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  // Public and DB-backed: throttle by IP like every other public route, so an
  // embed target cannot be turned into free unbounded database load.
  const rl = await rateLimit(clientKey(req, 'badge'), LIMITS.READ.limit, LIMITS.READ.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return Response.json(body, init);
  }

  if (!/^[a-z0-9_-]{8,64}$/i.test(params.id)) {
    return new Response('Not found', { status: 404 });
  }

  // Opt-in gate, same as the share page: only a published score card can be
  // embedded. Anything else is 404, so a revoked card stops rendering on every
  // site that embedded it within the cache window.
  const row = await prisma.analysisReport.findFirst({
    where: { id: params.id, sharedAt: { not: null } },
    select: { title: true, targetPlatform: true, overallScore: true },
  });
  if (!row) return new Response('Not found', { status: 404 });

  const score = Math.max(0, Math.min(100, row.overallScore));
  const band = bandFor(score);
  const title = clipTitle(row.title || 'Untitled upload');
  const platform = xml(row.targetPlatform || 'Video');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120" viewBox="0 0 260 120" role="img" aria-label="Publish Score ${score} out of 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E1518"/>
      <stop offset="1" stop-color="#0A0F12"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7CFF9A"/>
      <stop offset="1" stop-color="#3DDC84"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="259" height="119" rx="14" fill="url(#bg)" stroke="#1E2A30"/>
  <text x="14" y="24" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#7CFF9A">PUBLISH SCORE</text>
  <text x="14" y="72" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="44" font-weight="800" fill="#FFFFFF">${score}</text>
  <text x="76" y="64" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="700" fill="${score >= 70 ? '#7CFF9A' : score >= 55 ? '#F5C453' : '#FF7A7A'}">${band}</text>
  <text x="76" y="84" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="12" font-weight="500" fill="#8FA3AB">/ 100</text>
  <text x="14" y="100" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="11.5" font-weight="600" fill="#D7E2E6">${xml(title)}</text>
  <text x="246" y="100" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="10.5" font-weight="600" text-anchor="end" fill="#5B6E76">${platform}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
