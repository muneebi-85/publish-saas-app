const port = 9223;
const BOOT = 'http://localhost:3456';
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  let promptText = 'QA renamed debug';
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method) {
      if (m.method === 'Page.javascriptDialogOpening') {
        console.log('DIALOG OPENED:', JSON.stringify({ type: m.params.type, message: m.params.message?.slice(0, 60) }));
        send('Page.handleJavaScriptDialog', { accept: true, promptText }).catch(() => {});
      }
      events.push(m);
    }
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (path) => {
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
  };
  await send('Page.enable'); await send('Runtime.enable');

  await goto('/projects');
  const state = await evalJs(`({
    cards: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
    renameBtns: Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Rename')).map(b => ({ disabled: b.disabled, aria: b.getAttribute('aria-label'), rect: (() => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }))
  })`);
  console.log('STATE:', JSON.stringify(state, null, 1));

  // hit test at the Rename button center
  const hit = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rename'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    return {
      topEl: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 80) : 'null',
      topText: el ? el.textContent.trim().slice(0, 50) : 'null',
      isBtn: el === b || b.contains(el),
      pointerEvents: getComputedStyle(b).pointerEvents,
      zIndex: getComputedStyle(b).zIndex
    };
  })()`);
  console.log('HIT TEST:', JSON.stringify(hit, null, 1));

  // now click via trusted mouse
  await sleep(300);
  const rect = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rename'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (rect) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  }
  await sleep(2500);
  const after = await evalJs(`({
    h3s: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
    renamed: Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes('QA renamed debug')),
    dialogs: events.filter(e => e.method === 'Page.javascriptDialogOpening').length,
    toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.textContent.trim().slice(0, 60))
  })`);
  console.log('AFTER:', JSON.stringify(after, null, 1));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
