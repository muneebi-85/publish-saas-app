// Test public pages without auth using a fresh incognito-like context.
const port = 9223;
const BOOT = 'http://localhost:3456';
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (path) => {
    await send('Page.navigate', { url: `http://localhost:3100${path}` });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3500);
  };
  await send('Page.enable'); await send('Runtime.enable');

  // clear auth cookies to simulate a logged-out visitor
  await evalJs(`(async () => {
    const cookies = await cookieStore.getAll();
    for (const c of cookies) await cookieStore.delete(c.name);
    localStorage.clear();
    return cookies.length;
  })()`).catch(() => {});
  await sleep(500);

  for (const [name, path] of [['landing', '/'], ['signin', '/sign-in'], ['signup', '/sign-up'], ['pricing-public', '/pricing'], ['terms', '/legal/terms'], ['restore', '/restore'], ['notfound', '/does-not-exist-xyz']]) {
    await goto(path);
    const state = await evalJs(`({
      path: location.pathname,
      serverError: document.body.innerText.includes('Server Error') || document.body.innerText.includes('Internal Server Error'),
      notFound: document.body.innerText.includes('404') || document.body.innerText.includes('This page could not be found'),
      bodyLen: document.body.innerText.length,
      h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null,
      title: document.title.slice(0, 80)
    })`);
    console.log(`[${name}] ${state.serverError ? 'SERVER_ERROR' : 'OK'} path=${state.path} h1=${state.h1 || '(none)'} len=${state.bodyLen} title=${state.title}`);
    if (name === 'notfound') console.log(`  notFound rendered: ${state.notFound}`);
  }

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
