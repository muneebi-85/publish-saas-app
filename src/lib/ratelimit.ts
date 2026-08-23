/**
 * Rate limiting.
 *
 * Uses Upstash Redis when configured (production), falls back to a per-process
 * in-memory bucket for local development.
 *
 * The in-memory limiter is intentionally simple: single-node only, resets on
 * server restart. It exists so devs and hobby deploys are protected against
 * accidental infinite loops during coding, not against a determined attacker.
 * For production, set UPSTASH_REDIS_REST_URL/TOKEN.
 */

type Result = { success: boolean; limit: number; remaining: number; resetAt: number };

import { env } from './env';

const memoryStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Drop expired buckets so a long-lived process cannot grow the map without
 * bound (each distinct key/window pair would otherwise leak an entry).
 */
function sweepMemoryStore(now: number): void {
  if (memoryStore.size < 5_000) return;
  for (const [k, rec] of memoryStore) {
    if (rec.resetAt < now) memoryStore.delete(k);
  }
}

function inMemoryLimit(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
  sweepMemoryStore(now);
  const rec = memoryStore.get(key);
  if (!rec || rec.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, limit, remaining: limit - 1, resetAt: now + windowMs };
  }
  rec.count += 1;
  const success = rec.count <= limit;
  return { success, limit, remaining: Math.max(0, limit - rec.count), resetAt: rec.resetAt };
}

async function upstashLimit(key: string, limit: number, windowMs: number): Promise<Result | null> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Fixed-window INCR + EXPIRE. Not perfectly smooth but predictable and cheap.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const cacheKey = `rl:${key}:${bucket}`;
    const resetAt = (bucket + 1) * windowMs;

    // pipelined command: INCR + PEXPIRE
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', cacheKey],
        ['PEXPIRE', cacheKey, String(windowMs)],
      ]),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: number }[];
    const count = data[0]?.result ?? 0;
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // Network/timeout: fall through to the in-memory bucket rather than either
    // failing the request or letting it through unlimited.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<Result> {
  const remote = await upstashLimit(key, limit, windowMs);
  if (remote) return remote;
  return inMemoryLimit(key, limit, windowMs);
}

/**
 * Standard limits by route class. Reasonable defaults; tune when we see abuse.
 */
export const LIMITS = {
  ANALYZE:   { limit: 20, windowMs: 60 * 60 * 1000 },  // 20 / hour
  HUMANIZE:  { limit: 60, windowMs: 60 * 60 * 1000 },  // 60 / hour
  SEO:       { limit: 60, windowMs: 60 * 60 * 1000 },
  COACH:     { limit: 40, windowMs: 60 * 60 * 1000 },  // 40 messages / hour
  AUTH:      { limit: 10, windowMs: 60 * 1000 },       // 10 / minute
  WEBHOOK:   { limit: 100, windowMs: 60 * 1000 },
  CHANNELS:  { limit: 20, windowMs: 60 * 60 * 1000 },  // channel connect/refresh
  UPLOAD:    { limit: 60, windowMs: 60 * 60 * 1000 },  // presigned URL issuance
  ACCOUNT:   { limit: 5,  windowMs: 60 * 60 * 1000 },  // export / delete
  // Per-item writes (rename/delete one report). Deliberately far looser than
  // ACCOUNT: clearing out a dozen old reports is normal use, not abuse.
  PROJECT_WRITE: { limit: 60, windowMs: 60 * 60 * 1000 },
  READ:      { limit: 240, windowMs: 60 * 1000 },      // cheap authenticated reads
  // Client crash beacons. Unauthenticated and IP-keyed, so this is the ceiling on
  // a render loop: enough to capture a genuine burst of distinct errors, low
  // enough that a re-mounting error boundary cannot flood the log.
  TELEMETRY: { limit: 30, windowMs: 60 * 1000 },
  // Landing-page newsletter signup. Unauthenticated and IP-keyed. Low on purpose:
  // one person subscribes once, so anything above a handful per hour from a single
  // address is a script filling the form, not a reader changing their mind.
  NEWSLETTER: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

export function clientKey(req: Request, prefix: string): string {
  // IP-derived key. Only correct for unauthenticated routes — an authenticated
  // route must use userKey() so one user behind a shared NAT cannot exhaust the
  // bucket for everyone else on that IP (and so rotating IPs cannot bypass it).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon';
  return `${prefix}:ip:${ip}`;
}

/**
 * Rate-limit key bound to the authenticated user. Preferred for every route
 * behind requireAuth(): the identity cannot be spoofed by forging headers.
 */
export function userKey(userId: string, prefix: string): string {
  return `${prefix}:user:${userId}`;
}

/** Standard 429 body + Retry-After, so every route reports limits identically. */
export function tooManyRequests(result: Result) {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return {
    body: {
      error: 'Too many requests. Please slow down and try again shortly.',
      retryAfter,
    },
    init: {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    },
  } as const;
}
