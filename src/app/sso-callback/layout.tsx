import React from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';

/**
 * Clerk context for this route only. It used to come from the root layout, which
 * forced every page in the app to render dynamically — see the note in
 * `src/components/auth/AuthProvider.tsx`. This subtree needs it because of
 * `AuthenticateWithRedirectCallback`, which is a Clerk component.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
