/**
 * GDPR / CCPA data export — right of access and portability.
 *
 * Any authenticated user can export their own data. This is a legal obligation,
 * not an admin tool, so it is gated on `requireAuth()` and scoped entirely to
 * the caller's own database id — there is no addressable identifier a caller
 * could substitute for someone else's account.
 *
 * The account row is explicitly `select`ed rather than dumped whole: internal
 * identifiers (clerkId, Lemon Squeezy customer id, role, feed read-state) are
 * ours, not the user's, and a downloadable file is the wrong place for them.
 */
import { NextResponse } from 'next/server';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Large accounts read several tables.

export async function GET() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'account-export'),
    LIMITS.ACCOUNT.limit,
    LIMITS.ACCOUNT.windowMs,
  );
  if (!rl.success) {
    const r = tooManyRequests(rl);
    return NextResponse.json(r.body, r.init);
  }

  try {
    const uid = authCtx.dbUserId;

    const [account, channels, projects, reports, jobs, comments, subscriptions] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: uid },
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            plan: true,
            auditsUsed: true,
            periodStart: true,
            periodEnd: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.channel.findMany({
          where: { userId: uid },
          select: {
            platform: true,
            channelId: true,
            name: true,
            url: true,
            avatarUrl: true,
            subscribers: true,
            videosCount: true,
            viewsCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.project.findMany({
          where: { userId: uid },
          include: { assets: true, comments: { select: { content: true, createdAt: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.analysisReport.findMany({
          where: { userId: uid },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.analysisJob.findMany({
          where: { userId: uid },
          select: {
            id: true,
            projectId: true,
            title: true,
            targetPlatform: true,
            status: true,
            reportId: true,
            error: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.comment.findMany({
          where: { userId: uid },
          select: { projectId: true, content: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.subscription.findMany({
          where: { userId: uid },
          select: {
            plan: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelledAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const payload = {
      format: 'publish-export/v1',
      exportedAt: new Date().toISOString(),
      account,
      channels,
      projects,
      reviews: reports,
      reviewRuns: jobs,
      comments,
      billing: {
        subscriptions,
        note:
          'Payments are processed by Lemon Squeezy, our merchant of record. Card details are never stored by Publish. Invoices and receipts live in the Lemon Squeezy customer portal, reachable from Settings → Billing.',
      },
      counts: {
        channels: channels.length,
        projects: projects.length,
        reviews: reports.length,
        reviewRuns: jobs.length,
        comments: comments.length,
        subscriptions: subscriptions.length,
      },
    };

    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="publish-data-export-${stamp}.json"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[GET /api/account/export]', err);
    return NextResponse.json(
      { error: 'Failed to export your data. Please try again or contact support.' },
      { status: 500 },
    );
  }
}
