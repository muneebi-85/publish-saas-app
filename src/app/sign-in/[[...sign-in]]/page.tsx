import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { SsoCallback } from '@/components/auth/SsoCallback';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Publish account.',
  robots: { index: false, follow: false },
};

/**
 * A server component, so the shell, the logo and the heading are prerendered
 * HTML — the browser paints the card before it has parsed any JavaScript. Only
 * SignInForm hydrates.
 *
 * The route stays a catch-all because the OAuth redirect lands on a child path.
 */
export default function SignInPage({ params }: { params: { 'sign-in'?: string[] } }) {
  if (params['sign-in']?.[0] === 'sso-callback') return <SsoCallback />;

  return (
    <AuthShell altPrompt="New to Publish?" altLabel="Sign up" altHref="/sign-up">
      <SignInForm />
    </AuthShell>
  );
}
