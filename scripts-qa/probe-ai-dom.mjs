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
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
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
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
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
  await cdp.eval(`window.Clerk && window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token.token)} }).catch(() => {})`);
  await cdp.sleep(1800);
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2500);
  await cdp.eval(`localStorage.setItem('publish_cookie_consent', JSON.stringify({analytics:true,functional:true,decided:true}))`);

  for (const [path, label] of [['/ai-coach', 'coach'], ['/ai-humanizer', 'humanizer'], ['/seo', 'seo']]) {
    await cdp.goto(`${APP}${path}`);
    await cdp.sleep(6000);
    const dump = await cdp.eval(`({
      buttons: Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => b.textContent.trim().slice(0, 30)),
      selects: Array.from(document.querySelectorAll('select')).map(s => s.value + ':' + Array.from(s.options).map(o => o.value).join(',')),
      textareas: Array.from(document.querySelectorAll('textarea')).map(t => t.getAttribute('aria-label') || t.id || 'none'),
      inputs: Array.from(document.querySelectorAll('input')).map(i => i.name || i.id || i.getAttribute('aria-label') || i.type).slice(0, 10),
      bodyStart: document.body.innerText.slice(0, 200),
      errBanner: Array.from(document.querySelectorAll('div')).filter(d => /failed|could not|error/i.test(d.textContent.slice(0, 60)) && d.textContent.length < 200).slice(0, 3).map(d => d.textContent.trim().slice(0, 100))
    })`);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(dump, null, 1));
  }
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}
process.exit(0);
