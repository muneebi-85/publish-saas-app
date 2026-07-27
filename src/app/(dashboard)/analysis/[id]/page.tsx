import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { ScoreHeader } from '@/components/analysis/ScoreHeader';
import { PlatformTabs } from '@/components/analysis/PlatformTabs';
import { PriorityFixes } from '@/components/analysis/PriorityFixes';
import { ScriptAnalyzer } from '@/components/analysis/ScriptAnalyzer';
import { VoiceAnalyzer } from '@/components/analysis/VoiceAnalyzer';
import { ThumbnailAnalyzer } from '@/components/analysis/ThumbnailAnalyzer';
import { HookPredictor } from '@/components/analysis/HookPredictor';
import { CopyrightAuditor } from '@/components/analysis/CopyrightAuditor';
import { SEOAuditor } from '@/components/analysis/SEOAuditor';
import { MethodologyCard } from '@/components/ui/MethodologyCard';
import { PlatformName } from '@/lib/ai/platform-engine';
import { ProjectData } from '@/lib/types';
import { getProjectById } from '@/lib/db/mock-db';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const { userId: clerkId } = auth();
  if (!clerkId) redirect('/sign-in');

  // Legacy mock ids (proj-xxx) still resolve to the sample library so the app
  // works before any real reviews have been persisted for this user.
  let project: ProjectData;
  if (params.id.startsWith('proj-')) {
    project = getProjectById(params.id);
  } else {
    const row = await prisma.analysisReport.findFirst({
      where: { id: params.id, user: { clerkId } },
    });
    if (!row) notFound();
    project = row.report as unknown as ProjectData;
    project.id = row.id;
    project.createdAt = row.createdAt.toISOString();
  }

  return (
    <div className="space-y-8 animate-enter">
      <ScoreHeader
        title={project.title}
        description={project.description}
        riskLevel={project.riskLevel}
        duration={project.assets.videoDuration}
        scores={project.scores}
      />

      <PriorityFixes project={project} />

      <PlatformTabs reports={project.platformReports} />

      <div className="space-y-5">
        <ScriptAnalyzer issues={project.scriptIssues} scriptText={project.assets.scriptText} />
        <HookPredictor hook={project.hookAnalysis} />
        <ThumbnailAnalyzer thumbnail={project.thumbnailAnalysis} thumbnailUrl={project.assets.thumbnailUrl} />
        <VoiceAnalyzer voice={project.voiceAnalysis} />
        <CopyrightAuditor copyright={project.copyrightAnalysis} />
        <SEOAuditor seo={project.seoAnalysis} />
      </div>

      <MethodologyCard
        activePlatform={(project.platformReports?.[0]?.platform as PlatformName) ?? 'YouTube'}
      />
    </div>
  );
}
