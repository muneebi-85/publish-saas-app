'use client';

import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { AuthShell, clerkAppearance } from '@/components/auth/AuthShell';

export default function SignInPage() {
  return (
    <AuthShell
      heading="Welcome back"
      subheading="Sign in to continue analyzing your content."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-brand-600 hover:text-brand-700">
            Sign up free
          </Link>
        </>
      }
    >
      <SignIn path="/sign-in" signUpUrl="/sign-up" appearance={clerkAppearance} />
    </AuthShell>
  );
}
