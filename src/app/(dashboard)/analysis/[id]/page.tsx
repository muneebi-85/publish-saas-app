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
import { ExportReportButton } from '@/components/analysis/ExportReportButton';
import { RetentionCurve } from '@/components/analysis/RetentionCurve';
import { PlatformName } from '@/lib/ai/platform-engine';
import { toDisplayString } from '@/lib/ai/guardrails';
import { ProjectData } from '@/lib/types';
import { getUserPlanState } from '@/lib/session';
import { ChallengeCompare } from '@/components/challenge/ChallengeCompare';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Normalize a persisted report for rendering.
 *
 * The LLM occasionally returns objects inside fields typed as `string[]`
 * (e.g. a hook as `{ why, hook, expectedImpact }` instead of a string). The
 * engines now coerce these at write time, but reports persisted before that
 * fix still contain the objects — and rendering one crashes React with
 * "Objects are not valid as a React child". Every string-typed field the UI
 * renders is coerced here so legacy rows render instead of throwing.
 */
type JsonObject = Record<string, unknown>;

/** Read an unknown value as a JSON object (never throws). */
function asJsonObject(v: unknown): JsonObject {
  return v !== null && typeof v === 'object' ? (v as JsonObject) : {};
}

function normalizeReport(row: { report: unknown; id: string; createdAt: Date }): ProjectData {
  const raw = asJsonObject(row.report);
  const str = (v: unknown) => toDisplayString(v);
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => toDisplayString(x)) : [];
  const field = (obj: unknown, key: string): unknown => asJsonObject(obj)[key];

  const hookAnalysis = {
    ...asJsonObject(field(raw, 'hookAnalysis')),
    recommendedHooks: strArr(field(field(raw, 'hookAnalysis'), 'recommendedHooks')),
    hookDropoffReason: str(field(field(raw, 'hookAnalysis'), 'hookDropoffReason')),
  };

  const rawScriptIssues = raw.scriptIssues;
  const scriptIssues = Array.isArray(rawScriptIssues)
    ? rawScriptIssues.map((entry) => {
        const issue = asJsonObject(entry);
        return {
          ...issue,
          text: str(issue.text),
          suggestion: str(issue.suggestion),
          specific_fix: issue.specific_fix == null ? undefined : str(issue.specific_fix),
          reasoning: issue.reasoning == null ? undefined : str(issue.reasoning),
          estimatedMetricImpact:
            issue.estimatedMetricImpact == null ? undefined : str(issue.estimatedMetricImpact),
        };
      })
    : [];

  // Persisted JSON is untyped; the coercion below is intentionally structural.
  // The final cast is the contract boundary between the DB row and the typed
  // render model — after normalization the shape matches ProjectData.
  return {
    ...(raw as unknown as ProjectData),
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    hookAnalysis,
    scriptIssues,
    voiceAnalysis: {
      ...asJsonObject(field(raw, 'voiceAnalysis')),
      recommendations: strArr(field(field(raw, 'voiceAnalysis'), 'recommendations')),
    },
    videoAnalysis: {
      ...asJsonObject(field(raw, 'videoAnalysis')),
      recommendations: strArr(field(field(raw, 'videoAnalysis'), 'recommendations')),
    },
    thumbnailAnalysis: {
      ...asJsonObject(field(raw, 'thumbnailAnalysis')),
      recommendations: strArr(field(field(raw, 'thumbnailAnalysis'), 'recommendations')),
    },
    copyrightAnalysis: {
      ...asJsonObject(field(raw, 'copyrightAnalysis')),
      recommendations: strArr(field(field(raw, 'copyrightAnalysis'), 'recommendations')),
    },
    seoAnalysis: {
      ...asJsonObject(field(raw, 'seoAnalysis')),
      suggestedTags: strArr(field(field(raw, 'seoAnalysis'), 'suggestedTags')),
      suggestedHashtags: strArr(field(field(raw, 'seoAnalysis'), 'suggestedHashtags')),
      timestamps: strArr(field(field(raw, 'seoAnalysis'), 'timestamps')),
    },
    platformReports: Array.isArray(raw.platformReports)
      ? raw.platformReports.map((entry) => {
          const p = asJsonObject(entry);
          return {
            ...p,
            specificRecommendations: strArr(p.specificRecommendations),
          };
        })
      : [],
    authenticity: raw.authenticity != null
      ? {
          ...asJsonObject(raw.authenticity),
          evidence: Array.isArray(field(raw.authenticity, 'evidence'))
            ? (field(raw.authenticity, 'evidence') as unknown[]).map((entry) => {
                const e = asJsonObject(entry);
                return {
                  ...e,
                  signal: str(e.signal),
                  location: str(e.location),
                  detail: str(e.detail),
                };
              })
            : [],
          inconclusive: strArr(field(raw.authenticity, 'inconclusive')),
          falsePositiveReasons: strArr(field(raw.authenticity, 'falsePositiveReasons')),
          limitations: strArr(field(raw.authenticity, 'limitations')),
          recommendations: strArr(field(raw.authenticity, 'recommendations')),
        }
      : undefined,
    monetizationRisk: raw.monetizationRisk != null
      ? {
          ...asJsonObject(raw.monetizationRisk),
          items: Array.isArray(field(raw.monetizationRisk, 'items'))
            ? (field(raw.monetizationRisk, 'items') as unknown[]).map((entry) => {
                const item = asJsonObject(entry);
                return {
                  ...item,
                  category: str(item.category),
                  location: str(item.location),
                  why: str(item.why),
                  fix: str(item.fix),
                };
              })
            : [],
          inconclusive: strArr(field(raw.monetizationRisk, 'inconclusive')),
          limitations: strArr(field(raw.monetizationRisk, 'limitations')),
        }
      : undefined,
    scorecards: Array.isArray(raw.scorecards)
      ? raw.scorecards.map((entry) => {
          const card = asJsonObject(entry);
          return {
            ...card,
            label: str(card.label),
            evidence: strArr(card.evidence),
            inconclusive: strArr(card.inconclusive),
            recommendations: strArr(card.recommendations),
            expectedImpact: str(card.expectedImpact),
          };
        })
      : undefined,
  } as ProjectData;
}

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
    <div className="space-y-8 animate-enter">
      <div className="flex justify-end">
        <ExportReportButton />
      </div>

      {inChallenge && (
        <ChallengeCompare targetReportId={inChallenge} myReportId={row.id} myTitle={row.title} />
      )}

      <ScoreHeader project={project} />

      <PriorityFixes project={project} />

      {hasModel && (
        <NicheBenchmark
          title={project.assets.metaTitle || project.title}
          description={project.assets.metaDescription || project.description}
          tags={project.assets.metaTags ?? project.tags}
          durationSeconds={displayDurationToSeconds(project.assets.videoDuration)}
          subscribers={channel?.subscribers ?? 0}
          videoCount={channel?.videosCount ?? 0}
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

      <div className="space-y-5">
        {project.authenticity && <AuthenticityPanel authenticity={project.authenticity} />}
        {project.monetizationRisk && <MonetizationRiskPanel analysis={project.monetizationRisk} />}
        <ScriptAnalyzer issues={project.scriptIssues} scriptAnalysis={project.scriptAnalysis} scriptText={project.assets.scriptText} scores={project.scores} />
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
        className="flex items-center justify-between gap-3 rounded-2xl border border-brand-600/20 bg-brand-600/[0.05] px-5 py-4 hover:border-brand-600/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-[#060606] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold text-ink-900">Ask the AI Coach about this report</div>
            <div className="text-[12px] text-ink-500 mt-0.5">
              Get advice grounded in these exact scores and top fixes — not generic tips.
            </div>
          </div>
        </div>
        <span className="text-[12.5px] font-semibold text-brand-600 shrink-0">Open coach →</span>
      </Link>
    </div>
  );
}
