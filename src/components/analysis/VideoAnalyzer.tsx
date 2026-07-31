'use client';

import React from 'react';
import { Video, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { VideoMetric } from '@/lib/types';

/**
 * Video & editing layer. Frame-level signals (pacing, transitions, artifacts)
 * are only honest when a video source was connected; otherwise the orchestrator
 * reports "not analyzed" and this surface says so instead of inventing numbers.
 */
export const VideoAnalyzer: React.FC<{ video: VideoMetric }> = ({ video }) => {
  const measured = video.editingPacingScore !== null;

  return (
    <section className="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center shrink-0 shadow-subtle">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Video &amp; editing analysis
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Editing pace, transitions, resolution, and AI-visual artifact risk.
            </p>
          </div>
        </div>
        <Badge variant={video.aiVisualArtifactRisk === 'Low' ? 'success' : 'warning'} dot>
          AI-visual risk: {video.aiVisualArtifactRisk}
        </Badge>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: 'Editing pace', value: measured ? `${video.editingPacingScore}/100` : 'Not analyzed', sub: measured ? 'Scene-density pacing' : 'Needs video source' },
          { label: 'Transitions',  value: video.sceneTransitionRate, sub: 'Cut density' },
          { label: 'Resolution',   value: video.resolution, sub: 'Master file quality' },
          { label: 'Compression',  value: video.compressionQuality, sub: 'Artifact check' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-surface-canvas border border-ink-200 p-4">
            <div className="text-[11px] font-medium text-ink-500">{m.label}</div>
            <div className="text-[15px] font-semibold text-ink-900 mt-1">{m.value}</div>
            <div className="text-[11px] text-ink-500 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 pt-1 space-y-2">
        <h4 className="text-[12px] font-semibold text-brand-600">Recommendations</h4>
        {video.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-600 shrink-0 mt-0.5" />
            {rec}
          </div>
        ))}
      </div>
    </section>
  );
};
