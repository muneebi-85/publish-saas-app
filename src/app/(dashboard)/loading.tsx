import { Loader2 } from 'lucide-react';

/**
 * Route-level loading skeleton shown while data or async server components resolve.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3 text-ink-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
      <div className="space-y-4">
        <div className="h-6 w-1/3 rounded-md bg-ink-100 animate-pulse" />
        <div className="h-4 w-1/2 rounded-md bg-ink-100 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-ink-100 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-ink-100 animate-pulse" />
    </div>
  );
}
