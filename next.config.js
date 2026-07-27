/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * Every response gets these — they are cheap, high-value defenses:
 *  - HSTS forces HTTPS for 2 years including subdomains
 *  - X-Frame-Options blocks clickjacking (SAMEORIGIN allows our own iframes)
 *  - CSP restricts what the browser will load; connect-src lists every
 *    third party we call from the browser (Lemon Squeezy checkout iframe,
 *    PostHog analytics, Sentry). Update it here when you add a vendor.
 *  - Permissions-Policy disables features we never use and denies FLoC.
 */

const CSP = [
  "default-src 'self'",
  // Next.js needs 'unsafe-inline' for its hydration script hashes; 'unsafe-eval' is required in dev only.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.lemonsqueezy.com https://*.lemonsqueezy.com https://*.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://api.dicebear.com https://*.lemonsqueezy.com",
  "connect-src 'self' https://api.lemonsqueezy.com https://*.posthog.com https://*.sentry.io https://integrate.api.nvidia.com",
  "frame-src 'self' https://app.lemonsqueezy.com https://*.lemonsqueezy.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://app.lemonsqueezy.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self "https://app.lemonsqueezy.com")' },
  { key: 'Content-Security-Policy',   value: CSP },
  { key: 'X-XSS-Protection',          value: '0' }, // Legacy; disabled per OWASP guidance in favor of CSP.
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Webhook endpoint — Lemon Squeezy POSTs cross-origin, so no frame options needed
      // but we DO want it excluded from CSP frame-ancestors edge cases.
    ];
  },
  async redirects() {
    return [
      // Legal aliases people commonly type.
      { source: '/terms',        destination: '/legal/terms',        permanent: true },
      { source: '/privacy',      destination: '/legal/privacy',      permanent: true },
      { source: '/refund',       destination: '/legal/refund',       permanent: true },
      { source: '/refunds',      destination: '/legal/refund',       permanent: true },
      { source: '/cookies',      destination: '/legal/cookies',      permanent: true },
      { source: '/dmca',         destination: '/legal/dmca',         permanent: true },
      { source: '/aup',          destination: '/legal/acceptable-use', permanent: true },
      // Restore purchase shortcut.
      { source: '/restore-purchase', destination: '/restore', permanent: true },
    ];
  },
};

module.exports = nextConfig;
