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
  HelpCircle, ChevronUp, Sun, Moon, Radio, ArrowUpRight, LogOut, Bell,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme } from 'next-themes';
import { Logo } from '@/components/ui/Logo';
import { useQuota } from '@/hooks/useQuota';
import { planDisplayName } from '@/lib/plans';

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
      { label: 'Settings',           href: '/settings',          icon: Settings },
    ],
  },
  // Notifications has a bell in the desktop Topbar, but the Topbar is hidden
  // below md — without this entry the page is unreachable from the mobile
  // drawer.
  {
    heading: null,
    items: [{ label: 'Notifications', href: '/notifications', icon: Bell }],
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
      isMobile ? 'w-full h-full' : 'w-[248px] border-r border-ink-200 h-screen sticky top-0 z-30',
    )}>
      {/* Brand */}
      {!isMobile && (
        <div className="px-4 h-14 flex items-center border-b border-ink-200">
          <Link href="/dashboard" className="block">
            <Logo size="md" />
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => (
          // Two sections have no heading (Dashboard, Notifications), so the
          // key needs the index — both would otherwise claim 'root'.
          <div key={section.heading ?? `root-${si}`} className={si > 0 ? 'mt-5' : ''}>
            {section.heading && (
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {section.heading}
              </div>
            )}
            <div className="space-y-px">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'group relative flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] transition-colors duration-150',
                      active
                        ? 'bg-ink-100 text-ink-900 font-semibold'
                        : 'text-ink-600 font-medium hover:text-ink-900 hover:bg-ink-50',
                    )}
                  >
                    <Icon
                      className={clsx(
                        'w-4 h-4 shrink-0 transition-colors',
                        active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] px-1.5 h-4 inline-flex items-center rounded-md bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
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
      <div className="px-2.5 pb-2.5">
        <Link
          href="/pricing?upgrade=1"
          className="group block rounded-lg border border-ink-200 bg-surface-panel shadow-xs p-3 hover:border-ink-300 transition-colors duration-150"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12px] font-semibold text-ink-900">
              {loading ? '…' : `${planDisplayName(plan)} Plan`}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 group-hover:text-brand-700">
              Upgrade
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150" />
            </span>
          </div>
          <div
            className="h-1 w-full rounded-full bg-ink-100 overflow-hidden"
            role="progressbar"
            // Clamped: referral credits can legitimately push usage past the
            // plan's monthly allowance (they extend the wall), and an
            // aria-valuenow above aria-valuemax is an invalid ARIA state.
            aria-valuenow={Math.min(auditsUsed, auditsLimit)}
            aria-valuemin={0}
            aria-valuemax={auditsLimit}
            aria-label="Analyses used this cycle"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-ink-500 tabular-nums">
            {loading ? 'Loading…' : `${auditsUsed} / ${auditsLimit} analyses used`}
          </div>
        </Link>
      </div>

      {/* User footer */}
      <div className="px-2.5 pb-2.5 border-t border-ink-200 pt-2.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-ink-100 transition-colors duration-150 focus-ring outline-none">
              {avatar ? (
                <Image src={avatar} alt="" width={28} height={28} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-ink-900 text-surface-canvas flex items-center justify-center text-[12px] font-semibold shrink-0">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[12px] font-semibold text-ink-900 truncate">{name}</div>
                <div className="text-[11px] text-ink-500 truncate">{email || 'Creator'}</div>
              </div>
              <ChevronUp className="w-3.5 h-3.5 text-ink-400 shrink-0" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="start"
              sideOffset={8}
              className="w-[224px] bg-surface-panel border border-ink-200 rounded-xl shadow-float p-1 z-50 animate-enter-scale origin-bottom-left"
            >
              <DropdownMenu.Item asChild>
                <Link href="/settings" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus:bg-ink-100 focus:text-ink-900 outline-none cursor-pointer">
                  <Settings className="w-4 h-4 text-ink-400" /> Account settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/help" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus:bg-ink-100 focus:text-ink-900 outline-none cursor-pointer">
                  <HelpCircle className="w-4 h-4 text-ink-400" /> Help center
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={(e) => {
                  e.preventDefault();
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus:bg-ink-100 focus:text-ink-900 outline-none cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-ink-400" />
                ) : (
                  <Moon className="w-4 h-4 text-ink-400" />
                )}
                Toggle theme
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-ink-200 -mx-1" />
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  void signOut({ redirectUrl: '/' });
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-crimson-600 hover:bg-crimson-50 focus:bg-crimson-50 outline-none cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-crimson-600" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
};
