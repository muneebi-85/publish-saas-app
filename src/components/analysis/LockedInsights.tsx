import React from 'react';
import Link from 'next/link';
import { Lock, ArrowRight, Wand2, BarChart3, TrendingUp, FileBadge } from 'lucide-react';
import { ProjectData } from '@/lib/types';

/**
 * Conversion module — shown at the moment of maximum perceived value (right
 * after the creator reads their fixes). Every teaser is personalized with real
 * numbers from THIS report. Nothing here is taken away from free users: the
 * items are genuinely paid-plan capabilities being previewed, not a paywall
 * over existing content.
 */
export const LockedInsights: React.FC<{ project: ProjectData }> = ({ project }) => {
  const issueCount = project.scriptIssues.length;
  const totalFixes = project.insights?.totalFixes ?? issueCount;
  const potential = project.insights?.scorePotential ?? project.scores.overall;

  const rows = [
    {
      icon: Wand2,
      name: 'Full-script human rewrite',
      plan: 'Starter',
      value: issueCount > 0
        ? `${issueCount} flagged phrase${issueCount === 1 ? '' : 's'} in this script would be rewritten in your voice — line by line, originals kept beside each fix.`
        : 'Your full script rewritten in your voice — line by line, originals kept beside each fix.',
    },
    {
      icon: TrendingUp,
      name: 'Re-review trend line',
      plan: 'Starter',
      value: `Apply the ${totalFixes} fix${totalFixes === 1 ? '' : 'es'} above and watch this score climb toward ${potential} across re-reviews, on a real trend chart.`,
    },
    {
      icon: BarChart3,
      name: 'Channel benchmark',
      plan: 'Pro',
      value: `See how this ${project.scores.overall} compares to your channel median and your niche — not just an absolute number.`,
    },
    {
      icon: FileBadge,
      name: 'White-label client PDF',
      plan: 'Agency',
      value: 'This exact report, rebranded with your studio logo and colors — ready to hand to a client as your own audit.',
    },
  ];

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-brand-700">
            Paid-plan insights
          </div>
          <h2 className="font-display text-[22px] font-bold tracking-tight text-ink-900 mt-1.5">
            Unlock the full picture
          </h2>
        </div>
        <div className="text-[11.5px] text-ink-400">From $19/mo · cancel anytime</div>
      </div>

      {/* Locked rows */}
      <div className="divide-y divide-ink-100">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.name} className="flex items-start gap-4 px-6 py-4">
              <div className="w-8 h-8 rounded-md bg-white/[0.08] text-ink-500 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold text-ink-900">{row.name}</span>
                  <span className="text-[10px] font-semibold text-ink-500 bg-white/[0.08] px-1.5 py-0.5 rounded-md">
                    {row.plan}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink-600 mt-1 leading-relaxed max-w-xl">{row.value}</p>
              </div>
              <div className="hidden sm:flex flex-col gap-1.5 shrink-0 pt-1 select-none" aria-hidden="true">
                <div className="h-1.5 w-20 rounded-full bg-white/[0.08] blur-[1.5px]" />
                <div className="h-1.5 w-14 rounded-full bg-white/[0.08] blur-[1.5px]" />
              </div>
              <Lock className="w-3.5 h-3.5 text-ink-300 shrink-0 mt-1.5" />
            </div>
          );
        })}
      </div>

      {/* CTA footer */}
      <div className="px-6 py-4 border-t border-ink-200 bg-surface-canvas flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-500">
          Every plan includes all six review layers — paid tiers add depth, volume, and client tooling.
        </p>
        <Link
          href="/pricing?upgrade=1"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-600 transition-colors shrink-0"
        >
          Compare plans <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
};

export default LockedInsights;
