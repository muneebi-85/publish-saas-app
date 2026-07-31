'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ChevronDown, Check, Shield, Wand2, Image as ImageIcon,
  Target, Search, ListChecks, Upload, Play, TrendingUp, Clock,
  FileText, Sparkles, Star, AlertTriangle, Lightbulb, Zap, BarChart3,
  Youtube, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ScoreGauge } from '@/components/ui/ScoreGauge';

export default function LandingClient({ isLoggedIn, plan }: { isLoggedIn: boolean; plan: string }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  const handleUpgrade = async (planId: string) => {
    setLoadingId(planId);
    setCheckoutError('');

    // Plan changes for an existing subscriber go through the portal so they
    // never end up with a second billable subscription.
    if (plan !== 'free' && plan !== planId) {
      window.location.href = '/api/billing/portal';
      return;
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setCheckoutError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-900">
      {/* ──────────────── NAV ──────────────── */}
      <nav className="sticky top-0 z-50 border-b border-ink-200 bg-white/85 backdrop-blur-md">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-1 text-[14px] font-medium">
            {[
              { label: 'Features', href: '#features' },
              { label: 'How It Works', href: '#how' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Resources', href: '#faq' },
            ].map((l) => (
              <a key={l.label} href={l.href}
                className="px-3.5 py-2 rounded-lg text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Link href="/dashboard">
                <Button variant="dark" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in"><Button variant="ghost" size="md">Log in</Button></Link>
                <Link href="/upload">
                  <Button variant="dark" size="md" leftIcon={<Upload className="w-4 h-4" />}>
                    Analyze My Video
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ──────────────── HERO ──────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 pt-20 pb-16 grid lg:grid-cols-2 gap-14 items-center relative">
          <div>
            <h1 className="font-display text-[52px] sm:text-[60px] leading-[1.03] font-bold tracking-[-0.035em] text-ink-900 text-balance">
              Publish Every Video With Confidence
            </h1>
            <p className="text-[18px] text-ink-600 mt-6 max-w-lg leading-relaxed">
              Analyze your videos before publishing. Improve monetization, retention, SEO,
              thumbnails, and content quality with actionable recommendations — not guesswork.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-9">
              <Link href={isLoggedIn ? '/dashboard' : '/upload'}>
                <Button size="xl" variant="dark" leftIcon={<Upload className="w-4 h-4" />}>
                  {isLoggedIn ? 'Go to Dashboard' : 'Analyze My First Video'}
                </Button>
              </Link>
              <Link href="#how">
                <Button size="xl" variant="secondary" leftIcon={<Play className="w-4 h-4" />}>
                  Watch 2-Minute Demo
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-500">
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4 text-brand-600" /> No credit card
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4 text-brand-600" /> First analysis free
              </span>
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* ──────────────── STATS ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Play, value: '28,657+', label: 'Videos Analyzed' },
            { icon: FileText, value: '94,213+', label: 'Reports Generated' },
            { icon: Clock, value: '18.6 hrs', label: 'Avg. Time Saved / Month' },
            { icon: Star, value: '98%', label: 'Creator Satisfaction' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white border border-ink-200 rounded-2xl p-5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
                  <Icon className="w-[18px] h-[18px] text-brand-600" />
                </div>
                <div className="font-display text-[26px] font-bold tracking-tight text-ink-900">{s.value}</div>
                <div className="text-[13px] text-ink-500 mt-1">{s.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── PROBLEM / SOLUTION / HOW ──────────────── */}
      <section id="how" className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-3 gap-8">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-5">The Problem</h3>
            <div className="space-y-4">
              {[
                { icon: AlertTriangle, title: 'You publish without knowing the risks', body: 'Low retention, monetization issues, or copyright problems can hurt your channel.' },
                { icon: Target, title: "You're guessing what works", body: 'Thumbnails, titles, and hooks are based on assumptions, not data.' },
                { icon: Clock, title: 'It takes hours to improve videos', body: 'Researching, analyzing, and optimizing every video is exhausting.' },
              ].map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.title} className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-crimson-50 flex items-center justify-center shrink-0">
                      <Icon className="w-[18px] h-[18px] text-crimson-600" />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-ink-900">{p.title}</div>
                      <div className="text-[13px] text-ink-500 mt-0.5 leading-relaxed">{p.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-5">The Solution</h3>
            <div className="space-y-4">
              {[
                { icon: Sparkles, title: 'AI-Powered Analysis', body: 'Get deep insights on every aspect of your content in minutes.' },
                { icon: Lightbulb, title: 'Actionable Recommendations', body: 'Know exactly what to fix and how, by the biggest impact.' },
                { icon: TrendingUp, title: 'Save Time. Grow Faster.', body: 'Create better content, rank higher, and grow your audience consistently.' },
              ].map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.title} className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                      <Icon className="w-[18px] h-[18px] text-brand-600" />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-ink-900">{p.title}</div>
                      <div className="text-[13px] text-ink-500 mt-0.5 leading-relaxed">{p.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-5">How It Works</h3>
            <div className="space-y-3">
              {[
                { n: 1, icon: Upload, title: 'Upload', body: 'Add your video, title, and details.' },
                { n: 2, icon: Search, title: 'Analyze', body: 'Our AI analyzes 50+ points in seconds.' },
                { n: 3, icon: Zap, title: 'Improve', body: 'Get actionable steps to make it better.' },
                { n: 4, icon: Check, title: 'Publish', body: 'Publish with confidence and track results.' },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.n} className="flex items-center gap-3 bg-white border border-ink-200 rounded-xl px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-ink-900 text-white flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-ink-900">{s.n}. {s.title}</div>
                      <div className="text-[12.5px] text-ink-500">{s.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── FEATURES ──────────────── */}
      <section id="features" className="max-w-[1200px] mx-auto px-6 py-16">
        <h2 className="font-display text-[34px] font-bold tracking-tight text-center text-ink-900 mb-12">
          Everything You Need to Create Better Videos
        </h2>
        <div className="bg-white border border-ink-200 rounded-3xl p-8 grid md:grid-cols-3 gap-x-8 gap-y-10">
          {[
            { icon: Shield, title: 'Monetization Analysis', body: 'Check policy compliance, ad suitability, and monetization risk before you publish.' },
            { icon: ImageIcon, title: 'Thumbnail Review', body: 'Get AI feedback on your thumbnail and improve your click-through rate.' },
            { icon: Target, title: 'Hook Optimizer', body: 'Ensure your hook grabs attention in the first few seconds and keeps viewers.' },
            { icon: Wand2, title: 'AI Humanizer', body: 'Reduce AI detection risk and make your content sound natural and authentic.' },
            { icon: Search, title: 'SEO Assistant', body: 'Optimize titles, descriptions, tags, and keywords to rank higher.' },
            { icon: ListChecks, title: 'Publish Checklist', body: 'Final checklist to ensure your video is ready to perform at its best.' },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title}>
                <div className="w-11 h-11 rounded-xl border border-ink-200 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-ink-900" />
                </div>
                <h3 className="text-[16px] font-semibold text-ink-900">{f.title}</h3>
                <p className="text-[13.5px] text-ink-500 mt-2 leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── INSIGHTS ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="bg-white border border-ink-200 rounded-3xl p-8 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-brand-600 bg-brand-50 rounded-full px-3 py-1 mb-5">
              <BarChart3 className="w-3.5 h-3.5" /> Your Command Center
            </div>
            <h2 className="font-display text-[32px] font-bold tracking-tight text-ink-900">
              All Your Insights In One Place
            </h2>
            <p className="text-[15px] text-ink-600 mt-4 leading-relaxed">
              Track every analysis, monitor your content health, and see your growth over time.
            </p>
            <ul className="mt-6 space-y-3">
              {['Detailed analysis reports', 'Performance tracking', 'Project organization', 'Export and share reports'].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-[14px] text-ink-700">
                  <Check className="w-4 h-4 text-brand-600 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <InsightsPreview />
        </div>
      </section>

      {/* ──────────────── BEFORE / AFTER ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <h2 className="font-display text-[30px] font-bold tracking-tight text-ink-900 mb-8">
          Real Improvements. Real Results.
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          <BeforeAfter
            label="Title" before="AI Tools" after="10 AI Tools That Save You 20 Hours Every Week"
            metric="CTR" beforeVal="2.1%" afterVal="5.6%"
          />
          <BeforeAfter
            label="Hook" before='"Hey everyone, welcome back to my channel..."' after='"I tested 20 AI tools so you don’t have to."'
            metric="Retention (30s)" beforeVal="32%" afterVal="68%"
          />
        </div>
      </section>

      {/* ──────────────── AI COACH ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-brand-600 bg-brand-50 rounded-full px-3 py-1 mb-5">
              <Sparkles className="w-3.5 h-3.5" /> AI Content Coach
            </div>
            <h2 className="font-display text-[32px] font-bold tracking-tight text-ink-900">
              Your Personal AI Coach
            </h2>
            <p className="text-[15px] text-ink-600 mt-4 leading-relaxed">
              Get answers, suggestions, and content improvements from your AI coach.
            </p>
            <ul className="mt-6 space-y-3">
              {['Ask anything about your content', 'Get tailored recommendations', 'Rewrite and improve instantly'].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-[14px] text-ink-700">
                  <Check className="w-4 h-4 text-brand-600 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <CoachPreview />
        </div>
      </section>

      {/* ──────────────── PRICING ──────────────── */}
      <section id="pricing" className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
          <h2 className="font-display text-[32px] font-bold tracking-tight text-ink-900">Simple, Fair Pricing</h2>
          <span className="text-[13px] text-ink-500">Monthly billing · cancel anytime</span>
        </div>

        {checkoutError && (
          <div className="max-w-md mx-auto text-center rounded-xl bg-crimson-50 border border-crimson-100 px-4 py-3 mb-6 text-sm text-crimson-700">
            {checkoutError}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              name: 'Creator', priceM: 19, planKey: 'starter',
              blurb: 'Perfect for new and growing creators.',
              features: ['30 analyses / month', 'Full reports', 'Thumbnail & hook analysis', 'SEO suggestions', 'Export PDF reports'],
              popular: false,
            },
            {
              name: 'Pro', priceM: 39, planKey: 'pro',
              blurb: 'For serious creators who want to scale.',
              features: ['100 analyses / month', 'Everything in Creator', 'AI Humanizer', 'Script analysis', 'Priority processing', 'Channel insights'],
              popular: true,
            },
            {
              name: 'Agency', priceM: 79, planKey: 'agency',
              blurb: 'For teams and content agencies.',
              features: ['Unlimited analyses', 'Everything in Pro', 'Team members', 'White-label reports', 'API access', 'Priority support'],
              popular: false,
            },
          ].map((tier) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              isLoggedIn={isLoggedIn}
              currentPlan={plan}
              onUpgrade={handleUpgrade}
              isLoading={loadingId === tier.planKey}
            />
          ))}
        </div>
      </section>

      {/* ──────────────── TESTIMONIALS ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <h2 className="font-display text-[30px] font-bold tracking-tight text-ink-900 mb-8">
          Loved by Creators Worldwide
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { name: 'Sarah Chen', role: 'YouTuber · 120K Subscribers', quote: 'Publish has completely changed how I create videos. My CTR improved by 32% in just a month!', hue: 'bg-brand-100 text-brand-700' },
            { name: 'Mike Thompson', role: 'Content Creator', quote: 'The recommendations are spot on. It’s like having a content coach that’s available 24/7.', hue: 'bg-amber-100 text-amber-700' },
            { name: 'Agency Elevate', role: 'Digital Marketing Agency', quote: 'We use Publish for all our clients. The white-label reports are a game changer for our workflow.', hue: 'bg-ink-200 text-ink-700' },
          ].map((t) => (
            <div key={t.name} className="bg-white border border-ink-200 rounded-2xl p-6">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold ${t.hue}`}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink-900">{t.name}</div>
                  <div className="text-[12px] text-ink-500">{t.role}</div>
                </div>
              </div>
              <p className="text-[14px] text-ink-700 mt-4 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex gap-0.5 mt-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-500 text-amber-500" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────── FAQ ──────────────── */}
      <section id="faq" className="max-w-[760px] mx-auto px-6 py-16">
        <h2 className="font-display text-[30px] font-bold tracking-tight text-ink-900 mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {[
            { q: 'Is my video stored on your servers?', a: 'Your uploads are encrypted at rest and in transit, used only to generate your analysis, and can be permanently deleted at any time. We never use your content to train models.' },
            { q: 'How accurate are the analysis reports?', a: 'Our recommendations are based on recognized platform policies and content best practices. Scores are estimates and suggestions — platforms have final say on monetization.' },
            { q: 'Does this guarantee monetization or more views?', a: 'No tool can guarantee that. Publish predicts risks, explains why they exist, and shows you the specific edits most likely to help. The rest is up to you and each platform.' },
            { q: 'Can I cancel my subscription anytime?', a: 'Yes — from Settings → Billing & plan → Manage subscription. Your data remains available for 30 days in case you return.' },
            { q: 'What platforms are supported?', a: 'YouTube, TikTok, Instagram, Facebook, and LinkedIn — each with platform-specific SEO and policy checks.' },
          ].map((faq, i) => (
            <div key={i} className="bg-white border border-ink-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-[15px] font-medium text-ink-900 pr-6">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 text-[14px] text-ink-600 leading-relaxed animate-enter">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────── FINAL CTA ──────────────── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="bg-brand-50 border border-brand-100 rounded-3xl p-10 grid lg:grid-cols-2 gap-8 items-center overflow-hidden">
          <div>
            <h2 className="font-display text-[36px] font-bold tracking-tight text-ink-900 text-balance">
              Ready to Publish Smarter?
            </h2>
            <p className="text-[15px] text-ink-600 mt-4 max-w-md">
              Join thousands of creators who publish with confidence and grow faster.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link href={isLoggedIn ? '/dashboard' : '/upload'}>
                <Button size="xl" variant="dark" leftIcon={<Upload className="w-4 h-4" />}>
                  Analyze Your First Video
                </Button>
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-500">
              <span className="inline-flex items-center gap-2"><Check className="w-4 h-4 text-brand-600" /> No credit card</span>
              <span className="inline-flex items-center gap-2"><Check className="w-4 h-4 text-brand-600" /> First analysis free</span>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="bg-white border border-ink-200 rounded-2xl shadow-float p-4 rotate-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-ink-200" />
                <div className="w-2 h-2 rounded-full bg-ink-200" />
                <div className="w-2 h-2 rounded-full bg-ink-200" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-2.5 w-28 bg-ink-100 rounded-full" />
                  <div className="h-2 w-20 bg-ink-100 rounded-full" />
                  <div className="h-2 w-24 bg-ink-100 rounded-full" />
                </div>
                <ScoreGauge score={92} size="md" showLabel={false} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ───────────────── Sub-components ───────────────── */

const HeroPreview: React.FC = () => (
  <div className="relative">
    <div className="bg-white border border-ink-200 rounded-2xl shadow-float overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-100">
        <div className="flex items-center gap-2">
          <Logo size="sm" />
        </div>
        <span className="text-[12px] text-ink-400">Dashboard</span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[15px] font-semibold text-ink-900">10 AI Tools That Save You Hours</div>
            <div className="text-[12px] text-ink-400 mt-0.5">YouTube · Ready to publish</div>
          </div>
          <ScoreGauge score={92} size="lg" label="Content Health" />
        </div>
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[
            { label: 'Monetization', val: 'Low Risk', tone: 'text-brand-600' },
            { label: 'Hook Score', val: '88', tone: 'text-ink-900' },
            { label: 'SEO Score', val: '87', tone: 'text-ink-900' },
          ].map((s) => (
            <div key={s.label} className="border border-ink-200 rounded-xl p-3">
              <div className="text-[11px] text-ink-400">{s.label}</div>
              <div className={`text-[16px] font-bold mt-1 ${s.tone}`}>{s.val}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[
            { text: 'Anchor text in top-left quadrant', tag: '+1.2% CTR' },
            { text: 'Hard-cut first frame on consonant', tag: '+30% Retention' },
            { text: 'Add 12-frame J-cut for pacing', tag: '+15s AVD' },
          ].map((r) => (
            <div key={r.text} className="flex items-center justify-between bg-ink-50 rounded-xl px-3.5 py-2.5">
              <span className="text-[13px] font-medium text-ink-800">{r.text}</span>
              <span className="text-[11px] font-semibold text-brand-600">{r.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const InsightsPreview: React.FC = () => (
  <div className="bg-ink-50 border border-ink-200 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[14px] font-semibold text-ink-900">Analyses</span>
      <span className="text-[12px] text-brand-600 font-medium">All Videos</span>
    </div>
    <div className="space-y-2">
      {[
        { title: '10 AI Tools That Save You Hours', score: 92, status: 'Ready', tone: 'text-brand-600' },
        { title: 'How I Grew My Channel to 100K', score: 90, status: 'Ready', tone: 'text-brand-600' },
        { title: 'Best Editing Tips for Beginners', score: 76, status: 'Improve', tone: 'text-amber-600' },
        { title: 'AI vs Human: Can You Tell?', score: 90, status: 'Ready', tone: 'text-brand-600' },
      ].map((r) => (
        <div key={r.title} className="flex items-center gap-3 bg-white border border-ink-200 rounded-xl px-3 py-2.5">
          <div className="w-10 h-7 rounded-md bg-ink-900 shrink-0" />
          <span className="flex-1 text-[12.5px] font-medium text-ink-800 truncate">{r.title}</span>
          <ScoreGauge score={r.score} size="sm" showLabel={false} />
          <span className={`text-[11.5px] font-semibold ${r.tone} w-14 text-right`}>{r.status}</span>
        </div>
      ))}
    </div>
  </div>
);

const BeforeAfter: React.FC<{
  label: string; before: string; after: string; metric: string; beforeVal: string; afterVal: string;
}> = ({ label, before, after, metric, beforeVal, afterVal }) => (
  <div className="grid grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-ink-200">
    <div className="bg-white p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Before</div>
      <div className="text-[12px] text-ink-400 mb-1">{label}</div>
      <div className="text-[13.5px] text-ink-700 leading-snug">{before}</div>
      <div className="mt-4 pt-4 border-t border-ink-100">
        <div className="text-[12px] text-ink-400">{metric}</div>
        <div className="text-[22px] font-bold text-ink-500 mt-0.5">{beforeVal}</div>
      </div>
    </div>
    <div className="bg-brand-50 p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2">After</div>
      <div className="text-[12px] text-ink-400 mb-1">{label}</div>
      <div className="text-[13.5px] text-ink-900 font-medium leading-snug">{after}</div>
      <div className="mt-4 pt-4 border-t border-brand-100">
        <div className="text-[12px] text-ink-500">{metric}</div>
        <div className="text-[22px] font-bold text-brand-600 mt-0.5">{afterVal}</div>
      </div>
    </div>
  </div>
);

const CoachPreview: React.FC = () => (
  <div className="bg-white border border-ink-200 rounded-2xl shadow-card p-5 space-y-4">
    <div className="flex justify-end">
      <div className="bg-ink-900 text-white text-[13px] rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
        Why is my hook weak?
      </div>
    </div>
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-brand-600" />
      </div>
      <div className="bg-ink-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-ink-700 leading-relaxed">
        Your hook starts too slow. The first 5 seconds don&apos;t clearly show the value. Try:
        <div className="mt-2 bg-white border border-ink-200 rounded-xl px-3 py-2 text-ink-900 font-medium">
          &ldquo;I tested 20 AI tools so you don&apos;t waste your time — here are the 3 best.&rdquo;
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2 border border-ink-200 rounded-xl px-3 py-2">
      <input disabled placeholder="Ask your AI coach..." className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-400" />
      <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
        <Send className="w-3.5 h-3.5 text-white" />
      </div>
    </div>
  </div>
);

interface PricingCardProps {
  tier: { name: string; priceM: number; planKey: string; blurb: string; features: string[]; popular: boolean };
  isLoggedIn: boolean;
  currentPlan: string;
  onUpgrade: (planKey: string) => void;
  isLoading: boolean;
}
const PricingCard: React.FC<PricingCardProps> = ({ tier, isLoggedIn, currentPlan, onUpgrade, isLoading }) => {
  const isCurrent = currentPlan === tier.planKey;
  const price = tier.priceM;

  const handleClick = () => {
    if (isCurrent) return;
    if (!isLoggedIn) { window.location.href = '/sign-up'; return; }
    onUpgrade(tier.planKey);
  };

  return (
    <div className={`relative rounded-2xl p-6 flex flex-col bg-white ${tier.popular ? 'border-2 border-brand-600 shadow-card' : 'border border-ink-200'}`}>
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 bg-brand-600 text-white rounded-full text-[11px] font-semibold">
          Most Popular
        </div>
      )}
      <div className="text-[17px] font-bold text-ink-900">{tier.name}</div>
      <div className="text-[13px] text-ink-500 mt-1 min-h-[36px]">{tier.blurb}</div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-[40px] leading-none font-bold tracking-tight text-ink-900">${price}</span>
        <span className="text-[14px] text-ink-500">/month</span>
      </div>
      <ul className="mt-6 space-y-2.5 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-ink-700">
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Button
          variant={isCurrent ? 'secondary' : tier.popular ? 'dark' : 'secondary'}
          size="lg" full
          disabled={isCurrent}
          onClick={handleClick}
          isLoading={isLoading}
        >
          {isCurrent ? 'Current plan' : 'Get Started'}
        </Button>
      </div>
    </div>
  );
};

const Footer: React.FC = () => (
  <footer className="border-t border-ink-200 bg-white">
    <div className="max-w-[1200px] mx-auto px-6 py-14">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2 max-w-sm">
          <Logo />
          <p className="text-[13.5px] text-ink-500 mt-4 leading-relaxed">
            The AI content coach for creators. Analyze. Improve. Publish with confidence.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-[12px] text-ink-500">
            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse-soft" />
            All systems operational
          </div>
        </div>
        {[
          { title: 'Product', items: [
            { label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' },
            { label: 'Dashboard', href: '/dashboard' }, { label: 'Upload', href: '/upload' },
          ]},
          { title: 'Resources', items: [
            { label: 'Help Center', href: '/help' }, { label: 'FAQ', href: '#faq' },
            { label: 'API', href: '/help' },
          ]},
          { title: 'Legal', items: [
            { label: 'Terms of Service', href: '/legal/terms' }, { label: 'Privacy Policy', href: '/legal/privacy' },
            { label: 'Refund Policy', href: '/legal/refund' }, { label: 'DMCA', href: '/legal/dmca' },
          ]},
        ].map((col) => (
          <div key={col.title}>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-400 mb-4">{col.title}</div>
            <ul className="space-y-2.5">
              {col.items.map((it) => (
                <li key={it.label}>
                  <Link href={it.href} className="text-[13.5px] text-ink-600 hover:text-ink-900 transition-colors">{it.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 pt-6 border-t border-ink-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-[12.5px] text-ink-400">© {new Date().getFullYear()} Publish. All rights reserved.</span>
        <span className="text-[12.5px] text-ink-400">
          Payments by Lemon Squeezy · <a href="mailto:support@genapps.online" className="hover:text-ink-900 underline underline-offset-2">support@genapps.online</a>
        </span>
      </div>
    </div>
  </footer>
);
