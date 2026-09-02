/**
 * GET /api/cron/purge-deletions — the terminal half of GDPR Art. 17.
 *
 * /api/account/delete only sets User.deleteScheduledAt. Nothing erases anything
 * until this sweep finds a row whose grace period has fully elapsed. Split that
 * way on purpose: the request path stays reversible, and the irreversible step
 * runs somewhere a stolen session cannot reach.
 *
 * Ordering is Clerk first, then the database. ensureUser() in src/lib/session.ts
 * is a find-then-upsert, so a surviving Clerk identity plus a deleted DB row
 * would silently recreate a blank account on the user's next request — the
 * erasure would appear to succeed and then undo itself. Removing the sign-in
 * identity first means the worst case is a DB row with no way to authenticate
 * into it, which the next sweep cleans up.
 *
 * Wired up in vercel.json. Refuses to run without CRON_SECRET rather than
 * exposing an unauthenticated endpoint that deletes accounts.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { clerkClient } from '@clerk/nextjs/server';
import { cancelSubscription } from '@/lib/billing/lemonsqueezy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Rows processed per run. Bounded so one sweep cannot exceed maxDuration. */
const BATCH = 50;

/** Still-billable states. Belt and braces: POST already cancelled these.
 * 'paused' bills again the moment Lemon Squeezy auto-resumes it. */
const BILLABLE = new Set(['active', 'on_trial', 'past_due', 'unpaid', 'paused']);

/**
 * Sentinel for "the irreversible erasure has begun". Written by the sweep's
 * final gate and recognized by the cancel path, which refuses while it holds.
 * Without it, a cancellation landing between the sweep's pre-delete check and
 * the delete itself still erased the account — the TOCTOU hole this closes:
 * the conditional update IS the check, and the cancel route cannot flip the
 * marker back once the sentinel is in.
 */
const PURGING_SENTINEL = new Date(0);

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(req: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header = req.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    // Identical answer whether the secret is wrong or unset.
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result: Record<string, unknown> = { ranAt: new Date().toISOString() };

  let purged = 0;
  let clerkMissing = 0;
  let failed = 0;

  try {
    // Sentinel rows (epoch 0 — a sweep that died mid-erasure) are deliberately
    // still selected: the top-of-loop claim pushes them to a retry deadline,
    // so a stuck lock is un-stuck by the next run instead of leaving an
    // uncancellable, undeletable account forever.
    const due = await prisma.user.findMany({
      where: { deleteScheduledAt: { not: null, lte: new Date() } },
      select: {
        id: true,
        clerkId: true,
        deleteScheduledAt: true,
        subscriptions: { select: { lsSubscriptionId: true, status: true } },
      },
      orderBy: { deleteScheduledAt: 'asc' },
      take: BATCH,
    });

    for (const user of due) {
      // Re-read the deadline under a predicate before touching anything
      // irreversible. If the user cancelled between the findMany and now, the
      // update matches nothing and we leave the account alone.
      const claimed = await prisma.user
        .updateMany({
          where: { id: user.id, deleteScheduledAt: { not: null, lte: new Date() } },
          // Push the marker back a day. If a later step throws, the row is not
          // retried until tomorrow instead of being hammered every run.
          data: { deleteScheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        })
        .catch(() => ({ count: 0 }));
      if (claimed.count === 0) continue;

      try {
        // Any subscription still billable at this point escaped the cancel in
        // the request path (provider outage). Last chance to stop the charges.
        for (const sub of user.subscriptions) {
          if (!BILLABLE.has(sub.status)) continue;
          try {
            const ok = await cancelSubscription(sub.lsSubscriptionId);
            if (!ok) {
              console.error('[cron/purge] provider refused cancellation', {
                userId: user.id,
                subscriptionId: sub.lsSubscriptionId,
              });
            }
          } catch (e) {
            console.error('[cron/purge] cancellation threw', {
              userId: user.id,
              subscriptionId: sub.lsSubscriptionId,
            }, e);
          }
        }

        // 0. Point of no return. The billing cancellations above can take tens
        //    of seconds (serial 10s-timeout network calls), and the user may
        //    have cancelled the deletion through /api/account/delete during
        //    that window. This conditional update is the last look itself: it
        //    only succeeds while the marker is still set, and writing the
        //    PURGING sentinel locks it — the cancel route refuses while the
        //    sentinel holds, so no cancellation can slip between "checked" and
        //    "deleted" the way the old count-then-delete could.
        const locked = await prisma.user
          .updateMany({
            where: { id: user.id, deleteScheduledAt: { not: null } },
            data: { deleteScheduledAt: PURGING_SENTINEL },
          })
          .catch(() => ({ count: 0 }));
        if (locked.count === 0) {
          // Deletion was cancelled while we were cancelling billing. Skip the
          // account entirely; the next sweep re-evaluates from scratch.
          console.warn('[cron/purge] deletion cancelled during sweep', { userId: user.id });
          continue;
        }

        // 1. Remove the sign-in identity. A 404 means it is already gone —
        //    that is success, not an error, so the DB row still gets cleaned.
        try {
          // Clerk v5: clerkClient is an object instance, not a factory. Calling
          // it (the v6 form) throws before the DB row is touched, which would
          // strand every erasure in this sweep.
          await clerkClient.users.deleteUser(user.clerkId);
        } catch (e) {
          const status = (e as { status?: number })?.status;
          if (status === 404) {
            clerkMissing += 1;
          } else {
            throw e;
          }
        }

        // 2. Remove the application data. Every relation is onDelete: Cascade,
        //    so projects, reviews, reports, comments, channels, keys and jobs
        //    go with it. Subscription rows carry no personal data beyond the
        //    provider ids and are removed too; the provider retains its own
        //    invoice records for the statutory period, as the policy states.
        await prisma.user.delete({ where: { id: user.id } });

        purged += 1;
        console.warn('[cron/purge] account erased', { userId: user.id });
      } catch (e) {
        failed += 1;
        // Unlock the row: restore the grace-state marker so the account is
        // cancellable again. A row left in the PURGING sentinel could never be
        // cancelled, which would break the 30-day promise for a transient error.
        // The backoff also prevents the next sweep from hammering a failing step.
        await prisma.user
          .updateMany({
            where: { id: user.id, deleteScheduledAt: PURGING_SENTINEL },
            data: { deleteScheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          })
          .catch(() => undefined);
        console.error('[cron/purge] erasure failed', { userId: user.id }, e);
      }
    }

    result.deletions = { due: due.length, purged, clerkMissing, failed };
  } catch (err) {
    console.error('[cron/purge] sweep failed:', err);
    result.deletions = { error: 'failed' };
  }

  result.durationMs = Date.now() - startedAt;
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
