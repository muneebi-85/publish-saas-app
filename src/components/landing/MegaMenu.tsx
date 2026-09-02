'use client';

/**
 * Nav mega-menus.
 *
 * The three carets in the header used to be decoration — they promised depth
 * behind Product / Solutions / Resources and then jumped to an anchor. These
 * panels make the promise real, and every entry below points at a section or
 * route that exists (verified against src/app). Nothing here links to a page
 * that has not shipped.
 *
 * Interaction: pointer opens on hover with a short close delay so a diagonal
 * mouse path between trigger and panel does not dismiss it; keyboard opens on
 * focus and closes on Escape or focus-out. `useDismissable` handles the outside
 * click. On touch, hover never fires, so the trigger is a real button that
 * toggles.
 */

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useDismissable } from './Reveal';

export interface MenuItem {
  label: string;
  desc: string;
  href: string;
  icon: React.FC;
}

export interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

export interface MenuFooter {
  label: string;
  href: string;
}

export function MegaMenu({
  label,
  groups,
  footer,
  width = 620,
}: {
  label: string;
  groups: MenuGroup[];
  footer?: MenuFooter;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  // 120ms of grace: long enough to cross the gap between the trigger and the
  // panel, short enough that it never feels stuck open.
  const scheduleClose = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  const { ref, onBlur } = useDismissable<HTMLDivElement>(open, close);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={() => { cancelClose(); setOpen(true); }}
      onPointerLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={onBlur}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-[5px] py-[6px] text-[16px] font-medium transition-colors ${
          open ? 'text-[var(--lp-ink)]' : 'text-[var(--lp-ink-2)] hover:text-[var(--lp-ink)]'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-brand/60 focus-visible:ring-offset-2 rounded-md`}
      >
        {label}
        <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <Caret />
        </span>
      </button>

      {open && (
        <div
          className="lp-pop absolute left-1/2 top-[calc(100%+11px)] z-50 -translate-x-1/2 overflow-hidden rounded-[16px] border border-[var(--lp-line)] bg-white shadow-[0_24px_60px_-20px_rgba(9,22,23,0.22),0_2px_6px_rgba(9,22,23,0.05)]"
          style={{ width }}
        >
          <div className={`grid gap-x-[8px] p-[14px] ${groups.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {groups.map((group) => (
              <div key={group.heading}>
                <p className="px-[10px] pb-[8px] pt-[6px] text-[10px] font-extrabold uppercase tracking-[0.13em] text-[var(--lp-ink-3)]">
                  {group.heading}
                </p>
                {group.items.map((item) => (
                  <MenuLink key={item.label} item={item} onNavigate={close} />
                ))}
              </div>
            ))}
          </div>

          {footer && (
            <Link
              href={footer.href}
              onClick={close}
              className="flex items-center justify-between border-t border-[var(--lp-line)] bg-[var(--lp-mint-soft)] px-[24px] py-[13px] text-[13px] font-bold text-[var(--lp-ink)] transition-colors hover:bg-[var(--lp-tint)]"
            >
              {footer.label}
              <span className="text-[var(--lp-purple)]"><ArrowRight /></span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ item, onNavigate }: { item: MenuItem; onNavigate: () => void }) {
  const { icon: Icon, label, desc, href } = item;
  // Anchors stay plain <a>: next/link would try to route them.
  const isAnchor = href.startsWith('#');
  const className =
    'group flex items-start gap-[11px] rounded-[11px] px-[10px] py-[9px] transition-colors hover:bg-[var(--lp-mint-soft)]';
  const body = (
    <>
      <span className="mt-[1px] inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--lp-tint)] text-[var(--lp-purple-d)]">
        <Icon />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold leading-[16px] tracking-[-0.015em] text-[var(--lp-ink)]">
          {label}
        </span>
        <span className="mt-[3px] block text-[12px] font-medium leading-[16px] text-[var(--lp-ink-3)]">
          {desc}
        </span>
      </span>
    </>
  );

  return isAnchor ? (
    <a href={href} onClick={onNavigate} className={className}>{body}</a>
  ) : (
    <Link href={href} onClick={onNavigate} className={className}>{body}</Link>
  );
}

function Caret() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 8 10 12.5 14.5 8" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.8 10h12M11 5.2 15.8 10 11 14.8" />
    </svg>
  );
}
