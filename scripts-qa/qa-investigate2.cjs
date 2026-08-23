// Deeper investigation: notifications full body, templates copy w/ trusted click + clipboard,
// projects rename modal, humanizer optimize flow (correct labels).
const port = 9223;
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
  try { await send('Browser.grantPermissions', { origin: 'http://localhost:3100', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {}); } catch {}

  // ── Notifications full body ──
  console.log('=== Notifications full ===');
  await goto('/notifications');
  const notif = await evalJs(`({
    main: (() => { const m = document.querySelector('main'); return m ? m.innerText.slice(0, 500).replace(/\\n/g, ' | ') : 'NO MAIN'; })(),
    allBtns: Array.from(document.querySelectorAll('main button')).map(b => b.textContent.trim()).filter(Boolean),
    empty: document.body.innerText.includes('No notifications') || document.body.innerText.includes('nothing') || document.body.innerText.includes('Nothing')
  })`);
  console.log('  main:', JSON.stringify(notif.main));
  console.log('  main buttons:', JSON.stringify(notif.allBtns));
  console.log('  empty state text present:', notif.empty);

  // ── Templates copy with trusted click ──
  console.log('=== Templates copy (trusted) ===');
  await goto('/templates');
  await trustedClick('Use template');
  await sleep(1800);
  const after = await evalJs(`(async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Use template'));
    const toast = Array.from(document.querySelectorAll('[data-sonner-toast], .sonner, [role="status"]')).map(e => e.textContent.trim().slice(0, 150)).filter(Boolean);
    let clip = '';
    try { clip = (await navigator.clipboard.readText()).slice(0, 80); } catch (e) { clip = 'CLIP_ERR:' + e.message; }
    return { btnText: btn ? btn.textContent.trim() : 'gone', toasts: toast, clip };
  })()`);
  console.log('  after trusted click:', JSON.stringify(after));

  // ── Projects rename with trusted click + modal detection ──
  console.log('=== Projects rename (trusted) ===');
  await goto('/projects');
  await trustedClick('Rename');
  await sleep(1200);
  const dialog = await evalJs(`({
    dialogs: Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog')).map(d => d.innerText.slice(0, 200).replace(/\\n/g, ' | ')),
    promptFired: !!document.querySelector('[role="dialog"] input, [role="dialog"] textarea'),
    body: document.body.innerText.slice(-400).replace(/\\n/g, ' | ')
  })`);
  console.log('  dialog:', JSON.stringify(dialog));
  // If a dialog input exists, set value and confirm
  const setDialog = await evalJs(`(() => {
    const input = document.querySelector('[role="dialog"] input, [role="dialog"] textarea');
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, 'QA rename v2');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  console.log('  dialog input set:', setDialog);
  if (setDialog) {
    await evalJs(`Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] a')).filter(b => /Save|Confirm|Rename|Apply/.test(b.textContent.trim())).forEach(b => b.click())`);
    await sleep(1500);
    const res = await evalJs(`({
      cards: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
      dialogGone: !document.querySelector('[role="dialog"]')
    })`);
    console.log('  after rename confirm:', JSON.stringify(res));
  }

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
