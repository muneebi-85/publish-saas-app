'use client';

import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useQuota } from '@/hooks/useQuota';
import { PlanId } from '@/lib/billing/lemonsqueezy';

const TIERS: {
  id: PlanId; name: string; monthly: number; audits: string;
  blurb: string; features: string[]; popular: boolean;
}[] = [
  {
    id: 'starter', name: 'Creator', monthly: 19, audits: '25 reviews / month',
    blurb: 'For weekly-upload creators.',
    features: ['All six review layers', '2 platform reports', 'AI script humanizer', 'Hook & retention predictor', 'PDF export', 'Email support'],
    popular: false,
  },
  {
    id: 'pro', name: 'Pro', monthly: 39, audits: '100 reviews / month',
    blurb: 'For multi-channel creators.',
    features: ['Everything in Creator', 'All 5 platform reports', 'Unlimited humanizer', 'Copyright & logo auditor', 'Priority processing', 'Version history'],
    popular: true,
  },
  {
    id: 'agency', name: 'Agency', monthly: 79, audits: '500 reviews / month',
    blurb: 'For teams and client work.',
    features: ['Everything in Pro', 'White-label PDF reports', 'Team roles & permissions', 'REST API + webhooks', 'Named account manager', 'SSO (SAML)'],
    popular: false,
  },
];

const COMPARISON = [
  { feature: 'Monetization risk review', free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'Copyright auditor',        free: true,  starter: true,  pro: true,  agency: true },
  { feature: 'AI script humanizer',      free: false, starter: true,  pro: true,  agency: true },
  { feature: 'Platform reports',         free: '1',   starter: '2',   pro: '5',   agency: '5' },
  { feature: 'White-label PDFs',         free: false, starter: false, pro: false, agency: true },
  { feature: 'API access',               free: false, starter: false, pro: false, agency: true },
  { feature: 'Team seats',               free: '1',   starter: '1',   pro: '3',   agency: '15' },
];

export default function PricingPage() {
  const [loadingId, setLoadingId] = useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const { plan: currentPlan } = useQuota();

  const handleUpgrade = async (planId: PlanId | null) => {
    if (!planId) return;
    setLoadingId(planId);
    setCheckoutError('');

    // A paid user switching plans already has a Lemon Squeezy subscription.
    // Opening a second checkout would bill them twice — plan changes go
    // through the customer portal, which swaps the variant on the existing
    // subscription (upgrade, downgrade, or cancel).
    if (currentPlan !== 'free' && currentPlan !== planId) {
      window.location.href = '/api/billing/portal';
      return;
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
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

      <div className="space-y-10">
        {/* Error */}
        {checkoutError && (
          <div className="max-w-md mx-auto text-center rounded-xl bg-crimson-50 border border-crimson-200 px-4 py-3 text-sm text-crimson-600">
            {checkoutError}
          </div>
        )}

        {/* Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {TIERS.map((tier) => {
            const price = tier.monthly;
            const isCurrent = tier.id === currentPlan;
            const ctaLabel = isCurrent
              ? 'Current plan'
              : (currentPlan === 'free' ? `Upgrade to ${tier.name}` : `Switch to ${tier.name}`);
            return (
              <div
                key={tier.name}
                className={`relative bg-white rounded-2xl p-6 flex flex-col transition-all ${
                  tier.popular
                    ? 'border-2 border-brand-600 shadow-card'
                    : 'border border-ink-200 hover:border-ink-300 hover:shadow-card'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 bg-brand-600 text-white rounded-full text-[10px] font-semibold shadow-sm whitespace-nowrap">
                    <Sparkles className="w-3 h-3" /> Most popular
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-bold tracking-tight text-ink-900">
                    {tier.name}
                  </div>
                  {isCurrent && <Badge variant="success">Current</Badge>}
                </div>
                <div className="text-[12.5px] mt-1.5 leading-relaxed text-ink-600">{tier.blurb}</div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-[36px] font-bold tracking-tight tabular-nums leading-none text-ink-900">
                    ${price}
                  </span>
                  <span className="text-[13px] text-ink-500">/mo</span>
                </div>
                <div className="text-[12px] mt-2 font-medium text-ink-900">{tier.audits}</div>

                <div className="mt-5 h-px w-full bg-ink-100" />

                <ul className="mt-5 space-y-2.5 flex-1 text-ink-700">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrent ? 'ghost' : tier.popular ? 'dark' : 'primary'}
                  size="lg"
                  full
                  disabled={isCurrent}
                  isLoading={loadingId === tier.id}
                  onClick={() => handleUpgrade(tier.id)}
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
        <div className="rounded-2xl border border-ink-200 bg-white overflow-hidden max-w-5xl mx-auto">
          <div className="px-6 py-5 border-b border-ink-100">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">Compare plans</h2>
            <p className="text-xs text-ink-500 mt-1">Everything included, side by side.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-ink-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-ink-500">Feature</th>
                  {['Free', 'Creator', 'Pro', 'Agency'].map((h) => (
                    <th key={h} className="px-6 py-3 text-xs font-medium text-ink-500 text-center">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="hover:bg-ink-50 transition-colors">
                    <td className="px-6 py-3.5 text-sm text-ink-900">{row.feature}</td>
                    {(['free', 'starter', 'pro', 'agency'] as const).map((k) => {
                      const v = row[k];
                      return (
                        <td key={k} className="px-6 py-3.5 text-center">
                          {typeof v === 'boolean' ? (
                            v ? <Check className="w-4 h-4 text-brand-600 mx-auto" /> : <span className="text-ink-300">—</span>
                          ) : (
                            <span className="text-sm font-medium text-ink-900 tabular-nums">{v}</span>
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
        <div className="rounded-2xl border border-ink-200 bg-white p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between max-w-5xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">Cancel anytime, keep your data</div>
              <p className="text-xs text-ink-500 mt-1 max-w-xl leading-relaxed">
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
        <p className="text-center text-[11px] text-ink-400 max-w-2xl mx-auto leading-relaxed">
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
