/* eslint-disable @next/next/no-img-element -- local raster assets from the
   design comp; next/image adds a loader round-trip for no benefit here. */
'use client';

/**
 * Landing page.
 *
 * A 1:1 port of the Google Stitch comp "Publish — Final SaaS Enhancements"
 * (project 16733385608411739388, screen e325b2b5…). The comp's own markup is
 * checked in at .stitch/design.html and is the spec for this file — section
 * order, copy, spacing, and every hover state come from there.
 *
 * Deliberate departures from a literal port:
 *
 *  - Type sizes and small radii are written as explicit px. The comp assumes
 *    stock Tailwind, and this project overrides both scales in
 *    tailwind.config.js for the product UI, so `text-5xl` here would not be
 *    the comp's 48px. Bracket values pin them to what the comp renders.
 *
 *  - The hero is a single viewport. A separate above-the-fold reference render
 *    frames the header and the whole hero together, so from lg up the section
 *    takes 100svh minus the header and the h1 scales with viewport height.
 *
 *  - The imagery is a later, higher-resolution set supplied outside Stitch
 *    (originals under .stitch/bak/, prefixed orig-): the photographed phone
 *    shot, the three report cards that float off it, both creator strips, the
 *    testimonial portrait, the before/after thumbnails and the algorithm graph.
 *    Stitch's own hero image 403s and its avatars are misgenerated, so those
 *    used to be drawn in DOM; the supplied files replace them. All nine are
 *    WebP — as PNG the set is 4.4MB against 715KB, which the hero pays for in
 *    LCP.
 *
 * The comp's remaining rasters were repaired in place (also .stitch/bak/): the
 * six check icons and both logos shipped as opaque white plates with the label
 * baked in, which drew white boxes over the translucent header and an illegible
 * smear in the footer, so they are cropped to their ink and alpha-cleared;
 * rocket.png got the same treatment.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MegaMenu } from '@/components/landing/MegaMenu';
import { RESOURCES_MENU } from '@/components/landing/navData';
import { PLANS, priceLabel } from '@/lib/plans';
import {
  YouTubeMark,
  TikTokMark,
  InstagramMark,
  FacebookMark,
  LinkedInMark,
} from '@/components/landing/BrandMarks';

/* The comp's content column: Tailwind's max-w-7xl (1280px) with its
   px-4 / sm:px-6 / lg:px-8 gutter. One constant so every section's left
   edge lands on the same line. */
const SHELL = 'mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8';
const SHELL_NARROW = 'mx-auto w-full max-w-[768px] px-4';

const NAV = [
  { label: 'How it works', href: '#how' },
  { label: 'Checks', href: '#checks' },
  { label: 'Pricing', href: '#pricing' },
];

const CTA_LABEL = 'Score my script — free';

export default function LandingClient({ isLoggedIn, plan }: { isLoggedIn: boolean; plan: string }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* Dismiss the mobile panel on Escape or an outside tap — the same contract
     the desktop mega-menu honours via its own dismiss hook. */
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const panel = document.getElementById('lp-mobile-panel');
      const trigger = document.getElementById('lp-mobile-trigger');
      if (panel?.contains(e.target as Node) || trigger?.contains(e.target as Node)) return;
      setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [mobileMenuOpen]);
  const startHref = isLoggedIn ? '/dashboard' : '/sign-up';

  /* The comp's reveal observer: add .revealed on first intersection and leave
     it there. Everything it drives — the fade-up, the score bars growing out
     of their left edge — is CSS, gated behind .lp-anim, which is added here.
     So before hydration, or with JS off, nothing on the page is hidden and
     every bar sits at its real width. */
  useEffect(() => {
    document.documentElement.classList.add('lp-anim');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    document.querySelectorAll('.reveal-element').forEach((el) => io.observe(el));
    // Remove the animation class on unmount so navigating into the app does
    // not leave a landing-page-only class on <html> for the rest of the session.
    return () => {
      io.disconnect();
      document.documentElement.classList.remove('lp-anim');
    };
  }, []);

  const handleUpgrade = async (planId: string) => {
    // The landing page's audience is anonymous. The checkout route is
    // auth-bound by design (the webhook must credit a real account), so an
    // anonymous click surfaced a raw "Not authenticated" error instead of a
    // path to buy. Route to sign-up with the pricing intent preserved.
    if (!isLoggedIn) {
      window.location.href = '/sign-up?redirect_url=%2Fpricing';
      return;
    }
    setLoadingId(planId);
    setCheckoutError('');

    if (plan !== 'free' && plan !== planId) {
      window.location.href = '/api/billing/portal';
      return;
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: 'monthly' }),
      });
      // Guarded: a proxy error page is HTML, and unguarded parsing would
      // surface as "Unexpected token '<'" in the checkout-error UI.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server already holds a live subscription — the portal is the
        // only correct next step.
        if (data?.portalRequired) {
          window.location.href = '/api/billing/portal';
          return;
        }
        throw new Error(data.error || 'Checkout failed');
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setCheckoutError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="landing-page-root relative min-h-screen overflow-x-hidden antialiased">

      <Header
        startHref={startHref}
        isLoggedIn={isLoggedIn}
        open={mobileMenuOpen}
        setOpen={setMobileMenuOpen}
      />

      <main className="relative z-10 pt-20">
        <Hero startHref={startHref} />
        <AsSeenOn />
        <TrustBar />
        <Checks />
        <AlgorithmPanel />
        <Testimonial />
        <HowItWorks />
        <Pricing
          startHref={startHref}
          plan={plan}
          loadingId={loadingId}
          checkoutError={checkoutError}
          onUpgrade={handleUpgrade}
        />
        <Faq />
        <FinalCta startHref={startHref} />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────── */

/**
 * The arrow that trails every red CTA in the comp.
 *
 * No built-in size. It used to hard-code `h-5 w-5` and then concatenate the
 * caller's class, so `<CtaArrow className="h-4 w-4" />` emitted
 * `class="h-5 w-5 h-4 w-4"` and rendered at 16px only because Tailwind happens to
 * order `h-4` after `h-5` in the generated stylesheet. Nothing in the markup
 * decided that — a change to class ordering would silently resize four CTAs. The
 * size now comes from exactly one place: the caller.
 */
function CtaArrow({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}

/** The comp's inline check: a bare 2px tick, no disc. */
function Tick({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}


/* ── Header ──────────────────────────────────────────────────────
   The comp's nav is `hidden md:flex` with no small-screen fallback, so
   the hamburger and the panel below it are additions — a landing page
   whose nav disappears under 768px is broken. The comp swaps them in at
   md, where the logo, four links and the auth pair need more than 768px
   and wrap onto two lines, so the switch happens at lg instead; at the
   comp's own 1280 reference width nothing changes. Everything else, down
   to the h-20 bar and the hover lift on each link, is the comp's.
   ───────────────────────────────────────────────────────────────── */

const NAV_LINK =
  'text-[16px] font-medium text-ink-900 transition-all duration-300 hover:-translate-y-0.5 hover:text-red-brand-ink';

function Header({
  startHref,
  isLoggedIn,
  open,
  setOpen,
}: {
  startHref: string;
  isLoggedIn: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-ink-100/50 bg-white/70 backdrop-blur-xl transition-all duration-500">
      <div className={SHELL}>
        <div className="flex h-20 items-center justify-between">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 transition-transform duration-300 hover:scale-105"
          >
            <img
              src="/images/landing/logo.png"
              alt="Publish"
              width={379}
              height={81}
              className="h-[29px] w-auto object-contain"
            />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((item) => (
              <a key={item.label} href={item.href} className={NAV_LINK}>
                {item.label}
              </a>
            ))}
            <MegaMenu label="Resources" groups={RESOURCES_MENU} footer={{ label: 'Visit the help center', href: '/help' }} />
          </nav>

          <div className="hidden items-center gap-6 lg:flex">
            <Link href={isLoggedIn ? '/dashboard' : '/sign-in'} className={NAV_LINK}>
              {isLoggedIn ? 'Dashboard' : 'Log in'}
            </Link>
            <Link
              href={startHref}
              className="shimmer-hover flex items-center gap-2 rounded-full bg-red-brand-ink px-6 py-2.5 hover:brightness-95 text-[16px] font-medium text-white"
            >
              {CTA_LABEL}
              <CtaArrow className="h-4 w-4" />
            </Link>
          </div>

          {/* small screens */}
          <button
            type="button"
            id="lp-mobile-trigger"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={open ? 'lp-mobile-panel' : undefined}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-brand/60 focus-visible:ring-offset-2 lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {open ? (
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="lp-mobile-panel" className="border-t border-ink-100/50 bg-white/95 backdrop-blur-xl lg:hidden">
          <div className={`${SHELL} flex flex-col gap-1 py-4`}>
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-[8px] px-2 py-3 text-[16px] font-medium text-ink-900 transition-colors hover:bg-ink-50"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="rounded-[8px] px-2 py-3 text-[16px] font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              Resources
            </Link>
            <Link
              href={isLoggedIn ? '/dashboard' : '/sign-in'}
              onClick={() => setOpen(false)}
              className="rounded-[8px] px-2 py-3 text-[16px] font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              {isLoggedIn ? 'Dashboard' : 'Log in'}
            </Link>
            <Link
              href={startHref}
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-2 rounded-full bg-red-brand-ink px-6 py-3 hover:brightness-95 text-[16px] font-medium text-white"
            >
              {CTA_LABEL}
              <CtaArrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Hero ────────────────────────────────────────────────────────── */

function BadgeShield({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      />
    </svg>
  );
}

function Hero({ startHref }: { startHref: string }) {
  return (
    /* One-viewport hero. The above-the-fold reference render puts the header and
       the whole hero inside a single 1402x779 frame, so from lg up the section
       claims the viewport minus the 80px header and centres its two columns in
       it. svh (not vh) so mobile browser chrome does not push the CTA under the
       fold. Below lg the content is taller than any phone viewport, so it flows
       normally and scrolls. */
    <section
      className={`reveal-element relative flex flex-col items-center bg-white pb-16 pt-10 lg:min-h-[calc(100svh-5rem)] lg:flex-row lg:items-center lg:py-8 ${SHELL}`}
    >
      {/* The section is capped at the 1280 shell, so past that width its gutters
          showed the shader's grey through. The reference render is pure white
          edge to edge above the fold, so the hero paints its own full-bleed
          base. */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-white" />

      {/* left column */}
      <div className="z-10 w-full lg:w-1/2 lg:pr-8">
        <div className="hero-fade-up mb-5 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-ink-200/50 bg-white/80 px-4 py-1.5 shadow-sm backdrop-blur-md transition-shadow duration-300 hover:shadow-md">
            <BadgeShield className="h-4 w-4 text-red-brand" />
            <span className="text-[14px] font-medium text-ink-700">Pre-publish review for serious creators</span>
          </span>
          {/* Five faces as one strip. The strip's own "+2.1k more" pill is
              cropped off the asset because the count next to it is "12K+"
              here; the uncropped version is used lower down. */}
          <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-ink-200/50 bg-white/80 py-1.5 pl-2 pr-3.5 shadow-sm backdrop-blur-md transition-shadow duration-300 hover:shadow-md">
            <img
              src="/images/landing/avatar-group.webp"
              alt=""
              width={520}
              height={136}
              className="h-7 w-auto"
            />
            <span className="text-[12px] font-bold text-ink-900">Publish Score&trade;</span>
          </span>
        </div>

        {/* Type scales with the viewport so the column still fits above the fold
            on a short laptop: ~44px at 700px tall, the comp's 72px only once
            there is room for it. */}
        <h1
          className="hero-fade-up mb-5 text-[40px] font-extrabold leading-[1.08] tracking-tight text-ink-900 sm:text-[52px] lg:text-[clamp(2.5rem,4.2vh+1vw,4.5rem)]"
          style={{ animationDelay: '100ms' }}
        >
          Run your script.{' '}
          <br className="hidden lg:inline" />
          Get your <span className="curve-underline italic text-red-brand">score.</span>
        </h1>

        <p
          className="hero-fade-up mb-4 max-w-lg text-[16px] leading-relaxed text-ink-600 lg:text-[18px]"
          style={{ animationDelay: '200ms' }}
        >
          Paste your video script and get a Publish Score in under a minute — the hook, the
          retention, the SEO, the thumbnail. Everything that decides whether this one gets
          a thousand views or a million.
        </p>

        <p
          className="hero-fade-up mb-6 text-[18px] font-bold leading-7 text-ink-900"
          style={{ animationDelay: '300ms' }}
        >
          Score first. <span className="underline decoration-2 underline-offset-4">Then go viral.</span>
        </p>

        {/* Six faces, cropped where the comp's "+2.1k more" pill began — there
            is no user count to substantiate 2.1k, so the count is not in the
            asset and there is no HTML number next to it either. */}
        <img
          src="/images/landing/avatar-stack.webp"
          alt=""
          width={735}
          height={176}
          className="hero-fade-up mb-3 h-11 w-auto"
          style={{ animationDelay: '400ms' }}
        />

        <p className="hero-fade-up mb-6 text-[14px] text-ink-500" style={{ animationDelay: '450ms' }}>
          Built for creators who monetize every upload
        </p>

        <div
          className="hero-fade-up flex flex-col items-start gap-5 sm:flex-row sm:items-center"
          style={{ animationDelay: '500ms' }}
        >
          <Link
            href={startHref}
            className="shimmer-hover flex items-center gap-2 rounded-full bg-red-brand-ink px-8 py-4 text-[18px] font-bold text-white shadow-lg shadow-red-brand/20"
          >
            Score my script — free
            <CtaArrow className="h-5 w-5" />
          </Link>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[14px] text-ink-600">
              <Tick className="h-4 w-4 text-red-brand" />
              No credit card.
            </div>
            <div className="flex items-center gap-2 text-[14px] text-ink-600">
              <Tick className="h-4 w-4 text-red-brand" />
              No trial timers.
            </div>
          </div>
        </div>
      </div>

      {/* right column — the phone shot with the three report cards floating off
          it. The inner box is a flex item with no width of its own, so it
          shrink-wraps the phone image and the cards' percentage offsets track
          the phone at every size instead of the (wider) column. Each card is
          already tilted in its own asset, so none of them is rotated here.
          The overhang tightens as the viewport narrows, because past the shell's
          gutter the root's overflow-x-hidden would slice the cards instead. A
          360px screen has no room for a phone plus two cards beside it, so under
          sm only the score card stays — the other two would sit on top of the
          report they are meant to be pulled out of. */}
      <div className="mt-12 flex w-full justify-center lg:mt-0 lg:w-1/2">
        <div
          className="hero-fade-up relative"
          style={{ animationDelay: '400ms' }}
        >
          <img
            src="/images/landing/hero-phone-hand.webp"
            alt="A hand holding a phone showing a Publish report: score 91 out of 100, the score breakdown and the top three fixes"
            width={955}
            height={1263}
            className="float-soft block h-auto w-[min(78vw,320px)] sm:w-[360px] lg:w-auto lg:max-h-[calc(100svh-11rem)] lg:max-w-full"
          />

          <img
            src="/images/landing/card-score.webp"
            alt=""
            width={700}
            height={749}
            className="pointer-events-none absolute -left-[8%] top-[3%] w-[38%] drop-shadow-xl sm:top-[7%] sm:w-[46%] sm:-left-[18%] lg:-left-[24%]"
          />
          <img
            src="/images/landing/card-hook.webp"
            alt=""
            width={580}
            height={549}
            className="pointer-events-none absolute top-[4%] hidden w-[42%] drop-shadow-xl sm:block sm:-right-[18%] lg:-right-[24%]"
          />
          <img
            src="/images/landing/card-ctr.webp"
            alt=""
            width={579}
            height={577}
            className="pointer-events-none absolute bottom-[16%] hidden w-[42%] drop-shadow-xl sm:block sm:-right-[15%] lg:-right-[20%]"
          />
        </div>
      </div>
    </section>
  );
}

/* ── Supported-platform strip ────────────────────────────────────
   Was "As seen on & trusted by" over TechCrunch / Forbes / The Verge /
   Creators.co. None of those had featured the product, which makes it a
   false endorsement using other companies' trademarks — the single
   riskiest line on the page. It now names the five platforms the review
   engine actually scores (`PlatformName` in src/lib/ai/policies.ts),
   which is a factual compatibility statement rather than a claim about
   who has covered us. Marks come from BrandMarks.tsx.
   ───────────────────────────────────────────────────────────────── */

function AsSeenOn() {
  return (
    <section className="reveal-element border-y border-ink-100/50 bg-white/50 py-8 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1280px] px-4">
        <p className="mb-5 text-center text-[12px] font-bold uppercase leading-4 tracking-widest text-ink-500">
          Scores videos for
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 text-ink-900 opacity-50 transition-opacity duration-700 hover:opacity-80 md:gap-16">
          <YouTubeMark />
          <TikTokMark />
          <InstagramMark />
          <FacebookMark />
          <LinkedInMark />
        </div>
      </div>
    </section>
  );
}

/* ── Trust bar ───────────────────────────────────────────────────── */

const TRUST: { label: string; d: string }[] = [
  {
    label: 'Benchmarked against 2026 platform data',
    d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  { label: 'Results in under 60 seconds', d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  {
    label: 'Updated weekly',
    d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    label: 'Privacy first',
    d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
];

function TrustBar() {
  return (
    <div className="reveal-element border-y border-ink-100/50 bg-white/50 py-6 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap justify-center gap-8 px-4 text-[14px] font-medium text-ink-500 md:gap-16">
        {TRUST.map((item) => (
          <div
            key={item.label}
            className="flex cursor-default items-center gap-2 transition-colors duration-300 hover:text-ink-900"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d={item.d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
            </svg>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── The nine checks ─────────────────────────────────────────────
   Each card ends in a different piece of evidence — a score bar, a
   keyword read-out, the thumbnail A/B, a duration, a revenue rating,
   a rewritten line, a waveform, a cut timeline — so the footers are
   written out rather than driven from data.

   Cards 01-06 use the comp's own rasters with the baked-in word
   cropped off: at the 24px the comp renders them at, that word is an
   unreadable three-pixel smear, and the glyph alone is plainly what
   the tile is meant to show. The comp never drew script, voice or
   video, so 07-09 use `Mark` instead of a seventh invented raster.
   ───────────────────────────────────────────────────────────────── */

const CARD =
  'reveal-element flex flex-col rounded-2xl border border-ink-100 bg-white/80 p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] backdrop-blur-md';

function CheckHead({
  n,
  title,
  blurb,
  icon,
  tile,
  hover,
}: {
  n: string;
  title: string;
  blurb: string;
  /**
   * A raster path for the six icons the comp drew, or an inline mark for the
   * three layers it never drew.
   */
  icon: string | React.ReactElement;
  tile: string;
  hover: string;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-500 ${tile} ${hover}`}
        >
          {typeof icon === 'string' ? (
            <img src={icon} alt={title} className="h-6 w-6 object-contain" />
          ) : (
            icon
          )}
        </div>
        <div>
          <span className="block text-[14px] font-bold leading-none text-ink-400">{n}</span>
          <h3 className="text-[20px] font-bold leading-none text-ink-900">{title}</h3>
        </div>
      </div>
      <p className="mb-8 text-[16px] text-ink-600">{blurb}</p>
    </div>
  );
}

/**
 * A tile glyph drawn in HTML.
 *
 * The comp only ever drew six icons, and the page now shows nine layers. Rather
 * than crop a seventh raster out of an asset that does not exist, the three added
 * cards carry stroked marks that inherit the tile's own `currentColor` - the same
 * near-black the cropped rasters are drawn in, so they sit at the same weight.
 */
function Mark({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * One threshold table for every score on the page. A colour and a word always
 * mean the same thing, and neither is ever chosen per card - which is what went
 * wrong before: 41% was drawn in near-black because a `tone` prop said so, and
 * every verdict printed green regardless of its number.
 */
function grade(score: number) {
  if (score >= 70) return { word: 'Strong', bar: 'bg-grass-600', text: 'text-grass-700' };
  if (score >= 40) return { word: 'Fair', bar: 'bg-amber-600', text: 'text-amber-700' };
  return { word: 'Weak', bar: 'bg-crimson-600', text: 'text-crimson-700' };
}

function ScoreLine({ score }: { score: number }) {
  const g = grade(score);
  return (
    <div className="mb-2 flex items-end justify-between">
      <span className={`font-bold ${g.text}`}>{g.word}</span>
      <span className="text-[14px] font-medium">
        <span className="text-[18px] font-bold text-ink-900">{score}</span>
        <span className="text-ink-400">/100</span>
      </span>
    </div>
  );
}

/** Track + fill. The fill's width is the datum; the growth is CSS (see .lp-bar).
    The label carries the same reading for anyone who cannot see the colour. */
function ScoreBar({ score }: { score: number }) {
  const g = grade(score);
  return (
    <div
      role="img"
      aria-label={`${score} out of 100 - ${g.word}`}
      className="h-2 w-full overflow-hidden rounded-full bg-ink-50"
    >
      <div className={`lp-bar h-2 rounded-full ${g.bar}`} style={{ width: `${score}%` }} />
    </div>
  );
}

/**
 * Every card ends in the same three rows - caption, verdict, bar - so the nine
 * footers share one baseline and one colour language. Card-specific evidence
 * (the keyword table, the thumbnail A/B, the waveform) goes in `children`,
 * *above* the metric, where it reads as supporting detail rather than as a
 * competing metric with its own private encoding.
 */
function CardFooter({
  label,
  score,
  children,
}: {
  label: string;
  score: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-auto">
      {children ? <div className="mb-4">{children}</div> : null}
      <div className="mb-1 text-[12px] text-ink-500">{label}</div>
      <ScoreLine score={score} />
      <ScoreBar score={score} />
    </div>
  );
}

const TILE_PLAIN = 'border border-ink-100 text-ink-900';

/**
 * The waveform under the voice card. Heights only - it is a picture of speech,
 * not a plot of anything, so it is written out rather than generated.
 */
const VOICE_BARS = [30, 62, 44, 88, 55, 100, 40, 74, 34, 92, 50, 68, 38, 58];

/**
 * The cut timeline under the video card: one tick per sampled frame pair, filled
 * where the sampler read a hard cut. Twelve ticks and five cuts is the shape of a
 * normally-edited clip, which is what the card is claiming.
 */
const CUT_TICKS = [false, true, false, false, true, false, true, false, false, true, false, true];

function Checks() {
  return (
    <section
      id="checks"
      aria-labelledby="checks-heading"
      className="mx-auto w-full max-w-[1280px] px-4 py-24"
    >
      <h2 id="checks-heading" className="mb-16 text-[30px] font-bold text-ink-900">
        Nine checks, every upload
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 01 — Hook */}
        <div className={`${CARD} delay-100`}>
          <CheckHead
            n="01"
            title="Hook"
            blurb="Grabs attention in the first 7 seconds."
            icon="/images/landing/icon-hook.png"
            tile={TILE_PLAIN}
            hover="hover:rotate-12"
          />
          <CardFooter label="Hook strength" score={93} />
        </div>

        {/* 02 — SEO */}
        <div className={`${CARD} delay-200`}>
          <CheckHead
            n="02"
            title="SEO"
            blurb="Ranks for the right searches."
            icon="/images/landing/icon-seo.png"
            tile={TILE_PLAIN}
            hover="hover:-rotate-12"
          />
          <CardFooter label="Search visibility" score={76}>
            <div className="rounded-xl border border-ink-50 bg-ink-50/50 p-4 transition-colors duration-300 hover:bg-ink-100/50">
              <div className="mb-2 flex justify-between text-[14px]">
                <span className="text-ink-500">Primary keyword</span>
                <span className="font-bold text-ink-900">studio setup</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-ink-500">Search volume</span>
                <span className="font-bold text-ink-900">High</span>
              </div>
            </div>
          </CardFooter>
        </div>

        {/* 03 — Thumbnail */}
        <div className={`${CARD} delay-300`}>
          <CheckHead
            n="03"
            title="Thumbnail"
            blurb="Gets clicks, not ignored."
            icon="/images/landing/icon-thumbnail.png"
            tile={TILE_PLAIN}
            hover="hover:scale-110"
          />
          <CardFooter label="Click-through potential" score={88}>
            <div className="w-full overflow-hidden rounded-[8px] border border-ink-100 transition-transform duration-500 hover:scale-[1.02]">
              <img
                src="/images/landing/thumbnail-comparison.webp"
                alt="The same thumbnail before and after, with predicted click-through for each: 2.1% before, 6.3% after"
                width={1000}
                height={417}
                className="block h-auto w-full object-contain"
              />
            </div>
          </CardFooter>
        </div>

        {/* 04 — Authenticity */}
        <div className={`${CARD} delay-100`}>
          <CheckHead
            n="04"
            title="Authenticity"
            blurb="Feels real, not robotic."
            icon="/images/landing/icon-authenticity.png"
            tile={TILE_PLAIN}
            hover="hover:rotate-12"
          />
          <CardFooter label="Authenticity" score={85} />
        </div>

        {/* 05 — Retention */}
        <div className={`${CARD} delay-200`}>
          <CheckHead
            n="05"
            title="Retention"
            blurb="Keeps viewers watching."
            icon="/images/landing/icon-retention.png"
            tile={TILE_PLAIN}
            hover="hover:-rotate-12"
          />
          <CardFooter label="Retention" score={41}>
            <div className="text-[20px] font-bold text-ink-900">4:27 average view duration</div>
          </CardFooter>
        </div>

        {/* 06 — Monetization */}
        <div className={`${CARD} delay-300`}>
          <CheckHead
            n="06"
            title="Monetization"
            blurb="Maximizes revenue potential."
            icon="/images/landing/icon-monetization.png"
            tile={TILE_PLAIN}
            hover="hover:scale-110"
          />
          <CardFooter label="Revenue potential" score={72} />
        </div>

        {/* 07 - Script */}
        <div className={`${CARD} delay-100`}>
          <CheckHead
            n="07"
            title="Script"
            blurb="Reads tight, line by line."
            icon={
              <Mark>
                <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6" />
                <path d="M9 17h4" />
              </Mark>
            }
            tile={TILE_PLAIN}
            hover="hover:rotate-12"
          />
          <CardFooter label="Script tightness" score={64}>
            <div className="rounded-xl border border-ink-50 bg-ink-50/50 p-4 transition-colors duration-300 hover:bg-ink-100/50">
              <div className="mb-2 text-[12px] text-ink-500">Line 3 - weak opener</div>
              <p className="mb-1 text-[14px] leading-snug text-ink-400 line-through">
                In today&apos;s video, I&apos;m going to show you my setup.
              </p>
              <p className="text-[14px] font-bold leading-snug text-ink-900">
                Your studio is costing you views. Here&apos;s the fix.
              </p>
            </div>
          </CardFooter>
        </div>

        {/* 08 - Voice */}
        <div className={`${CARD} delay-200`}>
          <CheckHead
            n="08"
            title="Voice"
            blurb="Sounds clear, never rushed."
            icon={
              <Mark>
                <path d="M4 10v4M8 6.5v11M12 4v16M16 7.5v9M20 11v2" />
              </Mark>
            }
            tile={TILE_PLAIN}
            hover="hover:-rotate-12"
          />
          <CardFooter label="Delivery" score={81}>
            <div className="mb-2 text-[20px] font-bold text-ink-900">168 wpm</div>
            <div className="group flex h-6 items-end gap-[3px]">
              {VOICE_BARS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-[2px] bg-ink-800 transition-transform duration-300 group-hover:scale-y-110"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardFooter>
        </div>

        {/* 09 - Video */}
        <div className={`${CARD} delay-300`}>
          <CheckHead
            n="09"
            title="Video"
            blurb="Cut at a pace that holds."
            icon={
              <Mark>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M10.5 9.5l4.5 2.5-4.5 2.5z" />
              </Mark>
            }
            tile={TILE_PLAIN}
            hover="hover:scale-110"
          />
          <CardFooter label="Pacing" score={69}>
            <div className="mb-2 text-[20px] font-bold text-ink-900">1 cut every 2.4s</div>
            <div className="group flex gap-[3px]">
              {CUT_TICKS.map((cut, i) => (
                <span
                  key={i}
                  className={`h-4 flex-1 rounded-[2px] transition-transform duration-300 group-hover:scale-y-125 ${
                    cut ? 'bg-ink-800' : 'bg-ink-100'
                  }`}
                />
              ))}
            </div>
          </CardFooter>
        </div>
      </div>
    </section>
  );
}

/* ── Algorithm panel ─────────────────────────────────────────────
   Dark card; the trend graph is a dark-ground raster that the comp
   screen-blends into the panel, so the plot glows and the panel's own
   navy shows through the plot area.
   ───────────────────────────────────────────────────────────────── */

const ALGO_SIGNALS = ['CTR (Click-Through Rate)', 'Retention (Audience Retention)', 'Session Time (Minutes Viewed)'];

function AlgorithmPanel() {
  return (
    <section id="algorithm" className="mx-auto w-full max-w-[1280px] px-4 pb-24">
      <div className="reveal-element relative z-20 flex flex-col overflow-hidden rounded-3xl border border-ink-800/50 bg-[#0f172a]/90 shadow-2xl backdrop-blur-xl transition-transform duration-700 hover:scale-[1.01] lg:flex-row">
        <div className="flex flex-col justify-center p-12 text-white lg:w-1/3">
          <h2 className="mb-6 text-[36px] font-extrabold leading-tight">
            What the algorithm{' '}
            <span className="italic">actually</span> measures.
          </h2>
          <ul className="mb-8 space-y-4">
            {ALGO_SIGNALS.map((signal) => (
              <li
                key={signal}
                className="flex cursor-default items-center gap-3 transition-transform duration-300 hover:translate-x-2"
              >
                <svg
                  className="h-6 w-6 shrink-0 text-red-brand"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                <span className="text-ink-300">{signal}</span>
              </li>
            ))}
          </ul>
          <p className="text-[14px] leading-relaxed text-ink-400">
            We reverse engineer what matters so you can post with confidence.
          </p>
        </div>

        {/* The supplied graph is a whole panel -- title, current-score box, both
            axes and three annotations -- so it is contained, not cover-cropped:
            object-cover here would slice the title and the x-axis off. Its own
            ground is near-black, so mix-blend-screen drops it out and lets the
            panel's navy show through the plot. */}
        <figure className="group flex min-h-[320px] flex-col items-center justify-center overflow-hidden p-4 sm:p-6 lg:min-h-[520px] lg:w-2/3">
          <img
            src="/images/landing/algorithm-trend-graph.webp"
            alt="Algorithm score plotted against position in a 10:42 video. It opens near 90% at 0:24, falls to 45 at 2:15, recovers to a 78 peak at 6:20, then declines through the final three minutes to about 26% at the end."
            width={1250}
            height={1000}
            className="max-h-full w-auto max-w-full object-contain opacity-95 mix-blend-screen transition-all duration-700 group-hover:scale-[1.03] group-hover:opacity-100"
          />
          {/* The raster shows two different quantities - a 7-day video-level average
              (the 82 badge) and a within-video curve (the plot). Without this line the
              rising 82 reads as contradicting a line that ends low. */}
          <figcaption className="mt-4 max-w-xl text-center text-[12px] leading-relaxed text-ink-400">
            The badge is this video&rsquo;s overall score against the last seven days. The curve is
            how that score moves moment to moment inside the video &mdash; the late decline is the
            part worth fixing.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ── Testimonial ─────────────────────────────────────────────────── */

/* ── How a first review goes ───────────────────────────────────────
   Was a named testimonial ("Maya, 14.2k subs, horror niche") with a
   comp-supplied portrait. There is no such customer — a named quote with
   a stock face is an invented endorsement, the exact fabrication the
   honesty pass removed everywhere else. The scene below is labeled as
   what it is: an example of how a typical first review reads, drawn
   from what the report actually surfaces.
   ───────────────────────────────────────────────────────────────── */

function Testimonial() {
  return (
    <section className="reveal-element mx-auto w-full max-w-[1280px] border-b border-ink-100/50 px-4 py-24">
      <div className="flex flex-col items-center justify-center gap-8 md:flex-row md:gap-16">
        <div
          aria-hidden
          className="h-20 text-[96px] font-extrabold leading-none text-red-brand select-none"
        >
          “
        </div>

        <div className="max-w-3xl flex-1">
          <h3 className="group relative text-[30px] font-bold leading-tight text-ink-900 md:text-[36px]">
            A typical first review:
            <br />
            the hook was the problem —
            <br />
            and it said exactly which 3 seconds.
            <span
              aria-hidden
              className="absolute bottom-0 left-0 -z-10 h-2 w-32 -rotate-1 translate-y-1 rounded-full bg-red-brand/20 transition-all duration-500 group-hover:w-full group-hover:bg-red-brand/10"
            />
            <svg
              aria-hidden
              className="absolute -bottom-4 left-0 h-4 w-48 text-red-brand transition-all duration-500 group-hover:w-64"
              preserveAspectRatio="none"
              viewBox="0 0 100 20"
            >
              <path
                d="M0 15 C 20 5, 40 20, 60 5 C 80 20, 100 5, 120 15"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
              />
            </svg>
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {/* The report card itself stands in for the avatar: a real
              artifact of the product rather than a face pretending to be
              a customer. */}
          <div className="rounded-2xl border border-ink-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
              Hook · first 30s
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[32px] font-extrabold leading-none text-crimson-700">54</span>
              <span className="text-[11px] font-semibold text-ink-400">/ 100</span>
            </div>
            <div className="mt-1.5 text-[10px] font-medium text-amber-700">
              “in this video I&apos;ll show you” — throat-clear
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────────────── */

/* One tile style for all three steps. These were three hand-written strings that
   had drifted apart in fill, border width and border colour. */
const STEP_TILE = 'border border-red-200 bg-white/50 text-red-brand backdrop-blur-sm';

const STEPS: { title: string; blurb: string; spin: string; d: string }[] = [
  {
    // "or link" removed: the review runs on what you attach (script,
    // thumbnail, audio, video) — there is no live-URL ingestion, and the
    // previous wording promised one.
    title: 'Paste your script. Attach the rest.',
    blurb: 'Two minutes, even on your phone.',
    spin: 'group-hover:-rotate-6',
    d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    title: 'Nine checks in 60 seconds.',
    blurb: 'Script, voice, video, hook, SEO and three more — one pass.',
    spin: 'group-hover:rotate-6',
    d: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Fix what matters.',
    blurb: 'Clear actions that boost reach, retention, and revenue.',
    spin: 'group-hover:-rotate-6',
    d: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
];

function HowItWorks() {
  return (
    <section id="how" className="reveal-element mx-auto w-full max-w-[1280px] px-4 py-24">
      <div className="mb-16">
        <h2 className="text-[30px] font-bold text-ink-900">
          How it works in{' '}
          <span className="group relative">
            60 seconds
            <span
              aria-hidden
              className="absolute -bottom-1 left-0 w-full border-b-2 border-dashed border-ink-300 transition-colors duration-300 group-hover:border-red-brand"
            />
          </span>
        </h2>
      </div>

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
        {/* One dashed run and one chevron per gutter, laid out on the same grid as
            the steps so the spacing is derived rather than guessed. top-8 is the
            centre of the h-16 tile. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-8 z-0 hidden md:grid md:grid-cols-3 md:gap-12"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="relative">
              {i > 0 && (
                <>
                  <span className="absolute right-full top-0 w-12 border-t border-dashed border-ink-300" />
                  <span className="absolute right-full top-0 h-3 w-3 -translate-y-1.5 rotate-45 border-r border-t border-ink-300" />
                </>
              )}
            </div>
          ))}
        </div>

        {STEPS.map((step) => (
          <div
            key={step.title}
            className="group relative z-10 flex flex-col items-start gap-6 bg-transparent md:flex-row"
          >
            <div
              className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform duration-500 group-hover:scale-110 ${STEP_TILE} ${step.spin}`}
            >
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {step.d.split(' M').map((part, i) => (
                  <path
                    key={part}
                    d={i === 0 ? part : `M${part}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                ))}
              </svg>
            </div>
            <div className="max-w-[28ch]">
              {/* red-brand-ink (#E60000, 4.6:1) not red-brand (#FF0000, 3.99:1):
                  this h3 inherits body-size text, so the hover colour must
                  clear AA for normal text. */}
              <h3 className="mb-2 font-bold text-ink-900 transition-colors duration-300 group-hover:text-red-brand-ink">
                {step.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-ink-600">{step.blurb}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────
   The comp's four cards, wired to the app's real billing: Pro and
   Creator post to /api/billing/checkout (or bounce to the portal when
   the visitor is already on a different paid plan), Free goes to
   sign-up, Agency opens a mail draft.
   ───────────────────────────────────────────────────────────────── */

const OUTLINE_BTN =
  'w-full rounded-[8px] border-2 border-ink-200 py-2.5 font-bold text-ink-900 transition-colors duration-300 hover:border-ink-900';
const PLAIN_CARD =
  'pricing-card-hover flex h-full flex-col rounded-2xl border border-ink-100 bg-white/80 p-6 pt-8 backdrop-blur-md';

function PlanHead({ name, price }: { name: string; price: string }) {
  return (
    <>
      <h3 className="mb-4 text-center font-bold text-ink-900">{name}</h3>
      <div className="mb-6 text-center">
        <span className="text-[36px] font-bold text-ink-900">{price}</span>
        <span className="text-[14px] text-ink-500">/month</span>
      </div>
    </>
  );
}

function Bullet({ children, tone }: { children: React.ReactNode; tone: 'red' | 'ink' }) {
  return (
    <li className="flex items-center gap-2">
      <Tick className={`h-4 w-4 shrink-0 ${tone === 'red' ? 'text-red-brand' : 'text-ink-900'}`} />
      {children}
    </li>
  );
}

function Pricing({
  startHref,
  plan,
  loadingId,
  checkoutError,
  onUpgrade,
}: {
  startHref: string;
  plan: string;
  loadingId: string | null;
  checkoutError: string;
  onUpgrade: (planId: string) => void;
}) {
  const label = (planId: string, fallback: string) =>
    loadingId === planId ? 'Redirecting…' : plan === planId ? 'Current plan' : fallback;

  return (
    <section id="pricing" className="reveal-element mx-auto w-full max-w-[1280px] px-4 py-24">
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="lg:w-1/4">
          <h2 className="mb-4 text-[36px] font-extrabold tracking-[-0.03em] leading-tight text-ink-900">
            Simple pricing.
            <br />
            Serious results.
          </h2>
          <p className="font-medium text-ink-600">No hidden fees. Cancel anytime.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:w-3/4 lg:grid-cols-4">
          {/* Free */}
          <div className={PLAIN_CARD}>
            <PlanHead name={PLANS.free.name} price={priceLabel('free')} />
            <ul className="mb-8 flex-1 space-y-3 text-[14px] text-ink-600">
              {PLANS.free.features.map((f) => (
                <Bullet key={f} tone="ink">
                  {f}
                </Bullet>
              ))}
            </ul>
            <Link href={startHref} className={`${OUTLINE_BTN} block text-center`}>
              Get started
            </Link>
          </div>

          {/* Pro */}
          <div className="pricing-card-hover relative flex h-full cursor-pointer flex-col rounded-2xl border-2 border-red-brand bg-white/90 p-6 pt-8 shadow-xl backdrop-blur-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-brand-ink px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-white shadow-md">
              Most Popular
            </div>
            <PlanHead name={PLANS.pro.name} price={priceLabel('pro')} />
            <ul className="mb-8 flex-1 space-y-3 text-[14px] text-ink-600">
              {PLANS.pro.features.map((f) => (
                <Bullet key={f} tone="red">
                  {f}
                </Bullet>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onUpgrade('pro')}
              disabled={loadingId !== null}
              className="shimmer-hover w-full rounded-[8px] bg-red-brand-ink py-2.5 hover:brightness-95 font-bold text-white shadow-lg shadow-red-brand/20 disabled:opacity-70"
            >
              {label('pro', `Get ${PLANS.pro.name}`)}
            </button>
          </div>

          {/* Creator */}
          <div className={PLAIN_CARD}>
            <PlanHead name={PLANS.starter.name} price={priceLabel('starter')} />
            <ul className="mb-8 flex-1 space-y-3 text-[14px] text-ink-600">
              {PLANS.starter.features.map((f) => (
                <Bullet key={f} tone="ink">
                  {f}
                </Bullet>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onUpgrade('starter')}
              disabled={loadingId !== null}
              className={`${OUTLINE_BTN} disabled:opacity-70`}
            >
              {label('starter', `Get ${PLANS.starter.name}`)}
            </button>
          </div>

          {/* Agency */}
          <div className={PLAIN_CARD}>
            <PlanHead name={PLANS.agency.name} price={priceLabel('agency')} />
            <ul className="mb-8 flex-1 space-y-3 text-[14px] text-ink-600">
              {PLANS.agency.features.map((f) => (
                <Bullet key={f} tone="ink">
                  {f}
                </Bullet>
              ))}
            </ul>
            <a
              href="mailto:support@genapps.online?subject=Publish%20Agency%20Inquiry"
              className={`${OUTLINE_BTN} block text-center`}
            >
              Talk to us
            </a>
          </div>
        </div>
      </div>

      {checkoutError && (
        <p role="alert" className="mt-6 text-center text-[14px] font-medium text-red-brand-ink">
          {checkoutError}
        </p>
      )}
    </section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────
   The comp ships the answers open with an inert chevron button. Kept
   open — that is the state it renders in — but the button is a real
   disclosure here, so the control does what it looks like it does.
   ───────────────────────────────────────────────────────────────── */

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How accurate is the Publish Score?',
    a: "The score is a rubric, not a prediction. Each of the nine layers checks your video against published platform guidance and documented retention patterns, and the number tells you how much of that checklist you are currently passing. No tool can promise a view count — what this one does is catch the fixable problems before you publish.",
  },
  {
    q: 'Can I use it for YouTube Shorts?',
    a: "Yes. Short-form is scored on its own rules, weighted towards the first three seconds (the swipe-away window) and loop potential rather than long-form watch time.",
  },
  {
    q: 'Does it work with existing videos?',
    // Honest: the review runs on what you attach (title, script, thumbnail,
    // audio, video file) — there is no live-URL ingestion. The previous
    // answer promised link-pasting, which the product cannot do.
    a: 'Yes — run the review on a video you have already edited. Attach the script, the thumbnail, and (optionally) the rendered video or voice track, and the review reads exactly what your viewers will see and hear. If the video is already live, connect your channel under Connected Channels to pair the review with its real analytics.',
  },
  {
    q: 'Is my data and script private?',
    a: 'We take privacy seriously. Your scripts are encrypted and never used to train public models. Your competitive edge stays yours.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="group overflow-hidden rounded-2xl border border-ink-100 bg-white/80 backdrop-blur-md transition-all duration-300 hover:border-red-brand/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="font-bold text-ink-900">{q}</span>
        <svg
          className="h-5 w-5 shrink-0 text-ink-400 transition-transform duration-300 group-hover:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 text-[14px] leading-relaxed text-ink-600">{a}</div>}
    </div>
  );
}

function Faq() {
  return (
    <section id="faq" className={`reveal-element py-12 ${SHELL_NARROW}`}>
      <h2 className="mb-10 text-center text-[30px] font-extrabold tracking-[-0.03em] text-ink-900">
        Frequently Asked Questions
      </h2>
      <div className="space-y-3">
        {FAQ.map((item) => (
          <FaqItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  );
}

/* ── Closing CTA ─────────────────────────────────────────────────
   The comp's "EST. 2026" rotating ring was retired with the marketing
   honesty pass — a badge with no referent, spinning on hover, whose
   red-on-navy fill also missed AA contrast.
   ───────────────────────────────────────────────────────────────── */

function FinalCta({ startHref }: { startHref: string }) {
  return (
    <section className="reveal-element mx-auto w-full max-w-[1280px] px-4 pb-24">
      <div className="group relative flex flex-col items-center justify-between overflow-hidden rounded-3xl border border-ink-800/50 bg-[#0f172a]/90 p-8 shadow-2xl backdrop-blur-xl md:flex-row md:p-12">
        <div className="relative z-10 mb-8 flex w-full items-center justify-center gap-8 md:mb-0 md:w-auto md:justify-start">
          <img
            src="/images/landing/rocket.png"
            alt=""
            aria-hidden
            className="float-soft h-24 w-24 -rotate-12 object-contain"
          />
          <h2 className="text-[30px] font-extrabold tracking-[-0.03em] leading-tight text-white md:text-[52px]">
            Your next video
            <br />
            could be the <span className="font-light italic">one.</span>
          </h2>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <Link
            href={startHref}
            className="mb-3 flex items-center gap-2 rounded-full bg-red-brand-ink px-8 py-4 text-[18px] font-bold text-white shadow-lg shadow-red-brand/30"
          >
            Score my script — free
            <CtaArrow className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <p className="text-[14px] font-medium text-ink-400">No credit card. No trial timers.</p>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────
   Same grid, labels, type scale and hover behaviour as the comp. Every
   link in the comp points at "#", and six of them used to keep that "#"
   here, marked `todo`: Updates, Blog, About, Careers, Press, Security.
   A link that goes nowhere is worse than no link — it advertises a page
   that does not exist, and the reader who clicks it stops trusting the
   rest of the footer. They are removed until those pages land, which is
   why some columns are shorter than the comp's. Every entry below
   resolves to something real.
   ───────────────────────────────────────────────────────────── */

const FOOTER_COLUMNS: {
  title: string;
  links: { label: string; href: string }[];
}[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Checks', href: '#checks' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Guides', href: '/help' },
      { label: 'YouTube Algorithm', href: '#algorithm' },
      { label: 'Creator Tools', href: '/seo' },
      { label: 'Community', href: '/community' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: 'mailto:support@genapps.online' },
      { label: 'Restore purchase', href: '/restore' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/legal/terms' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Cookies', href: '/legal/cookies' },
      { label: 'Acceptable use', href: '/legal/acceptable-use' },
    ],
  },
];

/* The comp has a row of five social glyphs. All five pointed at the
   platform's own homepage — youtube.com, x.com, tiktok.com,
   instagram.com, discord.com — because no accounts exist for this
   product yet. A glyph that lands on YouTube's front page rather than a
   channel reads as a broken link at best and as a borrowed identity at
   worst, so the row is gone. Restore it as `{ name, href, path }`
   entries here, wired to a `SOCIALS.map` in the footer, once the accounts
   are real. The `path` is a 24x24 glyph outline; the YouTube one the row
   used is kept below so restoring the mark does not mean going back
   through git history for it:

     M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12
     3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0
     12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505
     9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24
     12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z

   (Re-join the lines; it is one continuous `d` attribute.) */

function SiteFooter() {
  /* The form used to flip a boolean and claim success. It now has a real
     request behind it (POST /api/newsletter), so it needs the three states a
     request actually has: in flight, saved, failed. Claiming "check your inbox"
     while the address is still in the air — or after the write failed — is the
     original bug in a smaller form. */
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function subscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    const field = new FormData(e.currentTarget).get('email');
    const email = typeof field === 'string' ? field.trim() : '';
    if (!email) return;

    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      // Offline or blocked. Say so rather than showing the success message.
      setError('Could not reach the server. Please check your connection.');
      setStatus('error');
    }
  }

  return (
    <footer className="border-t border-ink-100/50 bg-white/50 pb-8 pt-16 backdrop-blur-sm">
      <div className={SHELL}>
        <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center gap-2">
              <img
                src="/images/landing/logo-footer.png"
                alt="Publish"
                width={395}
                height={112}
                className="h-7 w-auto object-contain"
              />
            </div>
            <p className="max-w-xs text-[14px] text-ink-600">
              Helping creators make content that wins.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 font-bold text-ink-900">{col.title}</h3>
              <ul className="space-y-3 text-[14px] text-ink-600">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link href={link.href} className="transition-colors hover:text-red-brand">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="transition-colors hover:text-red-brand">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-2">
            <h3 className="mb-2 font-bold text-ink-900">Get the latest tips &amp; updates</h3>
            {/* Was "Join 25,000+ creators improving their content." There is no
                subscriber list to count yet, so the number was invented. This
                says what the reader gets instead of how many others get it. */}
            <p className="mb-4 text-[14px] text-ink-600">
              Practical breakdowns of what the platforms reward. No more than one email a week.
            </p>
            {status === 'done' ? (
              <p className="text-[14px] font-medium text-ink-900" role="status">
                You&rsquo;re on the list. We&rsquo;ll email you when the next one goes out.
              </p>
            ) : (
              <form className="flex gap-2" onSubmit={subscribe}>
                <label className="sr-only" htmlFor="lp-newsletter">
                  Email address
                </label>
                <input
                  id="lp-newsletter"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  disabled={status === 'sending'}
                  placeholder="Enter your email"
                  className="flex-1 rounded-[6px] border border-ink-300 bg-white px-4 py-2 text-[14px] text-ink-900 placeholder:text-ink-500 shadow-sm transition-all duration-300 focus:border-red-brand focus:outline-none focus:ring-1 focus:ring-red-brand disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="rounded-[6px] bg-ink-900 px-4 py-2 text-[14px] font-medium text-white transition-all duration-300 hover:scale-[1.02] hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                >
                  {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
                </button>
              </form>
            )}
            {status === 'error' && error ? (
              <p className="mt-2 text-[12px] text-red-brand-ink" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-ink-100/50 pt-8 text-[14px] text-ink-500">
          <span className="text-right">
            Made for creators, by creators.
            
          </span>
        </div>
      </div>
    </footer>
  );
}
