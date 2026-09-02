'use client';

import React from 'react';
import { BarChart3, Info, Loader2, TrendingUp, Target } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { CATEGORY_NAMES } from '@/lib/ml/categories';

/**
 * The trained Publish Score, its niche benchmark, and the ranked edits.
 *
 * WHY THIS IS A SEPARATE PANEL AND NOT A NUMBER INSIDE `ScoreHeader`
 * `ScoreHeader` shows the review's own weighted composite — an LLM's judgement of
 * one video. This is a different measurement entirely: a gradient-boosted model's
 * estimate of where this metadata would rank against real videos from comparable
 * channels in the same category. They disagree sometimes, and that is information,
 * not a bug. Merging them into one figure would destroy both.
 *
 * WHY THE CREATOR PICKS THE CATEGORY
 * The niche is `category x channel size x form`, and the app has never stored a
 * category for a report. Guessing one would silently benchmark a cooking video
 * against gaming videos and present the result as "your niche". So the panel asks,
 * once, in one click — and until it is answered it shows the score alone and says
 * that the comparison is missing rather than inventing a niche to fill the space.
 *
 * WHY IT CAN RENDER NOTHING AT ALL
 * With no model artefact deployed, `/api/publish-score` answers 503 and this
 * collapses to a single quiet line. The score this panel shows is the one the FAQ
 * used to describe as "trained on over 12.7M high-performing videos" when nothing
 * had been trained at all; a placeholder number here would rebuild that lie in a
 * new place.
 */

type Suggestion = {
  key: string;
  label: string;
  lift: number;
  from: number;
  to: number;
  advice: string;
};

type Comparison = {
  feature: string;
  label: string;
  sentence: string;
  standing: 'below' | 'inside' | 'above' | 'unknown';
};

type ScoreResponse = {
  score: number;
  cell: string | null;
  cellExact: boolean;
  suggestions: Suggestion[] | null;
  suggestionsConsidered: number | null;
  bestRejectedLift: number | null;
  benchmark: { cellSize: number; topSize: number; gaps: Comparison[] } | null;
  provenance: string[];
};

/**
 * The category list, deduplicated by name.
 *
 * Ids 23 and 34 are both "Comedy" upstream, and both resolve to the same training
 * cell — so offering the creator two identical options would be a choice with no
 * consequence. The lower id wins because it is the one YouTube actually returns.
 */
const CATEGORY_OPTIONS: ReadonlyArray<{ id: string; name: string }> = Object.entries(CATEGORY_NAMES)
  .map(([id, name]) => ({ id, name }))
  .filter((entry, i, all) => all.findIndex((other) => other.name === entry.name) === i)
  .sort((a, b) => a.name.localeCompare(b.name));

export type NicheBenchmarkProps = {
  title: string;
  description: string;
  tags: string[];
  /**
   * Length in seconds, when the upload had one. Decides Shorts vs long-form.
   *
   * Seconds and not the display string: `assets.videoDuration` is `"11:04"`, which
   * is not ISO-8601 and would parse to zero - scoring an eleven-minute video as a
   * Short and comparing it against the wrong niche entirely.
   */
  durationSeconds?: number;
  /** From the creator's connected channel. 0 means unknown, which buckets as `nano`. */
  subscribers: number;
  videoCount: number;
};

export const NicheBenchmark: React.FC<NicheBenchmarkProps> = ({
  title,
  description,
  tags,
  durationSeconds,
  subscribers,
  videoCount,
}) => {
  const [categoryId, setCategoryId] = React.useState('');
  const [data, setData] = React.useState<ScoreResponse | null>(null);
  const [state, setState] = React.useState<'idle' | 'loading' | 'unavailable' | 'error'>('idle');

  // Re-scored on every category change because the category decides the niche,
  // and the niche decides both the benchmark and the advice. The score itself does
  // not depend on it, but re-requesting is cheaper than explaining why one half of
  // the panel updated and the other did not.
  React.useEffect(() => {
    let cancelled = false;
    setState('loading');

    fetch('/api/publish-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        tags,
        durationSeconds: durationSeconds ?? null,
        subscribers,
        videoCount,
        ...(categoryId ? { categoryId } : {}),
      }),
    })
      .then(async (res) => {
        if (cancelled) return;
        // 503 is the deliberate "no model deployed" answer, not a failure to
        // report to the creator as one.
        if (res.status === 503) return setState('unavailable');
        if (!res.ok) return setState('error');
        setData((await res.json()) as ScoreResponse);
        setState('idle');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [title, description, tags, durationSeconds, subscribers, videoCount, categoryId]);

  if (state === 'unavailable') return null;

  const tone =
    !data ? 'text-ink-500'
    : data.score >= 75 ? 'text-grass-700'
    : data.score >= 50 ? 'text-amber-700'
    : 'text-crimson-700';

  return (
    <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-[18px] font-semibold text-ink-900">
              Niche benchmark
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5 max-w-prose">
              A trained model&apos;s estimate of where this metadata ranks against real videos
              from channels your size in your category. Separate from the review score above.
            </p>
          </div>
        </div>

        <label className="text-[12px] text-ink-500">
          <span className="block mb-1">Your category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-surface-sunken border border-ink-200 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-900 min-w-[180px]"
          >
            <option value="">Select to compare…</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state === 'loading' && (
        <div className="flex items-center gap-2 text-[12px] text-ink-500 mt-5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Scoring…
        </div>
      )}

      {state === 'error' && (
        <p className="text-[12px] text-ink-500 mt-5">
          Could not reach the scorer. Nothing is being estimated in the meantime.
        </p>
      )}

      {data && state === 'idle' && (
        <div className="mt-5 space-y-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <div className={`font-display text-[40px] font-semibold leading-none ${tone}`}>
                {data.score}
              </div>
              <div className="text-[12px] text-ink-500 mt-1">
                {data.cell
                  ? `percentile within ${data.cell.split('|')[0]}, channels your size`
                  : 'percentile — no niche selected'}
              </div>
            </div>
            {data.cell && !data.cellExact && (
              <Badge variant="warning">Similar niche</Badge>
            )}
            {data.benchmark && (
              <div className="text-[12px] text-ink-500">
                {data.benchmark.cellSize.toLocaleString()} videos in this cell,{' '}
                {data.benchmark.topSize.toLocaleString()} in its top decile.
              </div>
            )}
          </div>

          {/* Ranked edits. Each `lift` is the model's own predicted change from
              re-scoring the row with that one edit applied — not a guess about it. */}
          {data.suggestions && data.suggestions.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-ink-900 flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-grass-600" aria-hidden="true" />
                Highest-impact changes
              </h3>
              <ul className="space-y-2">
                {data.suggestions.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-start gap-3 rounded-lg border border-ink-200 bg-surface-sunken p-3.5"
                  >
                    <span className="text-[12px] font-semibold text-grass-700 shrink-0 tabular-nums pt-px">
                      +{s.lift.toFixed(1)}
                    </span>
                    <span className="text-[12px] text-ink-700">
                      <span className="text-ink-900 font-medium">{s.label}.</span> {s.advice}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty and null mean different things, and the creator is told which.
              Null: no niche to compare against. Empty with a count: every edit was
              tried and the model would not back any of them. */}
          {data.suggestions &&
            data.suggestions.length === 0 &&
            (data.suggestionsConsidered ?? 0) > 0 && (
              <p className="text-[12px] text-ink-500">
                Tried {data.suggestionsConsidered} changes against this niche
                {data.bestRejectedLift !== null && data.bestRejectedLift > 0
                  ? `; the best was worth ${data.bestRejectedLift.toFixed(1)} points, below the threshold we report.`
                  : '; none is predicted to improve the score.'}{' '}
                The gaps below are still worth reading — those are measured, not predicted.
              </p>
            )}

          {data.benchmark && data.benchmark.gaps.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-ink-900 flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                Where you sit outside the top decile&apos;s range
              </h3>
              <ul className="space-y-1.5">
                {data.benchmark.gaps.map((g) => (
                  <li key={g.feature} className="text-[12px] text-ink-600">
                    {g.sentence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Provenance is not a footnote here, it is the difference between this
              number and the invented one it replaced. Always rendered. */}
          {data.provenance.length > 0 && (
            <div className="flex items-start gap-2 pt-1 border-t border-ink-200 mt-1">
              <Info className="w-3.5 h-3.5 text-ink-400 mt-2 shrink-0" aria-hidden="true" />
              <ul className="text-[12px] text-ink-500 space-y-0.5 pt-1.5">
                {data.provenance.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
