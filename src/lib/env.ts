/**
 * Server-only environment configuration.
 *
 * Three tiers:
 *   required()  — the deploy is not viable without it. Throws at import time in
 *                 production so a misconfigured deploy fails fast at build/boot
 *                 instead of 500-ing on a user's first request.
 *   recommended() — the app boots, but a whole feature area is inert without it
 *                 (billing, email, background jobs). Logged once at boot.
 *   optional()  — genuinely has a sane default or is opt-in.
 *
 * Read via `env.X` — never reference `process.env` directly outside this file.
 */

const isProd = process.env.NODE_ENV === 'production';
// Vercel sets NEXT_PHASE=phase-production-build during `next build`. Env vars
// exist at build time on Vercel, but a bare `docker build` / CI typecheck has
// none — so we only hard-throw when actually serving traffic.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const shouldEnforce = isProd && !isBuildPhase;

const missing: string[] = [];
const degraded: string[] = [];

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    if (shouldEnforce) missing.push(name);
    else degraded.push(name);
    return '';
  }
  return v;
}

function recommended(name: string, fallback = ''): string {
  const v = process.env[name] ?? fallback;
  if (!v) degraded.push(name);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/** Derive the canonical public origin. Vercel injects VERCEL_URL per-deploy. */
function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  if (shouldEnforce) missing.push('NEXT_PUBLIC_APP_URL');
  return 'http://localhost:3000';
}

export const env = {
  isProd,
  isDev: !isProd,

  APP_URL: resolveAppUrl(),
  APP_NAME: optional('NEXT_PUBLIC_APP_NAME', 'Publish'),

  // ---- Database (required: nothing works without it) ----
  DATABASE_URL: required('DATABASE_URL'),

  // ---- Clerk auth (required: every route is behind it) ----
  CLERK_PUBLISHABLE_KEY: required('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  CLERK_SECRET_KEY: required('CLERK_SECRET_KEY'),
  CLERK_WEBHOOK_SECRET: recommended('CLERK_WEBHOOK_SECRET'),

  // ---- NVIDIA NIM (required: the product IS the analysis) ----
  NVIDIA_API_KEY: required('NVIDIA_API_KEY'),
  NVIDIA_BASE_URL: optional('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com/v1'),

  // ---- Speech-to-text (Deepgram; measures real voice DSP metrics) ----
  // Absent → voice analysis estimates cadence from the transcript text alone.
  DEEPGRAM_API_KEY: recommended('DEEPGRAM_API_KEY'),

  // Model overrides (falsy → use defaults from models.ts)
  NVIDIA_MODEL_REASONING: optional('NVIDIA_MODEL_REASONING'),
  NVIDIA_MODEL_FAST: optional('NVIDIA_MODEL_FAST'),
  NVIDIA_MODEL_VISION: optional('NVIDIA_MODEL_VISION'),
  NVIDIA_MODEL_GUARD: optional('NVIDIA_MODEL_GUARD'),
  NVIDIA_MODEL_EMBED: optional('NVIDIA_MODEL_EMBED'),

  // ---- Lemon Squeezy (Merchant of Record) ----
  LS_API_KEY: recommended('LEMONSQUEEZY_API_KEY'),
  LS_STORE_ID: recommended('LEMONSQUEEZY_STORE_ID'),
  LS_WEBHOOK_SECRET: recommended('LEMONSQUEEZY_WEBHOOK_SECRET'),
  LS_VARIANT_STARTER: recommended('LEMONSQUEEZY_VARIANT_STARTER'),
  LS_VARIANT_PRO: recommended('LEMONSQUEEZY_VARIANT_PRO'),
  LS_VARIANT_AGENCY: recommended('LEMONSQUEEZY_VARIANT_AGENCY'),

  // ---- Background jobs (Upstash QStash) ----
  // Absent → the analyze route runs the review inline instead of enqueueing.
  QSTASH_TOKEN: recommended('QSTASH_TOKEN'),
  QSTASH_CURRENT_SIGNING_KEY: recommended('QSTASH_CURRENT_SIGNING_KEY'),
  QSTASH_NEXT_SIGNING_KEY: recommended('QSTASH_NEXT_SIGNING_KEY'),

  // ---- Rate limiting (Upstash Redis REST) ----
  // Absent → in-memory fallback, which is per-instance only on serverless.
  UPSTASH_REDIS_REST_URL: recommended('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: recommended('UPSTASH_REDIS_REST_TOKEN'),

  // ---- Object storage (S3 or Cloudflare R2) ----
  S3_BUCKET: optional('S3_BUCKET'),
  S3_REGION: optional('S3_REGION', 'auto'),
  S3_ACCESS_KEY_ID: optional('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: optional('S3_SECRET_ACCESS_KEY'),
  /** Set for R2 / MinIO. Empty for real AWS S3. */
  S3_ENDPOINT: optional('S3_ENDPOINT'),
  /** Public read origin for uploaded assets (CDN / R2 custom domain). */
  S3_PUBLIC_URL: optional('S3_PUBLIC_URL'),

  // ---- Platform OAuth / data APIs ----
  YOUTUBE_API_KEY: optional('YOUTUBE_API_KEY'),
  TIKTOK_CLIENT_KEY: optional('TIKTOK_CLIENT_KEY'),
  TIKTOK_CLIENT_SECRET: optional('TIKTOK_CLIENT_SECRET'),

  // ---- Email (Resend) ----
  RESEND_API_KEY: recommended('RESEND_API_KEY'),
  EMAIL_FROM: optional('EMAIL_FROM', 'Publish <hello@publish.genapps.online>'),

  // ---- Ops ----
  CRON_SECRET: recommended('CRON_SECRET'),
};

// ---------------------------------------------------------------------------
// Boot-time verdict. Throwing here surfaces during `next start` / the first
// serverless cold start, i.e. before any user-visible request is served.
// ---------------------------------------------------------------------------
if (missing.length > 0) {
  throw new Error(
    `[env] Missing required environment variable(s) in production: ${missing.join(', ')}. ` +
      `Set them in your Vercel project settings (Settings → Environment Variables) and redeploy.`,
  );
}

if (degraded.length > 0 && typeof window === 'undefined') {
  console.warn(
    `[env] Not configured: ${degraded.join(', ')}. ` +
      `The features that depend on these are disabled until they are set.`,
  );
}

/** True when a live NIM key is present, so real model calls can be made. */
export function hasLiveModel(): boolean {
  return Boolean(env.NVIDIA_API_KEY);
}

/** True when billing is fully wired (checkout + webhook verification). */
export function hasBilling(): boolean {
  return Boolean(env.LS_API_KEY && env.LS_STORE_ID && env.LS_WEBHOOK_SECRET);
}

/** True when jobs can be enqueued; otherwise callers must run work inline. */
export function hasJobQueue(): boolean {
  return Boolean(env.QSTASH_TOKEN);
}

/** True when uploads can be presigned. */
export function hasStorage(): boolean {
  return Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

/** True when transactional email can be sent. */
export function hasEmail(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** True when audio can be transcribed, so voice metrics become measured. */
export function hasTranscription(): boolean {
  return Boolean(env.DEEPGRAM_API_KEY);
}
