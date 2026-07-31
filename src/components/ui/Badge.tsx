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
  const styles: Record<string, string> = {
    default: 'bg-ink-100 text-ink-700 border border-transparent',
    success: 'bg-grass-50 text-grass-700 border border-grass-100',
    warning: 'bg-amber-50 text-amber-700 border border-amber-500/20',
    danger:  'bg-crimson-50 text-crimson-700 border border-crimson-500/20',
    ink:     'bg-ink-900 text-white border border-transparent',
    outline: 'bg-white text-ink-700 border border-ink-200',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-ink-400',
    success: 'bg-grass-500',
    warning: 'bg-amber-600',
    danger:  'bg-crimson-600',
    ink:     'bg-white',
    outline: 'bg-ink-400',
  };

  const sizes: Record<string, string> = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-[12px] px-2.5 py-1 gap-1.5',
  };

  return (
    <span className={clsx(
      'inline-flex items-center font-medium rounded-md leading-none',
      styles[variant],
      sizes[size],
      className,
    )}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
