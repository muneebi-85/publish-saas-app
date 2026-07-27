'use client';

import React from 'react';
import { Card, StatTile } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import {
  TrendingUp, AlertTriangle, ShieldCheck, Youtube, Video, Instagram, Facebook, Linkedin,
  ArrowRight, ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

const METRICS = [
  { label: 'AdSense health',       value: '98%', hint: '+2.1% this month',       up: true  },
  { label: 'Copyright claims',     value: '0',   hint: 'None in last 90 days',   up: false },
  { label: 'Community strikes',    value: '0/3', hint: 'Clean record',            up: false },
  { label: 'Algorithm trust',      value: '94',  hint: 'High distribution tier',  up: true  },
];

const PLATFORMS: { name: string; score: number; status: string; icon: React.ElementType; color: 'success' | 'warning' | 'danger' }[] = [
  { name: 'YouTube',   score: 96, status: 'Monetized',       icon: Youtube,   color: 'success' },
  { name: 'TikTok',    score: 88, status: 'Active',          icon: Video,     color: 'success' },
  { name: 'Instagram', score: 82, status: 'Active',          icon: Instagram, color: 'success' },
  { name: 'Facebook',  score: 74, status: 'Review suggested', icon: Facebook,  color: 'warning' },
  { name: 'LinkedIn',  score: 91, status: 'Active',          icon: Linkedin,  color: 'success' },
];

const RECENT_FLAGS = [
  { video: 'Day in the Life Vlog',    issue: 'Background music matched a copyrighted track', severity: 'Low',    date: '2 days ago' },
  { video: 'Tech Review #42',         issue: 'Brand logo visible at 3:22 without disclosure',severity: 'Medium', date: '5 days ago' },
];

export default function ChannelAnalyticsPage() {
  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Health monitor</div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Channel health</h1>
          <p className="text-sm text-ink-500 mt-2 max-w-xl">
            Cross-platform monetization and algorithm signals for every channel you connect.
          </p>
        </div>
        <Badge variant="success" dot size="md">All channels healthy</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {METRICS.map((m) => (
          <StatTile
            key={m.label}
            label={m.label}
            value={m.value}
            hint={<>{m.up && <TrendingUp className="w-3 h-3 text-grass-600" />}<span>{m.hint}</span></>}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Platform scores */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Platform health scores</h3>
              <p className="text-xs text-ink-500 mt-0.5">Rolling 30-day monetization health across every connected platform.</p>
            </div>
            <Link href="/reports" className="text-[12.5px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 transition-colors">
              History <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.name} className="flex items-center gap-4 py-3 border-b border-ink-100 last:border-b-0">
                  <ScoreGauge score={p.score} size="sm" showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-ink-500" strokeWidth={1.75} />
                      <span className="text-[13.5px] font-medium text-ink-900">{p.name}</span>
                    </div>
                    <div className="text-[11.5px] text-ink-500 mt-0.5 tabular-nums">Score: {p.score} / 100</div>
                  </div>
                  <Badge variant={p.color} dot>{p.status}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Flags */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink-900">Recent flags</h3>
            <Badge variant="warning">{RECENT_FLAGS.length}</Badge>
          </div>
          {RECENT_FLAGS.length > 0 ? (
            <div className="space-y-2.5">
              {RECENT_FLAGS.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-canvas border border-ink-200">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    f.severity === 'Medium' ? 'bg-amber-500/10 text-amber-700' : 'bg-ink-100 text-ink-500'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-ink-900 truncate">{f.video}</div>
                    <div className="text-[12px] text-ink-600 mt-0.5 leading-relaxed">{f.issue}</div>
                    <div className="text-[11px] text-ink-400 mt-1.5">{f.date}</div>
                  </div>
                  <Badge variant={f.severity === 'Medium' ? 'warning' : 'default'}>{f.severity}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center">
              <ShieldCheck className="w-6 h-6 text-grass-600 mx-auto mb-2" />
              <div className="text-[13px] text-ink-700 font-medium">No flags — you&apos;re all clear</div>
            </div>
          )}
        </Card>
      </div>

      {/* Weekly digest CTA */}
      <Card className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Monitor every new upload automatically</h3>
          <p className="text-[13px] text-ink-600 mt-1.5 max-w-lg leading-relaxed">
            Connect your channels and we&apos;ll review each new video the moment it&apos;s scheduled — flagging risks
            before you publish, and sending a weekly digest of channel health.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="secondary" size="md" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Connect a channel
          </Button>
        </Link>
      </Card>
    </div>
  );
}
