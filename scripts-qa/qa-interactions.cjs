// Functional tests for interactive features. Requires the qa-all.cjs auth
// bootstrap pattern: cookie server for SSR + ticket sign-in for client JS.
// Usage: node scripts-qa/qa-interactions.cjs [--scenario=templates|projects|notifications|settings|all]
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');

const PORT = 9223;
const APP = `http://localhost:${process.env.TARGET_PORT || 3100}`;
const BOOT = 'http://localhost:3456';

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/json/version`); if (r.ok) return; } catch {}
    if (i === 1) {
      const chrome = spawn(findChrome(), [
        '--headless=new', `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${process.cwd()}\\scripts-qa\\.chrome-profile`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--window-size=1440,900', 'about:blank',
      ], { stdio: 'ignore' });
      chrome.unref();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome did not start');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.pendingPromptText = ''; }
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
      } else if (msg.method) {
        if (msg.method === 'Page.javascriptDialogOpening') {
          c.send('Page.handleJavaScriptDialog', { accept: true, promptText: c.pendingPromptText || '' }).catch(() => {});
        }
        c.events.push(msg);
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
  setPromptText(text) { this.pendingPromptText = text; }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
    return r.result?.value;
  }
  async sleep(ms) { await new Promise((r) => setTimeout(r, ms)); }
  async goto(url) {
    this.events = [];
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      const ready = await this.eval('document.readyState');
      if (ready === 'complete') return;
      await this.sleep(250);
    }
  }
  async waitFor(fnExpr, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = await this.eval(fnExpr);
      if (v) return v;
      await this.sleep(300);
    }
    throw new Error('waitFor timeout: ' + fnExpr);
  }
  async text() { return await this.eval('document.body ? document.body.innerText : ""'); }
  async clickSelector(selector) {
    const rect = await this.eval(`(() => {
      const b = document.querySelector(${JSON.stringify(selector)});
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.sleep(150);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return true;
  }
  async clickByText(text, tag = 'button,a') {
    const rect = await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.sleep(150);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return true;
  }
  async fill(selector, value) {
    return await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }
  consoleErrors() {
    return this.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => (e.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
}

async function mintSignInToken() {
  const fs = require('node:fs');
  const env = {};
  for (const f of ['.env.local', '.env', '../.env.local', '../.env']) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch {}
  }
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0' }),
  });
  const b = await res.json();
  if (!b.token) throw new Error('token mint failed');
  return b.token;
}

async function bootAuth(cdp) {
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(2500);
  const token = await mintSignInToken();
  const r = await cdp.eval(`(async () => {
    try {
      if (!window.Clerk) return { err: 'no window.Clerk' };
      const s = await window.Clerk.session;
      if (s) return { already: true };
      const signIn = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token)} });
      return { status: signIn.status };
    } catch (e) { return { err: e.message }; }
  })()`);
  await cdp.sleep(1200);
  return r;
}

// ── Scenarios ──────────────────────────────────────────────────
async function scenarioTemplates(cdp) {
  const report = { name: 'templates-functional', ok: true, issues: [] };
  await cdp.goto(`${BOOT}/?to=/templates`);
  await cdp.sleep(3000);

  const baseline = await cdp.eval(`({
    cards: document.querySelectorAll('.grid .group, .grid > div').length,
    h3s: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()).slice(0, 8),
    tabs: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /All|Titles|Hooks|Thumbnails|Descriptions|Video structure/.test(t))
  })`);
  console.log('  baseline cards:', baseline.cards, 'tabs:', JSON.stringify(baseline.tabs));
  if (!baseline.cards || baseline.cards < 3) { report.ok = false; report.issues.push(`template cards low: ${baseline.cards}`); }

  // Tab filter
  await cdp.clickByText('Hooks');
  await cdp.sleep(600);
  const afterTab = await cdp.eval(`Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()).slice(0, 5)`);
  console.log('  Hooks tab ->', JSON.stringify(afterTab));

  // Search
  const searchBox = await cdp.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(i => i.getAttribute('aria-label') || i.placeholder || i.type).find(Boolean);
  })()`);
  console.log('  search input:', searchBox);
  const searchSel = await cdp.eval(`(() => {
    const i = Array.from(document.querySelectorAll('input')).find(i => (i.getAttribute('aria-label') || '').includes('Search'));
    if (!i) return null;
    i.setAttribute('data-qa-search', '1');
    return true;
  })()`);
  if (searchSel) {
    await cdp.fill('[data-qa-search]', 'curiosity');
    await cdp.sleep(500);
    const results = await cdp.eval(`Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()).slice(0, 6)`);
    console.log('  search "curiosity" ->', JSON.stringify(results));
  } else {
    report.issues.push('search box not found');
  }

  // Use template (copy) — needs clipboard permission
  await cdp.clickByText('Use template');
  await cdp.sleep(800);
  const copied = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Copied'))`);
  console.log('  Use template -> Copied state:', copied);
  const errs = cdp.consoleErrors();
  if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 250)}`); }
  return report;
}

async function scenarioProjects(cdp) {
  const report = { name: 'projects-functional', ok: true, issues: [] };
  await cdp.goto(`${BOOT}/?to=/projects`);
  await cdp.sleep(3000);

  const cards = await cdp.eval(`document.querySelectorAll('h3').length`);
  console.log('  project cards:', cards);
  if (cards === 0) { report.issues.push('no projects to test (empty state)'); }

  // Rename via prompt dialog
  cdp.setPromptText('QA renamed via functional test');
  await cdp.clickByText('Rename');
  await cdp.sleep(1500);
  const renamed = await cdp.eval(`Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes('QA renamed via functional test'))`);
  console.log('  rename applied:', renamed);
  if (!renamed) report.issues.push('rename did not apply');

  // Re-run button
  const rerun = await cdp.eval(`Array.from(document.querySelectorAll('a,button')).some(b => b.textContent.trim().includes('Re-run') || b.textContent.trim().includes('Analyze'))`);
  console.log('  re-run/analyze action present:', rerun);

  // Open the project → analysis detail
  const firstLink = await cdp.eval(`(() => {
    const a = document.querySelector('a[href*="/analysis/"]');
    return a ? a.getAttribute('href') : null;
  })()`);
  if (firstLink) {
    await cdp.goto(`${BOOT}/?to=${firstLink}`);
    await cdp.sleep(3500);
    const state = await cdp.eval(`({
      serverError: document.body.innerText.includes('Server Error') || document.body.innerText.includes("couldn't load"),
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      sections: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 6)
    })`);
    console.log('  project → analysis:', JSON.stringify({ h1: state.h1, sections: state.sections, serverError: state.serverError }));
    if (state.serverError) { report.ok = false; report.issues.push('analysis detail crashed'); }
  }
  const errs = cdp.consoleErrors();
  if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 250)}`); }
  return report;
}

async function scenarioNotifications(cdp) {
  const report = { name: 'notifications-functional', ok: true, issues: [] };
  await cdp.goto(`${BOOT}/?to=/notifications`);
  await cdp.sleep(3000);
  const body = await cdp.text();
  console.log('  notifications page loaded, len:', body.length);
  if (body.includes('Server Error')) { report.ok = false; report.issues.push('server error'); }

  const markSeen = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Mark all'))`);
  console.log('  mark-all button present:', markSeen);
  if (markSeen) {
    await cdp.clickByText('Mark all');
    await cdp.sleep(1000);
    const after = await cdp.text();
    console.log('  after mark-all, empty state:', /No notifications|Nothing here|all caught up/i.test(after));
  }
  const errs = cdp.consoleErrors();
  if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 250)}`); }
  return report;
}

async function scenarioSettings(cdp) {
  const report = { name: 'settings-functional', ok: true, issues: [] };
  await cdp.goto(`${BOOT}/?to=/settings`);
  await cdp.sleep(3000);
  const body = await cdp.text();
  console.log('  settings page loaded, len:', body.length);
  if (body.includes('Server Error')) { report.ok = false; report.issues.push('server error'); }
  // Check sections render
  const sections = await cdp.eval(`Array.from(document.querySelectorAll('h2, h3')).map(h => h.textContent.trim()).slice(0, 10)`);
  console.log('  settings sections:', JSON.stringify(sections));
  if (!sections.length) { report.ok = false; report.issues.push('no settings sections rendered'); }
  const errs = cdp.consoleErrors();
  if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 250)}`); }
  return report;
}

const scenarios = {
  templates: scenarioTemplates,
  projects: scenarioProjects,
  notifications: scenarioNotifications,
  settings: scenarioSettings,
};

(async function main() {
  await waitForChrome();
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  try {
    await cdp.send('Browser.grantPermissions', { origin: APP, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
  } catch {}

  try {
    console.log('AUTH:', JSON.stringify(await bootAuth(cdp)));
    let selected = process.argv.find((a) => a.startsWith('--scenario='));
    const runNames = selected ? [selected.split('=')[1]] : Object.keys(scenarios);
    for (const name of runNames) {
      if (!scenarios[name]) { console.log('SKIP unknown:', name); continue; }
      const started = Date.now();
      const r = await scenarios[name](cdp);
      r.ms = Date.now() - started;
      console.log(`\n=== ${r.name} (${r.ms}ms) === ${r.ok ? 'PASS' : 'FAIL'}`);
      for (const i of r.issues) console.log(`  ISSUE: ${i}`);
    }
  } finally {
    try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
    try { cdp.ws.close(); } catch {}
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
