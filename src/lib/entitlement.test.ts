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
  decideDebit,
  canStartReview,
  decideEntitlement,
  isFreeWindowElapsed,
  isPaidPeriodOverdue,
  normalizePlan,
  PLAN_LIMITS,
  PLAN_ORDER,
  QuotaExceededError,
  type SubscriptionFacts,
} from './entitlement';
import { PLANS as PLAN_CATALOGUE, isUpgrade, planDisplayName } from './plans';

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

    it('keeps access at exactly the 21-day dunning boundary the terms promise', () => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(21));
      expect(verdict.plan).toBe('pro');
      expect(verdict.write).toBe('none');
    });

    it('keeps access one day inside the published 21-day retry window', () => {
      // 15 days used to downgrade here — a week inside the window the legal
      // terms promise ("retry the charge for up to 21 days"). The code now
      // matches the published promise.
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(15));
      expect(verdict.plan).toBe('pro');
      expect(verdict.write).toBe('none');
    });

    it('downgrades once the processor has given up', () => {
      const verdict = decideEntitlement('pro', PERIOD_END, sub({ status: 'past_due' }), at(22));
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

describe('decideDebit / canStartReview', () => {
  // The read-side gate (canAnalyze on the plan state) and the write-side debit
  // must answer "can this review start, and from which pool?" identically —
  // these tests pin the shared decision both call.
  it('debits the allowance while the monthly counter has room', () => {
    expect(decideDebit(0, 50, 0)).toEqual({ source: 'allowance', ok: true });
    expect(decideDebit(49, 50, 0)).toEqual({ source: 'allowance', ok: true });
    expect(canStartReview(49, 50, 0)).toBe(true);
  });

  it('falls back to a referral credit when the allowance is spent', () => {
    // The documented promise: credits are consumed before a full allowance
    // blocks the review — they extend the wall rather than sitting idle.
    expect(decideDebit(50, 50, 3)).toEqual({ source: 'referral_credit', ok: true });
    expect(canStartReview(50, 50, 1)).toBe(true);
  });

  it('is exhausted only when both pools are empty', () => {
    expect(decideDebit(50, 50, 0)).toEqual({ source: 'exhausted', ok: false });
    expect(canStartReview(1, 1, 0)).toBe(false);
  });

  it('prefers the allowance over the credit — credits are the reserve', () => {
    expect(decideDebit(10, 50, 5).source).toBe('allowance');
  });

  it('treats negative or corrupt inputs as zero, never as capacity', () => {
    // The columns come from the database, but defense here is cheap.
    expect(canStartReview(-5, 50, 0)).toBe(true);
    expect(canStartReview(50, 50, -2)).toBe(false);
    expect(canStartReview(50, 50, 0.4)).toBe(false);
    expect(decideDebit(49.6, 50.5, 0.9).source).toBe('allowance');
  });

  it('keeps the wall open at the exact boundary only via a credit', () => {
    expect(canStartReview(50, 50, 0)).toBe(false);
    expect(canStartReview(50, 50, 1)).toBe(true);
  });
});

describe('planDisplayName', () => {
  it('uses the catalogue display name, not the capitalized id', () => {
    // The ids read backwards on purpose (starter is the $49 tier whose display
    // name is "Creator"); a UI that capitalizes the id advertises a tier the
    // pricing page does not sell.
    expect(planDisplayName('starter')).toBe('Creator');
    expect(planDisplayName('pro')).toBe('Pro');
    expect(planDisplayName('agency')).toBe('Agency');
    expect(planDisplayName('free')).toBe('Free');
  });

  it('survives an unrecognized value by falling back to Free', () => {
    expect(planDisplayName('enterprise')).toBe('Free');
    expect(planDisplayName('')).toBe('Free');
  });
});

describe('isUpgrade', () => {
  it('follows the price ladder, not the id order', () => {
    // pro is $19 and starter is $49 — moving pro → starter is an upgrade even
    // though the id order suggests otherwise. The billing webhook depends on
    // this to decide whether a mid-cycle change earns a fresh allowance.
    expect(isUpgrade('pro', 'starter')).toBe(true);
    expect(isUpgrade('starter', 'pro')).toBe(false);
    expect(isUpgrade('free', 'pro')).toBe(true);
    expect(isUpgrade('starter', 'agency')).toBe(true);
    expect(isUpgrade('agency', 'free')).toBe(false);
    expect(isUpgrade('pro', 'pro')).toBe(false);
  });
});

describe('isFreeWindowElapsed', () => {
  // The free plan is advertised as "1 check per month" (plans.ts). This
  // function is the only thing that makes that promise true: without it the
  // counter had no reset path at all and the free tier was once per lifetime.
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-08-30T00:00:00.000Z');

  it('treats a missing periodStart as elapsed', () => {
    // Rows created before window tracking existed (and rows where no window
    // was ever stamped) must roll on first touch, not never.
    expect(isFreeWindowElapsed(null, now)).toBe(true);
  });

  it('keeps a window that started under 30 days ago', () => {
    const started = new Date(now - 29 * DAY);
    expect(isFreeWindowElapsed(started, now)).toBe(false);
    expect(isFreeWindowElapsed(new Date(now), now)).toBe(false);
  });

  it('rolls a window at and past 30 days', () => {
    expect(isFreeWindowElapsed(new Date(now - 30 * DAY), now)).toBe(true);
    expect(isFreeWindowElapsed(new Date(now - 400 * DAY), now)).toBe(true);
  });

  it('never rolls from a future stamp', () => {
    // Clock skew or a manual fix must not trip the roll.
    expect(isFreeWindowElapsed(new Date(now + DAY), now)).toBe(false);
  });
});
