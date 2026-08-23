import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import SSOCallbackFallback from './SSOCallbackFallback';
import { safeRedirect } from '@/lib/oauth-return';

export const dynamic = 'force-dynamic';

/**
 * OAuth callback for the "connect a platform account" flow (see
 * src/components/channels/useConnectChannel.ts).
 *
 * The signed-in user is redirected here by Clerk after authorizing Google or
 * TikTok. `<AuthenticateWithRedirectCallback />` performs the authenticated
 * handshake that links the external account to the current user, then
 * navigates to the URL passed as `redirect_url` — the page they were on, with
 * `?connect=YOUTUBE` (or TIKTOK) appended so that page auto-finishes the
 * connection by calling POST /api/channels with the now-present token.
 *
 * `redirect_url` is only honored when it is a same-origin path: it must start
 * with a single `/`. Anything else (an absolute URL, `//host`, `/\`…) falls
 * back to the channels page, so a crafted link can never bounce a signed-in
 * user to an external origin. The guard itself lives in
 * src/lib/oauth-return.ts so it is unit-tested.
 */
export default function SSOCallbackPage({
  searchParams,
}: {
  searchParams: { redirect_url?: string };
}) {
  return (
    <>
      {/* `redirectUrl` is the post-handshake destination for this Clerk version
          (v5: AuthenticateWithRedirectCallback's only navigation prop). The
          OAuth return URL itself lives in the createExternalAccount call, not
          here. */}
      <AuthenticateWithRedirectCallback redirectUrl={safeRedirect(searchParams.redirect_url)} />
      <SSOCallbackFallback destination={safeRedirect(searchParams.redirect_url)} />
    </>
  );
}
