/**
 * Plan resolution for the Lemon Squeezy webhook.
 *
 * Split out of the route handler because this is the code that decides what a
 * customer is entitled to after they pay, and it needs to be testable without a
 * database, a request context, or a signed webhook body. The route imports these
 * back; nothing here touches I/O.
 *
 * The variant map is a parameter rather than an `env` read so the mapping can be
 * exercised directly. The route supplies the real ids from `env`.
 */

import type { Plan } from '../entitlement';

/** The ids an operator configures. Empty string means "not configured".
 *  Yearly-billing variants map to the same plan as their monthly counterparts. */
export interface VariantMap {
  starter: string;
  pro: string;
  agency: string;
  starterYearly?: string;
  proYearly?: string;
  agencyYearly?: string;
}

/** Narrow an arbitrary string to a known plan, or null. Case- and space-tolerant. */
export function asPlan(value?: string | null): Plan | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'starter' || v === 'pro' || v === 'agency' || v === 'free') return v;
  return null;
}

/**
 * Resolve the plan from the purchased variant id — the authoritative record of
 * what was actually paid for. Falls back to the signed custom_data plan (set by
 * our own checkout route), then the variant name.
 *
 * Returns null when nothing matches. Callers MUST treat null as "unknown", not
 * as "free": an unmapped variant id is an operator mistake, and the customer
 * should not pay for it. The fallbacks deliberately refuse 'free' for the same
 * reason — a paid webhook must never resolve to the unpaid tier.
 *
 * An unconfigured (empty) variant id never matches, so a half-configured deploy
 * degrades to "unknown" rather than handing out whichever tier happens to be
 * blank.
 */
export function resolvePlan(
  variantId: string | number | null | undefined,
  customPlan: string | null | undefined,
  variantName: string | null | undefined,
  variants: VariantMap,
): Plan | null {
  const vid = String(variantId ?? '').trim();
  if (vid) {
    // Yearly variants resolve to the same tier — billing interval is a pricing
    // detail, never a different entitlement.
    if (variants.agencyYearly && vid === variants.agencyYearly) return 'agency';
    if (variants.proYearly && vid === variants.proYearly) return 'pro';
    if (variants.starterYearly && vid === variants.starterYearly) return 'starter';
    if (variants.agency && vid === variants.agency) return 'agency';
    if (variants.pro && vid === variants.pro) return 'pro';
    if (variants.starter && vid === variants.starter) return 'starter';
  }
  // custom_data.plan is signed inside the webhook body and originally came from
  // our own authenticated checkout route, so it is trustworthy here.
  const byCustom = asPlan(customPlan);
  if (byCustom && byCustom !== 'free') return byCustom;
  const byName = asPlan(variantName);
  if (byName && byName !== 'free') return byName;
  return null;
}

/** Parse an LS timestamp defensively — a malformed date must not poison periodEnd. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
