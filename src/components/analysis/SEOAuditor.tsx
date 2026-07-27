'use client';

import React from 'react';
import { Search, Tag, Hash } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { SEOMetric } from '@/lib/types';

export const SEOAuditor: React.FC<{ seo: SEOMetric }> = ({ seo }) => {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-950">
              SEO &amp; metadata
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Title keywords, description indexing, and tag relevance.
            </p>
          </div>
        </div>
        <Badge variant={seo.rankingOpportunity === 'High' ? 'success' : seo.rankingOpportunity === 'Medium' ? 'warning' : 'default'} dot>
          Ranking: {seo.rankingOpportunity}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Title score</div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums tracking-tight mt-1">{seo.titleOptimizationScore}%</div>
          <div className="text-[11.5px] text-grass-700 mt-1">Intent aligned</div>
        </div>
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Keyword density</div>
          <div className="text-[15px] font-semibold text-ink-900 mt-1">{seo.keywordDensity}</div>
          <div className="text-[11.5px] text-grass-700 mt-1">Within optimal range</div>
        </div>
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Competitor benchmark</div>
          <div className="text-[13px] font-medium text-ink-900 mt-1 leading-snug">{seo.competitorComparison}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-6 pb-6">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2 inline-flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> Search tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.suggestedTags.map((tag, i) => (
              <span key={i} className="inline-flex items-center px-2.5 py-1 bg-ink-100 hover:bg-ink-200 transition-colors text-ink-800 text-[12px] font-medium rounded-md cursor-default">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2 inline-flex items-center gap-1.5">
            <Hash className="w-3 h-3" /> Hashtags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.suggestedHashtags.map((ht, i) => (
              <span key={i} className="inline-flex items-center px-2.5 py-1 bg-grass-50 border border-grass-100 text-grass-800 text-[12px] font-medium rounded-md cursor-default">
                {ht}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
