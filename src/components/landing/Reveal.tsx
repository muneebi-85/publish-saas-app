'use client';

/**
 * Motion primitives for the landing page.
 *
 * Two rules hold the whole file together:
 *
 * 1. Motion is an enhancement, never load-bearing. The hidden state is applied
 *    from JS after mount (`lp-anim`), so a visitor with JS off — or a crawler —
 *    gets the page fully painted rather than a column of invisible sections.
 * 2. Reveals fire once. Re-animating every time a section scrolls back into
 *    view reads as a glitch, not as polish, so the observer disconnects on the
 *    first intersection.
 *
 * `prefers-reduced-motion` short-circuits both: the arming effect returns early
 * and the elements simply stay visible.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Arm before paint so the first frame is already in the hidden state. Doing it
 * in a passive effect would paint the content, then hide it, then fade it back
 * in — a visible flash on everything above the fold.
 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function wantsMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof IntersectionObserver !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Watches an element and reports the first time it enters the viewport.
 *
 * `armed` is what callers put in `className`: it carries `lp-anim` (opt into
 * the hidden state) and then `lp-in` (play). When motion is unwanted both stay
 * empty, which leaves the CSS at its visible default.
 */
function useFirstInView<T extends HTMLElement>(rootMargin = '0px 0px -8% 0px') {
  const ref = useRef<T | null>(null);
  const [phase, setPhase] = useState<'off' | 'armed' | 'in'>('off');

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !wantsMotion()) return;

    setPhase('armed');

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase('in');
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, phase };
}

/**
 * Section-level scroll reveal.
 *
 * Spread the returned `className` onto the section and mark the children that
 * should stagger in with `lp-rv`, giving each one `style={{ '--i': index }}`.
 * Keeping the state on the parent means one observer per section instead of
 * one per card.
 */
export function useReveal<T extends HTMLElement>(rootMargin?: string) {
  const { ref, phase } = useFirstInView<T>(rootMargin);
  return {
    ref,
    className: phase === 'off' ? '' : phase === 'armed' ? 'lp-anim' : 'lp-anim lp-in',
  };
}

/** Formats with grouping separators but without locale surprises in SSR. */
function format(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Counts from zero to `to` the first time it scrolls into view.
 *
 * The initial render — and every reduced-motion render — shows the final
 * value, so the number is never wrong, only sometimes still climbing.
 */
export function CountUp({
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1400,
  className,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const { ref, phase } = useFirstInView<HTMLSpanElement>('0px');
  const [value, setValue] = useState(to);

  // Drop to zero only once motion is confirmed, so the static render keeps the
  // real figure.
  useIsoLayoutEffect(() => {
    if (phase === 'armed') setValue(0);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'in') return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast out of the gate, long settle. Reads as "counting".
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(to * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(value, decimals)}
      {suffix}
    </span>
  );
}

/**
 * Closes a floating panel on outside click, Escape, or a focus move that leaves
 * the wrapper. Shared by the nav mega-menus, which open on hover but must also
 * work from the keyboard.
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
