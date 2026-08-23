'use client';

import React, { useState } from 'react';
import {
  Search, Hash, Copy, Check, Sparkles, AlertTriangle, Info
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { SEOAnalysis } from '@/lib/ai/seo-engine';
import { PlanGate } from '@/components/PlanGate';

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export default function SEOPage() {
  return (
    <PlanGate
      feature="SEO engine"
      requiredPlan="starter"
      description="Generate platform-tuned titles, tags, and descriptions. Included on Starter, Pro, and Agency plans."
    >
      <SEOBody />
    </PlanGate>
  );
}

function SEOBody() {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('YouTube');
  const [analysis, setAnalysis] = useState<SEOAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  const trimmed = title.trim();
  const canAnalyze = trimmed.length >= 3 && !loading;

  const handleAnalyze = async () => {
    if (!canAnalyze) {
      setError('Enter a video title of at least 3 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, platform }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) msg = errData.error;
        } catch {
          /* non-JSON error body — keep the status message */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as SEOAnalysis;
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('Your browser blocked clipboard access — select the text and copy manually.');
    }
  };

  return (
    <div className="animate-enter">
      <PageHeader
        title="SEO Studio"
        subtitle="Optimize titles, descriptions, tags, and keywords to rank higher."
        showUtility
      />

      <div className="space-y-6 max-w-4xl">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <label htmlFor="seo-title" className="text-[13px] font-medium text-ink-700 block mb-1.5">Video title or topic</label>
              <input
                id="seo-title"
                type="text"
                value={title}
                maxLength={200}
                placeholder="Paste the exact title you plan to publish"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl h-11 px-3.5 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
              />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="seo-platform" className="text-[13px] font-medium text-ink-700 block mb-1.5">Platform</label>
              <select
                id="seo-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof PLATFORMS[number])}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl h-11 px-3.5 text-[14px] focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
              >
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <Button
                full
                size="lg"
                isLoading={loading}
                disabled={!canAnalyze}
                onClick={handleAnalyze}
                leftIcon={<Search className="w-4 h-4" />}
              >
                Analyze
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <div className="bg-crimson-50 border border-crimson-200 text-crimson-700 px-4 py-3 rounded-xl text-[13px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Analysis failed</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {analysis && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
              {[
                { label: 'SEO score',        value: analysis.seoScore },
                { label: 'Keyword strength', value: analysis.keywordScore },
                { label: 'CPM potential',    value: analysis.cpmPotential },
                { label: 'CTR prediction',   value: analysis.ctrPrediction },
              ].map((s) => (
                <Card key={s.label} padded={false} className="p-5">
                  <div className="text-[12px] font-semibold text-ink-600">{s.label}</div>
                  <div className={`font-display text-[32px] font-bold tabular-nums tracking-tight mt-1 ${
                    s.value >= 85 ? 'text-brand-600' : s.value >= 70 ? 'text-amber-700' : 'text-crimson-700'
                  }`}>
                    {s.value}
                  </div>
                  <div className="mt-3 h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        s.value >= 85 ? 'bg-brand-600' : s.value >= 70 ? 'bg-amber-500' : 'bg-crimson-500'
                      }`}
                      style={{ width: `${s.value}%` }}
                    />
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex items-start gap-2 text-[12px] text-ink-500">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Scores and CPM/CTR figures are estimates generated from historical platform signals, not guarantees of ranking or revenue.</span>
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-brand-600" />
                <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">Optimized titles</h3>
              </div>
              <div className="space-y-2">
                {analysis.optimizedTitles.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200">
                    <span className="text-[14px] text-ink-800 leading-relaxed">{t}</span>
                    <button
                      onClick={() => copyText(t, `title-${i}`)}
                      className="text-ink-400 hover:text-white transition-colors shrink-0"
                      aria-label="Copy title"
                    >
                      {copied === `title-${i}` ? <Check className="w-4 h-4 text-brand-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-brand-600" />
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">Suggested tags</h3>
                </div>
                <Badge variant="outline">{platform}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.tags.map((tag, i) => (
                  <button
                    key={i}
                    onClick={() => copyText(tag, `tag-${i}`)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.09] text-[12px] font-medium text-ink-800 transition-colors"
                  >
                    <Hash className="w-3 h-3 text-ink-400" />
                    {tag}
                    {copied === `tag-${i}` && <Check className="w-3 h-3 text-brand-600" />}
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">Generated description</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(analysis.description, 'desc')}
                  leftIcon={copied === 'desc' ? <Check className="w-3.5 h-3.5 text-brand-600" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copied === 'desc' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4 text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                {analysis.description}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
