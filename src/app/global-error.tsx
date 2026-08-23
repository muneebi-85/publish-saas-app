'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { reportClientError } from '@/lib/report-error';

export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  // Forwarded to /api/telemetry so the copy below ("already been reported") is
  // true rather than reassuring.
  useEffect(() => { reportClientError(error, 'client error'); }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-canvas text-ink-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mt-6">
            Something broke on our end.
          </h1>
          <p className="text-sm text-ink-500 mt-3 leading-relaxed">
            Your work is safe — nothing was lost. This was our fault, and it&apos;s already been reported.
          </p>
          {error.digest && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-ink-100 text-[11px] font-mono text-ink-600">
              Ref: {error.digest}
            </div>
          )}
          <div className="mt-8 flex items-center justify-center gap-2">
            <Link href="/dashboard">
              <Button variant="secondary" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>Dashboard</Button>
            </Link>
            <Button onClick={reset} leftIcon={<RotateCw className="w-3.5 h-3.5" />}>Try again</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
