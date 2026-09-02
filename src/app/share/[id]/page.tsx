import React from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { Badge } from '@/components/ui/Badge';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { ChallengeCTA } from '@/components/challenge/ChallengeCTA';
import { ShareActions } from '@/components/share/ShareActions';
import { scoreBand, SCORE_BAND_UI } from '@/lib/score-band';

export const dynamic = 'force-dynamic';

/**
 * Public share page — the score card a creator posts to Discord, X, or a
 * community. It deliberately renders ONLY the score, the title, and the
 * platform. The script, the fixes, and every private layer of the report stay
 * behind the auth wall; nothing on this page is data a creator did not choose
 * to expose by sharing the link.
 *
 * The route is public (middleware), and the page is noindexed — share links are
 * meant to be shared, not crawled.
 */

function layerScores(report: unknown): { label: string; value: number | null }[] {
  const obj =
    report !== null && typeof report === 'object' && !Array.isArray(report)
      ? (report as Record<string, unknown>)
      : {};
  const scores =
    obj.scores !== null && typeof obj.scores === 'object' && !Array.isArray(obj.scores)
      ? (obj.scores as Record<string, unknown>)
      : {};
  const num = (v: unknown): number | null => {
    // Explicit null check first: `Number(null)` is 0, which would print a
    // measured-looking 0 for a layer that never ran.
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : null;
  };
  // "Retention" must print the same number the private report header prints:
  // the hook layer's first30SecRetention reading, falling back to the
  // first10-based `scores.hook` only when the 30s reading is absent — the
  // orchestrator stores the 10-second number under scores.hook, so reading it
  // directly would show the public card a different "Retention" than the
  // creator's own dashboard for the same review.
  const hook =
    obj.hookAnalysis !== null && typeof obj.hookAnalysis === 'object' && !Array.isArray(obj.hookAnalysis)
      ? (obj.hookAnalysis as Record<string, unknown>)
      : {};
  const retention =
    hook.analyzed !== false ? num(hook.first30SecRetention) ?? num(scores.hook) : null;
  return [
    { label: 'Monetization', value: num(scores.monetization) },
    { label: 'Retention', value: retention },
    { label: 'Copyright', value: num(scores.copyright) },
    { label: 'Brand safety', value: num(scores.brandSafety) },
    { label: 'SEO', value: num(scores.seo) },
    { label: 'Authenticity', value: num(scores.humanAuthenticity) },
  ];
}

export default async function SharePage({ params }: { params: { id: string } }) {
  // Opt-in gate: a report is publicly viewable only after its creator clicked
  // "Share score" (sharedAt stamped). Anything else resolves to 404 — the same
  // id that identifies the private /analysis/<id> page must not open a public
  // page just because someone holds it.
  const row = await prisma.analysisReport.findFirst({
    where: { id: params.id, sharedAt: { not: null } },
  });
  if (!row) notFound();

  const host = headers().get('x-forwarded-host') ?? headers().get('host') ?? 'localhost:3000';
  const proto = headers().get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  const score = Math.max(0, Math.min(100, row.overallScore));
  // The shared bands — the public card must not grade a 76 "Strong" while the
  // app's gauge calls the same score "Fair".
  const band = SCORE_BAND_UI[scoreBand(score)].label;
  const layers = layerScores(row.report);

  return (
    <main className="min-h-screen bg-[#070B0D] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[560px]">
        {/* Card */}
        <div className="rounded-xl border border-ink-200 bg-surface-panel overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          <div className="px-8 pt-8 pb-6 border-b border-ink-200">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-brand-600">
              <ShieldCheck className="w-4 h-4" />
              Publish Score<span className="align-super text-[8px]">™</span>
            </div>
            <div className="flex items-center gap-6 mt-5">
              <ScoreGauge score={score} size="xl" label="" />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-ink-900 leading-snug line-clamp-3">
                  {row.title || 'Untitled upload'}
                </h1>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant={SCORE_BAND_UI[scoreBand(score)].badge}>
                    {band}
                  </Badge>
                  <Badge variant="outline">{row.targetPlatform}</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink-200 rounded-xl overflow-hidden">
              {layers.map((layer) => (
                <div key={layer.label} className="bg-surface-panel p-3.5">
                  <div className="text-[11px] font-semibold text-ink-500">{layer.label}</div>
                  <div
                    className={`font-display text-[24px] font-semibold tabular-nums mt-1 ${
                      layer.value === null
                        ? 'text-ink-400'
                        : SCORE_BAND_UI[scoreBand(layer.value)].text
                    }`}
                  >
                    {layer.value === null ? '—' : layer.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 mt-5 text-[12px] text-ink-500 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-600" />
              <span>
                Publish Score is a pre-publish quality check across six review layers — script, hook,
                voice, thumbnail, copyright and SEO. It is not a guarantee of views or revenue.
              </span>
            </div>
          </div>
        </div>

        {/* Challenge + share actions */}
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <ChallengeCTA reportId={row.id} />
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-300 bg-surface-panel px-3.5 text-[13px] font-medium text-ink-900 shadow-xs transition-colors hover:bg-ink-50 hover:border-ink-400"
            >
              Run your own free review <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
            <ShareActions reportId={row.id} title={row.title || 'Untitled upload'} score={score} platform={row.targetPlatform} origin={origin} />
          </div>
        </div>
      </div>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
