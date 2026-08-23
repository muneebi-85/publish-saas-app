import { ImageResponse } from 'next/og';

/**
 * The social share card — `/opengraph-image`.
 *
 * There was no `og:image` or `twitter:image` at all, so every link to this site
 * unfurled as a bare text row: no card, no colour, nothing to click. The
 * `twitter:card` was already set to `summary_large_image`, which made it worse —
 * X reserves the wide slot and then renders it empty.
 *
 * Generated rather than checked in as a PNG for two reasons: the wording stays in
 * sync with the metadata in `layout.tsx` because both live in code, and there is
 * no 100 KB binary in the repo to re-export whenever the promise changes.
 *
 * Next.js picks this file up by convention and emits both `og:image` and
 * `twitter:image` for every route that does not define its own, so nothing needs
 * to reference it. No web fonts are fetched — the system stack keeps the render
 * self-contained, which matters because this runs at request time on the edge.
 */

export const runtime = 'edge';
export const alt = 'Publish — the safety check before you hit publish';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The brand mark from `app/icon.svg`, inlined so the card needs no asset fetch. */
function Mark() {
  return (
    <svg width="104" height="104" viewBox="0 0 40 40" fill="none">
      <path d="M9 22.5L20.5 16v12.5a2 2 0 0 1-1.02 1.74l-8.2 4.6A1.4 1.4 0 0 1 9 33.6V22.5Z" fill="#111111" />
      <path d="M9 6.4A1.4 1.4 0 0 1 11.1 5.2l18.4 10.3a2 2 0 0 1 0 3.5L11.1 29.3A1.4 1.4 0 0 1 9 28.1V6.4Z" fill="#16A34A" />
      <path
        d="M9 6.4A1.4 1.4 0 0 1 11.1 5.2l9.4 5.3v11.9l-9.4 5.3A1.4 1.4 0 0 1 9 26.5V6.4Z"
        fill="#15803D"
        fillOpacity="0.55"
      />
    </svg>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0A0A0B',
          // A single accent wash rather than a busy composition: at the size a
          // timeline renders this, anything smaller than the headline is noise.
          backgroundImage:
            'radial-gradient(circle at 88% 8%, rgba(22,163,74,0.30) 0%, rgba(10,10,11,0) 55%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Mark />
          <span style={{ fontSize: 46, fontWeight: 700, color: '#FFFFFF', letterSpacing: -1 }}>
            Publish
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2.5,
              color: '#FFFFFF',
              maxWidth: 920,
            }}
          >
            The safety check before you hit publish
          </div>
          <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.4, color: '#A1A1AA', maxWidth: 900 }}>
            Hook, SEO, thumbnail, authenticity, retention and monetization — every layer, one pass.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {['Hook', 'SEO', 'Thumbnail', 'Authenticity', 'Retention', 'Monetization'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                fontSize: 22,
                color: '#D4D4D8',
                padding: '10px 20px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
