import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  report: {
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
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
};

const MINE = {
  id: 'clwmine0000000000000000001',
  title: 'My video',
  overallScore: 82,
  targetPlatform: 'YouTube',
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
};

/**
 * The route issues two analysisReport.findFirst calls — target (gated on
 * `sharedAt`) then mine (ownership-scoped on `user.clerkId`). Dispatch on the
 * where-shape so each mock answers for the query it belongs to, and so a
 * regression that drops either scoping fails here instead of in production.
 */
function mockReports(target: unknown, mine: unknown) {
  h.report.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    if (args.where.sharedAt !== undefined) return target;
    return mine;
  });
}

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
  mockReports(TARGET, MINE);
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
    mockReports({ ...TARGET, userId: 'user_me' }, MINE);

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(400);
    expect(h.challenge.create).not.toHaveBeenCalled();
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('404s when the target report does not exist', async () => {
    mockReports(null, MINE);

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(404);
  });

  it('404s when the target score card was never published', async () => {
    // The sharedAt gate on the target query is the opt-in the challenge loop
    // runs on: an id alone (leaked, guessed, revoked) must not mint credits.
    const calls: { where: Record<string, unknown> }[] = [];
    h.report.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      calls.push(args);
      // The target query exists and gates on sharedAt — assert it below.
      return args.where.sharedAt !== undefined ? null : MINE;
    });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(404);
    expect(calls.some((c) => c.where.sharedAt !== undefined)).toBe(true);
    expect(h.challenge.create).not.toHaveBeenCalled();
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('404s when the accepter report is not owned by the caller', async () => {
    mockReports(TARGET, null);

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(404);
    expect(h.challenge.create).not.toHaveBeenCalled();
  });

  it('rejects an accept with a report that predates the target (farming guard)', async () => {
    // The whole point of the challenge is "I can beat this": reusing a stale
    // report let two colluding accounts mint challenger credits forever.
    mockReports(TARGET, { ...MINE, createdAt: TARGET.createdAt });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(400);
    expect(h.challenge.create).not.toHaveBeenCalled();
    expect(h.user.update).not.toHaveBeenCalled();
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
    expect(h.report.findFirst).not.toHaveBeenCalled();
  });

  it('answers 429 when rate-limited', async () => {
    h.rateLimit.mockResolvedValue({ success: false, remaining: 0, limit: 20, resetAt: Date.now() + 5000 });

    const res = await POST(acceptRequest(TARGET.id, MINE.id));
    expect(res.status).toBe(429);
    expect(h.challenge.create).not.toHaveBeenCalled();
  });
});
