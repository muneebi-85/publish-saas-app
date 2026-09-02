'use client';

import React from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { HookRetentionMetric } from '@/lib/types';

const RetentionBar: React.FC<{ label: string; value: number; hint: string; tone: 'success' | 'warning' | 'danger' }> = ({
  label, value, hint, tone,
}) => {
  const toneMap = {
    success: 'text-grass-700 bg-grass-600',
    warning: 'text-amber-700 bg-amber-600',
    danger:  'text-crimson-700 bg-crimson-600',
  };
  const [txt, bar] = toneMap[tone].split(' ');
  return (
    <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</div>
        <div className={`font-display text-[20px] leading-[1.3] font-semibold tabular-nums tracking-[-0.02em] ${txt}`}>{value}%</div>
      </div>
      <div className="mt-3 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${value}%` }} />
      </div>
      <div className="text-[12px] text-ink-500 mt-2 leading-snug">{hint}</div>
    </div>
  );
};

export const HookPredictor: React.FC<{ hook: HookRetentionMetric }> = ({ hook }) => {
  const toneFor = (v: number): 'success' | 'warning' | 'danger' =>
    v >= 85 ? 'success' : v >= 65 ? 'warning' : 'danger';
  const analyzed = hook.analyzed !== false;

  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Hook &amp; retention
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Predicted retention through the first thirty seconds — where most videos die.
            </p>
          </div>
        </div>
        <Badge variant={analyzed && hook.first5SecRetention >= 85 ? 'success' : 'warning'} dot>
          {analyzed ? `${hook.first5SecRetention}% at 5s` : 'Not analyzed'}
        </Badge>
      </div>

      {analyzed ? (
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <RetentionBar label="0 – 5 s"  value={hook.first5SecRetention}  hint="Immediate curiosity"      tone={toneFor(hook.first5SecRetention)} />
        <RetentionBar label="5 – 10 s" value={hook.first10SecRetention} hint="Premise setup"            tone={toneFor(hook.first10SecRetention)} />
        <RetentionBar label="10 – 30 s" value={hook.first30SecRetention} hint={hook.hookDropoffReason}  tone={toneFor(hook.first30SecRetention)} />
      </div>
      ) : (
        <div className="p-6 text-[13px] text-ink-600 leading-relaxed">{hook.hookDropoffReason}</div>
      )}

      {analyzed && hook.basis === 'heuristic' && (
        <div className="px-6 pb-2 text-[11px] text-ink-500 leading-relaxed">
          The model read was unavailable for this review, so these numbers come from a pattern
          check on your opening rather than the full analysis — directionally useful, less
          precise. Re-run once the model is reachable for the full read.
        </div>
      )}

      {analyzed && (
      <div className="px-6 pb-6 pt-2">
        <h4 className="text-[12px] font-semibold text-brand-600 mb-2 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Stronger openers to try
        </h4>
        <div className="space-y-2">
          {hook.recommendedHooks.map((h, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-800 leading-relaxed">
              <span className="w-5 h-5 rounded-md bg-ink-100 text-ink-900 text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                {i + 1}
              </span>
              &ldquo;{h}&rdquo;
            </div>
          ))}
        </div>
      </div>
      )}
    </section>
  );
};
