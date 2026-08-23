const port = 9223;
const BOOT = 'http://localhost:3456';
async function main() {
  const pages = [['/upload', 390, 844], ['/ai-humanizer', 1440, 900], ['/brand-kit', 1440, 900]];
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await send('Page.enable'); await send('Runtime.enable');
  for (const [path, w, h] of pages) {
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
    const inputs = await evalJs(`Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select')).map((i, idx) => {
      const id = i.id;
      const lbl = id ? document.querySelector('label[for="' + id + '"]') : null;
      return {
        idx, tag: i.tagName, id: i.id || null, name: i.name || null,
        placeholder: i.getAttribute('placeholder') || null,
        aria: i.getAttribute('aria-label') || null,
        type: i.type || null,
        hasLabel: !!lbl,
        cls: (i.className || '').toString().slice(0, 50)
      };
    }).filter(i => !i.hasLabel && !i.aria && !i.placeholder && !i.name)`);
    console.log(`\n[${path}] unlabeled inputs:`, JSON.stringify(inputs, null, 1));
  }
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
