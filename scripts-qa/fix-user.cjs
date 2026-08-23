/* Verifies the test user's email address so browser sign-in won't need a code */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const SECRET = env.CLERK_SECRET_KEY;
const USER_ID = 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0';

async function main() {
  // 1. Get user to find email id + verification status
  const userRes = await fetch(`https://api.clerk.com/v1/users/${USER_ID}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const user = await userRes.json();
  const emailId = user.email_addresses?.[0]?.id;
  console.log('EMAIL_ID:', emailId, 'VERIFIED:', user.email_addresses?.[0]?.verification?.status);

  // 2. Mark email verified
  if (emailId) {
    const r = await fetch(`https://api.clerk.com/v1/email_addresses/${emailId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    console.log('VERIFY_STATUS:', r.status);
  }

  // 3. List the user's other 2FA factors
  const f = await fetch(`https://api.clerk.com/v1/users/${USER_ID}/enabled_factors`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  console.log('FACTORS:', JSON.stringify(await f.json()));
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
