/**
 * Platform policy reference integrity.
 *
 * These cards are cited verbatim to the model and rendered to creators with a
 * `lastReviewed` date attached, which is a claim that a person checked them on
 * that date. That makes the failure mode reputational rather than cosmetic: an
 * empty rule list, a stale date, or a platform the engine supports but the
 * reference does not cover all present confident-looking guidance that nobody
 * actually verified.
 *
 * The tests are structural on purpose. Whether "videos must exceed 1 minute" is
 * still TikTok's threshold is not something a unit test can know — that is what
 * the review date is for. What a test can hold is that every supported platform
 * has a card, every card is complete, and no card silently promises an outcome.
 */
import { describe, it, expect } from 'vitest';
import { PLATFORM_POLICIES, type PlatformName } from './policies';

const PLATFORMS: PlatformName[] = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'];

describe('PLATFORM_POLICIES coverage', () => {
  it('has a card for every supported platform and no extras', () => {
    // A missing card would leave the engine citing nothing for that platform;
    // an extra one is a platform we do not actually analyse.
    expect(Object.keys(PLATFORM_POLICIES).sort()).toEqual([...PLATFORMS].sort());
  });

  it('gives every platform a named monetization program', () => {
    for (const p of PLATFORMS) {
      expect(PLATFORM_POLICIES[p].monetizationName.trim()).not.toBe('');
    }
  });

  it('gives every platform real rules and disqualifiers', () => {
    for (const p of PLATFORMS) {
      const card = PLATFORM_POLICIES[p];
      expect(card.rules.length).toBeGreaterThan(0);
      expect(card.disqualifiers.length).toBeGreaterThan(0);
      for (const line of [...card.rules, ...card.disqualifiers]) {
        expect(line.trim()).not.toBe('');
        // A one-word "rule" is a placeholder, not a policy a creator can act on.
        expect(line.trim().length).toBeGreaterThan(15);
      }
    }
  });

  it('has no duplicate rules or disqualifiers within a card', () => {
    for (const p of PLATFORMS) {
      const card = PLATFORM_POLICIES[p];
      expect(new Set(card.rules).size).toBe(card.rules.length);
      expect(new Set(card.disqualifiers).size).toBe(card.disqualifiers.length);
    }
  });
});

describe('PLATFORM_POLICIES review dates', () => {
  it('carries a valid ISO date for every platform', () => {
    for (const p of PLATFORMS) {
      const raw = PLATFORM_POLICIES[p].lastReviewed;
      expect(raw).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(raw).getTime())).toBe(false);
    }
  });

  it('never claims a review date in the future', () => {
    // The UI shows this as "reviewed on X". A future date is a false claim about
    // work that has not happened.
    const today = new Date();
    for (const p of PLATFORMS) {
      expect(new Date(PLATFORM_POLICIES[p].lastReviewed).getTime()).toBeLessThanOrEqual(
        today.getTime(),
      );
    }
  });
});

describe('PLATFORM_POLICIES honesty', () => {
  it('never promises monetization, detection, or platform approval', () => {
    // The three forbidden promises. These strings are quoted to creators as
    // guidance, so a guarantee here reads as ours.
    const forbidden =
      /\bguarantee[sd]?\b|\bwill (be )?(approved|monetized|demonetized)\b|\bensures? (approval|monetization)\b/i;
    for (const p of PLATFORMS) {
      const card = PLATFORM_POLICIES[p];
      for (const line of [...card.rules, ...card.disqualifiers, card.monetizationName]) {
        expect(line).not.toMatch(forbidden);
      }
    }
  });

  it('states plainly where a platform has no direct monetization', () => {
    // LinkedIn pays nothing directly. Implying otherwise would send a creator
    // chasing revenue that does not exist.
    const linkedin = PLATFORM_POLICIES.LinkedIn;
    expect(linkedin.monetizationName.toLowerCase()).toContain('no direct');
    expect(linkedin.rules.join(' ').toLowerCase()).toContain('no direct monetization');
  });

  it('is free of placeholder text', () => {
    const placeholder = /\b(TODO|TBD|FIXME|lorem ipsum|coming soon|placeholder)\b/i;
    for (const p of PLATFORMS) {
      const card = PLATFORM_POLICIES[p];
      for (const line of [
        card.monetizationName,
        card.lastReviewed,
        ...card.rules,
        ...card.disqualifiers,
      ]) {
        expect(line).not.toMatch(placeholder);
      }
    }
  });
});
