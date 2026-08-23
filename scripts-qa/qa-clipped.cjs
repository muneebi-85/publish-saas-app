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
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `${BOOT}/?to=/analysis/cmst0cw4300066qbi8f3yux8q` });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
  await sleep(3500);
  const clipped = await evalJs(`Array.from(document.querySelectorAll('*')).filter(el => {
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 50 && getComputedStyle(el).overflow !== 'hidden' && el.offsetParent !== null) {
      return true;
    }
    return false;
  }).map(el => ({
    tag: el.tagName, cls: (el.className || '').toString().slice(0, 80),
    clientW: Math.round(el.clientWidth), scrollW: Math.round(el.scrollWidth),
    text: (el.textContent || '').trim().slice(0, 60)
  })).slice(0, 10)`);
  console.log('CLIPPED:', JSON.stringify(clipped, null, 1));
  // check horizontal overflow of whole doc
  const doc = await evalJs(`({ scrollW: document.documentElement.scrollWidth, winW: window.innerWidth })`);
  console.log('DOC OVERFLOW:', JSON.stringify(doc));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
