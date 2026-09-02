'use client';

import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  Youtube, Video, Instagram, Facebook, Linkedin, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import { PlatformReport } from '@/lib/types';
import { Badge } from '../ui/Badge';

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  YouTube: Youtube, TikTok: Video, Instagram: Instagram, Facebook: Facebook, LinkedIn: Linkedin,
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  'Compliant': 'success',
  'Review Suggested': 'warning',
  'At Risk': 'danger',
};

export const PlatformTabs: React.FC<{
  reports: PlatformReport[];
  defaultPlatform?: string;
}> = ({ reports, defaultPlatform }) => {
  const [active, setActive] = useState(defaultPlatform && reports.some((r) => r.platform === defaultPlatform) ? defaultPlatform : reports[0]?.platform ?? 'YouTube');

  // No platform reports (legacy or hand-seeded rows): render nothing rather
  // than dereferencing an empty array.
  if (!reports || reports.length === 0) return null;

  const report = reports.find((r) => r.platform === active) || reports[0];
  const Icon = PLATFORM_ICONS[report.platform] || Youtube;

  return (
    <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div>
          <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
            Platform breakdown
          </h2>
          <p className="text-[12px] text-ink-500 mt-1">
            Each platform enforces its own monetization rules. Switch tabs to see the tailored review.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 px-4 pt-3 pb-0 border-b border-ink-200 bg-surface-canvas">
        {reports.map((r) => {
          const PIcon = PLATFORM_ICONS[r.platform];
          const selected = active === r.platform;
          return (
            <button
              key={r.platform}
              onClick={() => setActive(r.platform)}
              className={clsx(
                'inline-flex items-center gap-2 px-3.5 h-9 rounded-t-lg -mb-px text-[13px] font-medium transition-colors border-b-2',
                selected
                  ? 'bg-ink-100 border-ink-900 text-ink-900'
                  : 'border-transparent text-ink-600 hover:text-ink-900 hover:bg-ink-100',
              )}
            >
              <PIcon className="w-3.5 h-3.5" />
              {r.platform}
              <span className={clsx('text-[11px] tabular-nums font-semibold', selected ? 'text-ink-900' : 'text-ink-500')}>
                {r.score}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
        {/* Overview column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-ink-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ink-900">{report.platform}</div>
              <div className="mt-1">
                <Badge variant={STATUS_TONE[report.policyStatus]} dot>
                  {report.policyStatus}
                </Badge>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
              Advertiser suitability
            </div>
            <div className="rounded-lg border border-grass-200 bg-grass-50 p-3.5 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
              <span className="text-[13px] text-grass-800 leading-relaxed">{report.adSuitability}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
              Score
            </div>
            <div className="flex items-baseline gap-2">
              <span className={clsx(
                'font-display text-[30px] leading-[1.15] font-semibold tabular-nums tracking-[-0.025em]',
                report.score >= 85 ? 'text-grass-700' : report.score >= 70 ? 'text-amber-700' : 'text-crimson-700',
              )}>
                {report.score}
              </span>
              <span className="text-[13px] text-ink-500">/ 100</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-500',
                  report.score >= 85 ? 'bg-grass-600' : report.score >= 70 ? 'bg-amber-600' : 'bg-crimson-600',
                )}
                style={{ width: `${report.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Recommendations column */}
        <div className="lg:col-span-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
            {report.platform}-specific recommendations
          </div>
          {report.specificRecommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
              {rec}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
