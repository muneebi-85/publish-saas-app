import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import {
  ArrowUpRight, ArrowRight, UploadCloud, ShieldCheck, Zap, Clock, Sparkles, Play, CheckCircle2, Loader2,
} from 'lucide-react';
import { Card, StatTile } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { TrendCard } from '@/components/analytics/TrendCard';
import { prisma } from '@/lib/db';
import { getUserPlanState, PLAN_LIMITS } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { checkout?: string; pending?: string; upgraded?: string };
}) {
  const { userId: clerkId } = auth();
  if (!clerkId) redirect('/sign-in');

  const user = await prisma.user.findUnique({ where: { clerkId } });
  const state = await getUserPlanState(clerkId);

  const justCheckedOut = searchParams?.checkout === 'complete';
  const planIsPaid = state.plan !== 'free';

  const reports = user
    ? await prisma.analysisReport.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          targetPlatform: true,
          overallScore: true,
          monetizationScore: true,
          createdAt: true,
        },
      })
    : [];

  const chronological = [...reports].reverse();
  const monetizationSeries = chronological.map((r) => r.monetizationScore);
  const overallSeries = chronological.map((r) => r.overallScore);
  const avgMonetization = monetizationSeries.length
    ? Math.round(monetizationSeries.reduce((a, b) => a + b, 0) / monetizationSeries.length)
    : 0;
  const safeCount = reports.filter((r) => r.overallScore >= 85).length;
  const safeRate = reports.length ? Math.round((safeCount / reports.length) * 100) : 0;

  // Post-checkout activation banner: show when redirected from Lemon Squeezy
  // but the webhook hasn't landed yet (plan still 'free') OR has already landed.
  const showActivating = justCheckedOut && !planIsPaid;
  const showActivated  = justCheckedOut && planIsPaid;

  // ── First-run state ───────────────────────────────────
  if (reports.length === 0) {
    return (
      <div className="space-y-8 animate-enter">
        {/* Post-checkout banner */}
        {showActivating && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-50 px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            <p className="text-[13px] text-amber-800">
              <strong>Activating your plan</strong> — this usually takes under 30 seconds. Refresh the page once your plan badge updates in the sidebar.
            </p>
          </div>
        )}
        {showActivated && (
          <div className="flex items-center gap-3 rounded-xl border border-grass-500/20 bg-grass-50 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-grass-600 shrink-0" />
            <p className="text-[13px] text-grass-800">
              <strong>Plan activated.</strong> Your reviews are unlocked — start your first one below.
            </p>
          </div>
        )}
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Home</div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">
            Welcome to Publish.
          </h1>
          <p className="text-sm text-ink-500 mt-2 max-w-xl">
            Get a monetization, policy, and hook review on every video before you publish. Your free plan
            includes one review — start with the video you&apos;re least sure about.
          </p>
        </div>

        <div className="rounded-3xl border border-ink-200 bg-gradient-to-br from-white to-ink-50 p-8 sm:p-12">
          <div className="max-w-2xl">
            <Badge variant="ink" dot>Free plan · 1 review included</Badge>
            <h2 className="mt-4 font-display text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-ink-950">
              Analyze your first video
            </h2>
            <p className="text-[15px] text-ink-600 mt-3 leading-relaxed">
              Drop a title, script, or thumbnail. Every review covers six layers — script authenticity,
              hook retention, voice, thumbnail CTR, copyright exposure, and per-platform policy — in under
              a minute.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/upload">
                <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Start your first review
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="lg" rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                  Compare plans
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: 'Script + hook', body: 'AI-fingerprint detection, virality scoring, weak-opener rewrites.' },
              { title: 'Policy + copyright', body: 'YouTube, TikTok, Meta, LinkedIn — advertiser suitability and claim risk.' },
              { title: 'Trend over time', body: 'Every re-review shows a real trend line for the same project.' },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-ink-200 bg-white p-4">
                <div className="text-[12.5px] font-semibold text-ink-950">{f.title}</div>
                <p className="text-[12.5px] text-ink-600 mt-1.5 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Populated dashboard ───────────────────────────────
  return (
    <div className="space-y-10 animate-enter">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Home</div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">
            Welcome back, {firstName}.
          </h1>
          <p className="text-sm text-ink-500 mt-2 max-w-lg">
            {reports.length} review{reports.length === 1 ? '' : 's'} run · average monetization score{' '}
            <span className="font-semibold text-ink-900 tabular-nums">{avgMonetization}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="secondary" leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>Reports</Button>
          </Link>
          <Link href="/upload">
            <Button leftIcon={<UploadCloud className="w-4 h-4" />}>New review</Button>
          </Link>
        </div>
      </header>

      {/* Trend row — real signal, only shown when there is enough history */}
      {monetizationSeries.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TrendCard label="Monetization" series={monetizationSeries} />
          <TrendCard label="Overall score" series={overallSeries} />
        </div>
      )}

      {/* Stats — evidence-based, computed from real reports */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatTile
          label="Reviews this cycle"
          value={String(state.auditsUsed)}
          hint={<><Sparkles className="w-3 h-3 text-ink-500" /><span>{state.auditsLimit - state.auditsUsed} remaining on {state.plan}</span></>}
        />
        <StatTile
          label="Safe-to-publish rate"
          value={`${safeRate}%`}
          emphasis={safeRate >= 80 ? 'success' : undefined}
          hint={<><ShieldCheck className="w-3 h-3 text-emerald-600" /><span>{safeCount} of {reports.length} scored 85+</span></>}
        />
        <StatTile
          label="Avg. monetization"
          value={String(avgMonetization)}
          hint={<><Zap className="w-3 h-3 text-ink-500" /><span>Across your last {reports.length}</span></>}
        />
        <StatTile
          label="Plan limit"
          value={String(PLAN_LIMITS[state.plan])}
          hint={<><Clock className="w-3 h-3 text-ink-500" /><span>{state.periodEnd ? `resets ${state.periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'monthly cycle'}</span></>}
        />
      </div>

      {/* Recent + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Recent reviews</h2>
            <Link href="/reports" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <Card padded={false}>
            <div className="divide-y divide-ink-100">
              {reports.map((r) => (
                <Link
                  key={r.id}
                  href={`/analysis/${r.id}`}
                  className="group flex items-center justify-between p-4 sm:p-5 hover:bg-ink-50/60 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-ink-100 flex items-center justify-center shrink-0 group-hover:bg-ink-900 group-hover:text-white transition-colors">
                      <Play className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-medium text-ink-900 truncate">{r.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11.5px] text-ink-500">{r.targetPlatform}</span>
                        <span className="w-1 h-1 rounded-full bg-ink-300" />
                        <Badge variant={r.overallScore >= 85 ? 'success' : r.overallScore >= 70 ? 'warning' : 'danger'} dot>
                          {r.overallScore >= 85 ? 'Safe' : r.overallScore >= 70 ? 'Review' : 'Rework'}
                        </Badge>
                        <span className="text-[11.5px] text-ink-400 hidden sm:inline">
                          · {r.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <ScoreGauge score={r.overallScore} size="sm" showLabel={false} />
                    <ArrowUpRight className="w-4 h-4 text-ink-400 group-hover:text-ink-900 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <Link
              href="/upload"
              className="flex items-center justify-between p-5 group hover:bg-ink-50/60 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg border border-dashed border-ink-300 flex items-center justify-center text-ink-500 group-hover:text-ink-900 group-hover:border-ink-900 transition-colors">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-900">Start a new review</div>
                  <div className="text-xs text-ink-500 mt-0.5">Drop a video, thumbnail, or script.</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-400 group-hover:text-ink-900 transition-colors" />
            </Link>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-[15px] font-semibold text-ink-900">Plan</h3>
              <Badge variant="outline">{state.plan}</Badge>
            </div>
            <div className="text-[26px] font-semibold tabular-nums tracking-tight text-ink-950">
              {state.auditsUsed}<span className="text-ink-400 text-[16px]"> / {state.auditsLimit}</span>
            </div>
            <div className="text-[12px] text-ink-500 mt-0.5">reviews used this cycle</div>
            <div className="mt-3 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={state.auditsUsed} aria-valuemin={0} aria-valuemax={state.auditsLimit}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  state.isNearLimit ? 'bg-amber-500' : 'bg-ink-900'
                }`}
                style={{ width: `${Math.min(100, (state.auditsUsed / state.auditsLimit) * 100)}%` }}
              />
            </div>
            {state.plan === 'free' && (
              <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-900 hover:text-ink-600 transition-colors">
                Upgrade for more reviews <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </Card>

          <Card>
            <h3 className="font-display text-[15px] font-semibold text-ink-900 mb-3">What Publish checks</h3>
            <ul className="space-y-2.5 text-[13px] text-ink-700">
              {[
                'Script AI-fingerprint + weak-hook detection',
                'YouTube / TikTok / Meta / LinkedIn policy',
                'Music, footage, and logo claim risk',
                'Voice authenticity + monotone risk',
                'Thumbnail CTR + clickbait risk',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-ink-900 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
