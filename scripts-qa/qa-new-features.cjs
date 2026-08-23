/**
 * QA for the five new features:
 *   1. Shareable Publish Score card (/share/[id] renders publicly + OG image)
 *   2. Retention drop-off curve on the analysis page
 *   3. Landing "six layers" section replacing fictional testimonials
 *   4. Pricing monthly/yearly toggle (in-app + landing)
 *   5. Channel analytics live-YouTube section (graceful without a connection)
 */
const http = require('node:http');
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

async function main() {
  const tabs = await get('/json');
  const tab = tabs.find((t) => t.type === 'page');
  if (!tab) throw new Error('no page tab');
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
  const nav = async (url, wait = 4000) => {
    await send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, wait));
  };
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result.value;
  };

  // ── 3. Landing: six layers section + pricing toggle ──
  await nav(`${BASE}/`);
  const layers = await evalJs(`JSON.stringify({
    section: !!document.querySelector('[data-m="layers"]'),
    cards: document.querySelectorAll('[data-m="layer"]').length,
    testimonialsGone: !document.querySelector('[data-m="testimonials"]'),
    tcards: document.querySelectorAll('[data-m="tcard"]').length,
  })`);
  console.log('landing layers:', layers);

  // Pricing toggle on landing
  const btns = await evalJs(`(() => {
    const all = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    const yearly = all.find(t => t.includes('Yearly'));
    return JSON.stringify({ hasYearlyToggle: !!yearly, yearlyText: yearly || null });
  })()`);
  console.log('landing toggle:', btns);
  await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yearly'))?.click()`);
  await new Promise((r) => setTimeout(r, 800));
  const yearlyPrices = await evalJs(`JSON.stringify({
    creatorCard: (() => { const el = Array.from(document.querySelectorAll('[data-m="pcard"]')).find(c => c.textContent.includes('Creator')); return el ? el.textContent.match(/\\$\\d+/)?.[0] : null; })(),
    billedNote: document.body.innerText.includes('Billed') && document.body.innerText.includes('two months free'),
  })`);
  console.log('landing yearly prices:', yearlyPrices);

  // ── 4. In-app pricing toggle (needs auth — reuse cookie-server session) ──
  await nav(`${BASE}/pricing`);
  await new Promise((r) => setTimeout(r, 3000));
  const pricing = await evalJs(`JSON.stringify({
    toggle: Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Yearly')),
    monthly: document.body.innerText.includes('$12') || document.body.innerText.includes('$19'),
  })`);
  console.log('in-app pricing:', pricing);
  await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yearly'))?.click()`);
  await new Promise((r) => setTimeout(r, 800));
  const pricingYearly = await evalJs(`JSON.stringify({
    billedNote: document.body.innerText.includes('Billed $120/year'),
    twoMonths: document.body.innerText.includes('two months free'),
  })`);
  console.log('in-app yearly:', pricingYearly);

  // ── 1. Share page ──
  await nav(`${BASE}/analyses`, 4000);
  const reportId = await evalJs(`(() => {
    const href = document.querySelector('a[href^="/analysis/"]')?.getAttribute('href');
    return href ? href.split('/').pop() : null;
  })()`);
  console.log('report id:', reportId);
  if (reportId) {
    await nav(`${BASE}/share/${reportId}`);
    const share = await evalJs(`JSON.stringify({
      score: document.body.innerText.includes('/100'),
      title: document.body.innerText.includes('Publish Score'),
      cta: document.body.innerText.includes('Run your own free review'),
    })`);
    console.log('share page:', share);
    // OG image route
    const og = await evalJs(`fetch('/share/${reportId}/opengraph-image', { headers: { accept: 'image/png' } }).then(r => ({ status: r.status, type: r.headers.get('content-type') })).catch(e => ({ err: String(e) }))`);
    console.log('og image:', JSON.stringify(og));
  }

  // ── 2. Retention curve on analysis page ──
  if (reportId) {
    await nav(`${BASE}/analysis/${reportId}`, 5000);
    const curve = await evalJs(`JSON.stringify({
      curve: !!document.querySelector('svg[aria-label="Predicted retention curve"]'),
      text: document.body.innerText.includes('Predicted retention curve'),
      anchors: Array.from(document.querySelectorAll('text')).filter(t => t.textContent.includes('%')).length > 0,
      shareBtn: Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Share score')),
    })`);
    console.log('analysis curve + share:', curve);
  }

  // ── 5. Channel analytics (no connection → no crash) ──
  await nav(`${BASE}/channel-analytics`, 4000);
  const channelAnalytics = await evalJs(`JSON.stringify({
    h1: document.querySelector('h1')?.textContent,
    liveSection: !!document.querySelector('[data-m="live-youtube"]'),
    pageOk: document.body.innerText.length > 50,
  })`);
  console.log('channel analytics:', channelAnalytics);

  ws.close();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
