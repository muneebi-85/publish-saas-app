import { NextResponse } from 'next/server';
import { rateLimit, userKey, LIMITS, tooManyRequests } from '@/lib/ratelimit';
import * as v from '@/lib/validate';
import { requireAuth } from '@/lib/api-guards';
import { publishReport, provenanceLines } from '@/lib/ml/publish';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * The trained Publish Score for one video's metadata.
 *
 * Scoring is pure CPU — a few hundred float comparisons through a tree ensemble, no
 * network call, no LLM — so this route is fast and cheap, and it is gated on `requireAuth`
 * rather than `requirePaidPlan`: an honest score with real provenance is the thing
 * that makes the product worth paying for, not the thing to hide behind the paywall.
 *
 * 503, NOT 200-WITH-A-GUESS
 * When no model artefact is deployed this returns 503 with the reason. Returning a
 * heuristic number under the name "Publish Score" is precisely the failure this whole
 * subsystem replaced, and a client cannot tell a fabricated 62 from a measured one.
 */
export async function POST(req: Request) {
  const authCtx = await requireAuth();
  if (authCtx instanceof NextResponse) return authCtx;

  // Keyed to the authenticated account, not the IP — the same contract every
  // authenticated route follows, so a shared NAT cannot exhaust one bucket.
  const rl = await rateLimit(
    userKey(authCtx.clerkId, 'publish-score'),
    LIMITS.SEO.limit,
    LIMITS.SEO.windowMs,
  );
  if (!rl.success) {
    const { body, init } = tooManyRequests(rl);
    return NextResponse.json(body, init);
  }

  // Size-capped, non-throwing parse like every other route. A thumbnail feature
  // object is the largest legal payload here by far; 128 KB is generous
  // headroom, and anything bigger is an attack rather than a request.
  const parsed = await v.jsonBody(req, { maxBytes: 128_000 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  const title = v.string(body.title, { min: 1, max: 300, field: 'title' });
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  // Everything below is optional. A draft has no publish date, an unlisted video has
  // no category, a channel can hide its subscriber count — and the model was trained
  // on rows with the same gaps, so a partial row is a valid row rather than an error.
  const description = typeof body.description === 'string' ? body.description.slice(0, 20_000) : '';
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string').slice(0, 100)
    : [];
  // Two accepted forms, because the two callers have different things to hand.
  // `duration` is ISO-8601, straight from the YouTube API. `durationSeconds` is a
  // plain number, which is what a locally-probed upload has - and it is normalised
  // to `PT<n>S` here rather than parsed loosely in `features.ts`, because that
  // extractor is locked byte-for-byte against its Python twin and must keep taking
  // exactly one format. A caller sending "11:04" in `duration` would otherwise parse
  // to 0 seconds and be silently scored as a Short.
  const secondsGiven = Number(body.durationSeconds);
  const duration =
    typeof body.duration === 'string' && body.duration.trim() !== ''
      ? body.duration.slice(0, 32)
      : Number.isFinite(secondsGiven) && secondsGiven > 0
        ? `PT${Math.min(Math.round(secondsGiven), 86_400 * 7)}S`
        : null;
  const publishedAt = typeof body.publishedAt === 'string' ? body.publishedAt.slice(0, 40) : null;
  const categoryId =
    typeof body.categoryId === 'string' && /^\d{1,3}$/.test(body.categoryId)
      ? body.categoryId
      : undefined;

  const subscribers = v.integer(body.subscribers ?? 0, { min: 0, max: 1e10, field: 'subscribers' });
  if (!subscribers.ok) return NextResponse.json({ error: subscribers.error }, { status: 400 });
  const videoCount = v.integer(body.videoCount ?? 0, { min: 0, max: 1e7, field: 'videoCount' });
  if (!videoCount.ok) return NextResponse.json({ error: videoCount.error }, { status: 400 });

  // Thumbnail features come from `thumbs.py`, not from the browser. Accepted here so a
  // pipeline that already computed them need not recompute, but every value is coerced
  // to a finite number: a NaN reaching the tree walker makes every `<=` comparison false
  // and silently routes right at every node.
  const thumb: Record<string, number> | null =
    body.thumb && typeof body.thumb === 'object' && !Array.isArray(body.thumb)
      ? Object.fromEntries(
          Object.entries(body.thumb as Record<string, unknown>)
            .filter(([key]) => key.startsWith('thumb_'))
            .map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : 0]),
        )
      : null;

  try {
    const report = publishReport({
      video: {
        title: title.value,
        description,
        tags,
        duration,
        publishedAt,
        definition: body.definition === 'sd' ? 'sd' : 'hd',
        caption: body.caption === true,
        madeForKids: body.madeForKids === true,
        licensedContent: body.licensedContent === true,
      },
      channel: { subscribers: subscribers.value, videoCount: videoCount.value },
      thumb,
      categoryId,
    });

    if (!report.available) {
      return NextResponse.json(
        {
          error: 'Publish Score is not available on this deployment yet.',
          detail: report.reason,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      score: Math.round(report.score),
      raw: report.raw,
      cell: report.cell,
      cellExact: report.cellExact,
      suggestions: report.suggestions,
      suggestionsConsidered: report.suggestionsConsidered,
      bestRejectedLift: report.bestRejectedLift,
      benchmark: report.benchmark,
      card: report.card,
      provenance: provenanceLines(report),
    });
  } catch (err) {
    console.error('[POST /api/publish-score] error:', err);
    return NextResponse.json({ error: 'Scoring failed.' }, { status: 500 });
  }
}
