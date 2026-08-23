'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Unlink, Video, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ChannelRow } from './useConnectChannel';

/**
 * Connected accounts — the platform accounts (Google for YouTube, TikTok for
 * TikTok) linked to the Clerk session.
 *
 * A channel card only ever shows a connection when a Channel row exists, but
 * that row is only refreshable while the underlying platform account is
 * linked. This panel makes the linked accounts visible and removable, and
 * removing one cascade-disconnects the channels that depend on it — otherwise
 * a card would keep claiming a connection that can no longer pull fresh
 * numbers. Past reports are kept either way.
 */

/** Clerk OAuth providers this feature can use, and what they power. */
export function isPlatformProvider(provider: string): boolean {
  return provider === 'oauth_google' || provider === 'oauth_tiktok';
}

export function providerMeta(provider: string): {
  name: string;
  platform: 'YOUTUBE' | 'TIKTOK' | null;
} {
  if (provider === 'oauth_google') return { name: 'Google', platform: 'YOUTUBE' };
  if (provider === 'oauth_tiktok') return { name: 'TikTok', platform: 'TIKTOK' };
  return { name: provider, platform: null };
}

const PLATFORM_LABEL: Record<string, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
};

/** Minimal structural slice of Clerk's ExternalAccountResource. */
type LinkedAccount = {
  id: string;
  provider: string;
  username?: string;
  emailAddress: string;
  destroy: () => Promise<void>;
};

function accountIdentifier(a: LinkedAccount): string {
  if (a.username) return `@${a.username.replace(/^@/, '')}`;
  if (a.emailAddress) return a.emailAddress;
  return 'Linked account';
}

function GoogleMark() {
  return (
    <span className="w-8 h-8 rounded-full bg-white border border-white/[0.12] flex items-center justify-center text-[13px] font-bold tracking-tight">
      <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC05]">G</span>
    </span>
  );
}

export default function ConnectedAccountsPanel({
  channels,
  disconnectChannel,
  onChannelRemoved,
}: {
  channels: ChannelRow[];
  disconnectChannel: (id: string) => Promise<boolean>;
  onChannelRemoved: (id: string) => void;
}) {
  const { user, isLoaded } = useUser();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Seed once per loaded user resource; removal updates the list locally.
  useEffect(() => {
    if (!user) return;
    setAccounts((user.externalAccounts ?? []).filter((a) => isPlatformProvider(a.provider)));
  }, [user]);

  async function removeAccount(account: LinkedAccount) {
    const meta = providerMeta(account.provider);
    const platform = meta.platform;
    const platformName = platform ? PLATFORM_LABEL[platform] : 'platform';
    if (!platform) return;

    if (
      !confirm(
        `Remove your ${meta.name} account? Publish will no longer be able to refresh your ` +
          `${platformName} channel counts, and any connected ${platformName} channel will be ` +
          `disconnected. Past reports are kept.`,
      )
    ) {
      return;
    }

    setRemoving(account.id);
    setError('');
    setNotice('');
    try {
      await account.destroy();
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));

      // Cascade-disconnect the channels that depended on this account, so no
      // card claims a connection that can no longer pull fresh numbers.
      const affected = channels.filter((c) => c.platform === platform);
      for (const ch of affected) {
        if (await disconnectChannel(ch.id)) onChannelRemoved(ch.id);
      }

      setNotice(`${meta.name} account removed.`);
    } catch (err) {
      // Clerk refuses when this is the user's only sign-in method.
      setError(
        err instanceof Error
          ? err.message
          : `Couldn't remove the ${meta.name} account. Try again.`,
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card padded className="mt-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-ink-200 flex items-center justify-center shrink-0">
          <Unlink className="w-4 h-4 text-brand-600" />
        </div>
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-ink-900">
            Connected accounts
          </h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            The platform accounts Publish uses to pull your channel numbers.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-medium text-crimson-700 inline-flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-[12.5px] font-medium text-grass-700 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          {notice}
        </p>
      )}

      {!isLoaded ? (
        <p className="mt-4 text-[12.5px] text-ink-500">Checking linked accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink-200 px-4 py-5">
          <p className="text-[13px] text-ink-600 leading-relaxed">
            No platform accounts linked yet. Connect a platform above — you&apos;ll be asked to
            authorize your Google or TikTok account, and it will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-ink-100">
          {accounts.map((account) => {
            const meta = providerMeta(account.provider);
            const platformName = meta.platform ? PLATFORM_LABEL[meta.platform] : null;
            return (
              <div key={account.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {account.provider === 'oauth_google' ? (
                    <GoogleMark />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-white/[0.06] text-white flex items-center justify-center">
                      <Video className="w-4 h-4" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink-900 truncate">
                      {meta.name}
                      <span className="text-ink-500 font-normal"> · {accountIdentifier(account)}</span>
                    </div>
                    <div className="text-[11.5px] text-ink-500">
                      {platformName ? `Powers your ${platformName} channel connection` : 'Linked account'}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={removing === account.id}
                  onClick={() => void removeAccount(account)}
                  className="text-crimson-700 hover:text-crimson-700 hover:bg-crimson-50 shrink-0"
                  aria-label={`Remove ${meta.name} account`}
                >
                  <span className="text-crimson-700">Remove</span>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-ink-100 flex items-center gap-2 text-[12px] text-ink-500">
        <Lock className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>
          Removing an account stops Publish from refreshing that platform&apos;s channels. Past
          reports are kept — you can reconnect anytime.
        </span>
      </div>
    </Card>
  );
}
