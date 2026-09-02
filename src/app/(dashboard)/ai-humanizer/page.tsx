'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Wand2, Copy, Check, ArrowRight, TrendingDown, TrendingUp, Loader2,
  AlertTriangle, Info, ShieldCheck, Gauge, Sparkles, Palette,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HumanizeOptions, HumanizeResult } from '@/lib/ai/humanizer-engine';
import { ScriptOptimizerReport, ScriptSignal, SignalBand } from '@/lib/ai/script-optimizer-engine';
import { PlanGate } from '@/components/PlanGate';

type OptimizeResponse = HumanizeResult & { report: ScriptOptimizerReport };

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

/**
 * `/api/optimize` rejects a script under 10 characters with a 400. Gating the
 * button on the same threshold means the creator is never sent to the server to
 * be told no — and never spends a rate-limit slot finding out.
 */
const MIN_SCRIPT_CHARS = 10;

export default function ScriptOptimizerPage() {
  return (
    <PlanGate
      feature="Creator Script Optimizer"
      requiredPlan="pro"
      description="Grade your script across 12 revenue signals before you record, then rewrite the weak spots in one pass. Included on every paid plan."
    >
      {/* Suspense: useSearchParams must sit below a boundary for prerendered pages. */}
      <Suspense fallback={null}>
        <ScriptOptimizerBody />
      </Suspense>
    </PlanGate>
  );
}

function ScriptOptimizerBody() {
  const searchParams = useSearchParams();
  // Starts empty. Seeding the box with a specimen script means the first
  // "Optimize" a creator clicks grades our text, not theirs — and spends one of
  // their rate-limited calls doing it.
  const [rawText, setRawText] = useState('');
  const [options, setOptions] = useState<HumanizeOptions>({
    tone: 'conversational',
    formality: 40,
    emotionIntensity: 75,
    targetPlatform: 'YouTube',
  });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handoff from a report's "Open in humanizer" — preload the actual script.
  useEffect(() => {
    const script = searchParams.get('script');
    if (script) setRawText(script.slice(0, 15000));
  }, [searchParams]);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptText: rawText, options }),
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const errData = (await res.json()) as { error?: unknown };
          if (typeof errData.error === 'string' && errData.error) msg = errData.error;
        } catch {
          // A non-JSON body (a proxy error page, an aborted response) leaves the
          // status-code message as the best thing we can honestly show.
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as OptimizeResponse;
      setResult(data);
    } catch (err) {
      console.error('[optimize]', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.humanizedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused — never flash a false "Copied".
    }
  };

  const scoreDelta = result ? result.metricsBefore.gptProbabilityScore - result.metricsAfter.gptProbabilityScore : 0;
  const report = result?.report;

  return (
    <div className="animate-enter">
      <PageHeader
        title="Creator Script Optimizer"
        subtitle="Your pre-record quality check — grade the script across 12 revenue signals, then fix the weak spots."
        actions={<Badge variant="ink" dot>Pro</Badge>}
        showUtility
      />

      <div className="space-y-6">
        {/* Controls */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[13px] font-medium text-ink-700 block mb-1.5">Tone</label>
              <select
                value={options.tone}
                onChange={(e) => setOptions({ ...options, tone: e.target.value as HumanizeOptions['tone'] })}
                className="w-full bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              >
                <option value="conversational">Conversational</option>
                <option value="storyteller">Storyteller</option>
                <option value="energetic">High energy</option>
                <option value="authoritative">Authoritative</option>
              </select>
            </div>
            <div>
              <label className="text-[13px] font-medium text-ink-700 block mb-1.5">Target platform</label>
              <select
                value={options.targetPlatform}
                onChange={(e) => setOptions({ ...options, targetPlatform: e.target.value as HumanizeOptions['targetPlatform'] })}
                className="w-full bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              >
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13px] font-medium text-ink-700 block mb-1.5">
                Formality — <span className="tabular-nums text-ink-900">{options.formality}%</span>
              </label>
              <input
                type="range" min={0} max={100} value={options.formality}
                onChange={(e) => setOptions({ ...options, formality: Number(e.target.value) })}
                className="w-full mt-4 accent-brand-600"
              />
            </div>
            <div className="flex items-end">
              <Button
                full
                onClick={handleRun}
                isLoading={loading}
                disabled={rawText.trim().length < MIN_SCRIPT_CHARS}
                leftIcon={loading ? undefined : <Wand2 className="w-4 h-4" />}
              >
                {loading ? 'Analyzing…' : 'Optimize script'}
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <div className="bg-crimson-50 border border-crimson-200 text-crimson-700 p-4 rounded-xl text-[13px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Optimization failed</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Script Score verdict */}
        {report && (
          <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="shrink-0 sm:pr-6 sm:border-r sm:border-ink-200">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <Gauge className="w-3.5 h-3.5" /> Script Score
                </div>
                <div className="flex items-end gap-3 mt-1.5">
                  <span className={`font-display text-[48px] leading-[0.9] font-semibold tabular-nums tracking-[-0.025em] ${scoreTone(report.overall).num}`}>
                    {report.overall}
                  </span>
                  <span className="text-[13px] font-semibold text-ink-900 pb-1.5">{report.headline}</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-4 text-center sm:text-left">
                <Stat label="Words" value={report.wordCount.toString()} />
                <Stat label="Est. read time" value={`${Math.floor(report.estimatedReadSeconds / 60)}:${String(report.estimatedReadSeconds % 60).padStart(2, '0')}`} />
                <Stat label="Signals graded" value={`${report.signals.filter((s) => s.score !== null).length}/12`} />
              </div>
            </div>
          </div>
        )}

        {/* 12-signal QC grid */}
        {report && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">Pre-publish signals</h3>
              <span className="text-[12px] text-ink-500">Every one tied to reach, retention, or revenue</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.signals.map((sig) => <SignalCard key={sig.key} sig={sig} />)}
            </div>
          </div>
        )}

        {/* Rewrite metrics */}
        {result && (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricRow label="AI-detection risk" before={`${result.metricsBefore.gptProbabilityScore}%`} after={`${result.metricsAfter.gptProbabilityScore}%`} good="down" />
          <MetricRow label="Readability" before={result.metricsBefore.readabilityGrade} after={result.metricsAfter.readabilityGrade} good="down" />
          <MetricRow label="Hook strength" before={result.metricsBefore.hookStrengthScore} after={result.metricsAfter.hookStrengthScore} good="up" />
          <MetricRow label="Improvement" before="—" after={`+${Math.abs(scoreDelta)} pts`} good="up" />
        </div>
        <div className="flex items-start gap-2 text-[12px] text-ink-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Scores are estimates from the script text. No rewrite can guarantee content passes every third-party detector or qualifies for monetization.</span>
        </div>
        </>
        )}

        {/* Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-ink-700">Your script</span>
              {result && <Badge variant="warning" dot>Est. AI risk {result.metricsBefore.gptProbabilityScore}%</Badge>}
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              maxLength={15000}
              aria-label="Your script"
              aria-describedby="script-input-hint"
              placeholder="Paste your script or voiceover draft here — the full thing, not a summary. Every signal below is graded from this text."
              className="w-full bg-surface-panel border border-ink-300 rounded-lg p-3.5 text-[13px] text-ink-800 leading-relaxed resize-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
            />
            <div id="script-input-hint" className="mt-2 flex items-center justify-between text-[12px] text-ink-500">
              <span>
                {rawText.trim().length < MIN_SCRIPT_CHARS
                  ? `Add at least ${MIN_SCRIPT_CHARS} characters to grade the script.`
                  : 'Graded on the text above. Your script is not saved to your reports.'}
              </span>
              <span className="tabular-nums">{rawText.length.toLocaleString()} / 15,000</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-ink-700">Optimized rewrite</span>
              {result && <Badge variant="success" dot>Est. AI risk {result.metricsAfter.gptProbabilityScore}%</Badge>}
            </div>
            <div className="bg-surface-panel border border-ink-200 rounded-lg p-3.5 min-h-[294px] text-[13px] text-ink-800 leading-relaxed whitespace-pre-line relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-scrim backdrop-blur-sm rounded-lg z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                </div>
              )}
              {result ? result.humanizedText : <span className="text-ink-400">Run the optimizer to grade your script and see the rewrite…</span>}
            </div>
            <div className="flex justify-end mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                leftIcon={copied ? <Check className="w-3.5 h-3.5 text-grass-700" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        {/* Changes made */}
        {result && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">Rewrite changes</h3>
            <Badge variant="outline">{result.changesSummary.length} edits</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.changesSummary.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
                <Check className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
                {c}
              </div>
            ))}
          </div>
        </Card>
        )}

        {/* Brand kit application — only rendered when the caller actually has a
            kit saved. `bannedRemaining` is shown rather than hidden: claiming a
            forbidden word was removed without checking is exactly the kind of
            unverified promise this product does not make. */}
        {result?.brandVoice && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-brand-600" />
              <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
                Your brand kit
              </h3>
            </div>
            <div className="space-y-2.5 text-[13px]">
              {result.brandVoice.tonesApplied.length > 0 && (
                <p className="text-ink-700">
                  Rewritten toward your saved tone
                  {result.brandVoice.tonesApplied.length > 1 ? 's' : ''}:{' '}
                  <span className="font-medium text-ink-900">
                    {result.brandVoice.tonesApplied.join(', ')}
                  </span>
                  .
                </p>
              )}
              {result.brandVoice.bannedChecked > 0 &&
                (result.brandVoice.bannedRemaining.length === 0 ? (
                  <p className="flex items-start gap-2 text-ink-700">
                    <Check className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
                    <span>
                      Checked the rewrite against all {result.brandVoice.bannedChecked} of your
                      banned words — none appear in the draft above.
                    </span>
                  </p>
                ) : (
                  <p
                    role="alert"
                    className="flex items-start gap-2 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      Still contains{' '}
                      <span className="font-medium">
                        {result.brandVoice.bannedRemaining.map((w) => `“${w}”`).join(', ')}
                      </span>{' '}
                      from your banned list. Replacing {result.brandVoice.bannedRemaining.length > 1 ? 'them' : 'it'}{' '}
                      would mean choosing wording for you, so edit the draft directly or re-run the
                      rewrite.
                    </span>
                  </p>
                ))}
            </div>
            <p className="text-[12px] text-ink-500 mt-3">
              Edit these in{' '}
              <Link href="/brand-kit" className="font-medium text-brand-600 hover:underline">
                Brand Kit
              </Link>
              .
            </p>
          </Card>
        )}

        <div className="flex items-start gap-2 text-[11px] text-ink-500">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-400" />
          <span>The Script Score is a pre-record quality check derived from your text. It is not a guarantee of views, monetization, or that a video will pass automated review.</span>
        </div>
      </div>
    </div>
  );
}

const scoreTone = (v: number) =>
  v >= 80 ? { num: 'text-grass-700', bar: 'bg-grass-600', chip: 'success' as const } :
  v >= 60 ? { num: 'text-amber-700', bar: 'bg-amber-600', chip: 'warning' as const } :
            { num: 'text-crimson-700', bar: 'bg-crimson-600', chip: 'danger' as const };

const bandChip: Record<SignalBand, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  good: { label: 'Good', variant: 'success' },
  warn: { label: 'Improve', variant: 'warning' },
  risk: { label: 'At risk', variant: 'danger' },
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">{label}</div>
    <div className="text-[18px] font-semibold text-ink-900 tabular-nums mt-0.5">{value}</div>
  </div>
);

const SignalCard: React.FC<{ sig: ScriptSignal }> = ({ sig }) => {
  const measured = sig.score !== null;
  const tone = measured ? scoreTone(sig.score as number) : { num: 'text-ink-400', bar: 'bg-ink-300', chip: 'outline' as const };
  const chip = bandChip[sig.band];
  return (
    <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-900">{sig.label}</span>
        <div className="flex items-center gap-2">
          {measured
            ? <Badge variant={chip.variant} dot>{chip.label}</Badge>
            : <Badge variant="outline">Estimate</Badge>}
          <span className={`font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums leading-none ${tone.num}`}>
            {measured ? sig.score : '—'}
          </span>
        </div>
      </div>
      <div className="relative mt-2.5 h-1 w-full bg-ink-100 rounded-full">
        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${measured ? sig.score : 0}%` }} />
      </div>
      <p className="text-[12px] text-ink-600 leading-relaxed mt-3">{sig.finding}</p>
      <div className="flex items-start gap-2 mt-2.5 pt-2.5 border-t border-ink-200 text-[12px] text-ink-800 leading-relaxed">
        <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-600" />
        <span><span className="font-semibold text-ink-900">Fix:</span> {sig.fix}</span>
      </div>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; before: string | number; after: string | number; good: 'up' | 'down' }> = ({
  label, before, after, good,
}) => {
  const beforeIsNum = typeof before === 'number';
  const afterIsNum = typeof after === 'number';
  const delta = beforeIsNum && afterIsNum ? (after as number) - (before as number) : null;
  const improved = delta !== null ? (good === 'up' ? delta > 0 : delta < 0) : true;

  return (
    <Card padded={false} className="p-4">
      <div className="text-[12px] font-semibold text-ink-600">{label}</div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[13px] text-ink-500 line-through tabular-nums">{before}</span>
        <ArrowRight className="w-3 h-3 text-ink-400" />
        <span className={`text-[16px] font-semibold tabular-nums ${improved ? 'text-grass-700' : 'text-ink-900'}`}>
          {after}
        </span>
      </div>
      <div className="text-[11px] text-ink-500 mt-1.5 flex items-center gap-1">
        {improved ? (
          <><TrendingUp className="w-3 h-3 text-grass-600" /> Improved</>
        ) : (
          <><TrendingDown className="w-3 h-3 text-ink-400" /> Held steady</>
        )}
      </div>
    </Card>
  );
};
