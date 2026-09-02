// Prologue-only: full ticket sign-in in the current browser (creates a fresh
// FAPI session on this Chrome's client), mint, set cookies. Leaves the browser
// authenticated for the audit driver that follows.
const PORT = 9223;
const APP = 'http://localhost:3100';
const INSTANCE = 'resolved-buzzard-30.clerk.accounts.dev';
const fs = await import('node:fs');
const token = fs.default.readFileSync('/tmp/sitoken-fresh.txt', 'utf8').trim();
const EMAIL = 'qa.audit.0830@proton.me';

async function main() {
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r?.result?.value; };

  await send('Page.navigate', { url: APP + '/sign-in' });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
  await new Promise(r => setTimeout(r, 3000));

  const result = await evalJs(`(async () => {
    const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
    const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
    const base = 'https://${INSTANCE}';
    const common = '?__clerk_api_version=2025-11-10&_clerk_js_version=5.127.2&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
    const post = async (path, params) => {
      const r = await fetch(base + path + common, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    // 1. fresh sign-in attempt on THIS client via ticket
    const c = await post('/v1/client/sign_ins', { locale: 'en-US', identifier: ${JSON.stringify(EMAIL)} });
    const sia = c.j.response?.id;
    if (!sia) return { step: 'create', err: JSON.stringify(c.j).slice(0, 200) };
    const a = await post('/v1/client/sign_ins/' + sia + '/attempt_first_factor', { strategy: 'ticket', ticket: ${JSON.stringify(token)} });
    const sid = a.j.response?.created_session_id;
    if (a.j.response?.status !== 'complete' || !sid) return { step: 'attempt', err: JSON.stringify(a.j).slice(0, 250) };
    // 2. mint session token
    const t = await post('/v1/client/sessions/' + sid + '/tokens', {});
    const jwtStr = typeof t.j.response === 'string' ? t.j.response : t.j.response?.jwt;
    if (!jwtStr) return { step: 'token', err: JSON.stringify(t.j).slice(0, 200) };
    // 3. cookies
    const exp = 'expires=Fri, 01 Jan 2027 00:00:00 GMT';
    document.cookie = '__session=' + jwtStr + '; path=/; samesite=lax; ' + exp;
    document.cookie = '__session_rQaZVsp-=' + jwtStr + '; path=/; samesite=lax; ' + exp;
    document.cookie = '__client_uat=' + Math.floor(Date.now() / 1000) + '; path=/; ' + exp;
    document.cookie = '__client_uat_rQaZVsp-=' + Math.floor(Date.now() / 1000) + '; path=/; ' + exp;
    return { ok: true, sid };
  })()`);
  console.log('SIGNIN:', JSON.stringify(result));

  if (result && result.ok) {
    await new Promise(r => setTimeout(r, 1000));
    await send('Page.navigate', { url: APP + '/upload' });
    for (let i = 0; i < 90; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 4000));
    const plan = await evalJs(`(async () => { const r = await fetch('/api/me/plan', { cache: 'no-store' }); return { status: r.status }; })()`);
    console.log('VERIFY:', JSON.stringify(plan), await evalJs('location.pathname'));
  }
  await send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
