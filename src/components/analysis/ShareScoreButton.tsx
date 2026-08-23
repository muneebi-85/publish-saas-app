'use client';

import React, { useState } from 'react';
import { Share2, Check, Link2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { track } from '@/lib/analytics';

/**
 * Copies the public, shareable link for this report's score card.
 *
 * The link resolves to /share/[id], a public page that renders ONLY the score,
 * the title and the platform — no script, no fixes, no private data. Sharing is
 * explicitly opt-in: nothing is public until the creator copies this link and
 * posts it somewhere.
 */
export function ShareScoreButton({ reportId, reportTitle }: { reportId: string; reportTitle?: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/share/${reportId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be blocked (permissions, insecure context, headless).
      // Fall back to the legacy path so the button always does something.
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    void track('share_link_copied', { reportId });
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleShare}
      leftIcon={
        copied ? (
          <Check className="w-3.5 h-3.5 text-grass-700" strokeWidth={3} />
        ) : (
          <Share2 className="w-3.5 h-3.5" />
        )
      }
      aria-label={`Share the Publish Score for ${reportTitle ?? 'this report'}`}
      title="Copy the public score card link"
    >
      {copied ? 'Link copied' : 'Share score'}
    </Button>
  );
}

/** Small inline hint shown next to the share button. */
export function ShareScoreHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400">
      <Link2 className="w-3 h-3" />
      Only the score card is public — never your script or fixes.
    </span>
  );
}
