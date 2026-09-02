'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Link2, Check, LinkOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { track } from '@/lib/analytics';

/**
 * Row actions for a report: publish/copy the public score-card link, revoke
 * it once shared, or open the full analysis. Kept client-side because copying
 * requires the browser.
 *
 * The shareable URL is /share/[id] — the public score card — NOT the
 * /analysis/[id] dashboard route this row also links to. Copying the
 * authenticated URL used to hand every recipient a sign-in wall instead of
 * the share page the button promises.
 *
 * The score card 404s until the report is published (sharedAt stamped by
 * POST /api/share/[id]). Copying the link without publishing handed every
 * recipient a 404, so this button publishes first (idempotent server-side)
 * and copies second. Sharing is opt-in, and — via the Unshare action on an
 * already-published card — opted back out: DELETE clears the stamp and every
 * public surface (page, badge, OG image) stops resolving immediately.
 */
export function ReportActions({ reportId, shared = false }: { reportId: string; shared?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isShared, setIsShared] = useState(shared);

  const handleShare = async () => {
    setBusy(true);
    try {
      await fetch(`/api/share/${reportId}`, { method: 'POST' }).catch(() => undefined);
      setIsShared(true);

      const url = `${window.location.origin}/share/${reportId}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard can be blocked (permissions, insecure context). Fall back
        // to the legacy path so the button always does something.
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
          return; // Still unavailable — leave the label alone rather than lie.
        }
      }
      setCopied(true);
      void track('share_link_copied', { reportId, source: 'reports' });
      setTimeout(() => setCopied(false), 1800);
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
      // Only flip the label when the stamp is genuinely gone; a failed DELETE
      // leaves the card published and the button still saying Unshare.
      if (res && res.ok) {
        setIsShared(false);
        void track('share_revoked', { reportId, source: 'reports' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={isShared ? handleRevoke : handleShare}
        disabled={busy}
        leftIcon={
          copied ? (
            <Check className="w-3.5 h-3.5 text-brand-600" />
          ) : isShared ? (
            <LinkOff className="w-3.5 h-3.5" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )
        }
        aria-label={
          isShared
            ? 'Unpublish the public score-card link to this report'
            : 'Copy the public score-card link to this report'
        }
        title={
          isShared
            ? 'Un-publish the public score card (its link stops resolving)'
            : 'Publish the score card and copy its link'
        }
      >
        {copied ? 'Copied' : isShared ? 'Unshare' : 'Share'}
      </Button>
      <Link href={`/analysis/${reportId}`}>
        <Button variant="secondary" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" />}>
          Open
        </Button>
      </Link>
    </div>
  );
}
