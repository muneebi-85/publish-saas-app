import React from 'react';
import { RED } from './brand';

/**
 * Audience-retention curve, shared by the dark "what the algorithm measures"
 * panel and the compact card in the checks strip.
 *
 * Drawn from one dataset so both readings of the same video agree: a strong
 * start, the 2:15 drop-off, a partial recovery around 6:20, then the usual
 * long decay out to the 10:42 runtime.
 */

const RUNTIME = 642; // 10:42 in seconds

/** [seconds, percent of audience still watching] */
const CURVE: [number, number][] = [
  [0, 100], [20, 96], [45, 92], [75, 88], [110, 82],
  [135, 62], [160, 66], [200, 63], [240, 58], [280, 55],
  [320, 51], [360, 46], [380, 44], [402, 50], [430, 49],
  [470, 45], [510, 40], [550, 35], [590, 31], [642, 26],
];

const X_TICKS = ['0:00', '2:00', '4:00', '6:00', '8:00', '10:42'];

/** Fraction of the plot box, 0-1 from the left / from the top. */
const fx = (t: number) => t / RUNTIME;
const fy = (p: number) => (100 - p) / 100;

/**
 * Catmull-Rom through the points, emitted as cubic beziers. Keeps the curve
 * passing exactly through every sample while still reading as a smooth line.
 */
function smoothPath(pts: [number, number][], w: number, h: number, tension = 0.85) {
  const p = pts.map(([t, v]) => [fx(t) * w, fy(v) * h] as [number, number]);
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const k = tension / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

const W = 640;
const H = 260;
const LINE = smoothPath(CURVE, W, H);
const AREA = `${LINE}L${W} ${H}L0 ${H}Z`;

function Plot({
  uid,
  grid,
  strokeWidth = 3,
  areaOpacity = 0.22,
  className = '',
}: {
  uid: string;
  grid: string;
  strokeWidth?: number;
  areaOpacity?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`${uid}fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={RED} stopOpacity={areaOpacity} />
          <stop offset="1" stopColor={RED} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1="0" x2={W} y1={f * H} y2={f * H} stroke={grid} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={AREA} fill={`url(#${uid}fill)`} />
      <path
        d={LINE}
        fill="none"
        stroke={RED}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── the dark-panel chart ────────────────────────────────────── */

/** Callouts sit at their real data coordinates, nudged clear of the line. */
const CALLOUTS: { label: string; t: number; p: number; dx: string; dy: string }[] = [
  { label: 'Strong start', t: 45, p: 92, dx: '-10%', dy: '-150%' },
  { label: 'Dip at 2:15', t: 135, p: 62, dx: '8%', dy: '46%' },
  { label: 'Recovery at 6:20', t: 402, p: 50, dx: '-42%', dy: '-155%' },
];

export function AudienceRetentionChart() {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: RED }} />
          <span className="text-[13px] font-bold tracking-[-0.01em] text-white">Audience retention</span>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">Avg view duration</p>
          <p className="mt-1 text-[15px] font-extrabold tracking-[-0.02em] text-white">
            4:27 <span className="font-bold text-white/50">(41%)</span>
          </p>
        </div>
      </div>

      <div className="mt-7 flex gap-3">
        {/* y axis */}
        <div className="flex w-9 shrink-0 flex-col justify-between py-px text-right text-[10.5px] font-semibold text-white/40">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-[196px] sm:h-[232px]">
            <Plot uid="ret-dark" grid="rgba(255,255,255,.09)" strokeWidth={3} areaOpacity={0.26} />

            {CALLOUTS.map((c) => (
              <div
                key={c.label}
                className="pointer-events-none absolute"
                style={{ left: `${fx(c.t) * 100}%`, top: `${fy(c.p) * 100}%` }}
              >
                <span
                  aria-hidden
                  className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  style={{ background: RED }}
                />
                <span
                  className="absolute whitespace-nowrap rounded-full bg-white px-2.5 py-[5px] text-[10.5px] font-bold tracking-[-0.005em] text-[#101114] shadow-[0_6px_18px_-6px_rgba(0,0,0,.5)]"
                  style={{ transform: `translate(${c.dx}, ${c.dy})` }}
                >
                  {c.label}
                </span>
              </div>
            ))}
          </div>

          {/* x axis */}
          <div className="mt-3 flex justify-between text-[10.5px] font-semibold text-white/40">
            {X_TICKS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the compact card chart ──────────────────────────────────── */

export function RetentionMini() {
  return (
    <div className="w-full">
      <div className="flex gap-2.5">
        <div className="flex w-8 shrink-0 flex-col justify-between py-px text-right text-[9px] font-semibold text-[#A7AAB1]">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-[74px]">
            <Plot uid="ret-mini" grid="#EDEDEF" strokeWidth={2.2} areaOpacity={0.18} />
          </div>
          <div className="mt-2 flex justify-between text-[9px] font-semibold text-[#A7AAB1]">
            <span>0:00</span>
            <span>10:42</span>
          </div>
        </div>
      </div>
    </div>
  );
}
