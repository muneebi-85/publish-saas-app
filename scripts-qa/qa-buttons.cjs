// Capture console errors + network failures while clicking Rename / Use template.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
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
  const consoleErrors = () => events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map((e) => (e.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  console.log('=== Rename ===');
  await goto('/projects');
  events.length = 0;
  await trustedClick('Rename');
  await sleep(2500);
  const after = await evalJs(`({
    dialogs: document.querySelectorAll('[role="dialog"], dialog').length,
    prompt: typeof window.prompt,
    bodyTail: document.body.innerText.slice(-150).replace(/\\n/g, ' | '),
    buttons: Array.from(document.querySelectorAll('main button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 8)
  })`);
  console.log('  after:', JSON.stringify(after));
  console.log('  console errors:', JSON.stringify(consoleErrors()));

  console.log('=== Use template ===');
  await goto('/templates');
  events.length = 0;
  await trustedClick('Use template');
  await sleep(2500);
  const after2 = await evalJs(`({
    dialogs: document.querySelectorAll('[role="dialog"], dialog').length,
    toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.textContent.trim().slice(0, 100)),
    bodyTail: document.body.innerText.slice(-200).replace(/\\n/g, ' | ')
  })`);
  console.log('  after:', JSON.stringify(after2));
  console.log('  console errors:', JSON.stringify(consoleErrors()));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
