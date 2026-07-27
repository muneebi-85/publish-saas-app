'use client';

import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlanId } from '@/lib/billing/lemonsqueezy';

const TIERS: {
  id: PlanId | null; name: string; monthly: number; yearly: number; audits: string;
  blurb: string; features: string[]; cta: string; popular: boolean; current: boolean;
}[] = [
  {
    id: null, name: 'Free', monthly: 0, yearly: 0, audits: '1 review / month',
    blurb: 'Try the full review on one video.',
    features: ['All six review layers', 'YouTube policy check', 'PDF export', 'Community support'],
    cta: 'Current plan', popular: false, current: true,
  },
  {
    id: 'starter', name: 'Starter', monthly: 19, yearly: 15, audits: '25 reviews / month',
    blurb: 'For weekly-upload creators.',
    features: ['Everything in Free', '2 platform reports', 'AI script humanizer', 'Hook & retention predictor', 'Email support'],
    cta: 'Upgrade to Starter', popular: false, current: false,
  },
  {
    id: 'pro', name: 'Pro', monthly: 39, yearly: 31, audits: '100 reviews / month',
    blurb: 'For multi-channel creators.',
    features: ['Everything in Starter', 'All 5 platform reports', 'Unlimited humanizer', 'Copyright & logo auditor', 'Priority processing', 'Version history'],
    cta: 'Upgrade to Pro', popular: true, current: false,
  },
  {
    id: 'agency', name: 'Agency', monthly: 79, yearly: 63, audits: '500 reviews / month',
    blurb: 'For teams and client work.',
    features: ['Everything in Pro', 'White-label PDF reports', 'Team roles & permissions', 'REST API + webhooks', 'Named account manager', 'SSO (SAML)'],
    cta: 'Upgrade to Agency', popular: false, current: false,
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
  const [yearly, setYearly] = useState(false);
  const [loadingId, setLoadingId] = useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  const handleUpgrade = async (planId: PlanId | null) => {
    if (!planId) return;
    setLoadingId(planId);
    setCheckoutError('');
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
    <div className="space-y-10 animate-enter">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Pricing</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-ink-950">
          Plans that scale with your upload schedule
        </h1>
        <p className="text-[15px] text-ink-500 mt-3 leading-relaxed">
          Every plan runs the full six-layer review. Higher tiers raise your monthly review cap and unlock team features.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 p-1 mt-6 rounded-lg border border-ink-200 bg-white">
          <button
            onClick={() => setYearly(false)}
            className={`h-8 px-4 rounded-md text-sm font-medium transition-colors ${
              !yearly ? 'bg-ink-950 text-white' : 'text-ink-700 hover:text-ink-950'
            }`}
          >Monthly</button>
          <button
            onClick={() => setYearly(true)}
            className={`h-8 px-4 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
              yearly ? 'bg-ink-950 text-white' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Yearly
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              yearly ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'
            }`}>−20%</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {checkoutError && (
        <div className="max-w-md mx-auto text-center rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {checkoutError}
        </div>
      )}

      {/* Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 max-w-6xl mx-auto">
        {TIERS.map((tier) => {
          const price = yearly ? tier.yearly : tier.monthly;
          return (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-6 flex flex-col transition-all ${
                tier.popular
                  ? 'bg-ink-950 text-white ring-1 ring-ink-950 shadow-xl scale-[1.02]'
                  : 'bg-white border border-ink-200 hover:border-ink-300 hover:shadow-sm'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 bg-white text-ink-950 rounded-full text-[10px] font-semibold shadow-md whitespace-nowrap">
                  <Sparkles className="w-3 h-3" /> Most popular
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className={`text-[13px] font-semibold uppercase tracking-[0.12em] ${tier.popular ? 'text-white' : 'text-ink-950'}`}>
                  {tier.name}
                </div>
                {tier.current && <Badge variant={tier.popular ? 'outline' : 'default'}>Current</Badge>}
              </div>
              <div className={`text-[12.5px] mt-1.5 leading-relaxed ${tier.popular ? 'text-ink-300' : 'text-ink-500'}`}>{tier.blurb}</div>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className={`text-[36px] font-semibold tracking-tight tabular-nums leading-none ${tier.popular ? 'text-white' : 'text-ink-950'}`}>
                  ${price}
                </span>
                <span className={`text-[13px] ${tier.popular ? 'text-ink-400' : 'text-ink-500'}`}>
                  {price === 0 ? 'forever' : '/mo'}
                </span>
              </div>
              {yearly && price > 0 && (
                <div className={`text-[11px] mt-1.5 ${tier.popular ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Billed ${price * 12}/yr · save 20%
                </div>
              )}
              <div className={`text-[12px] mt-2 font-medium ${tier.popular ? 'text-white' : 'text-ink-900'}`}>{tier.audits}</div>

              <div className={`mt-5 h-px w-full ${tier.popular ? 'bg-white/10' : 'bg-ink-100'}`} />

              <ul className={`mt-5 space-y-2.5 flex-1 ${tier.popular ? 'text-ink-100' : 'text-ink-700'}`}>
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${tier.popular ? 'text-emerald-400' : 'text-emerald-600'}`} strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.popular ? 'secondary' : tier.current ? 'ghost' : 'primary'}
                size="lg"
                disabled={tier.current}
                isLoading={loadingId === tier.id}
                onClick={() => handleUpgrade(tier.id)}
                className={`mt-6 w-full ${tier.popular ? 'bg-white text-ink-950 hover:bg-ink-100 border-0' : ''}`}
                rightIcon={!tier.current && loadingId !== tier.id ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
              >
                {tier.cta}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      <div className="rounded-xl border border-ink-200 bg-white overflow-hidden max-w-5xl mx-auto">
        <div className="px-6 py-5 border-b border-ink-100">
          <h2 className="text-lg font-semibold tracking-tight">Compare plans</h2>
          <p className="text-xs text-ink-500 mt-1">Everything included, side by side.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-ink-50 text-left">
                <th className="px-6 py-3 text-xs font-medium text-ink-500">Feature</th>
                {['Free', 'Starter', 'Pro', 'Agency'].map((h) => (
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
                          v ? <Check className="w-4 h-4 text-emerald-600 mx-auto" /> : <span className="text-ink-300">—</span>
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
      <div className="rounded-xl border border-ink-200 bg-white p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between max-w-5xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-950">Cancel anytime, keep your data</div>
            <p className="text-xs text-ink-500 mt-1 max-w-xl leading-relaxed">
              No contracts, no cancellation fees. If you downgrade, your past reports stay accessible for
              30 days so you can export anything you need.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm">Contact sales</Button>
      </div>

      {/* Auto-renewal disclosure — required by Lemon Squeezy and consumer law */}
      <p className="text-center text-[11px] text-ink-400 max-w-2xl mx-auto leading-relaxed">
        Paid plans are <strong className="text-ink-500">auto-renewing subscriptions</strong> billed
        monthly or annually by <strong className="text-ink-500">Lemon Squeezy</strong> (Merchant of
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
  );
}
