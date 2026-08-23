'use client';

import { useEffect } from 'react';
import { REFERRAL_STORAGE_KEY } from './ReferralCapture';

/**
 * Pends the stored referral code to the account.
 *
 * Mounted inside the authenticated dashboard layout. On mount it reads the code
 * stashed by ReferralCapture, POSTs it to /api/referral, and clears the storage
 * key regardless of outcome — a bad or already-claimed code must not retry on
 * every navigation. The API itself is idempotent, so even a double-fire cannot
 * double-credit.
 */
export function ReferralAttacher() {
  useEffect(() => {
    let code: string | null = null;
    try {
      code = localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      return;
    }
    if (!code) return;

    void fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .catch(() => undefined)
      .finally(() => {
        try {
          localStorage.removeItem(REFERRAL_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      });
  }, []);

  return null;
}
