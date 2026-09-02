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
  // Pass the same delta to the sparkline so the line's color and the
  // "+N vs prior" chip can never disagree about direction.

  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta > 0 ? 'text-grass-700' : delta < 0 ? 'text-crimson-700' : 'text-ink-500';

  return (
    <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-5 flex items-center justify-between gap-5 hover:border-ink-300 transition-colors duration-150">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-display text-[30px] leading-none font-semibold tracking-[-0.025em] tabular-nums text-ink-900">{last}</span>
          <span className="text-[13px] text-ink-500">{suffix}</span>
        </div>
        <div className={`mt-1.5 inline-flex items-center gap-1 ${trendColor} text-[11px] font-medium`}>
          <TrendIcon className="w-3 h-3" />
          {delta > 0 ? '+' : ''}{delta} vs prior
        </div>
      </div>
      <Sparkline data={series} width={110} height={40} trend={delta} />
    </div>
  );
};

export default TrendCard;
