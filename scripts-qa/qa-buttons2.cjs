// Compare JS .click() vs trusted mouse click for Rename / Use template.
// If JS click fires a dialog but trusted click doesn't, something overlays the button.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];

  // Auto-accept any JS dialog so prompt() calls don't block the page
  let promptText = '';
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true, promptText }).catch(() => {});
    }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (path, wait = 3500) => {
    await send('Page.navigate', { url: 'http://localhost:3100' + path });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(wait);
  };
  const trustedClick = async (text, tag = 'button,a') => {
    const rect = await evalJs(`(() => {
      const b = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return true;
  };

  await send('Page.enable'); await send('Runtime.enable');

  // What element is at the Rename button's center? (hit-test via document.elementFromPoint)
  console.log('=== Rename: hit test ===');
  await goto('/projects');
  const hit = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Rename');
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      btnRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      topEl: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 60) : 'null',
      topText: el ? el.textContent.trim().slice(0, 40) : 'null',
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      pointerEvents: getComputedStyle(b).pointerEvents
    };
  })()`);
  console.log('  hit test:', JSON.stringify(hit));

  // JS click (programmatic, bypasses hit-testing)
  events.length = 0;
  const jsClick = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Rename');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log('  JS click fired:', jsClick);
  await sleep(2000);
  const dialogs = events.filter((e) => e.method === 'Page.javascriptDialogOpening').length;
  const dlg = events.filter((e) => e.method === 'Page.javascriptDialogOpening').map((e) => e.params.message?.slice(0, 100));
  console.log('  dialog events after JS click:', dialogs, JSON.stringify(dlg));
  const afterJs = await evalJs(`({ cards: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()), dialogs: document.querySelectorAll('[role="dialog"]').length })`);
  console.log('  after JS click:', JSON.stringify(afterJs));

  // Use template: same comparison
  console.log('=== Use template: hit test ===');
  await goto('/templates');
  const hit2 = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Use template');
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      topEl: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 60) : 'null',
      topText: el ? el.textContent.trim().slice(0, 40) : 'null',
      disabled: b.disabled,
      pointerEvents: getComputedStyle(b).pointerEvents
    };
  })()`);
  console.log('  hit test:', JSON.stringify(hit2));
  events.length = 0;
  const jsClick2 = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Use template');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log('  JS click fired:', jsClick2);
  await sleep(2000);
  const after2 = await evalJs(`(async () => {
    let clip = '';
    try { clip = (await navigator.clipboard.readText()).slice(0, 60); } catch (e) { clip = 'CLIP_ERR'; }
    return {
      toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.textContent.trim().slice(0, 80)),
      btnText: Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Use template'))?.textContent.trim() || 'gone',
      clip
    };
  })()`);
  console.log('  after JS click:', JSON.stringify(after2));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
