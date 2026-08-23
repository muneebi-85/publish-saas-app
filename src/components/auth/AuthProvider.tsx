import React from 'react';
import { ClerkProvider } from '@clerk/nextjs';

/**
 * Clerk's React context, mounted per subtree instead of at the app root.
 *
 * WHY NOT IN THE ROOT LAYOUT
 * --------------------------
 * `ClerkProvider` from @clerk/nextjs@5 is a server component whose body calls
 * `headers()` and `auth()` unconditionally (see
 * node_modules/@clerk/nextjs/dist/esm/app-router/server/ClerkProvider.js). A
 * dynamic API anywhere in a route's tree opts that route out of static
 * rendering, so mounting it in the root layout made EVERY page in the app
 * server-rendered on demand — including the eight legal policies, which contain
 * no per-user data at all. Next.js then correctly stamps
 * `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on
 * those responses, because a dynamically rendered page may embed session state.
 * The result was a set of never-changing documents that no browser, proxy, or CDN
 * was allowed to keep for even a second.
 *
 * Mounting the provider only where Clerk's hooks are actually called lets those
 * pages prerender at build time and be cached properly. It also stops clerk-js
 * from being downloaded on pages that have nothing to authenticate.
 *
 * WHERE IT IS MOUNTED
 * -------------------
 *   - app/(dashboard)/layout.tsx  — Sidebar/Topbar/quota hooks (useUser, useAuth)
 *   - app/sign-in, app/sign-up    — useSignIn / useSignUp
 *   - app/sso-callback            — AuthenticateWithRedirectCallback
 *   - app/share/[id]              — ChallengeCTA calls useUser
 *   - app/page.tsx                — already dynamic (it calls auth() itself), so
 *                                   the provider costs nothing there and keeps
 *                                   clerk-js warm for the sign-in click
 *
 * A client component that calls a Clerk hook outside those subtrees will throw
 * at runtime with Clerk's "useX can only be used within <ClerkProvider>". That is
 * the trade: the error is loud and immediate, and the fix is to add this wrapper
 * to the new route's layout.
 *
 * `telemetry={false}` is the one prop the old root-level provider set; keeping it
 * in a single place is why this wrapper exists rather than importing
 * ClerkProvider five times.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider telemetry={false}>{children}</ClerkProvider>;
}
