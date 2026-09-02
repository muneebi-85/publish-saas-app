// Prologue: ticket sign-in on the QA Chrome (port 9223) against the given
// TARGET_PORT (default 3001). Mints a fresh sign-in token via the Backend API,
// completes the ticket flow through Clerk's client JS in the page, then stamps
// the __session cookies. Leaves the browser authenticated for the audit driver.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 9223;
const APP = process.env.TARGET_PORT ? `http://localhost:${process.env.TARGET_PORT}` : 'http://localhost:3001';
const INSTANCE = 'resolved-buzzard-30.clerk.accounts.dev';
const USER_ID = process.env.QA_USER_ID || 'user_3IdXhtxhV28e3jQhWhEZmzZ7Hb4';
const TOKEN_FILE = resolve(process.env.TEMP || '/tmp', 'sitoken-qa.txt');

function loadEnv() {
  const env = {};
  for (const f of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch {}
  }
  return env;
}

async function main() {
  const env = loadEnv();
  // Mint a fresh ticket (valid 5 min) so this script is self-contained.
  const tk = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID, expires_in_seconds: 300 }),
  });
  const tkj = await tk.json().catch(() => ({}));
  if (!tkj.token) { console.error('TICKET_MINT_FAILED', tk.status, JSON.stringify(tkj).slice(0, 200)); process.exit(1); }
  writeFileSync(TOKEN_FILE, tkj.token);

  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

  await send('Page.navigate', { url: APP + '/sign-in' });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
  await new Promise(r => setTimeout(r, 3000));

  const result = await evalJs(`(async () => {
    const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
    const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
    const base = 'https://${INSTANCE}';
    const common = '?__clerk_api_version=2025-11-10&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
    const post = async (path, params) => {
      const r = await fetch(base + path + common, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    const c = await post('/v1/client/sign_ins', { locale: 'en-US' });
    const sia = c.j.response?.id;
    if (!sia) return { step: 'create', err: JSON.stringify(c.j).slice(0, 200) };
    const token = ${JSON.stringify(tkj.token)};
    const a = await post('/v1/client/sign_ins/' + sia + '/attempt_first_factor', { strategy: 'ticket', ticket: token });
    const sid = a.j.response?.created_session_id;
    if (a.j.response?.status !== 'complete' || !sid) return { step: 'attempt', err: JSON.stringify(a.j).slice(0, 250) };
    const t = await post('/v1/client/sessions/' + sid + '/tokens', {});
    const jwtStr = t.j.jwt || t.j.response?.jwt;
    if (!jwtStr) return { step: 'token', err: JSON.stringify(t.j).slice(0, 200) };
    const exp = 'expires=Fri, 01 Jan 2027 00:00:00 GMT';
    document.cookie = '__session=' + jwtStr + '; path=/; samesite=lax; ' + exp;
    document.cookie = '__client_uat=' + Math.floor(Date.now() / 1000) + '; path=/; ' + exp;
    return { ok: true, sid };
  })()`);
  console.log('SIGNIN:', JSON.stringify(result));

  if (result && result.ok) {
    await new Promise(r => setTimeout(r, 1000));
    await send('Page.navigate', { url: APP + '/dashboard' });
    for (let i = 0; i < 90; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 4000));
    const plan = await evalJs(`(async () => { const r = await fetch('/api/me/plan', { cache: 'no-store' }); return { status: r.status, body: (await r.text()).slice(0, 120) }; })()`);
    console.log('VERIFY:', JSON.stringify(plan), await evalJs('location.pathname'));
  }
  await send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
