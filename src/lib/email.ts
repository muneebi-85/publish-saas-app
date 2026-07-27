/**
 * Transactional email via Resend.
 *
 * All senders return { success, error? } and no-op gracefully when
 * RESEND_API_KEY is empty (dev mode) — this lets local flows continue
 * without a live key.
 *
 * Copy rules:
 *  - Evidence-based, factual language only.
 *  - Never promise revenue, earnings, or guaranteed monetization outcomes.
 *  - Describe what the report/plan contains, not what it will "make" the user.
 */

import { env } from './env';
import { Resend } from 'resend';

type SendResult = { success: boolean; error?: string };

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(env.RESEND_API_KEY);
  return _client;
}

// ── Shared HTML shell ──────────────────────────────────────────────
// Minimal, brand-neutral: plain black text on white, 560px table, no images.

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footNote?: string;
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaUrl, footNote } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#ffffff;">
        <tr>
          <td style="padding:0 0 24px 0;font-size:18px;font-weight:600;letter-spacing:-0.01em;color:#000000;">
            Publish
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 16px 0;font-size:22px;font-weight:600;line-height:1.3;color:#000000;">
            ${escapeHtml(heading)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 24px 0;font-size:15px;line-height:1.55;color:#000000;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 32px 0;">
            <a href="${escapeHtml(ctaUrl)}"
               style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:12px 20px;font-size:14px;font-weight:600;border-radius:6px;">
              ${escapeHtml(ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #000000;padding:16px 0 0 0;font-size:12px;line-height:1.5;color:#000000;">
            ${footNote ? escapeHtml(footNote) + '<br/>' : ''}
            You are receiving this email because you have an account with Publish.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    // Dev mode / no key configured — no-op success.
    return { success: true };
  }
  try {
    const { error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) return { success: false, error: String(error.message ?? error) };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Senders ────────────────────────────────────────────────────────

export async function sendReportReady(args: {
  to: string;
  projectTitle: string;
  reportUrl: string;
  monetizationScore: number;
  criticalIssues: number;
}): Promise<SendResult> {
  const { to, projectTitle, reportUrl, monetizationScore, criticalIssues } = args;
  const subject = `Your Publish report for ${projectTitle} is ready`;
  const body = `
    <p style="margin:0 0 12px 0;">Your analysis of <strong>${escapeHtml(projectTitle)}</strong> has finished.</p>
    <p style="margin:0 0 12px 0;">Summary of findings:</p>
    <ul style="margin:0 0 12px 20px;padding:0;">
      <li>Monetization readiness score: <strong>${monetizationScore}/100</strong></li>
      <li>Critical issues flagged: <strong>${criticalIssues}</strong></li>
    </ul>
    <p style="margin:0;">The full report lists each finding with the evidence it was based on. Review the flagged items before publishing.</p>
  `;
  return send(
    to,
    subject,
    shell({
      preheader: `Report ready — score ${monetizationScore}/100, ${criticalIssues} critical issue${criticalIssues === 1 ? '' : 's'}.`,
      heading: 'Your report is ready',
      bodyHtml: body,
      ctaLabel: 'View report',
      ctaUrl: reportUrl,
    })
  );
}

export async function sendPaymentFailed(args: {
  to: string;
  plan: string;
  updatePaymentUrl: string;
}): Promise<SendResult> {
  const { to, plan, updatePaymentUrl } = args;
  const subject = `Payment failed for your ${plan} plan`;
  const body = `
    <p style="margin:0 0 12px 0;">We were unable to charge the card on file for your <strong>${escapeHtml(plan)}</strong> plan.</p>
    <p style="margin:0 0 12px 0;">Common reasons: expired card, insufficient funds, or a bank hold on the transaction.</p>
    <p style="margin:0;">Update your payment method to keep your subscription active. If the issue is not resolved, access to paid features may be paused.</p>
  `;
  return send(
    to,
    subject,
    shell({
      preheader: `Payment failed for your ${plan} plan — update your card to continue.`,
      heading: 'Payment failed',
      bodyHtml: body,
      ctaLabel: 'Update payment method',
      ctaUrl: updatePaymentUrl,
    })
  );
}

export async function sendPlanActivated(args: {
  to: string;
  plan: string;
  dashboardUrl: string;
}): Promise<SendResult> {
  const { to, plan, dashboardUrl } = args;
  const subject = `Your ${plan} plan is active`;
  const body = `
    <p style="margin:0 0 12px 0;">Your <strong>${escapeHtml(plan)}</strong> plan is now active on your Publish account.</p>
    <p style="margin:0 0 12px 0;">Plan features and limits are listed on the pricing page and reflected in your dashboard.</p>
    <p style="margin:0;">You can review invoices and change your plan at any time from account settings.</p>
  `;
  return send(
    to,
    subject,
    shell({
      preheader: `${plan} plan activated on your Publish account.`,
      heading: 'Plan activated',
      bodyHtml: body,
      ctaLabel: 'Open dashboard',
      ctaUrl: dashboardUrl,
    })
  );
}

export async function sendQuotaWarning(args: {
  to: string;
  used: number;
  limit: number;
  plan: string;
}): Promise<SendResult> {
  const { to, used, limit, plan } = args;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const subject = `You have used ${pct}% of your ${plan} quota`;
  const body = `
    <p style="margin:0 0 12px 0;">You have used <strong>${used}</strong> of <strong>${limit}</strong> units on your <strong>${escapeHtml(plan)}</strong> plan this billing period (${pct}%).</p>
    <p style="margin:0 0 12px 0;">Once you reach the limit, further runs will be paused until the next cycle begins or you upgrade your plan.</p>
    <p style="margin:0;">Current usage and reset date are visible on your dashboard.</p>
  `;
  return send(
    to,
    subject,
    shell({
      preheader: `${pct}% of ${plan} quota used (${used}/${limit}).`,
      heading: 'Quota usage notice',
      bodyHtml: body,
      ctaLabel: 'View usage',
      ctaUrl: `${env.APP_URL}/dashboard/usage`,
    })
  );
}
