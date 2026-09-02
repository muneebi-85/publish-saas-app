'use client';

import React from 'react';

/**
 * A /share/[id] link that publishes the score card before following it.
 *
 * The share page 404s until the creator stamps `sharedAt` (POST /api/share/[id]).
 * The reports and dashboard surfaces link to cards that nothing has published —
 * the creator clicking their own link landed on a 404. The POST is idempotent
 * and owner-checked server-side, so firing it on every click is safe; if it
 * fails (offline), we still navigate — the retry works, and sitting silently
 * would look more broken than the share page itself.
 */
export function PublishShareLink({
  reportId,
  className,
  children,
}: {
  reportId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`/share/${reportId}`}
      className={className}
      onClick={(e) => {
        // One publish per click, idempotent and owner-checked server-side.
        // Modified clicks (ctrl/shift/alt) keep the browser's native anchor
        // behavior and middle-click fires no click at all — the publish still
        // fires here so an "open in new tab" of an unpublished card is live by
        // the time the tab renders, instead of the 404 it would otherwise get.
        const publish = fetch(`/api/share/${reportId}`, { method: 'POST' }).catch(
          () => undefined,
        );
        // Plain left click: hold navigation until the stamp lands so the user
        // never sees the pre-publication 404 themselves.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        void publish.then(() => {
          window.location.href = `/share/${reportId}`;
        });
      }}
    >
      {children}
    </a>
  );
}
