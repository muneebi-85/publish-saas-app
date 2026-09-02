import { describe, it, expect } from 'vitest';
import {
  OAUTH_RETURN_DEFAULT,
  safeRedirect,
  parseOAuthReturn,
  stripFlowParams,
} from './oauth-return';

describe('safeRedirect', () => {
  it('falls back to the channels page when the param is missing', () => {
    expect(safeRedirect(undefined)).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('rejects an absolute URL (open-redirect attempt)', () => {
    expect(safeRedirect('https://evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('https://evil.example.com/phish')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('rejects a protocol-relative URL', () => {
    expect(safeRedirect('//evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('//evil.example.com/phish')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('rejects a backslash-escaped origin', () => {
    expect(safeRedirect('/\\evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/\\evil.example.com/phish')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('rejects non-path values like mailto/javascript fragments', () => {
    expect(safeRedirect('mailto:someone@example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('javascript:alert(1)')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('rejects interior control characters that browsers strip at parse time', () => {
    // `trim()` leaves an interior tab; WHATWG URL parsing removes it later, so
    // `/\t//evil.com` passed the guard and landed as the cross-origin
    // `///evil.com`. Every C0 control + DEL is rejected anywhere in the value.
    expect(safeRedirect('/\t//evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/\n//evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/\r//evil.example.com')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/\x00')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/\x7f')).toBe(OAUTH_RETURN_DEFAULT);
    expect(safeRedirect('/ok/\t')).toBe(OAUTH_RETURN_DEFAULT);
  });

  it('passes through a legitimate same-origin path', () => {
    expect(safeRedirect('/connected-channels')).toBe('/connected-channels');
    expect(safeRedirect('/settings?tab=channels&connect=YOUTUBE')).toBe(
      '/settings?tab=channels&connect=YOUTUBE',
    );
  });

  it('trims surrounding whitespace before validating', () => {
    expect(safeRedirect('  /connected-channels  ')).toBe('/connected-channels');
  });

  it('honours a custom fallback when provided', () => {
    expect(safeRedirect('https://evil.example.com', '/home')).toBe('/home');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
  });

  // The auth pages' readRedirect is this guard with a '/dashboard' fallback.
  // These pin that the sign-in/up deep link survives the trip and that every
  // open-redirect shape falls back — the exact attack surface of
  // /sign-in?redirect_url=…
  describe('auth redirect_url (readRedirect contract)', () => {
    const read = (raw: string | null | undefined) => safeRedirect(raw ?? undefined, '/dashboard');

    it('honours a same-origin deep link after sign-in', () => {
      expect(read('/pricing')).toBe('/pricing');
      expect(read('/settings?tab=billing')).toBe('/settings?tab=billing');
    });

    it('falls back to the dashboard for every open-redirect shape', () => {
      expect(read(null)).toBe('/dashboard');
      expect(read('https://evil.example.com')).toBe('/dashboard');
      expect(read('//evil.example.com')).toBe('/dashboard');
      expect(read('/\\evil.example.com')).toBe('/dashboard');
      // WHATWG parsing strips interior tabs — this shape once passed the
      // auth pages' local startsWith checks and resolved cross-origin.
      expect(read('/\t//evil.example.com')).toBe('/dashboard');
      expect(read('/\n//evil.example.com')).toBe('/dashboard');
      expect(read('/\x00')).toBe('/dashboard');
    });
  });
});

describe('parseOAuthReturn', () => {
  it('returns none when there are no flow params', () => {
    expect(parseOAuthReturn(new URLSearchParams(''))).toEqual({ kind: 'none' });
    expect(parseOAuthReturn(new URLSearchParams('?tab=channels'))).toEqual({ kind: 'none' });
  });

  it('returns the platform to connect on a successful return', () => {
    expect(parseOAuthReturn(new URLSearchParams('?connect=YOUTUBE'))).toEqual({
      kind: 'connect',
      platform: 'YOUTUBE',
    });
    expect(parseOAuthReturn(new URLSearchParams('?connect=TIKTOK'))).toEqual({
      kind: 'connect',
      platform: 'TIKTOK',
    });
  });

  it('maps access_denied to the cancelled-flow message', () => {
    expect(parseOAuthReturn(new URLSearchParams('?error=access_denied'))).toEqual({
      kind: 'error',
      message: 'You cancelled the connection. No changes were made.',
    });
  });

  it('maps any other error to the generic did-not-complete message', () => {
    expect(parseOAuthReturn(new URLSearchParams('?error=invalid_request'))).toEqual({
      kind: 'error',
      message: 'The platform connection did not complete. Try again.',
    });
    expect(parseOAuthReturn(new URLSearchParams('?error=server_error'))).toEqual({
      kind: 'error',
      message: 'The platform connection did not complete. Try again.',
    });
  });

  it('lets the error win when both connect and error are present', () => {
    // A cancelled handshake must not auto-connect the platform.
    expect(parseOAuthReturn(new URLSearchParams('?connect=YOUTUBE&error=access_denied'))).toEqual({
      kind: 'error',
      message: 'You cancelled the connection. No changes were made.',
    });
  });
});

describe('stripFlowParams', () => {
  it('strips the connect param and keeps unrelated params', () => {
    const url = stripFlowParams(
      new URLSearchParams('?connect=YOUTUBE&tab=channels'),
      '/connected-channels',
    );
    expect(url).toBe('/connected-channels?tab=channels');
  });

  it('strips the error param and keeps unrelated params', () => {
    const url = stripFlowParams(
      new URLSearchParams('?tab=channels&error=access_denied'),
      '/settings',
    );
    expect(url).toBe('/settings?tab=channels');
  });

  it('returns the bare path when only flow params existed', () => {
    expect(stripFlowParams(new URLSearchParams('?connect=YOUTUBE'), '/connected-channels')).toBe(
      '/connected-channels',
    );
    expect(stripFlowParams(new URLSearchParams('?error=access_denied'), '/settings')).toBe(
      '/settings',
    );
  });

  it('strips both params when both are present', () => {
    expect(
      stripFlowParams(
        new URLSearchParams('?connect=YOUTUBE&error=access_denied&tab=channels'),
        '/connected-channels',
      ),
    ).toBe('/connected-channels?tab=channels');
  });
});
