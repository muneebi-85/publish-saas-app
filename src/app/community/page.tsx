import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { ShieldCheck, Trophy, ArrowRight, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Public "best scores this week" leaderboard.
 *
 * Only creators who opted in (Settings → Community leaderboard) appear. Each
 * entry links to the public score card. The page is deliberately noindexed —
 * it is a community surface, not an SEO target — but it gives the site a
 * reason to be visited daily and linked to, which is the point.
 */

function weekStart(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  return start;
}

export default async function CommunityPage() {
  const since = weekStart();

  const rows = await prisma.analysisReport.findMany({
    where: {
      createdAt: { gte: since },
      user: { leaderboardOptIn: true },
    },
    select: {
      id: true,
      title: true,
      targetPlatform: true,
      overallScore: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: { overallScore: 'desc' },
    take: 400,
  });

  const byUser = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.user.name ?? 'creator';
    const existing = byUser.get(key);
    if (!existing || row.overallScore > existing.overallScore) byUser.set(key, row);
  }

  const entries = [...byUser.values()]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 20);

  return (
    <main className="min-h-screen bg-[#070B0D]">
      <div className="mx-auto max-w-[720px] px-4 py-14 sm:py-20">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-600/30 bg-brand-600/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">
            <Trophy className="w-3.5 h-3.5" /> Top scores this week
          </span>
          <h1 className="font-display text-[34px] sm:text-[40px] font-bold tracking-[-0.03em] text-white mt-4">
            Best scripts of the week
          </h1>
          <p className="text-[14px] text-ink-500 mt-3 max-w-md mx-auto leading-relaxed">
            The highest Publish Scores from creators who opted in. See what&apos;s
            working — then beat it.
          </p>
        </div>

        {/* Board */}
        {entries.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-surface-panel p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto text-ink-500">
              <Trophy className="w-5 h-5" />
            </div>
            <h2 className="text-[16px] font-semibold text-white mt-4">No scores posted yet this week</h2>
            <p className="text-[13px] text-ink-500 mt-2 max-w-sm mx-auto leading-relaxed">
              The board fills as creators opt in and share their best scores. Be the first —
              run a review and flip on the leaderboard in Settings.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[13px] font-bold text-[#060606] hover:bg-brand-400 transition-colors mt-5"
            >
              Run your first review <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <ol className="mt-10 space-y-2.5">
            {entries.map((entry, index) => (
              <li key={entry.id}>
                <Link
                  href={`/share/${entry.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-surface-panel px-5 py-4 hover:border-brand-600/40 transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-[15px] shrink-0 ${
                      index === 0
                        ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                        : index === 1
                          ? 'bg-white/[0.07] text-white border border-white/[0.12]'
                          : index === 2
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/25'
                            : 'bg-white/[0.04] text-ink-500 border border-white/[0.08]'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[14px] font-semibold text-white truncate group-hover:text-brand-600 transition-colors">
                      {entry.title}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-[11.5px] text-ink-500">
                      <span>{entry.user.name || 'Anonymous creator'}</span>
                      <span>·</span>
                      <span>{entry.targetPlatform}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-[26px] font-bold tabular-nums leading-none text-brand-600">
                      {entry.overallScore}
                    </div>
                    <div className="text-[10px] text-ink-500 mt-0.5">/ 100</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {/* Opt-in note */}
        <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
          <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-ink-500 leading-relaxed">
            Every score here was shared by its creator on purpose. Your reports stay private
            unless you turn on the leaderboard in Settings — and you can turn it off any time.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-white transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            Get your own Publish Score
          </Link>
        </div>
      </div>
    </main>
  );
}

export const metadata = {
  title: 'Best scores this week',
  description: 'The highest Publish Scores this week from creators who opted in.',
  robots: { index: false, follow: false },
};
