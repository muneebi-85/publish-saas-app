'use client';

import { useEffect, useState, useCallback } from 'react';

export type Plan = 'free' | 'starter' | 'pro' | 'agency';

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 25,
  pro: 100,
  agency: 500,
};

export interface QuotaState {
  plan: Plan;
  auditsUsed: number;
  auditsLimit: number;
  canAnalyze: boolean;
  percentUsed: number;
  isNearLimit: boolean;
  loading: boolean;
  authenticated: boolean;
}

const INITIAL: QuotaState = {
  plan: 'free',
  auditsUsed: 0,
  auditsLimit: PLAN_LIMITS.free,
  canAnalyze: true,
  percentUsed: 0,
  isNearLimit: false,
  loading: true,
  authenticated: false,
};

function coercePlan(p: unknown): Plan {
  return (['free', 'starter', 'pro', 'agency'] as Plan[]).includes(p as Plan)
    ? (p as Plan)
    : 'free';
}

/**
 * Authoritative plan/quota state.
 *
 * SECURITY: this reads exclusively from `/api/me/plan`, which derives plan and
 * usage from the database row for the authenticated user. It never reads
 * cookies — a client cannot elevate its own plan by editing `document.cookie`.
 * The value here is a UX hint; every gated server route re-checks the DB.
 */
export function useQuota(): QuotaState & { refresh: () => void } {
  const [state, setState] = useState<QuotaState>(INITIAL);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/plan', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const plan = coercePlan(data.plan);
      const auditsLimit = Number(data.auditsLimit) || PLAN_LIMITS[plan];
      const auditsUsed = Number(data.auditsUsed) || 0;
      setState({
        plan,
        auditsUsed,
        auditsLimit,
        canAnalyze: Boolean(data.canAnalyze),
        percentUsed:
          typeof data.percentUsed === 'number'
            ? data.percentUsed
            : Math.min(100, Math.round((auditsUsed / auditsLimit) * 100)),
        isNearLimit: Boolean(data.isNearLimit),
        loading: false,
        authenticated: Boolean(data.authenticated),
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  return { ...state, refresh: () => void load() };
}
