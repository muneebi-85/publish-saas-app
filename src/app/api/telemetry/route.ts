/**
 * POST /api/telemetry — sink for client-side crash reports.
 *
 * `global-error.tsx` renders when React has already unmounted the tree, which can
 * happen before or after sign-in, so this route is deliberately unauthenticated:
 * requiring a session would drop exactly the errors that break auth. That makes
 * it a public write endpoint, so it is constrained hard:
 *
 *   - IP-keyed rate limit (a crash loop must not become a log flood).
 *   - 4 KB body cap, parsed only after the cap.
 *   - Every field is length-clamped and type-checked; nothing is echoed back.
 *   - Output goes to the platform log (structured, one line), never to the DB —
 *     an unauthenticated caller must not be able to grow our tables.
 *
 * There is no third-party vendor here on purpose: the beacon is useful on its own
 * via `vercel logs`, and wiring Sentry/PostHog later means changing only `report()`.
 */

import { NextResponse } from 'next/server';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hard ceilings. A stack trace is useful; a megabyte of it is an attack. */
const MAX_MESSAGE = 1_000;
const MAX_DIGEST = 128;
const MAX_URL = 500;
const MAX_STACK = 4_000;

const clamp = (val: unknown, max: number): string | null =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim().slice(0, max) : null;

export async function POST(req: Request) {
  // Keyed by IP because there is no authenticated identity to key on here.
  const rl = await rateLimit(clientKey(req, 'telemetry'), LIMITS.TELEMETRY.limit, LIMITS.TELEMETRY.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const parsed = await v.jsonBody(req, { maxBytes: 8_000 });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.value as Record<string, unknown>;

  const message = clamp(body.message, MAX_MESSAGE);
  if (!message) {
    return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  }

  // Single structured line so a log search can group by digest. `console.error`
  // is the transport Vercel captures; there is no separate agent to configure.
  console.error(
    '[client-error]',
    JSON.stringify({
      message,
      digest: clamp(body.digest, MAX_DIGEST),
      url: clamp(body.url, MAX_URL),
      stack: clamp(body.stack, MAX_STACK),
      userAgent: clamp(req.headers.get('user-agent'), 200),
      at: new Date().toISOString(),
    }),
  );

  // 204: the client is mid-crash and has nothing to do with a response body.
  return new NextResponse(null, { status: 204 });
}
