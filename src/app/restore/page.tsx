'use client';

import React, { useState } from 'react';
import { CheckCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

type State = 'idle' | 'loading' | 'found' | 'not_found' | 'error' | 'unauthenticated';

export default function RestorePurchasePage() {
  const [state, setState] = useState<State>('idle');
  const [plan, setPlan] = useState('');

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    try {
      const res = await fetch('/api/billing/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No email in body — server uses the authenticated session email only.
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.status === 401) { setState('unauthenticated'); return; }
      if (res.ok && data.found) { setPlan(data.plan ?? 'Pro'); setState('found'); }
      else if (res.status === 404) setState('not_found');
      else setState('error');
    } catch { setState('error'); }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/"><Logo /></Link>
        </div>

        <Card className="text-center">
          <div className="w-10 h-10 rounded-xl bg-ink-100 text-ink-700 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 mt-4">
            Restore your purchase
          </h1>
          <p className="text-[13px] text-ink-500 mt-2 leading-relaxed">
            Paid but your plan isn&apos;t showing? Sign in first, then click below — we&apos;ll
            match your account email to your Lemon Squeezy subscription and reactivate it.
          </p>

          {state === 'found' ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-center gap-2 text-grass-700">
                <CheckCircle className="w-5 h-5" />
                <span className="text-[14px] font-semibold">Subscription restored!</span>
              </div>
              <p className="text-[13px] text-ink-600">
                Your <strong>{plan}</strong> plan is now active.
              </p>
              <Link href="/dashboard">
                <Button full rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Go to dashboard
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRestore} className="mt-6 space-y-3">
              {state === 'unauthenticated' && (
                <div className="rounded-xl bg-amber-50 border border-amber-500/15 p-3 text-[12.5px] text-amber-800 text-left">
                  You need to be signed in to restore a purchase.{' '}
                  <Link href="/sign-in" className="underline font-medium">Sign in →</Link>
                </div>
              )}
              {state === 'not_found' && (
                <div className="rounded-xl bg-amber-50 border border-amber-500/15 p-3 text-[12.5px] text-amber-800 text-left">
                  No active subscription found for your account email. Check the receipt from
                  Lemon Squeezy for the exact address used, or contact{' '}
                  <a href="mailto:billing@genapps.online" className="underline">billing@genapps.online</a>.
                </div>
              )}
              {state === 'error' && (
                <div className="rounded-xl bg-crimson-50 border border-crimson-500/15 p-3 text-[12.5px] text-crimson-800 text-left">
                  Something went wrong. Please try again or email{' '}
                  <a href="mailto:billing@genapps.online" className="underline">billing@genapps.online</a>.
                </div>
              )}
              <Button
                type="submit"
                full
                isLoading={state === 'loading'}
                leftIcon={state === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              >
                {state === 'loading' ? 'Looking up…' : 'Restore my purchase'}
              </Button>
              <p className="text-[11.5px] text-ink-400">
                You must be signed in with the email used at checkout.
              </p>
            </form>
          )}
        </Card>

        <p className="text-center text-[12px] text-ink-500 mt-6">
          Need help?{' '}
          <a href="mailto:billing@genapps.online" className="underline hover:text-ink-900">
            billing@genapps.online
          </a>
        </p>
      </div>
    </div>
  );
}
