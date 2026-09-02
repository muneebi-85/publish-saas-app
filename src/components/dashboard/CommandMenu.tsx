'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search, Folder, Video, User, LayoutDashboard, LineChart,
  Wand2, BarChart3, FileText, CreditCard, Bell, Sparkles,
  Radio, Palette, LayoutGrid, HelpCircle, Hash,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

type Action = { label: string; href: string; icon: React.ElementType; keywords?: string };

// Mirrors the sidebar: every app page is reachable from ⌘K, so a power user
// never has to remember which section a destination lives under.
const NAVIGATE: Action[] = [
  { label: 'Upload new video',     href: '/upload',            icon: Video,           keywords: 'new analyze review audit' },
  { label: 'Go to Dashboard',     href: '/dashboard',         icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'View all analyses',   href: '/analyses',          icon: LineChart,       keywords: 'reviews history' },
  { label: 'View all projects',   href: '/projects',          icon: Folder,          keywords: 'folders' },
  { label: 'AI Coach',             href: '/ai-coach',          icon: Sparkles,        keywords: 'ask advice chat coach' },
  { label: 'Creator Script Optimizer', href: '/ai-humanizer', icon: Wand2,           keywords: 'script rewrite hook humanize' },
  { label: 'SEO Studio',           href: '/seo',               icon: Hash,            keywords: 'title tags discoverability' },
  { label: 'Channel Analytics',    href: '/channel-analytics', icon: BarChart3,       keywords: 'trends growth' },
  { label: 'Reports',              href: '/reports',           icon: FileText,        keywords: 'export pdf' },
  { label: 'Templates',            href: '/templates',         icon: LayoutGrid,      keywords: 'hooks formats ideas' },
  { label: 'Connected Channels',    href: '/connected-channels', icon: Radio,          keywords: 'youtube tiktok link account' },
  { label: 'Brand Kit',            href: '/brand-kit',         icon: Palette,         keywords: 'colors fonts tone style' },
  { label: 'Notifications',        href: '/notifications',     icon: Bell,            keywords: 'activity feed unread' },
];

const SETTINGS: Action[] = [
  { label: 'Profile settings', href: '/settings', icon: User,       keywords: 'account email privacy delete' },
  { label: 'Billing & plan',   href: '/pricing',  icon: CreditCard, keywords: 'upgrade subscription invoice' },
  { label: 'Help & FAQ',       href: '/help',     icon: HelpCircle, keywords: 'support questions contact' },
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
        <Dialog.Overlay className="fixed inset-0 bg-ink-950/30 backdrop-blur-sm z-50 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4 data-[state=open]:animate-enter-scale outline-none">
          <div className="bg-surface-panel rounded-xl shadow-float overflow-hidden border border-ink-200">
            <Command className="w-full flex flex-col bg-transparent h-[400px]" label="Command Menu">
              <div className="flex items-center border-b border-ink-200 px-3" cmdk-input-wrapper="">
                <Search className="w-4 h-4 text-ink-400 shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="Type a command or search..."
                  aria-label="Search commands"
                  className="flex-1 h-12 bg-transparent outline-none px-3 text-[14px] text-ink-900 placeholder:text-ink-400"
                />
                <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded-md border border-ink-200 bg-ink-100 px-1.5 font-mono text-[11px] font-medium text-ink-500">
                  ⌘K
                </kbd>
              </div>
              <Command.List className="flex-1 overflow-y-auto p-2 focus:outline-none">
                <Command.Empty className="py-6 text-center text-[13px] text-ink-500">
                  No results found.
                </Command.Empty>

                <Command.Group heading="Go to" className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 [&_[cmdk-group-items]]:mt-1.5 [&_[cmdk-group-items]]:space-y-px">
                  {NAVIGATE.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Command.Item
                        key={a.href}
                        value={`${a.label} ${a.keywords ?? ''}`}
                        onSelect={() => go(a.href)}
                        className="flex items-center gap-2.5 px-2.5 h-9 text-[13px] text-ink-700 rounded-lg aria-selected:bg-ink-100 aria-selected:text-ink-900 cursor-pointer outline-none"
                      >
                        <Icon className="w-4 h-4 text-ink-400" />
                        <span>{a.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                <Command.Separator className="h-px bg-ink-200 my-1.5" />

                <Command.Group heading="Account" className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 [&_[cmdk-group-items]]:mt-1.5 [&_[cmdk-group-items]]:space-y-px">
                  {SETTINGS.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Command.Item
                        key={a.href}
                        value={`${a.label} ${a.keywords ?? ''}`}
                        onSelect={() => go(a.href)}
                        className="flex items-center gap-2.5 px-2.5 h-9 text-[13px] text-ink-700 rounded-lg aria-selected:bg-ink-100 aria-selected:text-ink-900 cursor-pointer outline-none"
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
