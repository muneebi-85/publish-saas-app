'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignIn } from '@clerk/nextjs';
import { ArrowLeft, KeyRound, Lock, Mail } from 'lucide-react';
import { AuthHeading } from './AuthShell';
import {
  Divider,
  Field,
  FormError,
  PasswordField,
  SocialButtons,
  SubmitButton,
  authErrorMessage,
  isSessionExists,
  readRedirect,
  type SocialStrategy,
} from './AuthUI';

/**
 * Sign-in, built on Clerk's headless hooks rather than its prebuilt <SignIn />.
 *
 * WHY NOT THE PREBUILT COMPONENT
 * ──────────────────────────────
 * <SignIn /> renders nothing until clerk.browser.js has downloaded from the
 * Clerk CDN, booted, and fetched /v1/environment — so the card sat empty for as
 * long as that took, which is what "clicking Log in takes forever" actually was.
 * It also fires a probe navigation at a synthetic child path
 * (/sign-in/SignIn_clerk_catchall_check_<ts>) on every mount just to confirm the
 * route is a catch-all; in dev that cost a full route compile.
 *
 * With the hooks, the markup below is ours: it ships in the page's HTML and is
 * typeable before Clerk's script arrives. Only *submitting* needs the SDK, and a
 * submit that lands early is held in `pending` and replayed the moment isLoaded
 * flips — so an impatient Enter is never swallowed.
 *
 * Three modes live in this one card, because /sign-in is where all three start:
 * password, then the two halves of a password reset.
 */
type Mode = 'password' | 'reset-request' | 'reset-code';

export const SignInForm: React.FC = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** A submit that arrived before the SDK did, waiting to be replayed. */
  const pending = useRef<null | (() => void)>(null);
  useEffect(() => {
    if (isLoaded && pending.current) {
      const run = pending.current;
      pending.current = null;
      run();
    }
  }, [isLoaded]);

  /** Wraps a Clerk call: defers if the SDK is cold, owns busy/error state. */
  const run = (fn: () => Promise<void>) => {
    if (!isLoaded) {
      pending.current = () => run(fn);
      setBusy(true);
      return;
    }
    setError(null);
    setBusy(true);
    fn()
      .catch((err) => {
        if (isSessionExists(err)) {
          router.replace(readRedirect());
          return;
        }
        setError(authErrorMessage(err));
      })
      .finally(() => setBusy(false));
  };

  const finish = async (createdSessionId: string | null) => {
    if (!createdSessionId) {
      // Second factor, or an email code Clerk wants first. Nothing in this
      // instance's settings reaches here today (2FA is off), so rather than
      // fake a step we hand the attempt to Clerk's own hosted continuation.
      setError('This account needs an extra verification step. Use "Forgot password?" or contact support.');
      return;
    }
    await setActive!({ session: createdSessionId });
    router.push(readRedirect());
  };

  const onPassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signIn!.create({ identifier: email.trim(), password });
      if (res.status === 'complete') await finish(res.createdSessionId);
      else await finish(null);
    });
  };

  const onRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      setNote('We sent a 6-digit code to ' + email.trim() + '.');
      setMode('reset-code');
    });
  };

  const onResetConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password: newPassword,
      });
      if (res.status === 'complete') await finish(res.createdSessionId);
      else await finish(null);
    });
  };

  const onSocial = (strategy: SocialStrategy) => {
    setError(null);
    setSocial(strategy);
    // Full-page redirect out to the provider; nothing after this resolves.
    signIn
      ?.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sign-in/sso-callback',
        redirectUrlComplete: readRedirect(),
      })
      .catch((err) => {
        setSocial(null);
        setError(authErrorMessage(err));
      });
  };

  if (mode !== 'password') {
    const requesting = mode === 'reset-request';
    return (
      <>
        <AuthHeading
          title="Reset your password"
          sub={
            requesting
              ? 'We will email you a code to set a new one.'
              : 'Enter the code we emailed you, then pick a new password.'
          }
        />
        <FormError error={error} />
        {note && !error && (
          <p className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13.5px] text-gray-600">
            {note}
          </p>
        )}
        <form onSubmit={requesting ? onRequestReset : onResetConfirm} className="space-y-4">
          {requesting ? (
            <Field
              label="Email address"
              icon={<Mail className="h-[17px] w-[17px]" />}
              type="email"
              autoComplete="email"
              required
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          ) : (
            <>
              <Field
                label="Verification code"
                icon={<KeyRound className="h-[17px] w-[17px]" />}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <PasswordField
                label="New password"
                icon={<Lock className="h-[17px] w-[17px]" />}
                autoComplete="new-password"
                required
                placeholder="Create a password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </>
          )}
          <SubmitButton busy={busy}>{requesting ? 'Send code' : 'Set new password'}</SubmitButton>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode('password');
            setError(null);
            setNote(null);
          }}
          className="mt-5 flex w-full items-center justify-center gap-1.5 text-[13.5px] text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to log in
        </button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Welcome back" sub="Log in to your Publish account." />
      <FormError error={error} />

      <SocialButtons verb="Continue with" busy={social} onPick={onSocial} disabled={busy} />
      <Divider />

      <form onSubmit={onPassword} className="space-y-4">
        <Field
          label="Email address"
          icon={<Mail className="h-[17px] w-[17px]" />}
          type="email"
          autoComplete="email"
          required
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Password"
          icon={<Lock className="h-[17px] w-[17px]" />}
          autoComplete="current-password"
          required
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => {
                  setMode('reset-request');
                  setError(null);
                }}
                className="text-[13px] font-semibold text-red-brand transition-colors hover:text-red-brand-ink"
              >
                Forgot password?
              </button>
            </div>
          }
        />
        {/* A touch more air above the primary action than space-y-4 gives, so the
            "Forgot password?" link does not read as part of the button. */}
        <div className="pt-1.5">
          <SubmitButton busy={busy}>Log in</SubmitButton>
        </div>
      </form>
    </>
  );
};
