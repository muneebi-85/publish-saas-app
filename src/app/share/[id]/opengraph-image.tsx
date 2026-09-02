import { ImageResponse } from 'next/og';
import { scoreBand, SCORE_BAND_UI, SCORE_BAND_HEX_DARK } from '@/lib/score-band';

/**
 * OG image for the public score card — the 1200×630 preview Discord, X,
 * WhatsApp and Slack render when the share link is posted. Same data contract
 * as the share page: score, title, platform, and nothing else. The band
 * words and thresholds come from the shared score-band util so the preview
 * can never grade a report differently than the app does.
 *
 * RUNTIME: Edge, on purpose. @vercel/og's node build reads its bundled font
 * with `fileURLToPath(join(import.meta.url, ...))`, which produces a malformed
 * `file:/C:\…` URL on Windows and crashes at import time — no app code can
 * bypass it. The edge build has no such loader. Edge cannot reach Postgres, so
 * the report payload is fetched from /api/share/[id] (Node + Prisma), which
 * returns only the fields the card shows.
 */

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Publish Score card';

interface SharePayload {
  title: string;
  targetPlatform: string;
  overallScore: number;
  layers: { label: string; value: number | null }[];
}

// The card is painted on a near-black canvas, so the band hexes are the
// dark-theme variants of the same tokens.
const bandLabel = (score: number) => SCORE_BAND_UI[scoreBand(score)].label;
const bandHex = (score: number) => SCORE_BAND_HEX_DARK[scoreBand(score)];

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  // Same derivation as env.ts's APP_URL: explicit public URL first, then the
  // per-deploy VERCEL_URL Vercel injects. Falling back to localhost (the old
  // default) made every preview fetch miss on VERCEL_URL-only deployments.
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  const vercel = process.env.VERCEL_URL;
  const origin =
    (explicit && explicit.replace(/\/+$/, '')) ||
    (vercel && `https://${vercel.replace(/\/+$/, '')}`) ||
    'https://publish.genapps.online';

  let data: SharePayload | null = null;
  try {
    const res = await fetch(`${origin}/api/share/${params.id}`, {
      headers: { Accept: 'application/json' },
      // The image is generated per request; a stale card is worse than none.
      cache: 'no-store',
    });
    if (res.ok) data = (await res.json()) as SharePayload;
  } catch {
    // Fall through to the empty card below — a broken preview must not 500.
  }

  const score = data ? Math.max(0, Math.min(100, data.overallScore)) : null;
  const title = data?.title ?? 'Your upload';
  const platform = data?.targetPlatform ?? 'YouTube';
  const band = score === null ? '' : bandLabel(score);
  const color = score === null ? '#8A9199' : bandHex(score);
  const layers = data?.layers ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          // Satori parses only a subset of CSS — sized radial-gradients are
          // rejected with "Missing comma before color stops", so the card uses
          // a simple two-stop linear wash instead.
          background: 'linear-gradient(160deg, #0D1F17 0%, #070B0D 55%)',
          color: '#F4F6F5',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: '#7CFF9A',
              color: '#062B14',
              fontSize: '26px',
              fontWeight: 800,
            }}
          >
            P
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em' }}>Publish Score</div>
        </div>

        {/* Score + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '200px', lineHeight: 1, fontWeight: 800, letterSpacing: '-0.05em', color }}>
              {score ?? '—'}
            </div>
            <div style={{ fontSize: '28px', color: '#8A9199', fontWeight: 600, marginTop: '28px' }}>/100</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: '42px',
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                overflow: 'hidden',
              }}
            >
              {title.length > 90 ? `${title.slice(0, 90)}…` : title}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {band && (
                <span
                  style={{
                    padding: '10px 18px',
                    borderRadius: '999px',
                    background: color,
                    color: '#070B0D',
                    fontSize: '22px',
                    fontWeight: 800,
                  }}
                >
                  {band}
                </span>
              )}
              <span
                style={{
                  padding: '10px 18px',
                  borderRadius: '999px',
                  border: '2px solid rgba(255,255,255,0.16)',
                  fontSize: '22px',
                  fontWeight: 600,
                  color: '#D7DCDA',
                }}
              >
                {platform}
              </span>
            </div>
          </div>
        </div>

        {/* Layer strip */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {layers.map((layer) => (
            <div
              key={layer.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '18px 20px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ fontSize: '17px', color: '#8A9199', fontWeight: 600 }}>{layer.label}</div>
              <div style={{ fontSize: '34px', fontWeight: 800, color: layer.value === null ? '#6B7278' : '#FFFFFF' }}>
                {layer.value === null ? '—' : layer.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
