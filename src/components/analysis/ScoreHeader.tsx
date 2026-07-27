'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Share2, RefreshCw, ShieldCheck, ShieldAlert,
  ChevronRight, Info,
} from 'lucide-react';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface ScoreHeaderProps {
  title: string;
  description: string;
  riskLevel: string;
  duration?: string;
  scores: {
    overall: number;
    monetization: number;
    originality: number;
    humanAuthenticity: number;
    brandSafety: number;
    copyright: number;
    seo: number;
    hook: number;
    editing: number;
  };
}

const SCORE_META: { key: keyof ScoreHeaderProps['scores']; label: string; why: string }[] = [
  { key: 'monetization',     label: 'Monetization',  why: 'Advertiser suitability across all target platforms.' },
  { key: 'humanAuthenticity',label: 'Authenticity',  why: 'How human the script and voiceover read to detection systems.' },
  { key: 'copyright',        label: 'Copyright',     why: 'Music, footage, logo, and watermark exposure.' },
  { key: 'brandSafety',      label: 'Brand safety',  why: 'Language and imagery against advertiser guidelines.' },
  { key: 'hook',             label: 'Hook',          why: 'Predicted retention through the first 30 seconds.' },
  { key: 'seo',              label: 'SEO',           why: 'Discoverability of title, description, and tags.' },
];

export const ScoreHeader: React.FC<ScoreHeaderProps> = ({
  title, description, riskLevel, duration, scores,
}) => {
  const isSafe = riskLevel === 'LOW';

  return (
    <div className="space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
          <Link href="/projects" className="hover:text-ink-900 transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Link>
          <ChevronRight className="w-3 h-3 text-ink-300" />
          <span className="text-ink-900 font-medium truncate max-w-[240px]">{title}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>Re-run</Button>
          <Button variant="secondary" size="sm" leftIcon={<Share2 className="w-3.5 h-3.5" />}>Share</Button>
          <Button size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}>Export PDF</Button>
        </div>
      </div>

      {/* Verdict banner */}
      <div className={`rounded-2xl border p-6 sm:p-7 ${
        isSafe
          ? 'bg-grass-50/60 border-grass-100'
          : 'bg-amber-50/60 border-amber-500/20'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              isSafe ? 'bg-grass-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {isSafe ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-950">
                  {isSafe ? 'Safe to publish' : 'Review before publishing'}
                </h1>
                <Badge variant={isSafe ? 'success' : 'warning'} dot size="md">
                  {riskLevel} risk
                </Badge>
              </div>
              <p className="text-sm text-ink-700 mt-2 leading-relaxed max-w-2xl">
                {isSafe
                  ? 'No blocking policy issues found. The improvements below are optional and would raise your predicted reach — they are not required for monetization.'
                  : 'We found issues that could restrict monetization or reach. Each one below includes the specific fix, ranked by impact.'}
              </p>
              <div className="flex items-center gap-2 mt-3 text-[11.5px] text-ink-500">
                <span className="truncate max-w-md">{title}</span>
                {duration && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-ink-300" />
                    <span className="tabular-nums">{duration}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-6 lg:pl-6 lg:border-l border-ink-200/70">
            <ScoreGauge score={scores.overall} size="xl" showLabel={false} />
            <div>
              <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                Overall
              </div>
              <div className="text-sm font-medium text-ink-900 mt-1">
                {scores.overall >= 85 ? 'Strong' : scores.overall >= 70 ? 'Acceptable' : 'Needs work'}
              </div>
              <div className="text-[11.5px] text-ink-500 mt-1 max-w-[140px] leading-relaxed">
                Weighted across all six review layers.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-ink-200 border border-ink-200 rounded-2xl overflow-hidden">
        {SCORE_META.map((m) => {
          const value = scores[m.key];
          return (
            <div key={m.key} className="bg-white p-4 sm:p-5 group relative">
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-600">{m.label}</span>
                <Info className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className={`text-2xl font-semibold tabular-nums mt-1.5 tracking-tight ${
                value >= 85 ? 'text-grass-700' : value >= 70 ? 'text-amber-700' : 'text-crimson-700'
              }`}>
                {value}
              </div>
              <div className="mt-2.5 h-1 w-full bg-ink-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    value >= 85 ? 'bg-grass-500' : value >= 70 ? 'bg-amber-500' : 'bg-crimson-500'
                  }`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <div className="text-[10.5px] text-ink-500 mt-2.5 leading-snug opacity-0 group-hover:opacity-100 transition-opacity absolute left-4 right-4 bottom-2 bg-white pt-1">
                {m.why}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
