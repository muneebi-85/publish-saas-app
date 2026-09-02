/**
 * Connected-channels helpers — the pure layer behind POST /api/channels.
 *
 * Every number returned here comes from the platform's own API using the
 * creator's OAuth token. There is no synthetic fallback: if the account is not
 * connected, or the platform refuses the token, the caller says so and returns
 * nothing. Showing invented subscriber counts would make every downstream
 * benchmark a lie.
 *
 * Kept free of framework imports (no Next, no Clerk, no Prisma) so the parsers
 * and coercion rules can be pinned down with unit tests in a plain Node
 * process — see channels.test.ts.
 */

export const CHANNEL_PLATFORMS = ['YOUTUBE', 'TIKTOK'] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

/** Clerk OAuth strategy that backs each platform's connection. */
export const CHANNEL_PROVIDER: Record<ChannelPlatform, string> = {
  YOUTUBE: 'oauth_google',
  TIKTOK: 'oauth_tiktok',
};

/** Human label used in error copy when the account itself is not connected. */
export const CHANNEL_CONNECT_LABEL: Record<ChannelPlatform, string> = {
  YOUTUBE: 'YouTube (Google)',
  TIKTOK: 'TikTok',
};

/** Short provider name used in client-side OAuth prompts ("authorize Google"). */
export const CHANNEL_OAUTH_NAME: Record<ChannelPlatform, string> = {
  YOUTUBE: 'Google',
  TIKTOK: 'TikTok',
};

export type ChannelSnapshot = {
  channelId: string;
  name: string;
  url: string | null;
  avatarUrl: string | null;
  subscribers: number;
  videosCount: number;
  viewsCount: number;
};

/**
 * Prisma returns BigInt for the Channel count columns (they are BIGINT in the
 * database — lifetime view counts overflow 32-bit). JSON serialization and all
 * client code expect plain numbers; every realistic count is exact well within
 * Number's safe integer range, so the conversion is lossless.
 */
type CountsToNumbers<T> = {
  [K in keyof T]: K extends 'subscribers' | 'videosCount' | 'viewsCount'
    ? T[K] extends bigint
      ? number
      : T[K]
    : T[K];
};

export function countsToNumbers<T extends object>(row: T): CountsToNumbers<T> {
  const out = { ...row } as Record<string, unknown>;
  for (const key of ['subscribers', 'videosCount', 'viewsCount']) {
    if (typeof out[key] === 'bigint') out[key] = Number(out[key]);
  }
  return out as CountsToNumbers<T>;
}

/** Coerces platform counters, which arrive as strings, into safe integers. */
export function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type JsonResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

/**
 * Fetch with a hard timeout so a hanging platform API cannot pin a function.
 * `fetchFn` is injectable for tests; it defaults to the global fetch.
 */
export async function fetchJson(
  url: string,
  token: string,
  timeoutMs = 10_000,
  fetchFn: FetchLike = fetch,
): Promise<JsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const PICK = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function thumbUrl(v: unknown): string | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? PICK((v as Record<string, unknown>).url)
    : null;
}

/**
 * Parse a YouTube Data API `channels?part=snippet,statistics&mine=true` body
 * into a snapshot. The platform API is out of our control, so every field is
 * read defensively through narrow getters instead of a wholesale cast.
 */
export function parseYouTubeSnapshot(body: unknown): ChannelSnapshot | { error: string } {
  const item = (body as { items?: unknown[] } | null)?.items?.[0];
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { error: 'No YouTube channel is attached to that Google account.' };
  }
  const obj = item as Record<string, unknown>;
  const snippet = (obj.snippet ?? {}) as Record<string, unknown>;
  const stats = (obj.statistics ?? {}) as Record<string, unknown>;
  const thumbs = (snippet.thumbnails ?? {}) as Record<string, unknown>;
  const handle: unknown = snippet.customUrl;
  return {
    channelId: String(obj.id),
    name:
      typeof snippet.title === 'string' && snippet.title
        ? snippet.title
        : 'YouTube channel',
    url:
      typeof handle === 'string' && handle
        ? `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}`
        : `https://www.youtube.com/channel/${obj.id}`,
    avatarUrl: thumbUrl(thumbs.high) ?? thumbUrl(thumbs.medium) ?? thumbUrl(thumbs.default),
    subscribers: count(stats.subscriberCount),
    videosCount: count(stats.videoCount),
    viewsCount: count(stats.viewCount),
  };
}

/**
 * Parse a TikTok `/v2/user/info/` body into a snapshot. TikTok's public scope
 * exposes likes, not lifetime views. Recording likes as "views" would silently
 * corrupt every RPM/engagement benchmark, so viewsCount stays 0 (rendered as
 * "Not measured") rather than substituting a different metric.
 */
export function parseTikTokSnapshot(body: unknown): ChannelSnapshot | { error: string } {
  const data = (body as { data?: unknown } | null)?.data;
  const user =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).user
      : undefined;
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    return { error: 'TikTok rejected the request. Reconnect your TikTok account and try again.' };
  }
  const u = user as Record<string, unknown>;
  return {
    channelId: String(u.open_id),
    name:
      typeof u.display_name === 'string' && u.display_name
        ? u.display_name
        : 'TikTok account',
    url:
      typeof u.profile_deep_link === 'string' && u.profile_deep_link
        ? u.profile_deep_link
        : null,
    avatarUrl:
      typeof u.avatar_url === 'string' && u.avatar_url ? u.avatar_url : null,
    subscribers: count(u.follower_count),
    videosCount: count(u.video_count),
    viewsCount: 0,
  };
}

/**
 * Fetch and parse the snapshot for a platform using the creator's token.
 * Returns the snapshot or a user-facing error; never throws for a platform
 * response (a 4xx/5xx or an unparseable body maps to an error message).
 */
export async function fetchChannelSnapshot(
  platform: ChannelPlatform,
  token: string,
  fetchFn: FetchLike = fetch,
): Promise<ChannelSnapshot | { error: string }> {
  const url =
    platform === 'YOUTUBE'
      ? 'https://youtube.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true'
      : 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count,likes_count,profile_deep_link';

  const res = await fetchJson(url, token, 10_000, fetchFn);
  if (!res.ok) {
    return {
      error:
        platform === 'YOUTUBE'
          ? 'YouTube rejected the request. Reconnect your Google account and try again.'
          : 'TikTok rejected the request. Reconnect your TikTok account and try again.',
    };
  }

  return platform === 'YOUTUBE'
    ? parseYouTubeSnapshot(res.body)
    : parseTikTokSnapshot(res.body);
}

// ─── YouTube video-level stats ────────────────────────────────────────────
// These extend the channel snapshot so Channel Analytics can compare the
// creator's own Publish Score against what actually happened to the video.
// Every number is read straight from the YouTube Data API with the creator's
// token — nothing is estimated or fabricated.

export interface ChannelVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
}

export type VideosResult = { ok: true; videos: ChannelVideo[] } | { ok: false; error: string };

export type CtrResult =
  | { ok: true; impressions: number | null; ctr: number | null }
  | { ok: false; error: string };

/**
 * A stable upload identifier: lowercase, punctuation stripped, whitespace
 * collapsed. Used to pair a report title with the video it describes — titles
 * are typed by the creator at upload time, so only an exact-enough match counts.
 */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * True when two normalized titles plausibly describe the same video. Exact
 * equality wins; otherwise a longer string containing the shorter (min 8 chars)
 * covers the "title changed after upload" case without over-matching.
 */
export function titlesMatch(reportTitle: string, videoTitle: string): boolean {
  const a = normalizeTitle(reportTitle);
  const b = normalizeTitle(videoTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  return (a.length >= 8 && b.includes(a)) || (b.length >= 8 && a.includes(b));
}

/**
 * Fetch the uploads playlist id for the signed-in channel (`UU…`), or null
 * when the response carries no contentDetails (defensive — the API is ours to
 * parse, not to trust).
 */
export async function fetchUploadsPlaylistId(
  token: string,
  fetchFn: FetchLike = fetch,
): Promise<string | null> {
  const res = await fetchJson(
    'https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
    token,
    10_000,
    fetchFn,
  );
  if (!res.ok) return null;
  const item = (res.body as { items?: unknown[] } | null)?.items?.[0];
  const details =
    item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).contentDetails
      : undefined;
  const related =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>).relatedPlaylists
      : undefined;
  const uploads =
    related && typeof related === 'object' && !Array.isArray(related)
      ? (related as Record<string, unknown>).uploads
      : undefined;
  return typeof uploads === 'string' && uploads ? uploads : null;
}

/** One raw playlist entry — only the fields this feature reads. */
function parseVideoStatsBody(body: unknown): Map<string, { views: number; likes: number; comments: number }> {
  const out = new Map<string, { views: number; likes: number; comments: number }>();
  const items = (body as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const stats = (item.statistics ?? {}) as Record<string, unknown>;
    out.set(id, {
      views: count(stats.viewCount),
      likes: count(stats.likeCount),
      comments: count(stats.commentCount),
    });
  }
  return out;
}

/**
 * Pull the creator's most recent uploads with real view/like/comment counts.
 *
 * Two API hops (uploads playlist, then statistics) — there is no single
 * endpoint that returns both titles and stats for the signed-in channel's own
 * uploads, so the list is assembled from the two sources and keyed by video id.
 * A failure on either hop returns `ok: false`; partial data is never presented
 * as complete.
 */
export async function fetchChannelVideos(
  token: string,
  fetchFn: FetchLike = fetch,
): Promise<VideosResult> {
  const playlistId = await fetchUploadsPlaylistId(token, fetchFn);
  if (!playlistId) {
    return { ok: false, error: 'Could not read the channel uploads list.' };
  }

  const itemsRes = await fetchJson(
    `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${encodeURIComponent(playlistId)}`,
    token,
    10_000,
    fetchFn,
  );
  if (!itemsRes.ok) return { ok: false, error: 'YouTube rejected the uploads list request.' };

  const entries: { videoId: string; title: string; publishedAt: string }[] = [];
  const items = (itemsRes.body as { items?: unknown[] } | null)?.items;
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const content = (item.contentDetails ?? {}) as Record<string, unknown>;
      const videoId = typeof content.videoId === 'string' ? content.videoId : '';
      const title = typeof snippet.title === 'string' ? snippet.title : '';
      const publishedAt =
        typeof snippet.publishedAt === 'string' ? snippet.publishedAt : '';
      if (videoId && title) entries.push({ videoId, title, publishedAt });
    }
  }

  if (entries.length === 0) return { ok: true, videos: [] };

  const statsRes = await fetchJson(
    `https://youtube.googleapis.com/youtube/v3/videos?part=statistics&id=${entries
      .map((e) => e.videoId)
      .join(',')}`,
    token,
    10_000,
    fetchFn,
  );
  if (!statsRes.ok) return { ok: false, error: 'YouTube rejected the statistics request.' };

  const stats = parseVideoStatsBody(statsRes.body);
  const videos: ChannelVideo[] = entries.map((entry) => {
    const s = stats.get(entry.videoId) ?? { views: 0, likes: 0, comments: 0 };
    return { ...entry, ...s };
  });

  return { ok: true, videos };
}

/**
 * Pull 28-day impressions and click-through rate from the YouTube Analytics
 * API. Requires the `yt-analytics.readonly` scope on the Google connection
 * (add it in the Clerk Google provider config). When the scope is missing the
 * API answers 403 and we report that distinctly so the UI can tell the creator
 * exactly what to enable instead of guessing.
 */
export async function fetchChannelCtr(
  token: string,
  channelId: string,
  fetchFn: FetchLike = fetch,
): Promise<CtrResult> {
  const end = new Date();
  const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://youtubeanalytics.googleapis.com/v2/reports` +
    `?ids=channel%3D%3D${encodeURIComponent(channelId)}` +
    `&startDate=${iso(start)}&endDate=${iso(end)}` +
    `&metrics=views%2CestimatedMinutesWatched%2Cimpressions%2Cctr`;

  const res = await fetchJson(url, token, 10_000, fetchFn);
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 403 || res.status === 401
          ? 'The Google connection is missing the YouTube Analytics scope. Add it in Clerk → Google provider scopes, then reconnect.'
          : 'YouTube Analytics rejected the request.',
    };
  }

  const rows = (res.body as { rows?: unknown[] } | null)?.rows;
  const first = Array.isArray(rows) ? rows[0] : undefined;
  if (!first || !Array.isArray(first)) {
    return { ok: true, impressions: null, ctr: null };
  }
  const impressions = Number(first[2]);
  const ctr = Number(first[3]);
  return {
    ok: true,
    impressions: Number.isFinite(impressions) && impressions > 0 ? impressions : null,
    // The API reports CTR as a percentage (e.g. 5.2).
    ctr: Number.isFinite(ctr) && ctr > 0 ? ctr : null,
  };
}

// ─── Public-link connect ──────────────────────────────────────────────────
// Connect a channel from its public link or handle, no OAuth required. The
// identity and every number still come from the platform itself — YouTube's
// public channel page and TikTok's oEmbed endpoint — so the no-OAuth path
// keeps the same rule as the OAuth path: nothing is typed in by hand and
// nothing is invented. A platform that returns no number stays 0, rendered
// as "Not measured".

export type InputResult<T> = { ok: true; value: T } | { ok: false; error: string };

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Normalize whatever a creator pastes — `@handle`, a full channel URL, or a
 * bare `UC…` id — into the path segment YouTube's own site uses
 * (`@handle` or `channel/UC…`). Legacy `/c/` and `/user/` links are rejected
 * with guidance, since YouTube itself now redirects them to handles.
 */
export function parseYouTubeInput(input: unknown): InputResult<string> {
  const s = typeof input === 'string' ? input.trim() : '';
  if (!s) return { ok: false, error: 'Paste your YouTube channel link or @handle.' };
  if (s.length > 2048) return { ok: false, error: 'That link is too long.' };

  // Pasted links usually arrive without a scheme ("youtube.com/@handle").
  let path = /^(www\.|m\.)?youtube\.com\//i.test(s) ? `https://${s}` : s;
  if (/^https?:\/\//i.test(path)) {
    let parsed: URL;
    try {
      parsed = new URL(path);
    } catch {
      return { ok: false, error: 'That does not look like a valid link.' };
    }
    const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (host !== 'youtube.com') {
      return { ok: false, error: 'That is not a YouTube channel link.' };
    }
    path = decodeURIComponent(parsed.pathname);
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '');

  const handleMatch = path.match(/^@([^/]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) {
      return { ok: false, error: 'No YouTube channel found at that link.' };
    }
    return { ok: true, value: `@${handle}` };
  }
  const idMatch = path.match(/^(?:channel\/)?(UC[A-Za-z0-9_-]{22})(?:\/|$)/);
  if (idMatch) {
    return { ok: true, value: `channel/${idMatch[1]}` };
  }
  return {
    ok: false,
    error: 'Paste a link that includes your @handle (copy it from your channel page).',
  };
}

/**
 * Normalize a TikTok input — `@username`, a profile URL, or a bare username —
 * into the unique id. TikTok usernames are 2–24 chars of letters, digits,
 * dots and underscores; anything else is definitely not an account.
 */
export function parseTikTokInput(input: unknown): InputResult<string> {
  const s = typeof input === 'string' ? input.trim() : '';
  if (!s) return { ok: false, error: 'Paste your TikTok profile link or @username.' };
  if (s.length > 2048) return { ok: false, error: 'That link is too long.' };

  // Pasted links usually arrive without a scheme ("tiktok.com/@user").
  let name = /^(www\.)?tiktok\.com\//i.test(s) ? `https://${s}` : s;
  if (/^https?:\/\//i.test(name)) {
    let parsed: URL;
    try {
      parsed = new URL(name);
    } catch {
      return { ok: false, error: 'That does not look like a valid link.' };
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'tiktok.com') {
      return { ok: false, error: 'That is not a TikTok profile link.' };
    }
    const m = decodeURIComponent(parsed.pathname).match(/^\/@([^/]+)/);
    if (!m) {
      return { ok: false, error: 'Paste the profile link (tiktok.com/@username).' };
    }
    name = m[1];
  }

  name = name.replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9._]{2,24}$/.test(name)) {
    return { ok: false, error: 'No TikTok account found at that link.' };
  }
  return { ok: true, value: name };
}

/**
 * Coerce the human-readable counters YouTube embeds in its public pages
 * ("30.3 million subscribers", "1.2K subscribers", "66,561,390 views",
 * "No subscribers") into integers. Unknown shapes stay 0 — rendered as
 * "Not measured", never guessed.
 */
export function parseHumanCount(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const t = text.toLowerCase().replace(/,/g, '').trim();
  if (!t || t.startsWith('no ')) return 0;
  const m = t.match(/([\d.]+)\s*(k|m|b|thousand|million|billion)?/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return 0;
  const suffix = m[2];
  const mult =
    suffix === 'k' || suffix === 'thousand'
      ? 1_000
      : suffix === 'm' || suffix === 'million'
        ? 1_000_000
        : suffix === 'b' || suffix === 'billion'
          ? 1_000_000_000
          : 1;
  return Math.floor(n * mult);
}

/**
 * Read a YouTube text object: a plain string (newer about-panel variants),
 * simpleText, joined runs, or the a11y label.
 */
function ytText(obj: unknown): string | null {
  if (typeof obj === 'string') return obj;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.simpleText === 'string') return o.simpleText;
  if (Array.isArray(o.runs)) {
    return o.runs
      .map((r) => (r && typeof r === 'object' ? String((r as Record<string, unknown>).text ?? '') : ''))
      .join('');
  }
  const acc = (o.accessibility as Record<string, unknown> | undefined)?.accessibilityData as
    | Record<string, unknown>
    | undefined;
  return typeof acc?.label === 'string' ? acc.label : null;
}

/** Depth-limited collector for every value stored under a named key. */
function collectKey(node: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 18 || !node || typeof node !== 'object') return out;
  if (!Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if (key in obj) out.push(obj[key]);
  }
  const children = Array.isArray(node) ? node : Object.values(node);
  for (const child of children) collectKey(child, key, out, depth + 1);
  return out;
}

/**
 * Locate the channel-level stats inside ytInitialData.
 *
 * Primary: the about panel's `aboutChannelViewModel` — the canonical node that
 * carries subscriberCountText / videoCountText / viewCountText together. The
 * page can preload OTHER channels' about panels (featured/related channels),
 * so only a view model whose own channelId matches the page's channel is
 * trusted; a mismatched one would silently attach another channel's numbers.
 * Fallback: a ranked walk for pages that lack the panel. Ranking matters
 * because other renderers carry look-alike counters — the featured video
 * player has its own viewCountText, and related-channel cards carry another
 * channel's subscriber/video counts. A node with subscriber and video
 * counters outranks a view-count-only node.
 */
function findAboutStats(
  node: unknown,
  expectedChannelId: string,
): Record<string, unknown> | null {
  const viewModels = collectKey(node, 'aboutChannelViewModel');
  for (const vm of viewModels) {
    if (!vm || typeof vm !== 'object' || Array.isArray(vm)) continue;
    const obj = vm as Record<string, unknown>;
    const cid = obj.channelId;
    if (typeof cid !== 'string' || cid === '' || cid === expectedChannelId) return obj;
  }

  let best: { score: number; obj: Record<string, unknown> } | null = null;

  const scoreOf = (obj: Record<string, unknown>): number => {
    let score = 0;
    if ('subscriberCountText' in obj) score += 2;
    if ('videoCountText' in obj) score += 1;
    return score;
  };

  const walk = (n: unknown, d: number): void => {
    if (d > 16 || !n || typeof n !== 'object') return;
    if (!Array.isArray(n)) {
      const obj = n as Record<string, unknown>;
      // A node carrying another channel's id owns another channel's counters
      // (related-channel cards) — skip the whole subtree.
      const cid = obj.channelId;
      if (typeof cid === 'string' && cid !== '' && cid !== expectedChannelId) return;
      if (
        'subscriberCountText' in obj ||
        'videoCountText' in obj ||
        'viewCountText' in obj
      ) {
        const score = scoreOf(obj);
        if (!best || score > best.score) best = { score, obj };
      }
    }
    const children = Array.isArray(n) ? n : Object.values(n);
    for (const child of children) walk(child, d + 1);
  };

  walk(node, 0);
  // A mismatched about panel is never used: its counters belong to another
  // channel, and "Not measured" beats the wrong numbers.
  return best ? (best as { score: number; obj: Record<string, unknown> }).obj : null;
}

/**
 * Parse a YouTube public channel `/about` page into a snapshot. Identity
 * (channel id, name, canonical URL, avatar) comes from the page's own
 * metadata block; counters from the about section.
 */
export function parseYouTubeAboutHtml(html: string): ChannelSnapshot | { error: string } {
  const m = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!m) {
    return { error: 'Could not read that YouTube channel. Check the link and try again.' };
  }
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { error: 'Could not read that YouTube channel. Check the link and try again.' };
  }
  const meta = (data as Record<string, unknown> | null)?.metadata as Record<string, unknown> | undefined;
  const cm = meta?.channelMetadataRenderer as Record<string, unknown> | undefined;
  const channelId = typeof cm?.externalId === 'string' ? cm.externalId : '';
  if (!cm || !channelId) {
    return { error: 'No YouTube channel found at that link.' };
  }

  const stats = findAboutStats(data, channelId) ?? {};
  const vanity = typeof cm.vanityChannelUrl === 'string' ? cm.vanityChannelUrl : '';
  const handle = vanity.match(/\/(@[^/?#]+)/)?.[1];

  let avatarUrl: string | null = null;
  const thumbs = (cm.avatar as Record<string, unknown> | undefined)?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const last = thumbs[thumbs.length - 1] as Record<string, unknown>;
    if (typeof last?.url === 'string') avatarUrl = last.url;
  }

  return {
    channelId,
    name: typeof cm.title === 'string' && cm.title ? cm.title : 'YouTube channel',
    url: handle
      ? `https://www.youtube.com/${handle}`
      : `https://www.youtube.com/channel/${channelId}`,
    avatarUrl,
    subscribers: parseHumanCount(ytText(stats.subscriberCountText)),
    videosCount: parseHumanCount(ytText(stats.videoCountText)),
    viewsCount: parseHumanCount(ytText(stats.viewCountText)),
  };
}

/**
 * Parse a TikTok oEmbed body for a profile URL. oEmbed confirms the account
 * exists and returns its real display name and canonical URL; it carries no
 * counters, so those stay 0 ("Not measured") rather than being guessed.
 */
export function parseTikTokOembed(
  body: unknown,
): Pick<ChannelSnapshot, 'channelId' | 'name' | 'url'> | { error: string } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const authorUrl = typeof o.author_url === 'string' ? o.author_url : '';
  const m = authorUrl.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (!m) return { error: 'No TikTok account found at that link.' };
  const username = m[1].toLowerCase();
  const name = typeof o.author_name === 'string' && o.author_name ? o.author_name : `@${username}`;
  return { channelId: username, name, url: `https://www.tiktok.com/@${username}` };
}

/** Fetch a URL as text with a hard timeout; `fetchFn` is injectable for tests. */
async function fetchText(
  url: string,
  timeoutMs = 10_000,
  fetchFn: FetchLike = fetch,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a channel from a pasted link/handle using only public platform
 * endpoints. Returns the snapshot or a user-facing error; never throws for a
 * platform response.
 */
export async function fetchPublicChannelSnapshot(
  platform: ChannelPlatform,
  input: string,
  fetchFn: FetchLike = fetch,
): Promise<ChannelSnapshot | { error: string }> {
  if (platform === 'YOUTUBE') {
    const parsed = parseYouTubeInput(input);
    if (!parsed.ok) return parsed;
    let res: { ok: boolean; status: number; text: string };
    try {
      res = await fetchText(`https://www.youtube.com/${parsed.value}/about`, 10_000, fetchFn);
    } catch {
      return { error: 'YouTube did not respond in time. Please try again.' };
    }
    if (res.status === 404) return { error: 'No YouTube channel found at that link.' };
    if (!res.ok) return { error: 'YouTube did not respond. Try again in a moment.' };
    return parseYouTubeAboutHtml(res.text);
  }

  const parsed = parseTikTokInput(input);
  if (!parsed.ok) return parsed;
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
    `https://www.tiktok.com/@${parsed.value}`,
  )}`;
  let res: { ok: boolean; status: number; text: string };
  try {
    res = await fetchText(oembedUrl, 10_000, fetchFn);
  } catch {
    return { error: 'TikTok did not respond in time. Please try again.' };
  }
  if (!res.ok) return { error: 'No TikTok account found at that link.' };
  let body: unknown;
  try {
    body = JSON.parse(res.text);
  } catch {
    return { error: 'TikTok returned an unexpected response. Try again.' };
  }
  const meta = parseTikTokOembed(body);
  if ('error' in meta) return meta;
  // oEmbed exposes identity, not counters — counts stay 0 ("Not measured").
  return { ...meta, avatarUrl: null, subscribers: 0, videosCount: 0, viewsCount: 0 };
}
