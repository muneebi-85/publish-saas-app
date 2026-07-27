import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { FileText, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { prisma } from '@/lib/db';
import { Sparkline } from '@/components/analytics/Sparkline';

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

export default async function ReportsPage() {
  const { userId: clerkId } = auth();
  if (!clerkId) redirect('/sign-in');

  const user = await prisma.user.findUnique({ where: { clerkId } });
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
    <div className="space-y-8 animate-enter">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Deliverables</div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Reports</h1>
          <p className="text-sm text-ink-500 mt-2 max-w-xl">
            Every review you have run, grouped by project. Scores below are computed on the video&apos;s own signals
            — a rising trend is real evidence the changes you shipped are working.
          </p>
        </div>
        <Link href="/upload">
          <Button>New review</Button>
        </Link>
      </header>

      <Card padded={false}>
        <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
          <span className="text-[12px] text-ink-500 tabular-nums">
            {list.length} project{list.length === 1 ? '' : 's'} · {rows.length} review{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-surface-canvas text-left">
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600">Project</th>
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600 text-center">Latest score</th>
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600 text-center">Δ vs prior</th>
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600">Trend</th>
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600">Updated</th>
                <th className="px-5 py-3 text-[11.5px] font-semibold text-ink-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((g) => (
                <tr key={g.projectId} className="hover:bg-ink-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="min-w-0">
                      <Link href={`/analysis/${g.latestReportId}`} className="text-[13.5px] font-medium text-ink-900 hover:underline underline-offset-4 truncate block max-w-xs">
                        {g.title}
                      </Link>
                      <div className="text-[11.5px] text-ink-500 mt-0.5">
                        {g.targetPlatform} · {g.count} review{g.count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[15px] font-semibold tabular-nums ${
                      g.latestScore >= 85 ? 'text-emerald-700' : g.latestScore >= 70 ? 'text-amber-700' : 'text-crimson-700'
                    }`}>
                      {g.latestScore}
                    </span>
                    <span className="text-[11.5px] text-ink-400">/100</span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {g.delta === null ? (
                      <span className="text-[11.5px] text-ink-400">—</span>
                    ) : (
                      <Badge variant={g.delta > 0 ? 'success' : g.delta < 0 ? 'danger' : 'default'}>
                        {g.delta > 0 ? '+' : ''}{g.delta}
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Sparkline data={g.scoresChronological} />
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[12.5px] text-ink-600 tabular-nums">
                      {g.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/analysis/${g.latestReportId}`}>
                        <Button variant="ghost" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" />}>Open</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8 animate-enter">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Deliverables</div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Reports</h1>
      </header>
      <Card className="text-center py-16">
        <h3 className="font-display text-lg font-semibold text-ink-950">No reviews yet</h3>
        <p className="text-[13px] text-ink-500 mt-2 max-w-md mx-auto">
          Run your first review to start building a track record. Every subsequent review on the same project
          shows a real trend line — evidence your changes are working.
        </p>
        <div className="mt-5">
          <Link href="/upload">
            <Button rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>Analyze your first video</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
