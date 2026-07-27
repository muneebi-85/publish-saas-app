/**
 * Server-only environment configuration.
 * Fails loudly if required vars are missing in production, silently degrades in dev.
 * Read via `env.X` — never reference `process.env` directly outside this file.
 */

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    if (isProd) throw new Error(`Missing required env var: ${name}`);
    if (typeof window === 'undefined') {
      console.warn(`[env] ${name} not set — degrading to mock mode.`);
    }
    return '';
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  isProd,
  isDev: !isProd,

  APP_URL:  optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  APP_NAME: optional('NEXT_PUBLIC_APP_NAME', 'Publish'),

  // NVIDIA NIM
  NVIDIA_API_KEY:  required('NVIDIA_API_KEY'),
  NVIDIA_BASE_URL: optional('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com/v1'),

  // Model overrides (falsy → use defaults from models.ts)
  NVIDIA_MODEL_REASONING: optional('NVIDIA_MODEL_REASONING'),
  NVIDIA_MODEL_FAST:      optional('NVIDIA_MODEL_FAST'),
  NVIDIA_MODEL_VISION:    optional('NVIDIA_MODEL_VISION'),
  NVIDIA_MODEL_GUARD:     optional('NVIDIA_MODEL_GUARD'),
  NVIDIA_MODEL_EMBED:     optional('NVIDIA_MODEL_EMBED'),

  // Lemon Squeezy
  LS_API_KEY:         optional('LEMONSQUEEZY_API_KEY'),
  LS_STORE_ID:        optional('LEMONSQUEEZY_STORE_ID'),
  LS_WEBHOOK_SECRET:  optional('LEMONSQUEEZY_WEBHOOK_SECRET'),
  LS_VARIANT_STARTER: optional('LEMONSQUEEZY_VARIANT_STARTER'),
  LS_VARIANT_PRO:     optional('LEMONSQUEEZY_VARIANT_PRO'),
  LS_VARIANT_AGENCY:  optional('LEMONSQUEEZY_VARIANT_AGENCY'),

  // Email (Resend)
  RESEND_API_KEY: optional('RESEND_API_KEY'),
  EMAIL_FROM:     optional('EMAIL_FROM', 'Publish <hello@publish.genapps.online>'),

  // DB / auth / etc. — read directly by their SDKs; kept here as the single source.
  DATABASE_URL: optional('DATABASE_URL'),

  // Clerk
  CLERK_PUBLISHABLE_KEY: optional('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  CLERK_SECRET_KEY:      optional('CLERK_SECRET_KEY'),
};

export function isMockMode(): boolean {
  return !env.NVIDIA_API_KEY;
}
