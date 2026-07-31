/**
 * Activity feed.
 *
 * There is no notifications table, and there deliberately isn't one: every item
 * in this feed is DERIVED from a row that already exists — a review job, the
 * report it produced, a subscription record. That means the feed can never drift
 * from reality, can never show an event that did not happen, and needs no
 * background writer to stay correct.
 *
 * Read state is a single timestamp on the user (`activitySeenAt`). Anything with
 * a timestamp newer than it is unread. Nothing is stored per item.
 */
import { prisma } from './db';
import { PLAN_LIMITS, type Plan } from './session';

export type ActivityKind = 'review_complete' | 'review_failed' | 'review_running' | 'billing';

export interface ActivityItem {
  /** Stable across renders: derived from the source row's id. */
  id: string;
  kind: ActivityKind;
  title: string;
  body: string;
  at: Date;
  /** Where clicking the item should go. Null when there is nothing to open. */
  href: string | null;
  unread: boolean;
}

/** How far back the feed looks. Older rows stay queryable in Reports. */
const FEED_DAYS = 60;

/** Hard cap so a heavy account cannot turn this page into a slow query. */
const FEED_LIMIT = 40;

function truncate(value: string, max = 72): string {
  const clean = value.trim();
  if (clean.length <= max) return clean || 'Untitled';
  return `${clean.slice(0, max - 1)}…`;
}

function planLabel(plan: string): string {
  const normalized = plan.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Builds the feed for one user.
 *
 * `seenAt` is passed in rather than read here so the caller can mark the feed as
 * seen in the same request without the two disagreeing about what was unread at
 * render time.
 */
export async function getActivity(
  dbUserId: string,
  seenAt: Date | null,
): Promise<{ items: ActivityItem[]; unread: number }> {
  const since = new Date(Date.now() - FEED_DAYS * 24 * 60 * 60 * 1000);

  const [jobs, subscriptions] = await Promise.all([
    prisma.analysisJob.findMany({
      where: { userId: dbUserId, updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: FEED_LIMIT,
      select: {
        id: true,
        title: true,
        targetPlatform: true,
        status: true,
        reportId: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
      },
    }),
    prisma.subscription.findMany({
      where: { userId: dbUserId, updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  // Scores live on the report, not the job. One extra query rather than a join
  // per row, and only for jobs that actually produced a report.
  const reportIds = jobs.map((j) => j.reportId).filter((v): v is string => Boolean(v));
  const reports = reportIds.length
    ? await prisma.analysisReport.findMany({
        where: { id: { in: reportIds }, userId: dbUserId },
        select: { id: true, overallScore: true, monetizationScore: true },
      })
    : [];
  const scoreById = new Map(reports.map((r) => [r.id, r]));

  const items: ActivityItem[] = [];

  for (const job of jobs) {
    const label = truncate(job.title);
    const at = job.finishedAt ?? job.updatedAt;

    if (job.status === 'COMPLETED' && job.reportId) {
      const report = scoreById.get(job.reportId);
      items.push({
        id: `job:${job.id}`,
        kind: 'review_complete',
        title: `Review complete — ${label}`,
        body: report
          ? `Publish Score ${report.overallScore}/100 · monetization ${report.monetizationScore}/100 · ${job.targetPlatform}. Open the report to see the priority fixes.`
          : `Finished for ${job.targetPlatform}. Open the report to see the priority fixes.`,
        at,
        href: `/analysis/${job.reportId}`,
        unread: !seenAt || at > seenAt,
      });
      continue;
    }

    if (job.status === 'FAILED') {
      items.push({
        id: `job:${job.id}`,
        kind: 'review_failed',
        title: `Review did not finish — ${label}`,
        body:
          job.error?.trim() ||
          'The review stopped before it produced a report. Your allowance was not charged.',
        at,
        href: '/upload',
        unread: !seenAt || at > seenAt,
      });
      continue;
    }

    // QUEUED / RUNNING, and the COMPLETED-but-report-missing edge case, which is
    // still legitimately "in progress" from the reader's point of view.
    items.push({
      id: `job:${job.id}`,
      kind: 'review_running',
      title: `Review in progress — ${label}`,
      body: `Queued for ${job.targetPlatform}. This page updates when it finishes.`,
      at,
      href: '/reports',
      unread: false, // An unfinished job is not news; it becomes news when it lands.
    });
  }

  for (const sub of subscriptions) {
    const status = sub.status.toLowerCase();
    const at = sub.updatedAt;
    let title: string;
    let body: string;

    if (sub.cancelledAt || status === 'cancelled') {
      title = `${planLabel(sub.plan)} plan cancelled`;
      body = `You keep full access until ${formatDate(sub.currentPeriodEnd)}. Resubscribing before then leaves nothing interrupted.`;
    } else if (status === 'past_due' || status === 'unpaid') {
      title = 'Payment did not go through';
      body = 'Update your card in Settings → Billing. Access stays on while the payment retries.';
    } else if (status === 'expired') {
      title = `${planLabel(sub.plan)} plan ended`;
      body = `Your paid period ended on ${formatDate(sub.currentPeriodEnd)}. You are on the free plan now.`;
    } else if (status === 'paused') {
      title = `${planLabel(sub.plan)} plan paused`;
      body = 'Resume it from Settings → Billing whenever you are ready to review again.';
    } else {
      const limit = PLAN_LIMITS[sub.plan.toLowerCase() as Plan] ?? null;
      title = `${planLabel(sub.plan)} plan active`;
      body = limit
        ? `${limit} reviews per cycle. Renews ${formatDate(sub.currentPeriodEnd)}.`
        : `Renews ${formatDate(sub.currentPeriodEnd)}.`;
    }

    items.push({
      id: `sub:${sub.id}:${status}`,
      kind: 'billing',
      title,
      body,
      at,
      href: '/settings?tab=billing',
      unread: !seenAt || at > seenAt,
    });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const trimmed = items.slice(0, FEED_LIMIT);

  return { items: trimmed, unread: trimmed.filter((i) => i.unread).length };
}

/**
 * Count-only variant for the header bell. Mirrors `getActivity`'s unread rule —
 * a finished job or a subscription change newer than `activitySeenAt` — without
 * building any strings.
 */
export async function getUnreadActivityCount(dbUserId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: dbUserId },
    select: { activitySeenAt: true },
  });

  const floor = new Date(Date.now() - FEED_DAYS * 24 * 60 * 60 * 1000);
  const seenAt = user?.activitySeenAt ?? null;
  const after = seenAt && seenAt > floor ? seenAt : floor;

  const [jobs, subscriptions] = await Promise.all([
    prisma.analysisJob.count({
      where: {
        userId: dbUserId,
        status: { in: ['COMPLETED', 'FAILED'] },
        updatedAt: { gt: after },
      },
    }),
    prisma.subscription.count({
      where: { userId: dbUserId, updatedAt: { gt: after } },
    }),
  ]);

  return Math.min(jobs + subscriptions, 99);
}

/** Records that the user has now seen everything up to this moment. */
export async function markActivitySeen(dbUserId: string): Promise<void> {
  await prisma.user.update({
    where: { id: dbUserId },
    data: { activitySeenAt: new Date() },
  });
}
