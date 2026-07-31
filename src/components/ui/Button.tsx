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
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-600',
    'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]',
    'rounded-xl cursor-pointer',
  );

  const variants: Record<string, string> = {
    primary:
      'bg-brand-600 text-white shadow-subtle hover:bg-brand-700 active:bg-brand-800',
    dark:
      'bg-ink-900 text-white shadow-subtle hover:bg-ink-800 active:bg-black',
    secondary:
      'bg-white text-ink-800 border border-ink-200 shadow-xs hover:bg-ink-50 hover:border-ink-300',
    outline:
      'bg-transparent text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50',
    ghost:
      'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    danger:
      'bg-crimson-600 text-white hover:bg-crimson-700 shadow-subtle',
    accent:
      'bg-brand-600 text-white hover:bg-brand-700 shadow-subtle',
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
