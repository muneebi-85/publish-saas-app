'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Row actions for a report: open the full analysis, or copy a shareable link
 * to the clipboard. Kept client-side because copying requires the browser.
 */
export function ReportActions({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/analysis/${reportId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        leftIcon={copied ? <Check className="w-3.5 h-3.5 text-brand-600" /> : <Link2 className="w-3.5 h-3.5" />}
        aria-label="Copy shareable link to this report"
      >
        {copied ? 'Copied' : 'Share'}
      </Button>
      <Link href={`/analysis/${reportId}`}>
        <Button variant="secondary" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" />}>
          Open
        </Button>
      </Link>
    </div>
  );
}
