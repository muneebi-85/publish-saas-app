'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Bell, Search, UploadCloud } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { CommandMenu } from '@/components/dashboard/CommandMenu';
import { useUnreadActivity } from '@/hooks/useUnreadActivity';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * Global dashboard header. The search field is a trigger for the existing
 * command palette rather than a second search implementation — CommandMenu
 * already owns the ⌘K binding, so the two can never disagree.
 *
 * 56px tall, matching the sidebar's brand block, so the hairline under the
 * header and the one under the logo form a single unbroken line across the app.
 */
export const Topbar: React.FC = () => {
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const { user } = useUser();
  // This bar is `hidden md:block` in the layout; only fetch the bell count
  // where it can actually render (MobileNav's own bell covers the rest).
  const isDesktop = useIsDesktop();
  const unread = useUnreadActivity(isDesktop);

  // In-page triggers (the projects page's Filter button) open this palette via
  // the same window-event pattern the footer's cookie-settings link uses. The
  // Topbar owns the app's ONLY CommandMenu instance — pages must not mount a
  // second one, or one ⌘K press stacks two dialogs.
  React.useEffect(() => {
    const onOpen = () => setCmdOpen(true);
    window.addEventListener('publish:command-menu-open', onOpen);
    return () => window.removeEventListener('publish:command-menu-open', onOpen);
  }, []);

  const avatar = user?.imageUrl ?? null;
  const initial = ((user?.firstName || user?.fullName || 'C').charAt(0)).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-ink-200 bg-surface-canvas/80 backdrop-blur-xl">
        <div className="h-full px-6 lg:px-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="group flex-1 max-w-[360px] h-8 pl-2.5 pr-2 flex items-center gap-2 rounded-lg border border-ink-200 bg-surface-panel text-left hover:border-ink-300 transition-colors duration-150 focus-ring outline-none"
          >
            <Search className="w-3.5 h-3.5 text-ink-400 shrink-0" />
            <span className="flex-1 text-[13px] text-ink-500 truncate">Search…</span>
            <kbd className="hidden sm:inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-ink-200 bg-ink-100 px-1.5 font-mono text-[11px] font-medium text-ink-500">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Link
              href="/notifications"
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-150"
              aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-on-brand text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-surface-canvas">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            <div className="w-px h-5 bg-ink-200 mx-0.5" aria-hidden="true" />

            {/* A styled Link, not a Link wrapping a button: nesting interactive
                elements puts an anchor and a button inside one another, which
                screen readers announce twice and which is invalid HTML. The
                Link carries the styles the button used to. */}
            <Link
              href="/upload"
              className="hidden sm:flex h-8 pl-2.5 pr-3 items-center gap-1.5 rounded-lg bg-ink-900 text-surface-canvas text-[13px] font-medium shadow-xs hover:bg-ink-800 transition-colors duration-150 focus-ring outline-none"
            >
              <UploadCloud className="w-4 h-4" />
              New review
            </Link>

            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={28}
                height={28}
                className="rounded-full object-cover border border-ink-200 ml-0.5"
              />
            ) : (
              <div className="w-7 h-7 ml-0.5 rounded-full bg-ink-900 text-surface-canvas flex items-center justify-center text-[12px] font-semibold">
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
