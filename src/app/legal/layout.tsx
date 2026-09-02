import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { LEGAL, LEGAL_LINKS } from '@/lib/legal/config';
import { Footer } from '@/components/Footer';

/**
 * Legal pages layout — a distraction-free, print-friendly wrapper shared by
 * every /legal/* page. Regulators, browser extensions, and archiving tools
 * expect a stable structure and a visible last-updated date.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    // surface tokens, not bg-white: the theme class persists across routes,
    // so a user who toggled dark in the dashboard would otherwise land here
    // with near-white ink-900 text on a hardcoded white page.
    <div className="min-h-screen bg-surface-panel text-ink-900 legal-always-light">
      {/* Header */}
      <header className="border-b border-ink-200 bg-surface-panel/85 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-ink-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to site
          </Link>
        </div>
      </header>

      {/* Two-column: quick nav + content */}
      <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-[180px,1fr] gap-10">
        <nav className="md:sticky md:top-24 h-fit">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-3">
            Policies
          </div>
          <ul className="space-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block text-[13px] text-ink-600 hover:text-ink-900 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-sm"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-6 border-t border-ink-200 text-[11.5px] text-ink-500 space-y-1">
            <div>Effective: {LEGAL.effectiveDate}</div>
            <div>Contact: <a href={`mailto:${LEGAL.supportEmail}`} className="underline underline-offset-2">{LEGAL.supportEmail}</a></div>
          </div>
        </nav>

        <article className="prose-legal">
          {children}
        </article>
      </div>

      <Footer />

      {/* Legal typography — kept scoped to this layout so it doesn't affect the app.
          The colors are the .legal-always-light remaps (below), so the page stays
          readable in both themes; the H1 uses the same Geist display voice as the
          product (var(--font-display) was never defined, so it used to fall back
          to Georgia serif while everything else was sans).
          Injected via dangerouslySetInnerHTML: <style> is a raw-text element, and
          React's apostrophe escaping inside a normal text child wrote literal
          &#x27; entities into the DOM — text the client render never produced,
          which failed hydration (React #425) on every legal page. The string is
          a compile-time literal, so this is the documented safe use. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .legal-always-light {
          --legal-ink:   rgb(15 23 42);
          --legal-ink-2: rgb(51 65 85);
          --legal-ink-3: rgb(30 41 59);
          --legal-meta:  rgb(100 116 139);
          --legal-wash:  rgb(248 250 252);
        }
        .dark .legal-always-light {
          --legal-ink:   rgb(247 248 250);
          --legal-ink-2: rgb(198 204 214);
          --legal-ink-3: rgb(210 214 221);
          --legal-meta:  rgb(155 163 176);
          --legal-wash:  rgb(23 26 31);
        }
        .prose-legal h1 {
          font-family: 'Geist', 'Inter', -apple-system, system-ui, sans-serif;
          font-size: 30px; font-weight: 600; letter-spacing: -0.02em;
          color: var(--legal-ink);
          margin-bottom: 6px;
        }
        .prose-legal .effective-line {
          font-size: 12px; color: var(--legal-meta); margin-bottom: 32px;
        }
        .prose-legal h2 {
          font-size: 17px; font-weight: 600; color: var(--legal-ink);
          margin-top: 40px; margin-bottom: 12px;
          scroll-margin-top: 96px;
        }
        .prose-legal h3 {
          font-size: 14.5px; font-weight: 600; color: var(--legal-ink-3);
          margin-top: 22px; margin-bottom: 8px;
        }
        .prose-legal p, .prose-legal li {
          font-size: 14px; line-height: 1.72; color: var(--legal-ink-2);
        }
        .prose-legal p { margin-bottom: 14px; }
        .prose-legal ul { margin: 8px 0 16px 22px; list-style: disc; }
        .prose-legal ol { margin: 8px 0 16px 22px; list-style: decimal; }
        .prose-legal li { margin-bottom: 5px; }
        .prose-legal strong { color: var(--legal-ink); font-weight: 600; }
        .prose-legal a { color: var(--legal-ink); text-decoration: underline; text-underline-offset: 3px; }
        .prose-legal a:hover { color: var(--legal-ink-2); }
        .prose-legal .callout {
          border-left: 3px solid var(--legal-ink);
          padding: 12px 18px; margin: 18px 0;
          background: var(--legal-wash); border-radius: 6px;
          font-size: 13.5px; color: var(--legal-ink-3);
        }
        /* Printing a policy is a common workflow (compliance archiving); the
           browser's print engine forces white regardless of theme class. */
        @media print {
          .legal-always-light {
            --legal-ink:   rgb(15 23 42);
            --legal-ink-2: rgb(51 65 85);
            --legal-ink-3: rgb(30 41 59);
            --legal-meta:  rgb(100 116 139);
            --legal-wash:  rgb(248 250 252);
          }
        }
      `}} />
    </div>
  );
}
