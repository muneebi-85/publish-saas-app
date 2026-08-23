/**
 * The scoring route.
 *
 * `publish.ts` and its own tests cover the model, the recommender and the
 * benchmark. What is tested here is the boundary: what a browser is allowed to
 * send, what happens when no model is deployed, and the input coercions that fail
 * silently rather than loudly if they are wrong.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  publishReport: vi.fn(),
  provenanceLines: vi.fn(),
}));

vi.mock('@/lib/api-guards', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: h.rateLimit,
  clientKey: (_req: Request, scope: string) => scope,
  LIMITS: { SEO: { limit: 30, windowMs: 60_000 } },
}));
vi.mock('@/lib/ml/publish', () => ({
  publishReport: h.publishReport,
  provenanceLines: h.provenanceLines,
}));

import { POST } from './route';

const AUTH = {
  clerkId: 'clerk_me',
  email: null,
  dbUserId: 'user_me',
  plan: 'free',
  role: 'MEMBER' as const,
  auditsUsed: 0,
  auditsLimit: 1,
  canAnalyze: true,
};

/** A minimal available report; individual tests override what they care about. */
const REPORT = {
  available: true as const,
  score: 61.4,
  raw: 61.4,
  cell: 'People & Blogs|small|long',
  cellExact: true,
  suggestions: [],
  suggestionsConsidered: 9,
  bestRejectedLift: 0.66,
  benchmark: null,
  card: { videos: 5000 },
  features: {},
};

function post(body: unknown) {
  return new Request('http://localhost/api/publish-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The input `publishReport` was actually called with. */
function lastInput() {
  return h.publishReport.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue(AUTH);
  h.rateLimit.mockResolvedValue({ success: true });
  h.publishReport.mockReturnValue(REPORT);
  h.provenanceLines.mockReturnValue(['Trained on 5,000 videos.']);
});

describe('POST /api/publish-score', () => {
  it('scores an authenticated request and returns the provenance with it', async () => {
    const res = await POST(post({ title: 'A real title', categoryId: '22' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(61);
    expect(body.cell).toBe('People & Blogs|small|long');
    // Carried through so an empty suggestion list is legible rather than blank.
    expect(body.suggestionsConsidered).toBe(9);
    expect(body.bestRejectedLift).toBeCloseTo(0.66, 10);
    expect(body.provenance).toEqual(['Trained on 5,000 videos.']);
  });

  it('answers 503, never a guess, when no model is deployed', async () => {
    // The whole reason this subsystem exists. A 200 with an invented number here
    // is indistinguishable to the client from a measured one.
    h.publishReport.mockReturnValue({ available: false, reason: 'no artefact' });
    const res = await POST(post({ title: 'A real title' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.score).toBeUndefined();
    expect(body.detail).toBe('no artefact');
  });

  it('requires auth before doing any work', async () => {
    const { NextResponse } = await import('next/server');
    h.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(post({ title: 'A real title' }));
    expect(res.status).toBe(401);
    expect(h.publishReport).not.toHaveBeenCalled();
  });

  it('rate limits', async () => {
    h.rateLimit.mockResolvedValue({ success: false });
    const res = await POST(post({ title: 'A real title' }));
    expect(res.status).toBe(429);
    expect(h.publishReport).not.toHaveBeenCalled();
  });

  it('rejects a missing title and malformed JSON', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post('{not json'))).status).toBe(400);
  });

  it('normalises durationSeconds into the one format the extractor accepts', async () => {
    // `features.ts` parses ISO-8601 only, and is locked byte-for-byte against its
    // Python twin. A caller with a plain number must not have it parsed loosely.
    await POST(post({ title: 'x', durationSeconds: 664 }));
    expect(lastInput().video.duration).toBe('PT664S');
  });

  it('prefers an explicit ISO duration over the seconds form', async () => {
    await POST(post({ title: 'x', duration: 'PT11M4S', durationSeconds: 999 }));
    expect(lastInput().video.duration).toBe('PT11M4S');
  });

  it('treats an unusable duration as absent rather than as zero seconds', async () => {
    // A display string like "11:04" would parse to 0 and score an eleven-minute
    // video as a Short — compared against an entirely different set of videos.
    await POST(post({ title: 'x', duration: '11:04' }));
    // Passed through verbatim: the extractor rejects it and reports 0, which is the
    // honest "unknown length". What must NOT happen is a fabricated ISO string.
    expect(lastInput().video.duration).toBe('11:04');

    await POST(post({ title: 'x', durationSeconds: 'eleven' }));
    expect(lastInput().video.duration).toBeNull();

    await POST(post({ title: 'x', durationSeconds: -5 }));
    expect(lastInput().video.duration).toBeNull();
  });

  it('only accepts a numeric category id', async () => {
    await POST(post({ title: 'x', categoryId: '22' }));
    expect(lastInput().categoryId).toBe('22');

    // 'Gaming' would resolve to a real cell and silently benchmark against it.
    await POST(post({ title: 'x', categoryId: 'Gaming' }));
    expect(lastInput().categoryId).toBeUndefined();

    await POST(post({ title: 'x', categoryId: 22 }));
    expect(lastInput().categoryId).toBeUndefined();
  });

  it('drops non-thumb keys and coerces every thumb value to a finite number', async () => {
    // A NaN reaching the tree walker makes every `<=` comparison false, routing
    // right at every node — a wrong score with no error anywhere.
    await POST(
      post({
        title: 'x',
        thumb: {
          thumb_text_area: 0.12,
          thumb_contrast: 'not a number',
          thumb_face_area: null,
          subscribers: 999_999,
        },
      }),
    );
    expect(lastInput().thumb).toEqual({
      thumb_text_area: 0.12,
      thumb_contrast: 0,
      thumb_face_area: 0,
    });
  });

  it('rejects a negative or absurd subscriber count', async () => {
    expect((await POST(post({ title: 'x', subscribers: -1 }))).status).toBe(400);
    expect((await POST(post({ title: 'x', videoCount: 1e9 }))).status).toBe(400);
  });

  it('defaults every optional field rather than failing on a partial row', async () => {
    // The trainer saw rows with the same gaps, zero-filled the same way.
    await POST(post({ title: 'Just a title' }));
    const input = lastInput();
    expect(input.video.description).toBe('');
    expect(input.video.tags).toEqual([]);
    expect(input.video.publishedAt).toBeNull();
    expect(input.channel).toEqual({ subscribers: 0, videoCount: 0 });
    expect(input.thumb).toBeNull();
  });

  it('caps runaway text and tag lists instead of scoring them', async () => {
    await POST(
      post({
        title: 'x',
        description: 'd'.repeat(50_000),
        tags: Array.from({ length: 400 }, (_, i) => `t${i}`),
      }),
    );
    expect(lastInput().video.description.length).toBe(20_000);
    expect(lastInput().video.tags.length).toBe(100);
  });

  it('answers 500 without leaking the failure when scoring throws', async () => {
    h.publishReport.mockImplementation(() => {
      throw new Error('tree walk exploded');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post({ title: 'x' }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('tree walk exploded');
    spy.mockRestore();
  });
});
