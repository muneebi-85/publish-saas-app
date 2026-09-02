import React from 'react';
import { clsx } from 'clsx';
import { scoreBand } from '@/lib/score-band';

export interface ScoreGaugeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  subtitle?: string;
}

/**
 * Circular donut gauge — the product's signature score visual. The ring sweeps
 * proportional to the score and takes its colour from the shared scoreBand
 * util (85+ strong, 70+ fair, below weak), so the gauge can never disagree
 * with the cards, lists, or the public share page. Colours come from tokens,
 * so the gauge follows the theme.
 */
const SIZES = {
  sm: { box: 44,  stroke: 4,  num: 'text-[13px]', denom: false, label: 'text-[11px]' },
  md: { box: 64,  stroke: 5,  num: 'text-[18px] tracking-[-0.015em]', denom: false, label: 'text-[11px]' },
  lg: { box: 104, stroke: 7,  num: 'text-[30px] tracking-[-0.025em]', denom: true,  label: 'text-[11px]' },
  xl: { box: 148, stroke: 9,  num: 'text-[40px] tracking-[-0.025em]', denom: true,  label: 'text-[12px]' },
} as const;

const TONE: Record<string, { ring: string; text: string; band: string }> = {
  strong: { ring: 'rgb(var(--grass-500))',   text: 'text-grass-700',   band: 'Ready'   },
  fair:   { ring: 'rgb(var(--amber-500))',   text: 'text-amber-700',   band: 'Improve' },
  weak:   { ring: 'rgb(var(--crimson-500))', text: 'text-crimson-700', band: 'Rework'  },
};

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score, label, size = 'md', showLabel = true, subtitle,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { box, stroke, num, denom, label: labelSize } = SIZES[size];
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const tone = TONE[scoreBand(clamped)];

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="relative" style={{ width: box, height: box }}>
        <svg width={box} height={box} className="-rotate-90">
          <circle
            cx={box / 2} cy={box / 2} r={r}
            fill="none" stroke="var(--ring)" strokeWidth={stroke}
          />
          <circle
            cx={box / 2} cy={box / 2} r={r}
            fill="none" style={{ stroke: tone.ring }} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx('font-display font-semibold text-ink-900 tabular-nums leading-none', num)}>
            {clamped}
          </span>
          {denom && <span className="text-[11px] text-ink-500 font-medium mt-0.5">/100</span>}
        </div>
      </div>
      {showLabel && label && (
        <div className="text-center">
          <span className={clsx('font-medium text-ink-700 block', labelSize)}>{label}</span>
          {subtitle
            ? <span className="text-[11px] text-ink-500 block mt-0.5">{subtitle}</span>
            : (size === 'lg' || size === 'xl') && (
              <span className={clsx('text-[12px] font-semibold block mt-0.5', tone.text)}>{tone.band}</span>
            )}
        </div>
      )}
    </div>
  );
};
