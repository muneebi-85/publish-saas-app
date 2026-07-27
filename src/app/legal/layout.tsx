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
    <div className="min-h-screen bg-white text-ink-900">
      {/* Header */}
      <header className="border-b border-ink-100 bg-white/85 backdrop-blur sticky top-0 z-20">
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
                  className="block text-[13px] text-ink-600 hover:text-ink-900 py-1 transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-6 border-t border-ink-100 text-[11.5px] text-ink-500 space-y-1">
            <div>Effective: {LEGAL.effectiveDate}</div>
            <div>Contact: <a href={`mailto:${LEGAL.supportEmail}`} className="underline underline-offset-2">{LEGAL.supportEmail}</a></div>
          </div>
        </nav>

        <article className="prose-legal">
          {children}
        </article>
      </div>

      <Footer />

      {/* Legal typography — kept scoped to this layout so it doesn't affect the app. */}
      <style>{`
        .prose-legal h1 {
          font-family: var(--font-display), Georgia, serif;
          font-size: 30px; font-weight: 600; letter-spacing: -0.02em;
          color: rgb(15 23 42);
          margin-bottom: 6px;
        }
        .prose-legal .effective-line {
          font-size: 12px; color: rgb(100 116 139); margin-bottom: 32px;
        }
        .prose-legal h2 {
          font-size: 17px; font-weight: 600; color: rgb(15 23 42);
          margin-top: 40px; margin-bottom: 12px;
          scroll-margin-top: 96px;
        }
        .prose-legal h3 {
          font-size: 14.5px; font-weight: 600; color: rgb(30 41 59);
          margin-top: 22px; margin-bottom: 8px;
        }
        .prose-legal p, .prose-legal li {
          font-size: 14px; line-height: 1.72; color: rgb(51 65 85);
        }
        .prose-legal p { margin-bottom: 14px; }
        .prose-legal ul { margin: 8px 0 16px 22px; list-style: disc; }
        .prose-legal ol { margin: 8px 0 16px 22px; list-style: decimal; }
        .prose-legal li { margin-bottom: 5px; }
        .prose-legal strong { color: rgb(15 23 42); font-weight: 600; }
        .prose-legal a { color: rgb(15 23 42); text-decoration: underline; text-underline-offset: 3px; }
        .prose-legal a:hover { color: rgb(51 65 85); }
        .prose-legal .callout {
          border-left: 3px solid rgb(15 23 42);
          padding: 12px 18px; margin: 18px 0;
          background: rgb(248 250 252); border-radius: 6px;
          font-size: 13.5px; color: rgb(30 41 59);
        }
      `}</style>
    </div>
  );
}
