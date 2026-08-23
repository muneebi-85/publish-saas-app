import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { SsoCallback } from '@/components/auth/SsoCallback';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Start analyzing and improving your videos with Publish.',
  robots: { index: false, follow: false },
};

/** Server component for the same reason as /sign-in — see the note there. */
export default function SignUpPage({ params }: { params: { 'sign-up'?: string[] } }) {
  if (params['sign-up']?.[0] === 'sso-callback') return <SsoCallback />;

  return (
    <AuthShell altPrompt="Already have an account?" altLabel="Log in" altHref="/sign-in">
      <SignUpForm />
    </AuthShell>
  );
}
