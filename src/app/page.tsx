import { auth } from '@clerk/nextjs/server';
import { getUserPlanState } from '@/lib/session';
import { AuthProvider } from '@/components/auth/AuthProvider';
import LandingClient from './LandingClient';

/**
 * The landing page reads the session itself, so it is dynamically rendered no
 * matter what — which is why Clerk's provider is mounted here even though nothing
 * in `LandingClient` calls a Clerk hook. It costs nothing in render terms and it
 * starts clerk-js loading while the visitor reads the page, so the sign-in screen
 * they click through to is already holding a warm SDK instead of fetching it
 * after the navigation. Every other marketing surface (the legal policies) has no
 * provider and therefore prerenders — see `src/components/auth/AuthProvider.tsx`.
 */
export default async function LandingPage() {
  const { userId } = auth();
  let plan = 'free';
  let isLoggedIn = false;

  if (userId) {
    isLoggedIn = true;
    const state = await getUserPlanState(userId);
    plan = state.plan;
  }

  return (
    <AuthProvider>
      <LandingClient isLoggedIn={isLoggedIn} plan={plan} />
    </AuthProvider>
  );
}
