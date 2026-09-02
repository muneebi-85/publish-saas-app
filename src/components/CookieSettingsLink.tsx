'use client';

import React from 'react';

/**
 * The "Cookie settings" entry the cookie policy promises is in the footer.
 *
 * Re-opening the consent banner is a one-step local action: the banner shows
 * whenever no decided consent is stored, so this clears the stored decision
 * and the banner (mounted on every route) reappears immediately. Consent
 * re-decision takes effect on the next `track()` call — `analytics.ts`
 * re-reads localStorage on every event, never caching the verdict.
 */
export const CookieSettingsLink: React.FC = () => {
  const reopen = () => {
    try {
      localStorage.removeItem('publish_cookie_consent');
    } catch {
      // Storage can be blocked; the cookie policy page documents the
      // browser-level alternative.
      return;
    }
    // The banner (mounted on every route) listens for this and reappears —
    // no reload, so nothing in progress on the page is lost.
    window.dispatchEvent(new Event('publish:cookie-settings-open'));
  };

  return (
    <button
      type="button"
      onClick={reopen}
      className="hover:text-ink-900 underline underline-offset-2 transition-colors"
    >
      Cookie settings
    </button>
  );
};
