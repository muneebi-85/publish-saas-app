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

  await goto('/projects');
  await evalJs(`localStorage.removeItem('publish_cookie_consent')`);
  await sleep(200);
  await send('Page.reload');
  await sleep(3500);

  const state = await evalJs(`(() => {
    const banner = document.querySelector('[class*="fixed bottom-0"]');
    const card = banner ? banner.firstElementChild : null;
    const br = banner ? banner.getBoundingClientRect() : null;
    const cr = card ? card.getBoundingClientRect() : null;
    const rename = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rename'));
    const rr = rename ? rename.getBoundingClientRect() : null;
    let overlap = false;
    if (br && rr && cr) {
      const cx = rr.x + rr.width / 2, cy = rr.y + rr.height / 2;
      const el = document.elementFromPoint(cx, cy);
      overlap = el && !(rename.contains(el));
    }
    return {
      banner: br ? { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) } : null,
      card: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
      renameBtn: rr ? { x: Math.round(rr.x), y: Math.round(rr.y) } : null,
      blocksRename: overlap,
      cardIsRight: cr ? cr.right > 1000 : false,
      cardCompact: cr ? cr.width < 500 : false
    };
  })()`);
  console.log('BANNER STATE:', JSON.stringify(state, null, 1));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
