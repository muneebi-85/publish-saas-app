/**
 * Landing-page brand primitives.
 *
 * Everything here is vector so it stays crisp at any DPR and costs no network
 * round-trip. The comp leans on four recurring devices — the Publish mark, a
 * hand-drawn red underline, a curved margin arrow, and small round portraits —
 * so each one lives here once instead of being re-inlined per section.
 */

import React from 'react';

export const RED = '#FF0000';

/* ─────────────────────────────────────────────────────────────
   Logo — red disc with a white play triangle, then the wordmark.
   `tone` flips the wordmark for the dark bands; the disc stays red.
   ───────────────────────────────────────────────────────────── */
export function PublishLogo({
  size = 28,
  tone = 'dark',
  className = '',
}: {
  size?: number;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <circle cx="16" cy="16" r="16" fill={RED} />
        <path d="M12.6 10.3 22 16l-9.4 5.7V10.3Z" fill="#fff" />
      </svg>
      <span
        className="font-extrabold leading-none"
        style={{
          fontSize: size * 0.79,
          letterSpacing: '-0.035em',
          color: tone === 'light' ? '#fff' : '#101114',
        }}
      >
        Publish
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Squiggle — the marker underline the comp draws beneath "die.",
   "Before.", "actually", "10k since." and "one."

   Two overlapping strokes with slightly different paths give the
   doubled-back look of a real marker pass. `w`/`h` are viewBox
   units; the element itself stretches to its container width.
   ───────────────────────────────────────────────────────────── */
export function Squiggle({
  className = '',
  color = RED,
  thickness = 3.2,
  double = true,
  style,
}: {
  className?: string;
  color?: string;
  thickness?: number;
  double?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      className={className}
      style={style}
      aria-hidden="true"
      fill="none"
      stroke={color}
      strokeLinecap="round"
    >
      <path
        d="M3 8.6C28 4.2 62 3 96 4.1c30 1 63 3.4 101 5.9"
        strokeWidth={thickness}
      />
      {double && (
        <path
          d="M9 12.4C36 9.4 68 8.4 99 9.1c26 .6 55 1.9 92 3.1"
          strokeWidth={thickness * 0.62}
          opacity="0.55"
        />
      )}
    </svg>
  );
}

/**
 * A word with the marker underline tucked beneath it. Keeps the
 * baseline intact — the squiggle is absolutely positioned so it
 * never adds line height.
 */
export function Underlined({
  children,
  className = '',
  offset = -6,
  thickness = 3.2,
  color = RED,
}: {
  children: React.ReactNode;
  className?: string;
  offset?: number;
  thickness?: number;
  color?: string;
}) {
  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      <Squiggle
        color={color}
        thickness={thickness}
        className="pointer-events-none absolute left-0 h-[0.22em] w-full"
        style={{ bottom: offset }}
      />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Curved margin arrow — the hand-drawn arc that points from the
   "no credit card" note back at the hero button.
   ───────────────────────────────────────────────────────────── */
export function CurvedArrow({ className = '', color = '#111318' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 92 34" className={className} fill="none" aria-hidden="true">
      <path
        d="M88 6C70 3 44 6 24 17.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M33 12.5 22.5 18.2l7.2 6.4"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The thin dashed arc the comp runs above the "how it works" steps. */
export function StepArc({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 30" className={className} fill="none" aria-hidden="true">
      <path
        d="M2 26C10 8 40 2 74 2c30 0 58 7 72 22"
        stroke="#D4D6DB"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Portraits.

   The comp shows small round creator photos. Drawing them as
   vector keeps them sharp at 26px and at 3× DPR, and lets one
   component cover the thirteen distinct faces the page needs.
   Each `seed` picks a deterministic combination of skin tone,
   hair shape, and shirt colour — no randomness, so SSR and the
   client always agree.
   ───────────────────────────────────────────────────────────── */

const SKIN = ['#F0C09B', '#E5A97C', '#C98358', '#8D5A3B', '#F5D3B4', '#A9714B', '#DE9E75'];
const HAIR = ['#221A17', '#3D2A1E', '#6B4426', '#8E6A3F', '#161513', '#4A3728', '#2C2320'];
const SHIRT = ['#20242C', '#3A4250', '#1D2B34', '#4A2F2C', '#2E3440', '#37414D', '#262A31'];
const BACKDROP = [
  ['#F6E7DA', '#EBD3C1'],
  ['#E4EBF2', '#CFDBE7'],
  ['#EDE8F5', '#DCD3EC'],
  ['#E7F1EA', '#D2E4D8'],
  ['#F5E9E3', '#E6D2C8'],
  ['#E9ECF1', '#D6DBE4'],
  ['#F3EDE1', '#E2D8C4'],
];

/** hair styles: 0 crop · 1 curls · 2 long · 3 cap · 4 buzz · 5 bun */
const STYLES: { hair: number; beard: boolean }[] = [
  { hair: 3, beard: true },
  { hair: 0, beard: false },
  { hair: 3, beard: false },
  { hair: 4, beard: true },
  { hair: 3, beard: true },
  { hair: 1, beard: false },
  { hair: 2, beard: false },
  { hair: 0, beard: true },
  { hair: 3, beard: false },
  { hair: 5, beard: false },
  { hair: 4, beard: false },
  { hair: 2, beard: false },
  { hair: 1, beard: true },
];

export function Portrait({
  seed = 0,
  size = 40,
  ring = 2,
  ringColor = '#fff',
  className = '',
  title,
}: {
  seed?: number;
  size?: number;
  ring?: number;
  ringColor?: string;
  className?: string;
  title?: string;
}) {
  const s = ((seed % 13) + 13) % 13;
  const style = STYLES[s];
  const skin = SKIN[s % SKIN.length];
  const hair = HAIR[(s * 3) % HAIR.length];
  const shirt = SHIRT[(s * 5) % SHIRT.length];
  const [bg1, bg2] = BACKDROP[(s * 2) % BACKDROP.length];
  const uid = `pt${s}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        borderRadius: '9999px',
        boxShadow: ring ? `0 0 0 ${ring}px ${ringColor}` : undefined,
      }}
    >
      <defs>
        <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg1} />
          <stop offset="1" stopColor={bg2} />
        </linearGradient>
        <linearGradient id={`${uid}sk`} x1="0.3" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -14)} />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}c)`}>
        <rect width="64" height="64" fill={`url(#${uid}bg)`} />

        {/* shoulders */}
        <path d="M-2 66c1.5-14 14-22 34-22s32.5 8 34 22Z" fill={shirt} />
        <path d="M23 47c2.6 4.6 5.4 6.9 9 6.9s6.4-2.3 9-6.9l-4-3.4H27Z" fill={shade(shirt, 14)} />

        {/* neck */}
        <path d="M25.6 33.6h12.8V45c0 2.2-2.9 3.6-6.4 3.6S25.6 47.2 25.6 45Z" fill={shade(skin, -18)} />

        {/* head */}
        <ellipse cx="32" cy="25.6" rx="11.6" ry="13.4" fill={`url(#${uid}sk)`} />
        <ellipse cx="20.6" cy="26.6" rx="1.9" ry="2.7" fill={shade(skin, -10)} />
        <ellipse cx="43.4" cy="26.6" rx="1.9" ry="2.7" fill={shade(skin, -10)} />

        {/* features — soften to a suggestion at avatar sizes */}
        <ellipse cx="27.4" cy="25.4" rx="1.35" ry="1.5" fill="#2B2018" opacity="0.86" />
        <ellipse cx="36.6" cy="25.4" rx="1.35" ry="1.5" fill="#2B2018" opacity="0.86" />
        <path d="M24.9 21.4c1.5-.9 3.4-.9 4.8-.1M34.3 21.3c1.4-.8 3.3-.8 4.8.1"
          stroke={shade(hair, 8)} strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <path d="M29.4 33.1c1.7.9 3.5.9 5.2 0" stroke={shade(skin, -34)} strokeWidth="1.25" strokeLinecap="round" fill="none" />

        {style.beard && (
          <path
            d="M21.2 26.8c.4 7.6 5 12.2 10.8 12.2s10.4-4.6 10.8-12.2c-1.6 4.4-4.2 6.4-10.8 6.4s-9.2-2-10.8-6.4Z"
            fill={hair}
            opacity="0.9"
          />
        )}

        {/* hair */}
        {style.hair === 0 && (
          <path d="M19.8 24.6c-.6-9 5.2-13.6 12.2-13.6s12.8 4.6 12.2 13.6c-1.4-4.4-2-6.6-4.2-7.8-3 1.6-13.4 1.8-16 .2-2 1.2-2.8 3.4-4.2 7.4Z" fill={hair} />
        )}
        {style.hair === 1 && (
          <g fill={hair}>
            <circle cx="24" cy="16.4" r="5.4" />
            <circle cx="32" cy="13.4" r="6" />
            <circle cx="40" cy="16.4" r="5.4" />
            <circle cx="20.4" cy="22.4" r="4.2" />
            <circle cx="43.6" cy="22.4" r="4.2" />
          </g>
        )}
        {style.hair === 2 && (
          <path d="M19.4 25.2c-1-9.4 4.8-14.2 12.6-14.2s13.6 4.8 12.6 14.2c-.4-4-1.4-6.2-2.6-7.6.6 9-1 14.8-1 20.4l4.6 1.6c1.4-6 2.8-12 2.8-17.8 0-11-6.6-17-16.4-17S15.6 10.8 15.6 21.8c0 5.8 1.4 11.8 2.8 17.8l4.6-1.6c0-5.6-1.6-11.4-1-20.4-1.2 1.4-2.2 3.6-2.6 7.6Z" fill={hair} />
        )}
        {style.hair === 3 && (
          <>
            <path d="M20.2 23.4c-.4-8 5-12.4 11.8-12.4s12.2 4.4 11.8 12.4Z" fill={hair} />
            {/* cap */}
            <path d="M18.4 23.6c-.8-8.6 5.2-14.4 13.6-14.4s14.4 5.8 13.6 14.4Z" fill={shade(shirt, -8)} />
            <path d="M17 23.2h30.6c1.5 0 2.4 1 2.4 2s-1 1.8-2.4 1.8H17Z" fill={shade(shirt, 8)} />
            <path d="M32 9.2c-1.1 0-2.1.1-3.1.3 1 3.4 1.4 8 1.4 13.9h3.4c0-5.9.4-10.5 1.4-13.9-1-.2-2-.3-3.1-.3Z" fill={shade(shirt, 20)} opacity="0.55" />
          </>
        )}
        {style.hair === 4 && (
          <path d="M20.4 24.6c-.8-9 4.8-13.6 11.6-13.6s12.4 4.6 11.6 13.6c-1.2-5.2-4.6-8.4-11.6-8.4s-10.4 3.2-11.6 8.4Z" fill={hair} opacity="0.94" />
        )}
        {style.hair === 5 && (
          <>
            <circle cx="32" cy="8.6" r="4.6" fill={hair} />
            <path d="M19.8 24.6c-.6-9 5.2-13.8 12.2-13.8s12.8 4.8 12.2 13.8c-1.6-5.6-4.8-8.4-12.2-8.4s-10.6 2.8-12.2 8.4Z" fill={hair} />
          </>
        )}
      </g>
    </svg>
  );
}

/** Nudge a hex colour lighter (+) or darker (−) by `amt` points per channel. */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ─────────────────────────────────────────────────────────────
   Icon set. Consistent 24-unit grid, 1.7 stroke, round joins.
   ───────────────────────────────────────────────────────────── */

type IconProps = { className?: string; strokeWidth?: number };
const stroke = (w = 1.7) => ({
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ArrowRight = ({ className }: IconProps) => (
  <svg {...stroke(2)} className={className}><path d="M4 12h15m-6.2-6.4L19.2 12l-6.4 6.4" /></svg>
);
export const CheckShield = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M10 1.9a11.1 11.1 0 0 0 7.3 2.8c.1.6.2 1.2.2 1.9 0 4.9-3.1 9-7.5 10.5C5.6 15.6 2.5 11.5 2.5 6.6c0-.7.1-1.3.2-1.9A11.1 11.1 0 0 0 10 1.9Zm3.5 5.4a.94.94 0 0 0-1.35-1.3L9 9.2 7.85 8.06A.94.94 0 0 0 6.5 9.36l1.85 1.88c.36.37.95.37 1.31 0Z" />
  </svg>
);
export const Check = ({ className, strokeWidth = 2.4 }: IconProps) => (
  <svg {...stroke(strokeWidth)} className={className}><path d="M4.5 12.5l4.6 4.6L19.5 6.8" /></svg>
);
export const CheckCircle = ({ className }: IconProps) => (
  <svg {...stroke(1.9)} className={className}><circle cx="12" cy="12" r="8.7" /><path d="m8.3 12.2 2.6 2.6 4.8-5.4" /></svg>
);
export const BarsIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <rect x="3.2" y="10.4" width="4.4" height="9.4" rx="1.4" />
    <rect x="9.8" y="6.4" width="4.4" height="13.4" rx="1.4" />
    <rect x="16.4" y="3.2" width="4.4" height="16.6" rx="1.4" />
  </svg>
);
export const ClockIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}><circle cx="12" cy="12" r="8.7" /><path d="M12 7.4V12l3.2 2.2" /></svg>
);
export const RefreshIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <path d="M20.2 12a8.2 8.2 0 0 1-14.4 5.4M3.8 12a8.2 8.2 0 0 1 14.4-5.4" />
    <path d="M3.8 17.6V12h5.4M20.2 6.4V12h-5.4" />
  </svg>
);
export const LockIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <rect x="4.6" y="10.2" width="14.8" height="9.6" rx="2.8" />
    <path d="M8.4 10.2V7.6a3.6 3.6 0 0 1 7.2 0v2.6M12 14v2" />
  </svg>
);
export const DocCheckIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <path d="M6.4 3.4h6.6l4.6 4.6v12.6H6.4Z" />
    <path d="M12.8 3.4V8h4.8" />
    <path d="m9.4 14.2 1.9 1.9 3.5-3.9" />
  </svg>
);
export const PlayCircleIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <rect x="2.6" y="4.8" width="18.8" height="14.4" rx="4.4" />
    <path d="M10.4 9.6 15 12l-4.6 2.4Z" fill="currentColor" />
  </svg>
);
export const TrendUpIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.6)} className={className}>
    <path d="M4.4 20V9.6M10.8 20V4.4M17.2 20v-7" />
    <path d="M14.6 7.2h5.4v5" />
    <path d="m20 7.4-6.4 6-3-2.8" />
  </svg>
);
export const RocketIcon = ({ className }: IconProps) => (
  <svg {...stroke(1.55)} className={className}>
    <path d="M13.6 3.4c3.6 1.1 6.4 4 7.4 7.6l-8.2 8.2-4.6-1-2-2-1-4.6Z" />
    <circle cx="15.1" cy="8.9" r="2.1" />
    <path d="M8.2 15.8 4.6 19.4M6.6 12.4l-2.2 1 1.4 2.6M11.6 17.4l1 2.2 2.6-1.4" />
  </svg>
);
export const Caret = ({ className }: IconProps) => (
  <svg {...stroke(2.1)} viewBox="0 0 20 20" className={className}><path d="M5.5 8 10 12.5 14.5 8" /></svg>
);
