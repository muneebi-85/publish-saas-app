'use client';

import React from 'react';
import { DollarSign, AlertTriangle, CheckCircle2, Minus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { MonetizationRiskAnalysis, AuthenticityRisk } from '@/lib/types';

const RISK_BADGE: Record<AuthenticityRisk, 'success' | 'warning' | 'danger'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
};

const RISK_ICON_COLOR: Record<AuthenticityRisk, string> = {
  Low: 'text-grass-700',
  Medium: 'text-amber-700',
  High: 'text-crimson-700',
};

/**
 * Monetization risk panel.
 *
 * Renders exposure, not prediction. Every item names where it fires, the
 * mechanism it triggers, and a concrete fix — and the "not evaluated" list is
 * given the same prominence as the findings, because the gap between "clean"
 * and "unchecked" is exactly what gets a creator blindsided after upload.
 */
export const MonetizationRiskPanel: React.FC<{ analysis: MonetizationRiskAnalysis }> = ({
  analysis: m,
}) => {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center shrink-0 shadow-subtle">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Monetization risk
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Advertiser, policy, and copyright exposure found before you publish.
            </p>
          </div>
        </div>
        <Badge variant={RISK_BADGE[m.risk]} dot>
          {m.risk} risk
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Readiness</div>
          <div className="text-[22px] font-semibold text-ink-900 mt-1 tabular-nums">
            {m.score}
            <span className="text-[13px] font-medium text-ink-500">/100</span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">Residual risk after fixes</div>
        </div>
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Confidence</div>
          <div className="text-[22px] font-semibold text-ink-900 mt-1 tabular-nums">
            {m.confidence}
            <span className="text-[13px] font-medium text-ink-500">%</span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">Based on inputs supplied</div>
        </div>
        <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-medium text-ink-500">Findings</div>
          <div className="text-[22px] font-semibold text-ink-900 mt-1 tabular-nums">{m.items.length}</div>
          <div className="text-[11px] text-ink-500 mt-1">
            {m.items.length === 0 ? 'No rules fired' : 'Each with a fix below'}
          </div>
        </div>
      </div>

      {m.items.length > 0 ? (
        <div className="px-6 pb-5 space-y-2.5">
          <h4 className="text-[12px] font-semibold text-brand-600">Exposure found</h4>
          {m.items.map((item, i) => (
            <div key={i} className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${RISK_ICON_COLOR[item.risk]}`} />
                  <span className="text-[14px] font-semibold text-ink-900 truncate">
                    {item.category}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-ink-500 tabular-nums">
                    {item.confidence}% confidence
                  </span>
                  <Badge variant={RISK_BADGE[item.risk]}>{item.risk}</Badge>
                </div>
              </div>
              <div className="text-[12.5px] text-ink-600 mb-1.5 break-words">
                <span className="font-medium text-ink-700">Where: </span>
                {item.location}
              </div>
              <div className="text-[13px] text-ink-700 leading-relaxed mb-2">
                <span className="font-medium">Why: </span>
                {item.why}
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-ink-700 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">Fix: </span>
                  {item.fix}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 pb-5">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
            No monetization risk rules fired on the inputs supplied. Read the &ldquo;not
            evaluated&rdquo; list below before treating this as clear — several categories are not
            checked on any review.
          </div>
        </div>
      )}

      {m.inconclusive.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <h4 className="text-[12px] font-semibold text-ink-500">
            Not evaluated ({m.inconclusive.length})
          </h4>
          {m.inconclusive.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-600 leading-relaxed"
            >
              <Minus className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      )}

      <div className="px-6 py-4 border-t border-ink-200 bg-surface-canvas">
        <h4 className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
          Limitations
        </h4>
        <ul className="space-y-1.5">
          {m.limitations.map((limit, i) => (
            <li key={i} className="text-[12px] text-ink-600 leading-relaxed flex items-start gap-2">
              <span className="text-ink-400 mt-0.5">•</span>
              {limit}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
