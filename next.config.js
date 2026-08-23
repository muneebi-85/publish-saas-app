/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * The CSP is an allowlist, so every legitimate third party has to be named here
 * or the browser silently blocks it. The two that bite hardest in this app:
 *
 *   - Clerk loads its script and hits its own API from the browser, and uses
 *     Cloudflare Turnstile for bot protection.
 *   - Uploads go straight from the browser to object storage via a presigned
 *     PUT, so the storage origin must be in `connect-src` or every upload fails
 *     with an opaque network error. It is derived from the same env vars the
 *     presign route uses, so the two can't drift.
 *
 * Nothing decorative is allowlisted. Avatar/stock-photo CDNs were removed along
 * with the placeholder data that used them — an image host we don't need is an
 * injection surface we don't have to accept.
 */

/**
 * OUTBOUND CONNECT BUDGET
 * ──────────────────────
 * Node 20+ dials with Happy Eyeballs: it races every address DNS returned and
 * gives each attempt `autoSelectFamilyAttemptTimeout` — 250ms by default — to
 * finish its TCP handshake. On a link where the round trip to Cloudflare is
 * slower than that (or where AAAA records resolve but there is no IPv6 route, so
 * half the candidates burn attempts on ENETUNREACH), every attempt expires and
 * `fetch` rejects with a bare `TypeError: fetch failed / AggregateError`.
 *
 * That failure is invisible but expensive here, because Clerk's middleware
 * verifies its handshake token against the instance JWKS over `fetch`. When the
 * fetch dies the handshake cannot resolve, so the request is bounced back to
 * Clerk to handshake again — three cloud round trips per navigation — before
 * auth gives up with "infinite redirect loop". Pages still render, so it reads
 * as "the site takes forever to open" rather than as a broken network call.
 *
 * This file is required by plain Node before the server boots (in dev and under
 * `next start` alike), so the default set here applies process-wide, including
 * to middleware running in the dev Edge sandbox. 3s is generous for TCP+TLS and
 * only bounds how long ONE address is tried before the next — healthy
 * connections are unaffected. The guard keeps it a no-op on Node < 20.13.
 */
const net = require('net');
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
  net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
}

const isProd = process.env.NODE_ENV === 'production';

/** Turn a URL into a bare `https://host` origin, or null if it isn't usable. */
function toOrigin(raw) {
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Every origin the browser legitimately talks to for uploads and asset reads:
 * the presign target (S3/R2 endpoint or the AWS regional host) and the public
 * read origin (CDN / R2 custom domain).
 */
const storageOrigins = Array.from(
  new Set(
    [
      toOrigin(process.env.S3_PUBLIC_URL),
      toOrigin(process.env.S3_ENDPOINT),
      // Plain AWS S3 has no explicit endpoint — the SDK signs against the
      // regional virtual-hosted URL, so allow the bucket's own host.
      !process.env.S3_ENDPOINT && process.env.S3_BUCKET
        ? toOrigin(
            `${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`,
          )
        : null,
    ].filter(Boolean),
  ),
);

const clerk = [
  'https://*.clerk.accounts.dev',
  'https://clerk.accounts.dev',
  'https://*.clerk.com',
  'https://*.clerk.services',
];

const lemon = ['https://app.lemonsqueezy.com', 'https://*.lemonsqueezy.com'];

/**
 * PostHog, and only when this deployment has a key.
 *
 * `src/lib/analytics.ts` posts to `NEXT_PUBLIC_POSTHOG_HOST` (defaulting to the
 * US cloud), and that origin was missing from the CSP entirely — so on a
 * configured deploy the browser blocked every capture while the code reported
 * success, which is the worst shape a failure can take: analytics that look wired
 * and record nothing. Derived from the same env var the client reads so the two
 * cannot drift, and empty when no key is set, because an origin we do not talk to
 * has no business in the allowlist.
 *
 * The second entry is PostHog's asset host: posthog-js fetches its optional
 * extensions (surveys, toolbar, recorder) as separate scripts from `<region>-
 * assets.i.posthog.com`. Only derived for PostHog's own cloud hosts — behind a
 * reverse proxy the API host serves assets too, so there is nothing to add.
 */
const posthogOrigins = (() => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return [];
  const api = toOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST) || 'https://us.i.posthog.com';
  const assets = /^https:\/\/[a-z0-9-]+\.i\.posthog\.com$/i.test(api)
    ? api.replace(/^https:\/\/([a-z0-9-]+)\./i, 'https://$1-assets.')
    : null;
  return Array.from(new Set([api, assets].filter(Boolean)));
})();

const CSP = [
  "default-src 'self'",
  // Next.js inlines its hydration bootstrap, so 'unsafe-inline' is unavoidable
  // without nonce plumbing through every route. 'unsafe-eval' is required by the
  // dev overlay + React refresh ONLY — it is never sent in production.
  [
    "script-src 'self' 'unsafe-inline'",
    isProd ? '' : "'unsafe-eval'",
    ...lemon,
    ...clerk,
    ...posthogOrigins,
    'https://challenges.cloudflare.com',
  ]
    .filter(Boolean)
    .join(' '),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // blob: covers locally previewed uploads before they leave the browser.
  ["img-src 'self' data: blob:", ...lemon, 'https://img.clerk.com', 'https://i.ytimg.com', ...storageOrigins].join(' '),
  // Video/audio previews of the creator's own assets.
  ["media-src 'self' blob: data:", ...storageOrigins].join(' '),
  [
    "connect-src 'self'",
    'https://api.lemonsqueezy.com',
    ...clerk,
    ...posthogOrigins,
    ...storageOrigins,
  ].join(' '),
  ["frame-src 'self'", ...lemon, 'https://challenges.cloudflare.com'].join(' '),
  // Next.js ships some functionality as blob-backed workers.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://app.lemonsqueezy.com",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), interest-cohort=(), payment=(self "https://app.lemonsqueezy.com")',
  },
  // Isolates our window from anything we open, without breaking Clerk's OAuth
  // popups (plain `same-origin` would sever the popup's handle to the opener).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // Stops other sites embedding our responses as subresources.
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: CSP },
  // Legacy XSS auditor: disabled per OWASP guidance in favour of CSP.
  { key: 'X-XSS-Protection', value: '0' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // A type error must fail the deploy, not ship. Both default to false already;
  // stated explicitly so nobody "temporarily" flips them and forgets.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  images: {
    remotePatterns: [
      // Clerk-hosted avatars.
      { protocol: 'https', hostname: 'img.clerk.com' },
      // YouTube thumbnails for connected channels.
      { protocol: 'https', hostname: 'i.ytimg.com' },
      // The creator's own uploaded assets, if a public read origin is configured.
      ...(toOrigin(process.env.S3_PUBLIC_URL)
        ? [{ protocol: 'https', hostname: new URL(toOrigin(process.env.S3_PUBLIC_URL)).hostname }]
        : []),
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Machine endpoints: never cached, never indexed, never framed.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Legal aliases people commonly type.
      { source: '/terms', destination: '/legal/terms', permanent: true },
      { source: '/privacy', destination: '/legal/privacy', permanent: true },
      { source: '/refund', destination: '/legal/refund', permanent: true },
      { source: '/refunds', destination: '/legal/refund', permanent: true },
      { source: '/cookies', destination: '/legal/cookies', permanent: true },
      { source: '/dmca', destination: '/legal/dmca', permanent: true },
      { source: '/aup', destination: '/legal/acceptable-use', permanent: true },
      // Restore purchase shortcut.
      { source: '/restore-purchase', destination: '/restore', permanent: true },
    ];
  },
};

module.exports = nextConfig;
