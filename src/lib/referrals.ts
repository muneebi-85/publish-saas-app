/**
 * Referral program — the growth loop the audit flagged as the #1 lever.
 *
 * Every user gets a unique referral code. When a new account attaches a code,
 * BOTH sides earn one free audit ("1 free audit per referral", credited as
 * `referralCredits`, spent once the plan's monthly allowance is full — that is
 * what makes them extend the wall). The credit
 * is granted inside one transaction and guarded by a `granted` flag + a unique
 * referee constraint, so a retried attach can never double-pay.
 *
 * Codes deliberately avoid lookalike characters (0/O, 1/l/I) and are uppercase
 * so they survive being retyped in a DMs.
 */
import { prisma } from './db';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReferralCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Ensure the user has a referral code, creating one on first visit. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  // Collisions are possible (8 chars from a 31-char alphabet ≈ 50-bit space),
  // so retry rather than relying on the unique constraint failing gracefully.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode as string;
    } catch (e) {
      // P2002 = unique constraint hit; try a fresh code.
      if ((e as { code?: string }).code === 'P2002') continue;
      throw e;
    }
  }
  throw new Error('Could not allocate a unique referral code.');
}

export interface ReferralStatus {
  code: string;
  credits: number;
  signups: { name: string | null; at: Date; rewarded: boolean }[];
}

/** Status for the Settings → Referrals panel. */
export async function getReferralStatus(userId: string): Promise<ReferralStatus> {
  const code = await ensureReferralCode(userId);
  const [user, referrals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCredits: true },
    }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        granted: true,
        referrerCreditedAt: true,
        createdAt: true,
        referee: { select: { name: true } },
      },
    }),
  ]);

  return {
    code,
    credits: user?.referralCredits ?? 0,
    signups: referrals.map((r) => ({
      name: r.referee.name,
      at: r.createdAt,
      // The referrer's side of the reward: paid when the signup completes
      // their first review, not at signup. "Pending" is the honest state
      // until then.
      rewarded: r.referrerCreditedAt !== null,
    })),
  };
}

export type AttachResult =
  | { ok: true; credits: number; signups: number }
  | { ok: false; error: string; retryable?: boolean };

/**
 * Attach a referral code to the currently-logged-in user.
 *
 * Safe against abuse:
 *  - self-referral (your own code) is rejected.
 *  - one account can only be credited once (unique `refereeId`).
 *  - the referrer must actually exist.
 * Idempotent: a second attach with a different code for the same account returns
 * ok with the already-committed state rather than minting new credits.
 *
 * WHO GETS PAID WHEN
 * The REFEREE's +1 lands here — the welcome audit they came to use. The
 * REFERRER's +1 is NOT paid at attach: it lands when the referee completes
 * their first real review (see the review worker), because paying it at
 * signup let a farmer mint unlimited audits from throwaway accounts.
 */
export async function attachReferral(
  code: string,
  refereeDbUserId: string,
): Promise<AttachResult> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6,16}$/.test(normalized)) {
    return { ok: false, error: 'That referral code does not look valid.' };
  }

  const existing = await prisma.referral.findUnique({
    where: { refereeId: refereeDbUserId },
  });
  if (existing) {
    const [u, n] = await Promise.all([
      prisma.user.findUnique({ where: { id: refereeDbUserId }, select: { referralCredits: true } }),
      prisma.referral.count({ where: { referrerId: existing.referrerId } }),
    ]);
    return { ok: true, credits: u?.referralCredits ?? 0, signups: n };
  }

  try {
    const committed = await prisma.$transaction(async (tx) => {
      const referrer = await tx.user.findUnique({ where: { referralCode: normalized } });
      if (!referrer) throw new Error('not_found');
      if (referrer.id === refereeDbUserId) throw new Error('self_referral');

      const referral = await tx.referral.create({
        data: {
          code: normalized,
          referrerId: referrer.id,
          refereeId: refereeDbUserId,
          granted: true,
        },
        select: { referrerId: true, refereeId: true },
      });

      // Only the referee is paid at attach (their welcome audit). The
      // referrer's credit waits for the referee's first completed review —
      // see the header comment and the review worker.
      await tx.user.update({
        where: { id: refereeDbUserId },
        data: { referralCredits: { increment: 1 } },
      });

      return referral;
    });

    const [u, n] = await Promise.all([
      prisma.user.findUnique({ where: { id: committed.refereeId }, select: { referralCredits: true } }),
      prisma.referral.count({ where: { referrerId: committed.referrerId } }),
    ]);
    return { ok: true, credits: u?.referralCredits ?? 0, signups: n };
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'not_found') {
      return { ok: false, error: 'That referral code does not match an account.' };
    }
    if (message === 'self_referral') {
      return { ok: false, error: 'You cannot refer yourself.' };
    }
    // Unique refereeId violation from a concurrent attach — treat as done.
    if ((err as { code?: string }).code === 'P2002') return { ok: false, error: 'Already claimed.' };
    console.error('[attachReferral] failed:', err);
    // `retryable` distinguishes a server fault (DB outage, constraint beyond
    // the referee) from a bad code: the route must answer 503 for this, not
    // 400, or a transient failure tells the user their input was wrong.
    return { ok: false, error: 'The referral could not be attached. Please try again.', retryable: true };
  }
}