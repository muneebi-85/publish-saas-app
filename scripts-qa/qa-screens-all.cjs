// Screenshots of key pages at desktop + mobile widths for UI/UX review.
const port = 9223;
const BOOT = 'http://localhost:3456';
const fs = require('node:fs');
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
    await sleep(4000);
  };
  const shot = async (file, width = 1440, height = 900) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await sleep(600);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync('shots', { recursive: true });
    fs.writeFileSync('shots/' + file, Buffer.from(r.data, 'base64'));
    console.log('saved shots/' + file);
  };
  await send('Page.enable'); await send('Runtime.enable');
  fs.mkdirSync('shots', { recursive: true });

  // Desktop shots
  for (const [name, path] of [
    ['landing', '/'], ['dashboard', '/dashboard'], ['upload', '/upload'],
    ['analyses', '/analyses'], ['analysis-detail', '/analysis/cmst0cw4300066qbi8f3yux8q'],
    ['projects', '/projects'], ['templates', '/templates'], ['pricing', '/pricing'],
    ['ai-coach', '/ai-coach'], ['humanizer', '/ai-humanizer'], ['seo', '/seo'],
    ['brand-kit', '/brand-kit'], ['channels', '/connected-channels'], ['channel-analytics', '/channel-analytics'],
    ['reports', '/reports'], ['notifications', '/notifications'], ['settings', '/settings'], ['help', '/help'],
  ]) {
    await goto(path);
    await shot(name + '-desktop.png');
  }

  // Mobile shots (key pages)
  for (const [name, path] of [['landing', '/'], ['dashboard', '/dashboard'], ['upload', '/upload'], ['pricing', '/pricing'], ['projects', '/projects'], ['analysis-detail', '/analysis/cmst0cw4300066qbi8f3yux8q']]) {
    await goto(path);
    await shot(name + '-mobile.png', 390, 844);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
