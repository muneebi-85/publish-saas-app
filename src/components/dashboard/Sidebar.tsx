'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { clsx } from 'clsx';
import {
  LayoutDashboard, UploadCloud, LineChart, FolderKanban, Sparkles,
  Wand2, Search, BarChart3, LayoutGrid, FileText, Palette, Settings,
  HelpCircle, ChevronUp, Sun, Moon, Radio, ArrowUpRight, LogOut,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme } from 'next-themes';
import { Logo } from '@/components/ui/Logo';
import { useQuota } from '@/hooks/useQuota';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free Plan', starter: 'Starter Plan', pro: 'Pro Plan', agency: 'Agency Plan',
};

type NavItem = { label: string; href: string; icon: React.ElementType; badge?: string };

/**
 * Grouped so the rail reads as a workflow rather than a flat list. Every entry
 * maps to a route that exists under src/app/(dashboard) — nothing here is a
 * placeholder.
 */
const NAV_SECTIONS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'Analyze',
    items: [
      { label: 'Upload',           href: '/upload',       icon: UploadCloud  },
      { label: 'Analyses',         href: '/analyses',     icon: LineChart    },
      { label: 'Projects',         href: '/projects',     icon: FolderKanban },
      { label: 'AI Coach',         href: '/ai-coach',     icon: Sparkles     },
      { label: 'Script Optimizer', href: '/ai-humanizer', icon: Wand2, badge: 'Pro' },
      { label: 'SEO Studio',       href: '/seo',          icon: Search       },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Channel Analytics', href: '/channel-analytics', icon: BarChart3  },
      { label: 'Reports',           href: '/reports',           icon: FileText   },
      { label: 'Templates',         href: '/templates',         icon: LayoutGrid },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { label: 'Connected Channels', href: '/connected-channels', icon: Radio    },
      { label: 'Brand Kit',          href: '/brand-kit',          icon: Palette  },
      { label: 'Settings',           href: '/settings',           icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<{ isMobile?: boolean }> = ({ isMobile }) => {
  const pathname = usePathname();
  const { plan, auditsUsed, auditsLimit, percentUsed, loading } = useQuota();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();

  const name = clerkUser?.fullName || clerkUser?.firstName || 'Creator';
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
  const avatar = clerkUser?.imageUrl ?? null;
  const initial = (name?.charAt(0) || 'C').toUpperCase();

  const isActive = (href: string) =>
    pathname === href ||
    (href === '/analyses' && pathname?.startsWith('/analysis')) ||
    (href !== '/dashboard' && pathname?.startsWith(href));

  return (
    <aside className={clsx(
      'bg-surface-panel flex flex-col select-none shrink-0',
      isMobile ? 'w-full h-full' : 'w-[260px] border-r border-white/[0.06] h-screen sticky top-0 z-30',
    )}>
      {/* Brand */}
      {!isMobile && (
        <div className="px-5 h-20 flex items-center border-b border-white/[0.06]">
          <Link href="/dashboard" className="block">
            <Logo size="md" />
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.heading ?? 'root'} className={si > 0 ? 'mt-6' : ''}>
            {section.heading && (
              <div className="px-3 mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                {section.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors duration-180',
                      active
                        ? 'bg-white/[0.06] text-white'
                        : 'text-ink-600 hover:text-white hover:bg-white/[0.04]',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-brand-600" />
                    )}
                    <Icon
                      className={clsx(
                        'w-[18px] h-[18px] shrink-0 transition-colors',
                        active ? 'text-brand-600' : 'text-ink-500 group-hover:text-ink-700',
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none bg-brand-600/12 text-brand-600 border border-brand-600/20">
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
      {/* Plan + credits */}
      <div className="px-3 pb-3">
        <Link
          href="/pricing?upgrade=1"
          className="group block rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-white/[0.16] transition-colors duration-180"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold text-white">
              {loading ? '…' : (PLAN_LABEL[plan] ?? 'Free Plan')}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand-600">
              Upgrade
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-180" />
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden"
            role="progressbar"
            aria-valuenow={auditsUsed}
            aria-valuemin={0}
            aria-valuemax={auditsLimit}
            aria-label="Analyses used this cycle"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </div>
          <div className="mt-2.5 text-[11.5px] text-ink-500 font-mono tabular-nums">
            {loading ? 'Loading…' : `${auditsUsed} / ${auditsLimit} analyses used`}
          </div>
        </Link>
      </div>

      {/* User footer */}
      <div className="px-3 pb-3 border-t border-white/[0.06] pt-3">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.04] transition-colors duration-180 focus-ring outline-none">
              {avatar ? (
                <Image src={avatar} alt="" width={32} height={32} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-600 text-[#060606] flex items-center justify-center text-[13px] font-semibold shrink-0">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold text-white truncate">{name}</div>
                <div className="text-[11.5px] text-ink-500 truncate">{email || 'Creator'}</div>
              </div>
              <ChevronUp className="w-4 h-4 text-ink-500" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="start"
              sideOffset={8}
              className="w-[236px] bg-surface-raised border border-white/[0.1] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-1.5 z-50 animate-enter-scale origin-bottom-left"
            >
              <DropdownMenu.Item asChild>
                <Link href="/settings" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white outline-none cursor-pointer">
                  <Settings className="w-4 h-4 text-ink-500" /> Account settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/help" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white outline-none cursor-pointer">
                  <HelpCircle className="w-4 h-4 text-ink-500" /> Help center
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={(e) => {
                  e.preventDefault();
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white outline-none cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-ink-500" />
                ) : (
                  <Moon className="w-4 h-4 text-ink-500" />
                )}
                Toggle Theme
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/[0.06]" />
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  void signOut({ redirectUrl: '/' });
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-crimson-500 hover:bg-crimson-500/10 focus:bg-crimson-500/10 outline-none cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-crimson-500" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
};
