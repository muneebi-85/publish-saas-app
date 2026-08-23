'use client';

import React, { useMemo, useState } from 'react';
import {
  ListChecks, Check, ArrowRight, TrendingUp, AlertTriangle, ShieldAlert, Search, Mic, Image as ImageIcon, Flame,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProjectData } from '@/lib/types';

type Impact = 'blocking' | 'high' | 'medium' | 'low';

interface Fix {
  id: string;
  impact: Impact;
  area: string;
  icon: React.ElementType;
  problem: string;
  action: string;
  gain: string;
  reasoning?: string;
}

const IMPACT_ORDER: Record<Impact, number> = { blocking: 0, high: 1, medium: 2, low: 3 };

const IMPACT_STYLE: Record<Impact, { badge: 'danger' | 'warning' | 'default'; label: string }> = {
  blocking: { badge: 'danger',  label: 'Blocking' },
  high:     { badge: 'warning', label: 'High impact' },
  medium:   { badge: 'default', label: 'Medium' },
  low:      { badge: 'default', label: 'Low' },
};

/**
 * Derives an ordered, actionable punch list from the raw analysis payload.
 * Creators open the report asking "what do I fix first?" — this answers that
 * before they scroll through six separate audit sections.
 */
function deriveFixes(p: ProjectData): Fix[] {
  const fixes: Fix[] = [];

  p.scriptIssues.forEach((issue) => {
    // Prefer the model's own reviewSeverity + monetization impact — falls back to
    // legacy severity for older reports written before those fields existed.
    let impact: Impact = 'low';
    if (issue.monetizationImpact === 'demonetized' || issue.reviewSeverity === 'critical') impact = 'blocking';
    else if (issue.monetizationImpact === 'demoted' || issue.reviewSeverity === 'warning' || issue.severity === 'high') impact = 'high';
    else if (issue.severity === 'medium') impact = 'medium';

    const gainParts: string[] = [];
    if (issue.estimatedMetricImpact) {
      gainParts.push(issue.estimatedMetricImpact);
    } else {
      if (issue.viralityImpact === 'boost') gainParts.push('↑ virality');
      if (issue.monetizationImpact === 'demonetized') gainParts.push('avoids demonetization');
      else if (issue.monetizationImpact === 'demoted') gainParts.push('restores CPM');
      if (gainParts.length === 0) gainParts.push(issue.type === 'weak-hook' ? '+12 pts hook' : '+6 pts authenticity');
    }

    fixes.push({
      id: `script-${issue.id}`,
      impact,
      area: 'Script',
      icon: Search,
      problem: issue.text.length > 120 ? `${issue.text.slice(0, 120)}…` : issue.text,
      action: issue.specific_fix ?? issue.suggestion,
      gain: gainParts.join(' · '),
      reasoning: issue.reasoning,
    });
  });

  if (p.hookAnalysis.first30SecRetention < 70) {
    fixes.push({
      id: 'hook-retention',
      impact: 'high',
      area: 'Hook',
      icon: Flame,
      problem: p.hookAnalysis.hookDropoffReason,
      action: p.hookAnalysis.recommendedHooks[0] ?? 'Open with the payoff, then explain.',
      gain: `+${Math.max(8, 78 - p.hookAnalysis.first30SecRetention)} pts retention`,
    });
  }

  if (p.voiceAnalysis.syntheticArtifactRisk !== 'Low' || p.voiceAnalysis.isMonotone === true) {
    fixes.push({
      id: 'voice-artifacts',
      impact: p.voiceAnalysis.syntheticArtifactRisk === 'High' ? 'high' : 'medium',
      area: 'Voice',
      icon: Mic,
      problem: p.voiceAnalysis.isMonotone === true
        ? 'Delivery reads as monotone, which correlates with early drop-off.'
        : 'Synthetic voice artifacts detected — may trigger AI-disclosure review.',
      action: p.voiceAnalysis.recommendations[0] ?? 'Re-record with wider pitch variation.',
      gain: '+9 pts authenticity',
    });
  }

  if (p.copyrightAnalysis.musicMatchRisk !== 'Low') {
    fixes.push({
      id: 'copyright-music',
      impact: p.copyrightAnalysis.musicMatchRisk === 'High' ? 'blocking' : 'high',
      area: 'Copyright',
      icon: ShieldAlert,
      problem: `Background audio has ${p.copyrightAnalysis.musicMatchRisk.toLowerCase()} claim risk.`,
      action: p.copyrightAnalysis.recommendations[0] ?? 'Swap the track for a licensed alternative.',
      gain: 'Avoids claim',
    });
  }

  if (p.thumbnailAnalysis.ctrPredictionScore !== null && p.thumbnailAnalysis.ctrPredictionScore < 80) {
    fixes.push({
      id: 'thumbnail-ctr',
      impact: 'medium',
      area: 'Thumbnail',
      icon: ImageIcon,
      problem: `Predicted CTR is ${p.thumbnailAnalysis.ctrPredictionScore}% — below the ${p.folder} benchmark.`,
      action: p.thumbnailAnalysis.recommendations[0] ?? 'Add a human face with a clear expression.',
      gain: '+14% est. CTR',
    });
  }

  return fixes.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
}

export const PriorityFixes: React.FC<{ project: ProjectData }> = ({ project }) => {
  const fixes = useMemo(() => deriveFixes(project), [project]);
  const [done, setDone] = useState<string[]>([]);

  const toggle = (id: string) =>
    setDone((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const remaining = fixes.length - done.length;
  const blocking = fixes.filter((f) => f.impact === 'blocking' && !done.includes(f.id)).length;

  /** Carry the report's own inputs into a fresh review so re-running is one click. */
  const rerun = () => {
    const qs = new URLSearchParams();
    if (project.title) qs.set('title', project.title);
    if (project.assets?.scriptText) qs.set('script', project.assets.scriptText);
    const platform = project.platformReports?.[0]?.platform;
    if (platform) qs.set('platform', platform);
    const suffix = qs.toString();
    window.location.href = `/upload${suffix ? `?${suffix}` : ''}`;
  };

  if (fixes.length === 0) {
    return (
      <div className="rounded-2xl border border-grass-100 bg-grass-50/50 p-6 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-grass-500 text-white flex items-center justify-center shrink-0">
          <Check className="w-4 h-4" strokeWidth={3} />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Nothing to fix</h2>
          <p className="text-sm text-ink-700 mt-1.5 max-w-xl leading-relaxed">
            Every layer passed without a recommended change. That is rare — ship it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <ListChecks className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Fix these first
            </h2>
            <p className="text-sm text-ink-500 mt-1 max-w-xl">
              Ranked by impact on monetization and reach. Work top-down — you can stop when the
              remaining items stop mattering to you.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {blocking > 0 && <Badge variant="danger" dot>{blocking} blocking</Badge>}
          <Badge variant="outline">
            {remaining === 0 ? 'All handled' : `${remaining} of ${fixes.length} left`}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-white/[0.08]">
        <div
          className="h-full bg-brand-600 transition-all duration-500"
          style={{ width: `${(done.length / fixes.length) * 100}%` }}
        />
      </div>

      {/* Fix list */}
      <ol className="divide-y divide-ink-100">
        {fixes.map((fix, i) => {
          const Icon = fix.icon;
          const isDone = done.includes(fix.id);
          const style = IMPACT_STYLE[fix.impact];

          return (
            <li
              key={fix.id}
              className={clsx(
                'p-5 sm:p-6 transition-colors',
                isDone ? 'bg-white/[0.03]' : 'hover:bg-white/[0.06]/40',
              )}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggle(fix.id)}
                  aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                  className={clsx(
                    'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all',
                    isDone
                      ? 'bg-brand-600 border-brand-600 text-[#060606]'
                      : 'border-white/[0.16] hover:border-brand-600 bg-white/[0.04]',
                  )}
                >
                  {isDone && <Check className="w-3 h-3" strokeWidth={3.5} />}
                </button>

                <div className={clsx('flex-1 min-w-0', isDone && 'opacity-55')}>
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded-md bg-white/[0.06] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    <Badge variant={style.badge}>{style.label}</Badge>
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-600">
                      <Icon className="w-3 h-3" /> {fix.area}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-grass-700 ml-auto">
                      <TrendingUp className="w-3 h-3" /> {fix.gain} <span className="text-ink-400 font-normal">(estimated)</span>
                    </span>
                  </div>

                  {/* Problem */}
                  <p className={clsx(
                    'text-[14px] text-ink-900 mt-2.5 leading-relaxed',
                    isDone && 'line-through decoration-ink-400',
                  )}>
                    {fix.problem}
                  </p>

                  {/* Reasoning */}
                  {fix.reasoning && (
                    <p className={clsx(
                      'text-[13px] text-ink-600 mt-1.5 leading-relaxed',
                      isDone && 'opacity-55'
                    )}>
                      <span className="font-medium text-ink-700">Why:</span> {fix.reasoning}
                    </p>
                  )}

                  {/* Action */}
                  <div className="mt-3 rounded-xl border border-ink-200 bg-surface-canvas p-3.5">
                    <div className="text-[11px] font-semibold text-ink-500 mb-1.5">
                      How
                    </div>
                    <p className="text-[13px] text-ink-700 leading-relaxed">{fix.action}</p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Footer */}
      <div className="p-5 border-t border-ink-200 bg-surface-canvas flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-[12.5px] text-ink-600 flex items-center gap-2">
          {remaining === 0 ? (
            <>
              <Check className="w-3.5 h-3.5 text-grass-700" />
              All fixes handled — re-run the review to confirm the new scores.
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              Applying all {remaining} would raise your overall score to roughly{' '}
              <span className="font-semibold text-ink-900 tabular-nums">
                {project.insights?.scorePotential ?? Math.min(99, project.scores.overall + remaining * 3)}
              </span>.
            </>
          )}
        </div>
        <Button size="sm" variant="secondary" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={rerun}>
          Re-run review
        </Button>
      </div>
    </div>
  );
};
