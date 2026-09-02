'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import { MultiAssetUploader } from '@/components/upload/MultiAssetUploader';

export default function UploadPage() {
  return (
    <div className="space-y-6 animate-enter max-w-3xl mx-auto">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-ink-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        <h1 className="font-display text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink-900">
          Analyze a video
        </h1>
        <p className="text-[13px] leading-relaxed text-ink-600 mt-1 max-w-xl">
          Drop the assets you have — video, thumbnail, script, or voiceover. We&apos;ll audit them
          against every platform&apos;s monetization policy and return a full report in about a minute.
        </p>

        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-surface-panel border border-ink-200 text-[12px] leading-relaxed text-ink-600 max-w-xl">
          <Info className="w-3.5 h-3.5 text-ink-400 shrink-0 mt-0.5" />
          <p>
            Your files stay private. They&apos;re encrypted at rest and in transit, deleted on request,
            and never used to train models. See our{' '}
            <Link href="/help" className="text-ink-900 underline underline-offset-4">security overview</Link>.
          </p>
        </div>
      </div>

      <MultiAssetUploader />
    </div>
  );
}
