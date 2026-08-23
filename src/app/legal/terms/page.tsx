import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // The root layout sets a title template of '%s · Publish', so the product
  // name is appended for us. Repeating it here produced
  // "Terms of Service · Publish · Publish" in the tab and in search results.
  title: 'Terms of Service',
  description: 'The rules that govern use of Publish.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <p>
        These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your access to and
        use of {LEGAL.productName}, operated by {LEGAL.legalEntity} (&ldquo;<strong>we</strong>&rdquo;,
        &ldquo;<strong>us</strong>&rdquo;, or &ldquo;<strong>the Service</strong>&rdquo;). By creating
        an account or paying for a subscription, you agree to these Terms.
      </p>

      <div className="callout">
        <strong>Plain-language summary.</strong> {LEGAL.productName} reviews videos and predicts
        monetization risk. We do not guarantee any platform outcome. You pay {LEGAL.merchantOfRecord}
        (our merchant of record) for a subscription; you can cancel any time.
      </div>

      <h2 id="who">1. Who can use the Service</h2>
      <p>
        You must be at least 16 years old, or the age of digital consent in your jurisdiction
        (whichever is higher), to create an account. If you are using the Service on behalf of
        an organization, you represent that you have authority to bind that organization to these Terms.
      </p>

      <h2 id="account">2. Your account</h2>
      <ul>
        <li>You are responsible for maintaining the confidentiality of your credentials.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
        <li>You will notify us at <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> promptly if you suspect unauthorized access.</li>
      </ul>

      <h2 id="service">3. What the Service does — and does not — guarantee</h2>
      <p>
        {LEGAL.productName} produces an automated, best-effort review of content you submit.
        Reviews rely on published platform guidelines and machine-learning models that make mistakes.
      </p>
      <p><strong>The Service does not, and cannot:</strong></p>
      <ul>
        <li>Guarantee that any video will be monetized, approved, or distributed by any platform.</li>
        <li>Serve as legal, financial, tax, or copyright-clearance advice.</li>
        <li>Replace human review by you or your legal counsel for content you consider high-risk.</li>
      </ul>
      <p>
        Platforms (YouTube, TikTok, Instagram, Facebook, LinkedIn, and others) make the final
        determination on monetization, distribution, and content eligibility. You accept full
        responsibility for what you publish.
      </p>

      <h2 id="acceptable">4. Acceptable use</h2>
      <p>
        You may not use the Service to review content that violates our
        {' '}<a href="/legal/acceptable-use">Acceptable Use Policy</a>, including but not limited to
        content that is illegal, harmful to minors, promotes violence, or infringes on the rights of others.
      </p>

      <h2 id="payments">5. Payments and subscriptions</h2>
      <p>
        Paid plans are sold by <strong>{LEGAL.merchantOfRecord}</strong>, our Merchant of Record.
        Lemon Squeezy handles billing, tax collection, invoicing, chargebacks, and refunds on our
        behalf. Your payment relationship for the transaction is with Lemon Squeezy; your service
        relationship for using {LEGAL.productName} is with us.
      </p>
      <p>See the <a href="/legal/subscription-terms">Subscription Terms</a> and
        {' '}<a href="/legal/refund">Refund Policy</a> for full details on billing cycles,
        auto-renewal, and refund eligibility.</p>

      <h2 id="content">6. Your content and our license to process it</h2>
      <p>
        You retain full ownership of every script, thumbnail, video, and other asset you submit
        (&ldquo;<strong>Your Content</strong>&rdquo;). By submitting Your Content, you grant us a
        limited, non-exclusive, worldwide, royalty-free license to process, store, transmit, and
        analyze Your Content <em>solely</em> for the purpose of providing the Service to you.
      </p>
      <p>
        We do not sell Your Content. We do not use Your Content to train foundation models.
        We do not share Your Content with third parties except the AI infrastructure providers strictly
        necessary to produce your review (see the <a href="/legal/privacy">Privacy Policy</a>).
      </p>

      <h2 id="ip">7. Our intellectual property</h2>
      <p>
        The Service, including its software, scoring methodology, user interface, brand, and
        documentation, is owned by {LEGAL.legalEntity} and protected by intellectual-property law.
        You may not copy, reverse-engineer, or resell the Service, in whole or in part, without our prior written consent.
      </p>

      <h2 id="termination">8. Termination</h2>
      <p>
        You may cancel your subscription and delete your account at any time from Settings &rsaquo;
        Account or by contacting <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        We may suspend or terminate accounts that violate these Terms, with or without notice, where
        continued access would harm the Service or other users.
      </p>
      <p>
        On termination, your access ends, but past invoices and reports remain accessible for 30 days
        so you can export anything you need.
      </p>

      <h2 id="warranties">9. Warranties and disclaimers</h2>
      <p>
        <strong>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;.</strong>
        To the maximum extent permitted by law, we disclaim all warranties, express or implied,
        including fitness for a particular purpose, merchantability, non-infringement, and any
        warranty arising from course of dealing or usage of trade.
      </p>

      <h2 id="liability">10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {LEGAL.legalEntity} shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or any loss of profits,
        revenues, data, or goodwill, arising from your use of the Service — even if we have been
        advised of the possibility of such damages.
      </p>
      <p>
        Our total aggregate liability for any claim arising from or related to the Service shall
        not exceed the greater of (a) the amount you paid us in the twelve months preceding the
        event giving rise to the claim, or (b) USD 50.
      </p>
      <p>
        Some jurisdictions do not allow certain limitations of liability; the limitations above
        apply only to the extent permitted in your jurisdiction.
      </p>

      <h2 id="indemnity">11. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless {LEGAL.legalEntity} from any claim by a third
        party arising out of (a) Your Content, (b) your use of the Service, or (c) your violation
        of these Terms.
      </p>

      <h2 id="changes">12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be announced in-app
        and by email at least 14 days before they take effect. Continued use of the Service after
        an update means you accept the new Terms.
      </p>

      <h2 id="law">13. Governing law and disputes</h2>
      <p>
        These Terms are governed by {LEGAL.governingLaw}, without regard to conflict-of-law
        principles. Any dispute that cannot be resolved through good-faith discussion will be
        resolved in the courts of that jurisdiction, unless mandatory consumer-protection law
        in your country requires otherwise.
      </p>

      <h2 id="contact">14. Contact</h2>
      <p>
        Questions about these Terms? Reach us at
        {' '}<a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. For billing-specific
        inquiries, contact <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a>.
      </p>
      <p>
        Postal address:<br />
        {LEGAL.legalEntity}<br />
        {LEGAL.legalAddress}
      </p>
    </>
  );
}
