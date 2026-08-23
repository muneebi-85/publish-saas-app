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
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : null;
  };
  return [
    { label: 'Monetization', value: num(scores.monetization) },
    { label: 'Retention', value: num(scores.hook) },
    { label: 'Copyright', value: num(scores.copyright) },
    { label: 'Brand safety', value: num(scores.brandSafety) },
    { label: 'SEO', value: num(scores.seo) },
    { label: 'Authenticity', value: num(scores.humanAuthenticity) },
  ];
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const row = await prisma.analysisReport.findUnique({ where: { id: params.id } });
  if (!row) notFound();

  const host = headers().get('x-forwarded-host') ?? headers().get('host') ?? 'localhost:3000';
  const proto = headers().get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  const score = Math.max(0, Math.min(100, row.overallScore));
  const band =
    score >= 90 ? 'Excellent' : score >= 80 ? 'Strong' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs work';
  const layers = layerScores(row.report);

  return (
    <main className="min-h-screen bg-[#070B0D] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[560px]">
        {/* Card */}
        <div className="rounded-3xl border border-white/[0.08] bg-surface-panel overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          <div className="px-8 pt-8 pb-6 border-b border-ink-200">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-brand-600">
              <ShieldCheck className="w-4 h-4" />
              Publish Score<span className="align-super text-[8px]">™</span>
            </div>
            <div className="flex items-center gap-6 mt-5">
              <ScoreGauge score={score} size="xl" label="" />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[20px] font-bold tracking-tight text-ink-900 leading-snug line-clamp-3">
                  {row.title || 'Untitled upload'}
                </h1>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant={score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger'}>
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
                  <div className="text-[10.5px] font-semibold text-ink-500">{layer.label}</div>
                  <div
                    className={`font-display text-[22px] font-bold tabular-nums mt-1 ${
                      layer.value === null
                        ? 'text-ink-400'
                        : layer.value >= 80
                          ? 'text-grass-700'
                          : layer.value >= 55
                            ? 'text-amber-700'
                            : 'text-crimson-700'
                    }`}
                  >
                    {layer.value === null ? '—' : layer.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 mt-5 text-[11.5px] text-ink-500 leading-relaxed">
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
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.12] px-5 text-[13.5px] font-bold text-white transition-colors hover:border-white/[0.24]"
            >
              Run your own free review <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
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
