import React from 'react';
import { clsx } from 'clsx';

export interface ScoreGaugeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  subtitle?: string;
  showTrack?: boolean;
}

/**
 * Ring gauge — semantic color mapping (green ≥85, amber 70-84, red <70).
 * Uses ink-900 for the center number to keep the palette monochromatic;
 * the ring itself carries the semantic color.
 */
export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score, label, size = 'md', showLabel = true, subtitle, showTrack = true,
}) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 85 ? '#16A34A' :
    clamped >= 70 ? '#D97706' :
    '#DC2626';

  const sizes = {
    sm: { r: 15, sw: 3,   box: 'w-10 h-10',  num: 'text-[11px]', gap: 'gap-1' },
    md: { r: 26, sw: 3.5, box: 'w-16 h-16',  num: 'text-[15px] font-semibold', gap: 'gap-1.5' },
    lg: { r: 40, sw: 4.5, box: 'w-24 h-24',  num: 'text-2xl font-semibold', gap: 'gap-2' },
    xl: { r: 56, sw: 5.5, box: 'w-32 h-32',  num: 'text-3xl font-semibold', gap: 'gap-2.5' },
  } as const;

  const { r, sw, box, num, gap } = sizes[size];
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className={clsx('flex flex-col items-center', gap)}>
      <div className="relative inline-flex items-center justify-center">
        <svg className={clsx(box, '-rotate-90')}>
          {showTrack && (
            <circle cx="50%" cy="50%" r={r} stroke="#E7E5E4" strokeWidth={sw} fill="none" />
          )}
          <circle
            cx="50%" cy="50%" r={r}
            stroke={color} strokeWidth={sw}
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round" fill="none"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className={clsx('absolute text-ink-900 tabular-nums tracking-tight', num)}>{clamped}</span>
      </div>
      {showLabel && label && (
        <div className="text-center">
          <span className="text-xs font-medium text-ink-700 block">{label}</span>
          {subtitle && <span className="text-[11px] text-ink-500 block mt-0.5">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
