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

  await goto('/pricing');
  const text = await evalJs('document.body.innerText');
  console.log('PRICING TEXT (first 2500):');
  console.log(text.slice(0, 2500));
  console.log('\n--- LINKS ---');
  const links = await evalJs(`Array.from(document.querySelectorAll('a[href]')).map(a => ({ text: a.textContent.trim().replace(/\\s+/g,' ').slice(0,50), href: a.href.slice(0,120) })).filter(l => !l.href.startsWith('http://localhost:3100/(dashboard)'))`);
  console.log(JSON.stringify(links, null, 1));
  console.log('\n--- BUTTONS ---');
  const btns = await evalJs(`Array.from(document.querySelectorAll('button')).map(b => ({ text: b.textContent.trim().replace(/\\s+/g,' ').slice(0,60), disabled: b.disabled }))`);
  console.log(JSON.stringify(btns, null, 1));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
