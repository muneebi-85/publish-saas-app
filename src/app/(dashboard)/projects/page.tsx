import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import ProjectsClient from './ProjectsClient';

export default async function ProjectsPage() {
  const authCtx = await requirePageAuth();

  const reports = await prisma.analysisReport.findMany({
    where: { userId: authCtx.dbUserId },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit memory footprint
    select: {
      id: true,
      projectId: true,
      title: true,
      overallScore: true,
      monetizationScore: true,
      createdAt: true,
      report: true, 
    },
  });

  const projects = reports.map((r) => {
    const reportData = (r.report || {}) as any;
    return {
      // The report id is the only id that resolves as a route — `projectId` is
      // a human-facing correlation label (pub_…), never a report key.
      id: r.id,
      title: r.title || 'Untitled Project',
      description: reportData?.description || 'No description available.',
      folder: reportData?.folder || 'General',
      riskLevel: r.overallScore >= 80 ? 'LOW' : r.overallScore >= 50 ? 'MEDIUM' : 'HIGH',
      scores: {
        overall: r.overallScore,
        monetization: r.monetizationScore,
      },
      assets: {
        thumbnailUrl: reportData?.assets?.thumbnailUrl || 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=800&q=80',
        videoDuration: reportData?.assets?.videoDuration || '0:00',
      },
      createdAt: r.createdAt.toISOString(),
    };
  });

  return <ProjectsClient initialProjects={projects} />;
}
