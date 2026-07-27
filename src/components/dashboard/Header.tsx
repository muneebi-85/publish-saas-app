'use client';

import React from 'react';
import { Bell, Search, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export const Header: React.FC = () => {
  return (
    <header className="h-14 border-b border-ink-200 bg-white/85 backdrop-blur-md px-6 flex items-center justify-between shrink-0 sticky top-0 z-20">
      {/* Search / cmdK */}
      <button className="group inline-flex items-center gap-2.5 h-8 pl-2.5 pr-1.5 border border-ink-200 rounded-lg text-[12.5px] text-ink-500 hover:bg-ink-100 hover:border-ink-300 transition-colors w-[280px] text-left">
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1">Search projects, reports…</span>
        <kbd className="text-[10px] font-mono text-ink-500 bg-white border border-ink-200 rounded px-1 py-0.5">⌘K</kbd>
      </button>

      <div className="flex items-center gap-3">
        <Link
          href="/upload"
          className="hidden sm:inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-600 hover:text-ink-900 transition-colors"
        >
          Docs <ArrowUpRight className="w-3 h-3" />
        </Link>
        <button className="relative p-2 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-crimson-500 rounded-full" />
        </button>
        <div className="w-px h-5 bg-ink-200" />
        <button className="flex items-center gap-2 cursor-pointer group">
          <div className="w-7 h-7 rounded-full bg-ink-900 text-white flex items-center justify-center text-[11px] font-semibold">
            A
          </div>
          <span className="text-sm font-medium text-ink-800 group-hover:text-ink-950 hidden sm:block">Alex</span>
        </button>
      </div>
    </header>
  );
};
