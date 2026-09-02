import { NextResponse } from 'next/server';
import { generateSEOAnalysis } from '@/lib/ai/seo-engine';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requirePaidPlan } from '@/lib/api-guards';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export async function POST(req: Request) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  // Keyed to the authenticated account, not the IP: a shared NAT must not
  // share one bucket, and rotating IPs must not reset it (the contract that
  // `userKey` exists for on every route behind requireAuth()).
  const rl = await rateLimit(userKey(authCtx.clerkId, 'seo'), LIMITS.SEO.limit, LIMITS.SEO.windowMs);
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Size-capped, non-throwing parse — a megabyte body must be rejected, not
  // parsed, and malformed JSON must be a 400 rather than a 500.
  const parsed = await v.jsonBody(req, { maxBytes: 4_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  const title = v.string(body.title, { min: 3, max: 200, field: 'title' });
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });
  const platform = v.enumOf(body.platform ?? 'YouTube', PLATFORMS, 'platform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });

  try {
    const result = await generateSEOAnalysis(title.value, platform.value);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/seo] error:', err);
    return NextResponse.json({ error: 'SEO analysis failed.' }, { status: 500 });
  }
}
