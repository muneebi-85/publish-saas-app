import React from 'react';
import { clsx } from 'clsx';

/**
 * Publish mark — a red disc with a white play triangle knocked out of it,
 * followed by the wordmark. This is the same mark the marketing site ships as
 * `/images/landing/logo.png`, redrawn as SVG so the app chrome gets a crisp
 * edge at 24px, inherits the theme, and does not pull a raster over the wire.
 *
 * The disc reads from `--brand-500` (the pure mark red) rather than the 600
 * used for fills and links, so the logo stays the brand colour while the UI
 * accent can be tuned for contrast independently.
 */
export const LogoMark: React.FC<{ className?: string; inverted?: boolean }> = ({
  className,
}) => (
  <svg
    viewBox="0 0 40 40"
    className={clsx('shrink-0', className)}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="20" cy="20" r="20" style={{ fill: 'rgb(var(--brand-500))' }} />
    {/* Play triangle. Drawn with rounded joins so it keeps the mark's soft
        silhouette instead of going needle-sharp at the tip. */}
    <path
      d="M16.4 12.6a1 1 0 0 1 1.53-.85l10.3 6.4a1 1 0 0 1 0 1.7l-10.3 6.4a1 1 0 0 1-1.53-.85V12.6Z"
      fill="#FFFFFF"
      strokeLinejoin="round"
    />
  </svg>
);

export const Logo: React.FC<{
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  showSub?: boolean;
}> = ({ className, size = 'md', inverted = false, showSub = false }) => {
  // Mark and wordmark are sized together: the cap height of the wordmark is
  // held at roughly 0.7× the disc so the lockup keeps the marketing site's
  // proportions at every size.
  const sizes = {
    sm: { mark: 'w-6 h-6', text: 'text-[16px]' },
    md: { mark: 'w-7 h-7', text: 'text-[18px]' },
    lg: { mark: 'w-9 h-9', text: 'text-[24px]' },
  } as const;
  const s = sizes[size];

  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark className={s.mark} />
      <span className="leading-none">
        <span className={clsx(
          'font-display font-semibold tracking-[-0.035em] block',
          s.text,
          inverted ? 'text-white' : 'text-ink-900',
        )}>
          Publish
        </span>
        {showSub && (
          <span className={clsx(
            'text-[11px] font-semibold tracking-[0.08em] block mt-1 uppercase',
            inverted ? 'text-white/50' : 'text-ink-500',
          )}>
            Creator Intelligence
          </span>
        )}
      </span>
    </span>
  );
};
