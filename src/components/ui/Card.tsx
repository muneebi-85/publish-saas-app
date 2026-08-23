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

export const Card: React.FC<CardProps> = ({
  children, className, hover = false, padded = true, interactive = false, as: Tag = 'div',
}) => {
  return (
    <Tag
      className={clsx(
        'bg-surface-panel border border-white/[0.06] rounded-2xl',
        padded && 'p-5 sm:p-6',
        (hover || interactive) && 'transition-all duration-200',
        hover && 'hover:border-white/[0.14]',
        interactive && 'cursor-pointer',
        className
      )}
    >
      {children}
    </Tag>
  );
};

interface SectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  eyebrow, title, description, icon, action, className, children,
}) => (
  <section className={clsx('space-y-6', className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-[#060606] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-600 mb-1.5">
              {eyebrow}
            </div>
          )}
          <h2 className="font-display text-2xl font-bold text-ink-900 tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-ink-600 mt-1 max-w-xl">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </section>
);

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
  const emphasisMap: Record<string, string> = {
    default: 'text-ink-900',
    success: 'text-brand-600',
    warning: 'text-amber-700',
    danger:  'text-crimson-700',
  };
  return (
    <div className={clsx(
      'bg-surface-panel border border-white/[0.06] rounded-2xl p-5',
      'hover:border-white/[0.14] transition-colors',
      className,
    )}>
      <div className="flex items-center gap-2 text-ink-600">
        {icon && <span className="text-ink-500">{icon}</span>}
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <div className={clsx('font-display text-[32px] leading-none font-bold tracking-tight mt-3 tabular-nums', emphasisMap[emphasis])}>
        {value}
      </div>
      {hint && (
        <div className="text-xs text-ink-500 mt-3 flex items-center gap-1.5">
          {hint}
        </div>
      )}
    </div>
  );
};
