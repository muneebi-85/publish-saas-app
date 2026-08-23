import { describe, it, expect } from 'vitest';
import { isPlatformProvider, providerMeta } from './ConnectedAccountsPanel';

describe('isPlatformProvider', () => {
  it('accepts exactly the two platform providers', () => {
    expect(isPlatformProvider('oauth_google')).toBe(true);
    expect(isPlatformProvider('oauth_tiktok')).toBe(true);
  });

  it('rejects unrelated providers', () => {
    expect(isPlatformProvider('oauth_github')).toBe(false);
    expect(isPlatformProvider('password')).toBe(false);
    expect(isPlatformProvider('')).toBe(false);
  });
});

describe('providerMeta', () => {
  it('maps Google to the YouTube platform', () => {
    expect(providerMeta('oauth_google')).toEqual({ name: 'Google', platform: 'YOUTUBE' });
  });

  it('maps TikTok to the TikTok platform', () => {
    expect(providerMeta('oauth_tiktok')).toEqual({ name: 'TikTok', platform: 'TIKTOK' });
  });

  it('falls back to the raw provider with no platform for anything else', () => {
    expect(providerMeta('oauth_github')).toEqual({ name: 'oauth_github', platform: null });
  });
});
