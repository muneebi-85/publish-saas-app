import { describe, it, expect } from 'vitest';
import { buildConnectReturnUrl } from './useConnectChannel';

describe('buildConnectReturnUrl', () => {
  it('appends ?connect= when redirectTo has no query string', () => {
    expect(buildConnectReturnUrl('http://localhost:3000', '/connected-channels', 'YOUTUBE')).toBe(
      'http://localhost:3000/connected-channels?connect=YOUTUBE',
    );
  });

  it('appends &connect= when redirectTo already has a query string', () => {
    // This exact case previously produced a malformed URL
    // (/settings?tab=channels?connect=TIKTOK) that swallowed the connect param.
    expect(buildConnectReturnUrl('http://localhost:3000', '/settings?tab=channels', 'TIKTOK')).toBe(
      'http://localhost:3000/settings?tab=channels&connect=TIKTOK',
    );
  });

  it('replaces an existing connect value', () => {
    expect(
      buildConnectReturnUrl(
        'http://localhost:3000',
        '/settings?tab=channels&connect=YOUTUBE',
        'TIKTOK',
      ),
    ).toBe('http://localhost:3000/settings?tab=channels&connect=TIKTOK');
  });
});
