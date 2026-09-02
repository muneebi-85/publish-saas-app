// Debug: inspect the Clerk sign-in button structure.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };

  await send('Page.navigate', { url: 'http://localhost:3100/sign-in' });
  for (let i = 0; i < 40; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 2500)); // let Clerk hydrate
  const url = await evalJs('location.href');
  console.log('URL:', url);

  // Dump all buttons with type=submit: their textContent (JSON-escaped), disabled state, and outerHTML tail
  const dump = await evalJs(`Array.from(document.querySelectorAll('button')).map((b, i) => ({
    i,
    type: b.type,
    txt: JSON.stringify(b.textContent.trim().slice(0, 40)),
    disabled: b.disabled,
    html: b.outerHTML.slice(0, 200)
  }))`);
  console.log(JSON.stringify(dump, null, 1));

  // Fill credentials like a real user
  const setInput = (sel, val) => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(val)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
  await evalJs(setInput('input[name="identifier"]', process.env.QA_EMAIL ?? ''));
  await evalJs(setInput('input[name="password"]', process.env.QA_PASSWORD ?? ''));
  await new Promise((r) => setTimeout(r, 400));
  const vals = await evalJs(`Array.from(document.querySelectorAll('input')).map(i => i.name + '=' + i.value).join(' | ')`);
  console.log('FIELDS:', vals);

  // Find the real Continue button and click it with REAL CDP mouse events at its coordinates
  const btnRect = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Continue');
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2, txt: b.textContent.trim(), disabled: b.disabled };
  })()`);
  console.log('BUTTON:', JSON.stringify(btnRect));
  if (btnRect) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 });
  }

  await new Promise((r) => setTimeout(r, 5000));
  const after = await evalJs(`({ path: location.pathname, hasPw: !!document.querySelector('input[name="password"]'), hasCode: !!document.querySelector('input[name="code"]'), body: document.body.innerText.slice(0, 300) })`);
  console.log('AFTER:', JSON.stringify(after, null, 1));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
