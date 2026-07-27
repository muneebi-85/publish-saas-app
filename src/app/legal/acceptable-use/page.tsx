import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Acceptable Use Policy · ${LEGAL.productName}`,
  description: 'What content and behavior is not allowed on Publish.',
};

export default function AcceptableUsePage() {
  return (
    <>
      <h1>Acceptable Use Policy</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <p>
        We built {LEGAL.productName} to help creators make better content. This policy lists the
        things you may not do with the Service. It applies to every account, every plan, and
        every request you send to our API.
      </p>

      <h2 id="prohibited-content">1. Prohibited content</h2>
      <p>You may not submit for review, or use the Service to create:</p>
      <ul>
        <li>Content that sexualizes, exploits, or endangers minors, in any form.</li>
        <li>Content that facilitates real-world violence, terrorism, or physical harm.</li>
        <li>Content depicting or promoting the creation of weapons capable of mass casualties (chemical, biological, radiological, nuclear, or major cyber weapons).</li>
        <li>Content that infringes copyright, trademark, or trade secrets you do not have rights to use.</li>
        <li>Content used to defame identifiable individuals or organizations without factual basis.</li>
        <li>Non-consensual intimate imagery, including AI-generated depictions of real people.</li>
        <li>Content promoting the sale of illegal drugs, stolen goods, or restricted items.</li>
        <li>Content whose primary purpose is to harass, intimidate, or incite hatred based on protected characteristics (race, religion, sex, sexual orientation, national origin, disability, etc.).</li>
      </ul>

      <h2 id="prohibited-conduct">2. Prohibited conduct</h2>
      <ul>
        <li>Circumventing plan quotas — for example, by creating multiple free accounts.</li>
        <li>Reverse-engineering, scraping, or bulk-downloading the Service or its outputs, except through the documented API within your plan limits.</li>
        <li>Reselling the Service or its output as your own without a commercial reseller agreement.</li>
        <li>Using the Service to generate outputs you then represent as coming from another product or provider.</li>
        <li>Attempting to extract training-data, prompts, or model parameters from the Service.</li>
        <li>Interfering with the Service&rsquo;s operation — for example, sending crafted inputs to cause instability or trigger spurious billing.</li>
        <li>Sharing your account credentials or API key with anyone outside your workspace.</li>
        <li>Impersonating another person, organization, or {LEGAL.productName} staff.</li>
      </ul>

      <h2 id="fair-use">3. Fair use of AI features</h2>
      <p>
        Our AI-driven features (script humanizer, SEO engine, hook analyzer, thumbnail reviewer)
        are provided to help you improve your own content. You may not:
      </p>
      <ul>
        <li>Use the humanizer to disguise AI-generated content in ways that violate a platform&rsquo;s disclosure rules.</li>
        <li>Ask the Service to produce content that would violate this policy if you produced it directly.</li>
        <li>Use the API to build a competing AI-review service.</li>
      </ul>

      <h2 id="enforcement">4. How we enforce this policy</h2>
      <p>
        When we detect a violation, we may — depending on severity and history:
      </p>
      <ul>
        <li>Refuse to process the specific request that violated the policy.</li>
        <li>Send you a warning and require acknowledgment before continued use.</li>
        <li>Suspend your account temporarily.</li>
        <li>Terminate your account permanently, without refund of the current period, for repeated or severe violations.</li>
        <li>Report to law enforcement where legally required (e.g. child-safety incidents).</li>
      </ul>

      <h2 id="reporting">5. Reporting a violation</h2>
      <p>
        Notice something that violates this policy? Report it to
        {' '}<a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> with:
      </p>
      <ul>
        <li>What you saw and where (link, screenshot, or account handle if known).</li>
        <li>Which section of this policy you believe was violated.</li>
        <li>Any additional context that would help us investigate.</li>
      </ul>
      <p>
        We investigate every report and reply with an outcome within 5 business days. Reports
        involving child safety, imminent violence, or ongoing legal harm are triaged the same day.
      </p>

      <h2 id="appeals">6. Appealing an enforcement action</h2>
      <p>
        If your account was suspended or terminated and you believe it was in error, reply to the
        enforcement email you received (or write to <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>)
        with your side of the story. We reply within 5 business days.
      </p>
    </>
  );
}
