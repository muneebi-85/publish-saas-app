/**
 * POST /api/upload/presign — issue a short-lived presigned POST for one asset.
 *
 * Security posture:
 *   - Content type is allowlisted per slot, and the signed POST POLICY pins it
 *     (`eq $Content-Type`) along with a `content-length-range` the provider
 *     enforces on the wire — a presigned PUT could do neither, because the SDK
 *     marks content-type unsignable and never signs content-length, which
 *     left the door open to a stored `text/html` object on our own public
 *     storage origin and to size-ceiling-free uploads. See
 *     `src/lib/upload/post-policy.ts` for the full story.
 *   - The object key is server-generated and pinned exactly in the policy, so
 *     one user can never overwrite or address another's upload.
 *   - Per-slot size ceilings are enforced at signing time AND by the provider
 *     when the object lands.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { env, hasStorage } from '@/lib/env';
import { buildPresignedPost } from '@/lib/upload/post-policy';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';

const SLOTS = ['video', 'thumbnail', 'script', 'voiceover', 'logo', 'frames'] as const;
type Slot = (typeof SLOTS)[number];

/**
 * Allowlist per slot. Note what is deliberately absent: `image/svg+xml` (it can
 * carry script), `text/html`, and every wildcard. An asset we cannot name is an
 * asset we do not sign for.
 */
const RULES: Record<Slot, { types: string[]; maxBytes: number; exts: string[] }> = {
  video: {
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
    exts: ['mp4', 'mov', 'webm'],
    maxBytes: 4 * 1024 * 1024 * 1024, // 4 GB
  },
  thumbnail: {
    types: ['image/png', 'image/jpeg', 'image/webp'],
    exts: ['png', 'jpg', 'jpeg', 'webp'],
    maxBytes: 15 * 1024 * 1024, // 15 MB
  },
  script: {
    types: [
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    exts: ['txt', 'doc', 'docx'],
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
  voiceover: {
    types: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'],
    exts: ['mp3', 'wav', 'm4a'],
    maxBytes: 300 * 1024 * 1024, // 300 MB
  },
  frames: {
    // A contact sheet of decoded video frames, built by the browser in
    // `src/lib/video/extract-frames.ts`. JPEG only, and small: the sheet is a
    // dozen 320x180 cells at quality 0.72, which lands well under a megabyte.
    // The ceiling is a guard, not a target - anything approaching it is not a
    // contact sheet, and the vision model would not read the extra pixels.
    types: ['image/jpeg'],
    exts: ['jpg', 'jpeg'],
    maxBytes: 3 * 1024 * 1024, // 3 MB
  },
  logo: {
    // Brand-kit logo. SVG is refused here for the same reason as everywhere
    // else: it is a script-carrying format and the logo is rendered inline.
    types: ['image/png', 'image/jpeg', 'image/webp'],
    exts: ['png', 'jpg', 'jpeg', 'webp'],
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
};

/** Strip everything that could escape the key namespace or confuse a CDN. */
function safeName(filename: string): { base: string; ext: string } {
  const cleaned = filename.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const dot = cleaned.lastIndexOf('.');
  const rawExt = dot > 0 ? cleaned.slice(dot + 1).toLowerCase() : '';
  const rawBase = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return {
    base: rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file',
    ext: rawExt.replace(/[^a-z0-9]/g, '').slice(0, 8),
  };
}

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'presign'),
    LIMITS.UPLOAD.limit,
    LIMITS.UPLOAD.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  if (!hasStorage()) {
    return NextResponse.json(
      {
        error:
          'File uploads are not enabled on this deployment. Paste your script text instead, or set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
        storageUnavailable: true,
      },
      { status: 503 },
    );
  }

  const parsed = await v.jsonBody(req, { maxBytes: 4_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  const slot = v.enumOf<Slot>(body.slot, SLOTS, 'slot');
  if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: 400 });

  const filename = v.string(body.filename, { min: 1, max: 255, field: 'filename' });
  if (!filename.ok) return NextResponse.json({ error: filename.error }, { status: 400 });

  const contentType = v.string(body.contentType, { min: 1, max: 128, field: 'contentType' });
  if (!contentType.ok) return NextResponse.json({ error: contentType.error }, { status: 400 });

  const rule = RULES[slot.value];

  // A missing or non-integer size is a malformed request (400); only a size
  // that IS an integer but sits outside the slot's bounds is "too large" (413)
  // — answering 413 for a missing field mislabels the client's mistake.
  const size = v.integer(body.size, { min: 1, max: rule.maxBytes, field: 'size' });
  if (!size.ok) {
    if (body.size === undefined || body.size === null || typeof body.size === 'boolean') {
      return NextResponse.json({ error: size.error }, { status: 400 });
    }
    if (typeof body.size === 'number' && Number.isFinite(body.size) && Number.isInteger(body.size)) {
      const mb = Math.floor(rule.maxBytes / (1024 * 1024));
      return NextResponse.json(
        { error: `${slot.value} must be between 1 byte and ${mb} MB.` },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: size.error }, { status: 400 });
  }

  // Normalize away any `; charset=` suffix before comparing to the allowlist.
  const declaredType = contentType.value.split(';')[0].trim().toLowerCase();
  if (!rule.types.includes(declaredType)) {
    return NextResponse.json(
      { error: `${slot.value} must be one of: ${rule.exts.join(', ')}.` },
      { status: 415 },
    );
  }

  const { base, ext } = safeName(filename.value);
  if (ext && !rule.exts.includes(ext)) {
    return NextResponse.json(
      { error: `${slot.value} must be one of: ${rule.exts.join(', ')}.` },
      { status: 415 },
    );
  }

  // Key is entirely server-derived and namespaced by owner. The client's
  // filename only ever contributes a sanitized display suffix.
  const key = `uploads/${authCtx.clerkId}/${slot.value}/${Date.now()}-${base}${ext ? `.${ext}` : ''}`;

  // 15 minutes — long enough for a large video, short enough to matter.
  const EXPIRES_IN = 900;

  try {
    const post = buildPresignedPost({
      bucket: env.S3_BUCKET,
      key,
      contentType: declaredType,
      minBytes: 1,
      maxBytes: rule.maxBytes,
      expiresInSeconds: EXPIRES_IN,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      region: env.S3_REGION || 'auto',
      // Set for R2 / MinIO; empty for real AWS S3 (virtual-hosted URL).
      endpoint: env.S3_ENDPOINT || undefined,
      owner: authCtx.clerkId,
      slot: slot.value,
    });

    return NextResponse.json(
      {
        // The POST target + the signed form fields. The browser must POST a
        // multipart form with these fields in this order, file appended last.
        signedUrl: post.url,
        fields: post.fields,
        key,
        // Only present when a public read origin is configured; otherwise the
        // caller must go through a signed read, and we don't hand out a guess.
        publicUrl: env.S3_PUBLIC_URL ? `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${key}` : null,
        expiresInSeconds: EXPIRES_IN,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[POST /api/upload/presign]', err);
    return NextResponse.json(
      { error: 'Could not prepare the upload. Please try again.' },
      { status: 502 },
    );
  }
}
