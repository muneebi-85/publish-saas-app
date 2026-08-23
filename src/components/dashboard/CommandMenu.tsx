'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search, Folder, Video, User, LayoutDashboard, LineChart,
  Wand2, BarChart3, FileText, CreditCard,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

type Action = { label: string; href: string; icon: React.ElementType; keywords?: string };

const NAVIGATE: Action[] = [
  { label: 'Upload new video',     href: '/upload',            icon: Video,           keywords: 'new analyze audit' },
  { label: 'Go to Dashboard',      href: '/dashboard',         icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'View all analyses',    href: '/analyses',          icon: LineChart,       keywords: 'reports history' },
  { label: 'View all projects',    href: '/projects',          icon: Folder,          keywords: 'folders' },
  { label: 'Creator Script Optimizer', href: '/ai-humanizer',  icon: Wand2,           keywords: 'script rewrite hook' },
  { label: 'Channel Analytics',    href: '/channel-analytics', icon: BarChart3,       keywords: 'trends growth' },
  { label: 'Reports',              href: '/reports',           icon: FileText,        keywords: 'export pdf' },
];

const SETTINGS: Action[] = [
  { label: 'Profile settings', href: '/settings', icon: User,       keywords: 'account email' },
  { label: 'Billing & plan',   href: '/pricing',  icon: CreditCard, keywords: 'upgrade subscription invoice' },
];

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4 data-[state=open]:animate-enter-scale outline-none">
          <div className="bg-surface-raised rounded-2xl shadow-float overflow-hidden border border-white/[0.1]">
            <Command className="w-full flex flex-col bg-transparent h-[400px]" label="Command Menu">
              <div className="flex items-center border-b border-white/[0.06] px-3" cmdk-input-wrapper="">
                <Search className="w-4 h-4 text-ink-400 shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="Type a command or search..."
                  className="flex-1 h-12 bg-transparent outline-none px-3 text-[14px] text-white placeholder:text-ink-400"
                />
                <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 font-mono text-[10px] font-medium text-ink-500">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
              <Command.List className="flex-1 overflow-y-auto p-2 focus:outline-none scrollbar-thin">
                <Command.Empty className="py-6 text-center text-[13px] text-ink-500">
                  No results found.
                </Command.Empty>

                <Command.Group heading="Go to" className="px-2 py-1 text-xs font-semibold text-ink-500 [&_[cmdk-group-items]]:mt-2 [&_[cmdk-group-items]]:space-y-1">
                  {NAVIGATE.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Command.Item
                        key={a.href}
                        value={`${a.label} ${a.keywords ?? ''}`}
                        onSelect={() => go(a.href)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 rounded-lg aria-selected:bg-white/[0.07] aria-selected:text-white cursor-pointer outline-none"
                      >
                        <Icon className="w-4 h-4 text-ink-400" />
                        <span>{a.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                <Command.Separator className="h-px bg-white/[0.06] my-2" />

                <Command.Group heading="Account" className="px-2 py-1 text-xs font-semibold text-ink-500 [&_[cmdk-group-items]]:mt-2 [&_[cmdk-group-items]]:space-y-1">
                  {SETTINGS.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Command.Item
                        key={a.href}
                        value={`${a.label} ${a.keywords ?? ''}`}
                        onSelect={() => go(a.href)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 rounded-lg aria-selected:bg-white/[0.07] aria-selected:text-white cursor-pointer outline-none"
                      >
                        <Icon className="w-4 h-4 text-ink-400" />
                        <span>{a.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
