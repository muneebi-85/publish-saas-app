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
 * Circular donut gauge — the brand's signature score visual. An emerald ring
 * sweeps proportional to the score with the numeral centered. Amber/red for
 * lower bands. Ring color mirrors the "safe to publish" thresholds.
 */
const SIZES = {
  sm: { box: 44,  stroke: 4,  num: 'text-[13px]', denom: false, label: 'text-[9px]' },
  md: { box: 64,  stroke: 5,  num: 'text-[18px]', denom: false, label: 'text-[10px]' },
  lg: { box: 104, stroke: 7,  num: 'text-[30px]', denom: true,  label: 'text-[11px]' },
  xl: { box: 148, stroke: 9,  num: 'text-[44px]', denom: true,  label: 'text-[12px]' },
} as const;

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score, label, size = 'md', showLabel = true, subtitle,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { box, stroke, num, denom, label: labelSize } = SIZES[size];
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  const ringColor =
    clamped >= 85 ? '#7CFF9A' :
    clamped >= 70 ? '#F59E0B' :
    '#EF4444';

  const band =
    clamped >= 85 ? 'Excellent' :
    clamped >= 70 ? 'Good' :
    clamped >= 50 ? 'Fair' : 'Needs work';

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="relative" style={{ width: box, height: box }}>
        <svg width={box} height={box} className="-rotate-90">
          <circle
            cx={box / 2} cy={box / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
          />
          <circle
            cx={box / 2} cy={box / 2} r={r}
            fill="none" stroke={ringColor} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx('font-display font-bold text-white tabular-nums leading-none', num)}>
            {clamped}
          </span>
          {denom && <span className="text-[10px] text-ink-500 font-medium mt-0.5">/100</span>}
        </div>
      </div>
      {showLabel && label && (
        <div className="text-center">
          <span className={clsx('font-medium text-ink-700 block', labelSize)}>{label}</span>
          {subtitle
            ? <span className="text-[11px] text-ink-500 block mt-0.5">{subtitle}</span>
            : (size === 'lg' || size === 'xl') && (
              <span className="text-[12px] font-medium block mt-0.5" style={{ color: ringColor }}>{band}</span>
            )}
        </div>
      )}
    </div>
  );
};
