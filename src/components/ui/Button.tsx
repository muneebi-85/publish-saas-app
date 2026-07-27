import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
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
    'transition-[background,color,border-color,transform,box-shadow] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-900',
    'disabled:opacity-50 disabled:pointer-events-none active:translate-y-[0.5px]',
    'rounded-[10px] cursor-pointer',
  );

  const variants: Record<string, string> = {
    primary:
      'bg-ink-900 text-white shadow-subtle hover:bg-ink-800 active:bg-ink-950',
    secondary:
      'bg-white text-ink-800 border border-ink-200 shadow-xs hover:bg-ink-50 hover:border-ink-300',
    outline:
      'bg-transparent text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50',
    ghost:
      'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    danger:
      'bg-crimson-600 text-white hover:bg-crimson-700 shadow-subtle',
    accent:
      'bg-grass-600 text-white hover:bg-grass-700 shadow-subtle',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-9 px-3.5 text-[13.5px] gap-2',
    lg: 'h-10 px-5 text-[14px] gap-2',
    xl: 'h-11 px-6 text-[15px] gap-2',
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
