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
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3500);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await goto('/analysis/cmst0cw4300066qbi8f3yux8q');
  const btns = await evalJs(`Array.from(document.querySelectorAll('button')).map((b, i) => {
    const t = (b.textContent || '').trim();
    const svg = b.querySelector('svg');
    return {
      i, text: t.slice(0, 40), aria: b.getAttribute('aria-label'), title: b.getAttribute('title'),
      hasSvg: !!svg, cls: (b.className || '').toString().slice(0, 60),
      html: b.outerHTML.slice(0, 160)
    };
  }).filter(b => !b.text && !b.aria && !b.title)`);
  console.log('EMPTY BUTTONS:', JSON.stringify(btns, null, 1));

  // also the unlabeled icon buttons everywhere (probably same element)
  const unlabeled = await evalJs(`Array.from(document.querySelectorAll('button')).map((b, i) => {
    const t = (b.textContent || '').trim();
    const aria = b.getAttribute('aria-label') || b.getAttribute('title') || '';
    if (t || aria) return null;
    return { i, cls: (b.className || '').toString().slice(0, 80), html: b.outerHTML.slice(0, 200) };
  }).filter(Boolean)`);
  console.log('UNLABELED:', JSON.stringify(unlabeled, null, 1));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
