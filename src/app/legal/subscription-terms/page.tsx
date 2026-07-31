import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Subscription Terms · ${LEGAL.productName}`,
  description: 'How billing, renewals, upgrades, and cancellations work.',
};

export default function SubscriptionTermsPage() {
  return (
    <>
      <h1>Subscription Terms</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <div className="callout">
        Paid plans are <strong>auto-renewing subscriptions</strong> sold and processed by
        {' '}<strong>{LEGAL.merchantOfRecord}</strong>, our Merchant of Record. Your card will
        be charged automatically at the start of each billing period until you cancel. You can
        cancel any time from Settings &rsaquo; Billing.
      </div>

      <h2 id="plans">1. Plans and pricing</h2>
      <p>
        Current plans and their prices are shown on the <a href="/pricing">pricing page</a>.
        Prices are displayed in USD and are exclusive of any taxes we are required to collect.
        Applicable sales tax, VAT, or GST is calculated and collected by Lemon Squeezy at checkout.
      </p>

      <h2 id="renewal">2. Automatic renewal</h2>
      <p>
        Every paid plan renews automatically at the end of each billing period (monthly or
        annually, whichever you selected). By subscribing, you authorize us and Lemon Squeezy to
        charge your saved payment method on each renewal date at the then-current price for your plan.
      </p>
      <p>
        We&rsquo;ll email you a receipt after every successful charge and a reminder before any
        material price change takes effect.
      </p>

      <h2 id="upgrade-downgrade">3. Upgrades and downgrades</h2>
      <h3>Upgrading</h3>
      <p>
        Upgrading to a higher plan takes effect immediately. Lemon Squeezy pro-rates the remaining
        days of your current period and charges the difference on the spot.
      </p>
      <h3>Downgrading</h3>
      <p>
        Downgrading to a lower plan takes effect at the end of the current billing period; you keep
        access to your current plan&rsquo;s features until then. No pro-rata credit is issued for
        the unused portion of the higher plan.
      </p>

      <h2 id="cancellation">4. Cancellation</h2>
      <p>You can cancel your subscription at any time by:</p>
      <ol>
        <li>Going to <strong>Settings &rsaquo; Billing</strong> and clicking &ldquo;Cancel plan&rdquo;, or</li>
        <li>Opening the <a href="/api/billing/portal">customer portal</a> (link included in every receipt email), or</li>
        <li>Emailing <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a> from your account email.</li>
      </ol>
      <p>
        Cancellation stops all future charges immediately. Your paid features remain available
        until the end of the current billing period; you are not billed again.
      </p>

      <h2 id="restore">5. Restore purchase</h2>
      <p>
        If you already paid but the subscription is not showing on your account (for example, you
        paid before signing up, or you paid with a different email), visit
        {' '}<a href="/restore">/restore</a> and enter the email you used at checkout. We&rsquo;ll
        match the Lemon Squeezy order and reactivate your subscription within a few minutes.
      </p>

      <h2 id="failed-payments">6. Failed payments</h2>
      <p>
        If a renewal charge fails (expired card, insufficient funds, etc.), Lemon Squeezy will
        retry the charge for up to 21 days and email you dunning reminders. After the retry
        window ends without payment, your plan is automatically downgraded to Free. Reports you
        created during the paid period remain accessible for 30 days so you can export them.
      </p>

      <h2 id="price-changes">7. Price changes</h2>
      <p>
        We may change plan prices from time to time. We&rsquo;ll email you at least 30 days
        before any price change affects your subscription, and you can cancel before the new
        price takes effect if you don&rsquo;t agree with it.
      </p>

      <h2 id="taxes">8. Taxes</h2>
      <p>
        Lemon Squeezy determines the applicable sales tax, VAT, or GST based on your billing
        address at checkout and remits it to the appropriate tax authority. Your receipt shows
        the tax collected. If you&rsquo;re a VAT-registered business, you can supply your VAT ID
        during checkout to trigger reverse-charge where eligible.
      </p>

      <h2 id="refunds">9. Refunds</h2>
      <p>
        See the <a href="/legal/refund">Refund Policy</a> — 14-day full-satisfaction guarantee on
        new subscriptions, plus billing-error and outage refunds.
      </p>

      <h2 id="data-on-end">10. What happens to your data when you cancel</h2>
      <ul>
        <li>Reports, projects, and settings remain accessible for <strong>30 days</strong> so you can export.</li>
        <li>After 30 days, if you have not reactivated, we permanently delete your content.</li>
        <li>Invoices and billing records are retained for 7 years to comply with tax law.</li>
      </ul>

      <h2 id="contact">11. Contact</h2>
      <p>
        Billing and subscription questions: <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a>
      </p>
    </>
  );
}
