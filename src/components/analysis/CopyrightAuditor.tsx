'use client';

import React from 'react';
import { Copyright, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { CopyrightMetric } from '@/lib/types';

export const CopyrightAuditor: React.FC<{ copyright: CopyrightMetric }> = ({ copyright }) => {
  // Legacy rows persisted before these fields existed can carry undefined
  // members (the reason normalize-report exists) — coerce once, here, so a
  // .length on undefined cannot 500 the whole analysis page.
  const logos = Array.isArray(copyright.detectedLogos) ? copyright.detectedLogos : [];
  const recs = Array.isArray(copyright.recommendations) ? copyright.recommendations : [];
  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <Copyright className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Copyright auditor
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Audio fingerprints, brand marks, watermarks, and stock footage overlap.
            </p>
          </div>
        </div>
        <Badge variant={copyright.musicMatchRisk === 'Low' ? 'success' : 'warning'} dot>
          Claim risk: {copyright.musicMatchRisk ?? 'unknown'}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          // "Low" covers no-music and original compositions too, and the risk
          // itself is a keyword read on what the creator typed — the sub-label
          // must not overstate it into a royalty-free certification. `licensed`
          // is a first-class UI choice, not a keyword inference; an undefined
          // source on a legacy row says "reviewer graded", not "keyword matched".
          { label: 'Music risk',     value: `${copyright.musicMatchRisk ?? 'unknown'}`, sub: copyright.musicMatchRisk !== 'Low'
            ? 'Review track licensing'
            : copyright.musicSource === 'none' ? 'No music used'
            : copyright.musicSource === 'original' ? 'Original composition'
            : copyright.musicSource === 'stock' ? 'Stock / royalty-free declared'
            : copyright.musicSource === 'licensed' ? 'Licensed library declared'
            : copyright.musicSource ? 'RF keyword matched — keep license on file'
            : 'Reviewer-graded — keep license on file' },
          { label: 'Logos detected', value: logos.length ? logos.join(', ') : 'None', sub: 'Nominative fair use' },
          { label: 'Watermarks',     value: copyright.watermarkDetected ? 'Detected' : 'Clean',      sub: copyright.watermarkDetected ? 'Remove overlay' : 'No external marks' },
          { label: 'Stock overlap',  value: copyright.stockFootageEstimate ?? 'Not estimated',        sub: copyright.stockFootageEstimate ? 'Estimated from declared signals' : 'No stock-footage signal provided' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{m.label}</div>
            <div className="text-[14px] font-semibold text-ink-900 mt-1 truncate" title={m.value}>{m.value}</div>
            <div className="text-[11px] text-ink-500 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 pt-1 space-y-2">
        <h4 className="text-[12px] font-semibold text-brand-600">Findings</h4>
        {recs.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
            {rec}
          </div>
        ))}
      </div>
    </section>
  );
};
