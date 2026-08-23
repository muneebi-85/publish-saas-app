import { NextResponse } from 'next/server';
import { env, hasBilling, hasStorage, hasTranscription, hasJobQueue, hasEmail, hasLiveModel } from '@/lib/env';
import { prisma } from '@/lib/db';

/**
 * Lightweight health probe.
 *
 * Used by uptime monitors and deploy smoke tests.
 *
 * Design:
 *   • Config reflects `env.*` — the single source of truth — never process.env,
 *     which is how the old version reported uploads:false on a correct deploy
 *     (it checked UPLOADTHING_SECRET / R2_ACCESS_KEY_ID that env.ts never reads).
 *   • The only downstream probe is the database (a 1-second-capped SELECT 1),
 *     because the app is useless without it and monitors need to know. AI, billing,
 *     and queue endpoints are deliberately NOT probed — they would create cascading
 *     failures during an outage and none of them is required for a cold start.
 *   • Fast: the DB probe has a 1.5s cap, so a hung connection reports degraded
 *     instead of hanging the probe forever.
 *   • One retry, because the FIRST probe after a cold start is not measuring the
 *     database — it is paying for Prisma's connect (pool open + TLS + auth), which
 *     on a serverless-Postgres deploy routinely exceeds the cap on its own. The old
 *     single-shot version therefore answered 503 to the first request after every
 *     deploy or scale-to-zero, which is precisely when a monitor is watching: the
 *     alert fires, a human looks, and by then the second request is 200. A retry is
 *     the honest fix because the connect cost is paid once and never again.
 */
export const runtime = 'nodejs';
// The DB probe must run per-request; a cached health check reports stale liveness.
export const dynamic = 'force-dynamic';

/**
 * Per-attempt cap on the DB probe so a hung connection degrades instead of hanging
 * the monitor. Two attempts, so the worst case a caller waits is ~2 × this plus the
 * pause — still well inside a normal uptime-monitor timeout.
 */
const DB_PROBE_TIMEOUT_MS = 1_500;

/** Attempts before reporting degraded. The second one is the post-connect probe. */
const DB_PROBE_ATTEMPTS = 2;

/**
 * Short pause between attempts. Long enough for an in-flight connect to finish
 * settling, short enough that it is invisible next to the probe cap itself.
 */
const DB_RETRY_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One capped `SELECT 1`. Rejects on timeout so the caller can decide to retry. */
async function probeDatabase(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`DB probe exceeded ${DB_PROBE_TIMEOUT_MS}ms`)),
          DB_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    // Without this the pending timer keeps the event loop alive for up to 1.5s
    // after a successful probe — harmless in a long-lived server, but it holds a
    // serverless invocation open past the response for no reason.
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const started = Date.now();

  let db: 'ok' | 'degraded' = 'degraded';
  let dbError: string | null = null;
  for (let attempt = 1; attempt <= DB_PROBE_ATTEMPTS; attempt++) {
    try {
      await probeDatabase();
      db = 'ok';
      dbError = null;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Only the last failure is reported, prefixed so a reader can tell a genuine
      // outage (two failures) from a slow first connect (which never gets here).
      dbError = `${message} (after ${attempt} attempt${attempt === 1 ? '' : 's'})`;
      if (attempt < DB_PROBE_ATTEMPTS) await sleep(DB_RETRY_DELAY_MS);
    }
  }

  const status = db === 'ok' ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      time: new Date().toISOString(),
      latencyMs: Date.now() - started,
      database: db,
      ...(dbError ? { databaseError: dbError } : {}),
      configured: {
        nvidia: hasLiveModel(),
        database: Boolean(env.DATABASE_URL),
        lemonSqueezy: hasBilling(),
        uploads: hasStorage(),
        transcription: hasTranscription(),
        email: hasEmail(),
        redis: Boolean(env.UPSTASH_REDIS_REST_URL),
        jobQueue: hasJobQueue(),
      },
    },
    status === 'ok' ? { status: 200 } : { status: 503 },
  );
}
