'use client';

import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { AuthShell, clerkAppearance } from '@/components/auth/AuthShell';
import { Check } from 'lucide-react';

export default function SignUpPage() {
  return (
    <AuthShell
      heading="Create your account"
      subheading="Start with your first analysis free — no credit card required."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <SignUp path="/sign-up" signInUrl="/sign-in" appearance={clerkAppearance} />
      <ul className="mt-6 space-y-2">
        {['First analysis free', 'No credit card required', 'Cancel anytime'].map((f) => (
          <li key={f} className="flex items-center gap-2 text-[13px] text-ink-500">
            <Check className="w-4 h-4 text-brand-600 shrink-0" /> {f}
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
