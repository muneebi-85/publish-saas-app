/**
 * Voice analyzer.
 *
 * True voice analysis needs signal-processing (WPM, pitch variance, artifact
 * detection) via Deepgram/AssemblyAI. Until those APIs are wired in, this engine
 * uses NIM to reason over metadata + transcript excerpt and returns a
 * best-effort review; when neither is available, deterministic mock output.
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
}

interface RawVoiceResponse {
  naturalness:            number;
  emotionScore:           number;
  isMonotone:             boolean;
  syntheticArtifactRisk:  'Low' | 'Medium' | 'High';
  recommendations:        string[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

You are the voice-review layer.

Given transcript excerpt and metadata about a voiceover, estimate: naturalness,
emotion, monotone risk, and synthetic-artifact risk. When the source is explicitly
labeled as AI-generated, treat synthetic artifact risk as at least Medium.

Return JSON:
{
  "naturalness":            number,  // 0..100
  "emotionScore":           number,  // 0..100
  "isMonotone":             boolean,
  "syntheticArtifactRisk":  "Low" | "Medium" | "High",
  "recommendations":        string[] // 2-3 actionable notes
}`;

export async function analyzeVoice(input: VoiceAnalysisInput): Promise<VoiceMetric> {
  const wpm =
    input.wordCount && input.durationSeconds
      ? Math.round((input.wordCount / input.durationSeconds) * 60)
      : 150;

  const raw = await chatJSON<RawVoiceResponse>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
`Words: ${input.wordCount ?? 'unknown'}
Duration: ${input.durationSeconds ?? 'unknown'}s (${wpm} WPM)
AI-generated: ${input.aiGenerated ? 'yes' : 'no'}
Source label: ${input.voiceSourceLabel || 'unspecified'}
Transcript excerpt: """${(input.transcript || '').slice(0, 1500)}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.3, maxTokens: 700 },
  );

  if (!raw) return mockVoice(input);

  return {
    naturalness:   conservativeScore(raw.naturalness ?? 75),
    emotionScore:  conservativeScore(raw.emotionScore ?? 70),
    pauseRatio:    0.14,
    speakingPaceWpm: wpm,
    isMonotone:    !!raw.isMonotone,
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

export function mockVoice(input: VoiceAnalysisInput): VoiceMetric {
  const wpm =
    input.wordCount && input.durationSeconds
      ? Math.round((input.wordCount / input.durationSeconds) * 60)
      : 154;
  return {
    naturalness: conservativeScore(input.aiGenerated ? 78 : 88),
    emotionScore: 78,
    pauseRatio: 0.14,
    speakingPaceWpm: wpm,
    isMonotone: false,
    syntheticArtifactRisk: input.aiGenerated ? 'Medium' : 'Low',
    recommendations: [
      input.aiGenerated
        ? 'Enable YouTube\'s synthetic content disclosure — required for AI voiceover under 2026 rules.'
        : 'Slight vocal cadence drop around technical jargon — add breathing pauses at section transitions.',
      'Add 0.3s longer breathing pauses between major section transitions.',
    ],
  };
}
