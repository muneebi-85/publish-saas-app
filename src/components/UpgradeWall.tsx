'use client';

import React, { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useQuota } from '@/hooks/useQuota';
import { PlanId } from '@/lib/billing/lemonsqueezy';

interface Props {
  feature: string;
  requiredPlan: PlanId;
  description?: string;
}

export const UpgradeWall: React.FC<Props> = ({ feature, requiredPlan, description }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { plan } = useQuota();

  const planLabel = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1);

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');

    // A subscriber switching tiers already has a Lemon Squeezy subscription —
    // a second checkout would double-bill. Plan changes go through the portal.
    if (plan !== 'free' && plan !== requiredPlan) {
      window.location.href = '/api/billing/portal';
      return;
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: requiredPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
      else throw new Error('No checkout URL returned');
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto text-center">
      <div className="w-12 h-12 rounded-2xl bg-ink-100 text-ink-600 flex items-center justify-center mx-auto">
        <Lock className="w-5 h-5" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-950 mt-4">{feature}</h3>
      <p className="text-[13px] text-ink-500 mt-2 leading-relaxed">
        {description ?? `This feature is available on the ${planLabel} plan and above.`}
      </p>
      {error && <p className="text-[12px] text-crimson-600 mt-3">{error}</p>}
      <Button
        className="mt-5"
        onClick={handleUpgrade}
        isLoading={loading}
        rightIcon={!loading ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
      >
        Upgrade to {planLabel}
      </Button>
    </Card>
  );
};

export default UpgradeWall;
