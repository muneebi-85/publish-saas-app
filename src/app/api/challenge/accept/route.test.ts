import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  report: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  challenge: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  transaction: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/db', () => ({
  prisma: {
    analysisReport: h.report,
    challenge: h.challenge,
    user: h.user,
    $transaction: h.transaction,
  },
}));
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: h.rateLimit,
  userKey: (a: string, b: string) => `${a}:${b}`,
  tooManyRequests: () => ({ body: { error: 'Too many requests' }, init: { status: 429 } }),
  LIMITS: { CHANNELS: { limit: 20, windowMs: 3_600_000 } },
}));

import { POST } from './route';

const AUTH = {
  clerkId: 'clerk_me',
  email: null,
  dbUserId: 'user_me',
  plan: 'free',
  role: 'MEMBER' as const,
  auditsUsed: 0,
  auditsLimit: 1,
  canAnalyze: true,
};

const TARGET = {
  id: 'clwtarget00000000000000001',
  title: 'Their video',
  overallScore: 74,
  targetPlatform: 'YouTube',
  userId: 'user_them',
};

const MINE = {
  id: 'clwmine0000000000000000001',
  title: 'My video',
  overallScore: 82,
  targetPlatform: 'YouTube',
};

function acceptRequest(targetReportId: string, myReportId: string) {
  return new Request('http://localhost/api/challenge/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetReportId, myReportId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue(AUTH);
  h.rateLimit.mockResolvedValue({ success: true });
  h.report.findUnique.mockResolvedValue(TARGET);
  h.report.findFirst.mockResolvedValue(MINE);
  h.challenge.findFirst.mockResolvedValue(null);
  h.challenge.update.mockResolvedValue({ id: 'clwchallenge000000000000001' });
  h.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    challenge: h.challenge,
    user: h.user,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/challenge/accept', () => {
  it('rejects a challenge against your own report', async () => {
    h.report.findUnique.mockResolvedValue({ ...TARGET, userId: 'user_me' });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(400);
    expect(h.challenge.create).not.toHaveBeenCalled();
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('404s when the target report does not exist', async () => {
    h.report.findUnique.mockResolvedValue(null);

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(404);
  });

  it('404s when the accepter report is not owned by the caller', async () => {
    h.report.findFirst.mockResolvedValue(null);

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(404);
    expect(h.challenge.create).not.toHaveBeenCalled();
  });

  it('records a fresh accept and credits the challenger once', async () => {
    const res = await POST(acceptRequest(TARGET.id, MINE.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('won');
    expect(body.creditsEarned).toBe(1);
    expect(h.challenge.create).toHaveBeenCalledWith({
      data: {
        reportId: TARGET.id,
        challengerId: 'user_them',
        acceptedByUserId: 'user_me',
        acceptedReportId: MINE.id,
        acceptedAt: expect.any(Date),
      },
    });
    expect(h.user.update).toHaveBeenCalledWith({
      where: { id: 'user_them' },
      data: { referralCredits: { increment: 1 } },
    });
  });

  it('is idempotent — a retried accept never credits twice', async () => {
    h.challenge.findFirst.mockResolvedValue({
      id: 'clwchallenge000000000000001',
      acceptedReportId: MINE.id,
      challengerId: 'user_them',
    });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    const body = await res.json();
    expect(body.creditsEarned).toBe(0);
    expect(body.already).toBe(true);
    expect(h.challenge.create).not.toHaveBeenCalled();
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('re-points an existing accept at a newer report without re-crediting', async () => {
    h.challenge.findFirst.mockResolvedValue({
      id: 'clwchallenge000000000000001',
      acceptedReportId: 'clwolder0000000000000001',
      challengerId: 'user_them',
    });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    const body = await res.json();
    expect(body.creditsEarned).toBe(0);
    expect(h.challenge.update).toHaveBeenCalledWith({
      where: { id: 'clwchallenge000000000000001' },
      data: { acceptedReportId: MINE.id, acceptedAt: expect.any(Date) },
    });
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('rejects malformed ids before touching the DB', async () => {
    const res = await POST(acceptRequest('not-a-cuid!', MINE.id));
    expect(res.status).toBe(400);
    expect(h.report.findUnique).not.toHaveBeenCalled();
  });

  it('answers 429 when rate-limited', async () => {
    h.rateLimit.mockResolvedValue({ success: false, remaining: 0, limit: 20, resetAt: Date.now() + 5000 });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(429);
    expect(h.challenge.create).not.toHaveBeenCalled();
  });
});
