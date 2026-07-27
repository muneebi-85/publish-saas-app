/**
 * Review orchestrator.
 *
 * Coordinates every AI engine in parallel and assembles a single
 * `ProjectData` payload — the shape the analysis UI expects.
 *
 * Isolation: any single engine failure is caught and replaced with its mock
 * output, so a NIM outage on the vision endpoint (say) does not fail the whole
 * report. The user still gets 5 of 6 layers, cleanly labeled.
 */

import { ProjectData, RiskLevel } from '../types';
import { analyzeScript, mockScriptAnalysis } from './script-engine';
import { analyzeHook, mockHook } from './hook-engine';
import { analyzeVoice, mockVoice, VoiceAnalysisInput } from './voice-engine';
import { analyzeThumbnail, mockThumbnail } from './thumbnail-engine';
import { analyzeCopyright, mockCopyright, CopyrightInput } from './copyright-engine';
import { generateSEOAnalysis, mockSEO } from './seo-engine';
import { analyzeAllPlatforms, mockPlatform, PlatformName } from './platform-engine';
import { riskBand, conservativeScore } from './guardrails';

/** Estimate stock-footage percentage from available signals. Returns null when no signals fire. */
function estimateStockFootagePercent(opts: {
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  musicSource?: string;
}): number | null {
  let score = 0;
  let signals = 0;
  if (opts.aiGenerated) { score += 25; signals++; }
  if (opts.hasWatermark) { score += 10; signals++; }
  if (opts.musicSource?.toLowerCase().includes('stock')) { score += 15; signals++; }
  return signals > 0 ? Math.min(100, score) : null;
}

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','this','that','these',
  'those','i','you','he','she','it','we','they','what','which','who','how',
]);

/** Compute keyword density: top keyword frequency as % of non-stopword tokens. */
function computeKeywordDensity(title: string, description: string, scriptText: string): string {
  const combined = `${title} ${description} ${scriptText}`.toLowerCase();
  const tokens = combined.match(/\b[a-z]{3,}\b/g) ?? [];
  const meaningful = tokens.filter((t) => !STOPWORDS.has(t));
  if (meaningful.length === 0) return 'N/A (no content)';
  const freq: Record<string, number> = {};
  for (const t of meaningful) freq[t] = (freq[t] ?? 0) + 1;
  const topCount = Math.max(...Object.values(freq));
  const pct = (topCount / meaningful.length) * 100;
  const label = pct < 1.5 ? 'Sparse' : pct <= 3.5 ? 'Balanced' : 'Dense';
  return `${pct.toFixed(1)}% (${label})`;
}

export interface ReviewInput {
  projectId: string;
  title: string;
  description?: string;
  scriptText?: string;
  thumbnailUrl?: string;
  targetPlatform?: PlatformName;
  durationSeconds?: number;
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  isVertical?: boolean;
  musicSource?: string;
  detectedLogos?: string[];
  folder?: string;
  tags?: string[];
}

async function safeCall<T>(name: string, fn: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[orchestrator] ${name} failed, using fallback:`, (err as Error).message);
    return fallback();
  }
}

export async function runFullReview(input: ReviewInput): Promise<ProjectData> {
  const platform = input.targetPlatform ?? 'YouTube';
  const script = input.scriptText ?? '';
  const opening = script.slice(0, 800);

  const voiceInput: VoiceAnalysisInput = {
    transcript: script,
    wordCount: script.split(/\s+/).filter(Boolean).length,
    durationSeconds: input.durationSeconds,
    aiGenerated: input.aiGenerated,
    voiceSourceLabel: input.aiGenerated ? 'AI-generated' : undefined,
  };

  // Evidence-based stock-footage estimate. We do NOT fabricate a hardcoded 18%.
  // Instead we build the estimate from signals we actually have. When zero signals
  // fire we pass null so the copyright engine can mark the field "unavailable"
  // rather than invent a number.
  const stockFootagePercent = estimateStockFootagePercent({
    aiGenerated: input.aiGenerated,
    hasWatermark: input.hasWatermark,
    musicSource: input.musicSource,
  });

  const copyrightInput: CopyrightInput = {
    scriptText: script,
    musicSourceDescription: input.musicSource,
    detectedLogos: input.detectedLogos,
    hasWatermark: input.hasWatermark,
    stockFootagePercent: stockFootagePercent ?? undefined,
  };

  // Fan out every engine concurrently — total wall clock ≈ slowest engine, not sum.
  const [
    scriptResult,
    hookResult,
    voiceResult,
    thumbnailResult,
    copyrightResult,
    seoResult,
    platformResults,
  ] = await Promise.all([
    safeCall('script',    () => analyzeScript(script), () => mockScriptAnalysis(script)),
    safeCall('hook',      () => analyzeHook(opening, platform), () => mockHook(opening)),
    safeCall('voice',     () => analyzeVoice(voiceInput), () => mockVoice(voiceInput)),
    safeCall('thumbnail',
      () => input.thumbnailUrl
        ? analyzeThumbnail(input.thumbnailUrl, input.title)
        : Promise.resolve(mockThumbnail()),
      () => mockThumbnail(),
    ),
    safeCall('copyright', () => analyzeCopyright(copyrightInput), () => mockCopyright(copyrightInput)),
    safeCall('seo',       () => generateSEOAnalysis(input.title, platform), () => mockSEO(input.title, platform)),
    safeCall('platforms', () => analyzeAllPlatforms({
      title: input.title,
      description: input.description,
      scriptText: script,
      durationSeconds: input.durationSeconds,
      hasAiVoiceover: input.aiGenerated,
      hasWatermark: input.hasWatermark,
      isVertical: input.isVertical,
      musicSource: input.musicSource,
    }), () => ([
      mockPlatform('YouTube',   { durationSeconds: input.durationSeconds, hasAiVoiceover: input.aiGenerated, hasWatermark: input.hasWatermark }),
      mockPlatform('TikTok',    { durationSeconds: input.durationSeconds, hasWatermark: input.hasWatermark }),
      mockPlatform('Instagram', { hasWatermark: input.hasWatermark, isVertical: input.isVertical }),
      mockPlatform('Facebook',  { durationSeconds: input.durationSeconds }),
      mockPlatform('LinkedIn',  {}),
    ])),
  ]);

  // Compose overall scores.
  // LinkedIn has no ad-share program — exclude it from the monetization average so a good
  // LinkedIn compliance score does not paper over a bad YouTube/TikTok monetization signal.
  const monetizingPlatforms = platformResults.filter((p) => p.platform !== 'LinkedIn');
  const monetization = conservativeScore(
    monetizingPlatforms.length > 0
      ? Math.round(monetizingPlatforms.reduce((sum, p) => sum + p.score, 0) / monetizingPlatforms.length)
      : Math.round(platformResults.reduce((sum, p) => sum + p.score, 0) / platformResults.length),
  );

  const seo = seoResult.seoScore;
  const hook = hookResult.first10SecRetention;
  const authenticity = conservativeScore(
    100 - Math.round((scriptResult.gptProbability + (voiceResult.naturalness < 70 ? 30 : 10)) / 2),
  );
  const copyright = conservativeScore(
    copyrightResult.musicMatchRisk === 'Low' ? 96 : copyrightResult.musicMatchRisk === 'Medium' ? 75 : 45,
  );
  // brandSafety is derived independently from policy compliance, copyright, and authenticity.
  // The prior implementation aliased it to monetization, which was misleading — a video can be
  // "monetizable" and still fail brand-safety checks (e.g. borderline profanity in a policy-safe topic).
  const policyCompliance = Math.round(
    platformResults.reduce((sum, p) => sum + (p.policyStatus === 'Compliant' ? 100 : p.policyStatus === 'Review Suggested' ? 60 : 20), 0)
      / platformResults.length,
  );
  const brandSafety = conservativeScore(Math.round(
    (policyCompliance * 0.4) + ((100 - (copyrightResult.musicMatchRisk === 'High' ? 70 : copyrightResult.musicMatchRisk === 'Medium' ? 35 : 5)) * 0.3) + (authenticity * 0.3),
  ));
  const originality = conservativeScore(100 - scriptResult.gptProbability);
  const editing = thumbnailResult.compositionScore;

  const overall = conservativeScore(Math.round(
    (monetization * 0.30) +
    (copyright    * 0.20) +
    (hook         * 0.15) +
    (authenticity * 0.15) +
    (seo          * 0.10) +
    (brandSafety  * 0.10),
  ));

  const risk: RiskLevel = riskBand(overall);

  return {
    id: input.projectId,
    title: input.title,
    description: input.description ?? '',
    folder: input.folder ?? 'General',
    tags: input.tags ?? [],
    status: 'Completed',
    riskLevel: risk,
    createdAt: new Date().toISOString(),
    assets: {
      thumbnailUrl: input.thumbnailUrl,
      scriptText: input.scriptText,
      videoDuration: input.durationSeconds ? `${Math.floor(input.durationSeconds / 60)}:${String(input.durationSeconds % 60).padStart(2, '0')}` : undefined,
      metaTitle: input.title,
      metaDescription: input.description,
      metaTags: input.tags,
    },
    scores: {
      overall,
      monetization,
      originality,
      humanAuthenticity: authenticity,
      brandSafety,
      copyright,
      seo,
      hook,
      editing,
    },
    scriptIssues:      scriptResult.issues,
    voiceAnalysis:     voiceResult,
    // Honest state: we do not do frame-level video analysis yet. Report "Not analyzed"
    // rather than invent numbers. The only signals we truly have are the aiGenerated flag,
    // hasWatermark, and the thumbnail composition score used above.
    videoAnalysis: {
      editingPacingScore: editing,
      cameraMovementRating: 'Not analyzed — video source not connected',
      sceneTransitionRate: 'Not analyzed — video source not connected',
      frameRepetitionCount: 0,
      aiVisualArtifactRisk: input.aiGenerated ? 'Medium' : 'Low',
      resolution: 'Unknown',
      compressionQuality: 'Unknown',
      recommendations: [
        input.aiGenerated
          ? 'AI-generated visuals detected — disclose in metadata under YouTube 2026 synthetic content rules and EU AI Act Article 50.'
          : 'Connect a video file or URL to enable frame-level analysis (pacing, transitions, compression).',
      ],
    },
    thumbnailAnalysis: thumbnailResult,
    seoAnalysis: {
      titleOptimizationScore: seoResult.seoScore,
      descriptionScore: seoResult.keywordScore,
      keywordDensity: computeKeywordDensity(input.title, input.description ?? '', script),
      rankingOpportunity: seoResult.seoScore >= 80 ? 'High' : seoResult.seoScore >= 65 ? 'Medium' : 'Low',
      // No fabricated percentile. Real competitor comparison needs channel-level data we do not have yet.
      competitorComparison: 'Comparison requires a connected channel — connect a YouTube channel in Settings for benchmarked ranking data.',
      suggestedTags: seoResult.tags.slice(0, 4),
      suggestedHashtags: seoResult.tags.slice(4, 7).map((t) => `#${t.replace(/\s+/g, '')}`),
    },
    copyrightAnalysis: copyrightResult,
    hookAnalysis: hookResult,
    platformReports: platformResults,
  };
}
