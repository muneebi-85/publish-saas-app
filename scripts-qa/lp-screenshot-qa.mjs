/**
 * Landing-page QA: full-page screenshots + layout checks at desktop / tablet /
 * mobile widths. Drives the installed Chrome over CDP (no extra deps — Node's
 * built-in WebSocket + fetch).
 *
 * Usage: node scripts-qa/lp-screenshot-qa.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = path.resolve('.design-ref/qa');
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function layoutCheck() {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const offenders = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK' || el.tagName === 'META') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const overRight = Math.round(r.right - vw);
    const overLeft = Math.round(-r.left);
    if (overRight > 1 || overLeft > 1) {
      const key = el.tagName + '|' + String(el.className || '').slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      offenders.push({
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 100),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
        overRight,
        overLeft,
      });
    }
  }
  const brokenImgs = [...document.images]
    .filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => i.getAttribute('src'));
  const sections = ['checks', 'algorithm', 'pricing', 'how'].map((id) => ({
    id,
    present: !!document.getElementById(id),
  }));
  const h1 = document.querySelector('h1');
  const phone = document.querySelector('[data-m="hero-card"]');
  return {
    vw,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    overflow: de.scrollWidth - de.clientWidth,
    offenders: offenders.slice(0, 25),
    brokenImgs,
    sections,
    pricingCards: document.querySelectorAll('[data-m="pcard"]').length,
    h1Visible: h1 ? h1.getBoundingClientRect().height > 0 : false,
    phoneWidth: phone ? Math.round(phone.getBoundingClientRect().width) : null,
    bodyHeight: de.scrollHeight,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${process.env.TEMP}\\chrome-qa-lp`,
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let target;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith('http://localhost')));
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error('Chrome CDP target not available');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('WebSocket open timeout')), 10000);
    ws.onopen = () => { clearTimeout(t); res(); };
    ws.onerror = () => { clearTimeout(t); rej(new Error('WebSocket error')); };
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const results = [];
  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: BASE });
    for (let i = 0; i < 40; i++) {
      const st = await send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (st.result.value === 'complete') break;
      await sleep(250);
    }
    await sleep(2500);
    await send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => true)',
      awaitPromise: true,
      returnByValue: true,
    });

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    });
    const file = path.join(OUT, `${vp.name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

    const checks = await send('Runtime.evaluate', {
      expression: `(${layoutCheck.toString()})()`,
      returnByValue: true,
    });
    results.push({ viewport: vp.name, shot: file, ...checks.result.value });
  }

  console.log(JSON.stringify(results, null, 2));
  ws.close();
  chrome.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
