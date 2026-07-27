'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FolderKanban, UploadCloud, FileBarChart2,
  FileSpreadsheet, BarChart3, Wand2, Search, CreditCard,
  Settings, HelpCircle,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { QuotaMeter } from '@/components/QuotaMeter';
import { useQuota } from '@/hooks/useQuota';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free plan', starter: 'Starter plan', pro: 'Pro plan', agency: 'Agency plan',
};

const NAV: {
  section: string;
  items: { label: string; href: string; icon: React.ElementType; badge?: string }[];
}[] = [
  {
    section: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/dashboard',       icon: LayoutDashboard },
      { label: 'Projects',  href: '/projects',        icon: FolderKanban    },
      { label: 'New review', href: '/upload',         icon: UploadCloud     },
    ],
  },
  {
    section: 'Insight',
    items: [
      { label: 'Analysis',       href: '/analysis/proj-001',    icon: FileBarChart2  },
      { label: 'Reports',        href: '/reports',              icon: FileSpreadsheet },
      { label: 'Channel health', href: '/channel-analytics',    icon: BarChart3      },
    ],
  },
  {
    section: 'Tools',
    items: [
      { label: 'AI Humanizer', href: '/ai-humanizer', icon: Wand2, badge: 'New' },
      { label: 'SEO Engine',   href: '/seo',          icon: Search              },
    ],
  },
];

const BOTTOM = [
  { label: 'Billing',  href: '/pricing',  icon: CreditCard },
  { label: 'Settings', href: '/settings', icon: Settings   },
  { label: 'Help',     href: '/help',     icon: HelpCircle },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { plan, loading } = useQuota();

  const isActive = (href: string) =>
    pathname === href || (href.startsWith('/analysis') && pathname?.startsWith('/analysis'));

  return (
    <aside className="w-[248px] bg-white border-r border-ink-200 flex flex-col h-screen sticky top-0 z-30 select-none shrink-0">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <Link href="/dashboard" className="block group">
          <Logo size="md" showSub />
        </Link>
      </div>

      {/* Workspace switcher / cmdK hint */}
      <div className="px-3 pb-3">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-ink-200 bg-surface-canvas hover:bg-surface-muted transition-colors group">
          <div className="w-6 h-6 rounded-md bg-ink-900 text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[12.5px] font-medium text-ink-900 truncate">My Studio</div>
            <div className="text-[10.5px] text-ink-500">
              {loading ? '…' : (PLAN_LABEL[plan] ?? 'Free plan')}
            </div>
          </div>
          <kbd className="hidden group-hover:inline-flex items-center gap-0.5 text-[9.5px] font-mono text-ink-500 bg-white border border-ink-200 rounded px-1 py-0.5">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-5 overflow-y-auto pb-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-2.5 mb-1.5 text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.14em]">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'group flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-ink-900 text-white'
                        : 'text-ink-700 hover:text-ink-900 hover:bg-ink-100',
                    )}
                  >
                    <Icon className={clsx(
                      'w-4 h-4 shrink-0 transition-colors',
                      active ? 'text-white' : 'text-ink-500 group-hover:text-ink-700',
                    )} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className={clsx(
                        'text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                        active ? 'bg-white/15 text-white' : 'bg-grass-50 text-grass-700',
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-3 space-y-0.5">
        {BOTTOM.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors',
                active
                  ? 'bg-ink-100 text-ink-900'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Live quota meter — reads real state from cookies set by /api/analyze */}
      <QuotaMeter className="mx-3 mb-4" />
    </aside>
  );
};
