import React from 'react';
import Link from 'next/link';
import { requirePageAuth } from '@/lib/api-guards';
import {
  ArrowRight, UploadCloud, ShieldCheck, Play, CheckCircle2, Loader2, Check,
  BarChart3, Gauge, CalendarDays, TrendingUp,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { StatTile } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { TrendCard } from '@/components/analytics/TrendCard';
import { prisma } from '@/lib/db';
import { getUserPlanState, PLAN_LIMITS } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { checkout?: string; pending?: string; upgraded?: string };
}) {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({ where: { id: authCtx.dbUserId } });
  const state = await getUserPlanState(authCtx.clerkId);

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
  const avgOverall = overallSeries.length
    ? Math.round(overallSeries.reduce((a, b) => a + b, 0) / overallSeries.length)
    : 0;
  const safeCount = reports.filter((r) => r.overallScore >= 85).length;
  const safeRate = reports.length ? Math.round((safeCount / reports.length) * 100) : 0;

  // The tiles show true totals; the fetched list above is capped at 6 for the
  // "recent" feed, so count in the DB instead of deriving from the list.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalReports, thisMonthCount] = user
    ? await Promise.all([
        prisma.analysisReport.count({ where: { userId: user.id } }),
        prisma.analysisReport.count({ where: { userId: user.id, createdAt: { gte: monthStart } } }),
      ])
    : [0, 0];

  const showActivating = justCheckedOut && !planIsPaid;
  const showActivated  = justCheckedOut && planIsPaid;
  const firstName = user?.name?.split(' ')[0] || 'Creator';

  // ── First-run state ───────────────────────────────────
  if (reports.length === 0) {
    return (
      <div className="animate-enter">
        <PageHeader
          title={`Welcome to Publish, ${firstName}`}
          subtitle="Get a monetization, policy, and hook review on every video before you publish."
          showUtility
        />

        {showActivating && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            <p className="text-[13px] text-amber-700">
              <strong>Activating your plan</strong> — this usually takes under 30 seconds. Refresh once your plan badge updates in the sidebar.
            </p>
          </div>
        )}
        {showActivated && (
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 mb-6">
            <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
            <p className="text-[13px] text-brand-800">
              <strong>Plan activated.</strong> Your reviews are unlocked — start your first one below.
            </p>
          </div>
        )}

        <div className="bg-white border border-ink-200 rounded-3xl p-8 sm:p-10">
          <div className="max-w-2xl">
            <Badge variant="ink" dot>
              {state.plan === 'free'
                ? 'Free plan · 1 review included'
                : `${state.plan[0].toUpperCase()}${state.plan.slice(1)} plan active`}
            </Badge>
            <h2 className="mt-4 font-display text-2xl sm:text-[28px] font-bold tracking-tight text-ink-900">
              Analyze your first video
            </h2>
            <p className="text-[15px] text-ink-600 mt-3 leading-relaxed">
              Drop a title, script, or thumbnail. Every review covers six layers — script authenticity,
              hook retention, voice, thumbnail CTR, copyright exposure, and per-platform policy — in under
              a minute.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/upload">
                <Button size="lg" variant="dark" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Start your first review
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="secondary" size="lg">Compare plans</Button>
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: 'Script + hook', body: 'AI-fingerprint detection, virality scoring, weak-opener rewrites.' },
              { title: 'Policy + copyright', body: 'YouTube, TikTok, Meta, LinkedIn — advertiser suitability and claim risk.' },
              { title: 'Trend over time', body: 'Every re-review shows a real trend line for the same project.' },
            ].map((f, i) => (
              <div key={f.title} className="border border-ink-200 rounded-2xl p-5 bg-surface-canvas">
                <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-[13px] font-semibold">
                  {i + 1}
                </div>
                <div className="text-[14px] font-semibold text-ink-900 mt-3">{f.title}</div>
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
    <div className="animate-enter">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${totalReports} review${totalReports === 1 ? '' : 's'} run · average score ${avgOverall}`}
        showUtility
        actions={
          <Link href="/upload">
            <Button variant="dark" leftIcon={<UploadCloud className="w-4 h-4" />}>New analysis</Button>
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          icon={<BarChart3 className="w-[18px] h-[18px]" />}
          label="Total analyses"
          value={totalReports}
          hint={<span className="text-ink-500">{state.auditsUsed} used this cycle</span>}
        />
        <StatTile
          icon={<Gauge className="w-[18px] h-[18px]" />}
          label="Avg. score"
          value={avgOverall}
          emphasis={avgOverall >= 85 ? 'success' : avgOverall >= 70 ? 'warning' : 'danger'}
          hint={<span className="text-ink-500">Across your last {reports.length}</span>}
        />
        <StatTile
          icon={<CalendarDays className="w-[18px] h-[18px]" />}
          label="This month"
          value={thisMonthCount}
          hint={<span className="text-ink-500">Analyses run in {now.toLocaleDateString('en-US', { month: 'long' })}</span>}
        />
        <StatTile
          icon={<TrendingUp className="w-[18px] h-[18px]" />}
          label="Safe to publish"
          value={`${safeRate}%`}
          emphasis={safeRate >= 80 ? 'success' : 'default'}
          hint={<span className="text-ink-500">{safeCount} of {reports.length} scored 85+</span>}
        />
      </div>

      {/* Trend row */}
      {monetizationSeries.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <TrendCard label="Monetization" series={monetizationSeries} />
          <TrendCard label="Overall score" series={overallSeries} />
        </div>
      )}

      {/* Recent + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">Recent analyses</h2>
            <Link href="/analyses" className="text-[13px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden">
            <div className="divide-y divide-ink-100">
              {reports.map((r) => {
                const tone =
                  r.overallScore >= 85 ? { text: 'Ready', cls: 'text-brand-600' } :
                  r.overallScore >= 70 ? { text: 'Improve', cls: 'text-amber-600' } :
                  { text: 'Rework', cls: 'text-crimson-600' };
                return (
                  <Link
                    key={r.id}
                    href={`/analysis/${r.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50 transition-colors"
                  >
                    <div className="w-11 h-8 rounded-md bg-ink-900 flex items-center justify-center shrink-0 text-white">
                      <Play className="w-3 h-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13.5px] font-medium text-ink-900 truncate">{r.title}</h3>
                      <div className="text-[11.5px] text-ink-400 mt-0.5">
                        {r.targetPlatform} · {r.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <ScoreGauge score={r.overallScore} size="sm" showLabel={false} />
                    <span className={`text-[12px] font-semibold w-16 text-right ${tone.cls}`}>{tone.text}</span>
                  </Link>
                );
              })}
            </div>
            <Link
              href="/upload"
              className="flex items-center justify-between px-5 py-3.5 border-t border-ink-100 group hover:bg-ink-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md border border-dashed border-ink-300 flex items-center justify-center text-ink-500 group-hover:text-brand-600 group-hover:border-brand-600 transition-colors">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <span className="text-[13.5px] font-medium text-ink-700">Start a new analysis</span>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-400 group-hover:text-ink-900 transition-colors" />
            </Link>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-ink-900">Your plan</h3>
              <Badge variant="outline">{state.plan}</Badge>
            </div>
            <div className="font-display text-[30px] leading-none font-bold tabular-nums tracking-tight text-ink-900">
              {state.auditsUsed}<span className="text-ink-400 text-[17px]"> / {state.auditsLimit}</span>
            </div>
            <div className="text-[12px] text-ink-500 mt-1.5">analyses used this cycle</div>
            <div className="mt-3 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={state.auditsUsed} aria-valuemin={0} aria-valuemax={state.auditsLimit}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${state.isNearLimit ? 'bg-amber-500' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(100, (state.auditsUsed / state.auditsLimit) * 100)}%` }}
              />
            </div>
            <div className="text-[11.5px] text-ink-400 mt-2">
              {state.periodEnd
                ? `Resets ${state.periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'Monthly cycle'} · limit {PLAN_LIMITS[state.plan]}
            </div>
            {state.plan === 'free' && (
              <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                Upgrade for more <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </Card>

          <Card padded={false}>
            <h3 className="text-[13px] font-semibold text-ink-900 px-5 pt-5 pb-3">What Publish checks</h3>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {[
                'Script AI-fingerprint + weak-hook detection',
                'YouTube / TikTok / Meta / LinkedIn policy',
                'Music, footage, and logo claim risk',
                'Voice authenticity + monotone risk',
                'Thumbnail CTR + clickbait risk',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 px-5 py-2.5 text-[13px] text-ink-700">
                  <Check className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="bg-brand-50 border-brand-100">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-brand-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] font-semibold text-brand-900">Every fix is evidence-based</div>
                <p className="text-[12px] text-brand-800/80 mt-1 leading-relaxed">
                  Scores come from your actual assets — never inflated. Estimates are always marked as estimates,
                  and no result guarantees monetization.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
