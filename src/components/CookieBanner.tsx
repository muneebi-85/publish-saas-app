'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

const STORAGE_KEY = 'publish_cookie_consent';

type Consent = { analytics: boolean; functional: boolean; decided: boolean };

function getStored(): Consent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch { return null; }
}

function store(c: Consent) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    const stored = getStored();
    if (!stored?.decided) setVisible(true);
  }, []);

  // Flag the banner on <html> so layouts can reserve room for it. It is a fixed
  // overlay, so on a short window it lands on top of whatever is at the bottom of
  // the page — on the auth pages, the submit button. A class means the page only
  // pays for that clearance while the banner is actually up: once it is dismissed
  // the class goes and the extra scroll room with it. See .cookie-banner-open in
  // globals.css.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('cookie-banner-open', visible);
    return () => root.classList.remove('cookie-banner-open');
  }, [visible]);

  const accept = (all: boolean) => {
    const c: Consent = { analytics: all, functional: true, decided: true };
    store(c);
    setVisible(false);
  };

  const saveCustom = () => {
    store({ analytics, functional, decided: true });
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 sm:p-4 pointer-events-none flex justify-end">
      {/* Opaque surface, not a translucent white wash. The banner renders on every
          route including the light-background auth pages, where a 4%-white panel
          left this card's white text unreadable. surface-raised (#0F0F10) is a
          hair lighter than the dark canvas it usually sits on, so nothing changes
          there, and the ink-* text below stays legible everywhere. */}
      <div className="w-full sm:w-auto sm:max-w-sm bg-surface-raised border border-white/[0.12] rounded-2xl shadow-elevated p-4 pointer-events-auto animate-enter">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-ink-900">We use cookies</div>
            <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">
              Strictly necessary cookies keep you signed in. Optional analytics cookies (PostHog)
              help us improve the product — no ad tracking, no data sales.
              {' '}<Link href="/legal/cookies" className="underline underline-offset-2 hover:text-ink-900">Cookie policy</Link>
            </p>
          </div>
        </div>

        {showDetails && (
          <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
            <Toggle label="Strictly necessary" desc="Required for login and security." on={true} disabled />
            <Toggle label="Functional" desc="Remembers your theme and dismissed tips." on={functional} onChange={setFunctional} />
            <Toggle label="Analytics (PostHog)" desc="Anonymized usage data — no cross-site tracking." on={analytics} onChange={setAnalytics} />
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => accept(true)}>Accept all</Button>
          <Button size="sm" variant="secondary" onClick={() => accept(false)}>Necessary only</Button>
          {showDetails ? (
            <Button size="sm" variant="ghost" onClick={saveCustom}>Save preferences</Button>
          ) : (
            <button
              onClick={() => setShowDetails(true)}
              className="text-[12px] text-ink-500 hover:text-ink-900 underline underline-offset-2 transition-colors"
            >
              Customise
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Toggle: React.FC<{
  label: string; desc: string; on: boolean; disabled?: boolean; onChange?: (v: boolean) => void;
}> = ({ label, desc, on, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-[13px] font-medium text-ink-900">{label}</div>
      <div className="text-[11.5px] text-ink-500">{desc}</div>
    </div>
    <button
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${
        on ? 'bg-brand-600' : 'bg-white/[0.12]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-subtle transition-all duration-200 ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  </div>
);
