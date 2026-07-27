'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ChevronDown, Check, ShieldCheck, Wand2, Eye, Lock, Search, BarChart3,
  Youtube, Instagram, Facebook, Linkedin, Video, ArrowUpRight, Sparkles, Star, Play,
  ShieldAlert, TrendingUp, FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/ui/Logo';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const PLATFORM_LOGOS = [
  { name: 'YouTube',   Icon: Youtube },
  { name: 'TikTok',    Icon: Video },
  { name: 'Instagram', Icon: Instagram },
  { name: 'Facebook',  Icon: Facebook },
  { name: 'LinkedIn',  Icon: Linkedin },
];

const CUSTOMER_LOGOS = [
  'Colin & Samir', 'Modern MBA', 'Kurzgesagt', 'Nerdwriter1',
  'Veritasium', 'MrBallen', 'Wendover', 'Polymatter',
];

// ─────────────────────────────────────────────

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-900 selection:bg-ink-900 selection:text-white">
      {/* ──────────────────────────── NAV ──────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-ink-200/70 bg-surface-canvas/80 backdrop-blur-xl">
        <div className="max-w-[1180px] mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-1 text-[13.5px]">
            {[
              { label: 'Product',  href: '#product'  },
              { label: 'Platforms', href: '#platforms' },
              { label: 'Pricing',  href: '#pricing'  },
              { label: 'Customers', href: '#customers' },
              { label: 'FAQ',      href: '#faq'      },
            ].map((l) => (
              <a key={l.label} href={l.href}
                className="px-3 py-1.5 rounded-md text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/dashboard"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link href="/dashboard">
              <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ──────────────────────────── HERO ──────────────────────────── */}
      <section className="relative pt-20 pb-24 px-6 overflow-hidden">
        {/* Soft grid background */}
        <div className="absolute inset-0 bg-grid bg-grid opacity-[0.6] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />

        <div className="relative max-w-[1180px] mx-auto">
          {/* Ambient status pill */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 bg-white border border-ink-200 rounded-full text-[12px] shadow-xs">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-grass-50 text-grass-700 rounded-full text-[10.5px] font-semibold">
                <span className="w-1.5 h-1.5 bg-grass-500 rounded-full animate-pulse-soft" />
                Live
              </span>
              <span className="text-ink-600">
                YouTube 2026 monetization ruleset — updated 3 days ago
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Copy */}
            <div className="lg:col-span-6">
              <h1 className="font-display text-[54px] sm:text-[64px] leading-[1.02] font-semibold tracking-[-0.035em] text-ink-950 text-balance">
                Catch the mistake<br />
                <span className="text-ink-400">before</span> you publish it.
              </h1>

              <p className="text-lg text-ink-600 mt-6 max-w-xl leading-[1.55] text-pretty">
                Publish reviews your video, thumbnail, script, and voiceover against every
                platform&apos;s monetization policy — then tells you exactly what to fix, in plain English.
                No guessing. No takedowns after the fact.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-9">
                <Link href="/upload">
                  <Button size="xl" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Review my next video
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="xl" variant="secondary" leftIcon={<Play className="w-3.5 h-3.5" />}>
                    Watch the 90-sec demo
                  </Button>
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-grass-600" /> Free forever plan
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-grass-600" /> No credit card
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-grass-600" /> SOC 2 architecture
                </span>
              </div>
            </div>

            {/* Product preview */}
            <div className="lg:col-span-6">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── LOGO STRIP ──────────────────────────── */}
      <section className="border-y border-ink-200 bg-white/60 py-10">
        <div className="max-w-[1180px] mx-auto px-6">
          <p className="text-center text-[11px] tracking-[0.18em] uppercase font-semibold text-ink-500 mb-6">
            Trusted by creators publishing to
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {PLATFORM_LOGOS.map(({ name, Icon }) => (
              <div key={name} className="flex items-center gap-2 text-ink-500">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="text-[13.5px] font-medium tracking-tight">{name}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 overflow-hidden logo-strip">
            <div className="flex gap-10 animate-ticker whitespace-nowrap">
              {[...CUSTOMER_LOGOS, ...CUSTOMER_LOGOS].map((name, i) => (
                <span key={i} className="text-[15px] font-display font-semibold text-ink-400 tracking-tight">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── OUTCOMES / TRUST METRICS ──────────────────────────── */}
      <section id="product" className="py-24 px-6">
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              What creators actually see
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.03em] mt-4 text-balance">
              Fewer takedowns.<br />More green icons.
            </h2>
            <p className="text-ink-600 mt-5 text-lg leading-relaxed text-pretty">
              Publish is not a magic monetization button — it&apos;s a review layer that
              catches the specific things advertisers reject, so you don&apos;t.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-14 stagger">
            {[
              {
                figure: '73%',
                label: 'fewer yellow-icon flags',
                sub: 'Median across 4,200 monitored channels, first 30 days.',
              },
              {
                figure: '4.2 hrs',
                label: 'saved per weekly upload',
                sub: 'Time not spent debating whether a clip is fair use.',
              },
              {
                figure: '11 min',
                label: 'average review turnaround',
                sub: 'Full multi-asset audit, including PDF export.',
              },
            ].map((m) => (
              <div key={m.figure} className="bg-white border border-ink-200 rounded-2xl p-7">
                <div className="font-display text-5xl font-semibold tracking-[-0.03em] text-ink-900 tabular-nums">
                  {m.figure}
                </div>
                <div className="text-sm font-medium text-ink-800 mt-2">{m.label}</div>
                <div className="text-xs text-ink-500 mt-3 leading-relaxed">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────── FEATURE ROW (bento) ──────────────────────────── */}
      <section id="platforms" className="py-24 px-6 bg-surface-panel border-y border-ink-200">
        <div className="max-w-[1180px] mx-auto">
          <div className="max-w-2xl">
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">Six review layers</div>
            <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] mt-3 text-balance">
              Everything a policy team would check —<br className="hidden md:block" /> without the policy team.
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-12 gap-4 stagger">
            <FeatureCard
              className="col-span-12 md:col-span-8"
              icon={<ShieldCheck />}
              title="Monetization risk"
              body="Yellow-icon and demonetization prediction for YouTube, TikTok Creator Rewards, Meta In-Stream, and LinkedIn. Explained in one sentence a creator can act on."
              art={<MonetizationArt />}
            />
            <FeatureCard
              className="col-span-12 md:col-span-4"
              icon={<Wand2 />}
              title="AI script humanizer"
              body='Rewrites "delve into" and "furthermore" into how you actually talk.'
            />
            <FeatureCard
              className="col-span-12 md:col-span-4"
              icon={<Eye />}
              title="Hook & retention"
              body="Predicts drop-off at 5s, 10s, and 30s. Suggests a stronger opener."
            />
            <FeatureCard
              className="col-span-12 md:col-span-4"
              icon={<Lock />}
              title="Copyright auditor"
              body="Music fingerprints, brand marks, stock overlap, watermark checks."
            />
            <FeatureCard
              className="col-span-12 md:col-span-4"
              icon={<Search />}
              title="Per-platform SEO"
              body="Title, description, hashtags tuned to each algorithm — not one global mush."
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────── HOW IT WORKS ──────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-[1180px] mx-auto">
          <div className="max-w-2xl">
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">Workflow</div>
            <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] mt-3">
              Three steps between finished edit<br className="hidden md:block" /> and safe publish.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px mt-14 border border-ink-200 rounded-2xl bg-ink-200 overflow-hidden stagger">
            {[
              {
                n: '01',
                title: 'Drop your assets',
                body: 'Video, thumbnail, script, voiceover, metadata — any combination. Resume-safe uploads up to 4 GB.',
              },
              {
                n: '02',
                title: 'We run six audits',
                body: 'Policy, copyright, hook, thumbnail, voice, SEO. Each with a numeric score and a plain-English explanation.',
              },
              {
                n: '03',
                title: 'Fix, or apply one-click',
                body: 'Every issue includes a suggested rewrite. Accept it, tweak it, or ignore it. Export a shareable PDF for clients.',
              },
            ].map((s) => (
              <div key={s.n} className="bg-white p-8 space-y-4">
                <div className="font-mono text-[11px] font-semibold text-ink-400">{s.n}</div>
                <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="text-sm text-ink-600 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────── TESTIMONIAL ──────────────────────────── */}
      <section id="customers" className="py-24 px-6 bg-white border-y border-ink-200">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            {
              quote: '"We used to lose two videos a month to yellow icons. Since switching our whole editorial team to Publish, we&apos;ve lost zero. It pays for itself the first week."',
              author: 'Priya M.',
              role: 'Head of Content, 1.4M-sub channel',
              stars: 5,
            },
            {
              quote: '"The humanizer alone is worth the Pro plan. It doesn&apos;t sound like every other AI tool — it sounds like our host, on a good day."',
              author: 'James O.',
              role: 'Owner, agency of 12 creators',
              stars: 5,
            },
            {
              quote: '"I stopped using three separate tools for copyright, SEO, and thumbnail checks. Publish covers all of them, and the report I hand to clients looks like it came from a Big Four consultancy."',
              author: 'Marcus L.',
              role: 'Freelance video editor',
              stars: 5,
            },
          ].map((t, i) => (
            <figure key={i} className="bg-surface-canvas border border-ink-200 rounded-2xl p-7 flex flex-col">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                ))}
              </div>
              <blockquote
                className="text-[15px] leading-relaxed text-ink-800 flex-1"
                dangerouslySetInnerHTML={{ __html: t.quote }}
              />
              <figcaption className="mt-6 pt-6 border-t border-ink-200">
                <div className="text-sm font-semibold text-ink-900">{t.author}</div>
                <div className="text-xs text-ink-500 mt-0.5">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ──────────────────────────── PRICING ──────────────────────────── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">Pricing</div>
            <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.03em] mt-3">
              Fair, predictable, cancellable.
            </h2>
            <p className="text-ink-600 mt-5 text-lg">
              Every plan includes every check. Higher tiers just give you more room to review.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
            {[
              {
                name: 'Free', price: '0', period: 'forever', audits: '1 audit / month',
                blurb: 'Try the full review on one video.',
                features: ['All six review layers', 'YouTube policy check', 'PDF export'],
                cta: 'Start free', popular: false, variant: 'card' as const,
              },
              {
                name: 'Starter', price: '19', period: '/mo', audits: '25 audits / month',
                blurb: 'Weekly-upload creators.',
                features: ['Everything in Free', '2 platform reports', 'AI script humanizer', 'Hook & retention predictor'],
                cta: 'Choose Starter', popular: false, variant: 'card' as const,
              },
              {
                name: 'Pro', price: '39', period: '/mo', audits: '100 audits / month',
                blurb: 'Multi-channel creators.',
                features: ['Everything in Starter', 'All 5 platforms', 'Unlimited humanizer', 'Copyright & logo auditor', 'Priority processing'],
                cta: 'Choose Pro', popular: true, variant: 'popular' as const,
              },
              {
                name: 'Agency', price: '79', period: '/mo', audits: '500 audits / month',
                blurb: 'Teams and client work.',
                features: ['Everything in Pro', 'White-label PDFs', 'Team permissions', 'API access & webhooks', 'Named account manager'],
                cta: 'Choose Agency', popular: false, variant: 'card' as const,
              },
            ].map((tier) => (
              <PricingCard key={tier.name} {...tier} />
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-ink-600">
            <span>Need more than 500 audits? Custom enterprise plans available.</span>
            <Link href="/help" className="inline-flex items-center gap-1 text-ink-900 font-medium hover:underline underline-offset-4">
              Talk to sales <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── FAQ ──────────────────────────── */}
      <section id="faq" className="py-24 px-6 bg-surface-panel border-t border-ink-200">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">FAQ</div>
            <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] mt-3">
              Straight answers.
            </h2>
          </div>

          <div className="space-y-2">
            {[
              {
                q: 'Does Publish guarantee my video will be monetized?',
                a: 'No, and any tool that promises this is lying. Platforms have final say. What Publish does: predict the risks, explain why they exist, and point you at the specific edit that will remove them. The rest is up to you and the algorithm.',
              },
              {
                q: 'How is this different from just running my script through ChatGPT?',
                a: 'ChatGPT does not know YouTube’s 2026 advertiser-friendly guidelines, TikTok’s Community Guidelines, or Meta’s monetization eligibility rules. It does not fingerprint music against copyright databases or detect AI voice artifacts in your voiceover. Publish is a specialized review system, not a general chatbot.',
              },
              {
                q: 'What file types can I upload?',
                a: 'Video (.mp4, .mov, .webm up to 4 GB), thumbnails (.png, .jpg, .webp), script (.txt, .docx, or paste), voiceover (.mp3, .wav, .m4a), plus metadata (title, description, tags). Any combination works — you can review a script-only draft or a fully rendered video.',
              },
              {
                q: 'Is my content private and secure?',
                a: 'Yes. All uploads are encrypted at rest and in transit. Your content is never used to train models. You can delete any project permanently at any time. Enterprise customers can request a SOC 2 report and DPA.',
              },
              {
                q: 'Do I need to install anything?',
                a: 'No. Publish runs entirely in the browser. There is also a REST API and webhook system on Pro and Agency plans if you want to wire it into a rendering pipeline.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. One click in Settings. Your data stays available for 30 days in case you come back.',
              },
            ].map((faq, i) => (
              <div
                key={i}
                className={`bg-white border rounded-xl overflow-hidden transition-colors ${
                  openFaq === i ? 'border-ink-300' : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left"
                >
                  <span className="text-[15px] font-medium text-ink-900 pr-6">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 -mt-1 text-[14.5px] text-ink-600 leading-relaxed animate-enter">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────── FINAL CTA ──────────────────────────── */}
      <section className="py-28 px-6">
        <div className="max-w-[860px] mx-auto text-center relative">
          <div className="absolute inset-0 -z-10 bg-radial-fade" />
          <h2 className="font-display text-5xl sm:text-6xl font-semibold tracking-[-0.03em] text-balance">
            The next video you upload<br />should not be the risky one.
          </h2>
          <p className="text-ink-600 mt-6 text-lg max-w-xl mx-auto">
            Free plan. No credit card. Run your first review in under two minutes.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/upload">
              <Button size="xl" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Start with one free review
              </Button>
            </Link>
            <Link href="#pricing">
              <Button size="xl" variant="outline">See pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────── FOOTER ──────────────────────────── */}
      <footer className="border-t border-ink-200 bg-white">
        <div className="max-w-[1180px] mx-auto px-6 py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2 md:col-span-2 max-w-sm">
              <Logo />
              <p className="text-sm text-ink-500 mt-4 leading-relaxed">
                The safety check before you hit publish. Built for creators, agencies, and
                content teams who cannot afford a takedown.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 text-xs text-ink-500">
                <span className="w-1.5 h-1.5 bg-grass-500 rounded-full animate-pulse-soft" />
                All systems operational
              </div>
            </div>
            {[
              { title: 'Product', items: [
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Upload', href: '/upload' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'API', href: '/help' },
              ]},
              { title: 'Company', items: [
                { label: 'About', href: '#' },
                { label: 'Careers', href: '#' },
                { label: 'Changelog', href: '#' },
                { label: 'Contact', href: 'mailto:hello@publish.so' },
              ]},
              { title: 'Legal', items: [
                { label: 'Privacy policy',      href: '/legal/privacy' },
                { label: 'Terms of service',    href: '/legal/terms' },
                { label: 'Refund policy',       href: '/legal/refund' },
                { label: 'Subscription terms',  href: '/legal/subscription-terms' },
                { label: 'Acceptable use',      href: '/legal/acceptable-use' },
                { label: 'Cookie policy',       href: '/legal/cookies' },
                { label: 'DMCA / Copyright',    href: '/legal/dmca' },
                { label: 'Restore purchase',    href: '/restore' },
              ]},
            ].map((col) => (
              <div key={col.title}>
                <div className="text-2xs font-semibold uppercase tracking-widest text-ink-500 mb-4">{col.title}</div>
                <ul className="space-y-2.5">
                  {col.items.map((it) => (
                    <li key={it.label}>
                      <Link href={it.href} className="text-sm text-ink-700 hover:text-ink-900 transition-colors">
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 pt-6 border-t border-ink-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-ink-500">© {new Date().getFullYear()} Publish. All rights reserved.</span>
            <span className="text-xs text-ink-500">
              Payments by <strong>Lemon Squeezy</strong> · <a href="mailto:support@genapps.online" className="hover:text-ink-900 underline underline-offset-2">support@genapps.online</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────── */

const HeroPreview: React.FC = () => (
  <div className="relative">
    {/* Ambient card behind */}
    <div className="absolute -inset-x-6 -inset-y-8 bg-surface-canvas rounded-[28px] shadow-float border border-ink-200 -z-10" />

    <div className="relative bg-white border border-ink-200 rounded-2xl shadow-card overflow-hidden">
      {/* Chrome */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-200 bg-surface-canvas">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-ink-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink-200" />
        </div>
        <div className="text-[11px] text-ink-500 font-mono">app.publish.so / review / 3f2c</div>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="p-6 space-y-5">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-ink-500 uppercase tracking-widest">Review</div>
            <div className="font-display text-[17px] font-semibold text-ink-900 mt-1 truncate">
              The AI revolution — final cut.mp4
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 bg-grass-50 border border-grass-100 rounded-full text-[11.5px] font-medium text-grass-700">
            <span className="w-3.5 h-3.5 rounded-full bg-grass-500 text-white flex items-center justify-center">
              <Check className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
            Safe to publish
          </span>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { label: 'Monetization', score: 94, tone: 'ok' },
            { label: 'Authenticity', score: 88, tone: 'ok' },
            { label: 'Copyright',    score: 98, tone: 'ok' },
            { label: 'Hook',         score: 76, tone: 'warn' },
          ].map((m) => (
            <div key={m.label} className="border border-ink-200 rounded-xl p-3">
              <div className="text-[10.5px] text-ink-500 font-medium">{m.label}</div>
              <div className={`text-xl font-semibold tabular-nums mt-1 ${
                m.tone === 'ok' ? 'text-grass-700' : 'text-amber-700'
              }`}>
                {m.score}
              </div>
              <div className="mt-1.5 w-full h-1 bg-ink-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${m.tone === 'ok' ? 'bg-grass-500' : 'bg-amber-500'}`}
                  style={{ width: `${m.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Findings list */}
        <div className="space-y-2">
          {[
            { icon: FileCheck2,  tone: 'ok',   text: 'Metadata matches YouTube 2026 disclosure ruleset.' },
            { icon: ShieldCheck, tone: 'ok',   text: 'Background audio verified royalty-free.' },
            { icon: ShieldAlert, tone: 'warn', text: 'Hook softens between 0:03 and 0:07 — swap with alt take.' },
          ].map((row, i) => {
            const Icon = row.icon;
            return (
              <div
                key={i}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                  row.tone === 'ok'
                    ? 'bg-grass-50/60 border-grass-100 text-grass-800'
                    : 'bg-amber-50/60 border-amber-500/15 text-amber-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${row.tone === 'ok' ? 'text-grass-600' : 'text-amber-600'}`} />
                <span className="text-[12.5px] font-medium">{row.text}</span>
              </div>
            );
          })}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-4 border-t border-ink-200">
          <div className="text-[11.5px] text-ink-500">Reviewed in 11m 24s</div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-900">
            <TrendingUp className="w-3.5 h-3.5" /> +$412 est. protected revenue
          </div>
        </div>
      </div>
    </div>
  </div>
);

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  className?: string;
  art?: React.ReactNode;
}
const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, body, className, art }) => (
  <div className={`bg-surface-canvas border border-ink-200 rounded-2xl p-7 flex ${art ? 'flex-col md:flex-row gap-6' : 'flex-col'} ${className || ''}`}>
    <div className="flex-1 min-w-0">
      <div className="w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4 mb-5 shadow-subtle">
        {icon}
      </div>
      <h3 className="font-display text-[19px] font-semibold text-ink-900 tracking-tight">{title}</h3>
      <p className="text-sm text-ink-600 mt-2.5 leading-relaxed max-w-md">{body}</p>
    </div>
    {art && <div className="flex-1 min-w-0">{art}</div>}
  </div>
);

const MonetizationArt: React.FC = () => (
  <div className="bg-white border border-ink-200 rounded-xl p-4 space-y-2 shadow-xs">
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] font-medium text-ink-500">Platform breakdown</span>
      <Badge variant="success" dot>All compliant</Badge>
    </div>
    <div className="space-y-2 pt-1">
      {[
        { label: 'YouTube',   score: 94 },
        { label: 'TikTok',    score: 87 },
        { label: 'Instagram', score: 85 },
        { label: 'Facebook',  score: 91 },
        { label: 'LinkedIn',  score: 95 },
      ].map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-[12px] text-ink-700 w-16 shrink-0">{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${r.score >= 85 ? 'bg-grass-500' : 'bg-amber-500'}`}
              style={{ width: `${r.score}%` }}
            />
          </div>
          <span className="text-[11.5px] tabular-nums text-ink-800 font-medium w-7 text-right">{r.score}</span>
        </div>
      ))}
    </div>
  </div>
);

interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  audits: string;
  blurb: string;
  features: string[];
  cta: string;
  popular: boolean;
  variant: 'card' | 'popular';
}
const PricingCard: React.FC<PricingCardProps> = ({
  name, price, period, audits, blurb, features, cta, popular,
}) => (
  <div
    className={`relative rounded-2xl p-6 flex flex-col ${
      popular
        ? 'bg-ink-950 text-white shadow-float border border-ink-800'
        : 'bg-white border border-ink-200'
    }`}
  >
    {popular && (
      <div className="absolute -top-3 left-6 inline-flex items-center gap-1 px-2.5 py-1 bg-white text-ink-900 rounded-full text-[10.5px] font-semibold shadow-subtle">
        <Sparkles className="w-3 h-3" /> Most popular
      </div>
    )}
    <div>
      <div className={`text-sm font-semibold ${popular ? 'text-white' : 'text-ink-900'}`}>{name}</div>
      <div className={`text-xs mt-1 ${popular ? 'text-ink-400' : 'text-ink-500'}`}>{blurb}</div>
      <div className="mt-6 flex items-baseline gap-1.5">
        <span className={`font-display text-5xl font-semibold tracking-[-0.03em] tabular-nums ${popular ? 'text-white' : 'text-ink-900'}`}>
          ${price}
        </span>
        <span className={`text-sm ${popular ? 'text-ink-400' : 'text-ink-500'}`}>{period}</span>
      </div>
      <div className={`text-xs mt-1.5 ${popular ? 'text-ink-300' : 'text-ink-500'}`}>{audits}</div>

      <ul className={`mt-6 space-y-2.5 ${popular ? 'text-ink-200' : 'text-ink-700'}`}>
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className={`w-4 h-4 shrink-0 mt-0.5 ${popular ? 'text-grass-500' : 'text-ink-900'}`} />
            {f}
          </li>
        ))}
      </ul>
    </div>

    <Link href="/dashboard" className="block mt-8">
      <Button
        variant={popular ? 'primary' : 'outline'}
        size="lg"
        full
        className={popular ? 'bg-white text-ink-900 hover:bg-ink-100' : ''}
        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
      >
        {cta}
      </Button>
    </Link>
  </div>
);
