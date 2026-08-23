import { readFileSync } from 'node:fs';

function loadEnvFiles() {
  for (const f of ['.env', '.env.local']) {
    try {
      const txt = readFileSync(f, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      }
    } catch {
      /* ignore */
    }
  }
}
loadEnvFiles();

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
  console.log('NO_CLERK_SECRET');
  process.exit(1);
}

const email = process.argv[2] || 'qa2.freebuff.tester@gmail.com';
const password = process.argv[3] || 'FreebuffQA#2026x!';

async function main() {
  const res = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_address: [email],
      password,
      first_name: 'QA',
      last_name: 'Tester',
      skip_password_checks: true,
    }),
  });
  const body = await res.json();
  console.log('STATUS:', res.status);
  if (body.id) {
    console.log('USER_ID:', body.id);
    console.log('EMAIL:', (body.email_addresses || []).map((e: any) => e.email_address).join(','));
  } else {
    console.log('ERROR:', JSON.stringify(body).slice(0, 300));
  }
}

main();
