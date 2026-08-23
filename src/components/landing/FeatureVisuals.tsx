/**
 * Visuals for the two wide cards in the features bento.
 *
 * The grid used to be six identical boxes at identical weight, which gave the
 * eye nowhere to land. These two cards carry the section instead: they span the
 * full row and show the thing the copy describes rather than restating it.
 *
 * Both are decorative and aria-hidden — the card heading and paragraph carry
 * the meaning. Numbers are illustrative sample output, not live data.
 */
import React from 'react';

/** Layer scores as they appear on a finished report. */
const LAYERS = [
  { label: 'Hook', score: 92 },
  { label: 'Retention', score: 86 },
  { label: 'Monetization', score: 78 },
];

export function AnalysisVisual() {
  const SIZE = 74;
  const SW = 9;
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const arc = 0.72;
  const filled = 0.94 * arc;

  return (
    <div aria-hidden="true" className="flex items-center gap-[18px]">
      {/* score ring */}
      <div className="relative shrink-0" style={{ height: SIZE, width: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-[140deg]">
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke="var(--lp-line)" strokeWidth={SW} strokeLinecap="round"
            strokeDasharray={`${C * arc} ${C}`}
          />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke="var(--lp-green)" strokeWidth={SW} strokeLinecap="round"
            strokeDasharray={`${C * filled} ${C}`}
            className="lp-draw"
            style={{ ['--len' as string]: C * filled }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-[2px]">
          <span className="text-[22px] font-extrabold leading-none tracking-[-0.05em] text-[var(--lp-ink)]">94</span>
          <span className="mt-[2px] text-[9px] font-bold text-[var(--lp-ink-4)]">/100</span>
        </div>
      </div>

      {/* per-layer bars */}
      <div className="min-w-0 flex-1 space-y-[9px]">
        {LAYERS.map(({ label, score }, i) => (
          <div key={label} className="flex items-center gap-[10px]">
            <span className="w-[74px] shrink-0 text-[11px] font-bold text-[var(--lp-ink-3)]">{label}</span>
            <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--lp-line)]">
              <span
                className="lp-late block h-full rounded-full bg-[var(--lp-green)]"
                style={{ width: `${score}%`, ['--i' as string]: i }}
              />
            </span>
            <span className="w-[20px] shrink-0 text-right text-[11px] font-extrabold text-[var(--lp-ink)]">{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Weekly Publish Score across recent uploads, in points. */
const TREND = [58, 63, 61, 70, 74, 79, 83, 88, 94];

export function ReportsVisual() {
  // `non-scaling-stroke` resolves the dash pattern in device pixels, while the
  // viewBox is stretched by `preserveAspectRatio="none"`. Keeping the local
  // width close to the rendered width (~460-540px in this column) keeps that
  // scale near 1, so `len` below still exceeds the path's device length and the
  // line draws all the way to the end. A small viewBox here silently truncated
  // the draw partway across.
  const W = 460;
  const H = 74;
  const min = 50;
  const max = 100;

  const pts = TREND.map((v, i) => [
    (i / (TREND.length - 1)) * W,
    H - ((v - min) / (max - min)) * H,
  ] as const);

  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  // Over-estimate of the path length; only needs to exceed it for the draw to
  // sweep the whole line.
  const len = W * 1.35;

  return (
    <div aria-hidden="true" className="flex items-end gap-[16px]">
      <div className="min-w-0 flex-1">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
          <defs>
            <linearGradient id="lpFeatArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--lp-green)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--lp-green)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#lpFeatArea)" className="lp-late" />
          <path
            d={line} fill="none" stroke="var(--lp-green)" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            className="lp-draw" strokeDasharray={len} style={{ ['--len' as string]: len }}
          />
        </svg>
        <div className="mt-[7px] flex justify-between text-[10px] font-semibold text-[var(--lp-ink-4)]">
          <span>9 uploads ago</span>
          <span>Latest</span>
        </div>
      </div>

      <div className="shrink-0 rounded-[10px] bg-[var(--lp-tint)] px-[11px] py-[8px] text-center">
        <div className="text-[16px] font-extrabold leading-none tracking-[-0.03em] text-[var(--lp-green)]">+36</div>
        <div className="mt-[4px] text-[9.5px] font-bold leading-none text-[var(--lp-green)]">points</div>
      </div>
    </div>
  );
}
