import { auth } from '@clerk/nextjs/server';
import { getUserPlanState } from '@/lib/session';
import LandingClient from './LandingClient';

export default async function LandingPage() {
  const { userId } = auth();
  let plan = 'free';
  let isLoggedIn = false;

  if (userId) {
    isLoggedIn = true;
    const state = await getUserPlanState(userId);
    plan = state.plan;
  }

  return <LandingClient isLoggedIn={isLoggedIn} plan={plan} />;
}
