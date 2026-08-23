'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSignUp } from '@clerk/nextjs';
import { ArrowLeft, Check, KeyRound, Lock, Mail, User } from 'lucide-react';
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
 * Sign-up on Clerk's headless hooks. Same reasoning as SignInForm: the card is
 * our own markup so it paints with the page instead of waiting on the Clerk
 * bundle, and the prebuilt component's catch-all probe navigation is gone.
 *
 * Two steps, because the instance requires email_code verification — the comp
 * only draws the first, so the second is built in its language.
 */

/**
 * Live hints, not the rule. This instance enforces a zxcvbn strength score and
 * checks the password against a breach corpus; neither is a checklist anyone can
 * tick off as they type. These three are what reliably clears that bar, so they
 * are shown as guidance and Clerk's own verdict — surfaced verbatim in
 * FormError — is what actually decides.
 */
const HINTS: { label: string; ok: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', ok: (p) => p.length >= 8 },
  { label: 'One uppercase letter', ok: (p) => /[A-Z]/.test(p) },
  { label: 'One number or symbol', ok: (p) => /[\d\W_]/.test(p) },
];

export const SignUpForm: React.FC = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<null | (() => void)>(null);
  useEffect(() => {
    if (isLoaded && pending.current) {
      const go = pending.current;
      pending.current = null;
      go();
    }
  }, [isLoaded]);

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

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      // Clerk takes first/last separately; the comp asks for one "Full name",
      // so the first space splits it and everything after is the surname.
      const name = fullName.trim().replace(/\s+/g, ' ');
      const cut = name.indexOf(' ');
      await signUp!.create({
        emailAddress: email.trim(),
        password,
        ...(name && {
          firstName: cut === -1 ? name : name.slice(0, cut),
          lastName: cut === -1 ? undefined : name.slice(cut + 1),
        }),
      });
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('verify');
    });
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status !== 'complete' || !res.createdSessionId) {
        setError('That code did not complete the sign-up. Request a new one and try again.');
        return;
      }
      await setActive!({ session: res.createdSessionId });
      router.push(readRedirect());
    });
  };

  const onResend = () => {
    run(async () => {
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
    });
  };

  const onSocial = (strategy: SocialStrategy) => {
    setError(null);
    setSocial(strategy);
    signUp
      ?.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sign-up/sso-callback',
        redirectUrlComplete: readRedirect(),
      })
      .catch((err) => {
        setSocial(null);
        setError(authErrorMessage(err));
      });
  };

  if (step === 'verify') {
    return (
      <>
        <AuthHeading title="Check your email" sub={'We sent a 6-digit code to ' + email.trim() + '.'} />
        <FormError error={error} />
        <form onSubmit={onVerify} className="space-y-4">
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
          <SubmitButton busy={busy}>Verify and continue</SubmitButton>
        </form>
        <div className="mt-5 flex items-center justify-between text-[13.5px]">
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setError(null);
            }}
            className="flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={onResend}
            disabled={busy}
            className="font-semibold text-red-brand transition-colors hover:text-red-brand-ink disabled:opacity-60"
          >
            Resend code
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Create your account" sub="Start analyzing and improving your videos today." />
      <FormError error={error} />

      <SocialButtons verb="Sign up with" busy={social} onPick={onSocial} disabled={busy} />
      <Divider />

      <form onSubmit={onCreate} className="space-y-4">
        <Field
          label="Full name"
          icon={<User className="h-[17px] w-[17px]" />}
          autoComplete="name"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {HINTS.map(({ label, ok }) => {
                const met = ok(password);
                return (
                  <li
                    key={label}
                    className={
                      'flex items-center gap-1.5 text-[12px] transition-colors ' +
                      (met ? 'text-[#16A34A]' : 'text-gray-400')
                    }
                  >
                    <Check className={'h-3.5 w-3.5 ' + (met ? 'opacity-100' : 'opacity-40')} />
                    {label}
                  </li>
                );
              })}
            </ul>
          }
        />

        {/*
          Clerk's bot check. A custom sign-up flow has to provide the mount point
          itself — without this node in the DOM, signUp.create is rejected as
          unverified. `empty:hidden` keeps it from adding a gap on the attempts
          where the widget stays invisible.
        */}
        <div id="clerk-captcha" className="empty:hidden" />

        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-gray-400">
        By creating an account, you agree to our{' '}
        <Link href="/legal/terms" className="text-red-brand hover:text-red-brand-ink">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="text-red-brand hover:text-red-brand-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
};
