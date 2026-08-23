import { describe, it, expect } from 'vitest';
import {
  CHANNEL_PLATFORMS,
  CHANNEL_PROVIDER,
  CHANNEL_CONNECT_LABEL,
  count,
  parseYouTubeSnapshot,
  parseTikTokSnapshot,
  fetchChannelSnapshot,
  fetchUploadsPlaylistId,
  fetchChannelVideos,
  fetchChannelCtr,
  normalizeTitle,
  titlesMatch,
  type ChannelPlatform,
} from './channels';

describe('count', () => {
  it('coerces string counters to integers', () => {
    expect(count('1234')).toBe(1234);
  });

  it('floors floats, because counts are whole numbers', () => {
    expect(count('12.9')).toBe(12);
  });

  it('returns 0 for anything non-positive', () => {
    expect(count('0')).toBe(0);
    expect(count('-5')).toBe(0);
    expect(count(0)).toBe(0);
  });

  it('returns 0 for anything not a number', () => {
    expect(count(undefined)).toBe(0);
    expect(count(null)).toBe(0);
    expect(count('')).toBe(0);
    expect(count(NaN)).toBe(0);
    expect(count('abc')).toBe(0);
  });
});

describe('platform maps', () => {
  it('covers exactly the two supported platforms', () => {
    expect([...CHANNEL_PLATFORMS]).toEqual(['YOUTUBE', 'TIKTOK']);
  });

  it('maps every platform to a Clerk OAuth strategy and a human label', () => {
    for (const p of CHANNEL_PLATFORMS as unknown as ChannelPlatform[]) {
      expect(typeof CHANNEL_PROVIDER[p]).toBe('string');
      expect(typeof CHANNEL_CONNECT_LABEL[p]).toBe('string');
    }
  });
});

describe('parseYouTubeSnapshot', () => {
  it('maps a full API body into a snapshot', () => {
    const snapshot = parseYouTubeSnapshot({
      items: [
        {
          id: 'UCabc123',
          snippet: {
            title: 'My Channel',
            customUrl: '@myhandle',
            thumbnails: {
              high: { url: 'https://yt3.example/hi.jpg' },
              medium: { url: 'https://yt3.example/med.jpg' },
              default: { url: 'https://yt3.example/lo.jpg' },
            },
          },
          statistics: {
            subscriberCount: '10420',
            videoCount: '37',
            viewCount: '881102',
          },
        },
      ],
    });

    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.channelId).toBe('UCabc123');
    expect(snapshot.name).toBe('My Channel');
    expect(snapshot.url).toBe('https://www.youtube.com/@myhandle');
    expect(snapshot.avatarUrl).toBe('https://yt3.example/hi.jpg');
    expect(snapshot.subscribers).toBe(10420);
    expect(snapshot.videosCount).toBe(37);
    expect(snapshot.viewsCount).toBe(881102);
  });

  it('prefixes @ to a customUrl that lacks it', () => {
    const snapshot = parseYouTubeSnapshot({
      items: [{ id: 'UCx', snippet: { customUrl: 'plain' } }],
    });
    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.url).toBe('https://www.youtube.com/@plain');
  });

  it('falls back to the channel-id URL and defaults when fields are missing', () => {
    const snapshot = parseYouTubeSnapshot({ items: [{ id: 'UCx' }] });
    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.name).toBe('YouTube channel');
    expect(snapshot.url).toBe('https://www.youtube.com/channel/UCx');
    expect(snapshot.avatarUrl).toBeNull();
    expect(snapshot.subscribers).toBe(0);
    expect(snapshot.videosCount).toBe(0);
    expect(snapshot.viewsCount).toBe(0);
  });

  it('errors when the account has no channel', () => {
    const snapshot = parseYouTubeSnapshot({ items: [] });
    expect('error' in snapshot).toBe(true);
  });

  it('errors on a malformed body', () => {
    expect('error' in parseYouTubeSnapshot(null)).toBe(true);
    expect('error' in parseYouTubeSnapshot({})).toBe(true);
  });
});

describe('parseTikTokSnapshot', () => {
  it('maps a full API body into a snapshot', () => {
    const snapshot = parseTikTokSnapshot({
      data: {
        user: {
          open_id: 'tb-opensalt-id',
          display_name: 'Creator Name',
          avatar_url: 'https://p16-sign.tiktokcdn.example/a.jpg',
          follower_count: '52310',
          video_count: '120',
          likes_count: '1234567',
          profile_deep_link: 'https://www.tiktok.com/@creator',
        },
      },
    });

    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.channelId).toBe('tb-opensalt-id');
    expect(snapshot.name).toBe('Creator Name');
    expect(snapshot.url).toBe('https://www.tiktok.com/@creator');
    expect(snapshot.avatarUrl).toBe('https://p16-sign.tiktokcdn.example/a.jpg');
    expect(snapshot.subscribers).toBe(52310);
    expect(snapshot.videosCount).toBe(120);
    // Likes must never be recorded as views — the benchmarks would silently lie.
    expect(snapshot.viewsCount).toBe(0);
  });

  it('defaults name/url/avatar when absent', () => {
    const snapshot = parseTikTokSnapshot({ data: { user: { open_id: 'tb-1' } } });
    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.name).toBe('TikTok account');
    expect(snapshot.url).toBeNull();
    expect(snapshot.avatarUrl).toBeNull();
  });

  it('errors when no user is present', () => {
    expect('error' in parseTikTokSnapshot({ data: {} })).toBe(true);
    expect('error' in parseTikTokSnapshot({})).toBe(true);
    expect('error' in parseTikTokSnapshot(null)).toBe(true);
  });
});

describe('normalizeTitle', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(normalizeTitle('How I Grew 10x in 2026!')).toBe('how i grew 10x in 2026');
    expect(normalizeTitle('  Multiple   Spaces  ')).toBe('multiple spaces');
  });

  it('returns empty for a title with no usable characters', () => {
    expect(normalizeTitle('!!!')).toBe('');
    expect(normalizeTitle('')).toBe('');
  });
});

describe('titlesMatch', () => {
  it('matches exact titles', () => {
    expect(titlesMatch('My Video Title', 'My Video Title')).toBe(true);
  });

  it('matches titles that differ only in punctuation and case', () => {
    expect(titlesMatch('My Video Title!', 'my video title')).toBe(true);
  });

  it('matches a renamed upload when the reviewed title is contained', () => {
    expect(titlesMatch('How I Grew 10x', 'How I Grew 10x in 2026 (Full Breakdown)')).toBe(true);
  });

  it('refuses to pair short or unrelated titles', () => {
    expect(titlesMatch('Untitled', 'My Video')).toBe(false);
    expect(titlesMatch('Cooking Pasta', 'Gaming Setup Tour')).toBe(false);
  });

  it('returns false when either side is empty', () => {
    expect(titlesMatch('', 'Anything')).toBe(false);
    expect(titlesMatch('Anything', '')).toBe(false);
  });
});

describe('fetchUploadsPlaylistId', () => {
  it('reads the uploads playlist id from contentDetails', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] }),
        { status: 200 },
      );
    expect(await fetchUploadsPlaylistId('tok', mockFetch)).toBe('UUabc');
  });

  it('returns null when the body has no uploads playlist', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ items: [{ contentDetails: {} }] }), { status: 200 });
    expect(await fetchUploadsPlaylistId('tok', mockFetch)).toBeNull();
  });
});

describe('fetchChannelVideos', () => {
  it('assembles uploads with real statistics through the injected fetcher', async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/channels?')) {
        return new Response(
          JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] }),
          { status: 200 },
        );
      }
      if (u.includes('/playlistItems?')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                snippet: { title: 'First Video', publishedAt: '2026-01-02T00:00:00.000Z' },
                contentDetails: { videoId: 'v1' },
              },
              {
                snippet: { title: 'Second Video', publishedAt: '2026-01-01T00:00:00.000Z' },
                contentDetails: { videoId: 'v2' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'v1',
              statistics: { viewCount: '12000', likeCount: '340', commentCount: '22' },
            },
            {
              id: 'v2',
              statistics: { viewCount: '500', likeCount: '10', commentCount: '0' },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await fetchChannelVideos('tok', mockFetch);
    if (!result.ok) throw new Error(result.error);
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toMatchObject({
      videoId: 'v1',
      title: 'First Video',
      views: 12000,
      likes: 340,
      comments: 22,
    });
  });

  it('returns ok with no videos when the uploads list is empty', async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/channels?')) {
        return new Response(
          JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    };
    const result = await fetchChannelVideos('tok', mockFetch);
    expect(result).toEqual({ ok: true, videos: [] });
  });

  it('reports failure when the uploads list cannot be resolved', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 });
    const result = await fetchChannelVideos('tok', mockFetch);
    expect(result.ok).toBe(false);
  });
});

describe('fetchChannelCtr', () => {
  it('parses impressions and ctr from the analytics report', async () => {
    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain('youtubeanalytics.googleapis.com');
      return new Response(
        JSON.stringify({ rows: [[102400, 42000, 8000, 5.2]] }),
        { status: 200 },
      );
    };
    const result = await fetchChannelCtr('tok', 'UCabc', mockFetch);
    if (!result.ok) throw new Error(result.error);
    expect(result.impressions).toBe(8000);
    expect(result.ctr).toBe(5.2);
  });

  it('returns nulls when the report has no rows', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ rows: [] }), { status: 200 });
    const result = await fetchChannelCtr('tok', 'UCabc', mockFetch);
    if (!result.ok) throw new Error(result.error);
    expect(result.impressions).toBeNull();
    expect(result.ctr).toBeNull();
  });

  it('reports the missing-analytics-scope case distinctly', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 });
    const result = await fetchChannelCtr('tok', 'UCabc', mockFetch);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('YouTube Analytics scope');
  });
});

describe('fetchChannelSnapshot', () => {
  it('fetches and parses YouTube through the injected fetcher', async () => {
    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain('youtube.googleapis.com');
      return new Response(
        JSON.stringify({
          items: [{ id: 'UCabc', snippet: { title: 'C' }, statistics: { subscriberCount: '5' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const snapshot = await fetchChannelSnapshot('YOUTUBE', 'tok', mockFetch);
    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.channelId).toBe('UCabc');
    expect(snapshot.subscribers).toBe(5);
  });

  it('fetches and parses TikTok through the injected fetcher', async () => {
    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain('open.tiktokapis.com');
      return new Response(
        JSON.stringify({
          data: { user: { open_id: 'tb-1', display_name: 'T', follower_count: '9', video_count: '2' } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const snapshot = await fetchChannelSnapshot('TIKTOK', 'tok', mockFetch);
    if ('error' in snapshot) throw new Error(snapshot.error);
    expect(snapshot.name).toBe('T');
    expect(snapshot.subscribers).toBe(9);
    expect(snapshot.viewsCount).toBe(0);
  });

  it('maps a platform error status to a reconnect message', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 });
    const snapshot = await fetchChannelSnapshot('YOUTUBE', 'bad', mockFetch);
    expect(snapshot).toEqual({
      error: 'YouTube rejected the request. Reconnect your Google account and try again.',
    });
  });

  it('passes the bearer token to the platform', async () => {
    let sent: string | null = null;
    const mockFetch: typeof fetch = async (_url, init) => {
      sent = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
      return new Response(JSON.stringify({ items: [{ id: 'UCx' }] }), { status: 200 });
    };
    await fetchChannelSnapshot('YOUTUBE', 'secret-token', mockFetch);
    expect(sent).toBe('Bearer secret-token');
  });
});
