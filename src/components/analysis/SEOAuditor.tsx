'use client';

import React, { useState } from 'react';
import { Search, Tag, Hash, Copy, Check, Clock, AlignLeft } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { SEOMetric } from '@/lib/types';

export const SEOAuditor: React.FC<{ seo: SEOMetric }> = ({ seo }) => {
  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              SEO &amp; metadata
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Title keywords, description indexing, and tag relevance.
            </p>
          </div>
        </div>
        <Badge variant={seo.rankingOpportunity === 'High' ? 'success' : seo.rankingOpportunity === 'Medium' ? 'warning' : 'default'} dot>
          Ranking: {seo.rankingOpportunity}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Title score</div>
          <div className="font-display text-[24px] leading-[1.25] font-semibold text-ink-900 tabular-nums tracking-[-0.02em] mt-1">{seo.titleOptimizationScore}%</div>
          {/* Derived from the score it sits under — the previous hardcoded
              "Intent aligned" printed under failing titles too. */}
          <div className={`text-[12px] mt-1 ${
            seo.titleOptimizationScore >= 80 ? 'text-grass-700' : seo.titleOptimizationScore >= 60 ? 'text-ink-500' : 'text-amber-700'
          }`}>
            {seo.titleOptimizationScore >= 80 ? 'Strong keyword targeting' : seo.titleOptimizationScore >= 60 ? 'Partially targeted' : 'Weak keyword targeting'}
          </div>
        </div>
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Keyword density</div>
          <div className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mt-1">{seo.keywordDensity}</div>
          {/* Reads the (Sparse/Balanced/Dense) band the density string carries,
              so a "Dense" reading can no longer sit under the words "Within
              optimal range". */}
          <div className={`text-[12px] mt-1 ${
            /balanced/i.test(seo.keywordDensity) ? 'text-grass-700' : /dense/i.test(seo.keywordDensity) ? 'text-amber-700' : 'text-ink-500'
          }`}>
            {/balanced/i.test(seo.keywordDensity)
              ? 'In the balanced band'
              : /dense/i.test(seo.keywordDensity)
                ? 'Dense — trim repetition'
                : /sparse/i.test(seo.keywordDensity)
                  ? 'Sparse — name the topic more'
                  : 'Add a script to measure'}
          </div>
        </div>
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Competitor benchmark</div>
          <div className="text-[13px] font-medium text-ink-900 mt-1 leading-snug">{seo.competitorComparison}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-6 pb-6">
        <div>
          <div className="text-[12px] font-semibold text-brand-600 mb-2 inline-flex items-center gap-1.5">
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
          <div className="text-[12px] font-semibold text-brand-600 mb-2 inline-flex items-center gap-1.5">
            <Hash className="w-3 h-3" /> Hashtags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.suggestedHashtags.map((ht, i) => (
              <span key={i} className="inline-flex items-center px-2.5 py-1 bg-grass-50 border border-grass-200 text-grass-800 text-[12px] font-medium rounded-md cursor-default">
                {ht}
              </span>
            ))}
          </div>
        </div>
      </div>
      {(seo.generatedDescription || seo.timestamps) && (
        <div className="border-t border-ink-200 p-6 grid grid-cols-1 gap-6">
          {seo.generatedDescription && (
            <CopyableText
              title="Optimized Description"
              icon={<AlignLeft className="w-3.5 h-3.5" />}
              text={seo.generatedDescription}
            />
          )}
          {seo.timestamps && seo.timestamps.length > 0 && (
            <CopyableText
              title="Chapter Timestamps"
              icon={<Clock className="w-3.5 h-3.5" />}
              text={seo.timestamps.join('\n')}
            />
          )}
        </div>
      )}

      {/* Keyword coverage — computed from the script's own terms, not a model
          opinion. null/undefined = no script was analyzed: the honest answer
          is the empty-state line, not a zero. */}
      <div className="border-t border-ink-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[12px] font-semibold text-brand-600 inline-flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Keyword coverage
          </div>
        </div>
        <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
          Terms your script discusses most, and whether your title, description, and tags carry them.
        </p>
        {!seo.keywordGaps || seo.keywordGaps.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            {seo.keywordGaps === null || seo.keywordGaps === undefined
              ? 'Not measured — attach the script to compare its terms against your packaging.'
              : 'Your title and description already carry every term your script repeats most. Nothing missing.'}
          </p>
        ) : (
          <div className="space-y-2">
            {seo.keywordGaps.map((g) => (
              <div
                key={g.term}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-surface-canvas border border-ink-200"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-ink-900">{g.term}</span>
                  <span className="text-[12px] text-ink-500 ml-2">
                    {g.scriptCount}× in script
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-medium shrink-0">
                  <CoveragePill label="Title" covered={g.inTitle} />
                  <CoveragePill label="Desc" covered={g.inDescription} />
                  <CoveragePill label="Tags" covered={g.inTags} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-ink-500 leading-relaxed pt-1">
              Search and suggested feeds match your packaging against what viewers type — a term the
              script leans on that the title never names is the cheapest discoverability fix there is.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

const CoveragePill: React.FC<{ label: string; covered: boolean }> = ({ label, covered }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md border ${
      covered
        ? 'text-grass-700 border-grass-200 bg-grass-50'
        : 'text-ink-500 border-ink-200 bg-ink-50'
    }`}
  >
    {covered ? '✓' : '—'} {label}
  </span>
);

const CopyableText: React.FC<{ title: string; icon: React.ReactNode; text: string }> = ({ title, icon, text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A refused clipboard permission must not flash a false "Copied".
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-semibold text-brand-600 inline-flex items-center gap-1.5">
          {icon} {title}
        </div>
        <button
          onClick={handleCopy}
          className="text-[11px] font-medium text-ink-500 hover:text-ink-900 flex items-center gap-1 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-grass-700" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="bg-surface-canvas border border-ink-200 rounded-lg p-3.5 text-[13px] leading-relaxed text-ink-800 whitespace-pre-wrap font-mono">
        {text}
      </div>
    </div>
  );
};
