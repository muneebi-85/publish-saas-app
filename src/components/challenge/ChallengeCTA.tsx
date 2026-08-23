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
      <div className="h-11 rounded-xl bg-white/[0.06] border border-white/[0.1] animate-pulse" />
    );
  }

  if (!isSignedIn) {
    return (
      <Link
        href={`/sign-in?redirect_url=${encodeURIComponent(challengeUrl)}`}
        onClick={handleClick}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/[0.14] bg-white/[0.04] px-5 text-[13.5px] font-bold text-white transition-colors hover:border-brand-600 hover:text-brand-600"
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
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[13.5px] font-bold text-[#060606] transition-colors hover:bg-brand-400"
    >
      <Swords className="w-4 h-4" /> I can beat this score
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
