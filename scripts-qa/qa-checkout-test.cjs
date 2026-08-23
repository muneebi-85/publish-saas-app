const port = 9223;
const BOOT = 'http://localhost:3456';
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (path) => {
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3500);
  };
  await send('Page.enable'); await send('Runtime.enable');

  await goto('/pricing');
  // enable yearly toggle first
  const yearlyToggle = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => /yearly/i.test(b.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log('yearly toggle clicked:', yearlyToggle);
  await sleep(800);

  // Intercept the /api/billing/checkout call: override fetch in page
  await evalJs(`(async () => {
    window.__checkoutCalls = [];
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (url.includes('/api/billing/checkout')) {
        window.__checkoutCalls.push({ url, body: args[1] ? String(args[1].body) : null });
      }
      return orig.apply(window, args);
    };
    return true;
  })()`);

  // click Switch to Agency
  const clicked = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Switch to Agency'));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`);
  console.log('Switch to Agency clicked:', clicked);
  await sleep(6000);

  const calls = await evalJs(`window.__checkoutCalls || []`);
  console.log('checkout API calls:', JSON.stringify(calls, null, 1));
  const url = await evalJs('location.href');
  console.log('final URL:', url);
  const bodyText = await evalJs('document.body.innerText.slice(0, 300).replace(/\\n/g," ")');
  console.log('body:', bodyText);

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
