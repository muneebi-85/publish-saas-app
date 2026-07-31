import React from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, CreditCard, Loader2, BellOff, ArrowRight } from 'lucide-react';
import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { getActivity, type ActivityItem, type ActivityKind } from '@/lib/activity';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MarkAllSeen } from './MarkAllSeen';

export const dynamic = 'force-dynamic';

const ICON_MAP: Record<ActivityKind, { icon: React.ReactNode; chip: string }> = {
  review_complete: {
    icon: <CheckCircle2 className="w-[18px] h-[18px]" />,
    chip: 'bg-brand-50 text-brand-600',
  },
  review_failed: {
    icon: <AlertTriangle className="w-[18px] h-[18px]" />,
    chip: 'bg-crimson-50 text-crimson-600',
  },
  review_running: {
    icon: <Loader2 className="w-[18px] h-[18px]" />,
    chip: 'bg-ink-100 text-ink-600',
  },
  billing: {
    icon: <CreditCard className="w-[18px] h-[18px]" />,
    chip: 'bg-amber-50 text-amber-600',
  },
};

/** Relative time, computed on the server so it matches the row's real timestamp. */
function relative(at: Date): string {
  const diffMs = Date.now() - at.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default async function NotificationsPage() {
  const authCtx = await requirePageAuth();

  const user = await prisma.user.findUnique({
    where: { id: authCtx.dbUserId },
    select: { activitySeenAt: true },
  });

  // The feed is rendered against the timestamp as it was on arrival, so the
  // unread highlighting reflects what the reader had not yet seen. Marking it
  // seen happens from the client and only affects the next visit.
  const { items, unread } = await getActivity(authCtx.dbUserId, user?.activitySeenAt ?? null);

  const todayStart = startOfToday();
  const groups: { label: string; list: ActivityItem[] }[] = [
    { label: 'Today', list: items.filter((i) => i.at.getTime() >= todayStart) },
    { label: 'Earlier', list: items.filter((i) => i.at.getTime() < todayStart) },
  ].filter((g) => g.list.length > 0);

  return (
    <div className="animate-enter">
      <PageHeader
        title="Notifications"
        subtitle="Every review you have run and every change to your plan. Nothing here is generated — each entry is a real event on your account."
        showUtility
        actions={<MarkAllSeen unread={unread} />}
      />

      {items.length === 0 ? (
        <Card className="py-16">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center text-ink-500 mb-4">
              <BellOff className="w-6 h-6" />
            </div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              Nothing has happened yet
            </h2>
            <p className="text-[14px] text-ink-600 mt-1 max-w-sm">
              Review updates and billing changes land here. Run your first review and you will see it
              appear the moment it finishes.
            </p>
            <Link href="/upload" className="mt-5">
              <Button variant="dark" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Run a review
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="max-w-2xl space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="text-[13px] font-semibold text-brand-600 mb-3">{group.label}</h2>
              <Card padded={false} className="divide-y divide-ink-100 overflow-hidden">
                {group.list.map((item) => {
                  const meta = ICON_MAP[item.kind];
                  const inner = (
                    <>
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.chip}`}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-[14px] font-semibold text-ink-900 leading-snug">
                            {item.title}
                          </div>
                          <span className="text-[12px] text-ink-500 whitespace-nowrap shrink-0 mt-0.5">
                            {relative(item.at)}
                          </span>
                        </div>
                        <p className="text-[13px] text-ink-600 mt-1 leading-relaxed">{item.body}</p>
                      </div>
                      {item.unread && (
                        <span
                          className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5"
                          aria-label="Unread"
                        />
                      )}
                    </>
                  );

                  const rowClass = `w-full text-left flex items-start gap-3.5 px-5 py-4 transition-colors ${
                    item.unread ? 'bg-brand-50/40 hover:bg-brand-50/70' : 'bg-white hover:bg-ink-50'
                  }`;

                  return item.href ? (
                    <Link key={item.id} href={item.href} className={rowClass}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={item.id} className={rowClass}>
                      {inner}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}

          <p className="text-[11.5px] text-ink-400 leading-relaxed">
            This feed is built from your review jobs and subscription records, so it always matches
            what actually happened. Entries older than 60 days drop off here — your full review
            history stays in{' '}
            <Link href="/reports" className="underline hover:text-ink-600">
              Reports
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
