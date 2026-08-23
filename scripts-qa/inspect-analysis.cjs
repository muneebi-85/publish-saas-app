// Inspect the most recent analysis report page.
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

  // Go to analyses and find the first analysis link
  await send('Page.navigate', { url: 'http://localhost:3100/analyses' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 2500));
  const links = await evalJs(`Array.from(document.querySelectorAll('a[href*="/analysis/"]')).map(a => a.getAttribute('href'))`);
  console.log('ANALYSIS LINKS:', JSON.stringify(links));
  if (!links.length) { console.log('none found'); process.exit(0); }
  await send('Page.navigate', { url: 'http://localhost:3100' + (links[0].startsWith('/') ? links[0] : '/' + links[0]) });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 3500));

  console.log('URL:', await evalJs('location.href'));
  console.log('H1:', await evalJs(`document.querySelector('h1')?.textContent?.trim() || '(none)'`));
  console.log('H2s:', await evalJs(`Array.from(document.querySelectorAll('h2')).map(h=>h.textContent.trim().slice(0,60)).slice(0,20)`));
  const body = await evalJs('document.body.innerText');
  console.log('BODY LEN:', body.length);
  console.log('BODY (first 1800):');
  console.log(body.slice(0, 1800));
  console.log('---errors---');
  console.log('CONSOLE ERRORS:', await evalJs(`window.__qaErrors || 'n/a'`));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
