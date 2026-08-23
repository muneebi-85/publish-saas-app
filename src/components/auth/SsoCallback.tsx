'use client';

import React from 'react';
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';

/**
 * Landing strip for the OAuth round trip. The provider redirects here with the
 * grant in the URL; Clerk's callback component exchanges it for a session and
 * then navigates on, so there is nothing to render but a holding state.
 *
 * Both fallbacks point at the dashboard rather than back at the form: arriving
 * here means the provider already accepted the user, so bouncing them to a login
 * card would read as a failure that did not happen.
 *
 * Deliberately NOT the same route as /sso-callback. That one is the
 * "link a platform account to the signed-in user" return leg (see
 * src/app/sso-callback/page.tsx) and defaults its destination to the channels
 * page. This one creates the session in the first place. Same Clerk component,
 * different flow — do not merge them.
 */
export const SsoCallback: React.FC = () => (
  <div className="flex min-h-svh items-center justify-center bg-white">
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    />
    <p className="flex items-center gap-2.5 text-[14.5px] text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      Finishing sign-in…
    </p>
  </div>
);
