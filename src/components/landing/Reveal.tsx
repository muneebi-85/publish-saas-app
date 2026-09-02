'use client';

/**
 * Dismissal primitive for the landing page.
 *
 * The scroll-reveal/count-up primitives that used to live here were never
 * consumed — the page arms its own `.reveal-element` observer in
 * LandingClient's mount effect. Only `useDismissable` is imported (by the nav
 * mega-menus, which open on hover but must also work from the keyboard).
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * Closes a floating panel on outside click, Escape, or a focus move that leaves
 * the wrapper.
 */
export function useDismissable<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T | null>(null);

  const onBlur = useCallback(
    (e: React.FocusEvent<T>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
    },
    [close],
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  return { ref, onBlur };
}
