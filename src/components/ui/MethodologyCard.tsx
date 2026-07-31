/**
 * Methodology transparency component.
 *
 * Shown on the analysis page so creators can verify every score against the
 * platform's own published rules. Trust is built by showing the work.
 */

'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Calendar } from 'lucide-react';
import { Card } from './Card';
import { Badge } from './Badge';
import { PLATFORM_POLICIES, PlatformName } from '@/lib/ai/platform-engine';

const SCORE_WEIGHTS = [
  { label: 'Monetization policy',  weight: '30%', desc: 'Compliance with each platform\'s published advertiser-friendly content rules.' },
  { label: 'Copyright safety',     weight: '20%', desc: 'Music licensing, brand-mark exposure, and Content ID risk.' },
  { label: 'Hook & retention',     weight: '15%', desc: 'Predicted viewer retention at 5s, 10s, and 30s based on opening script.' },
  { label: 'AI authenticity',      weight: '15%', desc: 'Likelihood the script reads as human-authored; synthetic voiceover disclosure risk.' },
  { label: 'SEO discoverability',  weight: '10%', desc: 'Title keyword strength, tag quality, and description structure.' },
  { label: 'Brand safety',         weight: '10%', desc: 'Advertiser-suitability signals: profanity, controversy, sensitive topics.' },
];

const PLATFORM_DOCS: Record<PlatformName, string> = {
  YouTube:   'https://support.google.com/youtube/answer/6162278',
  TikTok:    'https://www.tiktok.com/creators/creator-portal/en-us/getting-paid-to-create/creator-rewards-program/',
  Instagram: 'https://help.instagram.com/2635536099905516',
  Facebook:  'https://www.facebook.com/business/help/1735443093393977',
  LinkedIn:  'https://www.linkedin.com/help/linkedin/answer/a1340367',
};

interface Props {
  activePlatform?: PlatformName;
  policyLastReviewed?: string;
}

export const MethodologyCard: React.FC<Props> = ({
  activePlatform = 'YouTube',
  policyLastReviewed,
}) => {
  const [open, setOpen] = useState(false);
  const policy = PLATFORM_POLICIES[activePlatform];
  const reviewed = policyLastReviewed ?? policy.lastReviewed;

  return (
    <Card className="border-ink-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-ink-500" />
          <span className="text-[13.5px] font-semibold text-ink-900">How scores are calculated</span>
          <Badge variant="outline" size="sm">Transparent</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
      </button>

      {open && (
        <div className="mt-5 space-y-5 animate-enter">
          <div>
            <div className="text-[11.5px] font-semibold text-ink-600 mb-3">
              Overall score weights
            </div>
            <div className="space-y-2">
              {SCORE_WEIGHTS.map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-right">
                    <span className="text-[12px] font-semibold tabular-nums text-ink-900">{s.weight}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-ink-800">{s.label}</div>
                    <div className="text-[11.5px] text-ink-500 mt-0.5 leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/60 border border-amber-500/15 p-4">
            <div className="text-[12.5px] font-semibold text-amber-900 mb-1">Conservative by design</div>
            <p className="text-[12px] text-amber-800 leading-relaxed">
              Borderline scores are nudged down by 3–5 points. A false alarm costs you 5 minutes of
              review time. A missed risk can cost you your monetization. We choose the safer side.
            </p>
          </div>

          <div>
            <div className="text-[11.5px] font-semibold text-ink-600 mb-3">
              {activePlatform} policy source
            </div>
            <div className="rounded-xl border border-ink-200 bg-surface-canvas p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-900">{policy.monetizationName}</span>
                <a
                  href={PLATFORM_DOCS[activePlatform]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] text-ink-500 hover:text-ink-900 transition-colors"
                >
                  Official docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                <Calendar className="w-3 h-3" />
                Policy last reviewed by Publish: {reviewed}
              </div>
              <ul className="mt-3 space-y-1.5">
                {policy.rules.slice(0, 4).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-ink-700 leading-relaxed">
                    <span className="text-[10px] font-semibold text-ink-400 mt-0.5 shrink-0 tabular-nums">R{i + 1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-ink-400 leading-relaxed">
            Publish predicts risk based on published platform guidelines. It does not guarantee
            monetization outcomes. Platforms make the final determination. If you believe a score
            is wrong, re-run after making changes — re-runs are unlimited and free.
          </p>
        </div>
      )}
    </Card>
  );
};
