# Publish SaaS — End-to-End QA Test Report

**Date:** August 22, 2026
**Tester:** Buffy (automated browser + code review)
**Scope:** Full SaaS except authentication flows
**Method:** Dev server on localhost:3099, curl-based route testing, TypeScript typecheck, vitest (1053 tests / 22 files all pass)

---

## Executive Summary

The application is **well-built and production-quality**. TypeScript compiles clean (0 errors), all 1053 tests pass, CSP headers are properly configured, API routes handle errors correctly, and every page renders without server-side crashes. The issues found are **low-to-medium severity** — mostly UX polish, one potential data race, and a few inconsistencies. No critical security vulnerabilities or data-loss risks were found.

**Bugs found: 12 total (0 Critical, 1 High, 4 Medium, 7 Low)**

---

## Bugs & Issues

### BUG-01 — QuotaMeter shows wrong plan label (Medium)

**File:** `src/components/QuotaMeter.tsx`
**Line:** 14

The `PLAN_LABEL` map has `{ starter: 'Starter' }` but `PLANS.starter.name` in `src/lib/plans.ts` is `'Creator'`. The QuotaMeter sidebar badge shows "Starter" while the pricing page, settings page, and dashboard all show "Creator" for the same tier.

**Impact:** Users see inconsistent plan names across the UI.

**Reproduction:** Sign in with a Starter plan. The sidebar QuotaMeter shows "Starter" but Settings > Billing shows "Creator".

---

### BUG-02 — AnalysesClient empty state invisible in dark mode (Medium)

**File:** `src/app/(dashboard)/analyses/AnalysesClient.tsx`
**Lines:** ~215-225

The empty state renders `text-ink-900` (dark text) on a `bg-white/[0.03]` background inside the dark-themed dashboard. The heading and body text are nearly invisible.

**Impact:** Users with no analyses see an apparently blank card.

**Reproduction:** Navigate to /analyses with zero reports. The empty state text is unreadable against the dark background.

---

### BUG-03 — UpgradeWall loading state not reset on success redirect (Low)

**File:** `src/components/UpgradeWall.tsx`
**Line:** ~58

In the catch block, `setLoading(false)` is called, but in the success path (`data.url`), the code does `window.location.href = data.url` without resetting loading. If the redirect fails or is blocked by a popup blocker, the button stays permanently in the loading spinner state.

**Impact:** Minor — the button shows a spinner indefinitely if the checkout redirect is blocked.

---

### BUG-04 — Landing page FAQ items default open with useState (Low)

**File:** `src/app/LandingClient.tsx`
**Line:** ~1340 (FaqItem component)

Each `FaqItem` initializes with `useState(true)` (open). While this matches the design comp intent, it means every FAQ is open on page load. There is no way for a user to "collapse all" — they must click each one individually. The chevron icon rotates on hover suggesting toggling, but starting all-open defeats the purpose of the disclosure widget.

**Impact:** Minor UX — the FAQ section is very long when all items are expanded.

---

### BUG-05 — console.log statements in production webhook route (Low)

**File:** `src/app/api/billing/webhook/route.ts`
**Lines:** 418, 461, 465

The billing webhook has `console.log` calls that emit variant IDs and event names to server logs. While these are operator-facing, they could leak sensitive billing metadata in shared log aggregation systems.

**Impact:** Low — logs go to server stdout, but best practice is to use a structured logger with redaction.

---

### BUG-06 — confirm() dialogs block the UI thread (Low)

**Files:**
- `src/app/(dashboard)/projects/ProjectsClient.tsx` (line 92)
- `src/app/(dashboard)/connected-channels/ChannelsClient.tsx` (line 52)
- `src/app/(dashboard)/settings/SettingsClient.tsx` (line 226)
- `src/app/(dashboard)/ai-coach/page.tsx` (line 128)

Five places use the native `confirm()` dialog for destructive actions (delete project, disconnect channel). These block the entire UI thread, cannot be styled, and are inaccessible to screen readers. They also cause race conditions: a user can click "Delete" on two projects rapidly and both confirm dialogs queue up.

**Impact:** Poor UX for destructive actions. No data loss risk, but jarring.

---

### BUG-07 — /help is not in the public routes list (Medium)

**File:** `src/middleware.ts`

`/help` is in `isKnownPage` but NOT in `isPublicRoute`. This means unauthenticated visitors to /help get redirected to sign-in. The help center content is purely public FAQ — there is no reason to gate it behind auth. The footer, landing page, and other marketing surfaces all link to /help.

**Impact:** Every "Help" link from the marketing site bounces the visitor to sign-in, breaking the support funnel.

**Reproduction:** Click "Help center" from the footer while signed out — you get redirected to sign-in instead of seeing the FAQ.

---

### BUG-08 — /seo link in footer goes to dashboard route (Low)

**File:** `src/app/LandingClient.tsx`
**Line:** ~1467 (Footer FOOSTER_COLUMNS)

The footer's "Creator Tools" link points to `/seo`, which is a dashboard page behind auth. An unauthenticated visitor clicking this gets bounced to sign-in with no explanation. The link should either be public or removed from the marketing footer.

**Impact:** Broken UX for unauthenticated visitors exploring the product.

---

### BUG-09 — next.config.js has CRLF line endings (Low)

**File:** `next.config.js`

The entire file uses Windows-style `\r\n` line endings while the rest of the codebase uses Unix `\n`. This causes noisy git diffs where every line appears changed even for single-character edits.

**Impact:** Makes code review harder. No functional impact.

---

### BUG-10 — Sitemap uses production URL but dev server generates it (Low)

**File:** `src/app/sitemap.ts`

The sitemap hardcodes `https://publish.genapps.online` as the base URL. When running locally, the sitemap references production URLs that 404 on localhost. This is by design (sitemap is always production), but it means local testing of sitemap content requires checking the HTML output rather than following the links.

**Impact:** Cosmetic — sitemap is correct in production.

---

### BUG-11 — BrandKit color names are not editable (Low)

**File:** `src/app/(dashboard)/brand-kit/BrandKitClient.tsx`

The color swatches show `c.name` (e.g., "New color") but there is no input to rename them. The only way to change a color name is to remove and re-add it. This is a minor UX gap since the name is displayed but not editable.

**Impact:** Users see "New color" as a permanent label with no way to customize it.

---

### BUG-12 — CSP missing PostHog origins when key is configured (Medium, conditional)

**File:** `next.config.js`

The CSP dynamically adds PostHog origins only when `NEXT_PUBLIC_POSTHOG_KEY` is set. The current `.env` has an empty key, so PostHog is excluded from CSP. If someone sets the key without restarting the server, all PostHog analytics requests will be silently blocked by the browser with no error — analytics appears to work (code runs) but records nothing.

**Impact:** Analytics silently broken if the env var is set without a server restart. The code is correct; this is a deployment gotcha worth documenting.

---

## What Passed (No Issues Found)

- **TypeScript:** 0 compilation errors
- **Tests:** 1053/1053 pass across 22 test files
- **All public pages:** 200 OK (/, /pricing, /legal/*, /community, /restore, /sign-in, /sign-up)
- **Dashboard auth:** All protected pages correctly 307 redirect to sign-in
- **API auth:** All protected API routes correctly return 401
- **Webhook signature:** `/api/billing/webhook` rejects unsigned POSTs with 401
- **API error handling:** Newsletter validates email, rejects invalid JSON, returns proper 400s
- **Method restrictions:** POST-only routes return 405 on GET
- **Redirect aliases:** /terms, /privacy, /refund, /cookies, /dmca, /aup all redirect to /legal/*
- **404 handling:** Non-existent pages return proper 404
- **Security headers:** CSP, X-Frame-Options, X-Content-Type-Options, HSTS all present
- **No hardcoded HTTP links:** All links use HTTPS or relative paths
- **All landing page images:** 18/18 images exist on disk
- **Sitemap:** Valid XML with correct URLs
- **Robots.txt:** Properly disallows API, dashboard, and private routes
- **Health endpoint:** Returns correct status with DB probe
- **Next.js config:** Compiles and loads correctly
- **Error boundaries:** global-error.tsx, not-found.tsx, dashboard/error.tsx all present
- **Rate limiting:** Configured per-route with Upstash Redis fallback to in-memory

---

## Recommendations

1. **Fix BUG-07** — Add `/help` to `isPublicRoute` in middleware.ts. This is the highest-impact fix.
2. **Fix BUG-01** — Update `PLAN_LABEL` in QuotaMeter.tsx to match `PLANS.starter.name`.
3. **Fix BUG-02** — Change empty state text colors to dark-theme-compatible values.
4. **Consider replacing confirm()** (BUG-06) with styled modal dialogs for destructive actions.
5. **Document the PostHog deployment gotcha** (BUG-12) in .env.example or a deployment guide.
