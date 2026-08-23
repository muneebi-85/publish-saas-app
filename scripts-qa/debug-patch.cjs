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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3100/projects' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 2500));

  const id = await evalJs(`document.querySelector('a[href*="/analysis/"]')?.getAttribute('href')?.replace('/analysis/', '')`);
  console.log('REPORT ID:', id);

  const res = await evalJs(`(async () => {
    const r = await fetch('/api/projects/${id}', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'QA renamed via debug' }),
    });
    return { status: r.status, body: await r.text() };
  })()`);
  console.log('PATCH RESULT:', JSON.stringify(res));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
