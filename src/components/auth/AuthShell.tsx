'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Star } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ScoreGauge } from '@/components/ui/ScoreGauge';

/**
 * Split-screen auth shell used by sign-in and sign-up. The form (Clerk or the
 * mock stand-in) renders on the left; the right panel carries the brand story,
 * a product proof preview, and social proof — matching the auth mockups.
 */
export const AuthShell: React.FC<{
  children: React.ReactNode;
  heading: string;
  subheading: string;
  footer: React.ReactNode;
}> = ({ children, heading, subheading, footer }) => {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface-canvas">
      {/* Form side */}
      <div className="flex flex-col px-6 sm:px-10 py-8">
        <div className="flex items-center justify-between">
          <Link href="/"><Logo /></Link>
          <Link href="/" className="text-[13.5px] text-ink-500 hover:text-ink-900 transition-colors">
            Back to home
          </Link>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-[400px] w-full mx-auto py-10">
          <h1 className="font-display text-[30px] font-bold tracking-tight text-ink-900">{heading}</h1>
          <p className="text-[15px] text-ink-600 mt-2">{subheading}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-[13.5px] text-ink-500 text-center">{footer}</div>
        </div>

        <div className="text-[12px] text-ink-400 text-center">
          © {new Date().getFullYear()} Publish · Secure sign-in
        </div>
      </div>

      {/* Brand side */}
      <div className="hidden lg:flex relative bg-ink-900 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade opacity-40" />
        <div className="relative flex flex-col justify-center px-14 py-16 w-full">
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-brand-400 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-8">
              <Star className="w-3.5 h-3.5 fill-brand-400 text-brand-400" /> Trusted by 28,000+ creators
            </div>
            <h2 className="font-display text-[34px] leading-tight font-bold text-white tracking-tight text-balance">
              Publish every video with confidence.
            </h2>
            <p className="text-[15px] text-white/60 mt-4 leading-relaxed">
              Analyze monetization risk, retention, SEO, and thumbnails before you hit publish.
            </p>

            {/* Product proof card */}
            <div className="mt-10 bg-white rounded-2xl shadow-float p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold text-ink-900">Content Health</div>
                  <div className="text-[12px] text-ink-400 mt-0.5">Ready to publish</div>
                </div>
                <ScoreGauge score={92} size="md" showLabel={false} />
              </div>
              <div className="mt-4 space-y-2">
                {['Low monetization risk', 'Strong hook (88)', 'SEO optimized'].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-[13px] text-ink-700">
                    <Check className="w-4 h-4 text-brand-600 shrink-0" /> {t}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-8 text-[13.5px] text-white/50 leading-relaxed">
              &ldquo;My CTR improved 32% in a month. It&apos;s like having a content coach on call.&rdquo;
            </p>
            <div className="mt-2 text-[12.5px] text-white/40">Sarah Chen · 120K subscribers</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Clerk appearance tuned to the Publish design tokens. */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#16A34A',
    colorText: '#111111',
    colorTextSecondary: '#666666',
    colorBackground: '#FFFFFF',
    colorInputBackground: '#FFFFFF',
    colorInputText: '#111111',
    borderRadius: '12px',
    fontFamily: 'Geist, Inter, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-none p-0 bg-transparent w-full',
    header: 'hidden',
    footer: 'hidden',
    formButtonPrimary:
      'bg-ink-900 hover:bg-ink-800 text-white text-[14px] font-medium normal-case h-11 rounded-xl shadow-none',
    formFieldInput:
      'border border-ink-200 rounded-xl h-11 text-[14px] focus:border-brand-600 focus:ring-1 focus:ring-brand-600',
    formFieldLabel: 'text-[13px] font-medium text-ink-700',
    socialButtonsBlockButton:
      'border border-ink-200 rounded-xl h-11 text-[14px] text-ink-800 hover:bg-ink-50 normal-case',
    dividerLine: 'bg-ink-200',
    dividerText: 'text-ink-400 text-[12px]',
    identityPreviewEditButton: 'text-brand-600',
    formResendCodeLink: 'text-brand-600',
    footerActionLink: 'text-brand-600 hover:text-brand-700',
  },
} as const;
