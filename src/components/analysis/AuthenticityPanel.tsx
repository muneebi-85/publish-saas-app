'use client';

import React from 'react';
import { ShieldQuestion, Info, AlertTriangle, CheckCircle2, HelpCircle, Minus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { AuthenticityAssessment } from '@/lib/types';

/**
 * Authenticity panel.
 *
 * UI CONTRACT: the risk band must never be able to read as a verdict.
 * Three things enforce that, and none of them are optional:
 *   1. The headline says "reads as" — never "is".
 *   2. Confidence sits directly beside the band, at the same visual weight, so a
 *      High risk at 40% confidence cannot be skimmed as a High risk at 90%.
 *   3. "Why this might be wrong" is always rendered, always expanded — never
 *      behind a disclosure toggle. A creator who is wrongly flagged must see the
 *      caveat in the same glance as the flag.
 */

const RISK_STYLE: Record<
  AuthenticityAssessment['risk'],
  { badge: 'success' | 'warning' | 'danger'; label: string; blurb: string }
> = {
  Low: {
    badge: 'success',
    label: 'Low risk',
    blurb: 'Reads as human-written across the signals we could check.',
  },
  Medium: {
    badge: 'warning',
    label: 'Medium risk',
    blurb: 'Carries some markers that appear more often in generated text.',
  },
  High: {
    badge: 'danger',
    label: 'High risk',
    blurb: 'Carries several markers strongly associated with generated text.',
  },
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 75) return 'we could check most of the available signals';
  if (confidence >= 55) return 'we could check some of the signals';
  if (confidence >= 40) return 'we could check only a few signals';
  return 'we could check very little';
}

export const AuthenticityPanel: React.FC<{ authenticity: AuthenticityAssessment }> = ({
  authenticity: a,
}) => {
  const style = RISK_STYLE[a.risk];
  const aiSignals = a.evidence.filter((e) => e.direction === 'ai-indicator');
  const humanSignals = a.evidence.filter((e) => e.direction === 'human-indicator');

  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <ShieldQuestion className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Content authenticity
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              How strongly this content reads as AI-generated — an estimate, never a determination.
            </p>
          </div>
        </div>
        <Badge variant={style.badge} dot>
          {style.label}
        </Badge>
      </div>

      {/* Score + confidence, deliberately at equal visual weight. */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Human Authenticity Score</div>
          <div className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink-900 mt-1 tabular-nums">
            {a.humanAuthenticityScore}
            <span className="text-[13px] font-medium text-ink-500">/100</span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">Higher reads more human</div>
        </div>
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Confidence</div>
          <div className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink-900 mt-1 tabular-nums">
            {a.confidence}
            <span className="text-[13px] font-medium text-ink-500">%</span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">{confidenceLabel(a.confidence)}</div>
        </div>
        <div className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Assessment</div>
          <div className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mt-1">{style.label}</div>
          <div className="text-[11px] text-ink-500 mt-1 leading-relaxed">{style.blurb}</div>
        </div>
      </div>

      {a.creatorDeclared && (
        <div className="mx-6 mb-4 flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-panel border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
          <Info className="w-4 h-4 text-ink-500 shrink-0 mt-0.5" />
          <span>
            You declared AI generation on this upload, so this reflects your own disclosure rather
            than a detection result. Assisted drafting is not the same as generated content, and
            platforms treat them differently.
          </span>
        </div>
      )}

      {/* Evidence — both directions, because a Low band needs its support too. */}
      {aiSignals.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <h4 className="text-[12px] font-semibold text-amber-700">
            Signals associated with generated text ({aiSignals.length})
          </h4>
          {aiSignals.map((e, i) => (
            <div
              key={i}
              className="p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] leading-relaxed"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900">
                    {e.signal}
                    <span className="ml-2 text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">
                      {e.weight}
                    </span>
                  </div>
                  <div className="text-ink-600 mt-0.5 break-words">{e.location}</div>
                  <div className="text-ink-700 mt-1">{e.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {humanSignals.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <h4 className="text-[12px] font-semibold text-grass-700">
            Signals associated with human writing ({humanSignals.length})
          </h4>
          {humanSignals.map((e, i) => (
            <div
              key={i}
              className="p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] leading-relaxed"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900">
                    {e.signal}
                    <span className="ml-2 text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">
                      {e.weight}
                    </span>
                  </div>
                  <div className="text-ink-600 mt-0.5 break-words">{e.location}</div>
                  <div className="text-ink-700 mt-1">{e.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Always rendered, never collapsed. This is the creator's defence. */}
      <div className="px-6 pb-5 space-y-2">
        <h4 className="text-[12px] font-semibold text-brand-600">Why this assessment might be wrong</h4>
        {a.falsePositiveReasons.map((reason, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed"
          >
            <HelpCircle className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
            {reason}
          </div>
        ))}
      </div>

      {a.inconclusive.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Not evaluated ({a.inconclusive.length})
          </h4>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            These checks did not run. They are unevaluated, not passing.
          </p>
          {a.inconclusive.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-600 leading-relaxed"
            >
              <Minus className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      )}

      {a.recommendations.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <h4 className="text-[12px] font-semibold text-brand-600">What to change</h4>
          {a.recommendations.map((rec, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed"
            >
              <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
              {rec}
            </div>
          ))}
        </div>
      )}

      <div className="px-6 py-4 border-t border-ink-200 bg-surface-canvas">
        <h4 className="text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em] mb-2">
          Limitations
        </h4>
        <ul className="space-y-1.5">
          {a.limitations.map((limit, i) => (
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
