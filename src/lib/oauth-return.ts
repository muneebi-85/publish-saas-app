/**
 * OAuth return-trip helpers — the pure logic behind the account-linking flow.
 *
 * After a creator authorizes Google/TikTok, Clerk's handshake redirects them
 * back through /sso-callback to the page they were on, with `?connect=YOUTUBE`
 * (a successful handshake, ready to auto-finish) or `?error=...` (a cancelled
 * or failed provider flow). These functions parse that return trip and guard
 * the redirect destination. They are framework-free so the whole decision
 * surface can be pinned down with unit tests in a plain Node process — see
 * oauth-return.test.ts.
 */

/** Default landing page for every guard/return case with no better target. */
export const OAUTH_RETURN_DEFAULT = '/connected-channels';

/**
 * Open-redirect guard for the post-handshake destination.
 *
 * `raw` is only honored when it is a same-origin path: it must start with a
 * single `/`. Anything else (an absolute URL, `//host`, `/\…`) falls back to
 * the channels page, so a crafted link can never bounce a signed-in user to an
 * external origin.
 */
export function safeRedirect(raw: string | undefined, fallback: string = OAUTH_RETURN_DEFAULT): string {
  if (!raw) return fallback;
  // Control characters are rejected ANYWHERE in the value, not just at the
  // edges. `String.trim()` leaves interior tabs alone, and WHATWG URL parsing
  // strips them later — so `/\t//evil.com` survived this guard, then parsed as
  // the cross-origin `///evil.com` once it reached a Location header.
  if (/[\x00-\x1f\x7f]/.test(raw)) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return fallback;
  // Protocol-relative (//host) and backslash-escaped (/\host) origins both
  // start with the one slash we accepted — reject them explicitly.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  return trimmed;
}

/** The parsed outcome of a page landing back from the provider handshake. */
export type OAuthReturn =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'connect'; platform: string };

/**
 * Parse the `?connect=` / `?error=` params the OAuth round trip leaves on the
 * return URL. When both are present the error wins — a cancelled handshake
 * must not auto-connect. Returns the user-facing message for a failed flow, or
 * the platform to auto-connect after a successful one.
 */
export function parseOAuthReturn(params: URLSearchParams): OAuthReturn {
  const platform = params.get('connect');
  const oauthError = params.get('error');

  // The error wins when both are present — a cancelled handshake must not
  // auto-connect the platform.
  if (oauthError) {
    return {
      kind: 'error',
      message:
        oauthError === 'access_denied'
          ? 'You cancelled the connection. No changes were made.'
          : 'The platform connection did not complete. Try again.',
    };
  }

  if (platform) return { kind: 'connect', platform };
  return { kind: 'none' };
}

/**
 * The URL to navigate to after handling a return trip — the flow params
 * (`connect`, `error`) stripped so a refresh does not re-fire the connect.
 * Remaining query params are preserved.
 */
export function stripFlowParams(searchParams: URLSearchParams, pathname: string): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete('connect');
  params.delete('error');
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
