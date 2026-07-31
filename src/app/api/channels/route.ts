/**
 * Connected channels.
 *
 * Every number returned here comes from the platform's own API using the
 * creator's OAuth token. There is no synthetic fallback: if the account is not
 * connected, or the platform refuses the token, the route says so and returns
 * nothing. Showing invented subscriber counts would make every downstream
 * benchmark a lie.
 */
import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { enumOf, id as validId, jsonBody } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS = ['YOUTUBE', 'TIKTOK'] as const;
type Platform = (typeof PLATFORMS)[number];

const PROVIDER: Record<Platform, string> = {
  YOUTUBE: 'oauth_google',
  TIKTOK: 'oauth_tiktok',
};

const CONNECT_LABEL: Record<Platform, string> = {
  YOUTUBE: 'YouTube (Google)',
  TIKTOK: 'TikTok',
};

type ChannelSnapshot = {
  channelId: string;
  name: string;
  url: string | null;
  avatarUrl: string | null;
  subscribers: number;
  videosCount: number;
  viewsCount: number;
};

/** Coerces platform counters, which arrive as strings, into safe integers. */
function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Fetch with a hard timeout so a hanging platform API cannot pin a function. */
async function fetchJson(url: string, token: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body } as const;
  } finally {
    clearTimeout(timer);
  }
}

async function getOauthToken(clerkId: string, provider: string): Promise<string | null> {
  try {
    // Clerk v5: clerkClient is an object, not a factory function.
    const response = await clerkClient.users.getUserOauthAccessToken(clerkId, provider as never);
    const tokens = Array.isArray(response) ? response : (response as { data?: unknown[] })?.data;
    const first = Array.isArray(tokens) ? (tokens[0] as { token?: string } | undefined) : undefined;
    return first?.token ?? null;
  } catch {
    // A missing connection throws in some Clerk versions; treat it as "not connected".
    return null;
  }
}

async function fetchYouTube(token: string): Promise<ChannelSnapshot | { error: string }> {
  const res = await fetchJson(
    'https://youtube.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    token,
  );
  if (!res.ok) {
    return { error: 'YouTube rejected the request. Reconnect your Google account and try again.' };
  }
  const item = (res.body as any)?.items?.[0];
  if (!item) {
    return { error: 'No YouTube channel is attached to that Google account.' };
  }
  const snippet = item.snippet ?? {};
  const stats = item.statistics ?? {};
  const handle: string | undefined = snippet.customUrl;
  return {
    channelId: String(item.id),
    name: String(snippet.title ?? 'YouTube channel'),
    url: handle
      ? `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}`
      : `https://www.youtube.com/channel/${item.id}`,
    avatarUrl:
      snippet.thumbnails?.high?.url ??
      snippet.thumbnails?.medium?.url ??
      snippet.thumbnails?.default?.url ??
      null,
    subscribers: count(stats.subscriberCount),
    videosCount: count(stats.videoCount),
    viewsCount: count(stats.viewCount),
  };
}

async function fetchTikTok(token: string): Promise<ChannelSnapshot | { error: string }> {
  const res = await fetchJson(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count,likes_count,profile_deep_link',
    token,
  );
  const user = (res.body as any)?.data?.user;
  if (!res.ok || !user) {
    return { error: 'TikTok rejected the request. Reconnect your TikTok account and try again.' };
  }
  return {
    channelId: String(user.open_id),
    name: String(user.display_name ?? 'TikTok account'),
    url: user.profile_deep_link ?? null,
    avatarUrl: user.avatar_url ?? null,
    subscribers: count(user.follower_count),
    videosCount: count(user.video_count),
    // TikTok's public scope exposes likes, not lifetime views. Recording likes
    // as "views" would silently corrupt every RPM/engagement benchmark, so we
    // leave it at 0 (rendered as "Not measured") rather than substitute it.
    viewsCount: 0,
  };
}

export async function GET() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const channels = await prisma.channel.findMany({
    where: { userId: authCtx.dbUserId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ channels }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'channels'),
    LIMITS.CHANNELS.limit,
    LIMITS.CHANNELS.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const body = await jsonBody(req, { maxBytes: 4_000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const platform = enumOf(body.value.platform, PLATFORMS, 'platform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });

  const provider = PROVIDER[platform.value];
  const token = await getOauthToken(authCtx.clerkId, provider);

  if (!token) {
    return NextResponse.json(
      {
        error: `Connect your ${CONNECT_LABEL[platform.value]} account first — we only ever show numbers pulled from the platform itself.`,
        connectRequired: true,
        provider,
      },
      { status: 428 },
    );
  }

  let snapshot: ChannelSnapshot | { error: string };
  try {
    snapshot =
      platform.value === 'YOUTUBE' ? await fetchYouTube(token) : await fetchTikTok(token);
  } catch (err) {
    console.error('[POST /api/channels] platform fetch failed', err);
    return NextResponse.json(
      { error: 'The platform did not respond in time. Please try again.' },
      { status: 502 },
    );
  }

  if ('error' in snapshot) {
    return NextResponse.json({ error: snapshot.error }, { status: 502 });
  }

  // A platform channel belongs to exactly one account here. Without this check
  // a second user could re-link the same channel and the unique constraint
  // would surface as an opaque 500.
  const existing = await prisma.channel.findUnique({
    where: { platform_channelId: { platform: platform.value, channelId: snapshot.channelId } },
    select: { id: true, userId: true },
  });

  if (existing && existing.userId !== authCtx.dbUserId) {
    return NextResponse.json(
      { error: 'That channel is already connected to another account.' },
      { status: 409 },
    );
  }

  const channel = existing
    ? await prisma.channel.update({ where: { id: existing.id }, data: snapshot })
    : await prisma.channel.create({
        data: { userId: authCtx.dbUserId, platform: platform.value, ...snapshot },
      });

  return NextResponse.json({ success: true, channel }, { status: existing ? 200 : 201 });
}

export async function DELETE(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  const { searchParams } = new URL(req.url);
  const parsed = validId(searchParams.get('id'), 'id');
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Ownership is part of the delete predicate, so another user's id simply
  // matches nothing — the response never reveals that it exists.
  const result = await prisma.channel.deleteMany({
    where: { id: parsed.value, userId: authCtx.dbUserId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Channel not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
