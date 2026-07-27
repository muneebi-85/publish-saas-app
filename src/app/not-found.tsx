import Link from 'next/link';
import { Compass, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-canvas text-ink-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-8"><Logo /></div>
        <div className="font-mono text-[11px] font-semibold text-ink-400 uppercase tracking-widest">404</div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] mt-3">
          Nothing to review here.
        </h1>
        <p className="text-sm text-ink-500 mt-3 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist — or it was renamed, moved, or is still on
          the roadmap.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <Link href="/">
            <Button variant="secondary" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>Home</Button>
          </Link>
          <Link href="/dashboard">
            <Button leftIcon={<Compass className="w-3.5 h-3.5" />}>Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
