'use client';

import React from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X, Bell, UploadCloud } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Logo } from '@/components/ui/Logo';
import { useUnreadActivity } from '@/hooks/useUnreadActivity';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  // This bar is `md:hidden` in the layout but stays mounted on desktop — the
  // SSR pattern — so its bell count fetch must be gated to mobile viewports
  // (the Topbar's own bell covers desktop) or every dashboard page fires
  // /api/notifications twice.
  const isDesktop = useIsDesktop();
  const unread = useUnreadActivity(!isDesktop);

  return (
    <div className="md:hidden flex items-center justify-between gap-1 px-4 h-14 border-b border-ink-200 bg-surface-panel shrink-0">
      <Logo size="sm" />
      {/* The desktop Topbar hides its bell and its upload CTA below md, so the
          mobile bar carries its own — otherwise neither is reachable on a phone. */}
      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors focus-ring outline-none"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        >
          <Bell className="w-[18px] h-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-on-brand text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-surface-panel">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        <Link
          href="/upload"
          className="h-9 px-3 ml-1 inline-flex items-center gap-1.5 rounded-lg bg-ink-900 text-surface-canvas text-[13px] font-medium shadow-xs transition-colors focus-ring outline-none"
        >
          <UploadCloud className="w-4 h-4" />
          New
        </Link>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              className="p-2 -mr-2 ml-1 rounded-lg text-ink-600 hover:text-ink-900 hover:bg-ink-100 focus-ring outline-none"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-ink-950/30 backdrop-blur-sm z-40 data-[state=open]:animate-fade-in" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[248px] bg-surface-panel border-r border-ink-200 shadow-float flex flex-col data-[state=open]:animate-enter outline-none">
              <div className="flex items-center justify-between px-4 h-14 border-b border-ink-200 shrink-0">
                <Logo size="md" />
                <Dialog.Close asChild>
                  <button
                    className="p-2 -mr-2 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-ink-100 focus-ring outline-none"
                    aria-label="Close navigation menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="flex-1 overflow-hidden w-full relative">
                <Sidebar isMobile />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
