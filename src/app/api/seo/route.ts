import { NextResponse } from 'next/server';
import { generateSEOAnalysis } from '@/lib/ai/seo-engine';
import { rateLimit, clientKey, LIMITS } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requirePaidPlan } from '@/lib/api-guards';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export async function POST(req: Request) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(clientKey(req, 'seo'), LIMITS.SEO.limit, LIMITS.SEO.windowMs);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

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
