import React from 'react';
import Link from 'next/link';
import { Lock, ArrowRight, Wand2, TrendingUp, Sparkles, Layers } from 'lucide-react';
import { ProjectData } from '@/lib/types';
import { planDisplayName } from '@/lib/plans';

/**
 * Conversion module — shown at the moment of maximum perceived value (right
 * after the creator reads their fixes), free plan only. Every row is a
 * capability that is genuinely gated behind a paid plan — the humanizer and
 * coach are requirePaidPlan() server routes, re-running a review costs checks
 * the free tier's 1-per-month allowance cannot cover — and every teaser is
 * personalized with real numbers from THIS report. Nothing here claims a
 * restriction that does not exist.
 */
export const LockedInsights: React.FC<{ project: ProjectData }> = ({ project }) => {
  const issueCount = project.scriptIssues.length;
  const totalFixes = project.insights?.totalFixes ?? issueCount;
  const potential = project.insights?.scorePotential ?? project.scores.overall;

  const rows = [
    {
      icon: Wand2,
      name: 'Full-script human rewrite',
      plan: planDisplayName('pro'),
      value: issueCount > 0
        ? `${issueCount} flagged phrase${issueCount === 1 ? '' : 's'} in this script would be rewritten in your voice — line by line, originals kept beside each fix.`
        : 'Your full script rewritten in your voice — line by line, originals kept beside each fix.',
    },
    {
      icon: TrendingUp,
      name: 'Re-review after fixes',
      plan: planDisplayName('pro'),
      value: `Apply the ${totalFixes} fix${totalFixes === 1 ? '' : 'es'} above and run the review again — paid plans cover the re-reviews that carry this score toward ${potential} on a real trend chart.`,
    },
    {
      icon: Sparkles,
      name: 'AI Coach, grounded in this report',
      plan: planDisplayName('pro'),
      value: `Ask why any layer scored what it did and get advice built from these exact numbers and top fixes — not generic tips.`,
    },
    {
      icon: Layers,
      name: 'Agency volume',
      plan: planDisplayName('agency'),
      value: '500 checks a month with custom terms for teams shipping at scale — this report is one of many.',
    },
  ];

  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-brand-700">
            Paid-plan insights
          </div>
          <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink-900 mt-1.5">
            Unlock the full picture
          </h2>
        </div>
        <div className="text-[12px] text-ink-500">From $19/mo · cancel anytime</div>
      </div>

      {/* Locked rows */}
      <div className="divide-y divide-ink-200">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.name} className="flex items-start gap-4 px-6 py-4">
              <div className="w-8 h-8 rounded-md bg-ink-100 text-ink-500 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-ink-900">{row.name}</span>
                  <span className="text-[11px] font-semibold text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded-md">
                    {row.plan}
                  </span>
                </div>
                <p className="text-[12px] text-ink-600 mt-1 leading-relaxed max-w-xl">{row.value}</p>
              </div>
              <div className="hidden sm:flex flex-col gap-1.5 shrink-0 pt-1 select-none" aria-hidden="true">
                <div className="h-1.5 w-20 rounded-full bg-ink-100 blur-[1.5px]" />
                <div className="h-1.5 w-14 rounded-full bg-ink-100 blur-[1.5px]" />
              </div>
              <Lock className="w-3.5 h-3.5 text-ink-300 shrink-0 mt-1.5" />
            </div>
          );
        })}
      </div>

      {/* CTA footer */}
      <div className="px-6 py-4 border-t border-ink-200 bg-surface-canvas flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[12px] text-ink-500">
          Every plan includes all 9 checks — paid tiers add volume, the humanizer and coach, and priority support.
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
