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

/** Lemon Squeezy is in the critical path of a purchase; never hang on it. */
const LS_TIMEOUT_MS = 10_000;

async function lsFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LS_TIMEOUT_MS);
  try {
    return await fetch(`${LS_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Plans ─────────────────────────────────────────────
import { PLANS as PLAN_CATALOGUE, type PaidPlan } from '../plans';

/** Purchasable tiers. `free` is not one of them, so it is excluded upstream. */
export type PlanId = PaidPlan;

/** Monthly vs. annual billing. The interval selects which LS variant is bought. */
export type BillingInterval = 'monthly' | 'yearly';

export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'yearly'];

/**
 * The catalogue's `yearly` is the ANNUAL total (ten months of the monthly
 * rate — two months free). It is informational here: the Lemon Squeezy
 * variant is the billing authority, so the registry carries the variant ids
 * and never quotes the yearly figure to the checkout API.
 */
/**
 * Name, price, allowance and features all come from the catalogue in
 * `src/lib/plans.ts`; the only thing this registry adds is which env var holds
 * the Lemon Squeezy variant id for each tier and interval. Splitting it this way
 * is what stops the store's quoted allowance from drifting away from the
 * allowance the app actually enforces — they are now the same value.
 */
const VARIANT_KEYS: Record<PlanId, {
  variantEnvKey: keyof typeof env;
  variantYearlyEnvKey: keyof typeof env;
}> = {
  starter: { variantEnvKey: 'LS_VARIANT_STARTER', variantYearlyEnvKey: 'LS_VARIANT_STARTER_YEARLY' },
  pro: { variantEnvKey: 'LS_VARIANT_PRO', variantYearlyEnvKey: 'LS_VARIANT_PRO_YEARLY' },
  agency: { variantEnvKey: 'LS_VARIANT_AGENCY', variantYearlyEnvKey: 'LS_VARIANT_AGENCY_YEARLY' },
};

export const PLANS: Record<PlanId, {
  name: string;
  monthly: number;
  yearly: number;
  audits: number;
  features: string[];
  variantEnvKey: keyof typeof env;
  variantYearlyEnvKey: keyof typeof env;
}> = {
  starter: buildPlan('starter'),
  pro: buildPlan('pro'),
  agency: buildPlan('agency'),
};

function buildPlan(id: PlanId) {
  const spec = PLAN_CATALOGUE[id];
  return {
    name: spec.name,
    // Agency is quote-only in the catalogue (`null`). Checkout still needs a
    // number, and the LS variant is the authority on what is charged, so 0 here
    // means "whatever the variant says" rather than "free".
    monthly: spec.monthly ?? 0,
    yearly: spec.yearly ?? 0,
    audits: spec.audits,
    features: spec.features,
    ...VARIANT_KEYS[id],
  };
}

// ─── Checkout creation ─────────────────────────────────
export interface CreateCheckoutParams {
  planId: PlanId;
  interval?: BillingInterval;
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
  const interval: BillingInterval = params.interval === 'yearly' ? 'yearly' : 'monthly';
  const variantId = env[interval === 'yearly' ? plan.variantYearlyEnvKey : plan.variantEnvKey];
  if (!variantId) {
    throw new Error(
      `Variant id missing for plan "${params.planId}" (${interval}). Set ${
        String(interval === 'yearly' ? plan.variantYearlyEnvKey : plan.variantEnvKey)
      }.`,
    );
  }

  const res = await lsFetch(`/checkouts`, {
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
              interval,
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

export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  if (!env.LS_API_KEY) return false;

  const res = await lsFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.LS_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
  });

  return res.ok;
}

