/**
 * attachReferral: who gets paid, and when.
 *
 * The anti-farming contract under test: the REFEREE's +1 lands at attach
 * (their welcome audit), the REFERRER's +1 does NOT — it is paid by the review
 * worker once the referee completes a first real review. Attach-time payment
 * for both sides let a farmer mint unlimited audits from throwaway signups.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  referral: {
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: vi.fn(),
}));

vi.mock('./db', () => ({
  prisma: {
    referral: h.referral,
    user: h.user,
    $transaction: h.transaction,
  },
}));

import { attachReferral } from './referrals';

const REFERRER = { id: 'user_them', referralCode: 'AB2DEFGH' };
const REFEREE = 'user_me';

beforeEach(() => {
  vi.resetAllMocks();
  // Interactive-transaction passthrough: the tx body runs against the mocks.
  h.transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn({ user: h.user, referral: h.referral }),
  );
  h.referral.count.mockResolvedValue(1);
  h.user.update.mockResolvedValue({});
});

describe('attachReferral payment order', () => {
  it('credits the referee at attach and does NOT touch the referrer', async () => {
    h.referral.findUnique.mockResolvedValue(null); // no prior attach
    h.referral.create.mockResolvedValue({ referrerId: REFERRER.id, refereeId: REFEREE });
    // user.findUnique has two call shapes: the tx referrer-by-code lookup and
    // the post-commit credits-by-id read. Dispatch on the where-shape.
    h.user.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.referralCode !== undefined
        ? REFERRER
        : { referralCredits: 1 },
    );

    const result = await attachReferral('AB2DEFGH', REFEREE);
    expect(result.ok).toBe(true);

    // Exactly ONE user.update: the referee. The referrer's increment moved to
    // the review worker — paying it here is the farming hole.
    expect(h.user.update).toHaveBeenCalledTimes(1);
    expect(h.user.update).toHaveBeenCalledWith({
      where: { id: REFEREE },
      data: { referralCredits: { increment: 1 } },
    });
  });

  it('records the row with granted=true and a normalized code', async () => {
    h.referral.findUnique.mockResolvedValue(null);
    h.referral.create.mockResolvedValue({ referrerId: REFERRER.id, refereeId: REFEREE });
    h.user.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.referralCode !== undefined ? REFERRER : { referralCredits: 1 },
    );

    await attachReferral('ab2defgh', REFEREE); // lower-case input normalizes
    expect(h.referral.create).toHaveBeenCalledWith({
      data: {
        code: 'AB2DEFGH',
        referrerId: REFERRER.id,
        refereeId: REFEREE,
        granted: true,
      },
      select: { referrerId: true, refereeId: true },
    });
  });

  it('rejects an unknown code', async () => {
    h.referral.findUnique.mockResolvedValue(null);
    h.user.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.referralCode !== undefined ? null : { referralCredits: 0 },
    );

    const result = await attachReferral('ZZZZ9999', REFEREE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not match an account/);
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('rejects self-referral', async () => {
    h.referral.findUnique.mockResolvedValue(null);
    h.user.findUnique.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        args.where.referralCode !== undefined ? { ...REFERRER, id: REFEREE } : { referralCredits: 0 },
    );

    const result = await attachReferral('AB2DEFGH', REFEREE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot refer yourself/i);
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed code before any query', async () => {
    const result = await attachReferral('!!!', REFEREE);
    expect(result.ok).toBe(false);
    expect(h.referral.findUnique).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-attached account', async () => {
    h.referral.findUnique.mockResolvedValue({
      referrerId: REFERRER.id,
      refereeId: REFEREE,
    });
    h.user.findUnique.mockResolvedValue({ referralCredits: 2 });
    h.referral.count.mockResolvedValue(3);

    const result = await attachReferral('AB2DEFGH', REFEREE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credits).toBe(2);
      expect(result.signups).toBe(3);
    }
    // No second payment of either side.
    expect(h.user.update).not.toHaveBeenCalled();
    expect(h.referral.create).not.toHaveBeenCalled();
  });
});

describe('attachReferral failure classification', () => {
  it('marks an infrastructure failure retryable so the route answers 503', async () => {
    h.referral.findUnique.mockResolvedValue(null);
    h.user.findUnique.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        args.where.referralCode !== undefined ? REFERRER : { referralCredits: 0 },
    );
    // A DB outage inside the attach transaction — not a client error.
    h.referral.create.mockRejectedValue(Object.assign(new Error('connection reset'), { code: 'P1001' }));

    const result = await attachReferral('AB2DEFGH', REFEREE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.error).toMatch(/could not be attached/i);
    }
  });

  it('does NOT mark user errors retryable (route answers 400)', async () => {
    h.referral.findUnique.mockResolvedValue(null);
    h.user.findUnique.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        args.where.referralCode !== undefined ? { ...REFERRER, id: REFEREE } : { referralCredits: 0 },
    );

    const result = await attachReferral('AB2DEFGH', REFEREE); // self-referral
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBeUndefined();
  });
});
