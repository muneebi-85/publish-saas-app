/**
 * Webhook plan resolution.
 *
 * This decides what a customer gets after their card is charged, so the failure
 * modes are asymmetric and both directions cost real money:
 *
 *   • resolving too LOW locks a paying customer out of what they just bought
 *   • resolving too HIGH gives away a tier nobody paid for
 *
 * The rule that follows from that is "null means unknown, never free". A caller
 * that treats an unmapped variant as `free` silently demotes a paying customer,
 * which is why every fallback here refuses to return `free` and why the route
 * keeps the existing tier when this returns null.
 */
import { describe, it, expect } from 'vitest';
import { resolvePlan, asPlan, parseDate, type VariantMap } from './plan-resolution';

const VARIANTS: VariantMap = { starter: '111', pro: '222', agency: '333' };
/** A deploy with the annual-billing variants configured. */
const WITH_YEARLY: VariantMap = {
  starter: '111',
  pro: '222',
  agency: '333',
  starterYearly: '911',
  proYearly: '922',
  agencyYearly: '933',
};
/** A deploy where the operator never set the LS_VARIANT_* vars. */
const UNCONFIGURED: VariantMap = { starter: '', pro: '', agency: '' };

describe('asPlan', () => {
  it('accepts the four known tiers', () => {
    expect(asPlan('free')).toBe('free');
    expect(asPlan('starter')).toBe('starter');
    expect(asPlan('pro')).toBe('pro');
    expect(asPlan('agency')).toBe('agency');
  });

  it('tolerates the casing and padding Lemon Squeezy actually sends', () => {
    expect(asPlan('  Pro ')).toBe('pro');
    expect(asPlan('AGENCY')).toBe('agency');
  });

  it('rejects anything else rather than guessing', () => {
    for (const v of ['', '   ', 'premium', 'Pro Plan', 'starter-monthly', null, undefined]) {
      expect(asPlan(v)).toBeNull();
    }
  });
});

describe('resolvePlan — variant id is authoritative', () => {
  it('maps each configured variant id to its tier', () => {
    expect(resolvePlan('111', null, null, VARIANTS)).toBe('starter');
    expect(resolvePlan('222', null, null, VARIANTS)).toBe('pro');
    expect(resolvePlan('333', null, null, VARIANTS)).toBe('agency');
  });

  it('accepts a numeric variant id, which is what LS actually sends', () => {
    expect(resolvePlan(222, null, null, VARIANTS)).toBe('pro');
  });

  it('maps yearly variant ids to the same tier as their monthly counterpart', () => {
    expect(resolvePlan('911', null, null, WITH_YEARLY)).toBe('starter');
    expect(resolvePlan('922', null, null, WITH_YEARLY)).toBe('pro');
    expect(resolvePlan('933', null, null, WITH_YEARLY)).toBe('agency');
  });

  it('prefers the yearly id when it collides with nothing but is what was charged', () => {
    // The purchased variant is authoritative regardless of what the checkout
    // route put in custom_data — yearly still means the same tier.
    expect(resolvePlan('922', 'starter', 'Pro (Annual)', WITH_YEARLY)).toBe('pro');
  });

  it('treats a yearly id as unknown on a deploy without yearly variants', () => {
    // An operator who configured only monthly variants must not silently map a
    // yearly purchase to a tier — null keeps the customer's existing plan.
    expect(resolvePlan('911', null, null, VARIANTS)).toBeNull();
  });

  it('trims whitespace around the id', () => {
    expect(resolvePlan(' 333 ', null, null, VARIANTS)).toBe('agency');
  });

  it('beats the other two sources when they disagree', () => {
    // What was charged wins over what the checkout said or what the product is
    // named — those can drift, the purchased variant cannot.
    expect(resolvePlan('111', 'agency', 'Agency', VARIANTS)).toBe('starter');
  });
});

describe('resolvePlan — fallbacks', () => {
  it('falls back to the signed custom_data plan', () => {
    expect(resolvePlan(null, 'pro', null, VARIANTS)).toBe('pro');
    expect(resolvePlan('999', 'pro', null, VARIANTS)).toBe('pro');
  });

  it('falls back to the variant name last', () => {
    expect(resolvePlan(null, null, 'agency', VARIANTS)).toBe('agency');
    expect(resolvePlan(null, 'nonsense', 'starter', VARIANTS)).toBe('starter');
  });

  it('never lets a fallback resolve to free', () => {
    // A paid webhook resolving to the unpaid tier is the demotion bug this
    // function exists to prevent.
    expect(resolvePlan(null, 'free', null, VARIANTS)).toBeNull();
    expect(resolvePlan(null, null, 'free', VARIANTS)).toBeNull();
    expect(resolvePlan(null, 'free', 'free', VARIANTS)).toBeNull();
  });
});

describe('resolvePlan — refuses to guess', () => {
  it('returns null for an unmapped variant id with no usable fallback', () => {
    expect(resolvePlan('999', null, null, VARIANTS)).toBeNull();
    expect(resolvePlan('999', '', 'Monthly Plan', VARIANTS)).toBeNull();
  });

  it('returns null when nothing at all was supplied', () => {
    expect(resolvePlan(null, null, null, VARIANTS)).toBeNull();
    expect(resolvePlan(undefined, undefined, undefined, VARIANTS)).toBeNull();
    expect(resolvePlan('', '', '', VARIANTS)).toBeNull();
  });

  it('never returns free — the caller must distinguish unknown from unpaid', () => {
    const inputs: [unknown, string | null, string | null][] = [
      ['999', 'free', 'free'],
      [null, 'free', null],
      ['', null, 'free'],
      [0, null, null],
    ];
    for (const [vid, custom, name] of inputs) {
      expect(resolvePlan(vid as string, custom, name, VARIANTS)).not.toBe('free');
    }
  });

  it('does not match an empty configured id against an empty variant id', () => {
    // The bug this guards: on a half-configured deploy, `'' === ''` would hand
    // out whichever tier the operator forgot to set.
    expect(resolvePlan('', null, null, UNCONFIGURED)).toBeNull();
    expect(resolvePlan(null, null, null, UNCONFIGURED)).toBeNull();
    expect(resolvePlan('111', null, null, UNCONFIGURED)).toBeNull();
  });

  it('still honours a signed custom plan on an unconfigured deploy', () => {
    // Missing env vars are an operator mistake; a customer who checked out
    // through our own route should not be the one who pays for it.
    expect(resolvePlan('111', 'pro', null, UNCONFIGURED)).toBe('pro');
  });

  it('checks agency before pro before starter, so a duplicated id resolves highest', () => {
    // A misconfiguration where one id is pasted into two vars must not silently
    // sell the higher tier at the lower price... it resolves to the higher tier
    // so the customer is never short-changed, and the operator sees it.
    const dupe: VariantMap = { starter: '555', pro: '555', agency: '555' };
    expect(resolvePlan('555', null, null, dupe)).toBe('agency');
  });
});

describe('parseDate', () => {
  it('parses an ISO timestamp', () => {
    expect(parseDate('2026-03-01T12:00:00.000Z')?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('returns null for absent input', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('returns null for a malformed date instead of an Invalid Date', () => {
    // An Invalid Date written to periodEnd would poison every later entitlement
    // comparison, since every comparison against NaN is false.
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('2026-13-45')).toBeNull();
  });

  it('never returns an unusable Date object', () => {
    for (const v of ['2026-01-01', 'garbage', '', null, undefined, '2026-13-45']) {
      const d = parseDate(v);
      if (d !== null) expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });
});
