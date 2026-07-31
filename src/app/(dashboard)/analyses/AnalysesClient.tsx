'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Search, Plus, ArrowUpRight, LineChart, SlidersHorizontal, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { PageHeader } from '@/components/dashboard/PageHeader';

interface AnalysisItem {
  id: string;
  title: string;
  platform: string;
  overall: number;
  monetization: number;
  createdAt: string;
}

type StatusFilter = 'all' | 'ready' | 'improve' | 'rework';

const statusOf = (score: number): { key: StatusFilter; label: string; cls: string } =>
  score >= 85 ? { key: 'ready', label: 'Ready', cls: 'text-brand-600 bg-brand-50' } :
  score >= 70 ? { key: 'improve', label: 'Improve', cls: 'text-amber-600 bg-amber-50' } :
  { key: 'rework', label: 'Rework', cls: 'text-crimson-600 bg-crimson-50' };

export default function AnalysesClient({ items }: { items: AnalysisItem[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        const matchQuery = it.title.toLowerCase().includes(query.toLowerCase());
        const matchFilter = filter === 'all' || statusOf(it.overall).key === filter;
        return matchQuery && matchFilter;
      }),
    [items, query, filter],
  );

  const TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'ready', label: 'Ready' },
    { key: 'improve', label: 'Needs work' },
    { key: 'rework', label: 'Rework' },
  ];

  return (
    <div className="animate-enter">
      <PageHeader
        title="Analyses"
        subtitle="Every report you've run, with scores and publish status."
        showUtility
        actions={
          <Link href="/upload">
            <Button variant="dark" leftIcon={<Plus className="w-4 h-4" />}>New analysis</Button>
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-1 rounded-xl bg-white border border-ink-200 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 h-8 rounded-lg text-[12.5px] font-medium transition-colors ${
                filter === t.key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              placeholder="Search analyses…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white border border-ink-200 rounded-xl pl-9 pr-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
            />
          </div>
          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setMenuOpen((o) => !o)}
              leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            >
              Filter
              {filter !== 'all' && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-brand-600" />
              )}
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 w-48 rounded-xl bg-white border border-ink-200 shadow-lg py-1.5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setFilter(t.key); setMenuOpen(false); }}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors"
                  >
                    {t.label}
                    {filter === t.key && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-ink-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-ink-100 rounded-full flex items-center justify-center mb-4">
            <LineChart className="w-6 h-6 text-ink-400" />
          </div>
          <h3 className="text-base font-semibold text-ink-900 mb-1">
            {items.length === 0 ? 'No analyses yet' : 'No matches'}
          </h3>
          <p className="text-sm text-ink-500 max-w-sm mb-6">
            {items.length === 0
              ? 'Upload your first video to get a full monetization, hook, and SEO report.'
              : 'Try a different search or filter.'}
          </p>
          {items.length === 0 ? (
            <Link href="/upload">
              <Button variant="dark" leftIcon={<Plus className="w-4 h-4" />}>Analyze a video</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_120px_100px_88px_40px] gap-4 items-center px-5 py-3 border-b border-ink-100 bg-surface-canvas">
            {['Analysis', 'Platform', 'Monetization', 'Score', 'Status', ''].map((h, i) => (
              <span key={i} className={`text-[11px] font-semibold uppercase tracking-wide text-ink-400 ${i === 5 ? '' : ''}`}>{h}</span>
            ))}
          </div>
          <div className="divide-y divide-ink-100">
            {filtered.map((it) => {
              const status = statusOf(it.overall);
              return (
                <Link
                  key={it.id}
                  href={`/analysis/${it.id}`}
                  className="group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_110px_120px_100px_88px_40px] gap-4 items-center px-5 py-3.5 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-8 rounded-md bg-ink-900 flex items-center justify-center shrink-0 text-white text-[10px] font-semibold">
                      {it.platform.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-ink-900 truncate">{it.title}</div>
                      <div className="text-[11.5px] text-ink-400 sm:hidden">
                        {new Date(it.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  <span className="hidden sm:block text-[12.5px] text-ink-500">{it.platform}</span>
                  <span className="hidden sm:block text-[13px] font-medium text-ink-700 tabular-nums">{it.monetization}/100</span>
                  <span className="hidden sm:block"><ScoreGauge score={it.overall} size="sm" showLabel={false} /></span>
                  <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-semibold ${status.cls}`}>
                    {status.label}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-ink-400 group-hover:text-ink-900 transition-colors justify-self-end" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
