/**
 * Upgrade prompt component.
 * Shown inline when a feature is gated behind a higher plan.
 */

'use client';

import React, { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from './Button';
import { PlanId } from '@/lib/billing/lemonsqueezy';

interface Props {
  requiredPlan: PlanId;
  feature: string;
  description?: string;
  compact?: boolean;
}

export const UpgradePrompt: React.FC<Props> = ({
  requiredPlan, feature, description, compact = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: requiredPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const planLabel = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1);

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-ink-400" />
        <span className="text-[12.5px] text-ink-500">{feature} — {planLabel}+</span>
        <Button size="sm" variant="secondary" onClick={handleUpgrade} isLoading={loading}>
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-panel p-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.08] text-ink-500 flex items-center justify-center mx-auto">
        <Lock className="w-4 h-4" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-950 mt-4">{feature}</h3>
      {description && (
        <p className="text-[13px] text-ink-500 mt-2 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      <p className="text-[12.5px] text-ink-500 mt-3">
        Available on <span className="font-semibold text-ink-900">{planLabel}</span> and above.
      </p>
      {error && <p className="text-[12px] text-crimson-700 mt-2">{error}</p>}
      <Button
        className="mt-5"
        onClick={handleUpgrade}
        isLoading={loading}
        rightIcon={!loading ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
      >
        Upgrade to {planLabel}
      </Button>
    </div>
  );
};
