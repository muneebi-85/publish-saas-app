import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `DMCA / Copyright Policy · ${LEGAL.productName}`,
  description: 'How to report copyright infringement on Publish.',
};

export default function DMCAPage() {
  return (
    <>
      <h1>DMCA &amp; Copyright Policy</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <p>
        {LEGAL.productName} respects the intellectual-property rights of others. If you believe
        that content on the Service infringes your copyright, follow the process below. We
        respond to notices that comply with the U.S. Digital Millennium Copyright Act (DMCA)
        and equivalent laws in other jurisdictions.
      </p>

      <div className="callout">
        <strong>Note.</strong> Our review tool analyzes creators&rsquo; own content — reports of
        infringement here typically involve one creator&rsquo;s uploaded material being used by
        another. We take valid notices seriously and remove or disable infringing content promptly.
      </div>

      <h2 id="how-to-file">1. How to file a takedown notice</h2>
      <p>Send an email to <a href={`mailto:${LEGAL.dmcaEmail}`}>{LEGAL.dmcaEmail}</a> that includes all of the following:</p>
      <ol>
        <li>
          <strong>Identification of the copyrighted work</strong> claimed to have been infringed
          (title, description, or URL to the original).
        </li>
        <li>
          <strong>Identification of the material</strong> claimed to be infringing, with enough
          information to allow us to locate it (URL, report ID, screenshot).
        </li>
        <li>
          A <strong>statement of good-faith belief</strong> that the use is not authorized by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          A <strong>statement, under penalty of perjury</strong>, that the information in the notice
          is accurate and that you are the copyright owner or authorized to act on the owner&rsquo;s behalf.
        </li>
        <li>
          Your <strong>physical or electronic signature</strong>, along with your full legal name,
          postal address, phone number, and email address.
        </li>
      </ol>
      <p>
        A notice that is missing any of the above may be delayed or rejected until we receive a
        complete submission.
      </p>

      <h2 id="counter-notice">2. Filing a counter-notice</h2>
      <p>
        If we removed content that you believe was removed by mistake or misidentification, you
        may submit a counter-notice to <a href={`mailto:${LEGAL.dmcaEmail}`}>{LEGAL.dmcaEmail}</a>
        {' '}with:
      </p>
      <ol>
        <li>Your <strong>physical or electronic signature</strong>.</li>
        <li>Identification of the removed material and its former location.</li>
        <li>
          A <strong>statement, under penalty of perjury</strong>, that you have a good-faith belief
          the material was removed as a result of mistake or misidentification.
        </li>
        <li>
          Your name, address, phone number, and a statement that you consent to the jurisdiction
          of the federal district court in the district where you reside (or, if you reside
          outside the United States, of any district in which we may be found), and that you
          will accept service of process from the party who filed the original notice.
        </li>
      </ol>
      <p>
        Upon receipt of a valid counter-notice, we forward it to the original complainant. If they
        do not initiate a court action within 10-14 business days, we may restore the content.
      </p>

      <h2 id="repeat-infringers">3. Repeat infringers</h2>
      <p>
        We terminate the accounts of users who are the subject of repeated valid infringement notices,
        under conditions we determine appropriate.
      </p>

      <h2 id="misuse">4. Warning about false claims</h2>
      <p>
        Submitting a fraudulent takedown notice or counter-notice is illegal under the DMCA and
        can subject the sender to liability for damages, including costs and attorneys&rsquo; fees.
        Do not submit a notice unless you are certain you are the rights holder or authorized to
        act on their behalf.
      </p>

      <h2 id="agent">5. Designated agent</h2>
      <p>
        For the purposes of the DMCA, our designated agent for notice of claims of copyright
        infringement is:
      </p>
      <p>
        <strong>DMCA Agent, {LEGAL.legalEntity}</strong><br />
        {LEGAL.legalAddress}<br />
        Email: <a href={`mailto:${LEGAL.dmcaEmail}`}>{LEGAL.dmcaEmail}</a>
      </p>
    </>
  );
}
