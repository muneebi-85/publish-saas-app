'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { parseOAuthReturn, stripFlowParams } from '@/lib/oauth-return';

/**
 * Client state for one connected channel row, as returned by /api/channels.
 */
export type ChannelRow = {
  id: string;
  platform: string;
  name: string;
  url: string | null;
  subscribers: number;
  videosCount: number;
  viewsCount: number;
  updatedAt: string;
};

/** Clerk OAuth strategy and short provider name for each platform. */
const OAUTH_STRATEGY: Record<string, 'oauth_google' | 'oauth_tiktok'> = {
  YOUTUBE: 'oauth_google',
  TIKTOK: 'oauth_tiktok',
};

const OAUTH_NAME: Record<string, string> = {
  YOUTUBE: 'Google',
  TIKTOK: 'TikTok',
};

const PLATFORM_LABEL: Record<string, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
};

/**
 * The URL the user lands on after the OAuth round trip, with the platform
 * attached as `?connect=` (or `&connect=` when redirectTo already has a query,
 * e.g. '/settings?tab=channels'). Built with a URL object so the query join is
 * always correct. Exported for unit tests.
 */
export function buildConnectReturnUrl(
  origin: string,
  redirectTo: string,
  platform: string,
): string {
  const url = new URL(origin + redirectTo);
  url.searchParams.set('connect', platform);
  return url.toString();
}

/**
 * Shared "add a channel" logic for the Connected Channels page and the
 * Settings → Channels card (both are the same feature).
 *
 * Connect flow
 * ────────────
 * 1. POST /api/channels with the platform. When the platform account is
 *    already linked to the Clerk session, the row is created/updated directly.
 * 2. The API answers 428 `connectRequired` when no OAuth token exists yet.
 *    The hook then starts Clerk's account-linking flow via
 *    `user.createExternalAccount(...)`, which sends the user to Google/TikTok
 *    and back through /sso-callback (AuthenticateWithRedirectCallback).
 * 3. The callback lands the user back on `redirectTo?connect=<PLATFORM>`.
 *    On mount this hook sees the param, retries the connect — now with a token
 *    present — and strips the param so a refresh does not re-fire.
 *
 * The OAuth escalation is never retried silently: the mount-time auto-connect
 * passes `allowOAuth: false`, so a cancelled provider flow shows an error
 * instead of looping the user through Google/TikTok again.
 */
export function useConnectChannel(
  redirectTo: string,
  onChannel?: (channel: ChannelRow) => void,
) {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onChannelRef = useRef(onChannel);
  onChannelRef.current = onChannel;

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const startOAuth = useCallback(
    async (platform: string): Promise<boolean> => {
      const strategy = OAUTH_STRATEGY[platform];
      if (!user || !strategy) {
        // Clerk has not hydrated yet — do not leave the spinner running.
        setPending(null);
        return false;
      }
      const origin = window.location.origin;
      // Where the user lands after the provider + Clerk handshake. The
      // `connect` param tells the page to finish the connection on mount.
      const finalUrl = buildConnectReturnUrl(origin, redirectTo, platform);
      const callbackUrl = `${origin}/sso-callback?redirect_url=${encodeURIComponent(finalUrl)}`;
      try {
        await user.createExternalAccount({ strategy, redirectUrl: callbackUrl });
        // Reached only when the flow completes without navigating away (popup
        // mode). In redirect mode the page unloads here, so this is unreachable.
        return true;
      } catch {
        setError(
          `We couldn't start the ${OAUTH_NAME[platform] ?? 'platform'} sign-in. ` +
            `That connection may not be enabled on this deployment yet — contact support.`,
        );
        setPending(null);
        return false;
      }
    },
    [user, redirectTo],
  );

  const connectImpl = useCallback(
    async (platform: string, allowOAuth: boolean): Promise<boolean> => {
      setPending(platform);
      setError('');
      setNotice('');
      try {
        const res = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 428 && data.connectRequired) {
          if (!allowOAuth) {
            setPending(null);
            setError(
              `Connect your ${OAUTH_NAME[platform] ?? 'platform'} account first, then try again.`,
            );
            return false;
          }
          const linked = await startOAuth(platform);
          if (!linked) return false;
          // The linking completed without a page navigation — retry with the
          // token that now exists, but never loop into OAuth again.
          return connectImpl(platform, false);
        }

        if (!res.ok) throw new Error(data.error || 'Connection failed.');
        if (data.channel) onChannelRef.current?.(data.channel as ChannelRow);
        setNotice(`${PLATFORM_LABEL[platform] ?? platform} connected.`);
        setPending(null);
        return true;
      } catch (err) {
        setPending(null);
        setError(err instanceof Error ? err.message : 'Connection failed.');
        return false;
      }
    },
    [startOAuth],
  );

  const connect = useCallback(
    (platform: string, opts?: { allowOAuth?: boolean }) =>
      connectImpl(platform, opts?.allowOAuth ?? true),
    [connectImpl],
  );

  const disconnect = useCallback(async (id: string): Promise<boolean> => {
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/channels?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to disconnect channel.');
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect channel.');
      return false;
    }
  }, []);

  // Return-trip handling: the user is back from the provider with either a
  // pending connection (?connect=YOUTUBE) or a failed handshake (?error=...).
  // The parse + URL-stripping live in src/lib/oauth-return.ts (unit-tested);
  // this effect only applies the outcome to the UI.
  useEffect(() => {
    const ret = parseOAuthReturn(searchParams);
    if (ret.kind === 'none') return;

    if (ret.kind === 'error') {
      // A failed/cancelled handshake. Skip the auto-connect so this message is
      // not immediately overwritten by the connect attempt's own error text.
      setError(ret.message);
    } else {
      // No OAuth escalation here: if the provider flow was cancelled there is
      // still no token, and the error above explains why nothing happened.
      void connectImpl(ret.platform, false);
    }

    // Strip the flow params so a refresh does not re-fire the connect.
    router.replace(stripFlowParams(searchParams, window.location.pathname), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, error, notice, connect, disconnect };
}
