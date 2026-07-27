'use client';

import React, { useState } from 'react';
import {
  Search, Hash, Copy, Check, Sparkles, ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SEOAnalysis, mockSEO } from '@/lib/ai/seo-engine';
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
  const [title, setTitle] = useState('How I Made $10k in 30 Days With My AI Side Hustle');
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('YouTube');
  const [analysis, setAnalysis] = useState<SEOAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, platform }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SEOAnalysis;
      setAnalysis(data);
    } catch (err) {
      console.error('[seo]', err);
      setAnalysis(mockSEO(title, platform));
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 1800);
  };

  return (
    <div className="space-y-8 animate-enter max-w-4xl mx-auto">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Tool</div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">SEO engine</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Generate high-CPM titles, tags, and descriptions tuned to a specific platform&apos;s algorithm.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7">
            <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">Video title or topic</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-ink-200 rounded-lg px-3 h-10 text-[13.5px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as typeof PLATFORMS[number])}
              className="w-full bg-white border border-ink-200 rounded-lg px-3 h-10 text-[13.5px] focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            >
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end">
            <Button
              full
              size="lg"
              isLoading={loading}
              onClick={handleAnalyze}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            >
              Analyze
            </Button>
          </div>
        </div>
      </Card>

      {analysis && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            {[
              { label: 'SEO score',        value: analysis.seoScore },
              { label: 'Keyword strength', value: analysis.keywordScore },
              { label: 'CPM potential',    value: analysis.cpmPotential },
              { label: 'CTR prediction',   value: analysis.ctrPrediction },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="text-[11.5px] font-medium text-ink-500">{s.label}</div>
                <div className={`text-[26px] font-semibold tabular-nums tracking-tight mt-2 ${
                  s.value >= 85 ? 'text-grass-700' : s.value >= 70 ? 'text-amber-700' : 'text-crimson-700'
                }`}>
                  {s.value}
                </div>
                <div className="mt-3 h-1 w-full bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      s.value >= 85 ? 'bg-grass-500' : s.value >= 70 ? 'bg-amber-500' : 'bg-crimson-500'
                    }`}
                    style={{ width: `${s.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-ink-500" />
              <h3 className="text-sm font-semibold text-ink-900">Optimized titles</h3>
            </div>
            <div className="space-y-2">
              {analysis.optimizedTitles.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200">
                  <span className="text-[13.5px] text-ink-800 leading-relaxed">{t}</span>
                  <button
                    onClick={() => copyText(t, `title-${i}`)}
                    className="text-ink-400 hover:text-ink-900 transition-colors shrink-0"
                    aria-label="Copy title"
                  >
                    {copied === `title-${i}` ? <Check className="w-4 h-4 text-grass-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-ink-500" />
                <h3 className="text-sm font-semibold text-ink-900">Suggested tags</h3>
              </div>
              <Badge variant="outline">{platform}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => copyText(tag, `tag-${i}`)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-ink-100 hover:bg-ink-200 text-[12px] font-medium text-ink-800 transition-colors"
                >
                  <Hash className="w-3 h-3 text-ink-400" />
                  {tag}
                  {copied === `tag-${i}` && <Check className="w-3 h-3 text-grass-600" />}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-900">Generated description</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(analysis.description, 'desc')}
                leftIcon={copied === 'desc' ? <Check className="w-3.5 h-3.5 text-grass-600" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied === 'desc' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="rounded-xl bg-surface-canvas border border-ink-200 p-4 text-[13px] text-ink-700 leading-relaxed whitespace-pre-line font-mono">
              {analysis.description}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
