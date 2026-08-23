const http = require('node:http');
const fs = require('node:fs');
const PORT = 9223;
const BASE = 'http://localhost:3100';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function shot(ws, send, url, file, wait = 5000) {
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, wait));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('saved', file);
}

async function main() {
  const tabs = await get('/json');
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const send = (m, params) =>
    new Promise((res) => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method: m, params }));
    });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m.result);
      pend.delete(m.id);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  // Landing: scroll to the layers section
  await send('Page.navigate', { url: `${BASE}/` });
  await new Promise((r) => setTimeout(r, 6000));
  await send('Runtime.evaluate', { expression: `document.getElementById('layers')?.scrollIntoView(); window.scrollBy(0, -80);` });
  await new Promise((r) => setTimeout(r, 1500));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const r1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/landing-layers.png', Buffer.from(r1.data, 'base64'));
  console.log('saved /tmp/landing-layers.png');

  // Share page
  await shot(ws, send, `${BASE}/share/cmssrong50007xz2k18o3fhpv`, '/tmp/share-page.png');

  // Pricing page (in-app, authed)
  await shot(ws, send, `${BASE}/pricing`, '/tmp/pricing-yearly.png', 6000);

  ws.close();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
