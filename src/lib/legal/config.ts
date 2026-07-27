export const LEGAL = {
  productName: 'Publish',
  legalEntity: 'Publish Labs Ltd.',
  legalAddress: '123 Creator Street, London, EC1A 1BB, United Kingdom',
  websiteUrl: 'https://usepublish.app',
  merchantOfRecord: 'Lemon Squeezy',
  supportEmail: 'support@usepublish.app',
  billingEmail: 'billing@usepublish.app',
  privacyEmail: 'privacy@usepublish.app',
  dmcaEmail: 'dmca@usepublish.app',
  effectiveDate: 'July 1, 2025',
  governingLaw: 'the laws of England and Wales',
} as const;

export const LEGAL_LINKS = [
  { label: 'Terms of Service',    href: '/legal/terms' },
  { label: 'Privacy Policy',      href: '/legal/privacy' },
  { label: 'Refund Policy',       href: '/legal/refund' },
  { label: 'Subscription Terms',  href: '/legal/subscription-terms' },
  { label: 'Acceptable Use',      href: '/legal/acceptable-use' },
  { label: 'Cookie Policy',       href: '/legal/cookies' },
  { label: 'DMCA / Copyright',    href: '/legal/dmca' },
] as const;
