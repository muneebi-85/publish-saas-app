import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  attachReferral: vi.fn(),
  getReferralStatus: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/referrals', () => ({
  attachReferral: h.attachReferral,
  getReferralStatus: h.getReferralStatus,
}));
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: h.rateLimit,
  userKey: (a: string, b: string) => `${a}:${b}`,
  tooManyRequests: () => ({ body: { error: 'Too many requests' }, init: { status: 429 } }),
  LIMITS: { READ: { limit: 240, windowMs: 60_000 }, CHANNELS: { limit: 20, windowMs: 3_600_000 } },
}));

import { GET, POST } from './route';

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

function postRequest(code: string) {
  return new Request('http://localhost/api/referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue(AUTH);
  h.rateLimit.mockResolvedValue({ success: true });
});

describe('GET /api/referral', () => {
  it('returns the caller status (code, credits, signups)', async () => {
    h.getReferralStatus.mockResolvedValue({
      code: 'AB2DEFGH',
      credits: 2,
      signups: [{ name: 'Kim', at: new Date('2026-08-01'), rewarded: true }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('AB2DEFGH');
    expect(body.credits).toBe(2);
    expect(h.getReferralStatus).toHaveBeenCalledWith('user_me');
  });
});

describe('POST /api/referral', () => {
  it('attaches a valid code and returns the new credit count', async () => {
    h.attachReferral.mockResolvedValue({ ok: true, credits: 1, signups: 1 });

    const res = await POST(postRequest('AB2DEFGH'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(1);
    expect(h.attachReferral).toHaveBeenCalledWith('AB2DEFGH', 'user_me');
  });

  it('surfaces a rejected code as a 400 with the library error', async () => {
    h.attachReferral.mockResolvedValue({ ok: false, error: 'You cannot refer yourself.' });

    const res = await POST(postRequest('AB2DEFGH'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('You cannot refer yourself.');
  });

  it('rejects an empty code before calling the library', async () => {
    const res = await POST(postRequest('   '));
    expect(res.status).toBe(400);
    expect(h.attachReferral).not.toHaveBeenCalled();
  });
});
