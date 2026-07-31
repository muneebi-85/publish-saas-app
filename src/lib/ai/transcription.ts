import { env } from '@/lib/env';

/**
 * Real speech-to-text via Deepgram's pre-recorded API.
 *
 * Deepgram fetches the media URL itself and returns word-level timings, which
 * we use to derive *measured* voice-DSP metrics (pace, pauses, monotone) —
 * replacing the transcript-text heuristics used when transcription is absent.
 */

export interface TranscriptionResult {
  /** Punctuated transcript of everything spoken in the media. */
  transcript: string;
  /** Media duration in seconds, as reported by Deepgram. */
  durationSeconds: number;
  /** Number of words recognized. */
  wordCount: number;
  /** Measured speaking pace in words per minute. */
  speakingPaceWpm: number;
  /** Fraction of the media spent in inter-word pauses (> 0.45s count). */
  pauseRatio: number;
  /** True when word durations are unusually uniform (robotic/flat delivery). */
  isMonotone: boolean;
}

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen';
/** Inter-word gaps at or below this are articulation, not pauses. */
const PAUSE_FLOOR_S = 0.45;
/** Coefficient of variation below which pacing is treated as monotone. */
const MONOTONE_CV_THRESHOLD = 0.5;

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        words?: DeepgramWord[];
      }>;
    }>;
  };
}

export async function transcribeAudio(mediaUrl: string): Promise<TranscriptionResult> {
  const res = await fetch(
    `${DEEPGRAM_ENDPOINT}?model=nova-3&punctuate=true&smart_format=true&utterances=false`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: mediaUrl }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) {
    throw new Error(`Deepgram transcription failed (${res.status}).`);
  }

  const data = (await res.json()) as DeepgramResponse;
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  const words = alternative?.words ?? [];
  const transcript = alternative?.transcript?.trim() ?? '';
  const duration = data.metadata?.duration ?? 0;

  if (!transcript || words.length === 0 || duration <= 0) {
    throw new Error('Deepgram returned no usable transcription.');
  }

  // Speaking pace: words per minute over the real media duration.
  const speakingPaceWpm = (words.length / duration) * 60;

  // Pauses: time spent in inter-word gaps above the articulation floor.
  let pauseSeconds = 0;
  for (let i = 1; i < words.length; i += 1) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > PAUSE_FLOOR_S) pauseSeconds += gap;
  }
  const pauseRatio = pauseSeconds / duration;

  // Monotone: low variance in word durations is robotic pacing. Real speech
  // alternates short function words and longer content words, so its
  // coefficient of variation sits well above the threshold.
  const durations = words.map((w) => w.end - w.start);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((a, b) => a + (b - mean) ** 2, 0) / durations.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  const isMonotone = coefficientOfVariation < MONOTONE_CV_THRESHOLD;

  return {
    transcript,
    durationSeconds: duration,
    wordCount: words.length,
    speakingPaceWpm: Math.round(speakingPaceWpm * 10) / 10,
    pauseRatio: Math.round(pauseRatio * 100) / 100,
    isMonotone,
  };
}
