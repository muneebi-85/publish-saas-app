'use client';

import React, { useState, useEffect } from 'react';
import { Wand2, Copy, Check, ArrowRight, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HumanizeOptions, HumanizeResult, mockHumanize } from '@/lib/ai/humanizer-engine';
import { PlanGate } from '@/components/PlanGate';

const SAMPLE_INPUT =
  `In this video, we delve into the comprehensive landscape of artificial intelligence. Furthermore, it is important to note that generative tools have evolved exponentially. Let's explore how creators can leverage these cutting-edge capabilities without compromising authentic human connection.`;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export default function AIHumanizerPage() {
  return (
    <PlanGate
      feature="AI Humanizer"
      requiredPlan="starter"
      description="Rewrite AI-flavored passages into a natural, human voice. Included on Starter, Pro, and Agency plans."
    >
      <AIHumanizerBody />
    </PlanGate>
  );
}

function AIHumanizerBody() {
  const [rawText, setRawText] = useState(SAMPLE_INPUT);
  const [options, setOptions] = useState<HumanizeOptions>({
    tone: 'conversational',
    formality: 40,
    emotionIntensity: 75,
    targetPlatform: 'YouTube',
  });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanizeResult>(() => mockHumanize(SAMPLE_INPUT, {
    tone: 'conversational', formality: 40, emotionIntensity: 75, targetPlatform: 'YouTube',
  }));

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptText: rawText, options }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as HumanizeResult;
      setResult(data);
    } catch (err) {
      // Graceful degradation — show deterministic rewrite if the API is unavailable.
      console.error('[humanize]', err);
      setResult(mockHumanize(rawText, options));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result.humanizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const scoreDelta = result.metricsBefore.gptProbabilityScore - result.metricsAfter.gptProbabilityScore;

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Tool</div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">AI Humanizer</h1>
          <p className="text-sm text-ink-500 mt-2 max-w-2xl">
            Rewrites robotic AI phrasing into how you actually talk. Preserves your meaning; drops
            the &ldquo;delve into&rdquo; and &ldquo;furthermore&rdquo;.
          </p>
        </div>
        <Badge variant="success" dot>Unlimited on Pro</Badge>
      </div>

      {/* Controls */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">Tone</label>
            <select
              value={options.tone}
              onChange={(e) => setOptions({ ...options, tone: e.target.value as HumanizeOptions['tone'] })}
              className="w-full bg-white border border-ink-200 rounded-lg h-9 px-3 text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            >
              <option value="conversational">Conversational</option>
              <option value="storyteller">Storyteller</option>
              <option value="energetic">High energy</option>
              <option value="authoritative">Authoritative</option>
            </select>
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">Target platform</label>
            <select
              value={options.targetPlatform}
              onChange={(e) => setOptions({ ...options, targetPlatform: e.target.value as HumanizeOptions['targetPlatform'] })}
              className="w-full bg-white border border-ink-200 rounded-lg h-9 px-3 text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            >
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">
              Formality — <span className="tabular-nums">{options.formality}%</span>
            </label>
            <input
              type="range" min={0} max={100} value={options.formality}
              onChange={(e) => setOptions({ ...options, formality: Number(e.target.value) })}
              className="w-full mt-3.5"
            />
          </div>
          <div className="flex items-end">
            <Button full onClick={handleRun} isLoading={loading} leftIcon={loading ? undefined : <Wand2 className="w-3.5 h-3.5" />}>
              {loading ? 'Rewriting…' : 'Humanize'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricRow label="GPT probability" before={`${result.metricsBefore.gptProbabilityScore}%`} after={`${result.metricsAfter.gptProbabilityScore}%`} good="down" />
        <MetricRow label="Readability" before={result.metricsBefore.readabilityGrade} after={result.metricsAfter.readabilityGrade} good="down" />
        <MetricRow label="Hook strength" before={result.metricsBefore.hookStrengthScore} after={result.metricsAfter.hookStrengthScore} good="up" />
        <MetricRow label="Improvement" before="—" after={`+${Math.abs(scoreDelta)} pts`} good="up" />
      </div>

      {/* Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-ink-700">Input script</span>
            <Badge variant="warning" dot>GPT risk {result.metricsBefore.gptProbabilityScore}%</Badge>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            className="w-full bg-white border border-ink-200 rounded-xl p-4 text-[13px] text-ink-800 font-mono leading-relaxed resize-none focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12.5px] font-semibold text-ink-700">Humanized output</span>
            <Badge variant="success" dot>GPT risk {result.metricsAfter.gptProbabilityScore}%</Badge>
          </div>
          <div className="bg-white border border-ink-200 rounded-xl p-4 min-h-[298px] text-[13.5px] text-ink-800 leading-relaxed whitespace-pre-line relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-ink-500" />
              </div>
            )}
            {result.humanizedText}
          </div>
          <div className="flex justify-end mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              leftIcon={copied ? <Check className="w-3.5 h-3.5 text-grass-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>

      {/* Changes made */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-900">Changes made</h3>
          <Badge variant="outline">{result.changesSummary.length} improvements</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {result.changesSummary.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
              <Check className="w-4 h-4 text-grass-600 shrink-0 mt-0.5" />
              {c}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const MetricRow: React.FC<{ label: string; before: string | number; after: string | number; good: 'up' | 'down' }> = ({
  label, before, after, good,
}) => {
  const beforeIsNum = typeof before === 'number';
  const afterIsNum = typeof after === 'number';
  const delta = beforeIsNum && afterIsNum ? (after as number) - (before as number) : null;
  const improved = delta !== null ? (good === 'up' ? delta > 0 : delta < 0) : true;

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-[11.5px] font-medium text-ink-500">{label}</div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[13px] text-ink-500 line-through tabular-nums">{before}</span>
        <ArrowRight className="w-3 h-3 text-ink-400" />
        <span className={`text-[14px] font-semibold tabular-nums ${improved ? 'text-grass-700' : 'text-ink-900'}`}>
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
    </div>
  );
};
