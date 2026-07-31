/**
 * POST /api/upload/presign — issue a short-lived presigned PUT for one asset.
 *
 * Security posture:
 *   - Content type is allowlisted per slot, and the signature pins ContentType +
 *     ContentLength, so the browser cannot swap in an HTML/SVG payload after the
 *     URL is issued (which would otherwise be a stored-XSS vector on the CDN).
 *   - The object key is server-generated and namespaced under the caller's own
 *     Clerk id, so one user can never overwrite or address another's upload.
 *   - Per-slot size ceilings are enforced at signing time, not just in the UI.
 */

import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/api-guards';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { env, hasStorage } from '@/lib/env';
import * as v from '@/lib/validate';

export const runtime = 'nodejs';

const SLOTS = ['video', 'thumbnail', 'script', 'voiceover'] as const;
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
};

let _s3: S3Client | null = null;
function client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: env.S3_REGION || 'auto',
      // Set for R2 / MinIO; empty for real AWS S3.
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3;
}

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

  const size = v.integer(body.size, { min: 1, max: rule.maxBytes, field: 'size' });
  if (!size.ok) {
    const mb = Math.floor(rule.maxBytes / (1024 * 1024));
    return NextResponse.json(
      { error: `${slot.value} must be between 1 byte and ${mb} MB.` },
      { status: 413 },
    );
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

  try {
    const signedUrl = await getSignedUrl(
      client(),
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        // Both are signed, so the PUT is rejected unless the browser sends
        // exactly the type and length we approved.
        ContentType: declaredType,
        ContentLength: size.value,
        Metadata: { slot: slot.value, owner: authCtx.clerkId },
      }),
      { expiresIn: 900 }, // 15 minutes — long enough for a large video, short enough to matter
    );

    return NextResponse.json(
      {
        signedUrl,
        key,
        // Only present when a public read origin is configured; otherwise the
        // caller must go through a signed read, and we don't hand out a guess.
        publicUrl: env.S3_PUBLIC_URL ? `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${key}` : null,
        requiredHeaders: { 'Content-Type': declaredType },
        expiresInSeconds: 900,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    // Never surface the SDK message — it can contain the bucket name and region.
    console.error('[POST /api/upload/presign]', err);
    return NextResponse.json(
      { error: 'Could not prepare the upload. Please try again.' },
      { status: 502 },
    );
  }
}
