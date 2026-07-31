import { NextResponse } from 'next/server';
import { humanizeScriptContent, HumanizeOptions } from '@/lib/ai/humanizer-engine';
import { analyzeScriptText } from '@/lib/ai/script-optimizer-engine';
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

  // Cap the body before parsing. scriptText tops out at 15k chars, so 64KB is
  // generous headroom for the options object plus escaping — without it an
  // attacker could stream megabytes that get fully parsed before validation.
  const parsed = await v.jsonBody(req, { maxBytes: 64_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

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

  const durationRaw = rawOpts.durationSeconds ?? body.durationSeconds;
  let durationSeconds: number | undefined;
  if (durationRaw !== undefined && durationRaw !== null && durationRaw !== '') {
    const d = v.integer(durationRaw, { min: 1, max: 86400, field: 'options.durationSeconds' });
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
    durationSeconds = d.value;
  }

  const options: HumanizeOptions = {
    tone: tone.value,
    targetPlatform: target.value,
    formality: formality.value,
    emotionIntensity: emotion.value,
  };

  try {
    // The 12-signal QC report is a pure text heuristic — deterministic and always
    // available. The rewrite calls the model and can degrade to its mock fallback.
    const report = analyzeScriptText({
      scriptText: scriptText.value,
      targetPlatform: target.value,
      durationSeconds,
    });
    const rewrite = await humanizeScriptContent(scriptText.value, options);
    return NextResponse.json({ ...rewrite, report });
  } catch (err) {
    console.error('[POST /api/optimize] error:', err);
    return NextResponse.json({ error: 'Optimization failed. Please retry.' }, { status: 500 });
  }
}
