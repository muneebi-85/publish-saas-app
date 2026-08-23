/**
 * Mega-menu contents.
 *
 * Every href was checked against src/app: `#checks` and `#pricing` are section
 * ids in LandingClient and the /legal/* routes all have pages. Dashboard routes
 * are deliberately absent — they are auth-gated, so a logged-out visitor
 * clicking one would land on the sign-in wall.
 *
 * Only RESOURCES_MENU is wired up today; the header's other two menus were
 * dropped when the page was rebuilt from the Stitch comp, which has a single
 * "Resources" menu. PRODUCT_MENU and SOLUTIONS_MENU are kept for when the nav
 * grows back.
 */
import React from 'react';
import type { MenuGroup } from './MegaMenu';

/* ── icons ── */

const I = {
  width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function VideoIcon() { return <svg {...I}><rect x="2.6" y="4.6" width="18.8" height="14.8" rx="4" /><path d="M10.2 9.4 15 12l-4.8 2.6V9.4Z" fill="currentColor" stroke="none" /></svg>; }
function ImageIcon() { return <svg {...I}><rect x="2.8" y="4.4" width="18.4" height="15.2" rx="3.4" /><circle cx="8.4" cy="9.6" r="1.6" /><path d="m3.6 16.6 4.8-4.2 4 3.4 3.2-2.8 5.2 4.4" /></svg>; }
function SearchIcon() { return <svg {...I}><circle cx="10.8" cy="10.8" r="6.6" /><path d="m15.8 15.8 4.2 4.2" /></svg>; }
function ShieldIcon() { return <svg {...I}><path d="M12 3l7 2.6v5.9c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V5.6L12 3Z" /><path d="m8.8 11.8 2.3 2.3 4.1-4.6" /></svg>; }
function SparkIcon() { return <svg {...I}><path d="M9.4 3.2 11 7.8l4.6 1.6L11 11l-1.6 4.6L7.8 11 3.2 9.4 7.8 7.8 9.4 3.2Z" fill="currentColor" stroke="none" /><path d="M17.6 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" fill="currentColor" stroke="none" /></svg>; }
function ChartIcon() { return <svg {...I}><path d="M5.4 19.4V12M12 19.4V5.2M18.6 19.4v-5.6" strokeWidth="2.6" /></svg>; }
function UserIcon() { return <svg {...I}><circle cx="12" cy="8.2" r="3.7" /><path d="M4.8 20c.9-3.6 3.7-5.5 7.2-5.5s6.3 1.9 7.2 5.5" /></svg>; }
function BoltIcon() { return <svg {...I}><path d="M13.2 2.6 5.4 13.4h5l-1.2 8 7.8-10.8h-5l1.2-8Z" /></svg>; }
function UsersIcon() { return <svg {...I}><circle cx="9.2" cy="8.4" r="3.4" /><path d="M2.8 19.4c.8-3.2 3.3-5 6.4-5s5.6 1.8 6.4 5" /><path d="M16 5.6a3.4 3.4 0 0 1 0 6.5M17.6 19.4c-.3-1.4-.8-2.6-1.5-3.5" /></svg>; }
function BriefcaseIcon() { return <svg {...I}><rect x="2.8" y="7" width="18.4" height="12.4" rx="3" /><path d="M8.6 7V5.6a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2V7" /></svg>; }
function TagIcon() { return <svg {...I}><path d="M12.6 3H20v7.4l-9 9-8.4-8.4 9-8Z" /><circle cx="16.3" cy="7" r="1.5" /></svg>; }
function StarIcon() { return <svg {...I}><path d="m12 3.4 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 18l-5.7 3 1.1-6.4-4.6-4.5 6.4-.9L12 3.4Z" /></svg>; }
function ScaleIcon() { return <svg {...I}><path d="M12 4v16M5 8h14M7.6 8 4.6 14h6L7.6 8ZM16.4 8l-3 6h6l-3-6Z" /></svg>; }
function LockIcon() { return <svg {...I}><rect x="4.6" y="10.4" width="14.8" height="9.8" rx="3" /><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" /></svg>; }
function RefundIcon() { return <svg {...I}><circle cx="12" cy="12" r="8.6" /><path d="M14.6 9.4a2.9 2.9 0 0 0-2.6-1.5c-1.6 0-2.7.9-2.7 2.1 0 3 5.5 1.4 5.5 4.4 0 1.3-1.1 2.3-2.8 2.3a3 3 0 0 1-2.8-1.8" /></svg>; }
function DocIcon() { return <svg {...I}><path d="M6 3.4h7.4L18.6 8.6v12H6v-17Z" /><path d="M13 3.4v5.4h5.4M9 13h6M9 16.4h6" /></svg>; }

/* ── menus ── */

/** The nine review layers, all anchored to the checks section. */
export const PRODUCT_MENU: MenuGroup[] = [
  {
    heading: 'Review layers',
    items: [
      { label: 'AI Video Analysis', desc: 'Nine layers scored before you publish', href: '#checks', icon: VideoIcon },
      { label: 'Thumbnail Optimization', desc: 'CTR read on the frame itself', href: '#checks', icon: ImageIcon },
      { label: 'SEO Studio', desc: 'Titles, tags and descriptions', href: '#checks', icon: SearchIcon },
    ],
  },
  {
    heading: 'Protect & grow',
    items: [
      { label: 'Monetization Check', desc: 'Advertiser-friendly before upload', href: '#checks', icon: ShieldIcon },
      { label: 'AI Coach', desc: 'Fixes ranked by expected lift', href: '#checks', icon: SparkIcon },
      { label: 'Reports & Insights', desc: 'Track scores across uploads', href: '#checks', icon: ChartIcon },
    ],
  },
];

export const SOLUTIONS_MENU: MenuGroup[] = [
  {
    heading: 'By creator',
    items: [
      { label: 'Long-form YouTubers', desc: 'Retention and hook diagnostics', href: '#checks', icon: UserIcon },
      { label: 'Short-form creators', desc: 'First-three-seconds scoring', href: '#checks', icon: BoltIcon },
    ],
  },
  {
    heading: 'By team',
    items: [
      { label: 'Agencies', desc: 'White-label reports for clients', href: '#pricing', icon: UsersIcon },
      { label: 'Brand & social teams', desc: 'Policy review before sign-off', href: '#checks', icon: BriefcaseIcon },
    ],
  },
];

export const RESOURCES_MENU: MenuGroup[] = [
  {
    heading: 'Explore',
    items: [
      { label: 'Pricing', desc: 'Four plans, free to start', href: '#pricing', icon: TagIcon },
      { label: 'Customer stories', desc: 'How creators use Publish', href: '/community', icon: StarIcon },
      { label: 'Restore purchase', desc: 'Re-link an existing subscription', href: '/restore', icon: RefundIcon },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Terms of service', desc: 'The agreement you sign up under', href: '/legal/terms', icon: ScaleIcon },
      { label: 'Privacy policy', desc: 'What we store and for how long', href: '/legal/privacy', icon: LockIcon },
      { label: 'Refund policy', desc: 'When and how refunds are issued', href: '/legal/refund', icon: DocIcon },
    ],
  },
];
