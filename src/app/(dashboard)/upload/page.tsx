'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import { MultiAssetUploader } from '@/components/upload/MultiAssetUploader';

export default function UploadPage() {
  return (
    <div className="space-y-8 animate-enter max-w-4xl mx-auto">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-ink-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink-900">
          Analyze a video
        </h1>
        <p className="text-[15px] text-ink-600 mt-2 max-w-2xl">
          Drop the assets you have — video, thumbnail, script, or voiceover. We&apos;ll audit them
          against every platform&apos;s monetization policy and return a full report in about a minute.
        </p>

        <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl border border-ink-200 bg-white text-[12.5px] text-ink-600 max-w-2xl">
          <Info className="w-4 h-4 text-ink-500 shrink-0 mt-0.5" />
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
