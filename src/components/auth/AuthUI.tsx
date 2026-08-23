'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

/* ── field primitives ─────────────────────────────────────────────── */

const INPUT =
  'h-[46px] w-full rounded-[10px] border border-gray-200 bg-white pl-10 pr-3 text-[14.5px] text-gray-900 ' +
  'placeholder:text-gray-400 transition-colors focus:border-red-brand focus:outline-none focus:ring-2 ' +
  'focus:ring-red-brand/15 disabled:cursor-not-allowed disabled:bg-gray-50';

export const Field: React.FC<
  {
    label: string;
    icon: React.ReactNode;
    /** Rendered flush right inside the control — the password eye. */
    trailing?: React.ReactNode;
    hint?: React.ReactNode;
  } & React.InputHTMLAttributes<HTMLInputElement>
> = ({ label, icon, trailing, hint, className = '', ...input }) => {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-gray-900">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
        <input id={id} {...input} className={INPUT + (trailing ? ' pr-11' : '')} />
        {trailing}
      </div>
      {hint}
    </div>
  );
};

/** Password field with the comp's show/hide eye. */
export const PasswordField: React.FC<
  {
    label: string;
    icon: React.ReactNode;
    hint?: React.ReactNode;
  } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
> = ({ label, icon, hint, ...input }) => {
  const [shown, setShown] = useState(false);
  return (
    <Field
      label={label}
      icon={icon}
      hint={hint}
      type={shown ? 'text' : 'password'}
      {...input}
      trailing={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
        >
          {shown ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
        </button>
      }
    />
  );
};

export const SubmitButton: React.FC<{
  children: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
}> = ({ children, busy, disabled }) => (
  <button
    type="submit"
    disabled={busy || disabled}
    className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[10px] bg-red-brand text-[15px] font-bold text-white shadow-[0_6px_18px_-8px_rgba(255,0,0,0.55)] transition-colors hover:bg-red-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
  >
    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
);

export const Divider: React.FC<{ label?: string }> = ({ label = 'or' }) => (
  <div className="my-5 flex items-center gap-3">
    <span className="h-px flex-1 bg-gray-200" />
    <span className="text-[12.5px] text-gray-400">{label}</span>
    <span className="h-px flex-1 bg-gray-200" />
  </div>
);

/**
 * Clerk's verdict, verbatim. Never paraphrased: it is the only place the user
 * learns that a password was rejected for appearing in a breach corpus rather
 * than for being too short, and guessing at that sends them in circles.
 */
export const FormError: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <p
      role="alert"
      className="mb-4 rounded-[10px] border border-red-brand/25 bg-red-brand-50 px-3 py-2.5 text-[13.5px] text-[#B71C1C]"
    >
      {error}
    </p>
  ) : null;

/** Pulls the human-readable line out of whatever Clerk (or the network) threw. */
export function authErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first?.longMessage || first?.message || 'That did not work. Please try again.';
  }
  return 'We could not reach the sign-in service. Check your connection and try again.';
}

/** True when the throw was Clerk telling us this browser is already signed in. */
export function isSessionExists(err: unknown): boolean {
  return isClerkAPIResponseError(err) && err.errors.some((e) => e.code === 'session_exists');
}

/* ── social ───────────────────────────────────────────────────────── */

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h11.9c-.2 2-1.5 5-4.4 7l-.1.3 6.4 4.9.4.1c4.1-3.8 6.9-9.4 6.9-15.9Z"
    />
    <path
      fill="#34A853"
      d="M24 46c5.8 0 10.6-1.9 14.2-5.2l-6.8-5.2c-1.8 1.3-4.3 2.2-7.4 2.2-5.6 0-10.4-3.7-12.1-8.8l-.3.1-6.4 4.9-.1.3C8.6 41.2 15.7 46 24 46Z"
    />
    <path
      fill="#FBBC05"
      d="M11.9 29c-.4-1.3-.7-2.7-.7-4.1 0-1.4.3-2.8.7-4.1v-.3l-6.8-5.2-.2.1A22 22 0 0 0 2 24.9c0 3.5.9 6.9 2.9 10l7-5.9Z"
    />
    <path
      fill="#EA4335"
      d="M24 11.6c4 0 6.6 1.7 8.2 3.1l6-5.8C34.6 5.5 29.8 3.6 24 3.6 15.7 3.6 8.6 8.4 4.9 15l7 5.8C13.6 15.6 18.4 11.6 24 11.6Z"
    />
  </svg>
);

export type SocialStrategy = 'oauth_google';

/**
 * Only the strategies this Clerk instance actually has switched on. The comp
 * shows GitHub beside Google, but GitHub is not enabled on the instance, and a
 * button for a disabled strategy does nothing except return
 * "strategy_not_allowed" after a round trip. Once it is enabled in the Clerk
 * dashboard, add its entry here and widen SocialStrategy.
 */
export const SOCIAL: { strategy: SocialStrategy; name: string; Icon: React.FC }[] = [
  { strategy: 'oauth_google', name: 'Google', Icon: GoogleIcon },
];

export const SocialButtons: React.FC<{
  /** "Sign up with" / "Continue with" — the comp uses a different verb per screen. */
  verb: string;
  busy: string | null;
  onPick: (strategy: SocialStrategy) => void;
  disabled?: boolean;
}> = ({ verb, busy, onPick, disabled }) => (
  <div className="space-y-2.5">
    {SOCIAL.map(({ strategy, name, Icon }) => (
      <button
        key={strategy}
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => onPick(strategy)}
        className="flex h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-gray-200 bg-white text-[14.5px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === strategy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon />}
        {verb} {name}
      </button>
    ))}
  </div>
);

/* ── redirect target ──────────────────────────────────────────────── */

/**
 * Where to land after auth. The middleware appends `?redirect_url=<path>` when
 * it bounces a signed-out request, so honouring it is what makes a deep link
 * survive the detour.
 *
 * Read from `location` at submit time rather than through useSearchParams, which
 * would opt these pages out of static prerendering — the point of the rewrite is
 * that the card is in the first HTML.
 *
 * Only same-origin absolute paths are accepted. Anything else — a full URL, a
 * protocol-relative `//evil.example`, the backslash variant browsers normalise
 * into one — is an open-redirect attempt and falls back to the dashboard.
 */
export function readRedirect(fallback = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get('redirect_url');
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
