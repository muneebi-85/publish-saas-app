/**
 * GDPR Art. 17 — right to erasure, implemented as a *scheduled* deletion.
 *
 * POST   schedules deletion 30 days out and cancels live subscriptions now.
 * DELETE cancels a pending deletion ("Keep my account").
 *
 * Why scheduled rather than immediate: erasure is irreversible and account
 * takeover is a real threat. A 30-day window means a stolen session cannot
 * destroy someone's work before they notice, and it matches what the UI and the
 * privacy policy already promise. The terminal hard delete runs in
 * /api/cron/purge-deletions.
 *
 * Any authenticated user may erase their own account — this is a legal
 * obligation, not an admin action, so it is gated on requireAuth() and scoped
 * to the caller's own row. There is no identifier a caller could substitute to
 * reach someone else's account.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guards';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { jsonBody, string } from '@/lib/validate';
import { prisma } from '@/lib/db';
import { cancelSubscription } from '@/lib/billing/lemonsqueezy';
import { sendDeletionScheduled, sendDeletionCancelled } from '@/lib/email';
import { hasEmail } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Grace period between the request and irreversible erasure. */
const GRACE_DAYS = 30;

/** Subscription states that are still billable and must be cancelled. */
const BILLABLE = new Set(['active', 'on_trial', 'past_due', 'unpaid']);

export async function POST(req: Request) {
  // Guards sit outside the try so their responses can never be swallowed
  // into a 500 by the catch below.
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'account-delete'),
    LIMITS.ACCOUNT.limit,
    LIMITS.ACCOUNT.windowMs,
  );
  if (!rl.success) {
    const r = tooManyRequests(rl);
    return NextResponse.json(r.body, r.init);
  }

  const body = await jsonBody(req, { maxBytes: 4_000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  // Reason is optional — an empty body is a valid request. When given it is
  // length-capped and stored only in the server log, never in the user row we
  // are about to erase.
  let reason = '';
  if (body.value.reason !== undefined && body.value.reason !== null && body.value.reason !== '') {
    const r = string(body.value.reason, { max: 500, field: 'reason' });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    reason = r.value;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authCtx.dbUserId },
      select: {
        id: true,
        email: true,
        deleteScheduledAt: true,
        subscriptions: { select: { lsSubscriptionId: true, status: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // Idempotent: asking twice reports the existing date instead of pushing it
    // further out, so a double-click cannot silently extend the grace period.
    if (user.deleteScheduledAt) {
      return NextResponse.json(
        { success: true, alreadyScheduled: true, scheduledFor: user.deleteScheduledAt.toISOString() },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const scheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);

    // Stop billing first. Each cancel is isolated: cancelSubscription can throw
    // (network) or return false (API rejection), and neither may block a legal
    // erasure request. Failures are logged loudly for manual follow-up — the
    // user is never charged for a plan they asked to leave.
    for (const sub of user.subscriptions) {
      if (!BILLABLE.has(sub.status)) continue;
      try {
        const ok = await cancelSubscription(sub.lsSubscriptionId);
        if (!ok) {
          console.error(
            '[account/delete] provider refused cancellation',
            { userId: user.id, subscriptionId: sub.lsSubscriptionId },
          );
        }
      } catch (e) {
        console.error(
          '[account/delete] cancellation threw',
          { userId: user.id, subscriptionId: sub.lsSubscriptionId },
          e,
        );
      }
    }

    // Claim-by-update: only the first request to find a null date wins, so two
    // concurrent submissions cannot produce two different deadlines.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, deleteScheduledAt: null },
      data: { deleteScheduledAt: scheduledFor },
    });
    if (claimed.count === 0) {
      const fresh = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deleteScheduledAt: true },
      });
      return NextResponse.json(
        {
          success: true,
          alreadyScheduled: true,
          scheduledFor: (fresh?.deleteScheduledAt ?? scheduledFor).toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.warn('[account/delete] scheduled', {
      userId: user.id,
      scheduledFor: scheduledFor.toISOString(),
      reason: reason || '(none given)',
    });

    // Confirmation mail is best-effort. The in-app control in Settings is the
    // primary way to cancel, so a missing key or a bounced send can never trap
    // someone in a pending deletion.
    if (hasEmail() && user.email) {
      const mail = await sendDeletionScheduled({ to: user.email, scheduledFor });
      if (!mail.success) {
        console.error('[account/delete] confirmation email failed', mail.error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        scheduledFor: scheduledFor.toISOString(),
        graceDays: GRACE_DAYS,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[POST /api/account/delete]', err);
    return NextResponse.json(
      { error: 'Could not schedule deletion. Please try again or contact privacy@genapps.online.' },
      { status: 500 },
    );
  }
}

/**
 * Cancels a pending deletion. Deliberately generous: no rate limit tighter than
 * the account bucket, and a no-op when nothing is scheduled, because the failure
 * mode of blocking this call is a user losing their account against their will.
 */
export async function DELETE() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  try {
    const cleared = await prisma.user.updateMany({
      where: { id: authCtx.dbUserId, deleteScheduledAt: { not: null } },
      data: { deleteScheduledAt: null },
    });

    if (cleared.count === 0) {
      // Nothing was pending. Report success — the desired end state holds.
      return NextResponse.json(
        { success: true, scheduledFor: null, changed: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.warn('[account/delete] cancelled', { userId: authCtx.dbUserId });

    const user = await prisma.user.findUnique({
      where: { id: authCtx.dbUserId },
      select: { email: true },
    });
    if (hasEmail() && user?.email) {
      const mail = await sendDeletionCancelled({ to: user.email });
      if (!mail.success) {
        console.error('[account/delete] cancellation email failed', mail.error);
      }
    }

    return NextResponse.json(
      { success: true, scheduledFor: null, changed: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[DELETE /api/account/delete]', err);
    return NextResponse.json(
      { error: 'Could not cancel the deletion. Please contact privacy@genapps.online.' },
      { status: 500 },
    );
  }
}
