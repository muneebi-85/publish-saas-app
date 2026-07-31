'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { clsx } from 'clsx';
import {
  LayoutDashboard, UploadCloud, LineChart, FolderKanban, Sparkles,
  Wand2, Search, BarChart3, LayoutGrid, FileText, Palette, Settings,
  HelpCircle, ChevronUp, Sun, Moon
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme } from 'next-themes';
import { Logo } from '@/components/ui/Logo';
import { useQuota } from '@/hooks/useQuota';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free Plan', starter: 'Starter Plan', pro: 'Pro Plan', agency: 'Agency Plan',
};

const NAV: { label: string; href: string; icon: React.ElementType; badge?: string }[] = [
  { label: 'Dashboard',         href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Upload',            href: '/upload',             icon: UploadCloud     },
  { label: 'Analyses',          href: '/analyses',           icon: LineChart       },
  { label: 'Projects',          href: '/projects',           icon: FolderKanban    },
  { label: 'AI Coach',          href: '/ai-coach',           icon: Sparkles        },
  { label: 'Script Optimizer',  href: '/ai-humanizer',       icon: Wand2, badge: 'Pro' },
  { label: 'SEO Studio',        href: '/seo',                icon: Search          },
  { label: 'Channel Analytics', href: '/channel-analytics',  icon: BarChart3       },
  { label: 'Templates',         href: '/templates',          icon: LayoutGrid      },
  { label: 'Reports',           href: '/reports',            icon: FileText        },
  { label: 'Brand Kit',         href: '/brand-kit',          icon: Palette         },
  { label: 'Settings',          href: '/settings',           icon: Settings        },
];

export const Sidebar: React.FC<{ isMobile?: boolean }> = ({ isMobile }) => {
  const pathname = usePathname();
  const { plan, auditsUsed, auditsLimit, percentUsed, loading } = useQuota();
  const { user: clerkUser } = useUser();
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
      "bg-surface-panel flex flex-col select-none shrink-0",
      isMobile ? "w-full h-full" : "w-[260px] border-r border-ink-200 h-screen sticky top-0 z-30"
    )}>
      {/* Brand */}
      {!isMobile && (
        <div className="px-5 h-[68px] flex items-center border-b border-ink-100">
          <Link href="/dashboard" className="block">
            <Logo size="md" />
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50',
              )}
            >
              <Icon className={clsx(
                'w-[18px] h-[18px] shrink-0 transition-colors',
                active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
              )} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none bg-brand-100 text-brand-700">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Plan card */}
      <div className="px-3 pb-3">
        <Link
          href="/pricing?upgrade=1"
          className="block rounded-2xl border border-ink-200 bg-ink-50 p-4 hover:border-ink-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[13px] font-semibold text-ink-900">
              {loading ? '…' : (PLAN_LABEL[plan] ?? 'Free Plan')}
            </span>
            <span className="text-[12px] font-semibold text-brand-600">Upgrade</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </div>
          <div className="mt-2 text-[11.5px] text-ink-500">
            {loading ? 'Loading…' : `${auditsUsed} / ${auditsLimit} analyses used`}
          </div>
        </Link>
      </div>

      {/* User footer */}
      <div className="px-3 pb-3 relative">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-ink-50 transition-colors focus-ring outline-none">
              {avatar ? (
                <Image src={avatar} alt="" width={32} height={32} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold text-ink-900 truncate">{name}</div>
                <div className="text-[11.5px] text-ink-500 truncate">{email || 'Creator'}</div>
              </div>
              <ChevronUp className="w-4 h-4 text-ink-400 transition-transform ui-open:rotate-180" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="start"
              sideOffset={8}
              className="w-[236px] bg-surface-panel border border-ink-200 rounded-xl shadow-float p-1.5 z-50 animate-enter-scale origin-bottom-left"
            >
              <DropdownMenu.Item asChild>
                <Link href="/settings" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900 outline-none cursor-pointer">
                  <Settings className="w-4 h-4 text-ink-400" /> Account settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/help" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900 outline-none cursor-pointer">
                  <HelpCircle className="w-4 h-4 text-ink-400" /> Help center
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={(e) => {
                  e.preventDefault();
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink-700 hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900 outline-none cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-ink-400" />
                ) : (
                  <Moon className="w-4 h-4 text-ink-400" />
                )}
                Toggle Theme
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-ink-100" />
              <DropdownMenu.Item asChild>
                <SignOutButton redirectUrl="/">
                  <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-crimson-600 hover:bg-crimson-50 focus:bg-crimson-50 outline-none cursor-pointer">
                    Sign out
                  </button>
                </SignOutButton>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
};
