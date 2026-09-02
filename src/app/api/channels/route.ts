/**
 * Connected channels.
 *
 * Every number returned here comes from the platform's own API using the
 * creator's OAuth token. There is no synthetic fallback: if the account is not
 * connected, or the platform refuses the token, the route says so and returns
 * nothing. Showing invented subscriber counts would make every downstream
 * benchmark a lie.
 *
 * The platform parsing/coercion rules live in src/lib/channels.ts (pure, unit
 * tested); this file is the I/O shell: auth, rate limiting, ownership, and the
 * database upsert.
 */
import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import { enumOf, id as validId, jsonBody, string } from '@/lib/validate';
import {
  CHANNEL_PLATFORMS,
  CHANNEL_PROVIDER,
  CHANNEL_CONNECT_LABEL,
  fetchChannelSnapshot,
  fetchPublicChannelSnapshot,
  parseYouTubeInput,
  parseTikTokInput,
  countsToNumbers,
  type ChannelPlatform,
  type ChannelSnapshot,
} from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// No request parameter: the limiter is keyed to the authenticated account, and
// the query reads nothing off the URL.
export async function GET() {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // Every other read route carries the cheap authenticated-read budget; this one
  // is no different, and an unthrottled authenticated DB read is a free
  // amplification primitive for anyone with an account.
  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'channels-read'),
    LIMITS.READ.limit,
    LIMITS.READ.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const channels = await prisma.channel.findMany({
    where: { userId: authCtx.dbUserId },
    // Explicit field list rather than the whole row: a column added to Channel
    // later must be published deliberately, not leak the moment it exists.
    select: {
      id: true,
      platform: true,
      channelId: true,
      name: true,
      url: true,
      subscribers: true,
      videosCount: true,
      viewsCount: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    // A creator connects a handful of channels, not thousands. The cap keeps the
    // response bounded regardless.
    take: 100,
  });

  return NextResponse.json(
    { channels: channels.map(countsToNumbers) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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

  const platform = enumOf(body.value.platform, CHANNEL_PLATFORMS, 'platform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });
  const platformName = platform.value as ChannelPlatform;

  // ── Public-link connect ────────────────────────────────────────────────
  // A pasted channel link/handle resolves through the platform's own public
  // endpoints (no OAuth needed), so connecting works even where the OAuth
  // provider is not configured for this deployment.
  const urlField = body.value.url;
  if (urlField !== undefined && urlField !== null && String(urlField).trim() !== '') {
    const urlValue = string(urlField, { field: 'url', max: 2048 });
    if (!urlValue.ok) return NextResponse.json({ error: urlValue.error }, { status: 400 });

    // Bad input is a 400; only a genuine platform failure below is a 502.
    const parsedInput =
      platformName === 'YOUTUBE'
        ? parseYouTubeInput(urlValue.value)
        : parseTikTokInput(urlValue.value);
    if (!parsedInput.ok) {
      return NextResponse.json({ error: parsedInput.error }, { status: 400 });
    }

    let snapshot: ChannelSnapshot | { error: string };
    try {
      snapshot = await fetchPublicChannelSnapshot(platformName, urlValue.value);
    } catch (err) {
      console.error('[POST /api/channels] public fetch failed', err);
      return NextResponse.json(
        { error: 'The platform did not respond in time. Please try again.' },
        { status: 502 },
      );
    }
    if ('error' in snapshot) {
      return NextResponse.json({ error: snapshot.error }, { status: 502 });
    }
    return upsertChannel(authCtx.dbUserId, platformName, snapshot);
  }

  // ── OAuth connect ──────────────────────────────────────────────────────
  const provider = CHANNEL_PROVIDER[platformName];
  const token = await getOauthToken(authCtx.clerkId, provider);

  if (token) {
    let snapshot: ChannelSnapshot | { error: string };
    try {
      snapshot = await fetchChannelSnapshot(platformName, token);
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
    return upsertChannel(authCtx.dbUserId, platformName, snapshot);
  }

  // No OAuth token. If this user already connected the platform via a public
  // link, a refresh re-reads that same link instead of dead-ending at 428.
  const own = await prisma.channel.findFirst({
    where: { userId: authCtx.dbUserId, platform: platformName },
    select: { id: true, url: true },
    orderBy: { createdAt: 'asc' },
  });
  if (own?.url) {
    let snapshot: ChannelSnapshot | { error: string };
    try {
      snapshot = await fetchPublicChannelSnapshot(platformName, own.url);
    } catch (err) {
      console.error('[POST /api/channels] public refresh failed', err);
      return NextResponse.json(
        { error: 'The platform did not respond in time. Please try again.' },
        { status: 502 },
      );
    }
    if ('error' in snapshot) {
      return NextResponse.json({ error: snapshot.error }, { status: 502 });
    }
    // Update the row in place and keep its stored channelId: an
    // OAuth-connected row's id (e.g. TikTok's open_id) can differ from the
    // public derivation, and the identity must not change on a refresh.
    const fields: Omit<ChannelSnapshot, 'channelId'> = {
      name: snapshot.name,
      url: snapshot.url,
      avatarUrl: snapshot.avatarUrl,
      subscribers: snapshot.subscribers,
      videosCount: snapshot.videosCount,
      viewsCount: snapshot.viewsCount,
    };
    const channel = await prisma.channel.update({ where: { id: own.id }, data: fields });
    return NextResponse.json({ success: true, channel: countsToNumbers(channel) }, { status: 200 });
  }

  return NextResponse.json(
    {
      error: `Connect your ${CHANNEL_CONNECT_LABEL[platformName]} account first — we only ever show numbers pulled from the platform itself.`,
      connectRequired: true,
      provider,
    },
    { status: 428 },
  );
}

/**
 * A platform channel belongs to exactly one account. That rule is enforced HERE,
 * deliberately, and not by a database constraint: the unique index is scoped to
 * (userId, platform, channelId), so the DB alone would happily let two accounts
 * link the same channel. A global unique index instead of this check is what the
 * schema used to have, and it surfaced the conflict as an opaque P2002 500 while
 * making this ownership branch unreachable.
 *
 * findFirst, not findUnique: the lookup intentionally spans owners, which is no
 * longer a unique key. The (platform, channelId) index still backs it.
 *
 * The check and the write run inside one SERIALIZABLE transaction: a bare
 * find-then-create lets two accounts connecting the same channel concurrently
 * both observe `existing === null` and both create, leaving the channel
 * attached to two owners — exactly what this route exists to prevent.
 */
async function upsertChannel(
  dbUserId: string,
  platformName: ChannelPlatform,
  snapshot: ChannelSnapshot,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.channel.findFirst({
          where: { platform: platformName, channelId: snapshot.channelId },
          select: { id: true, userId: true },
        });

        if (existing && existing.userId !== dbUserId) {
          return NextResponse.json(
            { error: 'That channel is already connected to another account.' },
            { status: 409 },
          );
        }

        const channel = existing
          ? await tx.channel.update({ where: { id: existing.id }, data: snapshot })
          : await tx.channel.create({
              data: { userId: dbUserId, platform: platformName, ...snapshot },
            });

        return NextResponse.json(
          { success: true, channel: countsToNumbers(channel) },
          { status: existing ? 200 : 201 },
        );
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    // A serialization failure (two concurrent connects of the same channel)
    // or a rare P2002 from the owner-scoped unique: one of the two racing
    // requests wins; the loser re-checks by simply failing the request — the
    // client's retry hits the branch above and sees the winner's row.
    console.error('[POST /api/channels] connect transaction failed:', err);
    return NextResponse.json(
      { error: 'Could not connect the channel — it may have just been connected. Please retry.' },
      { status: 409 },
    );
  }
}

export async function DELETE(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // Per-item write budget, matching the projects route: clearing out several
  // old channels is normal use, but the write must still be bounded.
  const limit = await rateLimit(
    userKey(authCtx.clerkId, 'channels-write'),
    LIMITS.PROJECT_WRITE.limit,
    LIMITS.PROJECT_WRITE.windowMs,
  );
  if (!limit.success) {
    const r = tooManyRequests(limit);
    return NextResponse.json(r.body, r.init);
  }

  const { searchParams } = new URL(req.url);
  const parsed = validId(searchParams.get('id'), 'id');
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Ownership is part of the delete predicate, so another user's id simply
  // matches nothing — the response never reveals that it exists.
  let result: { count: number };
  try {
    result = await prisma.channel.deleteMany({
      where: { id: parsed.value, userId: authCtx.dbUserId },
    });
  } catch (err) {
    console.error('[DELETE /api/channels] delete failed:', err);
    return NextResponse.json({ error: 'Could not remove the channel. Please retry.' }, { status: 503 });
  }

  if (result.count === 0) {
    return NextResponse.json({ error: 'Channel not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
