import React from 'react';
import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, StatTile } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import {
  TrendingUp, AlertTriangle, ShieldCheck, Youtube, Video, Instagram, Facebook, Linkedin,
  ArrowRight, ArrowUpRight, Radio, Layers, Users, Sparkles, Plus,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** The window every "recent" figure on this page is actually computed over. */
const WINDOW_DAYS = 90;

const PLATFORM_ICONS: Record<string, typeof Youtube> = {
  youtube: Youtube,
  tiktok: Video,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
};

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export default async function ChannelAnalyticsPage() {
  const authCtx = await requirePageAuth();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [channels, reports] = await Promise.all([
    prisma.channel.findMany({
      where: { userId: authCtx.dbUserId },
      orderBy: { createdAt: 'desc' },
    }),
    // Bounded by the same window the labels claim, so the numbers and the copy
    // describe the same set of reports.
    prisma.analysisReport.findMany({
      where: { userId: authCtx.dbUserId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        overallScore: true,
        targetPlatform: true,
        createdAt: true,
      },
      take: 200,
    }),
  ]);

  const totalReports = reports.length;
  const averageScore =
    totalReports > 0
      ? Math.round(reports.reduce((acc, r) => acc + r.overallScore, 0) / totalReports)
      : null;

  const totalSubscribers = channels.reduce((acc, c) => acc + (c.subscribers || 0), 0);

  /**
   * Per-platform health is only ever the average of reviews actually run for
   * that platform. A channel with no reviews reports "Not measured" — inventing
   * a baseline would make an untested channel look verified.
   */
  const byPlatform = new Map<string, { total: number; count: number }>();
  for (const report of reports) {
    const key = report.targetPlatform.toLowerCase();
    const bucket = byPlatform.get(key) ?? { total: 0, count: 0 };
    bucket.total += report.overallScore;
    bucket.count += 1;
    byPlatform.set(key, bucket);
  }

  const measuredChannels = channels.filter((c) => byPlatform.has(c.platform.toLowerCase())).length;

  return (
    <div className="animate-enter">
      <PageHeader
        title="Channel Analytics"
        subtitle="Content health across your connected platforms, measured from the reviews you have run."
        showUtility
        actions={
          <Link href="/connected-channels">
            <Button variant="dark" leftIcon={<Plus className="w-4 h-4" />}>
              Connect channel
            </Button>
          </Link>
        }
      />

      {channels.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 bg-ink-100 rounded-full flex items-center justify-center mb-4">
            <Radio className="w-6 h-6 text-ink-400" />
          </div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 mb-1">
            No channels connected
          </h3>
          <p className="text-sm text-ink-600 max-w-sm mb-6">
            Connect a channel to group your reviews by platform and watch content health move over
            time. Reviews work without a connected channel — this page just organises them.
          </p>
          <Link href="/connected-channels">
            <Button variant="dark" leftIcon={<Plus className="w-4 h-4" />}>Connect channel</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              icon={<Layers className="w-4 h-4" />}
              label="Connected channels"
              value={channels.length.toString()}
              hint={
                <span>
                  {measuredChannels} with review data
                </span>
              }
            />
            <StatTile
              icon={<Sparkles className="w-4 h-4" />}
              label="Reviews run"
              value={totalReports.toString()}
              hint={<span>Last {WINDOW_DAYS} days</span>}
            />
            <StatTile
              icon={<TrendingUp className="w-4 h-4" />}
              label="Average Publish Score"
              value={averageScore !== null ? `${averageScore}` : '—'}
              emphasis={
                averageScore === null
                  ? 'default'
                  : averageScore >= 80
                    ? 'success'
                    : averageScore >= 50
                      ? 'warning'
                      : 'default'
              }
              hint={
                <span>
                  {averageScore !== null
                    ? `Across ${totalReports} review${totalReports === 1 ? '' : 's'}`
                    : 'Run a review to measure'}
                </span>
              }
            />
            <StatTile
              icon={<Users className="w-4 h-4" />}
              label="Total audience"
              value={totalSubscribers > 0 ? totalSubscribers.toLocaleString() : '—'}
              hint={
                <span>
                  {totalSubscribers > 0
                    ? 'Across all connected channels'
                    : 'Not reported by the connected channels'}
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Platform scores */}
            <Card className="lg:col-span-3">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">
                    Platform health scores
                  </h3>
                  <p className="text-[13px] text-ink-600 mt-0.5">
                    Average Publish Score of the reviews you ran for each platform in the last{' '}
                    {WINDOW_DAYS} days.
                  </p>
                </div>
                <Link
                  href="/reports"
                  className="text-[12.5px] text-ink-600 hover:text-ink-900 inline-flex items-center gap-1 transition-colors"
                >
                  History <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-1">
                {channels.map((channel) => {
                  const Icon = PLATFORM_ICONS[channel.platform.toLowerCase()] ?? Radio;
                  const bucket = byPlatform.get(channel.platform.toLowerCase());
                  const score = bucket ? Math.round(bucket.total / bucket.count) : null;

                  return (
                    <div
                      key={channel.id}
                      className="flex items-center gap-4 py-3 border-b border-ink-100 last:border-b-0"
                    >
                      {score !== null ? (
                        <ScoreGauge score={score} size="sm" showLabel={false} />
                      ) : (
                        <div className="w-10 h-10 rounded-full border border-dashed border-ink-200 flex items-center justify-center text-[10px] text-ink-400 shrink-0">
                          —
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-ink-500" strokeWidth={1.75} />
                          <span className="text-[13.5px] font-medium text-ink-900 capitalize">
                            {channel.name || channel.platform}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-ink-500 mt-0.5 tabular-nums">
                          {channel.subscribers > 0
                            ? `${channel.subscribers.toLocaleString()} subs · `
                            : ''}
                          {bucket
                            ? `${bucket.count} review${bucket.count === 1 ? '' : 's'}`
                            : 'No reviews yet'}
                        </div>
                      </div>
                      {score !== null ? (
                        <Badge variant={scoreTone(score)} dot>
                          {score}/100
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not measured</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-ink-400 mt-4">
                These are averages of your own review scores, not platform-reported metrics. A high
                score means the reviews found few blockers — it is not a prediction of views or
                revenue.
              </p>
            </Card>

            {/* Recent analysis */}
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">
                  Recent reviews
                </h3>
              </div>
              {reports.length > 0 ? (
                <div className="space-y-2.5">
                  {reports.slice(0, 3).map((report) => (
                    // The report's own id — projectId is a correlation label and
                    // does not resolve as a route.
                    <Link
                      href={`/analysis/${report.id}`}
                      key={report.id}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200 hover:border-ink-300 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          report.overallScore >= 80
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {report.overallScore >= 80 ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-ink-900 truncate">
                          {report.title || 'Untitled'}
                        </div>
                        <div className="text-[12px] text-ink-600 mt-0.5 leading-relaxed">
                          Publish Score {report.overallScore}/100 · {report.targetPlatform}
                        </div>
                        <div className="text-[11px] text-ink-400 mt-1.5">
                          {new Date(report.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center">
                  <div className="w-10 h-10 bg-ink-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-5 h-5 text-ink-400" />
                  </div>
                  <div className="text-[13px] text-ink-700 font-medium">
                    No reviews in the last {WINDOW_DAYS} days
                  </div>
                  <p className="text-[12px] text-ink-500 mt-1">
                    Run one before your next upload and it will appear here.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Next step — describes what the product does today, not a roadmap. */}
      <Card className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">
            Review every video before it goes live
          </h3>
          <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
            The scores on this page only move when you run a review. Put one between your export and
            your upload: the copyright, policy and monetization layers catch the issues that cost
            revenue after publishing, when they are expensive to undo.
          </p>
        </div>
        <Link href="/upload">
          <Button variant="secondary" size="md" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Run a review
          </Button>
        </Link>
      </Card>
    </div>
  );
}
