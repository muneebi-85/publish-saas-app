'use client';

import React, { useEffect, useState } from 'react';
import { Gift, Copy, Check, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { track } from '@/lib/analytics';

interface ReferralStatus {
  code: string;
  credits: number;
  signups: { name: string | null; at: string; rewarded: boolean }[];
}

/**
 * Settings → Referrals. Shows the user's unique share link, how many free
 * audits they've earned, who signed up through their link, and a form to attach
 * a code they received from someone else. Both sides earn one free audit per
 * referral.
 */
export function ReferralPanel() {
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSignups, setShowSignups] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // A non-OK response (429/500/expired session) must surface as the error
    // state, not be silently swallowed: `data && setStatus(...)` left the card
    // stuck on its literal "…" badge forever with no code, no link, and no
    // retry affordance, because only a network-level reject reached setError.
    let cancelled = false;
    void fetch('/api/referral')
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<ReferralStatus>;
        throw new Error(`referral status ${r.status}`);
      })
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch(() => { if (!cancelled) setError('Could not load your referral link — reload the page to retry.'); });
    return () => { cancelled = true; };
  }, []);

  // Origin computed where `window` is guaranteed to exist. Reading it during
  // render was safe only by luck (status is null on the server pass); any
  // refactor that seeds `status` from props would crash SSR on this line.
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const shareLink = status ? `${origin}/?ref=${status.code}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      void track('referral_link_copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable — select and copy the link manually.');
    }
  };

  const handleAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code || attaching) return;
    setAttaching(true);
    setAttachMsg(null);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not attach that code.');
      setAttachMsg({ kind: 'ok', text: `Done — you now have ${data.credits} free audit${data.credits === 1 ? '' : 's'}.` });
      setCodeInput('');
      void fetch('/api/referral')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStatus(d as ReferralStatus))
        .catch(() => undefined);
    } catch (err) {
      setAttachMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not attach that code.' });
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <p className="text-[12px] text-crimson-700 font-medium">{error}</p>}

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-panel text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink-900">
              Share Publish, earn free reviews
            </div>
            <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">
              When a creator signs up through your link, they get one free audit right away —
              you get yours once they run their first review. No cap on total referrals — just
              share your link.
            </p>
          </div>
          <Badge variant={status || error ? 'success' : 'outline'} dot={!!status}>
            {status
              ? `${status.credits} free audit${status.credits === 1 ? '' : 's'} earned`
              : error ? 'unavailable' : '…'}
          </Badge>
        </div>

        {status && (
          <div className="mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <code className="flex-1 min-w-0 rounded-lg border border-ink-300 bg-surface-canvas px-3.5 py-2.5 text-[13px] font-mono text-ink-900 truncate">
                {shareLink}
              </code>
              <Button size="sm" onClick={handleCopy} leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="text-[12px] text-ink-500 mt-2">
              Your code: <code className="font-mono text-brand-600 font-semibold">{status.code}</code> — paste it in DMs, bios, or video descriptions.
            </p>
          </div>
        )}
      </div>

      {status && status.signups.length > 0 && (
        <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSignups((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-ink-100 transition-colors"
          >
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-900">
              <Users className="w-4 h-4 text-brand-600" />
              {status.signups.length} signup{status.signups.length === 1 ? '' : 's'} from your link
            </span>
            {showSignups ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
          </button>
          {showSignups && (
            <ul className="divide-y divide-ink-200 border-t border-ink-200">
              {status.signups.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-[13px] text-ink-700">{s.name || 'New creator'}</span>
                  <span className="text-[12px] text-ink-500">
                    {new Date(s.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                    <span className={s.rewarded ? 'text-grass-700 font-medium' : 'text-ink-500'}>
                      {s.rewarded ? 'rewarded' : 'pending'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-5">
        <div className="text-[13px] font-semibold text-ink-900">Got a referral code?</div>
        <p className="text-[12px] text-ink-600 mt-1">
          Enter a friend&apos;s code to earn your own free audit.
        </p>
        <form onSubmit={handleAttach} className="mt-3 flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            maxLength={16}
            placeholder="e.g. AB2DEFGH"
            aria-label="Referral code"
            className="flex-1 min-w-0 bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] font-mono tracking-wider placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
          />
          <Button type="submit" size="sm" isLoading={attaching} disabled={!codeInput.trim()}>
            Claim free audit
          </Button>
        </form>
        {attachMsg && (
          <p className={`text-[12px] mt-2 font-medium ${attachMsg.kind === 'ok' ? 'text-grass-700' : 'text-crimson-700'}`}>
            {attachMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
