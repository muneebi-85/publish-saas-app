'use client';

import React from 'react';
import { Image as ImageIcon, Eye, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { ThumbnailMetric } from '@/lib/types';

export const ThumbnailAnalyzer: React.FC<{ thumbnail: ThumbnailMetric; thumbnailUrl?: string }> = ({
  thumbnail, thumbnailUrl,
}) => {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-950">
              Thumbnail analysis
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Visual hierarchy, emotion, text legibility, and CTR prediction.
            </p>
          </div>
        </div>
        <Badge variant={thumbnail.clickbaitRisk === 'Low' ? 'success' : 'warning'} dot>
          Clickbait risk: {thumbnail.clickbaitRisk}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6">
        <div className="relative rounded-xl overflow-hidden border border-ink-200 aspect-video bg-ink-100">
          <img
            src={thumbnailUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80'}
            alt="Thumbnail preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[11px] font-medium text-white">
            <Eye className="w-3 h-3" /> Predicted CTR {thumbnail.ctrPredictionScore}%
          </div>
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-2.5">
          <TileMini label="Face & emotion" value={`${thumbnail.faceCount} face${thumbnail.faceCount === 1 ? '' : 's'} · ${thumbnail.dominantEmotion}`} sub="Strong human connection" />
          <TileMini label="Text readability" value={`${thumbnail.textReadabilityScore}% · ${thumbnail.contrastRating}`} sub="Mobile-optimized" />
          <TileMini label="Composition" value={`${thumbnail.compositionScore}/100`} sub="Rule-of-thirds respected" />
          <TileMini label="Clickbait risk" value={thumbnail.clickbaitRisk} sub={thumbnail.clickbaitRisk === 'Low' ? 'Below platform threshold' : 'Reduce sensational text'} tone={thumbnail.clickbaitRisk === 'Low' ? 'success' : 'warning'} />

          <div className="col-span-2 space-y-2 mt-1">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">CTR improvements</h4>
            {thumbnail.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-grass-600 shrink-0 mt-0.5" />
                {rec}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const TileMini: React.FC<{
  label: string; value: string; sub: string; tone?: 'success' | 'warning' | 'default';
}> = ({ label, value, sub, tone = 'default' }) => (
  <div className="rounded-xl bg-surface-canvas border border-ink-200 p-3">
    <div className="text-[11px] font-medium text-ink-500">{label}</div>
    <div className="text-[14px] font-semibold text-ink-900 mt-1">{value}</div>
    <div className={`text-[11px] mt-1 ${
      tone === 'success' ? 'text-grass-700' : tone === 'warning' ? 'text-amber-700' : 'text-ink-500'
    }`}>{sub}</div>
  </div>
);
