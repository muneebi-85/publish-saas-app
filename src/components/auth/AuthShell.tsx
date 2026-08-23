import React from 'react';
import Link from 'next/link';

/**
 * Frame shared by /sign-in and /sign-up: the logo row, the card, and the
 * cross-link to the other screen.
 *
 * Server component on purpose. Nothing here needs state, so the shell — logo,
 * card, both headings — is in the first HTML the browser receives and paints
 * before any JavaScript arrives. Only the fields inside it hydrate.
 *
 * Colours are Tailwind's stock neutrals plus `red-brand`, not this app's
 * `ink-*`/`surface-*` tokens: those resolve to the product's near-black canvas
 * (see :root in globals.css), and the comp for these screens — like the landing
 * page it continues from — is white.
 */
export const AuthShell: React.FC<{
  children: React.ReactNode;
  /** e.g. "Already have an account?" */
  altPrompt: string;
  altLabel: string;
  altHref: string;
}> = ({ children, altPrompt, altLabel, altHref }) => (
  // Clearance for the fixed cookie banner is added by `.cookie-banner-open
  // .auth-page-root` in globals.css, only while that banner is actually up.
  <div className="auth-page-root flex min-h-svh flex-col items-center px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
    <div className="w-full max-w-[520px]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link href="/" aria-label="Publish home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- same fixed-size
              local logo the landing header uses; next/image would add a loader
              round-trip in front of the first paint we are trying to speed up. */}
          <img
            src="/images/landing/logo.png"
            alt="Publish"
            width={379}
            height={81}
            className="h-[26px] w-auto object-contain"
          />
        </Link>
        <p className="text-[14px] text-gray-500">
          <span className="hidden sm:inline">{altPrompt} </span>
          <Link
            href={altHref}
            className="font-semibold text-red-brand transition-colors hover:text-red-brand-ink"
          >
            {altLabel}
          </Link>
        </p>
      </div>

      <div className="rounded-[16px] border border-gray-200/90 bg-white p-6 shadow-[0_1px_3px_rgba(17,17,17,0.04),0_14px_36px_-18px_rgba(17,17,17,0.12)] sm:p-9">
        {children}
      </div>
    </div>
  </div>
);

/** Card heading + one line of context, centred as in the comp. */
export const AuthHeading: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <div className="mb-7 text-center">
    <h1 className="text-[27px] font-extrabold tracking-tight text-gray-900 sm:text-[29px]">
      {title}
    </h1>
    <p className="mt-1.5 text-[14.5px] text-gray-500">{sub}</p>
  </div>
);
