'use client';

import React from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Swords, ArrowRight } from 'lucide-react';
import { track } from '@/lib/analytics';

/**
 * "I can beat this score" — the challenge CTA on the public share page.
 *
 * Signed-in users go straight into a review of the SAME script (prefilled via
 * the `challenge` query param the upload page reads). Signed-out users are sent
 * to sign-in with the challenge URL as the redirect target, so accepting a
 * challenge doubles as a signup conversion — the exact loop the audit wanted.
 */
export function ChallengeCTA({ reportId }: { reportId: string }) {
  const { isSignedIn, isLoaded } = useUser();

  const challengeUrl = `/upload?challenge=${reportId}`;

  const handleClick = () => {
    void track('challenge_clicked', { reportId });
  };

  if (!isLoaded) {
    return (
      <div className="h-9 w-48 rounded-lg bg-ink-100 border border-ink-300 animate-pulse" />
    );
  }

  if (!isSignedIn) {
    return (
      <Link
        href={`/sign-in?redirect_url=${encodeURIComponent(challengeUrl)}`}
        onClick={handleClick}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-300 bg-surface-panel px-3.5 text-[13px] font-medium text-ink-900 shadow-xs transition-colors hover:bg-ink-50 hover:border-ink-400"
      >
        <Swords className="w-4 h-4" /> I can beat this score
        <ArrowRight className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <Link
      href={challengeUrl}
      onClick={handleClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-on-brand shadow-xs transition-colors hover:bg-brand-700"
    >
      <Swords className="w-4 h-4" /> I can beat this score
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
