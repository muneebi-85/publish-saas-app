import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Unsubscribed — Publish',
  description: 'You will receive no further marketing email.',
  robots: { index: false },
};

const STATES: Record<string, { heading: string; body: string }> = {
  ok: {
    heading: 'You are unsubscribed',
    body: 'No further marketing email will be sent to this address. Transactional notices tied to an account (billing, security, deletion) are unaffected — those concern actions on your account and cannot be suppressed.',
  },
  invalid: {
    heading: 'That link is not valid',
    body: 'The unsubscribe link was truncated or altered, so we cannot act on it. Re-opening it from the original email, or contacting support, resolves it — we will not send marketing mail to an address we cannot cleanly opt out.',
  },
  error: {
    heading: 'Something went wrong',
    body: 'The opt-out could not be recorded right now. Re-opening the link will retry it. If it keeps failing, contact support and you will be removed manually — a broken unsubscribe link is treated as a compliance bug, not an inconvenience.',
  },
};

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { state?: string };
}) {
  const state = searchParams.state && STATES[searchParams.state] ? searchParams.state : 'ok';
  const { heading, body } = STATES[state];

  return (
    <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-ink-200 bg-surface-panel p-8 text-center">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink-900">
          {heading}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-600">{body}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-[13px] font-medium text-surface-canvas transition-colors hover:bg-ink-800"
        >
          Back to Publish
        </Link>
      </div>
    </div>
  );
}
