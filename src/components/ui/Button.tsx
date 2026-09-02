import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  full?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children, className, variant = 'primary', size = 'md',
  isLoading = false, leftIcon, rightIcon, disabled, full = false, ...props
}) => {
  const base = clsx(
    'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
    'transition-colors duration-150 ease-out rounded-lg cursor-pointer',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600',
    'disabled:opacity-45 disabled:pointer-events-none',
  );

  // Primary is the neutral ink fill, not the brand red: this product's red
  // is reserved for risk and failure (crimson), so a red CTA would read as
  // a warning. `text-surface-canvas` flips with the theme, which literal
  // `text-white` never did — the old dark variant was white-on-white in
  // dark mode.
  const variants: Record<string, string> = {
    primary:
      'bg-ink-900 text-surface-canvas shadow-xs hover:bg-ink-800 active:bg-ink-950',
    // Legacy alias: call sites said "dark" for the same ink button.
    dark:
      'bg-ink-900 text-surface-canvas shadow-xs hover:bg-ink-800 active:bg-ink-950',
    // Kept for landing-page links that pair with the red mark; never the
    // default action in the product.
    accent:
      'bg-brand-600 text-on-brand shadow-xs hover:bg-brand-700 active:bg-brand-700',
    secondary:
      'bg-surface-panel text-ink-900 border border-ink-200 shadow-xs hover:bg-ink-50 hover:border-ink-300',
    outline:
      'bg-transparent text-ink-800 border border-ink-300 hover:bg-ink-50 hover:text-ink-900',
    ghost:
      'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    // `text-crimson-50` is near-white in the light theme (legible on the
    // dark crimson-600 fill) and near-black in the dark theme, where
    // crimson-600 remaps to a light pink that white text could not clear.
    danger:
      'bg-crimson-600 text-crimson-50 shadow-xs hover:bg-crimson-700',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8  px-2.5 text-[12px] gap-1.5',
    md: 'h-9  px-3.5 text-[13px] gap-1.5',
    lg: 'h-10 px-4   text-[14px] gap-2',
    xl: 'h-11 px-5   text-[14px] gap-2',
  };

  return (
    <button
      // Inside a <form> an untyped button submits it. Every submit in the app
      // asks for it explicitly, so the safe default is the inert one; a
      // `type` passed by the caller still wins through the spread below.
      type="button"
      className={clsx(base, variants[variant], sizes[size], full && 'w-full', className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : leftIcon}
      {children != null && <span className="truncate">{children}</span>}
      {!isLoading && rightIcon}
    </button>
  );
};
