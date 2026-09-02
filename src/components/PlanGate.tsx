'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useQuota, Plan } from '@/hooks/useQuota';
import { UpgradeWall } from './UpgradeWall';
import { PlanId } from '@/lib/billing/lemonsqueezy';
import { planRank } from '@/lib/plans';

interface PlanGateProps {
  feature: string;
  requiredPlan: PlanId;
  description?: string;
  children: React.ReactNode;
}

// Plan hierarchy — a higher tier satisfies the gate for any lower required
// tier. `planRank` is the catalogue's price ladder (free < pro < starter <
// agency); the ids alone sort the wrong way, which is why this used to be a
// local `{ free: 0, starter: 1, pro: 2, agency: 3 }` map that let a Pro
// ($19) account through a Creator ($49) gate.

/**
 * Client-side plan gate.
 *
 * SECURITY NOTE: this is UX only. It reads the authoritative plan from
 * /api/me/plan (DB-derived, non-forgeable) so free users see the wall at
 * point-of-use instead of a 402 after clicking. The server route enforces the
 * real check regardless of what this component renders.
 */
export const PlanGate: React.FC<PlanGateProps> = ({ feature, requiredPlan, description, children }) => {
  const { plan, loading } = useQuota();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (planRank(plan) < planRank(requiredPlan as Plan)) {
    return <UpgradeWall feature={feature} requiredPlan={requiredPlan} description={description} />;
  }
  return <>{children}</>;
};

export default PlanGate;
