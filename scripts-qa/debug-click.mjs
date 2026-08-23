import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PORT = 9223;
const APP = `http://localhost:${process.env.TARGET_PORT || 3100}`;
const BOOT = 'http://localhost:3456';
const PRO_USER_ID = 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0';
let ENV = {};
for (const f of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
      if (m) ENV[m[1]] = m[2].trim();
    }
  } catch {}
}
function findChrome() {
  const c = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/c/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const p of c) if (existsSync(p)) return p;
  throw new Error('no chrome');
}
async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json/version`); if (r.ok) return; } catch {}
    if (i === 1) {
      const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}\\.chrome-profile`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
      chrome.unref();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
    return r.result?.value;
  }
  async sleep(ms) { await new Promise((r) => setTimeout(r, ms)); }
  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      const ready = await this.eval('document.readyState');
      if (ready === 'complete') return;
      await this.sleep(250);
    }
  }
  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}

await waitForChrome();
const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');

async function probe(selector, label) {
  const info = await cdp.eval(`(() => {
    const b = document.querySelector(${JSON.stringify(selector)});
    if (!b) return { found: false };
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const banner = Array.from(document.querySelectorAll('button')).find(bb => bb.textContent.trim() === 'Accept all');
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: { x: Math.round(x), y: Math.round(y) },
      hit: top ? { tag: top.tagName, text: (top.textContent || '').trim().slice(0, 40), cls: (top.className || '').toString().slice(0, 60) } : null,
      bannerVisible: !!banner,
      ariaPressed: b.getAttribute('aria-pressed'),
      ariaChecked: b.getAttribute('aria-checked'),
      disabled: b.disabled || null,
    };
  })()`);
  console.log(`\n${label} ${selector}:`, JSON.stringify(info, null, 1));
  return info;
}

try {
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(2500);
  const token = await (await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: PRO_USER_ID }),
  })).json();
  await cdp.eval(`window.Clerk && window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token.token)} }).catch(() => {})`);
  await cdp.sleep(1800);
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2500);
  await cdp.eval(`localStorage.setItem('publish_cookie_consent', JSON.stringify({analytics:true,functional:true,decided:true}))`);
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2000);

  // brand-kit
  await cdp.goto(`${APP}/brand-kit`);
  await cdp.sleep(3000);
  let info = await probe('button[aria-pressed]', 'brand-kit Calm');
  if (info.found) {
    await cdp.clickAt(info.center.x, info.center.y);
    await cdp.sleep(600);
    const after = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).find(b => b.textContent.trim() === 'Calm')?.getAttribute('aria-pressed')`);
    console.log('brand-kit Calm after real click: aria-pressed =', after);
  }
  // find Save changes button
  const saveBtn = await cdp.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Save changes'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x: Math.round(x), y: Math.round(y), hit: top ? top.textContent.trim().slice(0, 40) : null, banner: !!Array.from(document.querySelectorAll('button')).find(bb => bb.textContent.trim() === 'Accept all') };
  })()`);
  console.log('\nbrand-kit Save changes:', JSON.stringify(saveBtn));

  // settings
  await cdp.goto(`${APP}/settings`);
  await cdp.sleep(3000);
  const sw = await probe('button[aria-label="Product email"]', 'settings Product email switch');
  if (sw.found) {
    await cdp.clickAt(sw.center.x, sw.center.y);
    await cdp.sleep(1200);
    const afterSw = await cdp.eval(`document.querySelector('button[aria-label="Product email"]')?.getAttribute('aria-checked')`);
    console.log('settings switch after real click: aria-checked =', afterSw);
  }
  const saveProf = await cdp.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Save changes'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x: Math.round(x), y: Math.round(y), hit: top ? top.textContent.trim().slice(0, 50) : null, banner: !!Array.from(document.querySelectorAll('button')).find(bb => bb.textContent.trim() === 'Accept all') };
  })()`);
  console.log('\nsettings Save changes:', JSON.stringify(saveProf));
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}
process.exit(0);
