/**
 * Plan entitlement decisions.
 *
 * This is the money path: `decideEntitlement` is what decides whether someone
 * who paid keeps access, and whether someone who stopped paying loses it. Both
 * failure directions are expensive — wrongly revoking locks a paying customer
 * out of work they are mid-way through, wrongly keeping gives the product away
 * — so every branch is pinned here, including the deliberate asymmetry that
 * resolves ambiguity in the customer's favour.
 *
 * The functions under test are pure and take an explicit `now`, so none of this
 * touches a database or a clock.
 */
import { describe, it, expect } from 'vitest';
import {
  decideEntitlement,
  isPaidPeriodOverdue,
  normalizePlan,
  PLAN_LIMITS,
  PLAN_ORDER,
  QuotaExceededError,
  type SubscriptionFacts,
} from './entitlement';
import { PLANS as PLAN_CATALOGUE } from './plans';

const DAY = 24 * 60 * 60 * 1000;

/** A fixed clock. Tests read as "N days after the paid period ended". */
const PERIOD_END = new Date('2026-03-01T00:00:00.000Z');
const at = (daysAfterPeriodEnd: number) => PERIOD_END.getTime() + daysAfterPeriodEnd * DAY;

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    status: 'active',
    currentPeriodEnd: PERIOD_END,
    lsSubscriptionId: 'ls_sub_1',
    ...overrides,
  };
}

describe('normalizePlan', () => {
  it('accepts the three paid tiers in any casing', () => {
    expect(normalizePlan('starter')).toBe('starter');
    expect(normalizePlan('PRO')).toBe('pro');
    expect(normalizePlan('Agency')).toBe('agency');
  });

  it('falls back to free for anything unrecognized', () => {
    // A typo, a renamed tier, or a value from a future version must never
    // silently grant a paid allowance.
    expect(normalizePlan('free')).toBe('free');
    expect(normalizePlan('enterprise')).toBe('free');
    expect(normalizePlan('')).toBe('free');
    expect(normalizePlan('pro ')).toBe('free');
  });
});

describe('PLAN_LIMITS', () => {
  // Walks PLAN_ORDER rather than hard-coding the id sequence. The ids do not sort
  // by price — `pro` is the $19 entry tier and `starter` the $49 one above it —
  // and the old version of this test assumed they did, which is why it failed.
  it('increases monotonically up the price ladder', () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const below = PLAN_ORDER[i - 1];
      const above = PLAN_ORDER[i];
      expect(
        PLAN_LIMITS[below],
        `${below} (${PLAN_LIMITS[below]}) should allow fewer audits than ${above} (${PLAN_LIMITS[above]})`,
      ).toBeLessThan(PLAN_LIMITS[above]);
    }
  });

  it('orders every plan exactly once', () => {
    expect([...PLAN_ORDER].sort()).toEqual(Object.keys(PLAN_LIMITS).sort());
  });

  // The number on the pricing card and the number the server enforces are the
  // same field now; this fails loudly if that link is ever broken.
  it('matches the allowance advertised in the catalogue', () => {
    for (const plan of PLAN_ORDER) {
      expect(PLAN_LIMITS[plan]).toBe(PLAN_CATALOGUE[plan].audits);
      expect(PLAN_CATALOGUE[plan].features[0]).toContain(String(PLAN_CATALOGUE[plan].audits));
    }
  });

  it('gives the free tier a real but non-zero allowance', () => {
    expect(PLAN_LIMITS.free).toBeGreaterThan(0);
  });
});

describe('isPaidPeriodOverdue', () => {
  it('is false inside the renewal grace window', () => {
    expect(isPaidPeriodOverdue(PERIOD_END, at(0))).toBe(false);
    expect(isPaidPeriodOverdue(PERIOD_END, at(1))).toBe(false);
    // Exactly at the 3-day boundary still counts as inside the window.
    expect(isPaidPeriodOverdue(PERIOD_END, at(3))).toBe(false);
  });

  it('is true once past the renewal grace window', () => {
    expect(isPaidPeriodOverdue(PERIOD_END, at(3) + 1)).toBe(true);
    expect(isPaidPeriodOverdue(PERIOD_END, at(10))).toBe(true);
  });

  it('is false for a period that has not ended yet', () => {
    expect(isPaidPeriodOverdue(PERIOD_END, at(-30))).toBe(false);
  });
});

describe('decideEntitlement', () => {
  it('downgrades when no subscription is on record', () => {
    const verdict = decideEntitlement('pro', PERIOD_END, null, at(5));
    expect(verdict.plan).toBe('free');
    expect(verdict.write).toBe('downgrade');
    expect(verdict.reason).toMatch(/no subscription is on record/);
  });

  describe('a renewal that landed on the subscription but not the user row', () => {
    it('extends the period instead of downgrading', () => {
      const renewed = sub({ currentPeriodEnd: new Date(at(30)) });
      const verdict = decideEntitlement('agency', PERIOD_END, renewed, at(5));
      expect(verdict.plan).toBe('agency');
      expect(verdict.write).toBe('extend-period');
      expect(verdict.periodEnd).toEqual(renewed.currentPeriodEnd);
    });

    it('also applies on trial', () => {
      const renewed = sub({ status: 'on_trial', currentPeriodEnd: new Date(at(14)) });
      expect(decideEntitlement('starter', PERIOD_END, renewed, at(5)).write).toBe(
        'extend-period',
      );
    });

    it('ignores a sub-minute difference, which is clock skew rather than a renewal', () => {
      const skewed = sub({ currentPeriodEnd: new Date(PERIOD_END.getTime() + 30_000) });
      const verdict = decideEntitlement('pro', PERIOD_END, skewed, at(5));
      expect(verdict.write).toBe('none');
      expect(verdict.anomaly).toBe(true);
    });

    it('does not extend from a newer period when the subscription is cancelled', () => {
      // A newer boundary on a dead subscription is not evidence of payment.
      const stale = sub({ status: 'cancelled', currentPeriodEnd: new Date(at(30)) });
      const verdict = decideEntitlement('pro', PERIOD_END, stale, at(5));
      expect(verdict.plan).toBe('free');
      expect(verdict.write).toBe('downgrade');
    });
  });

  describe('ambiguity resolves in the payer\'s favour', () => {
    it('keeps the tier when the subscription still reads active', () => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'active' }), at(60));
      expect(verdict.plan).toBe('pro');
      expect(verdict.write).toBe('none');
      expect(verdict.anomaly).toBe(true);
      expect(verdict.reason).toMatch(/renewal webhook was likely missed/);
    });

    it('keeps the tier on trial, however overdue the local boundary looks', () => {
      const verdict = decideEntitlement('starter', PERIOD_END, sub({ status: 'on_trial' }), at(365));
      expect(verdict.plan).toBe('starter');
      expect(verdict.write).toBe('none');
    });

    it('matches status case-insensitively', () => {
      expect(decideEntitlement('pro', PERIOD_END, sub({ status: 'ACTIVE' }), at(60)).plan).toBe('pro');
    });
  });

  describe('a failing card keeps access while the processor retries', () => {
    it.each(['past_due', 'unpaid'])('keeps the tier inside dunning: %s', (status) => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status }), at(10));
      expect(verdict.plan).toBe('pro');
      expect(verdict.write).toBe('none');
    });

    it('keeps access at exactly the 14-day dunning boundary', () => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(14));
      expect(verdict.plan).toBe('pro');
      expect(verdict.write).toBe('none');
    });

    it('downgrades once the processor has given up', () => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(15));
      expect(verdict.plan).toBe('free');
      expect(verdict.write).toBe('downgrade');
      expect(verdict.reason).toMatch(/payment has been failing since/);
    });
  });

  describe('a finished subscription loses access', () => {
    it.each(['cancelled', 'expired', 'paused'])('downgrades on %s', (status) => {
      const verdict = decideEntitlement('agency', PERIOD_END, sub({ status }), at(5));
      expect(verdict.plan).toBe('free');
      expect(verdict.write).toBe('downgrade');
      expect(verdict.reason).toContain(status);
    });

    it('downgrades on a status it has never seen before', () => {
      // Unknown is treated as finished, not as live: the period they paid for is
      // demonstrably over, and only a recognized live status justifies keeping it.
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'chargeback' }), at(5));
      expect(verdict.plan).toBe('free');
      expect(verdict.write).toBe('downgrade');
    });
  });

  it('never returns a paid plan other than the one that was stored', () => {
    const statuses = ['active', 'on_trial', 'past_due', 'unpaid', 'cancelled', 'expired', 'weird'];
    for (const status of statuses) {
      for (const stored of ['starter', 'pro', 'agency'] as const) {
        const verdict = decideEntitlement(stored, PERIOD_END, sub({ status }), at(20));
        expect(['free', stored]).toContain(verdict.plan);
      }
    }
  });

  it('only ever writes when it has a reason to', () => {
    const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(2));
    expect(verdict.write).toBe('none');
    expect(verdict.periodEnd).toBeUndefined();
  });
});

describe('QuotaExceededError', () => {
  it('carries the numbers a 402 response needs', () => {
    const err = new QuotaExceededError('starter', 25, 25);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('QuotaExceededError');
    expect(err.plan).toBe('starter');
    expect(err.auditsUsed).toBe(25);
    expect(err.auditsLimit).toBe(25);
    expect(err.message).toContain('25/25');
  });

  it('is distinguishable from a generic failure, so a quota stop is not a 500', () => {
    const err: unknown = new QuotaExceededError('free', 1, 1);
    expect(err instanceof QuotaExceededError).toBe(true);
  });
});
