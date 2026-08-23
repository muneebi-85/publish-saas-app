'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Bell, Search, UploadCloud } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { CommandMenu } from '@/components/dashboard/CommandMenu';
import { useUnreadActivity } from '@/hooks/useUnreadActivity';

/**
 * Global dashboard header. The search field is a trigger for the existing
 * command palette rather than a second search implementation — CommandMenu
 * already owns the ⌘K binding, so the two can never disagree.
 */
export const Topbar: React.FC = () => {
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const { user } = useUser();
  const unread = useUnreadActivity(true);

  const avatar = user?.imageUrl ?? null;
  const initial = ((user?.firstName || user?.fullName || 'C').charAt(0)).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-20 h-20 shrink-0 border-b border-white/[0.06] bg-surface-canvas/85 backdrop-blur-xl">
        <div className="h-full px-4 sm:px-8 lg:px-10 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="group flex-1 max-w-[420px] h-10 px-3.5 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-left hover:border-white/[0.16] transition-colors duration-180 focus-ring outline-none"
          >
            <Search className="w-4 h-4 text-ink-500 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-[13.5px] text-ink-500 truncate">
              Search analyses, projects, actions…
            </span>
            <kbd className="hidden sm:inline-flex h-5 shrink-0 items-center gap-0.5 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 font-mono text-[10px] font-medium text-ink-500">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </button>

          <div className="flex items-center gap-2.5 ml-auto shrink-0">
            <Link href="/upload" className="hidden sm:block">
              <button className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 text-[#060606] text-[13.5px] font-semibold hover:bg-brand-400 transition-colors duration-180 focus-ring outline-none">
                <UploadCloud className="w-4 h-4" strokeWidth={2} />
                New analysis
              </button>
            </Link>

            <Link
              href="/notifications"
              className="relative w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-ink-600 hover:text-white hover:border-white/[0.16] transition-colors duration-180"
              aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            >
              <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-[#060606] text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-surface-canvas">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={40}
                height={40}
                className="rounded-full object-cover border border-white/[0.08]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-600 text-[#060606] flex items-center justify-center text-[15px] font-semibold">
                {initial}
              </div>
            )}
          </div>
        </div>
      </header>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
};
