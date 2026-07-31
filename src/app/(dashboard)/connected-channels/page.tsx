import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import ChannelsClient from './ChannelsClient';

export const dynamic = 'force-dynamic';

/**
 * Connected channels.
 *
 * Every card below reflects a row this user actually owns. There is no
 * "example" connection and no placeholder subscriber count: an account with
 * nothing linked sees zero connected platforms, which is the truth.
 */
export default async function ConnectedChannelsPage() {
  const authCtx = await requirePageAuth();

  const channels = await prisma.channel.findMany({
    where: { userId: authCtx.dbUserId },
    select: {
      id: true,
      platform: true,
      name: true,
      url: true,
      avatarUrl: true,
      subscribers: true,
      videosCount: true,
      viewsCount: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <ChannelsClient
      initialChannels={channels.map((c) => ({
        ...c,
        updatedAt: c.updatedAt.toISOString(),
      }))}
    />
  );
}
