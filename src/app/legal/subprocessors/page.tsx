import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Subprocessors · ${LEGAL.productName}`,
  description: 'The vendors we rely on to run the service, updated whenever the list changes.',
};

export default function SubprocessorsPage() {
  return (
    <>
      <h1>Subprocessors</h1>
      <p className="effective-line">Last updated July 1, 2025</p>

      <p>
        To run {LEGAL.productName}, we rely on the vendors below. Each is bound by
        data-processing agreements and only receives the data needed to provide the
        service. This list is updated whenever it changes.
      </p>

      <h2 id="list">Current subprocessors</h2>
      <ul>
        <li><strong>{LEGAL.merchantOfRecord}</strong> — payments, tax, invoicing</li>
        <li><strong>NVIDIA (NIM API)</strong> — LLM and vision-model inference</li>
        <li><strong>Vercel / hosting provider</strong> — application hosting and edge CDN</li>
        <li><strong>Neon or Supabase</strong> — application database</li>
        <li><strong>UploadThing or Cloudflare R2</strong> — file storage for uploaded video assets</li>
        <li><strong>Resend</strong> — transactional email delivery</li>
        <li><strong>PostHog</strong> — anonymized product analytics (opt-out available)</li>
        <li><strong>Sentry</strong> — error monitoring</li>
      </ul>

      <h2 id="questions">Questions</h2>
      <p>
        Questions about how we handle personal data or a specific subprocessor should be
        sent to <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. See the{' '}
        <a href="/legal/privacy">Privacy Policy</a> for the full picture of how your data is
        processed.
      </p>
    </>
  );
}
