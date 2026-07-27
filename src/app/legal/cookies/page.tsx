import { LEGAL } from '@/lib/legal/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Cookie Policy · ${LEGAL.productName}`,
  description: 'What cookies we use and how to manage them.',
};

export default function CookiePolicyPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="effective-line">Effective {LEGAL.effectiveDate}</p>

      <p>
        This policy explains what cookies and similar technologies we use on {LEGAL.productName},
        why we use them, and what choices you have.
      </p>

      <h2 id="what">1. What are cookies?</h2>
      <p>
        Cookies are small text files a website places on your device to remember information about you
        or your visit. We use only what we need — no ad-tracking pixels, no cross-site trackers,
        no data sales.
      </p>

      <h2 id="types">2. Cookies we use</h2>

      <h3>Strictly necessary (cannot be disabled)</h3>
      <ul>
        <li><strong>Session cookie</strong> — keeps you signed in while using the app.</li>
        <li><strong>CSRF token</strong> — protects against cross-site request forgery.</li>
        <li><strong>Cookie-consent preference</strong> — remembers your choice on this banner so we do not show it again.</li>
        <li><strong>Rate-limit identifier</strong> — helps us prevent abuse of the API.</li>
      </ul>

      <h3>Functional (used only if you consent)</h3>
      <ul>
        <li><strong>Theme preference</strong> — remembers your light/dark mode setting.</li>
        <li><strong>Onboarding progress</strong> — hides tips you have already dismissed.</li>
      </ul>

      <h3>Analytics (used only if you consent)</h3>
      <ul>
        <li>
          <strong>PostHog</strong> — anonymized product analytics: which pages you visit, which
          features you use. We use this to prioritize improvements. No cross-site tracking.
        </li>
      </ul>

      <h3>What we do NOT use</h3>
      <ul>
        <li>No advertising cookies.</li>
        <li>No third-party retargeting pixels.</li>
        <li>No social-media &ldquo;like&rdquo; buttons that leak data.</li>
      </ul>

      <h2 id="manage">3. Managing your preferences</h2>
      <p>
        The first time you visit, we ask which optional cookies you allow. You can change your
        answer at any time from <a href="/settings#privacy">Settings &rsaquo; Privacy</a>, or by
        clicking &ldquo;Cookie settings&rdquo; in the footer.
      </p>
      <p>
        You can also block cookies at the browser level, but strictly-necessary cookies are needed
        for the app to function — blocking them will sign you out and disable most features.
      </p>

      <h2 id="do-not-track">4. Do Not Track</h2>
      <p>
        When your browser sends a Do Not Track (DNT) signal, we treat it as opting you out of
        analytics cookies for that session.
      </p>

      <h2 id="contact">5. Contact</h2>
      <p>
        Questions about cookies? Email <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
      </p>
    </>
  );
}
