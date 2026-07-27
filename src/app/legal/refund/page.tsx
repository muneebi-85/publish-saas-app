import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Refund Policy · ${LEGAL.productName}`,
  description: 'When we refund, when we cannot, and how to request one.',
};

export default function RefundPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <div className="callout">
        <strong>Short version.</strong> Cancel any time. If you were charged in the last 14 days
        and you&rsquo;re not happy, email <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a>
        {' '}and we&rsquo;ll refund it — no forms, no calls.
      </div>

      <h2 id="who-processes">1. Who processes refunds</h2>
      <p>
        All payments are processed by our Merchant of Record,
        <strong> {LEGAL.merchantOfRecord}</strong>. Refunds are issued back to the original
        payment method by Lemon Squeezy on our request. Lemon Squeezy&rsquo;s own refund
        {' '}terms are available at
        {' '}<a href="https://www.lemonsqueezy.com/policies/refund-policy" target="_blank" rel="noopener noreferrer">
          lemonsqueezy.com/policies/refund-policy</a>.
      </p>

      <h2 id="eligibility">2. When you&rsquo;re eligible for a refund</h2>
      <ul>
        <li>
          <strong>14-day satisfaction guarantee</strong> — For a new subscription, a full refund is
          available within 14 calendar days of the initial charge, no questions asked.
        </li>
        <li>
          <strong>Billing errors</strong> — Duplicate charges, wrong plan, or charges after a
          confirmed cancellation are refunded in full at any time.
        </li>
        <li>
          <strong>Service outages</strong> — If the Service was materially unavailable for more
          than 24 continuous hours during a paid period, we credit or refund a pro-rata portion
          of that month&rsquo;s fee.
        </li>
      </ul>

      <h2 id="not-eligible">3. When refunds are not available</h2>
      <ul>
        <li>
          <strong>After the 14-day window</strong> — Because subscriptions can be cancelled at any
          time to stop future charges, we do not refund past billing periods after 14 days, except
          for billing errors or outages as described above.
        </li>
        <li>
          <strong>Partial-month cancellations</strong> — Cancelling mid-month does not entitle you
          to a pro-rata refund of that month; you retain full access until the period ends.
        </li>
        <li>
          <strong>Terms violations</strong> — Accounts terminated for material violation of the
          {' '}<a href="/legal/acceptable-use">Acceptable Use Policy</a> forfeit refund eligibility.
        </li>
        <li>
          <strong>Excessive use</strong> — If the disputed period consumed more than 80% of the
          plan&rsquo;s monthly quota, we may pro-rate any refund to reflect services rendered.
        </li>
      </ul>

      <h2 id="how-to-request">4. How to request a refund</h2>
      <ol>
        <li>Email <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a> from the email address on your account.</li>
        <li>Include your invoice ID (visible in Settings &rsaquo; Billing, or in the Lemon Squeezy receipt email).</li>
        <li>Briefly describe the reason — this is optional, but helps us improve the Service.</li>
      </ol>
      <p>
        We acknowledge every request within 2 business days and process approved refunds within
        5 business days. Depending on your card issuer, the funds may take 5–10 additional
        business days to appear on your statement.
      </p>

      <h2 id="chargebacks">5. Chargebacks</h2>
      <p>
        Please contact us before filing a chargeback with your bank — nearly every dispute we see
        can be resolved by email within 48 hours. Chargebacks that turn out to be reversible by
        us anyway (billing errors, duplicate charges) will be refunded regardless.
      </p>
      <p>
        Fraudulent chargebacks — for example, disputing a charge after receiving the service
        and refusing to communicate with us — may result in permanent account termination and,
        in serious cases, referral for legal action.
      </p>

      <h2 id="statutory">6. Your statutory rights</h2>
      <p>
        Nothing in this policy limits any refund or withdrawal right you have under mandatory
        consumer-protection law in your country of residence. EU consumers, for example, have a
        14-day right of withdrawal under the Consumer Rights Directive; that right is honored
        in full and is not affected by anything above.
      </p>

      <h2 id="contact">7. Contact</h2>
      <p>
        Refund questions: <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a><br />
        General support: <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
      </p>
    </>
  );
}
