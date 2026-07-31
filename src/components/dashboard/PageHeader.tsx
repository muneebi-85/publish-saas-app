'use client';

import React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Bell } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { useUnreadActivity } from '@/hooks/useUnreadActivity';

/**
 * Per-page top bar. The app has no global header — each screen renders its own
 * title, subtitle, and actions. Set `showUtility` to include the notifications
 * bell + avatar cluster.
 *
 * The bell's badge reflects a real count fetched from /api/notifications. When
 * the count is zero — or has not loaded yet — no dot renders at all. A dot that
 * is always on trains users to ignore it.
 */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  showUtility?: boolean;
  className?: string;
}> = ({ title, subtitle, actions, showUtility = false, className }) => {
  const { user } = useUser();
  const avatar = user?.imageUrl ?? null;
  const initial = ((user?.firstName || user?.fullName || 'C').charAt(0)).toUpperCase();
  const unread = useUnreadActivity(showUtility);

  return (
    <div className={clsx('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight font-bold text-ink-900 tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-[14px] text-ink-600 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0 print:hidden">
        {actions}
        {showUtility && (
          <>
            <Link
              href="/notifications"
              className="relative w-10 h-10 rounded-xl border border-ink-200 bg-white flex items-center justify-center text-ink-600 hover:bg-ink-50 transition-colors"
              aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            >
              <Bell className="w-[18px] h-[18px]" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            {avatar ? (
              <Image src={avatar} alt="" width={40} height={40} className="rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center text-[15px] font-semibold">
                {initial}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
