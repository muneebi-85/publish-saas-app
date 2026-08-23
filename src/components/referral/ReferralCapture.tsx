'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'publish_ref';

/**
 * Saves an inbound ?ref=CODE referral code so it survives the sign-up journey.
 *
 * Mounted in the root layout. When a visitor lands on any page via a referral
 * link (e.g. /?ref=AB2DEFGH), the code is stashed in localStorage. Once they
 * have an account, ReferralAttacher (dashboard layout) posts it to
 * /api/referral and both sides get their free audit.
 *
 * Valid-looking codes only (same alphabet as generateReferralCode) — anything
 * else is ignored rather than stored for a doomed retry later.
 */
export function ReferralCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('ref');
      if (code && /^[A-Z2-9]{6,16}$/.test(code.trim().toUpperCase())) {
        localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
      }
    } catch {
      // localStorage can be blocked (private mode, storage-full); the referral
      // is a bonus, never worth breaking the page over.
    }
  }, []);

  return null;
}

export const REFERRAL_STORAGE_KEY = STORAGE_KEY;
