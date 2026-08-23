import { requirePageAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import ProjectsClient from './ProjectsClient';

/** Narrow a value out of the free-form report JSON, or undefined if it isn't a string. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

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
    // `report` is Prisma.JsonValue — the payload shape has changed across engine
    // versions, so every field is read defensively rather than cast wholesale.
    const data = (r.report && typeof r.report === 'object' && !Array.isArray(r.report)
      ? r.report
      : {}) as Record<string, unknown>;
    const assets = (data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets)
      ? data.assets
      : {}) as Record<string, unknown>;
    return {
      // The report id is the only id that resolves as a route — `projectId` is
      // a human-facing correlation label (pub_…), never a report key.
      id: r.id,
      title: r.title || 'Untitled Project',
      description: str(data.description) ?? 'No description available.',
      folder: str(data.folder) ?? 'General',
      riskLevel: r.overallScore >= 80 ? 'LOW' : r.overallScore >= 50 ? 'MEDIUM' : 'HIGH',
      scores: {
        overall: r.overallScore,
        monetization: r.monetizationScore,
      },
      assets: {
        // Left undefined when the review had no thumbnail: the card renders a
        // neutral placeholder tile rather than someone else's stock photo.
        thumbnailUrl: str(assets.thumbnailUrl),
        videoDuration: str(assets.videoDuration),
      },
      createdAt: r.createdAt.toISOString(),
    };
  });

  return <ProjectsClient initialProjects={projects} />;
}
