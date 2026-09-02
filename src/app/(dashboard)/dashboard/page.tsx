import React from 'react';
import Link from 'next/link';
import { requirePageAuth } from '@/lib/api-guards';
import { PublishShareLink } from '@/components/share/PublishShareLink';
import {
  ArrowRight, UploadCloud, ShieldCheck, Play, CheckCircle2, Loader2,
  BarChart3, Gauge, CalendarDays, TrendingUp, AlertTriangle, Wrench,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { TrendCard } from '@/components/analytics/TrendCard';
import { ScoreRadar } from '@/components/analytics/ScoreRadar';
import { prisma } from '@/lib/db';
import { getUserPlanState, PLAN_LIMITS } from '@/lib/session';
import { planDisplayName } from '@/lib/plans';
import { normalizeReport } from '@/lib/normalize-report';
import { scoreBand, SCORE_BAND_UI } from '@/lib/score-band';
import type { ScriptIssue } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PLATFORM_STATUS_TONE: Record<string, string> = {
  Compliant: 'text-grass-700',
  'Review Suggested': 'text-amber-700',
  'At Risk': 'text-crimson-600',
};

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

  // Score-progress tracking — the "54 → 82 over your last 6 videos" stat the
  // audit called the most shareable number a creator has. First vs latest of
  // the fetched window, with the same window's count.
  const firstScore = chronological[0]?.overallScore;
  const latestScore = chronological[chronological.length - 1]?.overallScore;
  const scoreDelta =
    firstScore !== undefined && latestScore !== undefined ? latestScore - firstScore : 0;
  const showProgress = reports.length >= 2 && firstScore !== undefined && latestScore !== undefined;
  const avgMonetization = monetizationSeries.length
    ? Math.round(monetizationSeries.reduce((a, b) => a + b, 0) / monetizationSeries.length)
    : 0;
  const safeCount = reports.filter((r) => r.overallScore >= 85).length;
  const safeRate = reports.length ? Math.round((safeCount / reports.length) * 100) : 0;

  // The tiles show true totals; the fetched list above is capped at 6 for the
  // "recent" feed, so count in the DB instead of deriving from the list.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalReports, thisMonthCount, avgAllOverall] = user
    ? await Promise.all([
        prisma.analysisReport.count({ where: { userId: user.id } }),
        prisma.analysisReport.count({ where: { userId: user.id, createdAt: { gte: monthStart } } }),
        // True all-time average for the header line — the fetched 6-report
        // window's average was previously labeled as if it covered every
        // review, which read as honest until a creator passed ~6 reviews and
        // the two numbers diverged.
        prisma.analysisReport.aggregate({
          where: { userId: user.id },
          _avg: { overallScore: true },
        }),
      ])
    : ([0, 0, null] as const);
  const lifetimeAvg =
    avgAllOverall?._avg.overallScore != null ? Math.round(avgAllOverall._avg.overallScore) : 0;

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
        />

        {showActivating && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            <p className="text-[13px] text-amber-900">
              <strong>Activating your plan</strong> — this usually takes under 30 seconds. Refresh once your plan badge updates in the sidebar.
            </p>
          </div>
        )}
        {showActivated && (
          <div className="flex items-center gap-3 rounded-xl border border-grass-200 bg-grass-50 p-4 mb-6">
            <CheckCircle2 className="w-4 h-4 text-grass-600 shrink-0" />
            <p className="text-[13px] text-grass-800">
              <strong>Plan activated.</strong> Your reviews are unlocked — start your first one below.
            </p>
          </div>
        )}

        <div className="bg-surface-panel border border-ink-200 rounded-xl shadow-xs p-6 sm:p-8">
          <div className="max-w-2xl">
            <Badge variant="ink" dot>
              {state.plan === 'free'
                ? 'Free plan · 1 review included'
                // The catalogue name ("Creator"), never the capitalized id —
                // the pricing page sells "Creator" and the id is "starter".
                : `${planDisplayName(state.plan)} plan active`}
            </Badge>
            <h2 className="mt-4 font-display text-[24px] sm:text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink-900">
              Analyze your first video
            </h2>
            <p className="text-[14px] text-ink-600 mt-2.5 leading-relaxed max-w-xl">
              Drop a title, script, or thumbnail. Every review covers six layers — script authenticity,
              hook retention, voice, thumbnail CTR, copyright exposure, and per-platform policy — in under
              a minute.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/upload">
                <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Start your first review
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="secondary" size="lg">Compare plans</Button>
              </Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-ink-200 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: 'Script + hook', body: 'AI-fingerprint detection, virality scoring, weak-opener rewrites.' },
              { title: 'Policy + copyright', body: 'YouTube, TikTok, Meta, LinkedIn — advertiser suitability and claim risk.' },
              { title: 'Trend over time', body: 'Every re-review shows a real trend line for the same project.' },
            ].map((f, i) => (
              <div key={f.title}>
                <div className="w-6 h-6 rounded-md bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 flex items-center justify-center text-[12px] font-semibold">
                  {i + 1}
                </div>
                <div className="text-[14px] font-semibold text-ink-900 mt-3">{f.title}</div>
                <p className="text-[12px] text-ink-600 mt-1.5 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Latest report detail — powers the score, radar, issues, and platforms ──
  const latestRow = user
    ? await prisma.analysisReport.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, report: true, createdAt: true },
      })
    : null;

  // The raw cast here used to render legacy object-shaped fields straight into
  // JSX, which crashes React — the same rows `/analysis/[id]` already
  // normalizes. One shared normalizer keeps both consumers identical.
  const latest = latestRow ? normalizeReport(latestRow) : null;
  const s = latest?.scores;

  const radarAxes = s
    ? [
        { label: 'Monetization', value: s.monetization },
        { label: 'SEO',          value: s.seo },
        // Hook is null when the review had no script/transcript — the radar has
        // no "unevaluated" axis, so it drops the axis rather than drawing 0.
        ...(s.hook !== null ? [{ label: 'Hook', value: s.hook }] : []),
        ...(s.editing !== null ? [{ label: 'Editing', value: s.editing }] : []),
        { label: 'Brand safety', value: s.brandSafety },
        { label: 'Copyright',    value: s.copyright },
        { label: 'Originality',  value: s.originality },
      ]
    : [];

  const SEVERITY_RANK: Record<ScriptIssue['severity'], number> = { high: 0, medium: 1, low: 2 };
  const topIssues: ScriptIssue[] = [...(latest?.scriptIssues ?? [])]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 4);

  const platformReports = latest?.platformReports ?? [];
  const recommendations = platformReports
    .flatMap((p) => p.specificRecommendations.map((text: string) => ({ platform: p.platform, text })))
    .slice(0, 4);
  const insights = latest?.insights;

  // ── Populated dashboard ───────────────────────────────
  return (
    <div className="animate-enter">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${totalReports} review${totalReports === 1 ? '' : 's'} run · average score ${lifetimeAvg}`}
        actions={
          <Link href="/upload">
            <Button variant="primary" leftIcon={<UploadCloud className="w-4 h-4" />}>New review</Button>
          </Link>
        }
      />

      {/* KPI strip -- one frame, hairline-divided, so six numbers read as a
          single instrument panel instead of six competing cards. */}
      <div className="mb-6 rounded-xl border border-ink-200 bg-surface-panel shadow-xs overflow-hidden grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-x divide-y xl:divide-y-0 divide-ink-200">
        <Kpi icon={<BarChart3 className="w-4 h-4" />} label="Total analyses" value={totalReports}
             hint={`${state.auditsUsed} used this cycle`} />
        <Kpi icon={<Gauge className="w-4 h-4" />} label="Avg. score" value={lifetimeAvg}
             tone={lifetimeAvg >= 85 ? 'good' : lifetimeAvg >= 70 ? 'warn' : 'bad'}
             hint={`All ${totalReports} review${totalReports === 1 ? '' : 's'}`} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Avg. monetization" value={avgMonetization}
             tone={avgMonetization >= 85 ? 'good' : avgMonetization >= 70 ? 'warn' : 'bad'}
             hint="Revenue eligibility" />
        <Kpi icon={<CalendarDays className="w-4 h-4" />} label="This month" value={thisMonthCount}
             hint={now.toLocaleDateString('en-US', { month: 'long' })} />
        <Kpi icon={<ShieldCheck className="w-4 h-4" />} label="Safe to publish" value={`${safeRate}%`}
             tone={safeRate >= 80 ? 'good' : 'neutral'}
             hint={`${safeCount} of your last ${reports.length} scored 85+`} />
        <Kpi icon={<Wrench className="w-4 h-4" />} label="Open fixes"
             value={insights?.totalFixes ?? topIssues.length}
             tone={(insights?.blockingCount ?? 0) > 0 ? 'bad' : 'neutral'}
             hint={insights ? `${insights.blockingCount} blocking` : 'On latest review'} />
      </div>

      {/* Trend row */}
      {monetizationSeries.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <TrendCard label="Monetization" series={monetizationSeries} />
          <TrendCard label="Overall score" series={overallSeries} />
        </div>
      )}

      {/* Score + radar */}
      {s && latestRow && (
        <Panel
          className="mb-6"
          title="Publishing score"
          caption={latestRow.title}
          action={
            <Link href={`/analysis/${latestRow.id}`} className="text-[13px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors">
              Open report <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="grid lg:grid-cols-[minmax(0,240px)_1fr] gap-8 items-center">
            <div className="flex flex-col items-center gap-5">
              <ScoreGauge score={s.overall} size="xl" label="Overall" />
              {insights && (
                <div className="text-center">
                  <div className="text-[12px] text-ink-500">Potential after fixes</div>
                  <div className="font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-grass-700 mt-0.5">
                    {insights.scorePotential}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col lg:flex-row items-center gap-8">
              <ScoreRadar axes={radarAxes} size={280} />
              <ul className="w-full lg:w-auto grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-2.5 lg:min-w-[180px]">
                {radarAxes.map((a) => (
                  <li key={a.label} className="flex items-center justify-between gap-4 text-[13px]">
                    <span className="text-ink-600 truncate">{a.label}</span>
                    <span className="font-semibold text-ink-900 tabular-nums">{a.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}

      {/* Recent content + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel
            padded={false}
            title="Recent content"
            caption={`${totalReports} total`}
            action={
              <Link href="/analyses" className="text-[13px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            }
          >
            <div className="divide-y divide-ink-200">
              {reports.map((r) => {
                const tone =
                  r.overallScore >= 85 ? { text: 'Ready',   cls: 'text-grass-700'   } :
                  r.overallScore >= 70 ? { text: 'Improve', cls: 'text-amber-700'   } :
                                         { text: 'Rework',  cls: 'text-crimson-600' };
                return (
                  <Link
                    key={r.id}
                    href={`/analysis/${r.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50 transition-colors"
                  >
                    <div className="w-11 h-8 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center shrink-0 text-ink-600 group-hover:text-brand-600 transition-colors">
                      <Play className="w-3 h-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-medium text-ink-900 truncate">{r.title}</h3>
                      <div className="text-[12px] text-ink-500 mt-0.5">
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
              className="flex items-center justify-between px-5 py-3.5 border-t border-ink-200 group hover:bg-ink-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md border border-dashed border-ink-300 flex items-center justify-center text-ink-500 group-hover:text-brand-600 group-hover:border-brand-300 transition-colors">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <span className="text-[13px] font-medium text-ink-700">Start a new review</span>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-500 group-hover:text-ink-900 transition-colors" />
            </Link>
          </Panel>

          {topIssues.length > 0 && (
            <Panel title="Top issues to fix" caption="From your latest review">
              <ul className="space-y-3">
                {topIssues.map((issue) => {
                  const tone =
                    issue.severity === 'high'   ? { cls: 'text-crimson-600', ring: 'border-crimson-200 bg-crimson-50' } :
                    issue.severity === 'medium' ? { cls: 'text-amber-700',   ring: 'border-amber-200 bg-amber-50'     } :
                                                  { cls: 'text-ink-600',     ring: 'border-ink-200 bg-ink-50'         };
                  return (
                    <li key={issue.id} className="flex items-start gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
                      <span className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center ${tone.ring}`}>
                        <AlertTriangle className={`w-3.5 h-3.5 ${tone.cls}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${tone.cls}`}>
                            {issue.severity}
                          </span>
                          <span className="text-[11px] text-ink-500">Line {issue.line}</span>
                        </div>
                        <p className="text-[13px] text-ink-900 mt-1.5 leading-relaxed">{issue.text}</p>
                        <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">{issue.suggestion}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {latestRow && (
                <Link
                  href={`/analysis/${latestRow.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  See every fix <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </Panel>
          )}

          {platformReports.length > 0 && (
            <Panel title="Platform performance" caption="Latest review, per platform">
              <div className="grid sm:grid-cols-2 gap-3">
                {platformReports.map((p) => (
                  <div
                    key={p.platform}
                    className="rounded-lg border border-ink-200 bg-ink-50 p-4 hover:border-ink-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-medium text-ink-900">{p.platform}</span>
                      <span className="font-display text-[18px] font-semibold tracking-[-0.015em] text-ink-900 tabular-nums leading-none">
                        {p.score}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                      {/* Band-coloured, not brand-red: a 92 next to a green
                          "Compliant" must not render as a red bar — red is
                          the risk colour in this system. */}
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${SCORE_BAND_UI[scoreBand(p.score)].bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, p.score))}%` }}
                      />
                    </div>
                    <div className={`mt-2.5 text-[12px] font-medium ${PLATFORM_STATUS_TONE[p.policyStatus] ?? 'text-ink-600'}`}>
                      {p.policyStatus}
                    </div>
                    <div className="text-[12px] text-ink-500 mt-0.5 leading-relaxed">{p.adSuitability}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {showProgress && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-ink-900">Score progress</h3>
                <Badge variant="outline">last {reports.length}</Badge>
              </div>
              <div className="flex items-end gap-2">
                <span className="font-display text-[30px] leading-none font-semibold tabular-nums tracking-[-0.025em] text-ink-500 line-through decoration-ink-600/50">
                  {firstScore}
                </span>
                <span
                  className={`font-display text-[30px] leading-none font-semibold tabular-nums tracking-[-0.025em] ${
                    scoreDelta > 0 ? 'text-grass-600' : scoreDelta < 0 ? 'text-crimson-600' : 'text-ink-900'
                  }`}
                >
                  {latestScore}
                </span>
                <span className={`text-[13px] font-semibold mb-0.5 ${scoreDelta > 0 ? 'text-grass-600' : scoreDelta < 0 ? 'text-crimson-600' : 'text-ink-500'}`}>
                  {scoreDelta === 0 ? '±0' : scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                </span>
              </div>
              <div className="text-[12px] text-ink-600 mt-1.5">
                Your average climbed from <strong className="text-ink-500">{firstScore}</strong> to{' '}
                <strong className="text-ink-500">{latestScore}</strong> across your last {reports.length} reviews.
              </div>
              {scoreDelta > 0 && latestRow && (
                <PublishShareLink
                  reportId={latestRow.id}
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Share your latest score <ArrowRight className="w-3 h-3" />
                </PublishShareLink>
              )}
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-ink-900">Your plan</h3>
              <Badge variant="outline">{planDisplayName(state.plan)}</Badge>
            </div>
            <div className="font-display text-[30px] leading-none font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
              {state.auditsUsed}<span className="text-ink-500 text-[18px]"> / {state.auditsLimit}</span>
            </div>
            <div className="text-[12px] text-ink-600 mt-1.5">analyses used this cycle</div>
            <div className="mt-3 h-1.5 w-full bg-ink-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.min(state.auditsUsed, state.auditsLimit)} aria-valuemin={0} aria-valuemax={state.auditsLimit}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${state.isNearLimit ? 'bg-amber-600' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(100, (state.auditsUsed / state.auditsLimit) * 100)}%` }}
              />
            </div>
            <div className="text-[12px] text-ink-500 mt-2">
              {state.periodEnd
                ? `Resets ${state.periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'Monthly cycle'} · limit {PLAN_LIMITS[state.plan]}
            </div>
            {state.plan === 'free' && (
              <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                Upgrade for more <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </Card>

          {recommendations.length > 0 && (
            <Panel title="Recommendations" caption="Highest-leverage next steps">
              <ul className="space-y-3">
                {recommendations.map((rec, i) => (
                  <li key={`${rec.platform}-${i}`} className="flex items-start gap-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-1" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                        {rec.platform}
                      </div>
                      <p className="text-[13px] text-ink-700 leading-relaxed mt-0.5">{rec.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Card className="bg-ink-50 shadow-none">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] font-semibold text-ink-900">Every fix is evidence-based</div>
                <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">
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

/* ───────────────── Local presentation pieces ───────────────── */

const TONE_CLS: Record<string, string> = {
  neutral: 'text-ink-900',
  good:    'text-grass-700',
  warn:    'text-amber-700',
  bad:     'text-crimson-700',
};

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}> = ({ icon, label, value, hint, tone = 'neutral' }) => (
  <div className="p-4 min-w-0">
    <div className="flex items-center gap-1.5 text-ink-500">
      <span className="text-ink-400 shrink-0">{icon}</span>
      <span className="text-[12px] font-medium truncate">{label}</span>
    </div>
    <div className={`font-display text-[24px] leading-none font-semibold tracking-[-0.02em] mt-2.5 tabular-nums ${TONE_CLS[tone]}`}>
      {value}
    </div>
    {hint && <div className="text-[11px] text-ink-500 mt-1.5 truncate">{hint}</div>}
  </div>
);

const Panel: React.FC<{
  title: string;
  caption?: string;
  action?: React.ReactNode;
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, caption, action, padded = true, className = '', children }) => (
  <section className={`rounded-xl border border-ink-200 bg-surface-panel shadow-xs overflow-hidden ${className}`}>
    <div className="flex items-center justify-between gap-4 px-5 h-[52px] border-b border-ink-200">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
        {caption && <p className="text-[11px] text-ink-500 truncate">{caption}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className={padded ? 'p-5' : ''}>{children}</div>
  </section>
);
