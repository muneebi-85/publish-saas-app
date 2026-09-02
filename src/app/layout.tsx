import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { CookieBanner } from '@/components/CookieBanner';
import { ReferralCapture } from '@/components/referral/ReferralCapture';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';

const SITE = 'https://publish.genapps.online';

/**
 * The Clerk Frontend API origin, decoded out of the publishable key — the key's
 * body is base64 of "<host>$", which is how Clerk's own script locates it.
 *
 * Preconnecting matters because clerk-js is fetched from that host on every page
 * and its DNS + TLS handshake otherwise happens serially at the moment it is
 * needed. Returns null rather than guessing if the key is missing or malformed,
 * so a bad key degrades to "no hint" instead of a dead preconnect.
 */
function clerkOrigin(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) return null;
  try {
    const host = Buffer.from(key.replace(/^pk_(test|live)_/, ''), 'base64')
      .toString('utf8')
      .replace(/\$$/, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? 'https://' + host : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Publish — The safety check before you hit publish',
    template: '%s · Publish',
  },
  description:
    'Review any video for demonetization risk, copyright exposure, AI-detection flags, and weak hooks — before it goes live. Built for creators, agencies, and content teams.',
  keywords: [
    'demonetization check', 'YouTube monetization', 'copyright check',
    'content review', 'creator tools', 'brand safety', 'video SEO',
  ],
  authors: [{ name: 'Publish' }],
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'Publish',
    title: 'Publish — The safety check before you hit publish',
    description:
      'Catch demonetization risks, copyright exposure, and weak hooks before you upload. Used by creators, agencies, and media teams.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Publish — The safety check before you hit publish',
    description:
      'Catch demonetization risks, copyright exposure, and weak hooks before you upload.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#FAFAF9',
  width: 'device-width',
  initialScale: 1,
};

/**
 * NO ClerkProvider HERE, DELIBERATELY.
 *
 * @clerk/nextjs@5's server `ClerkProvider` calls `headers()` and `auth()` in its
 * body, and a dynamic API anywhere in a route's tree opts that route out of
 * static rendering. Mounting it here made all ~35 pages server-rendered on
 * demand and stamped `Cache-Control: no-store` on every one of them, including
 * the legal policies that never change. It now lives in the layouts of the
 * subtrees that actually call Clerk hooks — see
 * `src/components/auth/AuthProvider.tsx` for the list and the reasoning.
 *
 * The preconnect below stays regardless: the pages that DO load clerk-js benefit
 * from the DNS + TLS handshake starting early, and a preconnect that goes unused
 * costs one idle socket.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fapi = clerkOrigin();
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {fapi && (
          <>
            <link rel="preconnect" href={fapi} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={fapi} />
          </>
        )}
      </head>
      <body className="h-full antialiased bg-surface-canvas text-ink-900">
        {/* The product UI is light by design and the marketing pages are always
            light, so `system` is not the right default — a visitor on a
            dark-mode OS would land on a theme the comps were never drawn for.
            Dark stays available from the sidebar toggle. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            <NextTopLoader color="#E00000" height={2} showSpinner={false} />
            <ReferralCapture />
            {children}
            <Toaster position="bottom-right" richColors />
            <CookieBanner />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
