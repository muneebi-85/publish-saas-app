// Master QA harness: boot real auth, then walk every page, exercising
// buttons/interactions and collecting console errors + failed requests.
// Usage: node scripts-qa/qa-master.cjs [--scenario=name] [--list]
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');

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
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      if (r.ok) return;
    } catch { /* not up yet */ }
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
          c.dialog = msg.params;
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
  async url() { return await this.eval('location.href'); }
  async clickByText(text, tag = 'button,a') {
    const rect = await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.sleep(200);
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
  failedRequests() {
    return this.events.filter((e) => e.method === 'Network.loadingFailed')
      .map((e) => e.params.errorText + ' :: ' + (e.params.requestId || ''));
  }
}

async function mintSignInToken() {
  const fs = require('node:fs');
  const env = {};
  for (const f of ['.env.local', '.env', '../.env.local', '../.env']) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=\"?([^"#]*)\"?$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch { /* ignore */ }
  }
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0' }),
  });
  const b = await res.json();
  if (!b.token) throw new Error('sign-in token mint failed: ' + JSON.stringify(b).slice(0, 200));
  return b.token;
}

async function bootAuth(cdp) {
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(2500);
  const token = await mintSignInToken();
  const ticket = await cdp.eval(`(async () => {
    try {
      if (!window.Clerk) return { err: 'no window.Clerk' };
      const s = await window.Clerk.session;
      if (s) return { already: true };
      const signIn = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ${JSON.stringify(token)} });
      return { status: signIn.status, sessionId: signIn.createdSessionId || null };
    } catch (e) {
      return { err: e.errors ? JSON.stringify(e.errors).slice(0, 300) : e.message };
    }
  })()`);
  await cdp.sleep(1500);
  const r = await cdp.eval(`(async () => {
    const res = await fetch('${APP}/api/me/plan', { cache: 'no-store' });
    return { status: res.status, body: await res.text().catch(() => '') };
  })()`);
  return { ticket, plan: r };
}

// ── helpers ──
async function pageState(cdp) {
  return await cdp.eval(`({
    path: location.pathname,
    serverError: document.body.innerText.includes('Server Error') || document.body.innerText.includes('Internal Server Error'),
    bodyLen: document.body.innerText.length,
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null,
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().replace(/\\s+/g, ' ')).filter(Boolean).slice(0, 40)
  })`);
}

async function checkPage(cdp, name, path, opts = {}) {
  const report = { name, path, ok: true, issues: [], buttons: [] };
  try {
    await cdp.goto(`${BOOT}/?to=${path}`);
    await cdp.sleep(opts.wait || 2500);
    const state = await pageState(cdp);
    if (state.serverError) { report.ok = false; report.issues.push('Server Error rendered'); }
    if (state.path !== path) report.issues.push(`redirected to ${state.path} (expected ${path})`);
    const errs = cdp.consoleErrors();
    if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`); }
    report.h1 = state.h1;
    report.bodyLen = state.bodyLen;
    report.buttons = state.buttons;
  } catch (e) {
    report.ok = false;
    report.issues.push('exception: ' + e.message.slice(0, 200));
  }
  return report;
}

// ── scenarios ──
async function scenarioLanding(cdp) {
  const r = await checkPage(cdp, 'landing', '/', { wait: 4000 });
  const body = await cdp.eval('document.body.innerText');
  const checks = {
    hasCTA: body.includes('Get started') || body.includes('Start free') || body.includes('Sign up'),
    hasPricing: body.includes('Pricing'),
    hasFooter: body.includes('Terms') && body.includes('Privacy'),
  };
  for (const [k, v] of Object.entries(checks)) if (!v) { r.ok = false; r.issues.push(`landing missing: ${k}`); }
  return r;
}

async function scenarioPricing(cdp) {
  const r = await checkPage(cdp, 'pricing', '/pricing', { wait: 3000 });
  const body = await cdp.eval('document.body.innerText');
  const tiers = body.match(/Starter|Pro|Agency|Free|Creator|Growth/g);
  if (!tiers || tiers.length < 2) { r.ok = false; r.issues.push(`no pricing tiers: ${JSON.stringify(tiers)}`); }
  const price = body.match(/\$[0-9]+/g);
  if (!price) { r.ok = false; r.issues.push('no prices rendered'); }
  // checkout button
  const checkoutBtn = await cdp.eval(`Array.from(document.querySelectorAll('button, a')).map(b => b.textContent.trim()).filter(t => /choose|get started|upgrade|subscribe|start/i.test(t)).slice(0,6)`);
  r.buttons = checkoutBtn;
  if (!checkoutBtn.length) { r.ok = false; r.issues.push('no checkout CTA found'); }
  return r;
}

async function scenarioDashboard(cdp) {
  const r = await checkPage(cdp, 'dashboard', '/dashboard', { wait: 3500 });
  const body = await cdp.eval('document.body.innerText');
  if (!/analytics|score|quota|projects|channel|analysis|welcome/i.test(body)) {
    r.ok = false; r.issues.push('dashboard body missing expected content');
  }
  return r;
}

async function scenarioUpload(cdp) {
  const r = await checkPage(cdp, 'upload', '/upload', { wait: 3000 });
  const form = await cdp.eval(`({
    hasTitle: !!document.querySelector('#up-title'),
    hasScript: !!document.querySelector('#up-script'),
    hasRun: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Run full review')),
    dropzones: document.querySelectorAll('[class*="dropzone"], [class*="upload"]').length
  })`);
  if (!form.hasTitle || !form.hasScript) { r.ok = false; r.issues.push(`form missing fields: ${JSON.stringify(form)}`); }
  if (!form.hasRun) { r.ok = false; r.issues.push('Run full review button missing'); }
  return r;
}

async function scenarioProjects(cdp) {
  const r = await checkPage(cdp, 'projects', '/projects', { wait: 3000 });
  const actions = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().replace(/\\s+/g,' ')).filter(t => /rename|delete|view|open/i.test(t))`);
  r.buttons = actions;
  if (!actions.length) r.issues.push('no project action buttons found (empty state ok?)');
  return r;
}

async function scenarioAnalyses(cdp) {
  const r = await checkPage(cdp, 'analyses', '/analyses', { wait: 3000 });
  return r;
}

async function scenarioTemplates(cdp) {
  const r = await checkPage(cdp, 'templates', '/templates', { wait: 3000 });
  const cards = await cdp.eval(`document.querySelectorAll('.grid .group, .grid > div').length`);
  if (cards < 3) { r.ok = false; r.issues.push(`template cards low: ${cards}`); }
  // tabs
  const tabs = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /Hooks|Thumbnails|Endings|Captions|Titles|Full/i.test(t))`);
  r.buttons = tabs;
  return r;
}

async function scenarioNotifications(cdp) {
  const r = await checkPage(cdp, 'notifications', '/notifications', { wait: 3000 });
  return r;
}

async function scenarioSettings(cdp) {
  const r = await checkPage(cdp, 'settings', '/settings', { wait: 3000 });
  return r;
}

async function scenarioHelp(cdp) {
  const r = await checkPage(cdp, 'help', '/help', { wait: 3000 });
  return r;
}

async function scenarioBrandKit(cdp) {
  const r = await checkPage(cdp, 'brand-kit', '/brand-kit', { wait: 3000 });
  const inputs = await cdp.eval(`document.querySelectorAll('input, textarea').length`);
  r.buttons = [`inputs:${inputs}`];
  return r;
}

async function scenarioConnectedChannels(cdp) {
  const r = await checkPage(cdp, 'connected-channels', '/connected-channels', { wait: 3000 });
  const connect = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /connect|add|youtube|tiktok/i.test(t))`);
  r.buttons = connect;
  return r;
}

async function scenarioChannelAnalytics(cdp) {
  const r = await checkPage(cdp, 'channel-analytics', '/channel-analytics', { wait: 3000 });
  return r;
}

async function scenarioReports(cdp) {
  const r = await checkPage(cdp, 'reports', '/reports', { wait: 3000 });
  return r;
}

async function assertGatedFeature(cdp, name, path) {
  const r = await checkPage(cdp, name, path, { wait: 3000 });
  const body = await cdp.eval('document.body.innerText');
  const wall = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Upgrade to'))`);
  const featureRendered = body.length > 400 && !body.includes('This section could');
  if (!wall && !featureRendered) {
    r.ok = false;
    r.issues.push('neither UpgradeWall nor feature content rendered');
  }
  return r;
}

async function scenarioAICoach(cdp) { return await assertGatedFeature(cdp, 'ai-coach', '/ai-coach'); }
async function scenarioAIHumanizer(cdp) { return await assertGatedFeature(cdp, 'ai-humanizer', '/ai-humanizer'); }
async function scenarioSEO(cdp) { return await assertGatedFeature(cdp, 'seo', '/seo'); }

async function scenarioLegal(cdp) {
  const r = await checkPage(cdp, 'legal', '/legal/terms', { wait: 2500 });
  return r;
}

async function scenarioRestore(cdp) {
  const r = await checkPage(cdp, 'restore', '/restore', { wait: 2500 });
  return r;
}

const scenarios = {
  landing: scenarioLanding,
  pricing: scenarioPricing,
  dashboard: scenarioDashboard,
  upload: scenarioUpload,
  projects: scenarioProjects,
  analyses: scenarioAnalyses,
  templates: scenarioTemplates,
  notifications: scenarioNotifications,
  settings: scenarioSettings,
  help: scenarioHelp,
  'brand-kit': scenarioBrandKit,
  'connected-channels': scenarioConnectedChannels,
  'channel-analytics': scenarioChannelAnalytics,
  reports: scenarioReports,
  'ai-coach': scenarioAICoach,
  'ai-humanizer': scenarioAIHumanizer,
  seo: scenarioSEO,
  legal: scenarioLegal,
  restore: scenarioRestore,
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
  } catch { /* older Chrome */ }

  mkdirSync('scripts-qa/shots', { recursive: true });
  try {
    console.log('AUTH: bootstrapping session…');
    const auth = await bootAuth(cdp);
    console.log('AUTH: ticket=' + JSON.stringify(auth.ticket) + ' plan=' + JSON.stringify(auth.plan).slice(0, 200));

    let selected = process.argv.find((a) => a.startsWith('--scenario='));
    const runNames = selected ? [selected.split('=')[1]] : Object.keys(scenarios);
    const summary = { pass: 0, fail: 0, failures: [] };
    for (const name of runNames) {
      const sc = scenarios[name];
      if (!sc) { console.log(`SKIP unknown scenario: ${name}`); continue; }
      const started = Date.now();
      const report = await sc(cdp);
      report.ms = Date.now() - started;
      console.log(`\n=== ${report.name} (${report.ms}ms) ===`);
      console.log(`  path: ${report.path} | h1: ${report.h1 || '(none)'} | bodyLen: ${report.bodyLen}`);
      console.log(`  buttons: ${JSON.stringify(report.buttons)}`);
      console.log(`  ${report.ok ? 'PASS' : 'FAIL'}`);
      for (const i of report.issues) console.log(`  ISSUE: ${i}`);
      if (report.ok) summary.pass++; else { summary.fail++; summary.failures.push(name + ': ' + report.issues.join(' | ')); }
    }
    console.log(`\n===== SUMMARY: ${summary.pass} passed, ${summary.fail} failed =====`);
    for (const f of summary.failures) console.log('  FAIL: ' + f.slice(0, 300));
  } finally {
    try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
    try { cdp.ws.close(); } catch {}
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
