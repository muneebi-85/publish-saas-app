import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { Topbar } from '@/components/dashboard/Topbar';
import { ReferralAttacher } from '@/components/referral/ReferralAttacher';
import { AuthProvider } from '@/components/auth/AuthProvider';

/**
 * Clerk context is mounted here rather than in the root layout, because every
 * signed-in surface below this point reads it (Sidebar, Topbar, the quota hooks)
 * while the marketing and legal pages read nothing and should stay statically
 * rendered. See `src/components/auth/AuthProvider.tsx`.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-surface-canvas">
        {/* Signed-in only: pend any referral code captured before sign-up. */}
        <ReferralAttacher />
        <div className="hidden md:flex print:hidden">
          <Sidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="print:hidden">
            <MobileNav />
            <div className="hidden md:block">
              <Topbar />
            </div>
          </div>
          <main className="flex-1 px-4 sm:px-8 lg:px-10 py-8 max-w-[1600px] w-full mx-auto print:max-w-none print:px-0">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
