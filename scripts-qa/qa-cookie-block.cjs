// Test: does the cookie banner block the Rename button click when not dismissed?
// Uses a fresh storage so the banner shows. Compares elementFromPoint at button
// center with/without banner.
const port = 9223;
const BOOT = 'http://localhost:3456';
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); let promptText = 'QA cookie test';
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true, promptText }).catch(() => {});
    }
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

  // Fresh browser context → clear the consent storage
  await goto('/projects');
  await evalJs(`localStorage.removeItem('publish_cookie_consent')`);
  await sleep(300);
  // reload so banner appears
  await send('Page.reload');
  await sleep(3500);

  const probe = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rename'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const banner = document.querySelector('[class*="fixed bottom-0"]');
    return {
      bannerPresent: !!banner,
      btnRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      topEl: el ? el.tagName + (el.className ? '.' + String(el.className).slice(0, 60) : '') : 'null',
      topText: el ? el.textContent.trim().slice(0, 40) : 'null',
      isButton: el === b || (b.contains && b.contains(el)),
      bannerRect: banner ? (() => { const br = banner.getBoundingClientRect(); return { y: Math.round(br.y), h: Math.round(br.height) }; })() : null
    };
  })()`);
  console.log('WITH BANNER:', JSON.stringify(probe, null, 1));

  // dismiss the banner
  const dismissed = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Accept all');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log('dismissed banner:', dismissed);
  await sleep(500);

  const probe2 = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Rename'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    return {
      topEl: el ? el.tagName + (el.className ? '.' + String(el.className).slice(0, 60) : '') : 'null',
      isButton: el === b || (b.contains && b.contains(el)),
      bannerGone: !document.querySelector('[class*="fixed bottom-0"]')
    };
  })()`);
  console.log('AFTER DISMISS:', JSON.stringify(probe2, null, 1));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
