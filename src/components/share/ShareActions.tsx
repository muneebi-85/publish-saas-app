'use client';

import React, { useState } from 'react';
import { Check, Link2, Code2, Copy } from 'lucide-react';
import { track } from '@/lib/analytics';

/**
 * Social + embed actions for the public score card.
 *
 * The audit wanted the score card to be postable everywhere a creator lives:
 * a copyable link, one-click X and LinkedIn intents, a TikTok/Instagram story
 * caption (copy-to-clipboard — those apps have no web share intent), and an
 * embeddable badge snippet that gives the site a free backlink per embed.
 */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function ShareActions({
  reportId,
  title,
  score,
  platform,
  origin,
}: {
  reportId: string;
  title: string;
  score: number;
  platform: string;
  /** Canonical public origin, passed by the server so SSR needs no `window`. */
  origin: string;
}) {
  const [copied, setCopied] = useState<'link' | 'caption' | 'embed' | null>(null);

  const url = `${origin}/share/${reportId}`;
  const badgeUrl = `${origin}/api/badge/${reportId}`;
  const scoreLine = `My script scored ${score}/100 on Publish 🎯`;

  const handleCopy = async (kind: 'link' | 'caption' | 'embed') => {
    const text =
      kind === 'link'
        ? url
        : kind === 'caption'
          ? `${scoreLine} Can you beat it? ${url}`
          : `<a href="${url}"><img src="${badgeUrl}" alt="${scoreLine.replace(/[<>&]/g, '')}" width="260" /></a>`;
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      void track(`share_${kind === 'link' ? 'link_copied' : kind === 'caption' ? 'story_copied' : 'embed_copied'}`, {
        reportId,
      });
      window.setTimeout(() => setCopied(null), 2000);
    }
  };

  const openIntent = (href: string) => {
    void track('share_social_click', { reportId, href: href.split('?')[0] });
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const caption = encodeURIComponent(`${scoreLine} Can you beat it?`);
  const encodedUrl = encodeURIComponent(url);

  const intents = [
    {
      label: 'Post on X',
      href: `https://twitter.com/intent/tweet?text=${caption}&url=${encodedUrl}`,
      cls: 'hover:bg-white/[0.08] hover:text-white',
    },
    {
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      cls: 'hover:bg-white/[0.08] hover:text-white',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Row 1: copy link + social intents */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleCopy('link')}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-ink-700 transition-colors hover:border-white/[0.24]"
        >
          {copied === 'link' ? <Check className="w-3.5 h-3.5 text-grass-700" /> : <Link2 className="w-3.5 h-3.5" />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        {intents.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => openIntent(b.href)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-ink-700 transition-colors ${b.cls}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Row 2: story caption + embed code */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleCopy('caption')}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 text-[12px] font-medium text-ink-500 transition-colors hover:text-white"
        >
          {copied === 'caption' ? <Check className="w-3.5 h-3.5 text-grass-700" /> : <Copy className="w-3.5 h-3.5" />}
          {copied === 'caption' ? 'Copied' : 'TikTok / IG story caption'}
        </button>
        <button
          type="button"
          onClick={() => handleCopy('embed')}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 text-[12px] font-medium text-ink-500 transition-colors hover:text-white"
        >
          {copied === 'embed' ? <Check className="w-3.5 h-3.5 text-grass-700" /> : <Code2 className="w-3.5 h-3.5" />}
          {copied === 'embed' ? 'Copied' : 'Embed badge on your site'}
        </button>
      </div>

      <p className="text-[11px] text-ink-500 leading-relaxed">
        {title.length > 60 ? `${title.slice(0, 60)}…` : title} · scored on {platform}
      </p>
    </div>
  );
}
