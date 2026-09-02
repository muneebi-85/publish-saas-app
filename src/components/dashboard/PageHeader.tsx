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
  <div className={clsx('flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6', className)}>
    <div className="min-w-0">
      <h1 className="font-display text-[24px] leading-[1.2] font-semibold text-ink-900 tracking-[-0.02em]">
        {title}
      </h1>
      {subtitle && <p className="text-[13px] leading-relaxed text-ink-600 mt-1">{subtitle}</p>}
    </div>
    {actions && (
      <div className="flex items-center gap-2 shrink-0 print:hidden">{actions}</div>
    )}
  </div>
);
