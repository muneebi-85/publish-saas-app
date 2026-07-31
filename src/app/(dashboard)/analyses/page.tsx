import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import AnalysesClient from './AnalysesClient';

export const dynamic = 'force-dynamic';

export default async function AnalysesPage() {
  const authCtx = await requirePageAuth();

  const reports = await prisma.analysisReport.findMany({
    where: { userId: authCtx.dbUserId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      targetPlatform: true,
      overallScore: true,
      monetizationScore: true,
      createdAt: true,
    },
  });

  const items = reports.map((r) => ({
    id: r.id,
    title: r.title || 'Untitled analysis',
    platform: r.targetPlatform || 'YouTube',
    overall: r.overallScore,
    monetization: r.monetizationScore,
    createdAt: r.createdAt.toISOString(),
  }));

  return <AnalysesClient items={items} />;
}
