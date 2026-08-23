// Quick probe: connect to the running Chrome tab, check auth + page state.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  if (!tab) { console.log('NO_TAB'); process.exit(0); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await send('Page.enable'); await send('Runtime.enable');
  const state = await evalJs(`({
    url: location.href,
    ready: document.readyState,
    title: document.title,
    bodyLen: document.body ? document.body.innerText.length : 0,
    hasClerk: !!window.Clerk
  })`);
  console.log('TAB:', JSON.stringify(state));

  // auth check via API
  const auth = await evalJs(`(async () => {
    try {
      const r = await fetch('/api/me/plan', { cache: 'no-store' });
      return { status: r.status, body: await r.text().catch(() => '') };
    } catch (e) { return { err: e.message }; }
  })()`);
  console.log('AUTH:', JSON.stringify(auth).slice(0, 400));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
