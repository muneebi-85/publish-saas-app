'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Swords, Trophy, ArrowRight, Loader2 } from 'lucide-react';
import { track } from '@/lib/analytics';

interface Comparison {
  target: { id: string; title: string; score: number; platform: string };
  mine: { id: string; title: string; score: number; platform: string };
  outcome: 'won' | 'lost' | 'tied';
  creditsEarned: number;
  already?: boolean;
}

/**
 * Renders the "you accepted a challenge" comparison after the challenge review
 * completes. Mounted by the analysis page only when the URL carries
 * `?challenge=<reportId>` — i.e. the review was started from a challenge CTA.
 *
 * The accept POST is idempotent server-side, but we still only fire it once per
 * mount so a refresh of an old tab doesn't ping the API pointlessly.
 */
export function ChallengeCompare({
  targetReportId,
  myReportId,
  myTitle,
}: {
  targetReportId: string;
  myReportId: string;
  myTitle: string;
}) {
  const [state, setState] = useState<{ loading: boolean; data?: Comparison; error?: string }>({
    loading: true,
  });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/challenge/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetReportId, myReportId }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not record the challenge.');
        setState({ loading: false, data: data as Comparison });
        void track('challenge_accepted', {
          targetReportId,
          outcome: data.outcome,
          mine: data.mine?.score,
          target: data.target?.score,
        });
      } catch (err) {
        if (cancelled) return;
        setState({ loading: false, error: err instanceof Error ? err.message : 'Could not record the challenge.' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetReportId, myReportId]);

  if (state.loading) {
    return (
      <div className="rounded-2xl border border-brand-600/20 bg-brand-600/[0.05] p-4 flex items-center gap-3 text-[13px] text-ink-700">
        <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
        Recording your challenge…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-[13px] text-amber-700">
        {state.error}
      </div>
    );
  }

  const d = state.data!;
  const won = d.outcome === 'won';

  return (
    <div className="rounded-2xl border border-brand-600/25 bg-brand-600/[0.06] p-5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-brand-600">
        <Swords className="w-4 h-4" />
        Challenge result
        {d.creditsEarned > 0 && !d.already && (
          <span className="rounded-full bg-grass-100 text-grass-800 px-2 py-0.5 text-[10.5px] font-bold">
            +1 free audit earned
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-center">
          <div className="text-[11px] text-ink-500 uppercase tracking-[0.08em]">Them</div>
          <div className="font-display text-[30px] font-bold tabular-nums leading-none mt-1 text-ink-900">
            {d.target.score}
          </div>
          <div className="text-[11px] text-ink-500 mt-1 truncate max-w-[120px]">{d.target.title}</div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.1em]">
            {won ? 'You win' : d.outcome === 'tied' ? 'Tie' : 'Not yet'}
          </div>
          {won ? (
            <Trophy className="w-6 h-6 text-amber-600 mt-1" />
          ) : (
            <ArrowRight className="w-5 h-5 text-ink-400 mt-1" />
          )}
        </div>
        <div className="text-center">
          <div className="text-[11px] text-ink-500 uppercase tracking-[0.08em]">You</div>
          <div className="font-display text-[30px] font-bold tabular-nums leading-none mt-1 text-brand-600">
            {d.mine.score}
          </div>
          <div className="text-[11px] text-ink-500 mt-1 truncate max-w-[120px]">{myTitle}</div>
        </div>
      </div>

      {!won && (
        <p className="mt-3 text-[12px] text-ink-600 leading-relaxed">
          {d.outcome === 'tied'
            ? 'Dead even. Fix the top issues in your report and re-run to take the lead.'
            : `Their score still stands. Apply your priority fixes and re-run the review — you're a few points away.`}
        </p>
      )}

      {won && (
        <div className="mt-4">
          <Link href={`/share/${d.mine.id}`}>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[12.5px] font-bold text-[#060606] hover:bg-brand-400 transition-colors">
              Share your winning score <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
