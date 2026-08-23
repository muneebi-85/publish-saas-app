import React from 'react';
import { clsx } from 'clsx';

/**
 * Per-page title block. The notifications bell and avatar live in the global
 * Topbar, so `showUtility` is accepted for call-site compatibility but renders
 * nothing — two bells on one screen is two sources of truth.
 */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  showUtility?: boolean;
  className?: string;
}> = ({ title, subtitle, actions, className }) => (
  <div className={clsx('flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7', className)}>
    <div className="min-w-0">
      <h1 className="font-display text-[28px] leading-tight font-bold text-white tracking-[-0.03em]">
        {title}
      </h1>
      {subtitle && <p className="text-[14px] text-ink-600 mt-1.5">{subtitle}</p>}
    </div>
    {actions && (
      <div className="flex items-center gap-3 shrink-0 print:hidden">{actions}</div>
    )}
  </div>
);
