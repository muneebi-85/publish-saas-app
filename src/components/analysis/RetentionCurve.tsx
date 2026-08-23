import React from 'react';
import { Activity } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { HookRetentionMetric } from '@/lib/types';

/**
 * Predicted retention curve — where viewers are expected to drop off.
 *
 * The curve is anchored on the hook engine's own predicted checkpoints
 * (0s = 100%, then 5s / 10s / 30s). Between anchors it interpolates linearly,
 * and past 30s it extends as an explicitly-labeled exponential decay (90-second
 * half-life) because the engine only predicts the opening. The modeled tail is
 * drawn dashed so a measured claim can never be mistaken for an estimate.
 */

const W = 640;
const H = 240;
const PAD = { top: 18, right: 16, bottom: 30, left: 34 };

/** Decay model past the 30s checkpoint: halve every 90 seconds. */
const HALF_LIFE_S = 90;

function clamp(v: number) {
  return Math.max(0, Math.min(100, v));
}

/** retention at time t (seconds), given the three engine checkpoints. */
function retentionAt(t: number, a: number, b: number, c: number): number {
  if (t <= 5) return 100 + ((clamp(a) - 100) / 5) * t;
  if (t <= 10) return clamp(a) + ((clamp(b) - clamp(a)) / 5) * (t - 5);
  if (t <= 30) return clamp(b) + ((clamp(c) - clamp(b)) / 20) * (t - 10);
  // Modeled tail — estimate, not measurement.
  const k = Math.LN2 / HALF_LIFE_S;
  return clamp(c) * Math.exp(-k * (t - 30));
}

function toX(t: number) {
  return PAD.left + (t / 300) * (W - PAD.left - PAD.right);
}

function toY(v: number) {
  return PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);
}

export const RetentionCurve: React.FC<{ hook: HookRetentionMetric }> = ({ hook }) => {
  const a = clamp(hook.first5SecRetention);
  const b = clamp(hook.first10SecRetention);
  const c = clamp(hook.first30SecRetention);

  // Measured segment 0–30s, sampled every second.
  const solid: string[] = [];
  for (let t = 0; t <= 30; t += 1) {
    solid.push(`${t === 0 ? 'M' : 'L'}${toX(t).toFixed(1)},${toY(retentionAt(t, a, b, c)).toFixed(1)}`);
  }
  const solidPath = solid.join(' ');

  // Modeled tail 30–300s, sampled every 3s.
  const tail: string[] = [];
  for (let t = 30; t <= 300; t += 3) {
    tail.push(`${t === 30 ? 'M' : 'L'}${toX(t).toFixed(1)},${toY(retentionAt(t, a, b, c)).toFixed(1)}`);
  }
  const tailPath = tail.join(' ');

  const areaPath = `${solidPath} L${toX(30).toFixed(1)},${toY(0).toFixed(1)} L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`;

  const anchors = [
    { t: 0, v: 100, label: '0s' },
    { t: 5, v: a, label: '5s' },
    { t: 10, v: b, label: '10s' },
    { t: 30, v: c, label: '30s' },
  ];
  const xTicks = [0, 5, 10, 30, 60, 120, 300].map((t) => ({
    t,
    label: t < 60 ? `${t}s` : t === 60 ? '1m' : t === 120 ? '2m' : '5m',
  }));

  const hold = c >= 85 ? 'Excellent hold' : c >= 65 ? 'Solid hold' : 'Heavy drop-off';

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-surface-panel overflow-hidden">
      <div className="px-6 py-5 border-b border-ink-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center shrink-0 shadow-subtle">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Predicted retention curve
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Where viewers are expected to drop off across the first five minutes.
            </p>
          </div>
        </div>
        <Badge variant={hold === 'Excellent hold' ? 'success' : hold === 'Solid hold' ? 'warning' : 'danger'} dot>
          {hold}
        </Badge>
      </div>

      <div className="p-6">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Predicted retention curve">
          <defs>
            <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7CFF9A" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#7CFF9A" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={toY(v)}
                y2={toY(v)}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="#6B7278">
                {v}%
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTicks.map((tick) => (
            <text
              key={tick.t}
              x={toX(tick.t)}
              y={H - 8}
              textAnchor={tick.t === 0 ? 'start' : tick.t === 300 ? 'end' : 'middle'}
              fontSize="10"
              fill="#6B7278"
            >
              {tick.label}
            </text>
          ))}

          {/* Measured area + line */}
          <path d={areaPath} fill="url(#retentionFill)" />
          <path d={solidPath} fill="none" stroke="#7CFF9A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Modeled tail */}
          <path d={tailPath} fill="none" stroke="#7CFF9A" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" opacity="0.75" />

          {/* Anchor points */}
          {anchors.map((anchor) => (
            <g key={anchor.t}>
              <circle cx={toX(anchor.t)} cy={toY(anchor.v)} r="4.5" fill="#070B0D" stroke="#7CFF9A" strokeWidth="2.5" />
              <text
                x={toX(anchor.t)}
                y={toY(anchor.v) - 10}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#D7DCDA"
              >
                {anchor.v}%
              </text>
            </g>
          ))}
        </svg>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full bg-grass-500" /> Predicted from the hook engine
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full bg-grass-500 bg-[repeating-linear-gradient(90deg,#7CFF9A_0_4px,transparent_4px_8px)]" />
            Modeled estimate past 30s
          </span>
          <span className="text-ink-400">{hook.hookDropoffReason}</span>
        </div>

        <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
          Anchored on the predicted 5s / 10s / 30s retention from your script&apos;s opening. Between
          checkpoints the curve interpolates; after 30 seconds it extends on a 90-second half-life
          model because the engine only predicts the opening. This is a prediction, not a
          measurement — actual retention depends on your delivery, packaging and audience.
        </p>
      </div>
    </section>
  );
};
