import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getUserPlanState } from '@/lib/session';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const authCtx = await requirePageAuth();

  const dbUser = await prisma.user.findUnique({
    where: { id: authCtx.dbUserId },
    select: {
      name: true,
      email: true,
      avatarUrl: true,
      productEmails: true,
      deleteScheduledAt: true,
      channels: {
        select: {
          id: true,
          platform: true,
          name: true,
          url: true,
          subscribers: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const state = await getUserPlanState(authCtx.clerkId);

  const userData = {
    // Empty rather than a fabricated display name — the UI falls back to the
    // email local part, which is at least the user's own identifier.
    name: dbUser?.name ?? '',
    email: dbUser?.email ?? '',
    avatar: dbUser?.avatarUrl ?? '',
    plan: state.plan,
    auditsUsed: state.auditsUsed,
    auditsLimit: state.auditsLimit,
    periodEnd: state.periodEnd ? state.periodEnd.toISOString() : null,
    productEmails: dbUser?.productEmails ?? true,
    deleteScheduledAt: dbUser?.deleteScheduledAt
      ? dbUser.deleteScheduledAt.toISOString()
      : null,
  };

  const channels = (dbUser?.channels ?? []).map((c) => ({
    id: c.id,
    platform: c.platform,
    name: c.name,
    url: c.url,
    subscribers: c.subscribers,
  }));

  return <SettingsClient user={userData} initialChannels={channels} />;
}
