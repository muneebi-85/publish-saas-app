'use client';

import React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useQuota } from '@/hooks/useQuota';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro', agency: 'Agency',
};

/**
 * Live quota meter. Reads authoritative plan/usage from /api/me/plan (DB), not
 * cookies, so it can't be spoofed and always matches what the server enforces.
 */
export const QuotaMeter: React.FC<{ className?: string }> = ({ className }) => {
  const { auditsUsed, auditsLimit, percentUsed, plan, loading } = useQuota();

  const nearLimit = percentUsed >= 80 && percentUsed < 100;
  const atLimit = percentUsed >= 100;
  const barColor = atLimit ? 'bg-crimson-600' : nearLimit ? 'bg-amber-500' : 'bg-ink-900';

  if (loading) {
    return (
      <div className={clsx('rounded-xl border border-ink-200 bg-white p-3.5 flex items-center justify-center h-[72px]', className)}>
        <Loader2 className="w-4 h-4 animate-spin text-ink-300" />
      </div>
    );
  }

  return (
    <div className={clsx(
      'rounded-xl border bg-white p-3.5 transition-colors',
      atLimit ? 'border-crimson-500/30' : nearLimit ? 'border-amber-500/30' : 'border-ink-200',
      className,
    )}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-ink-700 tabular-nums">
          {auditsUsed} / {auditsLimit} reviews
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {PLAN_LABEL[plan] ?? plan}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(100, percentUsed)}%` }}
        />
      </div>

      {(nearLimit || atLimit || plan === 'free') && (
        <Link
          href="/pricing?upgrade=1"
          className="mt-2.5 flex items-center justify-between group"
        >
          <span className={clsx(
            'text-[11.5px]',
            atLimit ? 'text-crimson-700 font-medium' : 'text-ink-500',
          )}>
            {atLimit ? 'Limit reached' : nearLimit ? 'Almost out' : 'Get more reviews'}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-ink-900 group-hover:gap-1 transition-all">
            Upgrade <ArrowUpRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </div>
  );
};

export default QuotaMeter;
