import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'ink' | 'outline';
  className?: string;
  dot?: boolean;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children, variant = 'default', className, dot = false, size = 'sm',
}) => {
  // Success is *green*, not brand. Brand is red here, and a red "passed" pill
  // reads as a failure at a glance.
  const styles: Record<string, string> = {
    default: 'bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200',
    success: 'bg-grass-50 text-grass-700 ring-1 ring-inset ring-grass-200',
    warning: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
    danger:  'bg-crimson-50 text-crimson-700 ring-1 ring-inset ring-crimson-200',
    ink:     'bg-brand-600 text-on-brand ring-1 ring-inset ring-brand-700',
    outline: 'bg-transparent text-ink-600 ring-1 ring-inset ring-ink-300',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-ink-400',
    success: 'bg-grass-500',
    warning: 'bg-amber-500',
    danger:  'bg-crimson-500',
    ink:     'bg-on-brand',
    outline: 'bg-ink-400',
  };

  const sizes: Record<string, string> = {
    sm: 'h-5  text-[11px] px-1.5 gap-1',
    md: 'h-6  text-[12px] px-2   gap-1.5',
  };

  return (
    <span className={clsx(
      'inline-flex items-center font-medium rounded-md leading-none whitespace-nowrap',
      styles[variant],
      sizes[size],
      className,
    )}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />}
      {children}
    </span>
  );
};
