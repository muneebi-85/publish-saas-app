import React from 'react';
import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, StatTile } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import {
  TrendingUp, AlertTriangle, ShieldCheck, Youtube, Video, Instagram, Facebook, Linkedin,
  ArrowRight, ArrowUpRight, Radio, Layers, Users, Sparkles, Plus, Eye, BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import {
  fetchChannelVideos,
  fetchChannelCtr,
  titlesMatch,
  type ChannelVideo,
} from '@/lib/channels';

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

  // ── Live YouTube data ─────────────────────────────────────────────────────
  // When a YouTube channel is connected, pull the creator's own upload stats
  // and (if the Google connection carries the analytics scope) impressions &
  // CTR straight from the platform. Everything here degrades to a readable
  // state — a missing token, a refused scope, or a slow API never crashes the
  // page, and nothing is shown that the platform did not return.
  const youtubeChannel = channels.find((c) => c.platform === 'YOUTUBE');
  let liveVideos: ChannelVideo[] | null = null;
  let liveCtr: { impressions: number | null; ctr: number | null } | null = null;
  let liveError: string | null = null;

  if (youtubeChannel) {
    try {
      const response = await clerkClient.users.getUserOauthAccessToken(
        authCtx.clerkId,
        'oauth_google' as never,
      );
      const tokens = Array.isArray(response) ? response : (response as { data?: unknown[] })?.data;
      const token = Array.isArray(tokens) ? (tokens[0] as { token?: string } | undefined)?.token : undefined;

      if (token) {
        const [videosRes, ctrRes] = await Promise.all([
          fetchChannelVideos(token),
          fetchChannelCtr(token, youtubeChannel.channelId),
        ]);
        if (videosRes.ok) liveVideos = videosRes.videos;
        else liveError = videosRes.error;
        if (ctrRes.ok) liveCtr = { impressions: ctrRes.impressions, ctr: ctrRes.ctr };
        else if (liveError) liveError = `${liveError} · ${ctrRes.error}`;
      } else {
        liveError = 'Reconnect the Google account to pull live video stats.';
      }
    } catch {
      liveError = 'Could not read the Google connection. Reconnect it and try again.';
    }
  }

  /**
   * Publish Score per upload, where a report title matches a real upload. The
   * match is by normalized title — deliberately loose enough to survive a
   * last-minute rename, strict enough not to pair unrelated videos.
   */
  const scoreByVideo = new Map<string, number>();
  if (liveVideos) {
    for (const report of reports) {
      const hit = liveVideos.find((v) => titlesMatch(report.title, v.title));
      if (hit && !scoreByVideo.has(hit.videoId)) scoreByVideo.set(hit.videoId, report.overallScore);
    }
  }

  const fmtCompact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

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
          <div className="w-12 h-12 bg-white/[0.08] rounded-full flex items-center justify-center mb-4">
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
          {/* Live platform data — only when a real YouTube connection exists. */}
          {youtubeChannel && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 inline-flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-crimson-600" /> Live YouTube data
                  </h3>
                  <p className="text-[13px] text-ink-600 mt-0.5">
                    Real upload stats pulled from your channel — paired with the Publish Score of the
                    reviews that predicted them.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {liveCtr && liveCtr.impressions != null && (
                    <div className="text-right">
                      <div className="text-[11px] font-medium text-ink-500 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Impressions (28d)
                      </div>
                      <div className="text-[15px] font-semibold tabular-nums text-ink-900">
                        {fmtCompact(liveCtr.impressions)}
                      </div>
                    </div>
                  )}
                  {liveCtr && liveCtr.ctr != null && (
                    <div className="text-right">
                      <div className="text-[11px] font-medium text-ink-500 flex items-center gap-1">
                        <BarChart3 className="w-3 h-3" /> Click-through
                      </div>
                      <div className="text-[15px] font-semibold tabular-nums text-ink-900">
                        {liveCtr.ctr.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {liveError && !liveVideos ? (
                <p className="text-[12.5px] text-ink-500 bg-surface-canvas border border-ink-200 rounded-xl px-4 py-3">
                  {liveError}
                </p>
              ) : liveVideos && liveVideos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="text-left text-[11px] font-medium text-ink-500 border-b border-ink-100">
                        <th className="py-2 pr-4 font-medium">Upload</th>
                        <th className="py-2 pr-4 font-medium text-right">Views</th>
                        <th className="py-2 pr-4 font-medium text-right">Likes</th>
                        <th className="py-2 pr-4 font-medium text-right">Publish Score</th>
                        <th className="py-2 font-medium text-right">Score → views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {liveVideos.slice(0, 10).map((video) => {
                        const score = scoreByVideo.get(video.videoId);
                        return (
                          <tr key={video.videoId} className="text-[13px]">
                            <td className="py-2.5 pr-4">
                              <div className="text-ink-900 font-medium truncate max-w-[260px]">
                                {video.title}
                              </div>
                              <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
                                {new Date(video.publishedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-ink-700">
                              {fmtCompact(video.views)}
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-ink-500">
                              {fmtCompact(video.likes)}
                            </td>
                            <td className="py-2.5 pr-4 text-right">
                              {score !== undefined ? (
                                <Badge variant={score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger'}>
                                  {score}/100
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-ink-400">Not reviewed</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right">
                              {score !== undefined ? (
                                <span
                                  className={`text-[11.5px] font-semibold ${
                                    (score >= 80 && video.views > 0) || score < 50
                                      ? 'text-grass-700'
                                      : 'text-ink-400'
                                  }`}
                                >
                                  {score >= 80
                                    ? video.views > 0
                                      ? 'Predicted well'
                                      : 'No views yet'
                                    : 'Fix before upload'}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-500 bg-surface-canvas border border-ink-200 rounded-xl px-4 py-3">
                  No public uploads found on this channel.
                </p>
              )}

              <p className="text-[11px] text-ink-400 mt-4 leading-relaxed">
                Scores are the reviews you ran for the matching upload; views, likes and
                impressions come straight from the YouTube Data API using your read-only Google
                connection. Titles match on an exact-enough basis, so a renamed upload may not pair.
                {liveCtr && liveCtr.impressions == null && !liveError &&
                  ' Impressions and CTR need the YouTube Analytics scope on the Google connection.'}
              </p>
            </Card>
          )}

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
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200 hover:border-white/[0.14] transition-colors"
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
                  <div className="w-10 h-10 bg-white/[0.08] rounded-full flex items-center justify-center mx-auto mb-3">
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
