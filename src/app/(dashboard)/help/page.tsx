'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileText, ExternalLink, Mail, Keyboard, Search, BookOpen,
  ArrowRight, ChevronRight, CreditCard, Lock, User,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const CATEGORIES = [
  { title: 'Getting started',     desc: 'Run your first review from upload to PDF.',                        icon: BookOpen,     count: 8 },
  { title: 'Analyses & scores',   desc: 'What Low / Medium / High risk actually means.',                    icon: FileText,     count: 12 },
  { title: 'Billing & plans',     desc: 'Upgrades, invoices, cancellations, and refunds.',                  icon: CreditCard,   count: 6 },
  { title: 'Security & privacy',  desc: 'How your data is stored, encrypted, and deleted.',                 icon: Lock,         count: 5 },
  { title: 'Account & settings',  desc: 'Profile, notifications, and data controls.',                       icon: User,         count: 7 },
  { title: 'Support & contact',   desc: 'How to reach us, and what you can expect back.',                   icon: ExternalLink, count: 6 },
];

const POPULAR = [
  { title: 'How long does a review take?',                   href: '#faq-0' },
  { title: 'Can I re-run a review after fixing issues?',     href: '#faq-1' },
  { title: 'Do you keep my files?',                          href: '#faq-2' },
  { title: 'How do I export a PDF report?',                  href: '#faq-3' },
  { title: 'What platforms does Publish check against?',     href: '#faq-4' },
  { title: 'How do I delete my account and data?',           href: '#faq-5' },
];

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open the command palette' },
  { keys: ['Esc'],    desc: 'Close the command palette or open panel' },
];

const FAQ = [
  { q: 'How long does a review take?', a: 'Most reviews finish in under a minute. Uploading a video file adds time for processing, and every review runs six layers — script authenticity, hook retention, voice, thumbnail CTR, copyright exposure, and per-platform policy.' },
  { q: 'Can I re-run a review after fixing issues?', a: 'Yes — re-reviewing after applying fixes is the fastest way to improve. Each review (new or re-run) counts once against your monthly quota, and the trend line shows your score progress across runs.' },
  { q: 'Do you keep my files?', a: 'Yes, so you can revisit reports. Delete any project permanently from Settings → Data.' },
  { q: 'How do I export a PDF report?', a: 'Open any analysis and use the Export button in the top-right corner of the report. A printer-friendly PDF downloads instantly, with your scores and issue list included.' },
  { q: 'What platforms does Publish check against?', a: 'YouTube, TikTok, Instagram, Facebook, and LinkedIn — each with platform-specific rules for monetization, hook strength, retention, and SEO.' },
  { q: 'How do I delete my account and data?', a: 'Go to Settings → Data → Delete account. Your reports and files are purged within 30 days, and if you had a paid plan it is cancelled at the same time.' },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="animate-enter">
      <PageHeader
        title="Help Center"
        subtitle="Guides, FAQs, and support for getting the most out of Publish."
        showUtility
      />

      <div className="space-y-8 max-w-4xl">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs — try 'quota' or 'export'"
            className="w-full bg-white border border-ink-200 rounded-xl pl-11 pr-4 h-11 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
        </div>

        {/* Category grid */}
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900 mb-3">Browse topics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Card key={cat.title} hover className="cursor-pointer group">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center shrink-0 group-hover:bg-brand-600 transition-colors">
                      <Icon className="w-4 h-4 text-ink-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-ink-900">{cat.title}</h3>
                        <span className="text-[12px] text-ink-400 tabular-nums">{cat.count} articles</span>
                      </div>
                      <p className="text-[12.5px] text-ink-500 mt-0.5 leading-relaxed">{cat.desc}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Popular articles */}
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900 mb-3">Popular articles</h2>
          <Card padded={false}>
            <div className="divide-y divide-ink-100">
              {POPULAR.map((article) => (
                <Link
                  key={article.title}
                  href={article.href}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-ink-50 transition-colors group"
                >
                  <span className="text-[13.5px] text-ink-900 group-hover:text-brand-600 transition-colors">{article.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-brand-600 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900 mb-3">Common questions</h2>
          <Card padded={false}>
            <div className="divide-y divide-ink-100">
              {FAQ.map((f, i) => (
                <div key={i} id={`faq-${i}`} className="p-5">
                  <div className="text-[13.5px] font-semibold text-ink-900">{f.q}</div>
                  <div className="text-[13px] text-ink-600 mt-1.5 leading-relaxed">{f.a}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Shortcuts */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="w-4 h-4 text-ink-500" />
            <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">Keyboard shortcuts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {SHORTCUTS.map((s) => (
              <div key={s.desc} className="flex items-center justify-between py-2 border-b border-ink-100 last:border-b-0">
                <span className="text-[13px] text-ink-600">{s.desc}</span>
                <div className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center bg-ink-100 border border-ink-200 rounded text-[10.5px] font-sans text-ink-700"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Contact support */}
        <Card className="border-brand-100 bg-brand-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink-900">Still stuck?</h3>
                <p className="text-[13px] text-ink-600 mt-1 max-w-md leading-relaxed">
                  Reach a human at{' '}
                  <a className="text-brand-600 underline underline-offset-4 hover:text-brand-700" href="mailto:support@genapps.online">
                    support@genapps.online
                  </a>{' '}
                  — Pro and Agency customers get a reply within 4 business hours.
                </p>
              </div>
            </div>
            <Link href="mailto:support@genapps.online">
              <Button variant="dark" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Email support
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
