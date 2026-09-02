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
  transaction: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({
  requireAuth: h.requireAuth,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: { users: { getUserOauthAccessToken: h.getOauthToken } },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: h.channel,
    // The cross-owner connect check + write run inside one transaction.
    $transaction: h.transaction,
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: h.rateLimit,
  userKey: (a: string, b: string) => `${a}:${b}`,
  tooManyRequests: (l: { retryAfterMs?: number }) => ({
    body: { error: 'Too many requests', retryAfterMs: l?.retryAfterMs ?? 0 },
    init: { status: 429 },
  }),
  LIMITS: {
    CHANNELS: { limit: 20, windowMs: 3_600_000 },
    READ: { limit: 100, windowMs: 60_000 },
    PROJECT_WRITE: { limit: 60, windowMs: 3_600_000 },
  },
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

function postRequestWithUrl(platform: string, url: string) {
  return new Request('http://localhost/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, url }),
  });
}

const YT_ABOUT_HTML = `<html><body><script>var ytInitialData = ${JSON.stringify({
  metadata: {
    channelMetadataRenderer: {
      title: 'QA Channel',
      externalId: 'UCabc',
      vanityChannelUrl: 'http://www.youtube.com/@qachannel',
      avatar: { thumbnails: [{ url: 'https://yt3.example/hi.jpg' }] },
    },
  },
  contents: {
    aboutChannelViewModel: {
      subscriberCountText: { simpleText: '1.5M subscribers' },
      videoCountText: { runs: [{ text: '71' }, { text: ' videos' }] },
      viewCountText: { simpleText: '66,561,390 views' },
    },
  },
})};</script></body></html>`;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue(AUTH);
  h.rateLimit.mockResolvedValue({ success: true });
  // The connect path's cross-owner check + write run inside one $transaction;
  // hand it the same channel mocks so existing assertions keep working.
  h.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ channel: h.channel }),
  );
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

  describe('public-link connect (url in body)', () => {
    it('creates a row from the public snapshot without any OAuth token', async () => {
      h.getOauthToken.mockResolvedValue(null);
      h.channel.findFirst.mockResolvedValue(null);
      h.channel.create.mockResolvedValue({ id: 'c1', platform: 'YOUTUBE', name: 'QA Channel' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(YT_ABOUT_HTML, { status: 200 })));

      const res = await POST(postRequestWithUrl('YOUTUBE', 'youtube.com/@qachannel'));
      expect(res.status).toBe(201);
      expect(h.getOauthToken).not.toHaveBeenCalled();
      expect(h.channel.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_test',
          platform: 'YOUTUBE',
          channelId: 'UCabc',
          name: 'QA Channel',
          url: 'https://www.youtube.com/@qachannel',
          avatarUrl: 'https://yt3.example/hi.jpg',
          subscribers: 1500000,
          videosCount: 71,
          viewsCount: 66561390,
        },
      });
    });

    it('rejects an unparsable link with 400', async () => {
      const res = await POST(postRequestWithUrl('YOUTUBE', 'https://vimeo.com/@someone'));
      expect(res.status).toBe(400);
      expect(h.channel.create).not.toHaveBeenCalled();
    });

    it('answers 502 with the platform message when the channel is not found', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

      const res = await POST(postRequestWithUrl('YOUTUBE', '@missing_xyz'));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain('No YouTube channel found');
      expect(h.channel.create).not.toHaveBeenCalled();
    });

    it('refuses a public channel already connected to another account', async () => {
      h.channel.findFirst.mockResolvedValue({ id: 'c1', userId: 'someone_else' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(YT_ABOUT_HTML, { status: 200 })));

      const res = await POST(postRequestWithUrl('YOUTUBE', '@qachannel'));
      expect(res.status).toBe(409);
      expect(h.channel.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh without an OAuth token', () => {
    it('re-reads the stored public link of the user\'s own channel', async () => {
      h.getOauthToken.mockResolvedValue(null);
      h.channel.findFirst.mockResolvedValue({
        id: 'c1',
        url: 'https://www.youtube.com/@qachannel',
      });
      h.channel.update.mockResolvedValue({ id: 'c1', name: 'QA Channel' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(YT_ABOUT_HTML, { status: 200 })));

      const res = await POST(postRequest('YOUTUBE'));
      expect(res.status).toBe(200);
      // The stored row is updated in place and keeps its channelId.
      const data = h.channel.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(h.channel.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data });
      expect(data).not.toHaveProperty('channelId');
      expect(data.subscribers).toBe(1500000);
      expect(h.channel.create).not.toHaveBeenCalled();
    });

    it('still answers 428 when there is no token and no stored link', async () => {
      h.getOauthToken.mockResolvedValue(null);
      h.channel.findFirst.mockResolvedValue(null);

      const res = await POST(postRequest('TIKTOK'));
      expect(res.status).toBe(428);
      const body = await res.json();
      expect(body.connectRequired).toBe(true);
    });
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
