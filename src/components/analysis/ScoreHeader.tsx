'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, RefreshCw,
  ChevronRight, ShieldCheck, Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ShareScoreButton } from '@/components/analysis/ShareScoreButton';
import { ProjectData } from '@/lib/types';
import { scoreBand, SCORE_BAND_UI } from '@/lib/score-band';

interface ScoreHeaderProps {
  project: ProjectData;
  /** Publication state of the public score card — flips Share into Unshare. */
  shared?: boolean;
}

type MetricCell = { label: string; value: number | null; why: string };

// One band definition for the whole product (85 / 70) — see lib/score-band.
const toneFor = (v: number) => {
  const ui = SCORE_BAND_UI[scoreBand(v)];
  return { num: ui.text, bar: ui.bar };
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Publish Score™ — the signature pre-publish verdict.
 *
 * Every number is derived from layers already computed for this report, so the
 * panel renders for both freshly-analyzed and legacy reports without needing new
 * persisted fields. Unmeasured layers (e.g. CTR with no thumbnail attached) show
 * an honest "—" rather than a fabricated score, and lower the confidence read.
 */
export const ScoreHeader: React.FC<ScoreHeaderProps> = ({ project, shared = false }) => {
  const { title, riskLevel, assets } = project;
  const duration = assets?.videoDuration;
  const isSafe = riskLevel === 'LOW';

  const thumb = project.thumbnailAnalysis;
  const voice = project.voiceAnalysis;
  const reports = project.platformReports ?? [];

  // Null when the hook layer never ran (no script/transcript) — the strip then
  // shows the honest "—" instead of clamping null to a measured-looking 0.
  // A legacy report without `analyzed` still has its real hook score, and a
  // null `scores.hook` (written by the unmeasured path) also renders "—".
  // `typeof === 'number'` / `!== null` (not truthiness) on both arms so an
  // `undefined` from a truncated legacy row cannot slip through and print a
  // measured-looking 0 — and a wholly missing `scores` object degrades the
  // same way instead of throwing in the destructure above.
  const s = project.scores ?? ({} as NonNullable<ScoreHeaderProps['project']['scores']>);
  const hookKnown =
    project.hookAnalysis?.analyzed !== false &&
    (typeof project.hookAnalysis?.first30SecRetention === 'number' ||
      (typeof s.hook === 'number' && s.hook !== null));
  const retention = !hookKnown
    ? null
    : clamp((project.hookAnalysis?.first30SecRetention ?? s.hook ?? 0) as number);
  const ctr = thumb?.measured && typeof thumb.ctrPredictionScore === 'number'
    ? clamp(thumb.ctrPredictionScore)
    : null;
  const platformCompliance = reports.length
    ? clamp(
        reports.reduce(
          (a, p) => a + (p.policyStatus === 'Compliant' ? 100 : p.policyStatus === 'Review Suggested' ? 60 : 20),
          0,
        ) / reports.length,
      )
    : clamp(s.brandSafety);
  const audienceTrust = clamp(0.6 * s.humanAuthenticity + 0.4 * s.brandSafety);
  const aiDetection = clamp(s.originality); // higher = reads more human, lower AI-detection risk
  const sponsorFriendly = clamp(0.45 * s.brandSafety + 0.35 * s.monetization + 0.2 * s.copyright);

  // Publish Score is the report's already-weighted overall — one number, not a
  // competing composite — surfaced as the headline verdict. The caption uses
  // the shared bands so the number says the same thing here as everywhere else.
  const publish = clamp(s.overall);
  const band = SCORE_BAND_UI[scoreBand(publish)].label;

  // Readiness, not performance: the underlying formula (score + retention +
  // CTR against the product's own bands) measures how prepared the upload is
  // across the reviewed layers — it cannot predict views. The previous label
  // "Expected performance" promised the one thing the trust preamble forbids.
  let readiness: 'Ready' | 'Almost' | 'Not yet' =
    publish >= 85 && retention !== null && retention >= 78 ? 'Ready' : publish >= 68 ? 'Almost' : 'Not yet';
  if (ctr !== null && ctr < 60 && readiness === 'Ready') readiness = 'Almost';

  // Confidence reflects how much real signal fed the score, not the score itself.
  let confidence = 60;
  if (thumb?.measured) confidence += 12;
  if (voice?.measured) confidence += 10;
  if (duration) confidence += 8;
  if (assets?.scriptText) confidence += 6;
  if (assets?.thumbnailUrl) confidence += 4;
  confidence = Math.min(95, confidence);

  const metrics: MetricCell[] = [
    { label: 'Monetization', value: clamp(s.monetization), why: 'Advertiser suitability across every target platform.' },
    { label: 'CTR Prediction', value: ctr, why: 'Predicted browse-feed click-through from the attached thumbnail.' },
    { label: 'Retention', value: retention, why: 'Predicted viewers held through the first 30 seconds.' },
    { label: 'Copyright', value: clamp(s.copyright), why: 'Music, footage, logo, and watermark claim exposure.' },
    { label: 'Brand Safety', value: clamp(s.brandSafety), why: 'Language and imagery against advertiser guidelines.' },
    { label: 'SEO', value: clamp(s.seo), why: 'Discoverability of title, description, and tags.' },
    { label: 'Audience Trust', value: audienceTrust, why: 'How authentic and credible the content reads to viewers.' },
    { label: 'AI Detection', value: aiDetection, why: 'How human the script reads to AI-detection systems (higher is safer).' },
    { label: 'Platform Compliance', value: platformCompliance, why: 'Fit against each platform’s published monetization rules.' },
    { label: 'Sponsor Friendly', value: sponsorFriendly, why: 'Readiness for brand deals — clean, safe, on-policy.' },
  ] as MetricCell[];

  const overallTone = toneFor(publish);
  const readinessTone =
    readiness === 'Ready' ? 'text-grass-700' : readiness === 'Almost' ? 'text-amber-700' : 'text-crimson-700';

  return (
    <div className="space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 text-[12px] text-ink-500">
          <Link href="/projects" className="hover:text-ink-900 transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Link>
          <ChevronRight className="w-3 h-3 text-ink-300" />
          <span className="text-ink-900 font-medium truncate max-w-[240px]">{title}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/upload">
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>Re-run</Button>
          </Link>
          <ShareScoreButton reportId={project.id} reportTitle={title} shared={shared} />
          <Button
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.print();
              }
            }}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Publish Score verdict panel */}
      <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSafe ? 'bg-grass-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] text-ink-900">
                {isSafe ? 'Safe to publish' : 'Review before publishing'}
              </h1>
              <Badge variant={isSafe ? 'success' : 'warning'}>
                {riskLevel} risk
              </Badge>
            </div>
            <p className="text-[13px] text-ink-600 mt-3 leading-relaxed max-w-2xl">
              {isSafe
                ? 'No blocking policy issues found. The improvements below are optional and would raise your predicted reach — they are not required for monetization.'
                : 'We found issues that could restrict monetization or reach. Each one below includes the specific fix, ranked by impact.'}
            </p>
            <div className="flex items-center gap-2 mt-4 text-[11px] text-ink-500">
              <span className="truncate max-w-md">{title}</span>
              {duration && (
                <>
                  <span className="w-1 h-1 rounded-full bg-ink-300" />
                  <span className="tabular-nums">{duration}</span>
                </>
              )}
            </div>
          </div>

          {/* Publish Score */}
          <div className="shrink-0 lg:pl-7 lg:border-l lg:border-ink-200">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-600">
              <Gauge className="w-3.5 h-3.5" />
              Publish Score<span className="align-super text-[8px]">™</span>
            </div>
            <div className="flex items-end gap-4 mt-2">
              <span className={`font-display text-[48px] leading-[0.9] font-semibold tabular-nums tracking-[-0.025em] ${overallTone.num}`}>
                {publish}
              </span>
              <div className="pb-1.5">
                <div className="relative h-1 w-32 rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${overallTone.bar}`}
                    style={{ width: `${publish}%` }}
                  />
                  <div className="absolute -top-1 h-3 w-px bg-ink-400" style={{ left: '85%' }} aria-hidden="true" />
                </div>
                <div className="text-[13px] font-semibold text-ink-900 mt-2">{band}</div>
              </div>
            </div>
            {/* Readiness + confidence */}
            <div className="flex items-center gap-5 mt-4">
              <div>
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">Readiness</div>
                <div className={`text-[16px] font-semibold ${readinessTone}`}>{readiness}</div>
                <div className="text-[10px] text-ink-400 mt-0.5 max-w-[130px] leading-tight">Across reviewed layers — not a view prediction.</div>
              </div>
              <div className="pl-5 border-l border-ink-200">
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">Confidence</div>
                <div className="text-[16px] font-semibold text-ink-900 tabular-nums">{confidence}%</div>
                <div className="text-[10px] text-ink-400 mt-0.5 max-w-[130px] leading-tight">Share of layers actually measured.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score strip — the ten signals behind the Publish Score */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-ink-200 border border-ink-200 rounded-xl overflow-hidden">
        {metrics.map((m) => {
          const measured = m.value !== null;
          const tone = measured ? toneFor(m.value as number) : { num: 'text-ink-400', bar: 'bg-ink-300' };
          return (
            <div key={m.label} className="bg-surface-panel p-4 sm:p-5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{m.label}</span>
              </div>
              <div className={`font-display text-[24px] leading-none font-semibold tabular-nums mt-2.5 tracking-[-0.02em] ${tone.num}`}>
                {measured ? m.value : '—'}
              </div>
              <div className="relative mt-3 h-1 w-full bg-ink-100 rounded-full">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
                  style={{ width: `${measured ? m.value : 0}%` }}
                />
                <div className="absolute -top-[3px] h-[10px] w-px bg-ink-300" style={{ left: '85%' }} aria-hidden="true" />
              </div>
              {/* Rendered statically, not on hover: touch and keyboard users
                  could never see a hover-only explanation. */}
              <div className="text-[11px] text-ink-500 mt-2.5 leading-snug">
                {measured ? m.why : 'Not measured yet — connect the source to unlock this signal.'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-ink-500">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-400" />
        <span>
          Publish Score is a weighted read across all review layers, calibrated conservatively. It is a pre-publish quality check, not a guarantee of views or revenue — confidence reflects how many of your sources were actually measured.
        </span>
      </div>
    </div>
  );
};
