// Debug: what does the browser see after cookie-server bootstrap?
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };

  // Go through the cookie bootstrap
  await send('Page.navigate', { url: 'http://localhost:3456/?to=/ai-coach' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 5000));

  console.log('URL:', await evalJs('location.href'));
  console.log('COOKIES:', await evalJs('document.cookie'));
  console.log('BODY:', (await evalJs('document.body.innerText')).slice(0, 500));
  console.log('---');
  console.log('PLAN FETCH:', await evalJs(`(async () => { const r = await fetch('/api/me/plan', { cache: 'no-store' }); return { status: r.status, body: await r.text() }; })()`));
  console.log('---');
  console.log('CLERK:', await evalJs(`(async () => {
    try {
      const c = window.Clerk;
      if (!c) return 'no window.Clerk';
      const s = await c.session;
      return { hasSession: !!s, sessionId: s?.id, userId: s?.user?.id, email: s?.user?.primaryEmailAddress?.emailAddress };
    } catch (e) { return 'clerk error: ' + e.message; }
  })()`));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
