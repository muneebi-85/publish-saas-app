'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-error';

/**
 * Route-level error boundary — catches errors inside the dashboard tree so
 * a broken subcomponent doesn't blow up the whole shell.
 */
export default function DashboardError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, 'dashboard error'); }, [error]);

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-50/40 p-8 text-center animate-enter">
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h2 className="font-display text-xl font-semibold text-ink-950 mt-5">
        This section couldn&apos;t load.
      </h2>
      <p className="text-sm text-ink-600 mt-2 max-w-md mx-auto">
        Nothing was lost. The rest of your workspace is unaffected — try again, or open a different page.
      </p>
      {error.digest && (
        <div className="mt-4 inline-block px-3 py-1.5 rounded-md bg-amber-50 border border-amber-500/20 text-[11px] font-mono text-ink-600">
          Ref: {error.digest}
        </div>
      )}
      <div className="mt-6">
        <Button onClick={reset} leftIcon={<RotateCw className="w-3.5 h-3.5" />}>Retry</Button>
      </div>
    </div>
  );
}
