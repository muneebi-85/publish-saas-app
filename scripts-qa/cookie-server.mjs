// Bootstraps an authenticated browser session: mints a fresh Clerk session
// token on every request, sets the three session cookies (Domain=localhost),
// and redirects to the requested app path on the target port.
import { readFileSync } from 'node:fs';
import http from 'node:http';

const TARGET_PORT = process.env.TARGET_PORT || '3000';
const INSTANCE_DOMAIN = process.env.CLERK_INSTANCE_DOMAIN;
const USER_ID = process.env.QA_USER_ID;

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

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET || !INSTANCE_DOMAIN || !USER_ID) {
  console.error('Missing CLERK_SECRET_KEY / CLERK_INSTANCE_DOMAIN / QA_USER_ID');
  process.exit(1);
}

let cachedDevToken = null;
async function mintDevToken() {
  if (cachedDevToken) return cachedDevToken;
  const res = await fetch(`https://${INSTANCE_DOMAIN}/v1/dev_browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
  });
  const body = await res.json();
  if (!body.token) throw new Error('dev_browser mint failed');
  cachedDevToken = body.token;
  return body.token;
}

async function mintSession() {
  const sres = await fetch('https://api.clerk.com/v1/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  const session = await sres.json();
  if (!session.id) throw new Error('session mint failed');
  const tres = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    // 1-hour token so the session survives a full QA flow (page load → fill → run).
    // The Clerk default is 60s, which expired between page load and clicking
    // "Run full review", producing spurious 401s on /api/analyze.
    body: JSON.stringify({ expires_in_seconds: 3600 }),
  });
  const token = await tres.json();
  if (!token.jwt) throw new Error('token mint failed');
  const claims = JSON.parse(Buffer.from(token.jwt.split('.')[1], 'base64url').toString());
  return { jwt: token.jwt, uat: claims.iat - 1 };
}

http
  .createServer(async (req, res) => {
    try {
      const [{ jwt, uat }, devToken] = await Promise.all([mintSession(), mintDevToken()]);
      const url = new URL(req.url, 'http://localhost:3456');
      const to = url.searchParams.get('to') || '/dashboard';
      const location = `http://localhost:${TARGET_PORT}${to.startsWith('/') ? to : '/' + to}`;
      res.writeHead(302, {
        'Set-Cookie': [
          `__session=${jwt}; Path=/; Domain=localhost; Max-Age=86400; SameSite=Lax`,
          `__client_uat=${uat}; Path=/; Domain=localhost; Max-Age=86400; SameSite=Lax`,
          `__clerk_db_jwt=${devToken}; Path=/; Domain=localhost; Max-Age=86400; SameSite=Lax`,
        ],
        Location: location,
      });
      res.end('redirecting');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('bootstrap error: ' + e.message);
    }
  })
  .listen(3456, () => console.log(`cookie server on 3456 -> localhost:${TARGET_PORT} user=${USER_ID}`));
