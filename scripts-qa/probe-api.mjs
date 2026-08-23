// Quick authenticated API probe for diagnosing the failing scenarios.
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
  const candidates = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/c/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
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
  async fetchJSON(path, options = {}, timeoutMs = 240000) {
    return await this.eval(`(async () => {
      const started = Date.now();
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), ${timeoutMs});
        const r = await fetch(${JSON.stringify(path)}, { ...${JSON.stringify(options)}, signal: ctl.signal });
        clearTimeout(t);
        const body = await r.text();
        let j = null; try { j = JSON.parse(body); } catch {}
        return { status: r.status, ms: Date.now() - started, json: j, text: body.slice(0, 400) };
      } catch (e) { return { ms: Date.now() - started, error: e.message }; }
    })()`);
  }
}

await waitForChrome();
const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
try {
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(2500);
  const token = await (await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: PRO_USER_ID }),
  })).json();
  await cdp.eval(`(async () => {
    if (!window.Clerk) return;
    try { await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token.token)} }); } catch (e) {}
  })()`);
  await cdp.sleep(1800);
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2500);
  // dismiss cookie banner if present
  await cdp.eval(`localStorage.setItem('publish_cookie_consent', JSON.stringify({analytics:true,functional:true,decided:true}))`);

  console.log('=== plan ===', JSON.stringify(await cdp.fetchJSON('/api/me/plan', {}, 10000)));

  console.log('=== presign (expect 503 storageUnavailable) ===', JSON.stringify(await cdp.fetchJSON('/api/upload/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 'video', filename: 'test.mp4', contentType: 'video/mp4', size: 1024 }) }, 15000)));

  console.log('=== profile POST ===', JSON.stringify(await cdp.fetchJSON('/api/me/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'QA Deep Pro' }) }, 15000)));

  console.log('=== brand-kit PUT (echo current) ===', JSON.stringify(await cdp.fetchJSON('/api/me/brand-kit', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandKit: { colors: [], headingFont: 'General Sans', bodyFont: 'Inter', tones: ['Calm'], description: '', banned: [], logoUrl: null } }) }, 15000)));

  console.log('=== SEO API (YouTube) ===', JSON.stringify(await cdp.fetchJSON('/api/seo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'How I doubled watch time in 30 days without changing my niche', platform: 'YouTube' }) }, 240000)));

  console.log('=== preferences GET ===', JSON.stringify(await cdp.fetchJSON('/api/me/preferences', {}, 10000)));
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}
process.exit(0);
