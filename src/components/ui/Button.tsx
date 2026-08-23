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
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600',
    'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.96]',
    'rounded-xl cursor-pointer',
  );

  // The accent is a light lime, so anything sitting on it takes near-black text.
  const variants: Record<string, string> = {
    primary:
      'bg-brand-600 text-[#060606] hover:bg-brand-400 active:bg-brand-700',
    dark:
      'bg-brand-600 text-[#060606] hover:bg-brand-400 active:bg-brand-700',
    secondary:
      'bg-white/[0.04] text-white border border-white/[0.12] hover:bg-white/[0.08] hover:border-white/[0.2]',
    outline:
      'bg-transparent text-white border border-white/[0.12] hover:border-white/[0.2] hover:bg-white/[0.04]',
    ghost:
      'bg-transparent text-ink-600 hover:bg-white/[0.06] hover:text-white',
    danger:
      'bg-crimson-600 text-white hover:bg-crimson-500',
    accent:
      'bg-brand-600 text-[#060606] hover:bg-brand-400',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-9 px-4 text-[13.5px] gap-2',
    lg: 'h-11 px-5 text-[14.5px] gap-2',
    xl: 'h-12 px-6 text-[15px] gap-2',
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], full && 'w-full', className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
      {children != null && <span>{children}</span>}
      {!isLoading && rightIcon}
    </button>
  );
};
