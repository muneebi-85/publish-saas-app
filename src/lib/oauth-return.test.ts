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
