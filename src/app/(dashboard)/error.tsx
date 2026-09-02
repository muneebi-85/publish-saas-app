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
    <div className="rounded-xl border border-crimson-200 bg-crimson-50 p-8 text-center animate-enter">
      <div className="w-11 h-11 rounded-xl bg-crimson-100 text-crimson-700 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h2 className="font-display text-[20px] leading-[1.3] font-semibold tracking-[-0.02em] text-ink-900 mt-5">
        This section couldn&apos;t load.
      </h2>
      <p className="text-[13px] leading-relaxed text-ink-600 mt-2 max-w-sm mx-auto">
        Nothing was lost. The rest of your workspace is unaffected — try again, or open a different page.
      </p>
      {error.digest && (
        <div className="mt-4 inline-block px-2.5 py-1 rounded-md bg-surface-panel border border-crimson-200 text-[11px] font-mono text-ink-600">
          Ref: {error.digest}
        </div>
      )}
      <div className="mt-6">
        <Button onClick={reset} leftIcon={<RotateCw className="w-3.5 h-3.5" />}>Retry</Button>
      </div>
    </div>
  );
}
