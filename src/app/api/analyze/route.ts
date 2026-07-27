import { NextResponse } from 'next/server';
import { runFullReview } from '@/lib/ai/orchestrator';
import { rateLimit, clientKey, LIMITS } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { PlatformName } from '@/lib/ai/platform-engine';
import { requireAuth } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { incrementAuditsInTx } from '@/lib/session';
import { sendReportReady } from '@/lib/email';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  if (!authCtx.canAnalyze) {
    return NextResponse.json(
      {
        error: 'Monthly review limit reached on your current plan.',
        upgradeRequired: true,
        plan: authCtx.plan,
        auditsUsed: authCtx.auditsUsed,
        auditsLimit: authCtx.auditsLimit,
      },
      { status: 402 },
    );
  }

  const rl = await rateLimit(clientKey(req, 'analyze'), LIMITS.ANALYZE.limit, LIMITS.ANALYZE.windowMs);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: rlHeaders(rl) },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = v.string(body.title, { min: 3, max: 200, field: 'title' });
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  const scriptText = v.string(body.scriptText ?? '', { max: 20000, field: 'scriptText' });
  if (!scriptText.ok) return NextResponse.json({ error: scriptText.error }, { status: 400 });

  const platformIn = body.targetPlatform ?? 'YouTube';
  const platform = v.enumOf<PlatformName>(platformIn, PLATFORMS, 'targetPlatform');
  if (!platform.ok) return NextResponse.json({ error: platform.error }, { status: 400 });

  try {
    const projectId = 'proj-' + Math.random().toString(36).slice(2, 10);
    const report = await runFullReview({
      projectId,
      title: title.value,
      description: typeof body.description === 'string' ? body.description.slice(0, 1000) : undefined,
      scriptText: scriptText.value,
      thumbnailUrl: typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : undefined,
      targetPlatform: platform.value,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined,
      aiGenerated: !!body.aiGenerated,
      hasWatermark: !!body.hasWatermark,
      isVertical: body.isVertical === true,
      musicSource: typeof body.musicSource === 'string' ? body.musicSource : undefined,
      folder: typeof body.folder === 'string' ? body.folder : undefined,
    });

    // Persist report — this is what makes /analysis/[id] and /reports real.
    const persisted = await prisma.analysisReport.create({
      data: {
        userId: authCtx.dbUserId,
        projectId,
        title: title.value,
        targetPlatform: platform.value,
        monetizationScore: report.scores.monetization,
        overallScore: report.scores.overall,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report: report as any,
      },
    });

    // Debit the counter atomically. If this throws (race with another concurrent request),
    // we still return the report but skip the debit — the DB check on the next call catches it.
    try {
      await incrementAuditsInTx(authCtx.clerkId);
    } catch (e) {
      console.warn('[analyze] audit debit failed:', (e as Error).message);
    }

    // Fire-and-forget email; don't block on it.
    if (authCtx.email) {
      const criticalIssues = report.scriptIssues.filter((i) => i.reviewSeverity === 'critical').length;
      void sendReportReady({
        to: authCtx.email,
        projectTitle: title.value,
        reportUrl: `${env.APP_URL}/analysis/${persisted.id}`,
        monetizationScore: report.scores.monetization,
        criticalIssues,
      }).catch((err) => console.error('[analyze] email failed:', err));
    }

    // Plan/quota state is authoritative in the DB and served by /api/me/plan.
    // We never write plan cookies — they are spoofable and no longer trusted.
    const res = NextResponse.json(
      {
        ...report,
        reportId: persisted.id,
        quota: {
          used: authCtx.auditsUsed + 1,
          limit: authCtx.auditsLimit,
          plan: authCtx.plan,
        },
      },
      { headers: rlHeaders(rl) },
    );
    // Clear any legacy plan cookies from older builds so they can't mislead the UI.
    res.cookies.set('publish_plan', '', { path: '/', maxAge: 0 });
    res.cookies.set('publish_audits_used', '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[POST /api/analyze] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Review failed. Please retry — no charge was incurred.' },
      { status: 500 },
    );
  }
}

function rlHeaders(rl: { limit: number; remaining: number; resetAt: number }): HeadersInit {
  return {
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
  };
}
