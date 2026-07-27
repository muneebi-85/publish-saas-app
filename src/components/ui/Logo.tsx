import React from 'react';
import { clsx } from 'clsx';

/**
 * Wordmark — a solid ink square with a notch cut out, suggesting a
 * "checked / cleared" mark without resorting to a literal checkmark cliché.
 */
export const LogoMark: React.FC<{ className?: string; inverted?: boolean }> = ({
  className, inverted = false,
}) => (
  <svg viewBox="0 0 24 24" fill="none" className={clsx('shrink-0', className)} aria-hidden="true">
    <rect
      x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5"
      fill={inverted ? '#FFFFFF' : '#1C1917'}
    />
    <path
      d="M7 12.4L10.4 15.8L17 9"
      stroke={inverted ? '#1C1917' : '#FFFFFF'}
      strokeWidth="2.1"
      strokeLinecap="round"
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
  const sizes = {
    sm: { mark: 'w-5 h-5',   text: 'text-[14px]' },
    md: { mark: 'w-6 h-6',   text: 'text-[16px]' },
    lg: { mark: 'w-8 h-8',   text: 'text-[20px]' },
  } as const;
  const s = sizes[size];

  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={s.mark} inverted={inverted} />
      <span className="leading-none">
        <span className={clsx(
          'font-display font-semibold tracking-[-0.02em] block',
          s.text,
          inverted ? 'text-white' : 'text-ink-900',
        )}>
          Polish
        </span>
        {showSub && (
          <span className={clsx(
            'text-[10.5px] font-medium tracking-wide block mt-0.5',
            inverted ? 'text-white/45' : 'text-ink-400',
          )}>
            CreatorGuard AI
          </span>
        )}
      </span>
    </span>
  );
};
