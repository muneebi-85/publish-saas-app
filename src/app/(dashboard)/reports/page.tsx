import Link from 'next/link';
import { requirePageAuth } from '@/lib/api-guards';
import { FileText, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { prisma } from '@/lib/db';
import { Sparkline } from '@/components/analytics/Sparkline';
import { ReportActions } from './ReportActions';

export const dynamic = 'force-dynamic';

interface ProjectGroup {
  projectId: string;
  title: string;
  targetPlatform: string;
  latestReportId: string;
  latestScore: number;
  monetizationScore: number;
  scoresChronological: number[];
  delta: number | null;
  createdAt: Date;
  count: number;
}

/** Maps a score band to the reader-facing status shown in the list. */
function statusFor(score: number): { label: string; className: string } {
  if (score >= 85) return { label: 'Ready', className: 'text-brand-600' };
  if (score >= 70) return { label: 'Improve', className: 'text-amber-600' };
  return { label: 'Rework', className: 'text-crimson-600' };
}

export default async function ReportsPage() {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({ where: { id: authCtx.dbUserId } });
  if (!user) {
    return <EmptyState />;
  }

  const rows = await prisma.analysisReport.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      projectId: true,
      title: true,
      targetPlatform: true,
      overallScore: true,
      monetizationScore: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) return <EmptyState />;

  // Group by projectId — one row per project, with chronological score series.
  const groups = new Map<string, ProjectGroup>();
  for (const r of rows) {
    const g = groups.get(r.projectId);
    if (!g) {
      groups.set(r.projectId, {
        projectId: r.projectId,
        title: r.title,
        targetPlatform: r.targetPlatform,
        latestReportId: r.id,
        latestScore: r.overallScore,
        monetizationScore: r.monetizationScore,
        scoresChronological: [r.overallScore],
        delta: null,
        createdAt: r.createdAt,
        count: 1,
      });
    } else {
      g.scoresChronological.push(r.overallScore);
      g.count += 1;
      // The list is sorted asc, so the latest row for a project overwrites.
      g.latestReportId = r.id;
      g.latestScore = r.overallScore;
      g.monetizationScore = r.monetizationScore;
      g.createdAt = r.createdAt;
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
            <Button variant="dark" leftIcon={<ArrowUpRight className="w-4 h-4" />}>New review</Button>
          </Link>
        }
      />

      <Card padded={false}>
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-600 tabular-nums">
            {list.length} project{list.length === 1 ? '' : 's'} · {rows.length} review{rows.length === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] text-ink-400">Scored on each video&apos;s own signals · estimates</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left border-b border-ink-100">
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600">Report</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600 text-center">Score</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600">Status</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600">Trend</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600">Updated</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-ink-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((g) => {
                const status = statusFor(g.latestScore);
                return (
                  <tr key={g.projectId} className="hover:bg-surface-canvas transition-colors">
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
                          <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums ${
                            g.delta > 0 ? 'text-brand-600' : 'text-crimson-600'
                          }`}>
                            {g.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {g.delta > 0 ? '+' : ''}{g.delta} vs prior
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Sparkline data={g.scoresChronological} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-ink-600 tabular-nums">
                        {g.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <ReportActions reportId={g.latestReportId} />
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
        <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center mx-auto mb-5">
          <FileText className="w-6 h-6 text-ink-500" />
        </div>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">No reports yet</h3>
        <p className="text-[13px] text-ink-600 mt-2 max-w-md mx-auto">
          Run your first analysis to start building a track record. Every subsequent review on the same
          project shows a real trend line — evidence your changes are working.
        </p>
        <div className="mt-6">
          <Link href="/upload">
            <Button variant="dark" rightIcon={<ArrowUpRight className="w-4 h-4" />}>Analyze a video</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
