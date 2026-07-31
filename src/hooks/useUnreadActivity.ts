'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Unread activity count for the header bell.
 *
 * Deliberately not polled on a timer: a background interval on every dashboard
 * page would multiply database reads for a number nobody is watching. It loads
 * once, then refreshes when the tab regains focus — which is exactly when a
 * creator comes back to check whether their review finished.
 *
 * Returns 0 while loading and on any failure, so a broken count can never
 * fabricate a badge.
 */
export function useUnreadActivity(enabled = true): number {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/notifications', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: unknown };
      const n = Number(data.unread);
      setUnread(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    } catch {
      // Leave the previous value alone; never invent one.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, load]);

  return unread;
}
