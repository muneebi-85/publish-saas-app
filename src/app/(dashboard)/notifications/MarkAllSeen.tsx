'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

/**
 * Marks the activity feed as seen.
 *
 * There is no per-item read flag to write — read state is one timestamp — so
 * this is a single POST followed by a refresh. If the write fails the button
 * says so rather than silently pretending it worked.
 */
export const MarkAllSeen: React.FC<{ unread: number }> = ({ unread }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications', { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => router.refresh());
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (unread === 0 && !error) {
    return <span className="text-[13px] text-ink-500">All caught up</span>;
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-[12.5px] text-crimson-700">{error}</span>}
      <Button variant="ghost" onClick={run} isLoading={saving || pending} disabled={unread === 0}>
        Mark all as read
      </Button>
    </div>
  );
};
