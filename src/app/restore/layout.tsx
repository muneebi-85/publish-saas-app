import type { Metadata } from 'next';

/**
 * Exists only to give `/restore` a title of its own.
 *
 * The page itself is a client component (`'use client'`), and a client component
 * cannot export `metadata` — so the route fell through to the root default,
 * "Publish — The safety check before you hit publish", which tells someone
 * hunting through their tabs for the restore form nothing at all.
 *
 * `noindex` because there is nothing here for a search engine: the page is a form
 * that only does something for a signed-in customer whose subscription needs
 * re-attaching after a checkout.
 */
export const metadata: Metadata = {
  // The root layout appends " · Publish" via its title template.
  title: 'Restore purchase',
  description: 'Re-attach a Lemon Squeezy subscription to your Publish account.',
  robots: { index: false, follow: true },
};

export default function RestoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
