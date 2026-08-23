'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Logo } from '@/components/ui/Logo';

export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-white/[0.06] bg-surface-panel shrink-0">
      <Logo size="sm" />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            className="p-2 -mr-2 rounded-lg text-ink-600 hover:text-white hover:bg-white/[0.06] focus-ring outline-none"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-40 data-[state=open]:animate-fade-in" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[260px] bg-surface-panel border-r border-white/[0.06] shadow-float flex flex-col data-[state=open]:animate-enter outline-none">
            <div className="flex items-center justify-between px-5 h-[68px] border-b border-white/[0.06] shrink-0">
              <Logo size="md" />
              <Dialog.Close asChild>
                <button
                  className="p-2 -mr-2 rounded-lg text-ink-400 hover:text-white hover:bg-white/[0.06] focus-ring outline-none"
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
  );
}
