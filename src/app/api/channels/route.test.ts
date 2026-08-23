import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOauthToken: vi.fn(),
  channel: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAuth: h.requireAuth,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: { users: { getUserOauthAccessToken: h.getOauthToken } },
}));

vi.mock('@/lib/db', () => ({
  prisma: { channel: h.channel },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: h.rateLimit,
  userKey: (a: string, b: string) => `${a}:${b}`,
  tooManyRequests: (l: { retryAfterMs?: number }) => ({
    body: { error: 'Too many requests', retryAfterMs: l?.retryAfterMs ?? 0 },
    init: { status: 429 },
  }),
  LIMITS: { CHANNELS: { limit: 20, windowMs: 3_600_000 }, READ: { limit: 100, windowMs: 60_000 } },
}));

import { GET, POST, DELETE } from './route';

const AUTH = {
  clerkId: 'clerk_test',
  email: 'qa@test.dev',
  dbUserId: 'user_test',
  plan: 'free',
  role: 'MEMBER' as const,
  auditsUsed: 0,
  auditsLimit: 1,
  canAnalyze: true,
};

const YT_BODY = {
  items: [
    {
      id: 'UCabc',
      snippet: { title: 'QA Channel', customUrl: '@qachannel' },
      statistics: { subscriberCount: '42', videoCount: '7', viewCount: '900' },
    },
  ],
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function postRequest(platform: string) {
  return new Request('http://localhost/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue(AUTH);
  h.rateLimit.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/channels', () => {
  it('answers 428 connectRequired when the platform account is not linked', async () => {
    h.getOauthToken.mockResolvedValue(null);

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.connectRequired).toBe(true);
    expect(body.provider).toBe('oauth_google');
    expect(h.channel.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform', async () => {
    const res = await POST(postRequest('INSTAGRAM'));
    expect(res.status).toBe(400);
  });

  it('creates a row from the platform snapshot when the channel is new', async () => {
    h.getOauthToken.mockResolvedValue([{ token: 'tok' }]);
    h.channel.findFirst.mockResolvedValue(null);
    h.channel.create.mockResolvedValue({ id: 'c1', platform: 'YOUTUBE', name: 'QA Channel' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(YT_BODY, 200)),
    );

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.channel.id).toBe('c1');
    expect(h.channel.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_test',
        platform: 'YOUTUBE',
        channelId: 'UCabc',
        name: 'QA Channel',
        url: 'https://www.youtube.com/@qachannel',
        avatarUrl: null,
        subscribers: 42,
        videosCount: 7,
        viewsCount: 900,
      },
    });
  });

  it('updates the row when the channel already belongs to this user', async () => {
    h.getOauthToken.mockResolvedValue([{ token: 'tok' }]);
    h.channel.findFirst.mockResolvedValue({ id: 'c1', userId: 'user_test' });
    h.channel.update.mockResolvedValue({ id: 'c1', name: 'QA Channel' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(YT_BODY, 200)));

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(200);
    expect(h.channel.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: expect.anything() });
    expect(h.channel.create).not.toHaveBeenCalled();
  });

  it('refuses a channel already connected to another account', async () => {
    h.getOauthToken.mockResolvedValue([{ token: 'tok' }]);
    h.channel.findFirst.mockResolvedValue({ id: 'c1', userId: 'someone_else' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(YT_BODY, 200)));

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(409);
    expect(h.channel.update).not.toHaveBeenCalled();
    expect(h.channel.create).not.toHaveBeenCalled();
  });

  it('answers 502 when the platform responds with an error status', async () => {
    h.getOauthToken.mockResolvedValue([{ token: 'tok' }]);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 401 } }, 401)));

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('YouTube rejected the request');
  });

  it('answers 502 when the platform call itself throws', async () => {
    h.getOauthToken.mockResolvedValue([{ token: 'tok' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const res = await POST(postRequest('YOUTUBE'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('did not respond in time');
  });
});

describe('GET /api/channels', () => {
  it('returns the user rows with a bounded field list', async () => {
    h.channel.findMany.mockResolvedValue([
      { id: 'c1', platform: 'YOUTUBE', channelId: 'UCabc', name: 'QA Channel' },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channels).toHaveLength(1);
    const select = h.channel.findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty('avatarUrl');
    expect(select).toHaveProperty('id');
  });
});

describe('DELETE /api/channels', () => {
  it('deletes only rows owned by the caller', async () => {
    h.channel.deleteMany.mockResolvedValue({ count: 1 });

    const res = await DELETE(
      new Request('http://localhost/api/channels?id=clwmytestch1', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    expect(h.channel.deleteMany).toHaveBeenCalledWith({
      where: { id: 'clwmytestch1', userId: 'user_test' },
    });
  });

  it('answers 404 when nothing was deleted (not owned, or unknown id)', async () => {
    h.channel.deleteMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(
      new Request('http://localhost/api/channels?id=clwotheruserx', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('rejects a malformed id', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/channels?id=../../etc', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
  });
});
