const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const SECRET = env.CLERK_SECRET_KEY;

async function main() {
  const r = await fetch('https://api.clerk.com/v1/instance', {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const body = await r.json();
  console.log('STATUS:', r.status);
  console.log(
    JSON.stringify(
      {
        two_factor_enabled: body.two_factor_enabled,
        sign_in_attempts_2fa: body.sign_in_attempts_2fa,
        email_code: body.email_code,
        second_factor_required: body.second_factor_required,
        instances: body,
      },
      null,
      1,
    ).slice(0, 1500),
  );
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
