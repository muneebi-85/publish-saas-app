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
import { enumOf, id as validId, jsonBody } from '@/lib/validate';
import {
  CHANNEL_PLATFORMS,
  CHANNEL_PROVIDER,
  CHANNEL_CONNECT_LABEL,
  fetchChannelSnapshot,
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

  const platform = enumOf(body.value.platform, CHANNEL_PLATFORMS, 'platform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });
  const platformName = platform.value as ChannelPlatform;

  const provider = CHANNEL_PROVIDER[platformName];
  const token = await getOauthToken(authCtx.clerkId, provider);

  if (!token) {
    return NextResponse.json(
      {
        error: `Connect your ${CHANNEL_CONNECT_LABEL[platformName]} account first — we only ever show numbers pulled from the platform itself.`,
        connectRequired: true,
        provider,
      },
      { status: 428 },
    );
  }

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

  // A platform channel belongs to exactly one account. That rule is enforced HERE,
  // deliberately, and not by a database constraint: the unique index is scoped to
  // (userId, platform, channelId), so the DB alone would happily let two accounts
  // link the same channel. A global unique index instead of this check is what the
  // schema used to have, and it surfaced the conflict as an opaque P2002 500 while
  // making this ownership branch unreachable.
  //
  // findFirst, not findUnique: the lookup intentionally spans owners, which is no
  // longer a unique key. The (platform, channelId) index still backs it.
  const existing = await prisma.channel.findFirst({
    where: { platform: platformName, channelId: snapshot.channelId },
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
        data: { userId: authCtx.dbUserId, platform: platformName, ...snapshot },
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
