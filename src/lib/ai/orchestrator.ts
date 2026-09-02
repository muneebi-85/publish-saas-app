/**
 * Review orchestrator.
 *
 * Coordinates every AI engine in parallel and assembles a single
 * `ProjectData` payload — the shape the analysis UI expects.
 *
 * Isolation: any single engine failure is caught and replaced with that engine's
 * deterministic fallback, so a NIM outage on the vision endpoint (say) does not
 * fail the whole report. The user still gets 5 of 6 layers, cleanly labeled —
 * and any layer that could not be measured says so instead of showing a number.
 */

import { ProjectData, RiskLevel, VideoMetric } from '../types';
import { analyzeScript, heuristicScriptAnalysis } from './script-engine';
import { analyzeHook, heuristicHook } from './hook-engine';
import { analyzeVoice, heuristicVoice, VoiceAnalysisInput } from './voice-engine';
import { analyzeThumbnail, unmeasuredThumbnail } from './thumbnail-engine';
import { analyzeCopyright, heuristicCopyright, copyrightCompositeScore, CopyrightInput } from './copyright-engine';
import { generateSEOAnalysis, heuristicSEO } from './seo-engine';
import { analyzeAllPlatforms, heuristicPlatform, PlatformName } from './platform-engine';
import { riskBand, conservativeScore } from './guardrails';
import { transcribeAudio } from './transcription';
import { hasTranscription } from '../env';
import { analyzeVideoFrames, unmeasuredVideo, type VideoFrameInput } from './video-engine';
import {
  analyzeAuthenticity,
  heuristicAuthenticity,
  analyzeMonetizationRisk,
  buildScorecards,
  detectTextSignals,
  type AuthenticityInput,
} from './authenticity-engine';

/** Estimate stock-footage percentage from available signals. Returns null when no signals fire. */
function estimateStockFootagePercent(opts: {
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  musicSource?: string;
}): number | null {
  let score = 0;
  let signals = 0;
  // The UI's "Stock / royalty-free" declaration is evidence for this estimate,
  // not a contradiction: choosing a stock library is a proxy that stock footage
  // is in the edit, which is exactly what the signal measures.
  if (opts.aiGenerated) { score += 25; signals++; }
  if (opts.hasWatermark) { score += 10; signals++; }
  if (opts.musicSource === 'stock') { score += 15; signals++; }
  return signals > 0 ? Math.min(100, score) : null;
}

/**
 * Copyright composite — moved to `copyright-engine.ts` (`copyrightCompositeScore`)
 * so the headline score and the scorecard card import the one implementation.
 */

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

/** `11:04` from a second count. Undefined in, undefined out - never `0:00`. */
function durationDisplay(seconds?: number): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface ReviewInput {
  projectId: string;
  title: string;
  description?: string;
  scriptText?: string;
  thumbnailUrl?: string;
  /** Media (audio or video) URL to transcribe when speech-to-text is configured. */
  audioUrl?: string;
  /**
   * Frames the uploader's browser decoded out of the video, plus what it measured
   * from them. Absent when no video was attached, when the browser could not decode
   * it, or when storage is off - all of which report the layer as unmeasured.
   */
  videoFrames?: VideoFrameInput;
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

/**
 * The headline's null-aware weighted blend. When the hook layer did not run
 * (no script/transcript), its 15% is redistributed across the remaining layers
 * proportionally rather than blended in as a zero — a missing layer must
 * neither drag the score down (as 0 would) nor hand out a free 88 (as a
 * fabricated hook would). The divisor is the sum of the coefficients actually
 * used in the numerator: 1.00 when the hook is measured (its 0.15 joins the
 * other five), 0.85 when it is not (the five remaining layers are rescaled to
 * fill the whole range). Swapping those two divisors was the historical bug:
 * it inflated every fully-measured score by ~18% and capped every hookless
 * one at 85.
 */
export function headlineWeightedScore(layers: {
  monetization: number;
  copyright: number;
  hook: number | null;
  authenticity: number;
  seo: number;
  brandSafety: number;
}): number {
  const hookWeight = layers.hook !== null ? 0.15 : 0;
  const weightSum = 0.85 + hookWeight;
  return Math.round(
    (
      (layers.monetization * 0.30) +
      (layers.copyright    * 0.20) +
      (layers.hook !== null ? layers.hook * hookWeight : 0) +
      (layers.authenticity * 0.15) +
      (layers.seo          * 0.10) +
      (layers.brandSafety  * 0.10)
    ) / weightSum,
  );
}

export async function runFullReview(input: ReviewInput): Promise<ProjectData> {
  const platform = input.targetPlatform ?? 'YouTube';

  // Real speech-to-text: when a media URL is attached and Deepgram is
  // configured, transcribe once and let every text engine read the actual
  // spoken words, while the voice engine gets measured DSP values. Any
  // transcription failure degrades cleanly to the existing transcript path.
  const transcribed = input.audioUrl && hasTranscription()
    ? await safeCall('transcription', () => transcribeAudio(input.audioUrl as string), () => null)
    : null;

  // The creator's written script wins when present; otherwise the real
  // transcript becomes the script (audio-only uploads now analyzed for real).
  // The route always sends a STRING scriptText (empty when the creator wrote
  // none), so `??` would never fall through — emptiness must be the trigger.
  const providedScript = input.scriptText?.trim();
  const script = providedScript || transcribed?.transcript || '';
  const opening = script.slice(0, 800);

  // ── Duration resolution (one source of truth) ─────────────────────
  // Measured sources outrank self-report: the browser frame decode read the
  // duration off the container itself, the transcript infers it from the last
  // word it heard (short on any video that ends in silence), and the typed
  // value is an estimate. Every engine and the display read this same value,
  // so a video that measured 45s can no longer skate past the TikTok 60s
  // floor while a real measurement sat unused in the input.
  const durationSeconds =
    input.videoFrames?.durationSeconds ?? transcribed?.durationSeconds ?? input.durationSeconds;

  const voiceInput: VoiceAnalysisInput = {
    transcript: script,
    // The script actually being analyzed is the word source — which may be the
    // transcript, so this must test `script`, not the raw (always-string)
    // `input.scriptText`. An empty script falls back to the transcript's own
    // count, and to undefined when neither exists.
    wordCount: script
      ? script.split(/\s+/).filter(Boolean).length
      : transcribed?.wordCount,
    durationSeconds,
    aiGenerated: input.aiGenerated,
    voiceSourceLabel: input.aiGenerated ? 'AI-generated' : undefined,
    measured: transcribed
      ? {
          speakingPaceWpm: transcribed.speakingPaceWpm,
          pauseRatio: transcribed.pauseRatio,
          isMonotone: transcribed.isMonotone,
        }
      : undefined,
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

  // Authenticity input. `audioMeasured` is true only when a real transcription
  // ran, which is what lets the engine label voice signals measured vs inferred.
  // `videoFramesMeasured` tells it whether the frame layer ran, so its
  // inconclusive/limitations copy stops claiming frame analysis "does not
  // exist" on reviews where the same report's video panel shows it did.
  const authenticityInput: AuthenticityInput = {
    title: input.title,
    description: input.description,
    scriptText: script,
    tags: input.tags,
    durationSeconds,
    aiGenerated: input.aiGenerated,
    hasWatermark: input.hasWatermark,
    hasThumbnail: Boolean(input.thumbnailUrl),
    audioMeasured: Boolean(transcribed),
    videoFramesMeasured: Boolean(input.videoFrames),
    measuredVoice: transcribed
      ? {
          speakingPaceWpm: transcribed.speakingPaceWpm,
          pauseRatio: transcribed.pauseRatio,
          isMonotone: transcribed.isMonotone,
        }
      : undefined,
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
    authenticityResult,
    framesResult,
  ] = await Promise.all([
    safeCall('script',    () => analyzeScript(script), () => heuristicScriptAnalysis(script)),
    safeCall('hook',      () => analyzeHook(opening, platform), () => heuristicHook(opening, platform)),
    safeCall('voice',     () => analyzeVoice(voiceInput), () => heuristicVoice(voiceInput)),
    safeCall('thumbnail',
      () => input.thumbnailUrl
        ? analyzeThumbnail(input.thumbnailUrl, input.title)
        : Promise.resolve(unmeasuredThumbnail()),
      () => unmeasuredThumbnail(),
    ),
    safeCall('copyright', () => analyzeCopyright(copyrightInput), () => heuristicCopyright(copyrightInput)),
    safeCall('seo',       () => generateSEOAnalysis(input.title, platform, input.description, script), () => heuristicSEO(input.title, platform)),
    safeCall('platforms', () => analyzeAllPlatforms({
      title: input.title,
      description: input.description,
      scriptText: script,
      durationSeconds,
      hasAiVoiceover: input.aiGenerated,
      hasWatermark: input.hasWatermark,
      isVertical: input.isVertical,
      musicSource: input.musicSource,
    }), () => ([
      heuristicPlatform('YouTube',   { durationSeconds, hasAiVoiceover: input.aiGenerated, hasWatermark: input.hasWatermark }),
      heuristicPlatform('TikTok',    { durationSeconds, hasWatermark: input.hasWatermark }),
      heuristicPlatform('Instagram', { hasWatermark: input.hasWatermark, isVertical: input.isVertical }),
      heuristicPlatform('Facebook',  { durationSeconds }),
      heuristicPlatform('LinkedIn',  {}),
    ])),
    safeCall('authenticity',
      () => analyzeAuthenticity(authenticityInput),
      () => heuristicAuthenticity(authenticityInput, authenticityInput.measuredVoice),
    ),
    // Null, not a fabricated metric, when no frames were decoded. The unmeasured
    // result is built after this block because it wants the thumbnail's composition
    // score as its stand-in, and that is not known until the batch resolves.
    safeCall<VideoMetric | null>('videoFrames',
      () => input.videoFrames
        ? analyzeVideoFrames(input.videoFrames, platform)
        : Promise.resolve(null),
      () => null,
    ),
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
  // Null when there was no script/transcript to read — the hook layer reports
  // `analyzed: false` and must not push a fabricated retention number into the
  // headline blend.
  const hook = hookResult.analyzed === false ? null : hookResult.first10SecRetention;
  // Authenticity now comes from the dedicated authenticity engine, which reasons
  // over named signals with locations, confidence, and false-positive caveats
  // rather than the previous ad-hoc blend of gptProbability and voice naturalness.
  // The script engine's independent gptProbability is still folded in at a lower
  // weight: it is a second opinion from a different prompt, and when the two
  // disagree we want the composite to reflect that rather than trust one blindly.
  const authenticity = conservativeScore(Math.round(
    (authenticityResult.humanAuthenticityScore * 0.7) + ((100 - scriptResult.gptProbability) * 0.3),
  ));
  const copyright = conservativeScore(copyrightCompositeScore(copyrightResult));
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
  // The video layer, resolved. When frames decoded, this is the real thing; when
  // they did not, it is the explicit unmeasured state that names itself as such.
  const videoResult = framesResult
    ?? unmeasuredVideo(platform, input.aiGenerated === true, thumbnailResult.compositionScore);

  // `scores.editing` passes the video layer's honest value through, null when
  // unmeasured. The previous `?? 0` coerced "never measured" into a
  // measured-looking 0/100 — the exact conflation the unmeasured state exists
  // to prevent. `videoResult.basis` tells the reader which of the two
  // legitimate sources (frame pacing or thumbnail composition) produced it.
  const editing = videoResult.editingPacingScore;
  // Frames genuinely decoded — distinct from the unmeasured stand-in below,
  // and what the scorecards' editing card keys on.
  const framesMeasured = Boolean(input.videoFrames) && framesResult !== null;

  // Weighted headline — see headlineWeightedScore for the redistribution rule.
  const overall = conservativeScore(headlineWeightedScore({
    monetization, copyright, hook, authenticity, seo, brandSafety,
  }));

  const risk: RiskLevel = riskBand(overall);

  // Monetization risk consolidates the keyword rules with what the other engines
  // already measured, so the creator gets one exposure list instead of having to
  // reconcile six panels. Deterministic — no extra model call, no extra latency.
  const monetizationRisk = analyzeMonetizationRisk(authenticityInput, {
    copyright: copyrightResult,
    thumbnail: thumbnailResult,
    voice: voiceResult,
    platformReports: platformResults,
    authenticityRisk: authenticityResult.risk,
  });

  const scorecards = buildScorecards({
    authenticity: authenticityResult,
    authenticityComposite: authenticity,
    monetizationRisk,
    textSignals: detectTextSignals(script, input.aiGenerated),
    voice: voiceResult,
    thumbnail: thumbnailResult,
    copyright: copyrightResult,
    platformReports: platformResults,
    video: framesMeasured ? videoResult : undefined,
    title: input.title,
    description: input.description,
    tags: input.tags,
    aiGenerated: input.aiGenerated,
    hasWatermark: input.hasWatermark,
    hasThumbnail: Boolean(input.thumbnailUrl),
    audioMeasured: Boolean(transcribed),
    videoFramesMeasured: framesMeasured,
    scriptText: script,
    durationSeconds,
  });

  // ── Creator-value insights ─────────────────────────────
  // Deterministic "score potential": when a layer has at least one actionable
  // fix, we assume applying it lifts that layer to the 88 safe band — never to
  // perfection, and never above the layer's current score if already higher.
  // Reweighted with the exact same formula as `overall`, so the projection is
  // auditable rather than a marketing number.
  const hasBlockingScript = scriptResult.issues.some(
    (i) => i.monetizationImpact === 'demonetized' || i.reviewSeverity === 'critical',
  );
  const copyrightFixable = copyrightResult.musicMatchRisk !== 'Low';
  // Unmeasured hook (no script) is not "fixable" — nothing was read.
  const hookFixable = hookResult.analyzed !== false && hookResult.first30SecRetention < 70;
  const voiceFixable = voiceResult.syntheticArtifactRisk !== 'Low' || voiceResult.isMonotone === true;
  // Unmeasured thumbnail (null) is not "fixable" — we don't manufacture a fix for
  // a layer that never ran. Only a measured, sub-80 CTR counts.
  const thumbnailFixable = (thumbnailResult.ctrPredictionScore ?? 100) < 80;
  const authenticityFixable = scriptResult.issues.length > 0 || voiceFixable;
  const monetizationFixable = hasBlockingScript || copyrightFixable;

  const blockingCount =
    scriptResult.issues.filter(
      (i) => i.monetizationImpact === 'demonetized' || i.reviewSeverity === 'critical',
    ).length + (copyrightResult.musicMatchRisk === 'High' ? 1 : 0);
  const highCount =
    scriptResult.issues.filter(
      (i) =>
        !(i.monetizationImpact === 'demonetized' || i.reviewSeverity === 'critical') &&
        (i.monetizationImpact === 'demoted' || i.reviewSeverity === 'warning' || i.severity === 'high'),
    ).length + (copyrightResult.musicMatchRisk === 'Medium' ? 1 : 0) + (hookFixable ? 1 : 0);
  const totalFixes =
    scriptResult.issues.length +
    (hookFixable ? 1 : 0) +
    (voiceFixable ? 1 : 0) +
    (copyrightFixable ? 1 : 0) +
    (thumbnailFixable ? 1 : 0);

  const lift = (s: number, fixable: boolean) => (fixable && s < 88 ? 88 : s);
  // Same null-aware weighting as `overall` (headlineWeightedScore) so the
  // projection stays auditable against the headline: an unrun layer contributes
  // neither weight nor a fabricated 88 from `lift`.
  const scorePotential = Math.max(overall, Math.min(97, headlineWeightedScore({
    monetization: lift(monetization, monetizationFixable),
    copyright: lift(copyright, copyrightFixable),
    hook: hook !== null ? lift(hook, hookFixable) : null,
    authenticity: lift(authenticity, authenticityFixable),
    seo,
    brandSafety,
  })));

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
      // The same resolution the engines used: the written script when there is
      // one, else the transcript. `input.scriptText ?? …` is dead because the
      // route always sends a string.
      scriptText: providedScript || transcribed?.transcript,
      // Every policy check in this report read `durationSeconds` above, where
      // the measured frame decode outranks the transcript outranks the typed
      // estimate. The badge must show the same number, or a video that measured
      // 62s can pass the TikTok floor on a 60s display and contradict itself.
      videoDuration: durationDisplay(durationSeconds),
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
    scriptAnalysis: {
      gptProbability: scriptResult.gptProbability,
      storytellingArc: scriptResult.storytellingArc,
    },
    voiceAnalysis:     voiceResult,
    // Real when the browser decoded frames, explicitly unmeasured when it did not.
    // `video-engine.ts` owns both states; nothing here invents a visual number.
    videoAnalysis: videoResult,
    thumbnailAnalysis: thumbnailResult,
    seoAnalysis: {
      titleOptimizationScore: seoResult.seoScore,
      // Honest label: this is the keyword-targeting quality of the
      // title+description the engine saw, not a separate description metric
      // the engine never computes.
      descriptionScore: seoResult.keywordScore,
      keywordDensity: computeKeywordDensity(input.title, input.description ?? '', script),
      rankingOpportunity: seoResult.seoScore >= 80 ? 'High' : seoResult.seoScore >= 65 ? 'Medium' : 'Low',
      // No fabricated percentile. Real competitor comparison needs channel-level data we do not have yet.
      competitorComparison: 'Comparison requires a connected channel — connect a YouTube channel in Settings for benchmarked ranking data.',
      suggestedTags: seoResult.tags.slice(0, 4),
      suggestedHashtags: seoResult.tags.slice(4, 7).map((t) => `#${t.replace(/\s+/g, '')}`),
      generatedDescription: seoResult.description,
      // Only kept when the engine actually saw the creator's description —
      // see generateSEOAnalysis; heuristicSEO always returns [] here.
      timestamps: seoResult.timestamps,
      // Deterministic script-term coverage — the real gap analysis the
      // qualitative model scores cannot substitute for.
      keywordGaps: seoResult.keywordGaps ?? null,
    },
    copyrightAnalysis: copyrightResult,
    hookAnalysis: hookResult,
    platformReports: platformResults,
    authenticity: authenticityResult,
    monetizationRisk,
    scorecards,
    insights: { scorePotential, blockingCount, highCount, totalFixes },
  };
}
