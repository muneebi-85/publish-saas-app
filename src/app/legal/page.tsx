import Link from 'next/link';
import type { Metadata } from 'next';
import { LEGAL, LEGAL_LINKS } from '@/lib/legal/config';

/**
 * The policy index at `/legal`.
 *
 * `/legal` used to 404: every policy lives one level down and nothing served the
 * parent, so anyone who trimmed a URL back — or typed the address they half
 * remembered — hit a dead end on the one part of a site people go looking for
 * deliberately. The layout around this already lists the policies in its sidebar;
 * this page is the same list as a destination, with a line of context each so the
 * reader can tell which document answers their question.
 */
export const metadata: Metadata = {
  // The root layout appends " · Publish" via its title template.
  title: 'Legal & Policies',
  description: 'Terms, privacy, refunds, subprocessors and the rest of the policies that govern use of Publish.',
};

/** One line per policy, keyed by href so it cannot drift from LEGAL_LINKS. */
const SUMMARIES: Record<string, string> = {
  '/legal/terms': 'The agreement between you and us — what the service does, what you may do with it, and the limits on both.',
  '/legal/privacy': 'What data we collect, why, how long we keep it, and the rights you have over it.',
  '/legal/subprocessors': 'The third parties that process data on our behalf, and what each one handles.',
  '/legal/refund': 'When a payment can be refunded and how to ask for one.',
  '/legal/subscription-terms': 'How billing periods, renewals, upgrades and cancellations work.',
  '/legal/acceptable-use': 'What the service may not be used for.',
  '/legal/cookies': 'The cookies this site sets, and how to change what you have consented to.',
  '/legal/dmca': 'How to report content that infringes your copyright, and how we respond.',
};

export default function LegalIndexPage() {
  return (
    <>
      <h1>Legal &amp; Policies</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <p>
        These are the documents that govern your use of {LEGAL.productName}, operated by{' '}
        {LEGAL.legalEntity}. Payments are handled by {LEGAL.merchantOfRecord} as Merchant of Record,
        which is why billing and refunds have their own pages.
      </p>

      <ul>
        {LEGAL_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
            {SUMMARIES[link.href] ? <> — {SUMMARIES[link.href]}</> : null}
          </li>
        ))}
      </ul>

      <p>
        Questions about any of it go to{' '}
        <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
      </p>
    </>
  );
}
