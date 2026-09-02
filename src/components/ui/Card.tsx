import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
  interactive?: boolean;
  as?: React.ElementType;
}

/**
 * Radius is deliberately stepped by element size — 12px on panels, 10px on
 * controls, 8px on pills. A single radius everywhere is what makes a light UI
 * look machine-assembled; the eye reads the hierarchy from the corners.
 * On a light canvas a border alone leaves cards floating flat, so panels also
 * carry a 1px hairline shadow to lift them off the background.
 */
export const Card: React.FC<CardProps> = ({
  children, className, hover = false, padded = true, interactive = false, as: Tag = 'div',
}) => {
  return (
    <Tag
      className={clsx(
        'bg-surface-panel border border-ink-200 rounded-xl shadow-xs',
        padded && 'p-5',
        (hover || interactive) && 'transition-shadow duration-150',
        hover && 'hover:shadow-card',
        interactive && 'cursor-pointer hover:shadow-card',
        className
      )}
    >
      {children}
    </Tag>
  );
};

interface StatTileProps {
  label: string;
  value: string | number;
  /** Free-form footnote. Callers pass their own direction indicator here, which is
   *  why the tile has no `trend` prop of its own — a delta only means something
   *  next to the comparison it was measured against. */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  emphasis?: 'default' | 'success' | 'warning' | 'danger';
}

export const StatTile: React.FC<StatTileProps> = ({
  label, value, hint, icon, className, emphasis = 'default',
}) => {
  // `success` is green. Brand is red in this system, so routing "good" through
  // brand would paint every healthy metric the colour of a failure.
  const emphasisMap: Record<string, string> = {
    default: 'text-ink-900',
    success: 'text-grass-700',
    warning: 'text-amber-700',
    danger:  'text-crimson-700',
  };
  return (
    <div className={clsx(
      'bg-surface-panel border border-ink-200 rounded-xl shadow-xs p-4',
      'transition-shadow duration-150 hover:shadow-card',
      className,
    )}>
      <div className="flex items-center gap-1.5 text-ink-500">
        {icon && <span className="text-ink-500">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className={clsx('font-display text-[30px] leading-none font-semibold tracking-[-0.025em] mt-3 tabular-nums', emphasisMap[emphasis])}>
        {value}
      </div>
      {hint && (
        <div className="text-[12px] text-ink-500 mt-2 flex items-center gap-1.5">
          {hint}
        </div>
      )}
    </div>
  );
};
