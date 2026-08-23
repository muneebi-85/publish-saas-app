/**
 * Logo-bar marks, drawn inline so the row stays crisp at any DPR and needs no
 * image assets. Each mark renders at a fixed optical height and inherits
 * `currentColor`, which the bar sets to the muted ink used in the comp.
 *
 * Scope note: these are the five platforms the review engine actually scores —
 * see `PlatformName` in src/lib/ai/policies.ts. The bar previously also carried
 * creator and competitor wordmarks (MrBeast, NasDaily, vidIQ, TubeBuddy,
 * ThinkMedia, CreatorNow) under a "Trusted by" label, which reads as a customer
 * list we cannot substantiate. Anything added here should be either a supported
 * platform or a customer who has agreed to be named.
 */
import React from 'react';

export function YouTubeMark() {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <svg width="27" height="19" viewBox="0 0 28 20" fill="currentColor" aria-hidden="true">
        <path d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9ZM11.2 14.2V5.8L18.5 10l-7.3 4.2Z" />
      </svg>
      <span className="text-[19px] font-bold tracking-[-0.035em]">YouTube</span>
    </span>
  );
}

export function TikTokMark() {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <svg width="18" height="21" viewBox="0 0 18 21" fill="currentColor" aria-hidden="true">
        <path d="M12.9 0h-3.4v13.6a2.5 2.5 0 1 1-2.5-2.5c.26 0 .5.04.74.11V7.75a6 6 0 0 0-.74-.05 5.95 5.95 0 1 0 5.95 5.95V6.29a6.9 6.9 0 0 0 4.06 1.32V4.19a3.6 3.6 0 0 1-3.32-3.5V0h-.8Z" />
      </svg>
      <span className="text-[19px] font-bold tracking-[-0.035em]">TikTok</span>
    </span>
  );
}

export function InstagramMark() {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <rect x="1.15" y="1.15" width="17.7" height="17.7" rx="5.2" />
        <circle cx="10" cy="10" r="4.15" />
        <circle cx="14.9" cy="5.1" r="1.15" fill="currentColor" stroke="none" />
      </svg>
      {/* The comp sets Instagram in an italic script — Georgia italic is the
          closest metric-safe stand-in without shipping another webfont. */}
      <span className="text-[19px] italic tracking-[-0.02em]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        Instagram
      </span>
    </span>
  );
}

export function FacebookMark() {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <svg width="19" height="19" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M20 10a10 10 0 1 0-11.56 9.88v-6.99H5.9V10h2.54V7.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V10h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 20 10Z" />
      </svg>
      <span className="text-[19px] font-bold tracking-[-0.035em]">Facebook</span>
    </span>
  );
}

export function LinkedInMark() {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="3.4" fill="currentColor" />
        <path
          d="M4.4 7.6h2.3v8H4.4v-8Zm1.15-3.5a1.34 1.34 0 1 1 0 2.68 1.34 1.34 0 0 1 0-2.68ZM8.3 7.6h2.2v1.1h.03c.31-.58 1.06-1.2 2.18-1.2 2.33 0 2.76 1.53 2.76 3.52v4.58h-2.3v-4.06c0-.97-.02-2.21-1.35-2.21-1.35 0-1.55 1.05-1.55 2.14v4.13H8.3v-8Z"
          fill="#FEFEFE"
        />
      </svg>
      <span className="text-[19px] font-bold tracking-[-0.035em]">LinkedIn</span>
    </span>
  );
}
