'use client';

import React from 'react';
import { Video, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { VideoMetric } from '@/lib/types';

/**
 * Video & editing layer.
 *
 * WHY `video.measured` AND NOT A NULL CHECK
 * This used to read `editingPacingScore !== null`, which is true in the unmeasured
 * case too — the orchestrator puts the thumbnail's composition score there as a
 * stand-in. So the panel showed "78/100 · Scene-density pacing" for a review that
 * had never seen a frame of video. The flag is the only field that answers the
 * question the reader is actually asking.
 *
 * WHY `basis` IS ALWAYS RENDERED
 * Resolution and cut density are arithmetic over decoded pixels; camera movement
 * and artifact risk are a vision model's opinion of twelve stills; editing pace is
 * a banded reading of the measured cut rate. Four tiles that look identical cannot
 * carry that difference, and without it the judged half quietly borrows the
 * credibility of the measured half.
 */
export const VideoAnalyzer: React.FC<{ video: VideoMetric }> = ({ video }) => {
  const measured = video.measured;
  const score = (v: number | null | undefined) =>
    v === null || v === undefined ? 'Not measured' : `${v}/100`;

  const held =
    video.frameRepetitionCount === null
      ? 'Not measured'
      : `${video.frameRepetitionCount} held frame${video.frameRepetitionCount === 1 ? '' : 's'}`;

  const tiles = [
    {
      label: 'Editing pace',
      value: score(video.editingPacingScore),
      sub: measured ? 'Banded from measured cut rate' : 'Needs a video file',
    },
    {
      label: 'Cut density',
      value: video.sceneTransitionRate,
      sub: measured ? 'Counted from sampled frame pairs' : 'Needs a video file',
    },
    {
      label: 'Resolution',
      value: video.resolution,
      sub: measured ? 'Read from the file' : 'Needs a video file',
    },
    {
      label: 'Bitrate',
      value: video.compressionQuality,
      sub: measured ? 'Total, audio included' : 'Needs a video file',
    },
    {
      label: 'Visual hook',
      value: score(video.visualHookScore),
      sub: measured ? 'First three seconds' : 'Needs a video file',
    },
    {
      label: 'Shot variety',
      value: score(video.shotVarietyScore),
      sub: measured ? 'Distinct setups across samples' : 'Needs a video file',
    },
    {
      label: 'Held frames',
      value: held,
      sub: measured ? 'Near-identical sampled pairs' : 'Needs a video file',
    },
    {
      label: 'Camera movement',
      value: measured ? video.cameraMovementRating : 'Not measured',
      sub: measured ? "Vision model's reading" : 'Needs a video file',
    },
  ];

  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Video &amp; editing analysis
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Editing pace, cut density, resolution, and AI-visual artifact risk.
            </p>
          </div>
        </div>
        {measured ? (
          <Badge variant={video.aiVisualArtifactRisk === 'Low' ? 'success' : 'warning'} dot>
            AI-visual risk: {video.aiVisualArtifactRisk}
          </Badge>
        ) : (
          <Badge variant="default" dot>
            Not measured
          </Badge>
        )}
      </div>

      {!measured && (
        <div className="mx-6 mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-800 leading-relaxed">
          No video frames were decoded, so nothing on this layer was measured. Attach the
          exported master and cut density, held frames, resolution, and bitrate are read from
          the file itself — we don&apos;t estimate any of them without it.
        </div>
      )}

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {tiles.map((m) => (
          <div key={m.label} className="rounded-lg bg-surface-canvas border border-ink-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{m.label}</div>
            <div className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mt-1">{m.value}</div>
            <div className="text-[11px] text-ink-500 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {(video.visualHookVerdict || video.onScreenText) && (
        <div className="px-6 pb-5 -mt-1 space-y-2">
          {video.visualHookVerdict && (
            <div className="rounded-lg bg-surface-canvas border border-ink-200 p-3.5 text-[13px] text-ink-700 leading-relaxed">
              <span className="font-medium text-ink-900">First three seconds. </span>
              {video.visualHookVerdict}
            </div>
          )}
          {video.onScreenText && (
            <div className="rounded-lg bg-surface-canvas border border-ink-200 p-3.5 text-[13px] text-ink-700 leading-relaxed">
              <span className="font-medium text-ink-900">On-screen text. </span>
              {video.onScreenText}
            </div>
          )}
        </div>
      )}

      <div className="px-6 pb-6 pt-1 space-y-2">
        <h4 className="text-[12px] font-semibold text-brand-600">
          {measured ? 'Recommendations' : 'How to enable this layer'}
        </h4>
        {video.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
            {rec}
          </div>
        ))}
      </div>

      {video.basis && (
        <div className="px-6 pb-6 -mt-2 flex items-start gap-2 border-t border-ink-200 pt-4 mx-6">
          <Info className="w-3.5 h-3.5 text-ink-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-ink-500 leading-relaxed">{video.basis}</p>
        </div>
      )}
    </section>
  );
};
