'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

/**
 * Re-exported from the plan catalogue rather than restated. This hook used to
 * carry its own copy of the limits (Creator 25, Pro 100) which disagreed with
 * both the server's enforcement and billing, so the quota bar showed numbers no
 * user could actually hit.
 */
export type { Plan } from '@/lib/plans';
export { PLAN_LIMITS } from '@/lib/plans';

import type { Plan } from '@/lib/plans';
import { PLAN_LIMITS } from '@/lib/plans';

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
  const { isSignedIn } = useAuth();

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
    if (!isSignedIn) {
      // Public pages (marketing, legal): don't fire an authenticated fetch
      // that would 401 and spam the console. The UI shows the free-tier
      // defaults, and any gated server route re-checks auth anyway.
      setState((s) => ({ ...s, loading: false, authenticated: false }));
      return;
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load, isSignedIn]);

  return { ...state, refresh: () => void load() };
}
