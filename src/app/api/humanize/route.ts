import { NextResponse } from 'next/server';
import { humanizeScriptContent, HumanizeOptions } from '@/lib/ai/humanizer-engine';
import { rateLimit, clientKey, LIMITS } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requirePaidPlan } from '@/lib/api-guards';

export const runtime = 'nodejs';
export const maxDuration = 45;

const TONES = ['conversational', 'authoritative', 'storyteller', 'energetic'] as const;
const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export async function POST(req: Request) {
  const authCtx = await requirePaidPlan();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(clientKey(req, 'humanize'), LIMITS.HUMANIZE.limit, LIMITS.HUMANIZE.windowMs);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scriptText = v.string(body.scriptText, { min: 10, max: 15000, field: 'scriptText' });
  if (!scriptText.ok) return NextResponse.json({ error: scriptText.error }, { status: 400 });

  const rawOpts = (body.options ?? {}) as Record<string, unknown>;
  const tone = v.enumOf(rawOpts.tone ?? 'conversational', TONES, 'options.tone');
  if (!tone.ok) return NextResponse.json({ error: tone.error }, { status: 400 });
  const target = v.enumOf(rawOpts.targetPlatform ?? 'YouTube', PLATFORMS, 'options.targetPlatform');
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: 400 });
  const formality = v.integer(rawOpts.formality ?? 50, { min: 0, max: 100, field: 'options.formality' });
  if (!formality.ok) return NextResponse.json({ error: formality.error }, { status: 400 });
  const emotion = v.integer(rawOpts.emotionIntensity ?? 60, { min: 0, max: 100, field: 'options.emotionIntensity' });
  if (!emotion.ok) return NextResponse.json({ error: emotion.error }, { status: 400 });

  const options: HumanizeOptions = {
    tone: tone.value,
    targetPlatform: target.value,
    formality: formality.value,
    emotionIntensity: emotion.value,
  };

  try {
    const result = await humanizeScriptContent(scriptText.value, options);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/humanize] error:', err);
    return NextResponse.json({ error: 'Humanize failed. Please retry.' }, { status: 500 });
  }
}
