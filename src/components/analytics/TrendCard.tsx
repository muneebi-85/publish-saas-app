'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';

interface TrendCardProps {
  label: string;
  series: number[];
  suffix?: string;
}

/**
 * Compact trend tile — average, delta vs prior half of the series, sparkline.
 * Used at the top of /dashboard when the user has 2+ reports.
 */
export const TrendCard: React.FC<TrendCardProps> = ({ label, series, suffix = '/100' }) => {
  const last = series[series.length - 1] ?? 0;
  const mid = Math.floor(series.length / 2);
  const priorAvg = mid > 0 ? series.slice(0, mid).reduce((a, b) => a + b, 0) / mid : last;
  const recentAvg = series.slice(mid).reduce((a, b) => a + b, 0) / Math.max(1, series.length - mid);
  const delta = Math.round(recentAvg - priorAvg);

  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-crimson-700' : 'text-ink-500';
  const trendBg = delta > 0 ? 'bg-emerald-50' : delta < 0 ? 'bg-crimson-50' : 'bg-ink-100';

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 flex items-center justify-between gap-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[26px] font-semibold tabular-nums text-ink-950">{last}</span>
          <span className="text-[13px] text-ink-500">{suffix}</span>
        </div>
        <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full ${trendBg} ${trendColor} px-2 py-0.5 text-[11px] font-medium`}>
          <TrendIcon className="w-3 h-3" />
          {delta > 0 ? '+' : ''}{delta} vs prior
        </div>
      </div>
      <Sparkline data={series} width={110} height={40} />
    </div>
  );
};

export default TrendCard;
