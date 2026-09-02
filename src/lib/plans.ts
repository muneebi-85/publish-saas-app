/**
 * The plan catalogue — the single source of truth for every tier.
 *
 * This file exists because the same numbers used to live in four places
 * (`entitlement.ts`, `hooks/useQuota.ts`, `billing/lemonsqueezy.ts` and the two
 * pricing surfaces) and had drifted apart: the client quota bar showed a Creator
 * limit of 25 while the server enforced 100, and the landing page advertised
 * "unlimited checks" on a tier capped at 50. Anything user-facing or enforced now
 * derives from the table below, so a limit can only ever be changed in one place.
 *
 * Deliberately dependency-free — no env, no Prisma, no fetch. `useQuota` is a
 * client hook and imports this directly, so anything server-only added here would
 * be shipped to the browser or fail the build.
 *
 * A note on the ids, because they read backwards: `pro` is the $19 entry tier and
 * `starter` is the $49 middle tier. The names came from an earlier iteration of
 * the pricing page and are now baked into live Lemon Squeezy variants and stored
 * subscription rows, so renaming them is a data migration rather than a rename.
 * `PLAN_ORDER` below is the real ladder; never assume the ids sort correctly.
 */

export type Plan = 'free' | 'starter' | 'pro' | 'agency';

/** Everything except `free`, which is not purchasable. */
export type PaidPlan = Exclude<Plan, 'free'>;

export interface PlanSpec {
  /** Tier label shown to users. */
  name: string;
  /** Monthly price in whole USD. `null` means "contact us" (Agency). */
  monthly: number | null;
  /**
   * ANNUAL price in whole USD — the amount charged once per year, which is
   * ten months of the monthly rate (two months free), rounded to a clean
   * figure. Must match what the yearly Lemon Squeezy variant charges.
   * `priceLabel(plan, 'yearly')` renders this as "$X/yr".
   */
  yearly: number | null;
  /** Audits per billing period. This is the enforced number, not a marketing one. */
  audits: number;
  /** Bullet list for the pricing cards. First bullet is always the audit count. */
  features: string[];
}

/**
 * Ascending by price. Used for upgrade/downgrade comparisons and by the test that
 * checks allowances only ever grow as you move up the ladder — the ids alone give
 * the wrong order (see the note above).
 */
export const PLAN_ORDER: readonly Plan[] = ['free', 'pro', 'starter', 'agency'] as const;

export const PLANS: Record<Plan, PlanSpec> = {
  free: {
    name: 'Free',
    monthly: 0,
    yearly: 0,
    audits: 1,
    features: ['1 check per month', 'All 9 checks on every review', 'Community support'],
  },
  pro: {
    name: 'Pro',
    monthly: 19,
    // Ten months of $19 (two months free), rounded to a clean annual figure.
    yearly: 190,
    audits: 50,
    features: [
      '50 checks per month',
      'All 9 checks',
      'Fix list ranked by impact',
      'Score history & tracking',
      'Priority support',
    ],
  },
  starter: {
    name: 'Creator',
    monthly: 49,
    // Ten months of $49 (two months free), rounded to a clean annual figure.
    yearly: 490,
    audits: 100,
    features: [
      '100 checks per month',
      'Everything in Pro',
      'Early access to new features',
    ],
  },
  agency: {
    name: 'Agency',
    monthly: null,
    yearly: null,
    audits: 500,
    features: [
      '500 checks per month',
      'Everything in Creator',
      'Priority support',
      'Custom terms for teams',
    ],
  },
};

/** Audits per period, keyed by plan. Derived so it cannot drift from the catalogue. */
export const PLAN_LIMITS: Record<Plan, number> = {
  free: PLANS.free.audits,
  pro: PLANS.pro.audits,
  starter: PLANS.starter.audits,
  agency: PLANS.agency.audits,
};

/** Position on the price ladder; -1 for anything unrecognised. */
export function planRank(plan: Plan): number {
  return PLAN_ORDER.indexOf(plan);
}

/** True when `candidate` sits above `current` on the ladder. */
export function isUpgrade(current: Plan, candidate: Plan): boolean {
  return planRank(candidate) > planRank(current);
}

/**
 * Price label for a card: "$19"/mo, "$0"/mo or "Custom" monthly; the annual
 * total ("$190/yr") on the yearly interval.
 */
export function priceLabel(plan: Plan, interval: 'monthly' | 'yearly' = 'monthly'): string {
  const amount = interval === 'yearly' ? PLANS[plan].yearly : PLANS[plan].monthly;
  if (amount === null) return 'Custom';
  return interval === 'yearly' ? `$${amount}/yr` : `$${amount}`;
}

/**
 * The name a user sees for a tier: "Creator", not the raw id "starter".
 *
 * The ids and the display names disagree on purpose (see the note above the
 * catalogue), so capitalizing the id — what several surfaces used to do —
 * rendered "Starter plan" for the tier every pricing card calls "Creator".
 * Everything user-facing labels a tier through this one function so the two
 * vocabularies cannot drift apart again.
 */
export function planDisplayName(plan: Plan | string): string {
  const normalized = normalizePlanId(plan);
  return PLANS[normalized].name;
}

/** Coerce an arbitrary string to a Plan id, defaulting to `free`. */
function normalizePlanId(plan: Plan | string): Plan {
  return planRank(plan as Plan) >= 0 ? (plan as Plan) : 'free';
}
