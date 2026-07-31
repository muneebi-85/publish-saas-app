import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface-canvas bg-grid bg-[length:40px_40px]">
      <div className="hidden md:flex print:hidden">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="print:hidden">
          <MobileNav />
        </div>
        <main className="flex-1 px-4 sm:px-8 lg:px-10 py-7 max-w-[1600px] w-full mx-auto print:max-w-none print:px-0">
          {children}
        </main>
      </div>
    </div>
  );
}
