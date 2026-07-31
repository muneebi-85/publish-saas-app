'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Youtube, Lock, Plug, Trash2, RefreshCw, ExternalLink, Video } from 'lucide-react';

/**
 * Connected channels — real rows only.
 *
 * A platform card shows a connection only when a matching Channel row exists
 * for the user. Counts come from the platform API at connect/refresh time and
 * are never invented; a channel that returned no number reads "Not measured"
 * rather than a fabricated figure.
 */

type Channel = {
  id: string;
  platform: string;
  name: string;
  url: string | null;
  avatarUrl: string | null;
  subscribers: number;
  videosCount: number;
  viewsCount: number;
  updatedAt: string;
};

const PLATFORMS = [
  { key: 'YOUTUBE', name: 'YouTube', benefit: 'Track watch-time signals and monetization health on every upload.', icon: <Youtube className="w-6 h-6" strokeWidth={2} />, chip: 'bg-crimson-50 text-crimson-600' },
  { key: 'TIKTOK', name: 'TikTok', benefit: 'Spot trending hooks and flag risks before your video goes live.', icon: <Video className="w-5 h-5" strokeWidth={2} />, chip: 'bg-ink-900 text-white' },
] as const;

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : null);

export default function ChannelsClient({ initialChannels }: { initialChannels: Channel[] }) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [busy, setBusy] = useState<{ platform: string | null }>({ platform: null });
  const [error, setError] = useState('');

  async function connect(platform: string) {
    setBusy({ platform });
    setError('');
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Connection failed.');
      setChannels((prev) => [data.channel, ...prev.filter((c) => c.id !== data.channel?.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setBusy({ platform: null });
    }
  }

  async function refresh(channel: Channel) {
    // Re-running connect re-reads the platform API and updates the same row.
    await connect(channel.platform);
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this channel? Past reports are kept.')) return;
    try {
      const res = await fetch(`/api/channels?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to disconnect channel.');
      }
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect channel.');
    }
  }

  const connected = PLATFORMS.filter((p) => channels.some((c) => c.platform === p.key)).length;

  return (
    <div className="animate-enter">
      <PageHeader
        title="Connected Channels"
        subtitle="Connect a platform to pull its real counts and unlock channel-wide insights."
        showUtility
      />

      <Card padded className="mb-6 flex items-start gap-3 bg-brand-50 border-brand-100">
        <div className="w-9 h-9 rounded-xl bg-white border border-brand-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-brand-600" />
        </div>
        <div>
          <p className="text-[13.5px] font-semibold text-ink-900">Read-only and secure</p>
          <p className="text-[13px] text-ink-600 mt-0.5 leading-relaxed max-w-2xl">
            We request read-only access to your public analytics, and numbers come straight from the
            platform API. Publish never posts, edits, or deletes on your behalf — disconnect anytime.
          </p>
        </div>
      </Card>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-[12px] font-semibold text-brand-600 inline-flex items-center gap-1.5">
          <Plug className="w-3.5 h-3.5" />
          {connected} of {PLATFORMS.length} connected
        </span>
      </div>

      {error && <p className="mb-4 text-[12.5px] font-medium text-crimson-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORMS.map((p) => {
          const channel = channels.find((c) => c.platform === p.key);
          const subscribers = channel ? fmt(channel.subscribers) : null;
          return (
            <Card key={p.key} hover className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${p.chip}`}>
                    {p.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-[15px] font-bold tracking-tight text-ink-900">{p.name}</h3>
                    {channel ? (
                      <Badge variant="success" dot className="mt-1">Connected</Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1">Not connected</Badge>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[13px] text-ink-600 mt-4 leading-relaxed flex-1">{p.benefit}</p>

              <div className="mt-5 pt-4 border-t border-ink-100">
                {channel ? (
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink-900 truncate flex items-center gap-1.5">
                        {channel.name}
                        {channel.url && (
                          <Link href={channel.url} target="_blank" rel="noopener noreferrer" className="text-ink-400 hover:text-ink-700">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                      <div className="text-[12px] text-ink-500 mt-0.5 tabular-nums">
                        {subscribers ? `${subscribers} subscribers` : 'Subscribers not measured'}
                        {channel.videosCount > 0 ? ` · ${fmt(channel.videosCount)} videos` : ''}
                      </div>
                      <div className="text-[11px] text-ink-400 mt-1">
                        Synced {new Date(channel.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost" size="sm"
                        isLoading={busy.platform === p.key}
                        onClick={() => refresh(channel)}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      >
                        Refresh
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => disconnect(channel.id)}
                        leftIcon={<Trash2 className="w-3.5 h-3.5 text-crimson-600" />}
                        aria-label={`Disconnect ${p.name}`}
                      >
                        <span className="text-crimson-600">Disconnect</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="secondary" size="sm" full
                    isLoading={busy.platform === p.key}
                    onClick={() => connect(p.key)}
                    aria-label={`Connect ${p.name}`}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2 text-[12px] text-ink-500">
        <Lock className="w-3.5 h-3.5 text-brand-600" />
        <span>More platforms are added as their approval scopes clear. You can also manage connections from Settings.</span>
      </div>
    </div>
  );
}
