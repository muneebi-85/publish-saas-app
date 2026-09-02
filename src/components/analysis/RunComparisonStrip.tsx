'use client';

import React from 'react';
import { ArrowRight, TrendingUp, Minus, Info } from 'lucide-react';
import Link from 'next/link';
import { scoreBand, SCORE_BAND_UI } from '@/lib/score-band';

/**
 * Before/after strip for a re-review: this report vs. the creator's previous
 * run of the same video (matched server-side on normalized title + platform,
 * the same key the Reports trend page groups by).
 *
 * This is the artifact that closes the value loop visibly: the creator fixes
 * what the last review flagged, re-runs, and the strip answers "did it work?"
 * in one glance — layer by layer, not just the headline.
 *
 * Layer deltas use the product's one shared band scale (score-band.ts), so
 * "46 → 78" reads in the same vocabulary as every other number on the page.
 * Unmeasured layers (null in either run) are listed as "—" — a layer that did
 * not run is not a 0-point regression.
 */

export interface LayerDelta {
  label: string;
  before: number | null;
  after: number | null;
}

export interface RunComparison {
  previous: {
    id: string;
    createdAt: string;
    overall: number;
  };
  currentOverall: number;
  layers: LayerDelta[];
}

const fmt = (v: number | null) => (v === null ? '—' : String(v));

const deltaTone = (d: number | null) =>
  d === null ? 'text-ink-400' : d > 0 ? 'text-grass-700' : d < 0 ? 'text-crimson-700' : 'text-ink-500';

export const RunComparisonStrip: React.FC<{ comparison: RunComparison }> = ({ comparison }) => {
  const overallDelta = comparison.currentOverall - comparison.previous.overall;
  const improved = overallDelta > 0;
  const date = new Date(comparison.previous.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="rounded-xl border border-ink-200 bg-surface-panel shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
            Compared with your previous run
          </h2>
          <p className="text-[12px] text-ink-500 mt-0.5">
            {date} · <Link href={`/analysis/${comparison.previous.id}`} className="text-brand-600 hover:underline">open that report</Link>
          </p>
        </div>
        <div className="flex items-baseline gap-2 sm:gap-3 shrink-0">
          <span className="font-display text-[24px] font-semibold tabular-nums text-ink-500">
            {comparison.previous.overall}
          </span>
          <ArrowRight className="w-4 h-4 text-ink-400 self-center" />
          <span
            className={`font-display text-[32px] font-semibold tabular-nums ${
              SCORE_BAND_UI[scoreBand(comparison.currentOverall)].text
            }`}
          >
            {comparison.currentOverall}
          </span>
          <span className={`text-[13px] font-semibold tabular-nums ${deltaTone(overallDelta)}`}>
            {improved ? `+${overallDelta}` : overallDelta === 0 ? '±0' : overallDelta}
          </span>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-ink-200 rounded-lg overflow-hidden">
          {comparison.layers.map((l) => {
            const d = l.before === null || l.after === null ? null : l.after - l.before;
            return (
              <div key={l.label} className="bg-surface-panel p-3.5">
                <div className="text-[11px] font-semibold text-ink-500">{l.label}</div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-[13px] font-medium tabular-nums text-ink-500">{fmt(l.before)}</span>
                  <ArrowRight className="w-3 h-3 text-ink-300 self-center" />
                  <span
                    className={`text-[18px] font-semibold tabular-nums ${
                      l.after === null ? 'text-ink-400' : SCORE_BAND_UI[scoreBand(l.after)].text
                    }`}
                  >
                    {fmt(l.after)}
                  </span>
                </div>
                <div className={`text-[11px] font-semibold mt-1 inline-flex items-center gap-1 ${deltaTone(d)}`}>
                  {d === null ? (
                    <>
                      <Info className="w-3 h-3" /> not measured both runs
                    </>
                  ) : d > 0 ? (
                    <>
                      <TrendingUp className="w-3 h-3" /> +{d}
                    </>
                  ) : d < 0 ? (
                    <>
                      <TrendingUp className="w-3 h-3 rotate-180" /> {d}
                    </>
                  ) : (
                    <>
                      <Minus className="w-3 h-3" /> unchanged
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">
          Scores are pre-publish predictions from the same nine layers — they move when the content
          changes, not when the wind changes. A drop can also mean a layer ran this time that did
          not run before (see “not measured both runs”).
        </p>
      </div>
    </div>
  );
};
