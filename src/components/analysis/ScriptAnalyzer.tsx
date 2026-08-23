'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FileText, Sparkles, Check, Wand2, ArrowRight, TrendingUp } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ScriptIssue } from '@/lib/types';

const TYPE_LABELS: Record<ScriptIssue['type'], string> = {
  'gpt-phrase': 'AI phrase',
  'repetition': 'Repetition',
  'weak-hook':  'Weak hook',
  'weak-cta':   'Weak CTA',
};

export const ScriptAnalyzer: React.FC<{ 
  issues: ScriptIssue[]; 
  scriptText?: string; 
  scores: { humanAuthenticity: number, hook: number };
  scriptAnalysis?: { gptProbability: number, storytellingArc: string };
}> = ({ issues, scores, scriptAnalysis, scriptText }) => {
  const [fixedIds, setFixedIds] = useState<string[]>([]);
  const toggleFix = (id: string) =>
    setFixedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const gptProb = scriptAnalysis?.gptProbability ?? Math.max(0, 100 - scores.humanAuthenticity);
  const storyArc = scriptAnalysis?.storytellingArc ?? (scores.hook >= 80 ? 'Strong retention' : 'Drop-off risk');

  // Hand the report's script to the humanizer so the rewrite starts from the
  // actual text instead of an empty editor.
  const humanizerHref =
    scriptText && scriptText.trim()
      ? `/ai-humanizer?script=${encodeURIComponent(scriptText.slice(0, 15000))}`
      : '/ai-humanizer';

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center shrink-0 shadow-subtle">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Script analysis
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              GPT phrasing, dialogue rhythm, hook and CTA strength.
            </p>
          </div>
        </div>
        <Link href={humanizerHref}>
          <Button variant="secondary" size="sm" leftIcon={<Wand2 className="w-3.5 h-3.5" />}>
            Open in humanizer
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-6 pb-4">
        <MetricPill label="GPT probability" value={`${gptProb}%`} tone={gptProb <= 20 ? 'success' : gptProb <= 40 ? 'warning' : 'danger'} sub={gptProb <= 20 ? 'Reads as human' : 'AI phrasing detected'} />
        <MetricPill label="Hook strength" value={`${scores.hook}/100`} tone={scores.hook >= 80 ? 'success' : scores.hook >= 60 ? 'warning' : 'danger'} sub={storyArc} />
        <MetricPill label="Detected issues" value={String(issues.length)} tone={issues.length > 0 ? 'warning' : 'success'} sub={issues.length ? 'Fixable below' : 'None'} />
      </div>

      <div className="p-6 pt-2 space-y-2.5">
        <h3 className="text-[12px] font-semibold text-brand-600 mb-1">
          Rewrite suggestions ({issues.length - fixedIds.length} remaining)
        </h3>

        {issues.map((issue) => {
          const isFixed = fixedIds.includes(issue.id);
          return (
            <div
              key={issue.id}
              className={`rounded-xl border transition-colors ${
                isFixed
                  ? 'bg-grass-50 border-grass-100'
                  : 'bg-surface-panel border-white/[0.06] hover:border-white/[0.14]'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'default'}>
                      {TYPE_LABELS[issue.type]}
                    </Badge>
                    <span className="text-[11px] text-ink-400 tabular-nums">Line {issue.line}</span>
                  </div>
                  <button
                    onClick={() => toggleFix(issue.id)}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors ${
                      isFixed
                        ? 'bg-grass-100 text-grass-800 hover:bg-grass-50'
                        : 'bg-brand-600 text-[#060606] hover:bg-brand-400'
                    }`}
                  >
                    {isFixed ? (
                      <>
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        Applied
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Apply fix
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-surface-canvas border border-ink-200 p-3">
                    <div className="text-[11px] font-semibold text-ink-500 mb-1.5">
                      Original
                    </div>
                    <p className="text-[12.5px] text-ink-800 leading-relaxed">{issue.text}</p>
                  </div>
                  <div className="rounded-xl bg-grass-50 border border-grass-100 p-3">
                    <div className="text-[11px] font-semibold text-grass-700 mb-1.5 flex items-center gap-1">
                      Rewrite <ArrowRight className="w-2.5 h-2.5" />
                    </div>
                    <p className="text-[12.5px] text-ink-900 leading-relaxed">{issue.suggestion}</p>
                  </div>
                </div>
                {(issue.reasoning || issue.estimatedMetricImpact) && (
                  <div className="mt-2.5 flex flex-col sm:flex-row gap-3 text-[12px] bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    {issue.reasoning && (
                      <div className="flex-1">
                        <span className="font-semibold text-ink-700 mr-1.5">Why:</span>
                        <span className="text-ink-600 leading-relaxed">{issue.reasoning}</span>
                      </div>
                    )}
                    {issue.estimatedMetricImpact && (
                      <div className="flex sm:shrink-0 items-center gap-1.5 text-grass-700 font-medium whitespace-normal sm:whitespace-nowrap">
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                        <span>{issue.estimatedMetricImpact}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const MetricPill: React.FC<{
  label: string; value: string; sub: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}> = ({ label, value, sub, tone }) => {
  const tones = {
    success: 'bg-grass-50 border-grass-100 text-grass-800',
    warning: 'bg-amber-50 border-amber-500/15 text-amber-800',
    danger:  'bg-crimson-50 border-crimson-500/15 text-crimson-800',
    neutral: 'bg-surface-canvas border-ink-200 text-ink-800',
  };
  return (
    <div className={`rounded-xl p-4 border ${tones[tone]}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-xl font-semibold tracking-tight mt-1">{value}</div>
      <div className="text-[11px] opacity-70 mt-1">{sub}</div>
    </div>
  );
};
