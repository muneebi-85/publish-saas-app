'use client';

import React from 'react';
import { Mic, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { VoiceMetric } from '@/lib/types';

export const VoiceAnalyzer: React.FC<{ voice: VoiceMetric }> = ({ voice }) => {
  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Voice analysis
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Pitch, pace, emotion, and synthetic voice artifact detection.
            </p>
          </div>
        </div>
        <Badge variant={voice.syntheticArtifactRisk === 'Low' ? 'success' : 'warning'} dot>
          Synthetic risk: {voice.syntheticArtifactRisk}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          // Per-field provenance: naturalness and emotion are model estimates
          // over the transcript even when audio ran, so they never claim to be
          // DSP measurements. Pace and monotone come from the transcription
          // when one ran (null = not computed this review).
          { label: 'Naturalness', value: voice.naturalness === null ? 'Not measured' : `${voice.naturalness}%`, sub: voice.naturalness === null ? 'Needs model pass' : 'Estimated from transcript' },
          { label: 'Emotion',     value: voice.emotionScore === null ? 'Not measured' : `${voice.emotionScore}/100`, sub: voice.emotionScore === null ? 'Needs model pass' : 'Estimated from transcript' },
          { label: 'Pace',        value: voice.speakingPaceWpm === null ? 'Not measured' : `${voice.speakingPaceWpm} WPM`, sub: voice.speakingPaceWpm === null ? 'Needs duration' : (voice.speakingPaceWpm < 180 ? 'Comfortable' : 'A touch fast') },
          { label: 'Monotone',    value: voice.isMonotone === null ? 'Not measured' : (voice.isMonotone ? 'Yes' : 'No'), sub: voice.isMonotone === null ? 'Needs audio DSP' : (voice.isMonotone ? 'Add pitch variation' : 'Dynamic range') },
        ].map((m) => (
          <div key={m.label} className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{m.label}</div>
            <div className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mt-1">{m.value}</div>
            <div className="text-[11px] text-ink-500 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 pt-1 space-y-2">
        <h4 className="text-[12px] font-semibold text-brand-600">Recommendations</h4>
        {voice.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
            {rec}
          </div>
        ))}
      </div>
    </section>
  );
};
