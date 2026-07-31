import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import '@/styles/globals.css';
import { CookieBanner } from '@/components/CookieBanner';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';

const SITE = 'https://publish.genapps.online';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        </head>
        <body className="h-full antialiased bg-surface-canvas text-ink-900">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={200}>
              <NextTopLoader color="#16A34A" showSpinner={false} />
              {children}
              <Toaster position="bottom-right" richColors />
              <CookieBanner />
            </TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
