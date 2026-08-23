// Sign in using Clerk's own client JS with a sign-in token (ticket strategy).
// Clerk client creates the __client cookie itself, so client-side auth works.
const fs = require('fs');
const port = 9223;
async function main() {
  const token = fs.readFileSync(__dirname + '/signin-token.jwt', 'utf8').trim();
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };

  // Navigate to the app so Clerk JS loads
  await send('Page.navigate', { url: 'http://localhost:3100/' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 3000)); // Clerk hydrate

  console.log('Clerk loaded:', await evalJs('!!window.Clerk'));
  const result = await evalJs(`(async () => {
    try {
      const c = window.Clerk;
      if (!c) return 'no Clerk';
      const signIn = await c.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token)} });
      return { status: signIn.status, sessionId: signIn.createdSessionId || null, err: null };
    } catch (e) {
      return { status: 'error', err: e.errors ? JSON.stringify(e.errors).slice(0, 300) : e.message };
    }
  })()`);
  console.log('TICKET SIGNIN:', JSON.stringify(result, null, 1));
  await new Promise((r) => setTimeout(r, 3000));
  console.log('SESSION pre-reload:', await evalJs(`(async () => {
    try {
      const s = await window.Clerk.session;
      return { has: !!s, id: s?.id, userId: s?.user?.id, email: s?.user?.primaryEmailAddress?.emailAddress };
    } catch (e) { return 'err: ' + e.message; }
  })()`));
  console.log('COOKIES pre-reload:', await evalJs('document.cookie'));

  // Reload to let Clerk rehydrate with the new session
  await send('Page.navigate', { url: 'http://localhost:3100/ai-coach' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 4000));
  console.log('SESSION post-reload:', await evalJs(`(async () => {
    try {
      const s = await window.Clerk.session;
      return { has: !!s, id: s?.id, userId: s?.user?.id, email: s?.user?.primaryEmailAddress?.emailAddress };
    } catch (e) { return 'err: ' + e.message; }
  })()`));
  console.log('PLAN post-reload:', await evalJs(`(async () => { const r = await fetch('/api/me/plan', { cache: 'no-store' }); return { status: r.status, body: await r.text() }; })()`));
  console.log('BODY:', (await evalJs('document.body.innerText')).slice(0, 300));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
