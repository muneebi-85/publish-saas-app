import React from 'react';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { ScoreHeader } from '@/components/analysis/ScoreHeader';
import { PlatformTabs } from '@/components/analysis/PlatformTabs';
import { PriorityFixes } from '@/components/analysis/PriorityFixes';
import { NicheBenchmark } from '@/components/analysis/NicheBenchmark';
import { modelAvailable } from '@/lib/ml';
import { ScriptAnalyzer } from '@/components/analysis/ScriptAnalyzer';
import { VoiceAnalyzer } from '@/components/analysis/VoiceAnalyzer';
import { VideoAnalyzer } from '@/components/analysis/VideoAnalyzer';
import { ThumbnailAnalyzer } from '@/components/analysis/ThumbnailAnalyzer';
import { HookPredictor } from '@/components/analysis/HookPredictor';
import { CopyrightAuditor } from '@/components/analysis/CopyrightAuditor';
import { SEOAuditor } from '@/components/analysis/SEOAuditor';
import { AuthenticityPanel } from '@/components/analysis/AuthenticityPanel';
import { MonetizationRiskPanel } from '@/components/analysis/MonetizationRiskPanel';
import { ScorecardGrid } from '@/components/analysis/ScorecardGrid';
import { MethodologyCard } from '@/components/ui/MethodologyCard';
import { LockedInsights } from '@/components/analysis/LockedInsights';
import { RetentionCurve } from '@/components/analysis/RetentionCurve';
import { PlatformName } from '@/lib/ai/platform-engine';
import { normalizeReport } from '@/lib/normalize-report';
import { ProjectData } from '@/lib/types';
import { getUserPlanState } from '@/lib/session';
import { ChallengeCompare } from '@/components/challenge/ChallengeCompare';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * `"11:04"` or `"1:02:30"` to seconds; 0 when it is neither.
 *
 * `assets.videoDuration` is a DISPLAY string built for a badge, not a machine format.
 * The niche benchmark needs a real length because a video under 60 seconds is a Short
 * and is compared against an entirely different set of videos - so a failed parse has
 * to yield 0 (treated as "unknown", no Shorts claim) rather than a plausible number.
 */
function displayDurationToSeconds(display?: string): number {
  if (!display) return 0;
  const parts = display.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return 0;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return 0;
  const numbers = parts.map((p) => parseInt(p, 10));
  return parts.length === 3
    ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers[0] * 60 + numbers[1];
}

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { challenge?: string };
}) {
  const authCtx = await requirePageAuth();

  const state = await getUserPlanState(authCtx.clerkId);

  // IDOR guard: the report is scoped to the authenticated owner in the same
  // query, so a valid id belonging to someone else resolves to 404, not 403 —
  // it never confirms that another user's report exists.
  const row = await prisma.analysisReport.findFirst({
    where: { id: params.id, user: { clerkId: authCtx.clerkId } },
  });
  if (!row) notFound();

  // Coerce every LLM string-typed field so legacy reports with object-shaped
  // entries render instead of crashing React (see normalizeReport).
  const project: ProjectData = normalizeReport(row);

  // The review targets one platform; surface it as the default everywhere so
  // the methodology card and the platform tabs start from the right policy set.
  const targetPlatform = (row.targetPlatform ?? project.platformReports?.[0]?.platform ?? 'YouTube') as PlatformName;

  // The niche benchmark needs the channel's size, because the comparison cell is
  // `category x subscriber bucket x form`. Largest connected channel rather than an
  // average: a creator with a 200k main channel and a 300-subscriber test channel
  // should be benchmarked against the main one. Absent (no channel connected) is 0,
  // which buckets as `nano` - the honest reading of an unknown subscriber count, and
  // the same one the trainer used for channels that hide it.
  const channel = await prisma.channel.findFirst({
    where: { user: { clerkId: authCtx.clerkId } },
    orderBy: { subscribers: 'desc' },
    select: { subscribers: true, videosCount: true },
  });

  // Checked on the server so the panel is not mounted at all when no artefact is
  // deployed. Without this the client would render a heading, fire a request, take a
  // 503 and unmount - a visible flash of a feature that does not exist.
  const hasModel = modelAvailable();

  // A challenge accept lands here with ?challenge=<targetReportId>; the client
  // component records the head-to-head once and renders the comparison.
  const challengeId = searchParams?.challenge;
  const inChallenge = challengeId && /^[a-z0-9_-]{8,64}$/i.test(challengeId) ? challengeId : null;

  return (
    <div className="space-y-6 animate-enter">
      {/* Export lives once, in the ScoreHeader action row — this page-level
          copy rendered a second button for the same window.print(). */}
      {inChallenge && (
        <ChallengeCompare targetReportId={inChallenge} myReportId={row.id} myTitle={row.title} />
      )}

      <ScoreHeader project={project} shared={row.sharedAt !== null} />

      <PriorityFixes project={project} />

      {hasModel && (
        <NicheBenchmark
          title={project.assets.metaTitle || project.title}
          description={project.assets.metaDescription || project.description}
          tags={project.assets.metaTags ?? project.tags}
          durationSeconds={displayDurationToSeconds(project.assets.videoDuration)}
          subscribers={Number(channel?.subscribers ?? 0)}
          videoCount={Number(channel?.videosCount ?? 0)}
        />
      )}

      {/* Conversion surface — free plan only. Paid users already have these. */}
      {state.plan === 'free' && <LockedInsights project={project} />}

      <PlatformTabs reports={project.platformReports} defaultPlatform={targetPlatform} />

      {/* Reports created before the authenticity engine shipped simply omit these
          fields; rendering conditionally is what keeps those reports readable
          instead of crashing or showing fabricated zeroes. */}
      {project.scorecards && project.scorecards.length > 0 && (
        <ScorecardGrid scorecards={project.scorecards} />
      )}

      <div className="space-y-6">
        {project.authenticity && <AuthenticityPanel authenticity={project.authenticity} />}
        {project.monetizationRisk && <MonetizationRiskPanel analysis={project.monetizationRisk} />}
        <ScriptAnalyzer issues={project.scriptIssues} scriptAnalysis={project.scriptAnalysis} scriptText={project.assets.scriptText} scores={project.scores} reportId={row.id} />
        <HookPredictor hook={project.hookAnalysis} />
        <RetentionCurve hook={project.hookAnalysis} />
        <ThumbnailAnalyzer thumbnail={project.thumbnailAnalysis} thumbnailUrl={project.assets.thumbnailUrl} />
        <VoiceAnalyzer voice={project.voiceAnalysis} />
        <VideoAnalyzer video={project.videoAnalysis} />
        <CopyrightAuditor copyright={project.copyrightAnalysis} />
        <SEOAuditor seo={project.seoAnalysis} />
      </div>

      <MethodologyCard activePlatform={targetPlatform} />

      {/* Grounded coaching: ask the AI Coach about THIS report's scores. */}
      <Link
        href={`/ai-coach?report=${row.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 hover:border-brand-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-panel text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Ask the AI Coach about this report</div>
            <div className="text-[12px] text-ink-500 mt-0.5">
              Get advice grounded in these exact scores and top fixes — not generic tips.
            </div>
          </div>
        </div>
        <span className="text-[12px] font-semibold text-brand-600 shrink-0">Open coach →</span>
      </Link>
    </div>
  );
}
