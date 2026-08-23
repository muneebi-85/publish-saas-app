/**
 * Primary email resolution.
 *
 * Every billing receipt, payment-failure notice, and account email is addressed
 * with the result of this function. Picking the wrong address means a customer
 * never learns their card failed — a silent failure with a real cost — so the
 * fallback order is pinned here rather than left to array ordering.
 */
import { describe, it, expect } from 'vitest';
import { primaryEmailOf } from './clerk-identity';

describe('primaryEmailOf', () => {
  it('returns the address matching primaryEmailAddressId, not the first one', () => {
    const email = primaryEmailOf({
      primaryEmailAddressId: 'idn_2',
      emailAddresses: [
        { id: 'idn_1', emailAddress: 'old@example.com' },
        { id: 'idn_2', emailAddress: 'current@example.com' },
      ],
    });
    expect(email).toBe('current@example.com');
  });

  it('falls back to the first address when no primary id is set', () => {
    expect(
      primaryEmailOf({
        emailAddresses: [{ id: 'idn_1', emailAddress: 'only@example.com' }],
      }),
    ).toBe('only@example.com');
  });

  it('falls back to the first address when the primary id matches nothing', () => {
    // A stale primary id must not blank out the address entirely — some
    // deliverable address beats none for a payment-failure notice.
    expect(
      primaryEmailOf({
        primaryEmailAddressId: 'idn_deleted',
        emailAddresses: [{ id: 'idn_1', emailAddress: 'fallback@example.com' }],
      }),
    ).toBe('fallback@example.com');
  });

  it('falls back when the primary entry exists but carries an empty address', () => {
    expect(
      primaryEmailOf({
        primaryEmailAddressId: 'idn_1',
        emailAddresses: [
          { id: 'idn_1', emailAddress: '' },
          { id: 'idn_2', emailAddress: 'real@example.com' },
        ],
      }),
    ).toBe('real@example.com');
  });

  it('returns null rather than a placeholder when there is no address', () => {
    expect(primaryEmailOf(null)).toBeNull();
    expect(primaryEmailOf({})).toBeNull();
    expect(primaryEmailOf({ emailAddresses: [] })).toBeNull();
    expect(primaryEmailOf({ primaryEmailAddressId: 'idn_1', emailAddresses: [] })).toBeNull();
  });

  it('is unaffected by the order addresses arrive in', () => {
    const addresses = [
      { id: 'a', emailAddress: 'a@example.com' },
      { id: 'b', emailAddress: 'b@example.com' },
      { id: 'c', emailAddress: 'c@example.com' },
    ];
    const forward = primaryEmailOf({ primaryEmailAddressId: 'c', emailAddresses: addresses });
    const reversed = primaryEmailOf({
      primaryEmailAddressId: 'c',
      emailAddresses: [...addresses].reverse(),
    });
    expect(forward).toBe('c@example.com');
    expect(reversed).toBe('c@example.com');
  });
});
