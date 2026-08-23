// Test the Reports page (PDF export) and dashboard content.
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
  const goto = async (path) => {
    await send('Page.navigate', { url: 'http://localhost:3100' + path });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
  };

  await send('Page.enable'); await send('Runtime.enable');

  // ── Reports page ──
  console.log('=== Reports ===');
  await goto('/reports');
  const rep = await evalJs(`({
    exportBtn: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /Export|PDF|Download/.test(t)),
    rows: document.querySelectorAll('tr, [class*="row"], [class*="card"]').length,
    body: document.body.innerText.slice(0, 300).replace(/\\n/g, ' ')
  })`);
  console.log('  reports:', JSON.stringify(rep));

  // ── Dashboard ──
  console.log('=== Dashboard ===');
  await goto('/dashboard');
  const dash = await evalJs(`({
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null,
    hasQuota: document.body.innerText.includes('analyses used') || document.body.innerText.includes('quota'),
    body: document.body.innerText.slice(0, 500).replace(/\\n/g, ' ')
  })`);
  console.log('  dashboard:', JSON.stringify(dash));

  // ── Channel analytics ──
  console.log('=== Channel Analytics ===');
  await goto('/channel-analytics');
  const ca = await evalJs(`({
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null,
    hasConnect: document.body.innerText.includes('Connect') || document.body.innerText.includes('connect'),
    body: document.body.innerText.slice(0, 300).replace(/\\n/g, ' ')
  })`);
  console.log('  channel analytics:', JSON.stringify(ca));

  // ── Analyses ──
  console.log('=== Analyses ===');
  await goto('/analyses');
  const an = await evalJs(`({
    hasRows: document.body.innerText.includes('QA deep test video') || document.body.innerText.includes('10 Secret Study Tips'),
    body: document.body.innerText.slice(0, 300).replace(/\\n/g, ' ')
  })`);
  console.log('  analyses:', JSON.stringify(an));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
