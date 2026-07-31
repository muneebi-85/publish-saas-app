import React from 'react';
import { clsx } from 'clsx';

/**
 * Publish mark — a forward "play / fast-forward" ribbon. A rounded emerald
 * chevron with a dark folded tab beneath it, suggesting motion + publishing.
 * Matches the brand logo: green ribbon, near-black fold.
 */
export const LogoMark: React.FC<{ className?: string; inverted?: boolean }> = ({
  className, inverted = false,
}) => {
  const green = '#16A34A';
  const greenDeep = '#15803D';
  const dark = inverted ? '#FFFFFF' : '#111111';
  return (
    <svg viewBox="0 0 40 40" fill="none" className={clsx('shrink-0', className)} aria-hidden="true">
      {/* Dark folded tab (behind, lower-left) */}
      <path
        d="M9 22.5L20.5 16v12.5a2 2 0 0 1-1.02 1.74l-8.2 4.6A1.4 1.4 0 0 1 9 33.6V22.5Z"
        fill={dark}
      />
      {/* Emerald ribbon chevron (front) */}
      <path
        d="M9 6.4A1.4 1.4 0 0 1 11.1 5.2l18.4 10.3a2 2 0 0 1 0 3.5L11.1 29.3A1.4 1.4 0 0 1 9 28.1V6.4Z"
        fill={green}
      />
      <path
        d="M9 6.4A1.4 1.4 0 0 1 11.1 5.2l9.4 5.3v11.9l-9.4 5.3A1.4 1.4 0 0 1 9 26.5V6.4Z"
        fill={greenDeep}
        fillOpacity="0.55"
      />
    </svg>
  );
};

export const Logo: React.FC<{
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  showSub?: boolean;
}> = ({ className, size = 'md', inverted = false, showSub = false }) => {
  const sizes = {
    sm: { mark: 'w-6 h-6',  text: 'text-[16px]' },
    md: { mark: 'w-7 h-7',  text: 'text-[19px]' },
    lg: { mark: 'w-9 h-9',  text: 'text-[24px]' },
  } as const;
  const s = sizes[size];

  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark className={s.mark} inverted={inverted} />
      <span className="leading-none">
        <span className={clsx(
          'font-display font-bold tracking-[-0.03em] block',
          s.text,
          inverted ? 'text-white' : 'text-ink-900',
        )}>
          Publish
        </span>
        {showSub && (
          <span className={clsx(
            'text-[10px] font-medium tracking-wide block mt-1 uppercase',
            inverted ? 'text-white/45' : 'text-ink-400',
          )}>
            Creator Intelligence
          </span>
        )}
      </span>
    </span>
  );
};
