'use client';

import React, { useState } from 'react';
import { LayoutGrid, ChevronDown, CheckCircle2, Minus } from 'lucide-react';
import type { Scorecard } from '@/lib/types';

/**
 * The scorecard grid.
 *
 * A card with `value === null` renders "Not evaluated" — never a zero, never a
 * dash that could be mistaken for a low score. Confidence is shown on every
 * card, including the ones that scored well, so the creator can tell a
 * high-confidence 88 from a guess.
 */

function scoreColor(value: number | null): string {
  if (value === null) return 'text-ink-400';
  if (value >= 85) return 'text-grass-700';
  if (value >= 65) return 'text-amber-700';
  return 'text-crimson-700';
}

function barColor(value: number | null): string {
  if (value === null) return 'bg-ink-200';
  if (value >= 85) return 'bg-grass-500';
  if (value >= 65) return 'bg-amber-500';
  return 'bg-crimson-500';
}

const ScorecardRow: React.FC<{ card: Scorecard }> = ({ card }) => {
  const [open, setOpen] = useState(false);
  const hasDetail =
    card.evidence.length > 0 ||
    card.inconclusive.length > 0 ||
    card.recommendations.length > 0 ||
    card.expectedImpact.trim().length > 0;

  const panelId = `scorecard-${card.id}`;

  return (
    <div className="rounded-xl bg-surface-canvas border border-ink-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        aria-controls={hasDetail ? panelId : undefined}
        className="w-full text-left p-4 flex items-start gap-3 disabled:cursor-default hover:bg-white/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink-900">{card.label}</span>
            <span className={`text-[17px] font-semibold tabular-nums shrink-0 ${scoreColor(card.value)}`}>
              {card.value === null ? (
                <span className="text-[12px] font-medium">Not evaluated</span>
              ) : (
                <>
                  {card.value}
                  <span className="text-[11px] font-medium text-ink-500">/100</span>
                </>
              )}
            </span>
          </div>

          <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(card.value)}`}
              style={{ width: `${card.value ?? 0}%` }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-500 tabular-nums">
              {card.confidence}% confidence
            </span>
            {hasDetail && (
              <span className="text-[11px] font-medium text-brand-600 inline-flex items-center gap-1">
                {open ? 'Hide' : 'Details'}
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </span>
            )}
          </div>
        </div>
      </button>

      {open && hasDetail && (
        <div id={panelId} className="px-4 pb-4 space-y-3 border-t border-ink-200 pt-3">
          {card.evidence.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
                Evidence
              </h5>
              <ul className="space-y-1">
                {card.evidence.map((e, i) => (
                  <li key={i} className="text-[12.5px] text-ink-700 leading-relaxed flex items-start gap-2">
                    <span className="text-ink-400 mt-0.5">•</span>
                    <span className="break-words">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {card.inconclusive.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
                Inconclusive
              </h5>
              <ul className="space-y-1">
                {card.inconclusive.map((e, i) => (
                  <li key={i} className="text-[12.5px] text-ink-600 leading-relaxed flex items-start gap-2">
                    <Minus className="w-3.5 h-3.5 text-ink-400 shrink-0 mt-0.5" />
                    <span className="break-words">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {card.recommendations.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-1.5">
                Recommended improvements
              </h5>
              <ul className="space-y-1.5">
                {card.recommendations.map((r, i) => (
                  <li key={i} className="text-[12.5px] text-ink-700 leading-relaxed flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-grass-700 shrink-0 mt-0.5" />
                    <span className="break-words">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {card.expectedImpact.trim().length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
                Expected impact
              </h5>
              <p className="text-[12.5px] text-ink-700 leading-relaxed">{card.expectedImpact}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ScorecardGrid: React.FC<{ scorecards: Scorecard[] }> = ({ scorecards }) => {
  const evaluated = scorecards.filter((c) => c.value !== null).length;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center shrink-0 shadow-subtle">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Scorecards
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Every layer with its score, confidence, evidence, and what to change.
            </p>
          </div>
        </div>
        <span className="text-[11px] text-ink-500 tabular-nums shrink-0 mt-1">
          {evaluated} of {scorecards.length} evaluated
        </span>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {scorecards.map((card) => (
          <ScorecardRow key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
};
