/**
 * Legal / business identity used across the legal pages.
 *
 * Every value is overridable through `NEXT_PUBLIC_LEGAL_*` (and the product
 * name and site URL through the shared `NEXT_PUBLIC_APP_*` vars) — that is the
 * contract `.env.example` documents, and an operator must be able to fill in
 * their real entity and addresses before going live without touching code.
 * The defaults are the identity the rest of the app already advertises: the
 * help pages, the pricing page, and the transactional error copy all point at
 * the `genapps.online` addresses, so the legal pages must speak the same
 * vocabulary rather than sending users to a domain nothing else references.
 */
function envOr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

export const LEGAL = {
  productName: envOr('NEXT_PUBLIC_APP_NAME', 'Publish'),
  legalEntity: envOr('NEXT_PUBLIC_LEGAL_ENTITY', 'Publish Labs Ltd.'),
  legalAddress: envOr(
    'NEXT_PUBLIC_LEGAL_ADDRESS',
    '123 Creator Street, London, EC1A 1BB, United Kingdom',
  ),
  websiteUrl: envOr('NEXT_PUBLIC_APP_URL', 'https://publish.genapps.online').replace(/\/+$/, ''),
  merchantOfRecord: 'Lemon Squeezy',
  supportEmail: envOr('NEXT_PUBLIC_SUPPORT_EMAIL', 'support@genapps.online'),
  billingEmail: envOr('NEXT_PUBLIC_BILLING_EMAIL', 'billing@genapps.online'),
  privacyEmail: envOr('NEXT_PUBLIC_PRIVACY_EMAIL', 'privacy@genapps.online'),
  dmcaEmail: envOr('NEXT_PUBLIC_DMCA_EMAIL', 'dmca@genapps.online'),
  effectiveDate: 'July 1, 2025',
  governingLaw: envOr('NEXT_PUBLIC_GOVERNING_LAW', 'the laws of England and Wales'),
} as const;

export const LEGAL_LINKS = [
  { label: 'Terms of Service',    href: '/legal/terms' },
  { label: 'Privacy Policy',      href: '/legal/privacy' },
  { label: 'Subprocessors',       href: '/legal/subprocessors' },
  { label: 'Refund Policy',       href: '/legal/refund' },
  { label: 'Subscription Terms',  href: '/legal/subscription-terms' },
  { label: 'Acceptable Use',      href: '/legal/acceptable-use' },
  { label: 'Cookie Policy',       href: '/legal/cookies' },
  { label: 'DMCA / Copyright',    href: '/legal/dmca' },
] as const;
