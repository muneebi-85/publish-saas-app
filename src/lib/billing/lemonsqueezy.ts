/**
 * Lemon Squeezy client + plan registry.
 *
 * Lemon Squeezy is the Merchant of Record — it handles sales tax, invoicing,
 * refunds, and fraud on our behalf. We only ever call two endpoints:
 *   1. POST /v1/checkouts         — create a checkout URL
 *   2. Webhook receiver           — process subscription lifecycle events
 *
 * Product/variant IDs come from your Lemon Squeezy dashboard after you create
 * the "Publish – Starter/Pro/Agency" subscription products.
 * Populate LEMONSQUEEZY_VARIANT_* in .env.local. If a variant isn't set, the
 * checkout endpoint returns a helpful error instead of a broken button.
 */

import { env } from '../env';

const LS_BASE = 'https://api.lemonsqueezy.com/v1';

// ─── Plans ─────────────────────────────────────────────
export type PlanId = 'starter' | 'pro' | 'agency';

export const PLANS: Record<PlanId, {
  name: string;
  monthly: number;
  audits: number;
  features: string[];
  variantEnvKey: keyof typeof env;
}> = {
  starter: {
    name: 'Starter',
    monthly: 19,
    audits: 25,
    features: ['All six review layers', '2 platform reports', 'AI script humanizer'],
    variantEnvKey: 'LS_VARIANT_STARTER',
  },
  pro: {
    name: 'Pro',
    monthly: 39,
    audits: 100,
    features: ['Everything in Starter', 'All 5 platforms', 'Unlimited humanizer', 'Priority processing'],
    variantEnvKey: 'LS_VARIANT_PRO',
  },
  agency: {
    name: 'Agency',
    monthly: 79,
    audits: 500,
    features: ['Everything in Pro', 'White-label PDFs', 'Team seats', 'API access'],
    variantEnvKey: 'LS_VARIANT_AGENCY',
  },
};

// ─── Checkout creation ─────────────────────────────────
export interface CreateCheckoutParams {
  planId: PlanId;
  userEmail?: string;
  userId?: string;
  successUrl?: string;
}

export interface CheckoutResult {
  url: string;
  checkoutId: string;
}

export async function createCheckoutUrl(params: CreateCheckoutParams): Promise<CheckoutResult> {
  if (!env.LS_API_KEY || !env.LS_STORE_ID) {
    throw new Error('Lemon Squeezy is not configured. Set LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID.');
  }

  const plan = PLANS[params.planId];
  const variantId = env[plan.variantEnvKey];
  if (!variantId) {
    throw new Error(`Variant id missing for plan "${params.planId}". Set ${String(plan.variantEnvKey)}.`);
  }

  const res = await fetch(`${LS_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LS_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: params.userEmail,
            custom: {
              user_id: params.userId ?? '',
              plan: params.planId,
            },
          },
          product_options: {
            enabled_variants: [Number(variantId)],
            redirect_url: params.successUrl ?? `${env.APP_URL}/api/billing/success?plan=${params.planId}`,
            receipt_button_text: 'Return to Publish',
            receipt_thank_you_note: 'Thanks for supporting Publish. Your reviews are already unlocked.',
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
            dark: false,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: env.LS_STORE_ID } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Lemon Squeezy checkout create failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  return {
    url: data?.data?.attributes?.url,
    checkoutId: data?.data?.id,
  };
}

// ─── Webhook signature verification ─────────────────────
// Lemon Squeezy signs webhooks with HMAC-SHA256 using LEMONSQUEEZY_WEBHOOK_SECRET.
// Verify raw body BEFORE parsing JSON — a tampered body would still parse.
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature || !env.LS_WEBHOOK_SECRET) return false;

  // Web Crypto (available in Node 18+ and Edge runtime).
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.LS_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Webhook event types (subset we handle) ────────────
export type LemonEvent =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_resumed'
  | 'subscription_expired'
  | 'subscription_payment_success'
  | 'subscription_payment_failed'
  | 'order_created';
