'use client';

import React from 'react';
import { Copyright, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { CopyrightMetric } from '@/lib/types';

export const CopyrightAuditor: React.FC<{ copyright: CopyrightMetric }> = ({ copyright }) => {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <Copyright className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-950">
              Copyright auditor
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Audio fingerprints, brand marks, watermarks, and stock footage overlap.
            </p>
          </div>
        </div>
        <Badge variant={copyright.musicMatchRisk === 'Low' ? 'success' : 'warning'} dot>
          Claim risk: {copyright.musicMatchRisk}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: 'Music risk',     value: `${copyright.musicMatchRisk}`,                           sub: copyright.musicMatchRisk === 'Low' ? 'Royalty-free' : 'Review track licensing' },
          { label: 'Logos detected', value: copyright.detectedLogos.length ? copyright.detectedLogos.join(', ') : 'None', sub: 'Nominative fair use' },
          { label: 'Watermarks',     value: copyright.watermarkDetected ? 'Detected' : 'Clean',      sub: copyright.watermarkDetected ? 'Remove overlay' : 'No external marks' },
          { label: 'Stock overlap',  value: copyright.stockFootageEstimate,                          sub: 'Original content dominates' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
            <div className="text-[11px] font-medium text-ink-500">{m.label}</div>
            <div className="text-[14px] font-semibold text-ink-900 mt-1 truncate" title={m.value}>{m.value}</div>
            <div className="text-[11px] text-ink-500 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 pt-1 space-y-2">
        <h4 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">Findings</h4>
        {copyright.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-600 shrink-0 mt-0.5" />
            {rec}
          </div>
        ))}
      </div>
    </section>
  );
};
