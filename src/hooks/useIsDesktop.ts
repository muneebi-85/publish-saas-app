'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewport is at least Tailwind's `md` breakpoint.
 *
 * The dashboard layout keeps its desktop chrome (Topbar) and mobile chrome
 * (MobileNav) BOTH mounted and CSS-hidden per viewport — the standard SSR
 * pattern, since the server cannot know the viewport. But CSS hiding does
 * not stop their effects, so each one's data hooks fired on every viewport:
 * two /api/notifications fetches per dashboard page on every device. Gating
 * the fetches on this hook keeps the render tree identical while making only
 * the chrome that is actually visible ask for data.
 *
 * The initial value is false so the server and the first client render agree;
 * the effect syncs the real value immediately after mount (before any fetch
 * the gated hooks would fire, so no request is wasted on the wrong viewport).
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isDesktop;
}
