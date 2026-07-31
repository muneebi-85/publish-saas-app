import React from 'react';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { ScoreHeader } from '@/components/analysis/ScoreHeader';
import { PlatformTabs } from '@/components/analysis/PlatformTabs';
import { PriorityFixes } from '@/components/analysis/PriorityFixes';
import { ScriptAnalyzer } from '@/components/analysis/ScriptAnalyzer';
import { VoiceAnalyzer } from '@/components/analysis/VoiceAnalyzer';
import { VideoAnalyzer } from '@/components/analysis/VideoAnalyzer';
import { ThumbnailAnalyzer } from '@/components/analysis/ThumbnailAnalyzer';
import { HookPredictor } from '@/components/analysis/HookPredictor';
import { CopyrightAuditor } from '@/components/analysis/CopyrightAuditor';
import { SEOAuditor } from '@/components/analysis/SEOAuditor';
import { MethodologyCard } from '@/components/ui/MethodologyCard';
import { LockedInsights } from '@/components/analysis/LockedInsights';
import { ExportReportButton } from '@/components/analysis/ExportReportButton';
import { PlatformName } from '@/lib/ai/platform-engine';
import { ProjectData } from '@/lib/types';
import { getUserPlanState } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const authCtx = await requirePageAuth();

  const state = await getUserPlanState(authCtx.clerkId);

  // IDOR guard: the report is scoped to the authenticated owner in the same
  // query, so a valid id belonging to someone else resolves to 404, not 403 —
  // it never confirms that another user's report exists.
  const row = await prisma.analysisReport.findFirst({
    where: { id: params.id, user: { clerkId: authCtx.clerkId } },
  });
  if (!row) notFound();

  const project: ProjectData = {
    ...(row.report as unknown as ProjectData),
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  };

  // The review targets one platform; surface it as the default everywhere so
  // the methodology card and the platform tabs start from the right policy set.
  const targetPlatform = (row.targetPlatform ?? project.platformReports?.[0]?.platform ?? 'YouTube') as PlatformName;

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex justify-end">
        <ExportReportButton />
      </div>

      <ScoreHeader project={project} />

      <PriorityFixes project={project} />

      {/* Conversion surface — free plan only. Paid users already have these. */}
      {state.plan === 'free' && <LockedInsights project={project} />}

      <PlatformTabs reports={project.platformReports} defaultPlatform={targetPlatform} />

      <div className="space-y-5">
        <ScriptAnalyzer issues={project.scriptIssues} scriptAnalysis={project.scriptAnalysis} scriptText={project.assets.scriptText} scores={project.scores} />
        <HookPredictor hook={project.hookAnalysis} />
        <ThumbnailAnalyzer thumbnail={project.thumbnailAnalysis} thumbnailUrl={project.assets.thumbnailUrl} />
        <VoiceAnalyzer voice={project.voiceAnalysis} />
        <VideoAnalyzer video={project.videoAnalysis} />
        <CopyrightAuditor copyright={project.copyrightAnalysis} />
        <SEOAuditor seo={project.seoAnalysis} />
      </div>

      <MethodologyCard activePlatform={targetPlatform} />
    </div>
  );
}
