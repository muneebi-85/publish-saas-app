// Full sign-in via Clerk's Frontend API (native context, dev_browser auth),
// mirroring exactly what Clerk's client JS does in the browser. Prints every
// Set-Cookie the server sends so we can replay them into Chrome.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const INSTANCE = process.env.CLERK_INSTANCE_DOMAIN || 'resolved-buzzard-30.clerk.accounts.dev';
const EMAIL = process.env.QA_EMAIL;
if (!EMAIL) { console.error('Set QA_EMAIL before running the sign-in harness.'); process.exit(1); }
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) { console.error('Set QA_PASSWORD before running the sign-in harness.'); process.exit(1); }
const SECRET = env.CLERK_SECRET_KEY;

async function main() {
  // 1. dev_browser token
  const dvb = await fetch(`https://${INSTANCE}/v1/dev_browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' },
  });
  const devBrowserToken = (await dvb.json()).token;
  console.log('DEV_BROWSER:', devBrowserToken.slice(0, 20) + '...');

  const H = { Authorization: `Bearer ${devBrowserToken}`, 'Content-Type': 'application/json' };
  const cookieJar = {};
  const absorb = (res, label) => {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) {
      const name = c.split('=')[0];
      const val = c.split(';')[0];
      cookieJar[name] = val;
      console.log(`  ${label} set ${name} (${val.slice(0, 30)}...)`);
    }
  };

  // 2. Create client
  const c1 = await fetch(`https://${INSTANCE}/v1/client`, { method: 'POST', headers: H });
  const clientBody = await c1.json();
  absorb(c1, 'create-client');
  const clientId = clientBody.response?.id || clientBody.id;
  console.log('CLIENT:', c1.status, clientId);

  // 3. Sign-in attempt: first identifier, then password first-factor
  const c2 = await fetch(`https://${INSTANCE}/v1/client/sign_ins`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ identifier: EMAIL }),
  });
  let si = (await c2.json()).response || {};
  absorb(c2, 'sign-in');
  console.log('SIGN_IN(ident):', c2.status, 'status=' + si.status, 'id=' + si.id);

  const c2b = await fetch(`https://${INSTANCE}/v1/client/sign_ins/${si.id}/attempt_first_factor`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ strategy: 'password', password: PASSWORD }),
  });
  si = (await c2b.json()).response || {};
  absorb(c2b, 'password-factor');
  console.log('SIGN_IN(password):', c2b.status, 'status=' + si.status);
  console.log('  verification:', JSON.stringify(si.verification || {}).slice(0, 300));

  if (si.status === 'needs_verification') {
    // Try reading the sign-in attempt from the Backend API — dev instances
    // sometimes expose the code for the test account.
    const b = await fetch(`https://api.clerk.com/v1/sign_in_attempts/${si.id}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const bb = await b.json();
    console.log('BACKEND ATTEMPT:', b.status, JSON.stringify(bb.verification || bb).slice(0, 400));
    if (bb.verification?.strategy === 'email_code') {
      console.log('CODE CANDIDATES:', JSON.stringify({ code: bb.verification.code, attempts: bb.verification.attempts, status: bb.verification.status }));
    }
    // If dev mode exposes a code, complete it
    const code = bb.verification?.code;
    if (code) {
      const c3 = await fetch(`https://${INSTANCE}/v1/client/sign_ins/${si.id}/attempt_verification`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ strategy: 'email_code', code }),
      });
      const done = (await c3.json()).response || {};
      absorb(c3, 'verify');
      console.log('VERIFY:', c3.status, 'status=' + done.status, 'session=' + (done.last_active_session_id || (done.sessions || [])[0]?.id));
    }
  } else if (si.status === 'complete') {
    console.log('SIGNED IN — session:', si.last_active_session_id || (si.sessions || [])[0]?.id);
  }

  console.log('\nFINAL COOKIE JAR:');
  for (const [k, v] of Object.entries(cookieJar)) console.log('  ' + k + '=' + v.slice(0, 60) + (v.length > 60 ? '...' : ''));
  fs.writeFileSync(path.join(__dirname, 'clerk-cookies.json'), JSON.stringify(cookieJar, null, 2));
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
