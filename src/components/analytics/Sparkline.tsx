'use client';

import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  className?: string;
}

/**
 * Zero-dependency inline SVG sparkline.
 * - Stroke color reflects trend direction (green up, red down, neutral gray).
 * - Last point is emphasized with a filled dot.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 24,
  min: minProp,
  max: maxProp,
  className,
}) => {
  if (!data.length) {
    return <span className={className} style={{ color: '#9ca3af', fontSize: 11 }}>—</span>;
  }

  const min = minProp ?? Math.min(...data);
  const max = maxProp ?? Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = data.length === 1 ? width / 2 : pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const last = points[points.length - 1];

  const trend = data.length < 2 ? 0 : data[data.length - 1] - data[0];
  const stroke = trend > 0 ? '#7CFF9A' : trend < 0 ? '#EF4444' : '#71717A';

  return (
    <svg
      role="img"
      aria-label={`Score trend: ${data.join(', ')}`}
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.25} fill={stroke} />
    </svg>
  );
};

export default Sparkline;
