// Inspect rendered SEO + humanizer output sections.
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3100/seo' });
  for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
  await sleep(2500);
  const seo = await evalJs(`(() => {
    const t = document.body.innerText;
    const scores = ['SEO score', 'Keyword strength', 'CPM potential', 'CTR prediction'].map(l => {
      const i = t.indexOf(l);
      return i >= 0 ? l + '=' + t.slice(i, i + 40).replace(/\\n/g, ' ') : l + '=MISSING';
    });
    const titles = t.indexOf('Optimized titles') >= 0;
    const tags = t.indexOf('Suggested tags') >= 0;
    return { scores, titles, tags };
  })()`);
  console.log('SEO STATE:', JSON.stringify(seo, null, 1));

  await send('Page.navigate', { url: 'http://localhost:3100/ai-humanizer' });
  for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
  await sleep(2500);
  const hum = await evalJs(`(() => {
    const t = document.body.innerText;
    const markers = ['Optimized script', 'Original script', 'Humanized', 'Your optimized script', 'Copy', 'Your script'].filter(m => t.includes(m));
    return { markers, h1: document.querySelector('h1')?.textContent || null, bodyLen: t.length };
  })()`);
  console.log('HUMANIZER STATE:', JSON.stringify(hum, null, 1));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
