/**
 * Site-wide footer.
 *
 * Rendered on landing, legal, marketing, and (in a compact form) dashboard
 * pages. Every legal link required by consumer protection law lives here — do
 * not remove or rename without updating LEGAL_LINKS in `src/lib/legal/config.ts`.
 */

import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { CookieSettingsLink } from '@/components/CookieSettingsLink';
import { LEGAL, LEGAL_LINKS } from '@/lib/legal/config';

export const Footer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <footer className="border-t border-white/[0.06] bg-surface-panel">
        <div className="max-w-7xl mx-auto px-6 h-12 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-500">
          <div>© {new Date().getFullYear()} {LEGAL.legalEntity}. All rights reserved.</div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-ink-900 transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-white/[0.06] bg-surface-panel">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 text-[13px] text-ink-500 max-w-xs leading-relaxed">
              Pre-publish review for creators — catch monetization risks before they cost
              you revenue. Publish does not guarantee any monetization outcome.
            </p>
            <p className="mt-4 text-[11.5px] text-ink-400 leading-relaxed">
              Merchant of Record for all subscriptions: <strong className="text-ink-600">{LEGAL.merchantOfRecord}</strong>.
              You are billed by Lemon Squeezy on our behalf.
            </p>
          </div>

          <div>
            <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-3">Product</div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/#checks" className="text-ink-700 hover:text-ink-900">Features</Link></li>
              <li><Link href="/#pricing"  className="text-ink-700 hover:text-ink-900">Pricing</Link></li>
              <li><Link href="/#faq"      className="text-ink-700 hover:text-ink-900">FAQ</Link></li>
              <li><Link href="/community" className="text-ink-700 hover:text-ink-900">Leaderboard</Link></li>
              <li><Link href="/help"      className="text-ink-700 hover:text-ink-900">Help center</Link></li>
              <li><Link href="/restore"   className="text-ink-700 hover:text-ink-900">Restore purchase</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-3">Legal</div>
            <ul className="space-y-2 text-[13px]">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-ink-700 hover:text-ink-900">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-ink-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11.5px] text-ink-500">
          <div>© {new Date().getFullYear()} {LEGAL.legalEntity}. All rights reserved.</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Support: <a href={`mailto:${LEGAL.supportEmail}`} className="hover:text-ink-900">{LEGAL.supportEmail}</a></span>
            <span>Privacy: <a href={`mailto:${LEGAL.privacyEmail}`} className="hover:text-ink-900">{LEGAL.privacyEmail}</a></span>
            {/* The cookie policy promises this entry — see legal/cookies §3. */}
            <CookieSettingsLink />
          </div>
        </div>
      </div>
    </footer>
  );
};
