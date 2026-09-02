/**
 * The reconcile sweep's job-row predicates, extracted as pure functions.
 *
 * These decide which rows may be closed out and refunded — money logic — and
 * the state machine has had four bugs in its life (a scan arm that never
 * matched, a status predicate that blocked the resume arm, a claim that let a
 * late worker overwrite a refund, and a stranded FAILED+charged row no arm
 * caught). The predicates are the part worth pinning in tests; the Prisma I/O
 * in the cron route is a thin translation of them.
 */

/** A RUNNING job past this is dead: the worker's own ceiling is 300s. */
export const RUNNING_STALE_MS = 15 * 60 * 1000;
/** A QUEUED job past this was never picked up — QStash gives up long before. */
export const QUEUED_STALE_MS = 30 * 60 * 1000;

/** The row states the sweep scans for. Stale is measured against now. */
export interface JobRowState {
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  quotaCharged: boolean;
  /** Millis since epoch. */
  createdAt: number;
  startedAt?: number | null;
  /** Millis since epoch; the last write (failure stamp) on FAILED rows. */
  updatedAt?: number;
}

export function isStaleJob(row: JobRowState, now: number): boolean {
  if (row.status === 'RUNNING') {
    // A RUNNING row without a startedAt (a pre-upgrade row) must not be
    // immortal: fall back to createdAt for the horizon.
    const anchor = row.startedAt ?? row.createdAt;
    return anchor < now - RUNNING_STALE_MS;
  }
  if (row.status === 'QUEUED') return row.createdAt < now - QUEUED_STALE_MS;
  // The resume arm: a non-terminal worker failure stamps FAILED but KEEPS the
  // charge, waiting for a QStash redelivery. If the redelivery never comes —
  // the "queues lose messages" case — the row is stranded: invisible to the
  // QUEUED/RUNNING arms and never pruned (the retention cutoff keys on
  // finishedAt, which this path deliberately leaves null). Without this arm
  // the creator's debit is gone forever.
  // Anchored on updatedAt (the failure stamp), NOT createdAt: an old row
  // whose latest attempt failed minutes ago still has a live redelivery
  // coming and must not be swept early.
  if (row.status === 'FAILED') {
    return row.quotaCharged && (row.updatedAt ?? row.createdAt) < now - QUEUED_STALE_MS;
  }
  return false;
}

/**
 * Whether the sweep may claim-and-refund the row. The charge flag alone is the
 * contention token: the worker's completion claim and this sweep's claim both
 * condition on it, so whichever commits first wins and the other sees zero
 * rows. Status is deliberately NOT in the claim — the row may legitimately
 * have moved QUEUED/RUNNING → FAILED between the scan and the claim (the
 * resume arm above), and gating on status would strand exactly those rows.
 * COMPLETED rows keep quotaCharged: true (the debit was consumed by a real
 * report), which is why the scan never surfaces them here.
 */
export function isClaimableJob(row: JobRowState): boolean {
  return row.quotaCharged && row.status !== 'COMPLETED';
}
