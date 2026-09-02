/**
 * Route-level loading skeleton shown while data or async server components resolve.
 *
 * Skeletons only — the spinner + "Loading…" line used to sit above them, which
 * reads as two competing progress signals. The grid matches the dashboard's
 * real six-tile KPI strip so the swap-in doesn't reflow.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-4">
        <div className="h-6 w-1/3 rounded-md bg-ink-100 animate-pulse" />
        <div className="h-4 w-1/2 rounded-md bg-ink-100 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-ink-100 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-ink-100 animate-pulse" />
    </div>
  );
}
