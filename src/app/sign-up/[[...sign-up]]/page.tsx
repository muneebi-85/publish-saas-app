'use client';

import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-surface-canvas px-4 py-12">
      <div className="text-2xl font-semibold tracking-tight text-ink-900">
        Polish
      </div>
      <SignUp
        appearance={{
          elements: {
            card: 'shadow-none border border-ink-200',
          },
        }}
      />
    </main>
  );
}
