import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import AnalysesClient from './AnalysesClient';

export const dynamic = 'force-dynamic';

// Matches the fetch cap in AnalysesClient's toolbar note — a list that is
// silently truncated presents itself as "all your reviews".
const FETCH_CAP = 50;

export default async function AnalysesPage() {
  const authCtx = await requirePageAuth();

  const [reports, total] = await Promise.all([
    prisma.analysisReport.findMany({
      where: { userId: authCtx.dbUserId },
      orderBy: { createdAt: 'desc' },
      take: FETCH_CAP,
      select: {
        id: true,
        title: true,
        targetPlatform: true,
        overallScore: true,
        monetizationScore: true,
        createdAt: true,
      },
    }),
    prisma.analysisReport.count({ where: { userId: authCtx.dbUserId } }),
  ]);

  const items = reports.map((r) => ({
    id: r.id,
    title: r.title || 'Untitled analysis',
    platform: r.targetPlatform || 'YouTube',
    overall: r.overallScore,
    monetization: r.monetizationScore,
    createdAt: r.createdAt.toISOString(),
  }));

  return <AnalysesClient items={items} truncated={total > FETCH_CAP} />;
}
