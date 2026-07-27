'use client';

import React from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { HookRetentionMetric } from '@/lib/types';

const RetentionBar: React.FC<{ label: string; value: number; hint: string; tone: 'success' | 'warning' | 'danger' }> = ({
  label, value, hint, tone,
}) => {
  const toneMap = {
    success: 'text-grass-700 bg-grass-500',
    warning: 'text-amber-700 bg-amber-500',
    danger:  'text-crimson-700 bg-crimson-500',
  };
  const [txt, bar] = toneMap[tone].split(' ');
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-medium text-ink-500">{label}</div>
        <div className={`text-xl font-semibold tabular-nums tracking-tight ${txt}`}>{value}%</div>
      </div>
      <div className="mt-3 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
      <div className="text-[11.5px] text-ink-500 mt-2 leading-snug">{hint}</div>
    </div>
  );
};

export const HookPredictor: React.FC<{ hook: HookRetentionMetric }> = ({ hook }) => {
  const toneFor = (v: number): 'success' | 'warning' | 'danger' =>
    v >= 85 ? 'success' : v >= 65 ? 'warning' : 'danger';

  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-950">
              Hook &amp; retention
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Predicted retention through the first thirty seconds — where most videos die.
            </p>
          </div>
        </div>
        <Badge variant={hook.first5SecRetention >= 85 ? 'success' : 'warning'} dot>
          {hook.first5SecRetention}% at 5s
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <RetentionBar label="0 – 5 s"  value={hook.first5SecRetention}  hint="Immediate curiosity"      tone={toneFor(hook.first5SecRetention)} />
        <RetentionBar label="5 – 10 s" value={hook.first10SecRetention} hint="Premise setup"            tone={toneFor(hook.first10SecRetention)} />
        <RetentionBar label="10 – 30 s" value={hook.first30SecRetention} hint={hook.hookDropoffReason}  tone={toneFor(hook.first30SecRetention)} />
      </div>

      <div className="px-6 pb-6 pt-2">
        <h4 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Stronger openers to try
        </h4>
        <div className="space-y-2">
          {hook.recommendedHooks.map((h, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-800 leading-relaxed">
              <span className="w-5 h-5 rounded-md bg-ink-900 text-white text-[10.5px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                {i + 1}
              </span>
              &ldquo;{h}&rdquo;
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
