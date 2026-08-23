import { readFileSync } from 'node:fs';

function loadEnvFiles() {
  for (const f of ['.env', '.env.local']) {
    try {
      const txt = readFileSync(f, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      }
    } catch {}
  }
}
loadEnvFiles();

const secret = process.env.CLERK_SECRET_KEY;
const USER_ID = process.argv[2] || 'user_3HV8qXRDDXkfB8Cj9DovexQmEXQ';
if (!secret) { console.log('NO_CLERK_SECRET'); process.exit(1); }
const H = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

async function main() {
  const u = await (await fetch(`https://api.clerk.com/v1/users/${USER_ID}`, { headers: H })).json();
  console.log('user:', u.id, '| 2FA enforced:', u.two_factor_enabled, '| totp:', u.totp_enabled);
  console.log('emails:', (u.email_addresses || []).map((e: any) => `${e.email_address} verified=${e.verification?.status} id=${e.id}`));
  console.log('phone:', (u.phone_numbers || []).map((p: any) => `${p.phone_number} verified=${p.verification?.status}`));

  // Verify each email address so no email-verification step is required.
  for (const e of u.email_addresses || []) {
    if (e.verification?.status !== 'verified') {
      const r = await fetch(`https://api.clerk.com/v1/users/${USER_ID}/email_addresses/${e.id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ verified: true }),
      });
      console.log(`verify email ${e.email_address}:`, r.status);
    }
  }
  // Disable TOTP/2FA if present.
  if (u.totp_enabled) {
    const r = await fetch(`https://api.clerk.com/v1/users/${USER_ID}/totp`, { method: 'DELETE', headers: H });
    console.log('disable totp:', r.status);
  }
  console.log('done');
}
main();
