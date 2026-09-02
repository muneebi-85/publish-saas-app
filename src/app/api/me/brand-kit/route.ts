/**
 * PUT /api/me/brand-kit — save the caller's brand-kit preferences.
 *
 * Persists the palette, typography, tone, description, and banned words the
 * Brand Kit page edits. The shape is fully validated server-side; nothing
 * user-supplied is stored unvalidated.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { env } from '@/lib/env';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_COLORS = 12;
const MAX_BANNED = 50;
const MAX_TONES = 6;
const MAX_STR_LEN = 200;

/**
 * The logo URL is rendered in an <img>, so it is not free-form text: it must be
 * an https URL under the storage origin this deployment actually uploaded to.
 * Accepting an arbitrary URL here would let a caller point the tag anywhere
 * (tracking pixel, mixed content, or a payload host).
 */
function validateLogoUrl(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || raw.length > 2_048) {
    return { ok: false, error: 'logoUrl must be a string under 2048 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'logoUrl must be a valid absolute URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'logoUrl must use https.' };
  }

  const origin = env.S3_PUBLIC_URL;
  if (!origin) {
    return { ok: false, error: 'This deployment has no public storage origin configured, so a logo URL cannot be stored.' };
  }
  const allowed = origin.replace(/\/+$/, '');
  if (raw !== allowed && !raw.startsWith(`${allowed}/`)) {
    return { ok: false, error: 'logoUrl must point at this deployment’s storage origin.' };
  }

  return { ok: true, value: raw };
}

function sanitizeBrandKit(raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'brandKit must be an object.' };
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.colors) || r.colors.length > MAX_COLORS) {
    return { ok: false, error: 'colors must be an array of at most 12 entries.' };
  }
  const colors: { name: string; hex: string }[] = [];
  for (const c of r.colors) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: 'Invalid color entry.' };
    const { name, hex } = c as Record<string, unknown>;
    if (typeof name !== 'string' || name.length > MAX_STR_LEN) {
      return { ok: false, error: 'Each color needs a name under 200 characters.' };
    }
    if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
      return { ok: false, error: 'Each color needs a hex value like #16A34A.' };
    }
    colors.push({ name: name.trim(), hex: hex.toUpperCase() });
  }

  const headingFont = v.string(r.headingFont, { field: 'headingFont', max: MAX_STR_LEN });
  const bodyFont = v.string(r.bodyFont, { field: 'bodyFont', max: MAX_STR_LEN });
  if (!headingFont.ok) return { ok: false, error: headingFont.error };
  if (!bodyFont.ok) return { ok: false, error: bodyFont.error };

  const description = v.string(r.description, { field: 'description', max: 1_000 });
  if (!description.ok) return { ok: false, error: description.error };

  if (!Array.isArray(r.tones) || r.tones.length > MAX_TONES) {
    return { ok: false, error: 'tones must be an array of at most 6 strings.' };
  }
  const tones: string[] = [];
  for (const t of r.tones) {
    if (typeof t !== 'string' || t.trim().length === 0 || t.length > MAX_STR_LEN) {
      return { ok: false, error: 'Each tone must be a non-empty string under 200 characters.' };
    }
    tones.push(t.trim());
  }

  if (!Array.isArray(r.banned) || r.banned.length > MAX_BANNED) {
    return { ok: false, error: 'banned must be an array of at most 50 strings.' };
  }
  const banned: string[] = [];
  for (const b of r.banned) {
    if (typeof b !== 'string' || b.trim().length === 0 || b.length > MAX_STR_LEN) {
      return { ok: false, error: 'Each banned word must be a non-empty string under 200 characters.' };
    }
    banned.push(b.trim().toLowerCase());
  }

  const logoUrl = validateLogoUrl(r.logoUrl);
  if (!logoUrl.ok) return { ok: false, error: logoUrl.error };

  return {
    ok: true,
    value: {
      colors,
      headingFont: headingFont.value,
      bodyFont: bodyFont.value,
      description: description.value,
      tones,
      banned,
      logoUrl: logoUrl.value,
    },
  };
}

export async function PUT(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'brandkit'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const body = await v.jsonBody(req, { maxBytes: 16_000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const kit = sanitizeBrandKit(body.value.brandKit);
  if (!kit.ok) return NextResponse.json({ error: kit.error }, { status: 400 });

  // P2025 = the row vanished mid-request (deletion racing this save). Answer
  // 409 rather than a raw framework 500.
  try {
    await prisma.user.update({
      where: { id: authCtx.dbUserId },
      data: { brandKit: kit.value as object },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: 'Account is no longer available. Refresh and try again.' },
        { status: 409 },
      );
    }
    console.error('[PUT /api/me/brand-kit] write failed:', err);
    return NextResponse.json({ error: 'Could not save your brand kit.' }, { status: 503 });
  }

  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
