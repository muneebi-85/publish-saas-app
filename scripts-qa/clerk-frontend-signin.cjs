// Perform a real Clerk sign-in via the Frontend API (what Clerk's client JS
// does) using a dev_browser token, and print the cookies the server wants set.
// Dev-mode instances don't require new-device verification when a valid
// dev_browser token is used, so this produces a session the client JS trusts.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const INSTANCE = process.env.CLERK_INSTANCE_DOMAIN || 'resolved-buzzard-30.clerk.accounts.dev';
const EMAIL = process.env.QA_EMAIL || 'qa2.freebuff.tester@gmail.com';
const PASSWORD = process.env.QA_PASSWORD || 'FreebuffQA#2026x!';

async function main() {
  // 1. Mint a dev_browser token
  const dvb = await fetch(`https://${INSTANCE}/v1/dev_browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' },
  });
  const dvbBody = await dvb.json();
  if (!dvbBody.token) throw new Error('dev_browser mint failed: ' + JSON.stringify(dvbBody).slice(0, 200));
  const devBrowserToken = dvbBody.token;
  console.log('DEV_BROWSER:', devBrowserToken.slice(0, 20) + '...');

  const AUTH = { Authorization: `Bearer ${devBrowserToken}`, 'Content-Type': 'application/json' };

  // 2. Create a client (native context: Authorization header, no Origin)
  const clientRes = await fetch(`https://${INSTANCE}/v1/client`, { method: 'POST', headers: AUTH });
  const clientBody = await clientRes.json();
  console.log('CLIENT status:', clientRes.status, 'id:', clientBody.response?.id || clientBody.id);
  const clientId = clientBody.response?.id || clientBody.id;
  if (!clientId) { console.log('CLIENT BODY:', JSON.stringify(clientBody).slice(0, 400)); throw new Error('no client id'); }
  const clientSetCookies = clientRes.headers.getSetCookie ? clientRes.headers.getSetCookie().map((c) => c.split(';')[0]) : [];
  console.log('CLIENT SET-COOKIE:', JSON.stringify(clientSetCookies));
  const clientCookie = clientSetCookies.find((c) => c.startsWith('__client='))?.split('=')[1] || null;
  console.log('CLIENT_COOKIE_LEN:', clientCookie ? clientCookie.length : 0);

  // 3. Attach the backend-created session to this client so client JS trusts it.
  const secret = env.CLERK_SECRET_KEY;
  const sessionRes = await fetch('https://api.clerk.com/v1/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0' }),
  });
  const session = await sessionRes.json();
  console.log('BACKEND SESSION:', sessionRes.status, session.id);
  if (!session.id) throw new Error('no backend session');

  // Touch the session on the client we created
  const touchRes = await fetch(`https://${INSTANCE}/v1/client/sessions/${session.id}/touch`, {
    method: 'POST',
    headers: AUTH,
  });
  const touchBody = await touchRes.json();
  console.log('TOUCH status:', touchRes.status, JSON.stringify(touchBody.response ? { id: touchBody.response.id, status: touchBody.response.status } : touchBody).slice(0, 300));
  const touchCookies = touchRes.headers.getSetCookie ? touchRes.headers.getSetCookie().map((c) => c.split(';')[0]) : [];
  console.log('TOUCH SET-COOKIE:', JSON.stringify(touchCookies));

  // Mint a token for the session
  const tokenRes = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const tokenBody = await tokenRes.json();
  console.log('TOKEN status:', tokenRes.status, 'len:', tokenBody.jwt?.length || 0);
  if (tokenBody.jwt) {
    fs.writeFileSync(path.join(__dirname, 'client-session.jwt'), tokenBody.jwt);
    const claims = JSON.parse(Buffer.from(tokenBody.jwt.split('.')[1], 'base64url').toString());
    console.log('TOKEN claims:', JSON.stringify({ sub: claims.sub, sid: claims.sid, sts: claims.sts, iat: claims.iat }));
  }
  process.exit(0);

  // (unreachable: kept for reference) Start a sign-in attempt with email + password strategy
  const siRes = await fetch(`https://${INSTANCE}/v1/client/sign_ins`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ identifier: EMAIL, strategy: 'password', password: PASSWORD }),
  });
  const siBody = await siRes.json();
  const si = siBody.response || siBody;
  console.log('SIGN_IN status:', siRes.status, 'id:', si.id, 'status:', si.status);
  console.log('SIGN_IN step:', JSON.stringify(si?.status === 'needs_verification' ? si.verification : si));

  if (si?.status === 'needs_verification') {
    const ver = si.verification || {};
    console.log('VERIFICATION:', JSON.stringify(ver).slice(0, 500));
    if (ver.strategy === 'email_code' && ver.status === 'pending_verification') {
      // In dev mode, the code can be read from the verification object? Try the
      // verification via Clerk Backend API for the sign-in attempt.
      const secret = env.CLERK_SECRET_KEY;
      const vr = await fetch(`https://api.clerk.com/v1/sign_in_attempts/${si.id}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const vb = await vr.json();
      console.log('BACKEND SIGN_IN_ATTEMPT:', vr.status, JSON.stringify(vb.verification || vb).slice(0, 500));
    }
  }

  // 4. If the sign-in completed, the session token is in the response
  if (si?.status === 'complete') {
    console.log('SESSION id:', si.last_active_session_id || (si.sessions && si.sessions[0]?.id));
  }
  // Print the Set-Cookie headers the server wants
  console.log('SET-COOKIE (client):', clientRes.headers.getSetCookie ? clientRes.headers.getSetCookie().map((c) => c.split(';')[0]) : 'n/a');
  console.log('SET-COOKIE (signin):', siRes.headers.getSetCookie ? siRes.headers.getSetCookie().map((c) => c.split(';')[0]) : 'n/a');
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
