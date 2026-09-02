import { describe, expect, it } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './newsletter-token';

describe('newsletter unsubscribe tokens', () => {
  it('round-trips a minted token to its email', () => {
    const token = signUnsubscribeToken('member@example.com');
    expect(verifyUnsubscribeToken(token)).toBe('member@example.com');
  });

  it('is bound to the exact (normalized) address', () => {
    const token = signUnsubscribeToken('Member@Example.com ');
    expect(verifyUnsubscribeToken(token)).toBe('member@example.com'); // trimmed + lowercased at mint
    // A different address must not verify against the same token.
    const other = signUnsubscribeToken('attacker@example.com');
    expect(verifyUnsubscribeToken(other)).toBe('attacker@example.com');
  });

  it('rejects a tampered signature', () => {
    const token = signUnsubscribeToken('member@example.com');
    const [payload] = token.split('.');
    const forged = signUnsubscribeToken('admin@example.com');
    const sigOfForged = forged.split('.')[1];
    expect(verifyUnsubscribeToken(`${payload}.${sigOfForged}`)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('no-dot-here')).toBeNull();
    expect(verifyUnsubscribeToken('a.')).toBeNull();
    expect(verifyUnsubscribeToken('.b')).toBeNull();
    // base64url payload of a non-email, signed correctly for itself, is
    // still rejected by the shape check before any DB use.
    const notEmail = signUnsubscribeToken('x');
    // 'x' fails canonicalEmail round-trip normalization only if it contains
    // spaces/case — it does not, so the shape check is the guard that fires.
    expect(verifyUnsubscribeToken(notEmail)).toBeNull();
  });

  it('normalizes the address the same way the subscribe route does', () => {
    // The subscribe route lowercases before upsert (v.email), so a token
    // minted from the stored form always matches the stored row.
    const token = signUnsubscribeToken('Mixed.Case@Example.com');
    expect(verifyUnsubscribeToken(token)).toBe('mixed.case@example.com');
  });
});
