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

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function inMemoryLimit(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Fixed-window INCR + EXPIRE. Not perfectly smooth but predictable and cheap.
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
    return null;
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
  AUTH:      { limit: 10, windowMs: 60 * 1000 },       // 10 / minute
  WEBHOOK:   { limit: 100, windowMs: 60 * 1000 },
} as const;

export function clientKey(req: Request, prefix: string): string {
  // In prod, prefer authenticated user id. Fallback to X-Forwarded-For.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon';
  return `${prefix}:${ip}`;
}
