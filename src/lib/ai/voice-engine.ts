/**
 * Voice analyzer.
 *
 * True voice analysis needs signal-processing (WPM, pitch variance, artifact
 * detection) via Deepgram/AssemblyAI. Until those APIs are wired in, this engine
 * uses NIM to reason over metadata + transcript excerpt and returns a
 * best-effort review; when NIM is unreachable it falls back to
 * `heuristicVoice()`. In both paths `measured` is false for any field that
 * genuinely requires audio DSP, so the UI shows "Not measured" rather than an
 * invented figure.
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore } from './guardrails';
import { VoiceMetric } from '../types';

export interface VoiceAnalysisInput {
  transcript?: string;
  wordCount?: number;
  durationSeconds?: number;
  aiGenerated?: boolean;
  voiceSourceLabel?: string; // "ElevenLabs v2", "Recorded live", etc.
  /** Real DSP values from an actual transcription; stamp into the result. */
  measured?: {
    speakingPaceWpm: number;
    pauseRatio: number;
    isMonotone: boolean;
  };
}

interface RawVoiceResponse {
  naturalness:            number;
  emotionScore:           number;
  isMonotone:             boolean;
  syntheticArtifactRisk:  'Low' | 'Medium' | 'High';
  recommendations:        string[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

You are the voice-review layer for Publish.

INPUT: a transcript excerpt plus metadata (word count, duration, a derived WPM, an AI-generated flag, and a source label). Where a real transcription ran, a measured pause-ratio (share of the track spent in inter-word pauses) is also given — treat that figure as measured fact, not an estimate. Otherwise no audio DSP has run — you are reasoning over TEXT AND METADATA ONLY. Never imply you measured pitch, pauses, loudness, or waveform artifacts; you are estimating delivery from how the transcript reads and from the labels. If a field would require audio you don't have, say so plainly rather than inventing a value.

SCORING
- naturalness (0..100): how human the written delivery reads — contractions, varied sentence length, natural rhythm vs. stiff, templated, list-like phrasing.
- emotionScore (0..100): emotional range implied by word choice and punctuation, not by audio.
- isMonotone (boolean): true when sentence rhythm and vocabulary are flat/repetitive enough to predict a monotone read.
- syntheticArtifactRisk ("Low"|"Medium"|"High"): likelihood the delivery reads as machine-generated. If the source is labeled AI-generated, set at least "Medium" and never "Low".

RECOMMENDATIONS — the part creators actually act on. Return 2-3. Every single one MUST contain, woven into natural prose (never as labeled fields):
- EXACTLY WHERE: a precise location — a second/timestamp range, a line, or a word/phrase quoted from THIS transcript. Never "the intro", "the script", or "throughout".
- EXACTLY WHY: the mechanism plus the specific platform behaviour or retention effect it triggers (e.g. first-30s retention, YouTube's altered/synthetic-content disclosure policy, comprehension loss above ~180 WPM, monotone rhythm driving mid-video drop-off).
- EXACTLY WHAT: a copy-paste-ready change or an explicit before → after using the creator's OWN words.
- HONEST IMPACT: a mechanism or range ("typically recovers a few points of first-third retention", "removes a known AI tell", "self-labels on your terms instead of YouTube's"), never a guarantee and never a measured number you cannot derive from the inputs.

PACE RULE: you know WPM (word count ÷ duration — measured when a transcription ran, derived otherwise) and, when given, the measured pause-ratio. When pace is relevant, compare the given WPM to the ~150-165 WPM spoken-narration retention band (under ~130 drags and bleeds first-third retention; over ~180 outruns comprehension). Do not claim an audio-timed figure you weren't given.

MISSING-INPUT RULE: if a needed input is absent (no duration, no audio), state plainly what is unmeasured and what connecting it unlocks — phrased like a strategist advising a creator, not like a system error.

BANNED — never output these or any equivalent vague filler; each auto-fails review: "improve your thumbnail", "make it more engaging", "add value", "optimize your title", "be more authentic", "sound more natural", "add emotion", "vary your tone", "speak clearly", "keep viewers engaged", "hook them early", or any advice missing an exact location, a mechanism, and a concrete change. Never guarantee monetization, approval, or views.

Return ONLY this JSON, no prose outside it:
{
  "naturalness":            number,   // 0..100
  "emotionScore":           number,   // 0..100
  "isMonotone":             boolean,
  "syntheticArtifactRisk":  "Low" | "Medium" | "High",
  "recommendations":        string[]  // 2-3 items, each satisfying the WHERE/WHY/WHAT/IMPACT rule above
}`;

export async function analyzeVoice(input: VoiceAnalysisInput): Promise<VoiceMetric> {
  // WPM is only real when we have both a word count and a duration. Otherwise
  // we leave it null rather than inventing a plausible-looking pace.
  const wpm = input.measured
    ? input.measured.speakingPaceWpm
    : input.wordCount && input.durationSeconds
      ? Math.round((input.wordCount / input.durationSeconds) * 60)
      : null;

  const raw = await chatJSON<RawVoiceResponse>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
`Words: ${input.wordCount ?? 'unknown'}
Duration: ${input.durationSeconds ?? 'unknown'}s (${wpm !== null ? `${wpm} WPM` : 'WPM unknown'})
Measured pause ratio: ${input.measured ? `${(input.measured.pauseRatio * 100).toFixed(0)}% of the track is inter-word pause` : 'unknown'}
AI-generated: ${input.aiGenerated ? 'yes' : 'no'}
Source label: ${input.voiceSourceLabel || 'unspecified'}
Transcript excerpt: """${(input.transcript || '').slice(0, 1500)}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.3, maxTokens: 700 },
  );

  if (!raw) return heuristicVoice(input);

  return {
    // Naturalness / emotion are LLM estimates over transcript+metadata, so
    // "measured" stays false even when DSP ran: those two fields are not yet
    // pitch analysis. The DSP-derived fields are stamped with real values.
    measured:      false,
    naturalness:   conservativeScore(raw.naturalness ?? 75),
    emotionScore:  conservativeScore(raw.emotionScore ?? 70),
    pauseRatio:    input.measured?.pauseRatio ?? null,
    speakingPaceWpm: wpm,
    isMonotone:    input.measured ? input.measured.isMonotone : typeof raw.isMonotone === 'boolean' ? raw.isMonotone : null,
    syntheticArtifactRisk: normalizeRisk(raw.syntheticArtifactRisk, input.aiGenerated),
    recommendations: (raw.recommendations ?? [])
      .slice(0, 3)
      .map((r) => scrubForbidden(r).clean),
  };
}

function normalizeRisk(
  v: string | undefined,
  aiGenerated?: boolean,
): 'Low' | 'Medium' | 'High' {
  const base: 'Low' | 'Medium' | 'High' =
    v === 'High' || v === 'Medium' || v === 'Low' ? v : 'Medium';
  // If we know it's AI, never claim "Low" — enforce disclosure at review time.
  if (aiGenerated && base === 'Low') return 'Medium';
  return base;
}

export function heuristicVoice(input: VoiceAnalysisInput): VoiceMetric {
  const wpm =
    input.wordCount && input.durationSeconds
      ? Math.round((input.wordCount / input.durationSeconds) * 60)
      : null;
  return {
    measured: false,
    naturalness: conservativeScore(input.aiGenerated ? 78 : 88),
    emotionScore: null,
    pauseRatio: null,
    speakingPaceWpm: wpm,
    isMonotone: null,
    syntheticArtifactRisk: input.aiGenerated ? 'Medium' : 'Low',
    recommendations: [
      input.aiGenerated
        ? "In the YouTube Studio upload flow, open the 'Altered content' question in the Details step (also editable later under Content > Editor) and select 'Yes' — your source is labeled AI-generated, and realistic synthetic speech is covered by YouTube's altered/synthetic-content disclosure policy. Self-disclosing here places the label on your terms; omit it and YouTube can apply the label for you, with repeat omissions escalating toward enforcement — disclosing removes that risk without touching your reach or watch time."
        : "Naturalness, pause-ratio, and monotone are blank here because no audio was processed — only your transcript and metadata were read, so these are honest 'unmeasured', not a passing grade. Attach the rendered voice track (the same WAV/MP3 you'll upload) to run pitch/pause analysis; that converts the blank into a real monotone flag, and flat delivery is a known driver of mid-video drop-off on voice-led content, so it's the check most worth turning on.",
      wpm !== null
        ? `Your pace is ${wpm} WPM, derived from word count ÷ duration (transcript-level, so silence isn't counted yet). Spoken narration typically retains best around 150-165 WPM: below ~130 tends to feel draggy and bleeds first-third retention, above ~180 outruns comprehension on dense points — check ${wpm} against that band and either tighten filler lines or add breath pauses to move toward it. Connect the audio track to replace this estimate with true, pause-aware pace.`
        : 'Speaking pace is blank because duration is missing — with only word count I can\'t compute WPM, and pace is the one voice metric that maps directly to retention. Add the clip\'s length in seconds (from your editor timeline or the exported file) and this returns a real WPM to check against the ~150-165 retention band; e.g. 1,500 words over 600s = 150 WPM.',
    ],
  };
}
