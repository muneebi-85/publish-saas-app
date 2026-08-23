/**
 * Client-side crash reporting.
 *
 * Shared by the error boundaries (`global-error.tsx`, `(dashboard)/error.tsx`)
 * so both report identically to `/api/telemetry`.
 *
 * Two deliberate choices:
 *   - `sendBeacon` first. A crashed page is often seconds from unload, which
 *     cancels in-flight `fetch` calls; a beacon is queued by the browser and
 *     survives it. `fetch(..., { keepalive: true })` is the fallback for the
 *     environments that disable beacons (Safari private mode, some extensions).
 *   - Strictly best-effort. Reporting a crash must never throw and mask the
 *     original error, so every failure path is swallowed.
 */

export function reportClientError(
  error: Error & { digest?: string },
  context: string,
): void {
  // Always log locally — this is what a developer sees in the browser console.
  console.error(`[${context}]`, error);

  try {
    const payload = JSON.stringify({
      message: error.message || `Unknown error (${context})`,
      digest: error.digest ?? null,
      stack: error.stack ?? null,
      url: window.location.href,
    });

    const sent =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/telemetry', new Blob([payload], { type: 'application/json' }));

    if (!sent) {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Swallowed on purpose — see the note above.
  }
}
