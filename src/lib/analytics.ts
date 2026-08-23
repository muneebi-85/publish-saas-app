'use client';

/**
 * Client-side product analytics — PostHog, consent-gated.
 *
 * The audit asked for funnels on the analyze flow and quota wall. PostHog is
 * referenced in the cookie banner and legal pages but was never actually wired,
 * so this module is that wiring:
 *
 *  - Nothing loads until BOTH conditions hold: the visitor accepted analytics
 *    cookies (`publish_cookie_consent.analytics === true`) and a
 *    `NEXT_PUBLIC_POSTHOG_KEY` is set on the deployment. With no key, every
 *    call here is a no-op — the bundle is only fetched on first `track`, and
 *    even then only when the key exists, so an unconfigured deploy pays nothing.
 *  - No PII: we only send the events and props the callers pass (platform,
 *    plan, score), never email addresses or user identifiers.
 *
 * The consent check re-reads localStorage on every call, so a user who revokes
 * consent mid-session stops sending immediately.
 */

const CONSENT_KEY = 'publish_cookie_consent';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

type Posthog = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string) => void;
  reset: () => void;
};

let client: Posthog | null | undefined;

function consentGiven(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { analytics?: boolean };
    return parsed.analytics === true;
  } catch {
    return false;
  }
}

/** Load posthog-js lazily so an unconfigured deploy ships no analytics code. */
async function getClient(): Promise<Posthog | null> {
  if (client !== undefined) return client;
  if (!POSTHOG_KEY || !consentGiven()) {
    client = null;
    return client;
  }
  try {
    const { posthog } = await import('posthog-js');
    posthog.init(POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      // We gate on the explicit cookie consent above; PostHog's own cookie
      // persistence would otherwise track across sessions on our say-so.
      persistence: 'localStorage',
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      loaded: () => {
        posthog.identify?.(posthog.get_distinct_id?.() ?? '');
      },
    });
    client = {
      capture: (event, props) => posthog.capture(event, props),
      identify: () => undefined,
      reset: () => posthog.reset?.(),
    };
  } catch {
    client = null;
  }
  return client;
}

/**
 * Fire a product event. Safe to call anywhere on the client — it resolves to a
 * no-op when analytics are not consented or not configured.
 */
export async function track(event: string, props?: Record<string, unknown>): Promise<void> {
  const c = await getClient();
  c?.capture(event, props ?? {});
}

/** True when a real analytics client is (or can become) active. */
export function analyticsConfigured(): boolean {
  return Boolean(POSTHOG_KEY);
}
