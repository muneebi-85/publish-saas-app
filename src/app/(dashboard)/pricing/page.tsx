'use client';

import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useQuota } from '@/hooks/useQuota';
import { PlanId } from '@/lib/billing/lemonsqueezy';
import { PLANS, PLAN_ORDER, type Plan } from '@/lib/plans';

/**
 * The cards, derived from the plan catalogue rather than restated here.
 *
 * This block used to hard-code every price, audit count and feature bullet. It had
 * already drifted: Agency advertised "Custom" checks while the server enforced 500,
 * and its bullets listed three features the catalogue does not grant. `PLANS` is the
 * number the quota meter reads and the entitlement check enforces, so it is the
 * number a buyer must be shown - the only fields kept local are the two that are
 * purely presentational.
 */
const PRESENTATION: Record<Plan, { blurb: string; popular: boolean }> = {
  free: { blurb: 'Start free, forever.', popular: false },
  pro: { blurb: 'For serious creators.', popular: true },
  starter: { blurb: 'For growing creators.', popular: false },
  agency: { blurb: 'For teams that ship volume.', popular: false },
};

const TIERS: {
  id: PlanId | 'free'; name: string; price: number | null; audits: string;
  blurb: string; features: string[]; popular: boolean;
}[] = PLAN_ORDER.map((id) => ({
  id: id as PlanId | 'free',
  name: PLANS[id].name,
  price: PLANS[id].monthly,
  // The enforced allowance, worded the way the quota meter words it. A tier whose
  // price is "Custom" still has a real cap, and hiding it is how a customer finds
  // out about it by hitting it.
  audits: `${PLANS[id].audits.toLocaleString()} check${PLANS[id].audits === 1 ? '' : 's'} / month`,
  blurb: PRESENTATION[id].blurb,
  features: PLANS[id].features,
  popular: PRESENTATION[id].popular,
}));

// Every row describes something the app actually enforces or provides today:
// the humanizer and coach are requirePaidPlan() routes on the server, export
// is available on every plan (the report page renders it unconditionally), and
// priority support matches the catalogue and the help center's reply promise.
// The fictional rows this table used to carry — per-plan platform-report
// counts, team seats, white-label PDFs — described no code that exists.
const COMPARISON = [
  { feature: 'Monetization risk review', free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'Copyright auditor',        free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'All 9 checks per review',  free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'Report export (PDF)',      free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'AI script humanizer',      free: false, starter: true,  pro: true,  agency: true },
  { feature: 'AI Coach',                 free: false, starter: true,  pro: true,  agency: true },
  { feature: 'Priority support',         free: false, starter: true,  pro: true,  agency: true },
];

export default function PricingPage() {
  const [loadingId, setLoadingId] = useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const { plan: currentPlan, loading: quotaLoading, authenticated } = useQuota();

  const handleUpgrade = async (planId: PlanId | null) => {
    if (!planId) return;
    // /pricing is a public route: an anonymous visitor clicking a paid tier
    // cannot open a checkout (the route is auth-bound by design — the webhook
    // must credit a real account). Send them to sign-up with the intent kept
    // in the redirect instead of surfacing a raw 401 as "Not authenticated".
    if (!authenticated) {
      window.location.href = '/sign-up?redirect_url=%2Fpricing';
      return;
    }
    setLoadingId(planId);
    setCheckoutError('');

    // A paid user switching plans already has a Lemon Squeezy subscription.
    // Opening a second checkout would bill them twice — plan changes go
    // through the customer portal, which swaps the variant on the existing
    // subscription (upgrade, downgrade, or cancel).
    // The loading gate matters: useQuota's initial state is plan:'free', and
    // acting on it mid-load would bounce a subscribed user to a second
    // checkout instead of the portal.
    if (!quotaLoading && currentPlan !== 'free' && currentPlan !== planId) {
      window.location.href = '/api/billing/portal';
      return;
    }
    if (quotaLoading) return;

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: 'monthly' }),
      });
      // Guarded: a proxy error page is HTML, and unguarded parsing would
      // surface as "Unexpected token '<'" in the checkout-error UI.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server already holds a live subscription for this account: the
        // portal is the only correct next step, so take it rather than showing
        // an error the user cannot act on.
        if (data?.portalRequired) {
          window.location.href = '/api/billing/portal';
          return;
        }
        throw new Error(data.error || 'Checkout failed');
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setCheckoutError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="animate-enter">
      <PageHeader
        title="Plans & Pricing"
        subtitle="Simple, fair pricing. Upgrade or downgrade anytime."
        showUtility
      />

      <div className="space-y-6">
        {/* Error */}
        {checkoutError && (
          <div className="max-w-md mx-auto text-center rounded-xl bg-crimson-50 border border-crimson-200 p-4 text-[13px] text-crimson-700">
            {checkoutError}
          </div>
        )}

        {/* Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
          {TIERS.map((tier) => {
            // While the plan is still loading, none of the tier buttons may
            // act: "isCurrent" would mislabel a paid user as free and open a
            // second checkout against their live subscription.
            const isCurrent = !quotaLoading && tier.id === currentPlan;
            const ctaLabel = isCurrent
              ? 'Current plan'
              : tier.id === 'free'
                ? 'Get started'
                : tier.id === 'agency'
                  ? 'Talk to us'
                  : (quotaLoading || currentPlan === 'free'
                    ? `Upgrade to ${tier.name}`
                    : `Switch to ${tier.name}`);
            return (
              <div
                key={tier.name}
                className={`relative bg-surface-panel rounded-xl p-6 flex flex-col transition-all ${
                  tier.popular
                    ? 'border-2 border-brand-600 shadow-card'
                    : 'border border-ink-200 hover:border-ink-300 hover:shadow-card'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 h-6 bg-brand-600 text-on-brand rounded-md text-[11px] font-semibold shadow-xs whitespace-nowrap">
                    <Sparkles className="w-3 h-3" /> Most popular
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
                    {tier.name}
                  </div>
                  {isCurrent && <Badge variant="success">Current</Badge>}
                </div>
                <div className="text-[12px] mt-1.5 leading-relaxed text-ink-600">{tier.blurb}</div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-[40px] font-semibold tracking-[-0.025em] tabular-nums leading-none text-ink-900">
                    {tier.price === null ? 'Custom' : `$${tier.price}`}
                  </span>
                  {tier.price !== null && <span className="text-[13px] text-ink-500">/mo</span>}
                </div>
                <div className="text-[12px] mt-2 font-medium text-ink-900">{tier.audits}</div>

                <div className="mt-5 h-px w-full bg-ink-100" />

                <ul className="mt-5 space-y-2.5 flex-1 text-ink-700">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" strokeWidth={3} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrent ? 'ghost' : tier.popular ? 'dark' : 'primary'}
                  size="lg"
                  full
                  disabled={isCurrent || (quotaLoading && tier.id !== 'free' && tier.id !== 'agency')}
                  isLoading={loadingId === tier.id}
                  onClick={() => {
                    if (isCurrent) return;
                    if (tier.id === 'free') { window.location.href = '/dashboard'; return; }
                    if (tier.id === 'agency') { window.location.href = 'mailto:support@genapps.online'; return; }
                    handleUpgrade(tier.id);
                  }}
                  className="mt-6"
                  rightIcon={!isCurrent && loadingId !== tier.id ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
                >
                  {ctaLabel}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden max-w-5xl mx-auto">
          <div className="px-6 py-5 border-b border-ink-200">
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">Compare plans</h2>
            <p className="text-[12px] text-ink-500 mt-1">Everything included, side by side.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-ink-50 text-left">
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Feature</th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 text-center">{PLANS[id].name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="hover:bg-ink-50 transition-colors">
                    <td className="px-6 py-3.5 text-[13px] text-ink-900">{row.feature}</td>
                    {PLAN_ORDER.map((k) => {
                      const v = row[k];
                      return (
                        <td key={k} className="px-6 py-3.5 text-center">
                          {typeof v === 'boolean' ? (
                            v ? <Check className="w-4 h-4 text-brand-600 mx-auto" /> : <span className="text-ink-300">—</span>
                          ) : (
                            <span className="text-[13px] font-medium text-ink-900 tabular-nums">{v}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guarantee */}
        <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between max-w-5xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ink-900">Cancel anytime, keep your data</div>
              <p className="text-[12px] text-ink-500 mt-1 max-w-xl leading-relaxed">
                No contracts, no cancellation fees. If you downgrade, your past reports stay accessible for
                30 days so you can export anything you need.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = 'mailto:support@genapps.online';
              }
            }}
          >
            Contact sales
          </Button>
        </div>

        {/* Auto-renewal disclosure — required by Lemon Squeezy and consumer law */}
        <p className="text-center text-[11px] text-ink-500 max-w-2xl mx-auto leading-relaxed">
          Paid plans are <strong className="text-ink-500">auto-renewing subscriptions</strong> billed
          monthly by <strong className="text-ink-500">Lemon Squeezy</strong> (Merchant of
          Record). Your card is charged automatically at the start of each period until you cancel.
          Cancel any time from{' '}
          <a href="/settings?tab=billing" className="underline underline-offset-2 hover:text-ink-700">
            Settings › Billing
          </a>{' '}
          or the customer portal — no fees, no forms.{' '}
          <a href="/legal/subscription-terms" className="underline underline-offset-2 hover:text-ink-700">Subscription terms</a>
          {' '}·{' '}
          <a href="/legal/refund" className="underline underline-offset-2 hover:text-ink-700">Refund policy</a>
          {' '}·{' '}
          <a href="/restore" className="underline underline-offset-2 hover:text-ink-700">Restore purchase</a>
        </p>
      </div>
    </div>
  );
}
