'use client';

/**
 * Settings.
 *
 * Every control on this page is wired to something real. Sections that used to
 * render invented state (a fabricated API key, a fake team roster, "TOTP app
 * enrolled 3 months ago") are gone rather than mocked — a settings screen that
 * lies about the state of an account is worse than one that omits it.
 *
 * Identity (email, password, 2FA, devices) is owned by Clerk, so those controls
 * open Clerk's own account UI instead of re-implementing them here.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import {
  Check, Plus, Shield, LogOut, Youtube, Instagram, Facebook,
  Linkedin, Video, User as UserIcon, CreditCard, Bell, Lock, Sparkles,
  AlertTriangle, X, Gift, Trophy,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataPrivacyPanel } from '@/components/settings/DataPrivacyPanel';
import { useConnectChannel } from '@/components/channels/useConnectChannel';
import { ReferralPanel } from '@/components/referral/ReferralPanel';
import { PLANS, planDisplayName } from '@/lib/plans';

export interface SettingsUser {
  name: string;
  email: string;
  avatar: string;
  plan: string;
  auditsUsed: number;
  auditsLimit: number;
  periodEnd: string | null;
  productEmails: boolean;
  leaderboardOptIn: boolean;
  deleteScheduledAt: string | null;
}

export interface SettingsChannel {
  id: string;
  platform: string;
  name: string;
  url: string | null;
  subscribers: number;
}

const SECTIONS = [
  { id: 'profile',       label: 'Profile',        icon: UserIcon },
  { id: 'billing',       label: 'Billing & plan', icon: CreditCard },
  { id: 'channels',      label: 'Channels',       icon: Youtube },
  { id: 'referrals',     label: 'Referrals',      icon: Gift },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  // The leaderboard card sits between Notifications and Security; giving it a
  // nav entry also makes ?tab=community resolve like every other section.
  { id: 'community',     label: 'Community',      icon: Trophy },
  { id: 'security',      label: 'Security',       icon: Lock },
  { id: 'privacy',       label: 'Data & privacy', icon: Shield },
];

// The included-features list IS the catalogue (PLANS[plan].features) rather
// than a local copy. This file used to carry its own invented list — "single
// channel", "priority queue", channel-count caps nothing enforces — which
// disagreed with both the server and the pricing page, exactly the drift
// `plans.ts` exists to make impossible.
const featuresFor = (plan: string): string[] =>
  (PLANS as Record<string, { features: string[] } | undefined>)[plan]?.features ??
  PLANS.free.features;

export default function SettingsClient({
  user,
  initialChannels = [],
}: {
  user: SettingsUser;
  initialChannels?: SettingsChannel[];
}) {
  const { openUserProfile, signOut } = useClerk();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState('profile');
  const [portalError, setPortalError] = useState<string | null>(null);

  // Deep links (e.g. /settings?tab=billing from notifications, the pricing
  // footer, and the billing portal redirect) must land on the right section —
  // and the portal's ?error= reason must be surfaced, not silently dropped.
  // Every section renders in one scrollable column, so "landing on" a section
  // means scrolling to it, not merely highlighting its nav entry: without the
  // scroll, ?tab=privacy highlighted a nav item the user never saw.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && SECTIONS.some((s) => s.id === tab)) {
      setActiveSection(tab);
      // Native anchor scrolling covers the #hash form of the same link.
      document.getElementById(tab)?.scrollIntoView({ block: 'start' });
    }

    const reason = searchParams.get('error');
    if (reason) {
      const messages: Record<string, string> = {
        no_subscription: 'No active subscription found for this account.',
        unauthorized: 'You must be signed in to manage your subscription.',
        rate_limited: 'Too many attempts. Please try again in a minute.',
        portal_unavailable: 'The customer portal is unavailable right now. Try again shortly.',
        billing_not_configured: 'Billing is not configured on this deployment yet.',
      };
      setPortalError(messages[reason] ?? 'The customer portal could not be opened.');
    }
  }, [searchParams]);

  // Profile
  const [name, setName] = useState(user.name);
  // The last value the server confirmed, so the save button can disable on
  // "no pending change" even though the `user.name` prop never updates after
  // a save (it is a server component's snapshot).
  const [savedName, setSavedName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Notification preference
  const [productEmails, setProductEmails] = useState(user.productEmails);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState('');

  // Public leaderboard opt-in
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(user.leaderboardOptIn);
  const [savingLeaderboard, setSavingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  // Channels — the same connect/OAuth flow as the Connected Channels page.
  const [channelsList, setChannelsList] = useState<SettingsChannel[]>(initialChannels);
  const [isConnecting, setIsConnecting] = useState(false);
  const [newPlatform, setNewPlatform] = useState('YOUTUBE');
  const [newChannelLink, setNewChannelLink] = useState('');
  const { pending, error: connectError, notice, connect, disconnect } = useConnectChannel(
    '/settings?tab=channels',
    (channel) => setChannelsList((prev) => [channel, ...prev.filter((c) => c.id !== channel.id)]),
  );

  const plan = user.plan || 'free';
  const auditsUsed = user.auditsUsed ?? 0;
  const auditsLimit = user.auditsLimit ?? 1;
  const usagePct = Math.min(100, Math.round((auditsUsed / Math.max(1, auditsLimit)) * 100));
  const features = featuresFor(plan);
  // The catalogue display name ("Creator"), not the capitalized id.
  const planLabel = planDisplayName(plan);

  // The display name can legitimately be empty — fall back to the email local
  // part rather than inventing one.
  const fallbackName = user.email ? user.email.split('@')[0] : 'Your account';
  const displayName = user.name || fallbackName;
  const initial = (displayName[0] || 'C').toUpperCase();

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube': return Youtube;
      case 'tiktok': return Video;
      case 'instagram': return Instagram;
      case 'facebook': return Facebook;
      case 'linkedin': return Linkedin;
      default: return Youtube;
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setNameStatus(null);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your profile.');
      const confirmed = data.name ?? name;
      setName(confirmed);
      setSavedName(confirmed);
      setNameStatus({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      setNameStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save your profile.' });
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleProductEmails = async () => {
    const next = !productEmails;
    setProductEmails(next);          // optimistic — reverted below if the write fails
    setSavingPrefs(true);
    setPrefsError('');
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productEmails: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save your preference.');
      }
    } catch (err) {
      setProductEmails(!next);
      setPrefsError(err instanceof Error ? err.message : 'Could not save your preference.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleLeaderboard = async () => {
    const next = !leaderboardOptIn;
    setLeaderboardOptIn(next);
    setSavingLeaderboard(true);
    setLeaderboardError('');
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardOptIn: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save your preference.');
      }
    } catch (err) {
      setLeaderboardOptIn(!next);
      setLeaderboardError(err instanceof Error ? err.message : 'Could not save your preference.');
    } finally {
      setSavingLeaderboard(false);
    }
  };

  const handleConnectChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const link = newChannelLink.trim();
    if (!link) return;
    // The server resolves the pasted link through the platform's own public
    // endpoints, so the name and counts are read from the platform itself —
    // nothing here is an unverified claim about someone else's channel.
    if (await connect(newPlatform, { url: link, allowOAuth: false })) {
      setIsConnecting(false);
      setNewChannelLink('');
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Disconnect this channel? Past reports are kept.')) return;
    if (await disconnect(id)) {
      setChannelsList((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="animate-enter">
      <PageHeader
        title="Settings"
        subtitle="Manage your account, plan, and preferences."
        showUtility
      />

      {portalError && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          <span className="inline-flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {portalError}
          </span>
          <button
            type="button"
            onClick={() => setPortalError(null)}
            className="text-amber-700 hover:text-amber-950 shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        {/* Nav */}
        <nav className="lg:sticky lg:top-6 h-fit flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 border-b lg:border-b-0 lg:border-r border-ink-200 pb-2 lg:pb-0 lg:pr-6">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection(s.id);
                  // All sections live in one scrollable column, so selecting a
                  // section means scrolling to it. The URL keeps the selection
                  // via replaceState (no re-render), so refresh/back/forward
                  // land where the user was — not back on Profile.
                  document.getElementById(s.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', s.id);
                    window.history.replaceState(null, '', url);
                  } catch {
                    // History is a nicety here; never break the click.
                  }
                }}
                className={`flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-ink-100 text-ink-900 font-semibold'
                    : 'text-ink-600 font-medium hover:text-ink-900 hover:bg-ink-50'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-600' : 'text-ink-400'}`} />
                {s.label}
              </a>
            );
          })}
        </nav>

        {/* Content */}
        <div className="space-y-6 max-w-2xl">
          {/* Profile */}
          <Card>
            <SectionHead id="profile" title="Profile" desc="How you appear inside your workspace." />
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-ink-200">
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover bg-ink-100"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-brand-600 text-on-brand flex items-center justify-center font-semibold text-[16px]">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-ink-900 truncate">{displayName}</div>
                <div className="text-[12px] text-ink-500 truncate">{user.email || 'No email on file'}</div>
              </div>
              <Badge variant="success" dot>{planLabel} plan</Badge>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="display-name" className="text-[13px] font-medium text-ink-700 block mb-1.5">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder={fallbackName}
                    className="w-full bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="account-email" className="text-[13px] font-medium text-ink-700 block mb-1.5">
                    Email
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={user.email}
                    readOnly
                    disabled
                    className="w-full bg-surface-canvas border border-ink-200 rounded-lg h-9 px-3 text-[13px] text-ink-500 cursor-not-allowed"
                  />
                  <p className="text-[12px] text-ink-500 mt-1.5">
                    Managed by your sign-in method. Change it under Security.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-5">
                {nameStatus && (
                  <span className={`text-[12px] font-medium ${nameStatus.kind === 'ok' ? 'text-grass-700' : 'text-crimson-700'}`}>
                    {nameStatus.text}
                  </span>
                )}
                <Button type="submit" size="sm" isLoading={savingName} disabled={name === savedName && !nameStatus}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          {/* Billing & Plan */}
          <Card>
            <SectionHead id="billing" title="Billing & plan" desc="Your subscription, usage, and included features." />

            <div className="rounded-lg border border-ink-200 bg-surface-canvas p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                    <span className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">{planLabel} plan</span>
                    {plan !== 'free'
                      ? <Badge variant="success" size="sm">Active</Badge>
                      : <Badge variant="outline" size="sm">Free tier</Badge>}
                  </div>
                  <p className="text-[12px] text-ink-500 mt-1">
                    {plan === 'free'
                      ? 'Upgrade to unlock more analyses and advanced insights.'
                      : 'Your subscription is billed securely via Lemon Squeezy.'}
                    {user.periodEnd && (
                      <> Renews {new Date(user.periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}.</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {plan === 'free' ? (
                    <Link href="/pricing">
                      <Button size="sm">Upgrade</Button>
                    </Link>
                  ) : (
                    <Link href="/pricing">
                      <Button size="sm">Change plan</Button>
                    </Link>
                  )}
                  {/* prefetch={false}: this href is an API route that calls Lemon
                      Squeezy and consumes a rate-limit slot. Link prefetches on
                      viewport entry, so leaving it on would spend the budget
                      before the customer clicks — and could 429 the real click. */}
                  <Link
                    href={plan === 'free' ? '/pricing' : '/api/billing/portal'}
                    prefetch={false}
                  >
                    <Button variant="secondary" size="sm">Manage subscription</Button>
                  </Link>
                </div>
              </div>

              {/* Usage meter */}
              <div className="mt-5 pt-5 border-t border-ink-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-ink-700">Analyses this period</span>
                  <span className="text-[12px] font-semibold text-ink-900 tabular-nums">
                    {auditsUsed} / {auditsLimit}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${usagePct >= 100 ? 'bg-crimson-600' : usagePct >= 80 ? 'bg-amber-600' : 'bg-brand-600'}`}
                    style={{ width: `${usagePct}%` }}
                    role="progressbar"
                    // Clamped: referral credits can push usage past the plan's
                    // monthly allowance (they extend the wall), and
                    // aria-valuenow > aria-valuemax is an invalid ARIA state.
                    aria-valuenow={Math.min(auditsUsed, auditsLimit)}
                    aria-valuemin={0}
                    aria-valuemax={auditsLimit}
                    aria-label="Analyses used this period"
                  />
                </div>
                <p className="text-[12px] text-ink-500 mt-2">
                  {Math.max(0, auditsLimit - auditsUsed)} analyses remaining.{' '}
                  {user.periodEnd
                    ? <>Resets {new Date(user.periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}.</>
                    : <>Resets at the start of your next billing period.</>}
                </p>
              </div>

              {/* Features */}
              <div className="mt-5 pt-5 border-t border-ink-200">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-3">Included in your plan</div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-ink-700">
                      <Check className="w-4 h-4 text-brand-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {/* Referrals */}
          <Card>
            <SectionHead id="referrals" title="Referrals" desc="Earn a free review every time a creator signs up through your link." />
            <ReferralPanel />
          </Card>

          {/* Connected Channels */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <SectionHead id="channels" title="Connected channels" desc="Connect social profiles to monitor algorithm health." inline />
              <Button size="sm" onClick={() => setIsConnecting(!isConnecting)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                {isConnecting ? 'Cancel' : 'Connect channel'}
              </Button>
            </div>

            {/* The connect error is surfaced here (outside the connect form)
                too: a failed DISCONNECT also routes through this state, and
                with the form closed it would otherwise fail silently. */}
            {connectError && (
              <p className="text-[12px] text-crimson-700 font-medium mb-4" role="alert">{connectError}</p>
            )}

            {isConnecting && (
              <form onSubmit={handleConnectChannel} className="space-y-4 p-4 border border-ink-200 rounded-lg bg-surface-canvas mb-4">
                <div>
                  <label htmlFor="new-platform" className="text-[13px] font-medium text-ink-700 block mb-1.5">Platform</label>
                  <select
                    id="new-platform"
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full sm:max-w-xs bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
                  >
                    <option value="YOUTUBE">YouTube</option>
                    <option value="TIKTOK">TikTok</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-channel-link" className="text-[13px] font-medium text-ink-700 block mb-1.5">Channel link</label>
                  <input
                    id="new-channel-link"
                    type="text"
                    value={newChannelLink}
                    onChange={(e) => setNewChannelLink(e.target.value)}
                    placeholder={newPlatform === 'YOUTUBE' ? 'youtube.com/@yourname' : 'tiktok.com/@yourname'}
                    className="w-full sm:max-w-xs bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
                  />
                  <p className="text-[12px] text-ink-500 mt-2 leading-relaxed">
                    Paste your channel link or @handle. We read the channel name and public
                    counts directly from the platform — nothing else is needed.
                  </p>
                </div>
                {connectError && <p className="text-[12px] text-crimson-700 font-medium">{connectError}</p>}
                {notice && <p className="text-[12px] text-grass-700 font-medium">{notice}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setIsConnecting(false)}>Cancel</Button>
                  <Button type="submit" size="sm" isLoading={pending === newPlatform} disabled={!newChannelLink.trim()}>Connect</Button>
                </div>
              </form>
            )}

            {channelsList.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">
                  <Youtube className="w-5 h-5" />
                </div>
                <h4 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">No channels connected</h4>
                <p className="text-[13px] leading-relaxed text-ink-600 mt-2 max-w-sm">
                  Connect a social profile to track algorithm health and get tailored recommendations.
                </p>
                <div className="mt-4">
                  <Button size="sm" onClick={() => setIsConnecting(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                    Connect channel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-ink-200">
                {channelsList.map((c) => {
                  const PlatformIcon = getPlatformIcon(c.platform);
                  return (
                    <div key={c.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center">
                          <PlatformIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-ink-900">{c.name}</div>
                          <div className="text-[12px] text-ink-500 capitalize">
                            {c.platform}
                            {c.subscribers > 0 && <> · {c.subscribers.toLocaleString()} subscribers</>}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteChannel(c.id)} className="text-crimson-700 hover:text-crimson-700 hover:bg-crimson-50">Disconnect</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Notifications */}
          <Card>
            <SectionHead id="notifications" title="Notifications" desc="What we email you about." />
            <Toggle
              label="Product email"
              desc="Review-ready notices and quota warnings. Nothing else — we don't send a newsletter."
              on={productEmails}
              disabled={savingPrefs}
              onChange={handleToggleProductEmails}
            />
            {prefsError && <p className="text-[12px] text-crimson-700 font-medium mt-3">{prefsError}</p>}
            <p className="text-[12px] text-ink-500 mt-4 leading-relaxed border-t border-ink-200 pt-4">
              Billing and security email — failed payments, plan changes, deletion notices — is always sent.
              Suppressing it would leave you unable to act on a lapsed subscription or a change to your account.
            </p>
          </Card>

          {/* Community / leaderboard */}
          <Card>
            <SectionHead
              id="community"
              title="Community leaderboard"
              desc="Share your best scores on the public leaderboard."
            />
            <Toggle
              label="Show my scores on the public leaderboard"
              desc="When on, your highest-scoring reports appear on /community with a link to your score card. Off by default — your reports stay private until you choose."
              on={leaderboardOptIn}
              disabled={savingLeaderboard}
              onChange={handleToggleLeaderboard}
            />
            {leaderboardError && <p className="text-[12px] text-crimson-700 font-medium mt-3">{leaderboardError}</p>}
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-ink-200 bg-surface-canvas p-3.5">
              <Trophy className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-ink-600 leading-relaxed">
                Only the title, score, platform, and a link to your public score card are shown — never
                your script, fixes, or email. You can turn this off any time.
              </p>
            </div>
          </Card>

          {/* Security */}
          <Card>
            <SectionHead
              id="security"
              title="Security"
              desc="Password, two-factor authentication, and signed-in devices."
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-ink-200 bg-surface-canvas">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink-900">Account security</div>
                    <div className="text-[12px] text-ink-500">
                      Email, password, two-factor, and active devices.
                    </div>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => openUserProfile()}>Manage</Button>
              </div>
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-ink-200 bg-surface-canvas">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink-900">Sign out</div>
                    <div className="text-[12px] text-ink-500">Ends every session on this browser.</div>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { void signOut({ redirectUrl: '/' }); }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </Card>

          {/* Data & Privacy — GDPR/CCPA compliant self-serve (export + delete) */}
          <div id="privacy" className="space-y-5">
            <SectionHead title="Data & privacy" desc="Export, delete, cookies, and subscription controls." inline />
            <DataPrivacyPanel scheduledFor={user.deleteScheduledAt} />
          </div>
        </div>
      </div>
    </div>
  );
}

const SectionHead: React.FC<{ id?: string; title: string; desc: string; inline?: boolean }> = ({
  id, title, desc, inline = false,
}) => (
  <div id={id} className={inline ? '' : 'mb-5'}>
    <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">{title}</h3>
    <p className="text-[13px] leading-relaxed text-ink-600 mt-1">{desc}</p>
  </div>
);

const Toggle: React.FC<{
  label: string;
  desc: string;
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
}> = ({ label, desc, on, disabled = false, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <div className="text-[13px] font-medium text-ink-900">{label}</div>
      <div className="text-[12px] text-ink-500 mt-0.5">{desc}</div>
    </div>
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-10 h-6 rounded-full relative transition-colors shrink-0 disabled:opacity-60 ${on ? 'bg-brand-600' : 'bg-ink-200'}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-subtle transition-all duration-150 ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  </div>
);
