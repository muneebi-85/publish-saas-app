/**
 * POST /api/newsletter — landing-page signup sink.
 *
 * The footer form used to be a lie: its onSubmit called `setSubscribed(true)` and
 * nothing else, so the visitor was shown "check your inbox to confirm" while the
 * address they typed was thrown away. This route is what makes that message true.
 *
 * Unauthenticated by necessity — the form sits on the marketing page, before
 * anyone has an account — so it is constrained the same way `/api/telemetry` is:
 *
 *   - IP-keyed rate limit; a form on a public page is a spam target.
 *   - 2 KB body cap, parsed only after the cap.
 *   - One field, validated and normalised; nothing is echoed back.
 *   - Upsert on a unique email, so a repeat signup is idempotent rather than
 *     another row (and so the response cannot be used to probe who is subscribed:
 *     a new address and an existing one get the same 200).
 *
 * Sending the actual confirmation is a separate concern and deliberately not done
 * here. `src/lib/email.ts` is the transport when a provider is configured; until
 * then the address is stored, which is the part that cannot be recovered later.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where a signup came from. Only one form exists today; the column is ready. */
const SOURCES = ['landing-footer'] as const;

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, 'newsletter'), LIMITS.NEWSLETTER.limit, LIMITS.NEWSLETTER.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  const parsed = await v.jsonBody(req, { maxBytes: 2_000 });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const email = v.email((parsed.value as Record<string, unknown>).email);
  if (!email.ok) {
    return NextResponse.json({ error: email.error }, { status: 400 });
  }

  const source = v.enumOf(
    (parsed.value as Record<string, unknown>).source ?? 'landing-footer',
    SOURCES,
    'source',
  );

  try {
    await prisma.newsletterSubscriber.upsert({
      where: { email: email.value },
      // Re-signing up clears a previous opt-out: typing your address into the
      // form again is an explicit request to start receiving mail.
      update: { unsubscribedAt: null },
      create: {
        email: email.value,
        source: source.ok ? source.value : 'landing-footer',
      },
    });
  } catch (err) {
    console.error('[newsletter] subscribe failed', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Could not save your address. Please try again in a moment.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
