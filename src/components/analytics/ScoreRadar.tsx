'use client';

import React from 'react';

export interface RadarAxis {
  label: string;
  value: number;
}

/**
 * Score radar. Every vertex is driven by a real score, so the polygon and the
 * axis labels cannot drift apart — there is no decorative geometry here.
 */
export const ScoreRadar: React.FC<{ axes: RadarAxis[]; size?: number }> = ({
  axes,
  size = 260,
}) => {
  if (axes.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;

  const pointAt = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * r * ratio,
      y: cy + Math.sin(angle) * r * ratio,
    };
  };

  const polygon = axes
    .map((a, i) => {
      const p = pointAt(i, Math.max(0, Math.min(100, a.value)) / 100);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={axes.map((a) => `${a.label} ${a.value}`).join(', ')}
      className="max-w-full h-auto"
    >
      {rings.map((ratio) => (
        <polygon
          key={ratio}
          points={axes
            .map((_, i) => {
              const p = pointAt(i, ratio);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}

      {axes.map((_, i) => {
        const p = pointAt(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        );
      })}

      <polygon
        points={polygon}
        fill="rgba(124,255,154,0.12)"
        stroke="#7CFF9A"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {axes.map((a, i) => {
        const p = pointAt(i, Math.max(0, Math.min(100, a.value)) / 100);
        return <circle key={a.label} cx={p.x} cy={p.y} r={2.5} fill="#7CFF9A" />;
      })}

      {axes.map((a, i) => {
        const p = pointAt(i, 1.19);
        return (
          <text
            key={a.label}
            x={p.x}
            y={p.y}
            textAnchor={p.x > cx + 4 ? 'start' : p.x < cx - 4 ? 'end' : 'middle'}
            dominantBaseline="middle"
            fill="#71717A"
            fontSize={10.5}
            fontWeight={500}
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
};

export default ScoreRadar;
