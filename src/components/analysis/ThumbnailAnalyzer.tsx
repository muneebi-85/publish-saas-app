'use client';

import React from 'react';
import { Image as ImageIcon, Eye, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '../ui/Badge';
import { ThumbnailMetric } from '@/lib/types';

export const ThumbnailAnalyzer: React.FC<{ thumbnail: ThumbnailMetric; thumbnailUrl?: string }> = ({
  thumbnail, thumbnailUrl,
}) => {
  const measured = thumbnail.measured;
  const score = (v: number | null) => (v === null ? 'Not measured' : `${v}/100`);
  const faceEmotion =
    thumbnail.faceCount === null
      ? 'Not measured'
      : `${thumbnail.faceCount} face${thumbnail.faceCount === 1 ? '' : 's'} · ${thumbnail.dominantEmotion}`;
  const readability =
    thumbnail.textReadabilityScore === null
      ? 'Not measured'
      : `${thumbnail.textReadabilityScore}% · ${thumbnail.contrastRating}`;

  return (
    <section className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-100 text-ink-900 flex items-center justify-center shrink-0 shadow-subtle">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Thumbnail analysis
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Visual hierarchy, emotion, text legibility, and CTR prediction.
            </p>
          </div>
        </div>
        {measured ? (
          <Badge variant={thumbnail.clickbaitRisk === 'Low' ? 'success' : 'warning'} dot>
            Clickbait risk: {thumbnail.clickbaitRisk}
          </Badge>
        ) : (
          <Badge variant="default" dot>
            Not measured
          </Badge>
        )}
      </div>

      {!measured && (
        <div className="mx-6 mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-800 leading-relaxed">
          No thumbnail image was analyzed. Connect a thumbnail to enable CTR, composition,
          contrast, and clickbait scoring — we don&apos;t estimate these without an image.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6">
        <div className="relative rounded-xl overflow-hidden border border-ink-200 aspect-video bg-ink-100">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt="Thumbnail preview"
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-500">
              <ImageIcon className="w-7 h-7" />
              <span className="text-[12px] font-medium">No thumbnail attached</span>
            </div>
          )}
          {thumbnailUrl && (
            <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[11px] font-medium text-white">
              <Eye className="w-3 h-3" /> {thumbnail.ctrPredictionScore === null ? 'CTR not measured' : `Predicted CTR ${thumbnail.ctrPredictionScore}%`}
            </div>
          )}
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-2.5">
          {/* Sub-labels derive from the measured values — the previous fixed
              "Strong human connection" / "Mobile-optimized" / "Rule-of-thirds
              respected" printed under failing scores too, decorating the panel
              with claims the engine never made. */}
          <TileMini
            label="Face & emotion"
            value={faceEmotion}
            sub={
              !measured
                ? 'Connect a thumbnail'
                : thumbnail.compositionScore !== null && thumbnail.compositionScore >= 80
                  ? 'Clear focal point'
                  : 'Improve the focal point'
            }
            tone={measured && thumbnail.compositionScore !== null && thumbnail.compositionScore >= 80 ? 'success' : measured ? 'default' : 'default'}
          />
          <TileMini
            label="Text readability"
            value={readability}
            sub={
              !measured
                ? 'Connect a thumbnail'
                : thumbnail.textReadabilityScore !== null && thumbnail.textReadabilityScore >= 75
                  ? 'Legible at feed size'
                  : 'Enlarge or cut text'
            }
            tone={measured && thumbnail.textReadabilityScore !== null && thumbnail.textReadabilityScore >= 75 ? 'success' : measured ? 'warning' : 'default'}
          />
          <TileMini
            label="Composition"
            value={score(thumbnail.compositionScore)}
            sub={
              !measured
                ? 'Connect a thumbnail'
                : thumbnail.compositionScore !== null && thumbnail.compositionScore >= 75
                  ? 'Well composed'
                  : 'Simplify the frame'
            }
            tone={measured && thumbnail.compositionScore !== null && thumbnail.compositionScore >= 75 ? 'success' : measured ? 'warning' : 'default'}
          />
          <TileMini label="Clickbait risk" value={measured ? thumbnail.clickbaitRisk : 'Not measured'} sub={measured ? (thumbnail.clickbaitRisk === 'Low' ? 'Below platform threshold' : 'Reduce sensational text') : 'Connect a thumbnail'} tone={measured && thumbnail.clickbaitRisk !== 'Low' ? 'warning' : measured ? 'success' : 'default'} />
          <div className="col-span-2 space-y-2 mt-1">
            <h4 className="text-[12px] font-semibold text-brand-600 mb-2">{measured ? 'CTR improvements' : 'How to enable this layer'}</h4>
            {thumbnail.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-canvas border border-ink-200 text-[13px] text-ink-700 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-grass-700 shrink-0 mt-0.5" />
                {rec}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const TileMini: React.FC<{
  label: string; value: string | null; sub: string; tone?: 'success' | 'warning' | 'default';
}> = ({ label, value, sub, tone = 'default' }) => (
  <div className="rounded-lg bg-surface-canvas border border-ink-200 p-3.5">
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</div>
    <div className="text-[14px] font-semibold text-ink-900 mt-1">{value ?? 'Not measured'}</div>
    <div className={`text-[11px] mt-1 ${
      tone === 'success' ? 'text-grass-700' : tone === 'warning' ? 'text-amber-700' : 'text-ink-500'
    }`}>{sub}</div>
  </div>
);
