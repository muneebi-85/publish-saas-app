import { describe, it, expect } from 'vitest';
import { isStaleJob, isClaimableJob, RUNNING_STALE_MS, QUEUED_STALE_MS } from './sweep';

const NOW = 1_800_000_000_000;

const row = (over: Partial<Parameters<typeof isStaleJob>[0]> = {}): Parameters<typeof isStaleJob>[0] => ({
  status: 'RUNNING',
  quotaCharged: true,
  createdAt: NOW - 60_000,
  startedAt: NOW - 60_000,
  ...over,
});

describe('isStaleJob', () => {
  it('flags a RUNNING row past the 15-minute horizon', () => {
    expect(isStaleJob(row({ startedAt: NOW - RUNNING_STALE_MS - 1 }), NOW)).toBe(true);
  });

  it('keeps a RUNNING row inside the horizon', () => {
    expect(isStaleJob(row({ startedAt: NOW - RUNNING_STALE_MS + 1 }), NOW)).toBe(false);
  });

  it('a RUNNING row without startedAt falls back to createdAt (not immortal)', () => {
    const legacy = row({ startedAt: null, createdAt: NOW - RUNNING_STALE_MS - 1 });
    expect(isStaleJob(legacy, NOW)).toBe(true);
  });

  it('flags a QUEUED row past the 30-minute horizon', () => {
    expect(isStaleJob(row({ status: 'QUEUED', createdAt: NOW - QUEUED_STALE_MS - 1, startedAt: null }), NOW)).toBe(true);
    expect(isStaleJob(row({ status: 'QUEUED', createdAt: NOW - QUEUED_STALE_MS + 1, startedAt: null }), NOW)).toBe(false);
  });

  it('flags a FAILED row that still holds a charge — the stranded resume arm', () => {
    // Regression: the old scan only looked at QUEUED/RUNNING, so a job whose
    // worker failed non-terminally (FAILED, quotaCharged kept for the retry)
    // and whose QStash redelivery never arrived was invisible to the sweep
    // forever, and never pruned (finishedAt stays null on that path).
    expect(isStaleJob(row({ status: 'FAILED', createdAt: NOW - QUEUED_STALE_MS - 1, updatedAt: NOW - QUEUED_STALE_MS - 1 }), NOW)).toBe(true);
    // recent FAILED+charged rows may still be retried by a live delivery
    expect(isStaleJob(row({ status: 'FAILED', createdAt: NOW - 60_000, updatedAt: NOW - 60_000 }), NOW)).toBe(false);
  });

  it('anchors FAILED staleness on updatedAt, not createdAt — a recent retry attempt on an old row stays live', () => {
    // An old job whose LATEST failure was minutes ago still has a redelivery
    // coming; sweeping it at that point would refund a job that is about to
    // complete.
    expect(
      isStaleJob(row({
        status: 'FAILED',
        createdAt: NOW - QUEUED_STALE_MS * 5, // old row…
        updatedAt: NOW - 60_000,              // …but failed one attempt a minute ago
      }), NOW),
    ).toBe(false);
  });

  it('never flags a FAILED row that was already refunded', () => {
    expect(isStaleJob(row({ status: 'FAILED', quotaCharged: false, createdAt: NOW - QUEUED_STALE_MS * 5 }), NOW)).toBe(false);
  });

  it('never flags COMPLETED rows (they keep quotaCharged by design)', () => {
    expect(isStaleJob(row({ status: 'COMPLETED', createdAt: NOW - QUEUED_STALE_MS * 5 }), NOW)).toBe(false);
  });
});

describe('isClaimableJob', () => {
  it('claims any charged, not-yet-completed row', () => {
    for (const status of ['QUEUED', 'RUNNING', 'FAILED'] as const) {
      expect(isClaimableJob(row({ status }))).toBe(true);
    }
  });

  it('never claims a COMPLETED row even though it keeps the charge', () => {
    // The debit was consumed by a real report — refunding it would hand the
    // creator a free review after the fact.
    expect(isClaimableJob(row({ status: 'COMPLETED' }))).toBe(false);
  });

  it('never claims an already-refunded row', () => {
    expect(isClaimableJob(row({ quotaCharged: false }))).toBe(false);
  });
});
