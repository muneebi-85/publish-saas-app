'use client';

import { useEffect, useState } from 'react';

/**
 * Safety net for the account-linking round trip.
 *
 * `<AuthenticateWithRedirectCallback />` normally completes the handshake and
 * navigates to the destination itself. If it ever fails to navigate (a stale
 * handshake, a cancelled provider flow, a Clerk regression), this component
 * sends the user home after 15s instead of leaving them on a blank page.
 *
 * The delay is intentionally generous: the handshake involves network calls to
 * Clerk, and firing early would interrupt a still-running link. 15s is long
 * enough for a slow handshake and short enough that nobody stares at a blank
 * page.
 */
export default function SSOCallbackFallback({ destination }: { destination: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Announce after 8s; navigate at 15s. If the callback navigated, this
    // component unmounted and both timers were cleared.
    const showTimer = setTimeout(() => setShow(true), 8_000);
    const navTimer = setTimeout(() => window.location.replace(destination), 15_000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(navTimer);
    };
  }, [destination]);

  if (!show) return null;

  return (
    <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-6">
      <p className="text-[13px] text-ink-500">
        Finishing the connection…{' '}
        <a href={destination} className="text-brand-600 font-medium hover:underline">
          Return now
        </a>
      </p>
    </div>
  );
}
