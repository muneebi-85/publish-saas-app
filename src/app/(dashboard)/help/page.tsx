'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, FileText, ExternalLink, Mail, Keyboard, Search, BookOpen, Zap,
  Shield, ArrowRight, ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const DOCS = [
  { title: 'Getting started',           desc: 'Run your first review from upload to PDF.',                        icon: BookOpen },
  { title: 'Understanding scores',      desc: 'What Low / Medium / High risk actually means.',                    icon: FileText },
  { title: 'Platform policy explainers', desc: 'YouTube 2026, TikTok Creator Rewards, Meta In-Stream, LinkedIn.', icon: Shield },
  { title: 'API documentation',         desc: 'Wire Publish into your rendering or CMS pipeline.',                icon: ExternalLink },
  { title: 'Webhook events',            desc: 'Get notified when a review completes.',                            icon: Zap },
  { title: 'Keyboard shortcuts',        desc: 'Move through the dashboard without touching a mouse.',             icon: Keyboard },
];

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open command palette' },
  { keys: ['⌘', 'U'], desc: 'Start a new review' },
  { keys: ['⌘', 'D'], desc: 'Go to dashboard' },
  { keys: ['⌘', '/'], desc: 'Search projects' },
  { keys: ['G', 'P'], desc: 'Go to projects' },
  { keys: ['G', 'R'], desc: 'Go to reports' },
  { keys: ['Esc'],    desc: 'Close open panel' },
  { keys: ['?'],      desc: 'Show shortcuts' },
];

const FAQ = [
  { q: 'How long does a review take?', a: 'Roughly 11 minutes for a full multi-asset audit. Script-only reviews finish in under a minute.' },
  { q: 'Can I re-run a review after fixing issues?', a: 'Yes, unlimited re-runs on any plan. Only new reviews count against your monthly quota.' },
  { q: 'Do you keep my files?', a: 'Yes, so you can revisit reports. Delete any project permanently from Settings → Data.' },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="space-y-8 animate-enter max-w-4xl mx-auto">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 mb-2">Support</div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950">Help &amp; docs</h1>
        <p className="text-sm text-ink-500 mt-2">Everything you need to get more out of Publish.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the docs — try &lsquo;yellow icon&rsquo; or &lsquo;webhooks&rsquo;"
          className="w-full bg-white border border-ink-200 rounded-xl pl-11 pr-4 h-12 text-[14px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
        />
      </div>

      {/* Docs grid */}
      <div>
        <h2 className="text-sm font-semibold text-ink-900 mb-3">Browse topics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger">
          {DOCS.map((doc) => {
            const Icon = doc.icon;
            return (
              <Card key={doc.title} hover className="cursor-pointer group">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-ink-100 flex items-center justify-center shrink-0 group-hover:bg-ink-900 group-hover:text-white transition-colors">
                    <Icon className="w-4 h-4 text-ink-700 group-hover:text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[14px] font-semibold text-ink-900">{doc.title}</h3>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-ink-900 transition-colors" />
                    </div>
                    <p className="text-[12.5px] text-ink-500 mt-0.5 leading-relaxed">{doc.desc}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-sm font-semibold text-ink-900 mb-3">Common questions</h2>
        <Card padded={false}>
          <div className="divide-y divide-ink-100">
            {FAQ.map((f, i) => (
              <div key={i} className="p-5">
                <div className="text-[13.5px] font-medium text-ink-900">{f.q}</div>
                <div className="text-[13px] text-ink-600 mt-1.5 leading-relaxed">{f.a}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Shortcuts */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="w-3.5 h-3.5 text-ink-500" />
          <h3 className="text-sm font-semibold text-ink-900">Keyboard shortcuts</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-2 border-b border-ink-100 last:border-b-0">
              <span className="text-[13px] text-ink-600">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center bg-ink-100 border border-ink-200 rounded text-[10.5px] font-mono text-ink-700"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Contact */}
      <Card className="bg-ink-950 border-ink-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-white">Still stuck?</h3>
              <p className="text-[13px] text-ink-400 mt-1 max-w-md leading-relaxed">
                Reach a human at <a className="text-white underline underline-offset-4" href="mailto:support@publish.so">support@publish.so</a> —
                Pro and Agency customers get a reply within 4 business hours.
              </p>
            </div>
          </div>
          <Link href="mailto:support@publish.so">
            <Button className="bg-white text-ink-900 hover:bg-ink-100" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Email support
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
