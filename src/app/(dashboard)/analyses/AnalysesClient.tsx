'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Plus, ArrowUpRight, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { scoreBand } from '@/lib/score-band';

interface AnalysisItem {
  id: string;
  title: string;
  platform: string;
  overall: number;
  monetization: number;
  createdAt: string;
}

type StatusFilter = 'all' | 'ready' | 'improve' | 'rework';

// The pill and the tabs must agree, so both read the one band label from the
// shared util — the row used to say "Improve" while the tab said "Needs work".
const statusOf = (score: number): { key: StatusFilter; label: string; cls: string } => {
  const band = scoreBand(score);
  if (band === 'strong') return { key: 'ready',   label: 'Ready',   cls: 'text-grass-700 bg-grass-50' };
  if (band === 'fair')   return { key: 'improve', label: 'Needs work', cls: 'text-amber-700 bg-amber-50' };
  return                        { key: 'rework',  label: 'Rework',  cls: 'text-crimson-700 bg-crimson-50' };
};

export default function AnalysesClient({
  items,
  truncated,
}: {
  items: AnalysisItem[];
  truncated: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

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
            <Button leftIcon={<Plus className="w-4 h-4" />}>New review</Button>
          </Link>
        }
      />

      {/* Toolbar — the status tabs are the single filter UI; a second dropdown
          listing the same four options used to sit here and did nothing the
          tabs don't. */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setFilter(t.key)}
              aria-pressed={filter === t.key}
              className={`px-2.5 h-7 rounded-md text-[12px] font-medium transition-colors ${
                filter === t.key ? 'bg-surface-panel text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-900'
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
              aria-label="Search analyses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-surface-panel border border-ink-300 rounded-lg pl-9 pr-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Truncation note — only rendered when the cap actually bit. */}
      {truncated && (
        <p className="mb-4 text-[12px] text-ink-500">
          Showing your 50 most recent reviews. Older ones still open normally from Reports and search.
        </p>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-surface-panel border border-ink-200 rounded-xl shadow-xs flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">
            <LineChart className="w-5 h-5" />
          </div>
          <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
            {items.length === 0 ? 'No analyses yet' : 'No matches'}
          </h3>
          <p className="text-[13px] leading-relaxed text-ink-600 mt-2 mb-6 max-w-sm">
            {items.length === 0
              ? 'Upload your first video to get a full monetization, hook, and SEO report.'
              : 'Try a different search or filter.'}
          </p>
          {items.length === 0 ? (
            <Link href="/upload">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Run your first review</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-surface-panel border border-ink-200 rounded-xl shadow-xs overflow-hidden">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_120px_100px_88px_40px] gap-4 items-center px-5 py-3 border-b border-ink-200 bg-surface-canvas">
            {['Analysis', 'Platform', 'Monetization', 'Score', 'Status', ''].map((h, i) => (
              <span key={i} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-ink-200">
            {filtered.map((it) => {
              const status = statusOf(it.overall);
              return (
                <Link
                  key={it.id}
                  href={`/analysis/${it.id}`}
                  className="group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_110px_120px_100px_88px_40px] gap-4 items-center px-5 py-3.5 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center shrink-0 text-ink-700 text-[12px] font-semibold">
                      {it.platform.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink-900 truncate">{it.title}</div>
                      <div className="text-[12px] text-ink-500 sm:hidden">
                        {new Date(it.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </div>
                    </div>
                  </div>
                  <span className="hidden sm:block text-[12px] text-ink-500">{it.platform}</span>
                  <span className="hidden sm:block text-[13px] font-medium text-ink-700 tabular-nums">{it.monetization}/100</span>
                  <span className="hidden sm:block"><ScoreGauge score={it.overall} size="sm" showLabel={false} /></span>
                  <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-semibold ${status.cls}`}>
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
