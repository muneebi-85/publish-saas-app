'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText, ExternalLink, Mail, Keyboard, Search, BookOpen,
  ArrowRight, ChevronRight, CreditCard, Lock, User,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/**
 * Help Center.
 *
 * The search input filters the FAQ list live (title + answer match). Category
 * cards set the same filter to their topic term, so clicking one behaves like
 * typing it. "N articles" is dropped: the FAQ below is the entire knowledge
 * base, and showing 44 phantom article counts was a lie.
 */
const CATEGORIES = [
  { title: 'Getting started',     term: 'review',        desc: 'Run your first review from upload to PDF.',   icon: BookOpen },
  { title: 'Analyses & scores',   term: 'score',         desc: 'What Low / Medium / High risk actually means.', icon: FileText },
  { title: 'Billing & plans',     term: 'subscription',  desc: 'Upgrades, invoices, cancellations, and refunds.', icon: CreditCard },
  { title: 'Security & privacy',  term: 'data',          desc: 'How your data is stored, encrypted, and deleted.', icon: Lock },
  { title: 'Account & settings',  term: 'settings',      desc: 'Profile, notifications, and data controls.',  icon: User },
  { title: 'Support & contact',   term: 'support',       desc: 'How to reach us, and what you can expect back.', icon: ExternalLink },
];

// Slug-keyed, not index-keyed: adding a question at the top of the FAQ used to
// silently re-point every one of these links at a DIFFERENT answer.
const POPULAR = [
  { title: 'How long does a review take?',                   href: '#faq-review-time' },
  { title: 'Can I re-run a review after fixing issues?',     href: '#faq-re-run-review' },
  { title: 'Do you keep my files?',                          href: '#faq-file-retention' },
  { title: 'How do I export a PDF report?',                  href: '#faq-export-pdf' },
  { title: 'What platforms does Publish check against?',     href: '#faq-platforms-checked' },
  { title: 'How do I delete my account and data?',           href: '#faq-delete-account' },
];

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open the command palette' },
  { keys: ['Esc'],    desc: 'Close the command palette or open panel' },
];

const FAQ = [
  { slug: 'review-time', q: 'How long does a review take?', a: 'Most reviews finish in under a minute. Uploading a video file adds time for processing, and every review runs six layers — script authenticity, hook retention, voice, thumbnail CTR, copyright exposure, and per-platform policy.' },
  { slug: 're-run-review', q: 'Can I re-run a review after fixing issues?', a: 'Yes — re-reviewing after applying fixes is the fastest way to improve. Each review (new or re-run) counts once against your monthly quota, and the trend line shows your score progress across runs.' },
  { slug: 'file-retention', q: 'Do you keep my files?', a: 'Yes, so you can revisit reports. Delete any project permanently from its card on the Projects page; export or delete all of your data from Settings → Data & privacy.' },
  { slug: 'export-pdf', q: 'How do I export a PDF report?', a: 'Open any analysis and use the Export PDF button in the top-right corner of the report. It opens a print-ready view of the full report — choose “Save as PDF” as the destination in the print dialog. Your scores and issue list are included.' },
  { slug: 'platforms-checked', q: 'What platforms does Publish check against?', a: 'YouTube, TikTok, Instagram, Facebook, and LinkedIn — each with platform-specific rules for monetization, hook strength, retention, and SEO.' },
  { slug: 'delete-account', q: 'How do I delete my account and data?', a: 'Go to Settings → Data → Delete account. Your reports and files are purged within 30 days, and if you had a paid plan it is cancelled at the same time.' },
  { slug: 'free-plan', q: 'How does the free plan work?', a: 'The free plan includes one review per month. No credit card is required to sign up, and your first analysis is always free.' },
  { slug: 'cancel-subscription', q: 'How do I cancel my subscription?', a: 'From Settings → Billing & plan → Manage subscription. Cancelling stops the next renewal; your data stays accessible for 30 days after the paid period ends.' },
  { slug: 'support', q: 'Where can I get support?', a: 'Email support@genapps.online. Paid plans get a reply within 4 business hours; the free plan is handled in the order it arrives.' },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  // Match against question + answer so searching "quota" finds the re-run
  // entry, whose answer mentions quota but whose title does not.
  const results = useMemo(() => {
    if (!isSearching) return FAQ.map((f, i) => ({ ...f, index: i }));
    const needle = trimmed.toLowerCase();
    return FAQ.map((f, i) => ({ ...f, index: i })).filter(
      (f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle),
    );
  }, [trimmed, isSearching]);

  // Real counts: how many FAQ entries a category term actually matches. A card
  // that matches nothing says so rather than advertising articles that do not exist.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of CATEGORIES) {
      const needle = cat.term.toLowerCase();
      counts.set(
        cat.title,
        FAQ.filter((f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle)).length,
      );
    }
    return counts;
  }, []);

  return (
    <div className="animate-enter">
      <PageHeader
        title="Help Center"
        subtitle="Guides, FAQs, and support for getting the most out of Publish."
        showUtility
      />

      <div className="space-y-6 max-w-4xl">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the FAQ — try 'quota' or 'export'"
            aria-label="Search the FAQ"
            className="w-full bg-surface-panel border border-ink-300 rounded-lg pl-10 pr-24 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-ink-500 hover:text-ink-900 px-2 py-1 rounded-md hover:bg-ink-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category grid — hidden while searching so the results are the focus */}
        {!isSearching && (
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mb-3">Browse topics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const count = categoryCounts.get(cat.title) ?? 0;
                return (
                  <button
                    key={cat.title}
                    type="button"
                    onClick={() => setQuery(cat.term)}
                    className="text-left rounded-xl shadow-xs border border-ink-200 bg-surface-panel p-5 group hover:border-ink-300 hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-ink-500 group-hover:text-ink-800 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-[14px] font-semibold text-ink-900">{cat.title}</h3>
                          <span className="text-[12px] text-ink-500 tabular-nums shrink-0">
                            {count} {count === 1 ? 'answer' : 'answers'}
                          </span>
                        </div>
                        <p className="text-[12px] text-ink-500 mt-0.5 leading-relaxed">{cat.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Popular articles — anchors into the FAQ, so hide them while filtered */}
        {!isSearching && (
          <div>
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900 mb-3">Popular questions</h2>
            <Card padded={false}>
              <div className="divide-y divide-ink-200">
                {POPULAR.map((article) => (
                  <Link
                    key={article.title}
                    href={article.href}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-ink-50 transition-colors group"
                  >
                    <span className="text-[13px] text-ink-900 group-hover:text-brand-600 transition-colors">{article.title}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-brand-600 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* FAQ */}
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              {isSearching ? 'Search results' : 'Common questions'}
            </h2>
            {isSearching && (
              <span className="text-[12px] text-ink-500 tabular-nums">
                {results.length} of {FAQ.length}
              </span>
            )}
          </div>

          {results.length > 0 ? (
            <Card padded={false}>
              <div className="divide-y divide-ink-200">
                {results.map((f) => (
                  <div key={f.slug} id={`faq-${f.slug}`} className="p-5">
                    <div className="text-[13px] font-semibold text-ink-900">{f.q}</div>
                    <div className="text-[13px] text-ink-600 mt-1.5 leading-relaxed">{f.a}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="text-center py-6">
                <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-5 h-5" />
                </div>
                <p className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
                  No answers for &ldquo;{trimmed}&rdquo;
                </p>
                <p className="text-[13px] leading-relaxed text-ink-600 mt-2 max-w-sm mx-auto">
                  This FAQ is short by design. If your question is not here, email
                  support and we will answer it directly.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                  <Link href="mailto:support@genapps.online">
                    <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Email support
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Shortcuts */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="w-4 h-4 text-ink-500" />
            <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">Keyboard shortcuts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {SHORTCUTS.map((s) => (
              <div key={s.desc} className="flex items-center justify-between py-2 border-b border-ink-200 last:border-b-0">
                <span className="text-[13px] text-ink-600">{s.desc}</span>
                <div className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center gap-1 rounded-md border border-ink-200 bg-ink-100 font-mono text-[11px] font-medium text-ink-700"
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
        <Card className="border-brand-200 bg-brand-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-panel text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">Still stuck?</h3>
                <p className="text-[13px] text-ink-600 mt-1 max-w-md leading-relaxed">
                  Reach a human at{' '}
                  <a className="text-brand-600 underline underline-offset-4 hover:text-brand-700" href="mailto:support@genapps.online">
                    support@genapps.online
                  </a>{' '}
                  — Paid plans get a reply within 4 business hours.
                </p>
              </div>
            </div>
            <Link href="mailto:support@genapps.online">
              <Button rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Email support
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
