/**
 * Video & editing layer, from frames the browser actually decoded.
 *
 * The layer this replaces returned `'Not analyzed — video source not connected'`
 * for every visual field, which was honest and useless. It is now split cleanly in
 * two, and the split matters more than either half:
 *
 *   MEASURED, no model involved — resolution, total bitrate, cut count, static
 *     pairs, and the seconds of footage those counts cover. These come from a
 *     decode in the uploader's browser (`src/lib/video/extract-frames.ts`) and are
 *     arithmetic over real pixels. `basis` states exactly what was sampled.
 *   JUDGED, by the vision model — camera movement, shot variety, AI-artifact tells,
 *     and the opening three seconds. These are opinions about two contact sheets.
 *
 * `editingPacingScore` sits deliberately in between: a heuristic mapping from a
 * measured cut rate, which is why `basis` names it as such rather than presenting
 * it as observed. The distinction is the only thing that stops this layer becoming
 * the next "trained on 12.7M videos".
 */

import { analyzeImage, extractJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';
import type { VideoMetric } from '../types';
import type { PlatformName } from './platform-engine';
// The sampling constants, imported rather than re-hardcoded: the vision prompts
// and the basis sentence state what was sampled, and both must stay true when
// the constants are tuned. frame-signals.ts is DOM-free by design.
import { HOOK_FRAMES, PROBE_INTERVAL, PROBE_WINDOWS } from '../video/frame-signals';

/**
 * What the browser measured, plus where it put the sheets.
 *
 * Mirrors `FrameSignals` in `src/lib/video/extract-frames.ts`, minus the Blobs and
 * plus their uploaded URLs. `meanDeltaPermille` is an integer for one reason: the
 * request validator has `v.integer` and no float equivalent, and a hand-rolled
 * float check on the hot path of an untrusted body is not worth the exposure.
 */
export interface VideoFrameInput {
  /** Contact sheet across the runtime. Fetched server-side by the vision model. */
  sheetUrl: string;
  /** Contact sheet of the opening three seconds, when one was built. */
  hookSheetUrl?: string;
  width: number;
  height: number;
  durationSeconds: number;
  /** Whole file, audio included — which is why bitrate is reported as total. */
  sizeBytes: number;
  sheetFrames: number;
  /** Frame pairs compared inside the probe bursts. The denominator for every rate. */
  comparisons: number;
  cuts: number;
  staticPairs: number;
  meanDeltaPermille: number;
  probedSeconds: number;
}

interface RawSheetResponse {
  cameraMovement: string;
  shotVariety: number;
  onScreenText: string;
  aiVisualArtifactRisk: 'Low' | 'Medium' | 'High';
  visualQualityScore: number;
  recommendations: string[];
}

interface RawHookResponse {
  visualHookScore: number;
  verdict: string;
  recommendations: string[];
}

/**
 * Shared recommendation discipline, lifted from the thumbnail layer.
 *
 * Kept as one string rather than restated per prompt because the failure it
 * prevents is identical in both: a model that has been shown a real image and
 * answers "improve your pacing".
 */
const RULES = `RECOMMENDATION RULES (every string in "recommendations" MUST satisfy all four, woven naturally as 1-2 sentences — not labeled fields):
- WHERE: name the exact frame or region ("frame 3, top-left", "the fourth cell where the subject leaves frame", "the two identical middle frames"). Never a whole-video generality.
- WHY: the mechanism plus the specific platform behaviour it triggers (mid-video retention, swipe-away in the first seconds, Shorts loop completion, synthetic-content disclosure).
- WHAT: a concrete change with a number or a before->after ("cut the 4s static wide at frame 2 down to 1.5s", "reframe the subject from centre to the left third").
- IMPACT: an honest mechanism or range, never a guarantee. Do NOT invent a measured percentage, view count, or retention figure you cannot observe.

BANNED — never output these or any paraphrase: "improve the pacing", "make it more engaging", "add more cuts", "increase production value", "be more dynamic", "use better lighting" (with no frame named), or any advice lacking an exact location. Never guarantee monetization, approval, or a view number.`;

function sheetPrompt(cols: number, frames: number, seconds: number): string {
  return `${TRUST_SYSTEM_PREAMBLE}

You are the video & editing review layer for Publish. The image is a CONTACT SHEET: ${frames} still frames sampled at even intervals across a ${seconds}-second video, laid out left-to-right then top-to-bottom in ${cols} columns. Read it as a filmstrip in that order. Black cells are frames that failed to decode — ignore them, do not describe them.

You are judging the FRAMES ONLY. You cannot hear audio, you cannot see motion within a shot, and you cannot count cuts between two sampled frames that are seconds apart — do not claim to. Cut density is measured separately and is not your job.

EVALUATE:
1. Camera movement and framing: is the camera static, locked to a tripod, handheld, moving? Does framing change between shots, or is every frame the same setup? Judge from differences in framing across cells, not from motion you cannot see.
2. Shot variety: how many visually distinct setups, locations, or compositions appear across the sheet? A sheet of twelve near-identical frames is one setup.
3. On-screen text and graphics: do overlays, captions, or b-roll graphics appear, and are they legible at this size?
4. AI-visual artifact risk: warped hands, inconsistent faces between frames, melted text, impossible geometry, temporal flicker between otherwise matched frames. Low unless you can point at the frame.
5. Visual quality: exposure, focus, colour, and whether the subject reads clearly at feed size.

${RULES}

Return JSON only, exactly this schema and these field names:
{
  "cameraMovement":       string,          // e.g. "Static tripod, single setup throughout"
  "shotVariety":          number,          // 0..100
  "onScreenText":         string,          // e.g. "Burned-in captions in the lower third of every frame"; "None visible"
  "aiVisualArtifactRisk": "Low" | "Medium" | "High",
  "visualQualityScore":   number,          // 0..100
  "recommendations":      string[]         // 2-3 strings obeying the rules above
}`;
}

function hookPrompt(seconds: number, platform: PlatformName): string {
  return `${TRUST_SYSTEM_PREAMBLE}

You are judging the VISUAL HOOK. The image is a contact sheet of ${seconds} frames sampled from the FIRST THREE SECONDS of a video, left to right in time order. On ${platform}, this is the window in which the viewer decides to keep watching or swipe, and it is decided on the picture before a word has landed.

EVALUATE, in this order of weight:
1. Is there a subject, a face, or a legible object in frame immediately — or does it open on a logo, a black frame, a slate, or an empty establishing wide?
2. Does anything visibly change across these frames, or is the opening static?
3. Is there text on screen, and is it short enough to read in under a second?
4. Does the frame create a question, a stake, or a visible payoff to come?

Score honestly and low when the opening is weak. An intro card, a logo animation, or a static wide with no subject is a poor visual hook regardless of what follows, and saying so is the entire value of this check.

${RULES}

Return JSON only, exactly this schema and these field names:
{
  "visualHookScore": number,    // 0..100
  "verdict":         string,    // one sentence naming what the first frames actually show
  "recommendations": string[]   // 1-2 strings obeying the rules above
}`;
}

/**
 * Analyze decoded frames. Never throws — a vision failure degrades to the
 * measured half, which is still real.
 *
 * The creator's AI declaration is deliberately NOT an input here: the frames
 * were decoded, so the artifact risk is read from the frames themselves —
 * folding the self-report in would let a declaration inflate or deflate a
 * value the vision pass actually measured.
 */
export async function analyzeVideoFrames(
  signals: VideoFrameInput,
  platform: PlatformName,
): Promise<VideoMetric> {
  const cols = signals.height > signals.width ? 6 : 4;

  // Both sheets in flight together. Two calls, not one: the runtime sheet cannot
  // answer a question about the first three seconds, and folding the hook into the
  // spread would get it judged against frames from ten minutes later.
  const [sheetText, hookText] = await Promise.all([
    safeVision(signals.sheetUrl, sheetPrompt(cols, signals.sheetFrames, signals.durationSeconds)),
    signals.hookSheetUrl
      ? safeVision(signals.hookSheetUrl, hookPrompt(HOOK_FRAMES, platform))
      : Promise.resolve(null),
  ]);

  const sheet = sheetText ? extractJSON<RawSheetResponse>(sheetText) : null;
  const hook = hookText ? extractJSON<RawHookResponse>(hookText) : null;

  const cutsPerMinute = cutRate(signals);
  const staticRatio = signals.comparisons > 0 ? signals.staticPairs / signals.comparisons : 0;
  const isShort = signals.durationSeconds > 0 && signals.durationSeconds <= 60;

  const recommendations = [
    ...(hook?.recommendations ?? []).slice(0, 2),
    ...(sheet?.recommendations ?? []).slice(0, 3),
  ]
    .map((r) => scrubForbidden(r).clean)
    .filter((r) => r.trim().length > 0)
    .slice(0, 4);

  // Nothing measured is ever left unsaid. When the model returned nothing at all,
  // the pacing and static findings still stand on their own.
  const measuredNotes = pacingNotes(signals, cutsPerMinute, staticRatio, isShort);

  return {
    measured: true,
    editingPacingScore: pacingScore(cutsPerMinute, staticRatio, isShort),
    cameraMovementRating: sheet
      ? scrubForbidden(sheet.cameraMovement || 'Not determined from frames').clean
      : 'Frames decoded, but the vision layer did not return a reading',
    sceneTransitionRate: transitionSentence(signals, cutsPerMinute),
    frameRepetitionCount: signals.staticPairs,
    aiVisualArtifactRisk: sheet
      ? normalizeRisk(sheet.aiVisualArtifactRisk)
      // Vision returned nothing: the artifact read is unevaluated, and an
      // unevaluated layer never asserts the safe band. 'Medium' matches
      // normalizeRisk's own default for unknown values.
      : 'Medium',
    resolution: resolutionLabel(signals.width, signals.height),
    compressionQuality: compressionLabel(signals),
    visualHookScore: hook ? conservativeScore(hook.visualHookScore ?? 50) : null,
    shotVarietyScore: sheet ? conservativeScore(sheet.shotVariety ?? 50) : null,
    onScreenText: sheet ? scrubForbidden(sheet.onScreenText || 'Not determined').clean : null,
    visualHookVerdict: hook ? scrubForbidden(hook.verdict || '').clean || null : null,
    basis: basisSentence(signals),
    recommendations: recommendations.length > 0 ? recommendations : measuredNotes,
  };
}

/** Cuts per minute of PROBED footage — never extrapolated across the runtime. */
function cutRate(s: VideoFrameInput): number | null {
  if (s.comparisons < 2 || s.probedSeconds <= 0) return null;
  return (s.cuts / s.probedSeconds) * 60;
}

/**
 * `1920x1080 (1080p)`.
 *
 * The p-label uses the SHORT side, which is correct for both orientations: a
 * 1080x1920 vertical export is 1080p, and taking the height would call it 1920p.
 */
export function resolutionLabel(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return 'Unknown';
  const p = Math.min(width, height);
  const label =
    p >= 2160 ? '4K'
    : p >= 1440 ? '1440p'
    : p >= 1080 ? '1080p'
    : p >= 720 ? '720p'
    : p >= 480 ? '480p'
    : `${p}p`;
  const shape = height > width ? ', vertical' : width === height ? ', square' : '';
  return `${width}x${height} (${label}${shape})`;
}

/**
 * YouTube's own published recommended upload bitrates for SDR 30fps, by
 * resolution. Used as the comparison point so the verdict cites a real standard
 * rather than a number invented here.
 */
const BITRATE_GUIDE: ReadonlyArray<{ minSide: number; mbps: number; label: string }> = [
  { minSide: 2160, mbps: 35, label: '4K' },
  { minSide: 1440, mbps: 16, label: '1440p' },
  { minSide: 1080, mbps: 8, label: '1080p' },
  { minSide: 720, mbps: 5, label: '720p' },
  { minSide: 0, mbps: 2.5, label: '480p' },
];

/**
 * `8.4 Mbps total (at or above YouTube's 8 Mbps guide for 1080p)`.
 *
 * "Total" is load-bearing: the figure is the whole file over its duration, so it
 * includes the audio track. Calling it a video bitrate would overstate it by a few
 * hundred kbps, and the honest word costs nothing.
 */
export function compressionLabel(s: Pick<VideoFrameInput, 'sizeBytes' | 'durationSeconds' | 'width' | 'height'>): string {
  if (!(s.sizeBytes > 0) || !(s.durationSeconds > 0)) return 'Unknown';
  const mbps = (s.sizeBytes * 8) / s.durationSeconds / 1_000_000;
  const side = Math.min(s.width, s.height);
  const guide = BITRATE_GUIDE.find((g) => side >= g.minSide) ?? BITRATE_GUIDE[BITRATE_GUIDE.length - 1];
  const shown = mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1);
  return mbps >= guide.mbps
    ? `${shown} Mbps total (at or above YouTube's ${guide.mbps} Mbps guide for ${guide.label})`
    : `${shown} Mbps total (below YouTube's ${guide.mbps} Mbps guide for ${guide.label})`;
}

/** `1 cut every 1.4s (15 cuts across 8s probed)`, or an honest absence. */
function transitionSentence(s: VideoFrameInput, cutsPerMinute: number | null): string {
  if (cutsPerMinute === null) return 'Not measured — too few comparable frames decoded';
  if (s.cuts === 0) return `No hard cuts in the ${Math.round(s.probedSeconds)}s sampled`;
  const every = s.probedSeconds / s.cuts;
  return `1 cut every ${every.toFixed(1)}s (${s.cuts} cuts across ${Math.round(s.probedSeconds)}s probed)`;
}

/**
 * Heuristic 0-100 from the measured cut rate. Not a measurement, and `basis` says so.
 *
 * The bands are wide on purpose. The defensible claim is "a video with no visual
 * change for minutes at a time loses mid-video retention, and one cutting eighty
 * times a minute is exhausting"; the indefensible one is that 14 cuts per minute
 * scores 81 and 15 scores 84. Wide bands make the score robust to the sampling
 * error a probe necessarily has.
 */
export function pacingScore(
  cutsPerMinute: number | null,
  staticRatio: number,
  isShort: boolean,
): number | null {
  if (cutsPerMinute === null) return null;

  // Shorts and Reels are cut two to four times faster than long-form for the same
  // perceived pace, so the same rate is judged against a shifted target.
  const cpm = isShort ? cutsPerMinute / 2.5 : cutsPerMinute;

  const base =
    cpm < 2 ? 45
    : cpm < 6 ? 62
    : cpm < 15 ? 80
    : cpm < 40 ? 90
    : cpm < 80 ? 76
    : 58;

  // Frozen footage is a separate fault from a slow cut rate, and a video can have
  // both. Two-fifths of probed pairs identical is a hold, a slate, or padding.
  const penalty = staticRatio > 0.4 ? 18 : staticRatio > 0.2 ? 8 : 0;
  return conservativeScore(base - penalty);
}

/** Exactly what the decode covered, so every number above can be weighed. */
function basisSentence(s: VideoFrameInput): string {
  const probe =
    s.comparisons >= 2
      ? `cut density from ${s.comparisons} frame pairs ${PROBE_INTERVAL}s apart, covering ${Math.round(s.probedSeconds)}s of footage sampled in ${PROBE_WINDOWS} windows`
      : 'cut density not measurable from the frames that decoded';
  return `Measured in your browser from ${s.sheetFrames} frames spread across the file, plus ${probe}. Resolution and bitrate are read from the file itself. Editing pace is a banded reading of the measured cut rate, not an observed score; camera movement, shot variety and artifact risk are a vision model's judgement of the sampled frames.`;
}

/**
 * Fallback advice built only from measured numbers.
 *
 * Used when the vision layer returned nothing. The measurements are still real, so
 * the layer still has something true to say — which is the difference between a
 * degraded result and an empty one.
 */
function pacingNotes(
  s: VideoFrameInput,
  cutsPerMinute: number | null,
  staticRatio: number,
  isShort: boolean,
): string[] {
  const out: string[] = [];

  if (cutsPerMinute !== null) {
    const rounded = cutsPerMinute.toFixed(1);
    if (cutsPerMinute < 2) {
      out.push(
        `Across the ${Math.round(s.probedSeconds)}s sampled the picture changed ${s.cuts === 0 ? 'not once' : `only ${s.cuts} time${s.cuts === 1 ? '' : 's'}`} — about ${rounded} cuts per minute. A frame that holds for tens of seconds is where mid-video drop-off concentrates${isShort ? ', and on a Short a static frame is usually a swipe' : ''}. Find the longest unbroken stretch and break it with a reframe, a cutaway, or an insert.`,
      );
    } else if (cutsPerMinute > (isShort ? 200 : 80)) {
      out.push(
        `The sampled footage cuts about ${rounded} times a minute. Past roughly ${isShort ? 200 : 80} the viewer stops resolving each shot before the next arrives; hold the two or three shots that carry the point for a beat longer than the rest.`,
      );
    }
  }

  if (staticRatio > 0.2) {
    out.push(
      `${s.staticPairs} of ${s.comparisons} sampled frame pairs were effectively identical, which reads as a freeze, a held slate, or padding rather than an edit. Trim those holds to the length of the sentence being spoken over them.`,
    );
  }

  if (out.length === 0) {
    out.push(
      `Frames decoded and the measured signals came back inside normal ranges: ${transitionSentence(s, cutsPerMinute).toLowerCase()}, at ${resolutionLabel(s.width, s.height)}. The visual-judgement half of this layer did not return a reading on this run, so camera movement and artifact risk are unrated rather than passed.`,
    );
  }

  return out;
}

async function safeVision(url: string, prompt: string): Promise<string | null> {
  try {
    return await analyzeImage(url, prompt, { temperature: 0.3, maxTokens: 900 });
  } catch (err) {
    console.error('[video-engine] vision call failed:', (err as Error).message);
    return null;
  }
}

function normalizeRisk(v: string | undefined): 'Low' | 'Medium' | 'High' {
  if (v === 'High' || v === 'Medium' || v === 'Low') return v;
  return 'Medium';
}

/**
 * The explicit "no frames were decoded" result.
 *
 * Reached when no video file was attached, when the browser could not decode the
 * one that was, or when storage is not configured so the sheets had nowhere to go.
 * Every visual field is null or names itself as unmeasured. `editingPacingScore`
 * takes the thumbnail's composition score when there is one, which is the same
 * stand-in this layer used before frames existed — it is a still-image signal, so
 * `basis` says which one it is rather than letting it pass as editing.
 */
export function unmeasuredVideo(
  platform: PlatformName,
  aiGenerated: boolean,
  thumbnailComposition: number | null,
): VideoMetric {
  const vertical = platform === 'TikTok' || platform === 'Instagram';
  return {
    measured: false,
    editingPacingScore: thumbnailComposition,
    cameraMovementRating: 'Not analyzed — no video frames were decoded',
    sceneTransitionRate: 'Not analyzed — no video frames were decoded',
    frameRepetitionCount: null,
    // 'Medium' per the conservative-default convention used by normalizeRisk:
    // this layer asserts no safe band for footage nobody looked at. (An
    // AI-declared upload keeps Medium for the same reason — the risk is
    // unevaluated, not cleared.)
    aiVisualArtifactRisk: 'Medium',
    resolution: 'Unknown',
    compressionQuality: 'Unknown',
    visualHookScore: null,
    shotVarietyScore: null,
    onScreenText: null,
    visualHookVerdict: null,
    basis:
      thumbnailComposition === null
        ? 'No video frames were decoded, so nothing on this layer was measured.'
        : 'No video frames were decoded. The pace figure shown is the thumbnail composition score standing in for it — a still-image signal, not an editing measurement.',
    recommendations: [
      aiGenerated
        ? `The upload is flagged as containing AI-generated visuals, so before publishing decide whether they could be read as depicting a real person or real event — if they can (a real face, a real location, a news-style event), YouTube's synthetic-content policy expects the "Altered content" disclosure in the Details step, and for an EU audience the AI Act's transparency duty applies. If the AI visuals are clearly stylized b-roll or graphics no viewer would mistake for real footage, disclosure is not required; either way, self-labeling when in doubt keeps the choice on your terms rather than the platform's, at no cost to reach.`
        : `No frames were decoded from a video file, so the frame-level checks — cut density, held frames, resolution, bitrate, camera movement and AI-visual tells — are reported as not analyzed rather than passed. Attach the exported ${vertical ? '9:16 ' : ''}master you are about to publish and these become measured: cut density is sampled from real frame pairs, and resolution and bitrate are read straight off the file.`,
      `Cut density and held frames are the two frame-level levers most tied to mid-video retention, and both are measurable from the file you already have. Until one is attached, this layer contributes nothing to your score in either direction — it is blank, not passing.`,
    ],
  };
}
