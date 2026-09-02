import Link from 'next/link';
import { requirePageAuth } from '@/lib/api-guards';
import { FileText, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { prisma } from '@/lib/db';
import { Sparkline } from '@/components/analytics/Sparkline';
import { scoreBand, SCORE_BAND_UI } from '@/lib/score-band';
import { ReportActions } from './ReportActions';

export const dynamic = 'force-dynamic';

interface ProjectGroup {
  /** Normalized title+platform — what "re-running the same project" actually is. */
  groupKey: string;
  title: string;
  targetPlatform: string;
  latestReportId: string;
  latestScore: number;
  monetizationScore: number;
  scoresChronological: number[];
  delta: number | null;
  createdAt: Date;
  count: number;
  /** Publication state of the group's LATEST report's public score card. */
  shared: boolean;
}

/** Maps a score band to the reader-facing status shown in the list. */
const STATUS_WORD: Record<string, string> = { strong: 'Ready', fair: 'Needs work', weak: 'Rework' };
function statusFor(score: number): { label: string; className: string } {
  const band = SCORE_BAND_UI[scoreBand(score)];
  return { label: STATUS_WORD[scoreBand(score)] ?? band.label, className: band.text };
}

/**
 * Ceiling on how many reviews this page pulls into memory.
 *
 * The list groups every review by project to draw a real trend line, which needs
 * the rows themselves — so the query cannot be narrowed with an aggregate. The cap
 * bounds that at a few hundred rows instead of a user's entire history.
 *
 * It fetches the NEWEST reviews and reverses them for the chronological grouping:
 * taking the first N of an ascending sort would pin the page to a user's oldest
 * work and quietly hide everything recent. When the cap is reached the page says
 * so — see the notice below — rather than presenting a truncated list as complete.
 */
const REVIEW_FETCH_CAP = 400;

export default async function ReportsPage() {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({
    where: { id: authCtx.dbUserId },
    select: { id: true },
  });
  if (!user) {
    return <EmptyState />;
  }

  // One extra row is the truncation probe: getting CAP + 1 back means there is
  // older history we are not showing.
  const newestFirst = await prisma.analysisReport.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: REVIEW_FETCH_CAP + 1,
    select: {
      id: true,
      title: true,
      targetPlatform: true,
      overallScore: true,
      monetizationScore: true,
      createdAt: true,
      sharedAt: true,
    },
  });

  const truncated = newestFirst.length > REVIEW_FETCH_CAP;
  // Back to ascending: the grouping below relies on chronological order.
  const rows = newestFirst.slice(0, REVIEW_FETCH_CAP).reverse();

  if (rows.length === 0) return <EmptyState />;

  // The header claims a review count, so when the fetch cap truncates the list
  // it needs the true total rather than silently under-reporting.
  const totalReports = await prisma.analysisReport.count({
    where: { userId: user.id },
  });

  // Group re-reviews of the same project. AnalysisJob.projectId is a per-RUN
  // correlation id (`pub_<base36>`, minted fresh on every analyze request), so
  // grouping by it left every row alone: count was always 1, the delta never
  // rendered, and the sparkline was a single point — while the re-run handoff
  // (PriorityFixes) carries the SAME title and platform into the next review.
  // That pair is the grouping key the page's "trend line" promise actually has
  // to stand on. Normalized so case and stray whitespace do not split a series.
  const groups = new Map<string, ProjectGroup>();
  for (const r of rows) {
    const groupKey = `${r.title.trim().toLowerCase()}|${r.targetPlatform}`;
    const g = groups.get(groupKey);
    if (!g) {
      groups.set(groupKey, {
        groupKey,
        title: r.title,
        targetPlatform: r.targetPlatform,
        latestReportId: r.id,
        latestScore: r.overallScore,
        monetizationScore: r.monetizationScore,
        scoresChronological: [r.overallScore],
        delta: null,
        createdAt: r.createdAt,
        count: 1,
        shared: r.sharedAt !== null,
      });
    } else {
      g.scoresChronological.push(r.overallScore);
      g.count += 1;
      // The list is sorted asc, so the latest row for a project overwrites.
      g.latestReportId = r.id;
      g.latestScore = r.overallScore;
      g.monetizationScore = r.monetizationScore;
      g.createdAt = r.createdAt;
      g.shared = r.sharedAt !== null;
    }
  }

  const list = Array.from(groups.values()).map((g) => {
    if (g.scoresChronological.length >= 2) {
      g.delta = g.scoresChronological[g.scoresChronological.length - 1]
        - g.scoresChronological[g.scoresChronological.length - 2];
    }
    return g;
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="animate-enter">
      <PageHeader
        title="Reports"
        subtitle="Download, share, and revisit every analysis report."
        showUtility
        actions={
          <Link href="/upload">
            <Button leftIcon={<ArrowUpRight className="w-4 h-4" />}>New review</Button>
          </Link>
        }
      />

      <Card padded={false}>
        <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-600 tabular-nums">
            {list.length} project{list.length === 1 ? '' : 's'} ·{' '}
            {truncated
              ? `${rows.length} of ${totalReports} reviews`
              : `${rows.length} review${rows.length === 1 ? '' : 's'}`}
          </span>
          <span className="text-[11px] text-ink-500">Scored on each video&apos;s own signals · estimates</span>
        </div>

        {/* Shown only when the cap actually bit. A truncated list that presents itself
            as complete would make the per-project counts and trend lines misleading. */}
        {truncated && (
          <p className="px-5 py-2.5 border-b border-ink-200 bg-surface-canvas text-[12px] text-ink-600">
            Showing your {REVIEW_FETCH_CAP} most recent reviews. Older ones are still
            stored and open normally from their own report link — they are left out of
            the project totals and trend lines above.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left border-b border-ink-200">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Report</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 text-center">Score</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Trend</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Updated</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {list.map((g) => {
                const status = statusFor(g.latestScore);
                return (
                  <tr key={g.groupKey} className="hover:bg-surface-canvas transition-colors">
                    <td className="px-5 py-4">
                      <div className="min-w-0">
                        <Link
                          href={`/analysis/${g.latestReportId}`}
                          className="text-[14px] font-semibold text-ink-900 hover:text-brand-700 truncate block max-w-xs transition-colors"
                        >
                          {g.title}
                        </Link>
                        <div className="text-[12px] text-ink-500 mt-0.5">
                          {g.targetPlatform} · {g.count} review{g.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-center">
                        <ScoreGauge score={g.latestScore} size="sm" showLabel={false} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[13px] font-semibold ${status.className}`}>{status.label}</span>
                        {g.delta !== null && g.delta !== 0 && (
                          // Green up / crimson down — a positive delta used to
                          // render in the brand red, making +12 and −12 look
                          // identical at a glance.
                          <span className={`inline-flex items-center gap-1 text-[12px] font-medium tabular-nums ${
                            g.delta > 0 ? 'text-grass-700' : 'text-crimson-700'
                          }`}>
                            {g.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {g.delta > 0 ? '+' : ''}{g.delta} vs prior
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Sparkline data={g.scoresChronological} trend={g.delta ?? undefined} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-ink-600 tabular-nums">
                        {g.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <ReportActions reportId={g.latestReportId} shared={g.shared} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="animate-enter">
      <PageHeader
        title="Reports"
        subtitle="Download, share, and revisit every analysis report."
        showUtility
      />
      <Card className="text-center py-16">
        <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-5 h-5" />
        </div>
        <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">No reports yet</h3>
        <p className="text-[13px] leading-relaxed text-ink-600 mt-2 max-w-sm mx-auto">
          Run your first analysis to start building a track record. Every subsequent review on the same
          project shows a real trend line — evidence your changes are working.
        </p>
        <div className="mt-6">
          <Link href="/upload">
            <Button rightIcon={<ArrowUpRight className="w-4 h-4" />}>Run your first review</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
