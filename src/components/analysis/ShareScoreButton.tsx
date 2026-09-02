'use client';

import React, { useState } from 'react';
import { Share2, Check, Link2Off } from 'lucide-react';
import { Button } from '../ui/Button';
import { track } from '@/lib/analytics';

/**
 * Publishes this report's public score card and copies the link — or revokes
 * it, once shared.
 *
 * The link resolves to /share/[id], a public page that renders ONLY the score,
 * the title and the platform — no script, no fixes, no private data. Sharing
 * is genuinely opt-in: the page 404s until this button stamps `sharedAt` via
 * POST /api/share/[id]. Revoking (DELETE) clears the stamp and immediately
 * un-publishes every public surface — page, badge, OG image, community board.
 * Without it, "opt-in" was one-way: a creator who shared once had no way back.
 *
 * The initial state comes from the server-rendered `shared` prop; every click
 * flips it locally so the button always tells the truth about the current
 * request's outcome, and the server keeps the stamp authoritative either way.
 */
export function ShareScoreButton({
  reportId,
  reportTitle,
  shared = false,
}: {
  reportId: string;
  reportTitle?: string;
  /** Server-known publication state — true when `sharedAt` is set on the row. */
  shared?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [isShared, setIsShared] = useState(shared);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const handleShare = async () => {
    setBusy(true);
    setShareError(null);
    try {
      // Opt-in first, copy second — and only on success. The previous flow
      // swallowed a failed stamp and copied anyway, handing the creator a link
      // that 404s for every recipient. Idempotent server-side, so re-clicking
      // just re-copies.
      const res = await fetch(`/api/share/${reportId}`, { method: 'POST' }).catch(
        () => undefined,
      );
      if (!res || !res.ok) {
        setIsShared(false);
        setShareError('Could not publish the score card — the link was not copied. Try again.');
        window.setTimeout(() => setShareError(null), 5000);
        return;
      }
      setIsShared(true);

      const url = `${window.location.origin}/share/${reportId}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard can be blocked (permissions, insecure context, headless).
        // Same guarded fallback ReportActions uses — an unguarded
        // document.execCommand failure here would leave a published card and
        // no copied link with zero feedback.
        try {
          const textarea = document.createElement('textarea');
          textarea.value = url;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        } catch {
          // Both paths refused. The card is published (above); copying by hand
          // from the share page is the remaining path.
        }
      }
      setCopied(true);
      void track('share_link_copied', { reportId });
      window.setTimeout(() => setCopied(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/share/${reportId}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
      // 200 means the stamp is gone and every public surface now 404s. A
      // failed/unreachable DELETE keeps the button at "Unshare" so the creator
      // can try again rather than believe a revoke that never landed.
      if (res && res.ok) {
        setIsShared(false);
        void track('share_revoked', { reportId });
      }
    } finally {
      setBusy(false);
    }
  };

  const isPublic = isShared;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={isPublic ? handleRevoke : handleShare}
      disabled={busy}
      leftIcon={
        copied ? (
          <Check className="w-3.5 h-3.5 text-grass-700" strokeWidth={3} />
        ) : isPublic ? (
          <Link2Off className="w-3.5 h-3.5" />
        ) : (
          <Share2 className="w-3.5 h-3.5" />
        )
      }
      aria-label={
        isPublic
          ? `Unpublish the public score card for ${reportTitle ?? 'this report'}`
          : `Share the Publish Score for ${reportTitle ?? 'this report'}`
      }
      title={
        isPublic
          ? 'Un-publish the public score card (the page, badge and embed stop resolving)'
          : 'Publish the public score card and copy its link'
      }
    >
      {copied ? 'Link copied' : busy ? (isPublic ? 'Unpublishing…' : 'Publishing…') : isPublic ? 'Unshare' : 'Share score'}
      {shareError && (
        <span className="text-[11px] font-medium text-crimson-700 ml-2">{shareError}</span>
      )}
    </Button>
  );
}
