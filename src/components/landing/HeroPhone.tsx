/* eslint-disable @next/next/no-img-element -- photoreal hero composite, no loader needed */
'use client';

import React from 'react';
import { RED } from './brand';

/**
 * Hero visual: a photographed hand holding a phone, with the phone's screen
 * and the three floating cards drawn in crisp DOM on top of it.
 *
 * The source photo is only 512px on its long edge, so its own screen is a
 * blur. `hero-hand.png` is that photo with the background flood-filled to
 * transparent and every baked-in UI element removed; the geometry below was
 * measured off it, and the fingers/thumb stop at the frame edges so an opaque
 * overlay inside the frame occludes nothing.
 *
 * Everything is sized in `cqw` against the wrapper's inline size, so the whole
 * composite — photo, screen type, floating cards — scales as one unit at any
 * viewport width.
 */

/* Percentages of the image box (656x914 -> aspect 0.71772). The frame is a
   hair wider than the measured bezel so the photo's own highlight along the
   edge is covered rather than peeking out as a seam. */
const FRAME = { left: 11.05, top: 0.9, width: 48.0, height: 72.8 };
const SCREEN = { left: 12.805, top: 2.188, width: 44.512, height: 69.365 };

/** Design reference width for the wrapper; `cq(px)` reads as px at that width. */
const REF = 560;
const cq = (px: number) => `${((px / REF) * 100).toFixed(4)}cqw`;

/* Values read off the comp's phone screen, in its order. */
const BREAKDOWN: [string, number][] = [
  ['Hook', 91],
  ['SEO', 88],
  ['Thumbnail', 90],
  ['Authenticity', 94],
  ['Retention', 92],
  ['Monetization', 87],
];

const FIXES: string[] = [
  'Stronger hook in first 7 seconds',
  'Optimize Thumbnail CTR',
  'Adjust monetization keywords',
];

export default function HeroPhone() {
  return (
    <div className="lp-cq relative w-full">
      {/* soft grounding circles */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{ left: '-12%', top: '6%', width: '78%', paddingBottom: '78%', background: '#F4F4F6' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{ left: '28%', top: '34%', width: '82%', paddingBottom: '82%', border: '1px solid #EDEDEF' }}
      />

      {/* the photo sets the box height; everything else is absolute against it */}
      <div className="relative" style={{ width: '100%', paddingBottom: `${(914 / 656) * 100}%` }}>
        <img
          src="/images/landing/hero-hand.png"
          alt="A hand holding a phone that shows a video's Publish Score"
          width={656}
          height={914}
          className="absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
        />

        {/* phone body */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: `${FRAME.left}%`,
            top: `${FRAME.top}%`,
            width: `${FRAME.width}%`,
            height: `${FRAME.height}%`,
            background: 'linear-gradient(150deg,#2A2D33 0%,#14161A 38%,#1B1E23 100%)',
            borderRadius: '11.7% / 5.5%',
          }}
        />

        {/* screen */}
        <div
          className="absolute overflow-hidden bg-white"
          style={{
            left: `${SCREEN.left}%`,
            top: `${SCREEN.top}%`,
            width: `${SCREEN.width}%`,
            height: `${SCREEN.height}%`,
            borderRadius: '10.8% / 4.97%',
            color: '#101114',
          }}
        >
          <PhoneScreen />
        </div>
      </div>

      {/* Floating cards, clear of the screen so nothing the phone is
          showing ends up hidden behind them. */}

      <FloatCard className="float-a" style={{ left: '62%', top: '3%', width: '44%' }}>
        <CardLabel>Publish Score</CardLabel>
        <div className="flex items-end" style={{ gap: cq(3), marginTop: cq(4) }}>
          <span style={{ fontSize: cq(30), fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1 }}>91</span>
          <span style={{ fontSize: cq(11), fontWeight: 600, color: '#9A9CA3', paddingBottom: cq(3) }}>/100</span>
        </div>
        <div className="flex items-center" style={{ gap: cq(4), marginTop: cq(6) }}>
          <Dot />
          <span style={{ fontSize: cq(10.5), fontWeight: 600, color: '#5F636C' }}>Top 12%</span>
        </div>
      </FloatCard>

      <FloatCard className="float-b" style={{ left: '60%', top: '29%', width: '47%' }}>
        <CardLabel>Hook · first 7 seconds</CardLabel>
        <div className="flex items-center" style={{ gap: cq(9), marginTop: cq(8) }}>
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ width: cq(58), height: cq(33), borderRadius: cq(6), background: 'linear-gradient(135deg,#2B3038,#14171C)' }}
          >
            <span
              className="absolute inset-0 m-auto block"
              style={{
                width: cq(15),
                height: cq(15),
                borderRadius: '9999px',
                background: 'rgba(255,255,255,.92)',
              }}
            />
            <span
              className="absolute inset-0 m-auto block"
              style={{
                width: 0,
                height: 0,
                borderTop: `${cq(3.4)} solid transparent`,
                borderBottom: `${cq(3.4)} solid transparent`,
                borderLeft: `${cq(5.6)} solid #14171C`,
                marginLeft: cq(2),
              }}
            />
          </div>
          <div>
            <div
              className="relative inline-block"
              style={{ fontSize: cq(17), fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}
            >
              Strong
              <span
                aria-hidden
                className="absolute left-0 block w-full"
                style={{ bottom: cq(-3), height: cq(2.4), borderRadius: '9999px', background: RED }}
              />
            </div>
            <div style={{ fontSize: cq(10), fontWeight: 600, color: '#9A9CA3', marginTop: cq(6) }}>
              Beats 88% of niche
            </div>
          </div>
        </div>
      </FloatCard>

      <FloatCard className="float-c" style={{ left: '63%', top: '56%', width: '45%' }}>
        <CardLabel>CTR prediction</CardLabel>
        <div className="flex items-end justify-between" style={{ marginTop: cq(6) }}>
          <span style={{ fontSize: cq(22), fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>4.1%</span>
          <svg
            viewBox="0 0 64 26"
            aria-hidden
            style={{ width: cq(58), height: cq(24) }}
            fill="none"
          >
            <path
              d="M2 21.4 12 18 22 19.6 32 12.4 42 13.8 52 6.6 62 3"
              stroke={RED}
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="62" cy="3" r="2.6" fill={RED} />
          </svg>
        </div>
      </FloatCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The phone's screen. Sizes are tuned so the report fills the
   screen top to bottom the way it does in the comp — the last
   fix row lands flush with the bottom bezel.
   ───────────────────────────────────────────────────────────── */
function PhoneScreen() {
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: cq(11) }}>
      {/* notch */}
      <div className="flex shrink-0 justify-center" style={{ paddingTop: cq(7) }}>
        <span
          aria-hidden
          className="block"
          style={{ width: cq(52), height: cq(13), borderRadius: '9999px', background: '#14161A' }}
        />
      </div>

      {/* app bar */}
      <div
        className="flex shrink-0 items-center justify-between"
        style={{ padding: `${cq(9)} ${cq(12)} ${cq(9)}`, borderBottom: '1px solid #EDEDEF' }}
      >
        <span className="flex items-center" style={{ gap: cq(5) }}>
          <svg viewBox="0 0 32 32" aria-hidden style={{ width: cq(16), height: cq(16) }}>
            <circle cx="16" cy="16" r="16" fill={RED} />
            <path d="M12.6 10.3 22 16l-9.4 5.7V10.3Z" fill="#fff" />
          </svg>
          <span style={{ fontSize: cq(13), fontWeight: 800, letterSpacing: '-0.035em' }}>Publish</span>
        </span>
        <span className="flex items-center" style={{ gap: cq(8) }}>
          <span
            aria-hidden
            className="block"
            style={{
              width: cq(17),
              height: cq(17),
              borderRadius: '9999px',
              background: 'linear-gradient(150deg,#E8D3C2,#C89A76)',
              border: '1px solid #E2E2E5',
            }}
          />
          <span aria-hidden className="flex flex-col justify-between" style={{ width: cq(14), height: cq(10) }}>
            <i style={{ display: 'block', height: cq(1.7), background: '#101114', borderRadius: '9999px' }} />
            <i style={{ display: 'block', height: cq(1.7), background: '#101114', borderRadius: '9999px' }} />
            <i style={{ display: 'block', height: cq(1.7), width: '68%', background: '#101114', borderRadius: '9999px' }} />
          </span>
        </span>
      </div>

      {/* headline score */}
      <div
        className="shrink-0"
        style={{ padding: `${cq(13)} ${cq(12)} ${cq(14)}`, borderBottom: '1px solid #EDEDEF' }}
      >
        <div style={{ fontSize: cq(15), fontWeight: 800, letterSpacing: '-0.035em' }}>Publish Score</div>
        <div className="flex items-end" style={{ gap: cq(4), marginTop: cq(4) }}>
          <span
            style={{
              fontSize: cq(50),
              fontWeight: 800,
              letterSpacing: '-0.055em',
              lineHeight: 0.86,
              color: RED,
            }}
          >
            91
          </span>
          <span style={{ fontSize: cq(17), fontWeight: 700, color: '#101114', paddingBottom: cq(4) }}>/100</span>
        </div>
        <div className="flex items-center" style={{ gap: cq(5), marginTop: cq(9) }}>
          <Dot />
          <span style={{ fontSize: cq(10.5), fontWeight: 600, color: '#5F636C' }}>Top 12% in your niche</span>
        </div>
      </div>

      {/* breakdown */}
      <div style={{ padding: `${cq(12)} ${cq(12)} ${cq(11)}`, borderBottom: '1px solid #EDEDEF' }}>
        <div style={{ fontSize: cq(10.5), fontWeight: 700, letterSpacing: '-0.01em' }}>Score breakdown</div>
        <div className="flex flex-col" style={{ gap: cq(9), marginTop: cq(10) }}>
          {BREAKDOWN.map(([label, value]) => (
            <div key={label} className="flex items-center" style={{ gap: cq(8) }}>
              <span
                className="shrink-0 truncate"
                style={{ width: cq(58), fontSize: cq(9.5), fontWeight: 600, color: '#5F636C' }}
              >
                {label}
              </span>
              <span
                aria-hidden
                className="block flex-1"
                style={{ height: cq(5), borderRadius: '9999px', background: '#F0F0F2' }}
              >
                <i
                  className="block h-full"
                  style={{
                    width: `${value}%`,
                    borderRadius: '9999px',
                    background: `linear-gradient(90deg,#101114 0 74%,${RED} 74% 100%)`,
                  }}
                />
              </span>
              <span
                className="shrink-0 text-right"
                style={{ width: cq(16), fontSize: cq(9.5), fontWeight: 800, letterSpacing: '-0.02em' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* fixes */}
      <div className="flex flex-1 flex-col" style={{ padding: `${cq(12)} ${cq(12)} ${cq(4)}` }}>
        <div style={{ fontSize: cq(10.5), fontWeight: 700, letterSpacing: '-0.01em' }}>
          Top 3 fixes <span style={{ color: '#9A9CA3', fontWeight: 600 }}>(high impact)</span>
        </div>
        <div style={{ marginTop: cq(4) }}>
          {FIXES.map((label, i) => (
            <div
              key={label}
              className="flex items-center"
              style={{
                gap: cq(8),
                padding: `${cq(11)} 0`,
                borderBottom: i < FIXES.length - 1 ? '1px solid #F1F1F3' : undefined,
              }}
            >
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: cq(17),
                  height: cq(17),
                  borderRadius: '9999px',
                  border: `1px solid ${RED}`,
                  color: RED,
                  fontSize: cq(9),
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                style={{ fontSize: cq(10), fontWeight: 700, letterSpacing: '-0.015em' }}
              >
                {label}
              </span>
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                fill="none"
                stroke="#B9BBC1"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                style={{ width: cq(9), height: cq(9) }}
              >
                <path d="M7.5 4.5 13 10l-5.5 5.5" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── small shared pieces ─────────────────────────────────────── */

function FloatCard({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute bg-white ${className}`}
      style={{
        borderRadius: cq(14),
        border: '1px solid #EDEDEF',
        boxShadow: '0 22px 48px -20px rgba(16,17,20,.22), 0 3px 10px -4px rgba(16,17,20,.10)',
        padding: `${cq(13)} ${cq(14)}`,
        color: '#101114',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: cq(9),
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#9A9CA3',
      }}
    >
      {children}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{ width: cq(13), height: cq(13), borderRadius: '9999px', background: '#E6F4EA' }}
    >
      <svg viewBox="0 0 20 20" aria-hidden fill="none" stroke="#1E874B" strokeWidth="3" strokeLinecap="round"
        strokeLinejoin="round" style={{ width: cq(8), height: cq(8) }}>
        <path d="M4 10.6 8 14.6 16 5.8" />
      </svg>
    </span>
  );
}
