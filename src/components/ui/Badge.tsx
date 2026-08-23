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
    default: 'bg-white/[0.06] text-ink-700 border border-transparent',
    success: 'bg-brand-600/10 text-brand-600 border border-brand-600/20',
    warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    danger:  'bg-crimson-500/10 text-crimson-500 border border-crimson-500/20',
    ink:     'bg-brand-600 text-[#060606] border border-transparent',
    outline: 'bg-transparent text-ink-700 border border-white/[0.12]',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-ink-500',
    success: 'bg-brand-600',
    warning: 'bg-amber-500',
    danger:  'bg-crimson-500',
    ink:     'bg-[#060606]',
    outline: 'bg-ink-500',
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
