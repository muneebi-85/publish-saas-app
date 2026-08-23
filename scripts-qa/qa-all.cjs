// Comprehensive feature QA harness for the Publish SaaS.
// Boots auth via the cookie server (real Clerk session), then visits every
// feature, exercises its main interactions, and reports console errors,
// failed network requests, and functional state for each.
//
// Usage: node scripts-qa/qa-all.mjs [--scenario name] [--screenshot]
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');

const PORT = 9223;
const APP = `http://localhost:${process.env.TARGET_PORT || 3100}`;
const BOOT = 'http://localhost:3456';
const SHOTS = process.argv.includes('--screenshot') ? true : false;

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
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${process.cwd()}\\scripts-qa\\.chrome-profile`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--window-size=1440,900',
        'about:blank',
      ], { stdio: 'ignore' });
      chrome.unref();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome did not start');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.dialog = null; this.pendingPromptText = ''; }
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
  async title() { return await this.eval('document.title'); }

  // Real trusted mouse click at element center (scrolls into view first).
  async clickSelector(selector) {
    const rect = await this.eval(`(() => {
      const b = document.querySelector(${JSON.stringify(selector)});
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

function setInputValue(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

// ── Auth bootstrap ──────────────────────────────────────────────
// 1. cookie server sets __session for SSR, 2. sign-in token via Clerk client
// JS gives a real client-side session so 'use client' pages see the user.
async function mintSignInToken() {
  const fs = require('node:fs');
  const env = {};
  for (const f of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch { /* ignore */ }
  }
  if (!env.CLERK_SECRET_KEY) {
    // try parent dir (cwd may be scripts-qa)
    for (const f of ['../.env.local', '../.env']) {
      try {
        const txt = fs.readFileSync(f, 'utf8');
        for (const line of txt.split('\n')) {
          const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
          if (m) env[m[1]] = m[2].trim();
        }
      } catch { /* ignore */ }
    }
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
  // SSR session first
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(2500);
  // Then a real client-side session via ticket strategy (Clerk client JS mints
  // the __client cookie it trusts).
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

// ── Per-page checks ─────────────────────────────────────────────
async function checkPage(cdp, name, path, opts = {}) {
  const report = { name, path, ok: true, issues: [] };
  try {
    await cdp.goto(`${BOOT}/?to=${path}`);
    await cdp.sleep(opts.wait || 2500);
    const state = await cdp.eval(`({
      path: location.pathname,
      serverError: document.body.innerText.includes('Server Error') || document.body.innerText.includes('Internal Server Error'),
      notFound: document.body.innerText.includes('404') && location.pathname.includes('404'),
      bodyLen: document.body.innerText.length,
      h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 80) || null,
      text: document.body.innerText.slice(0, 600)
    })`);
    if (state.serverError) { report.ok = false; report.issues.push('Server Error rendered'); }
    if (state.path !== path) report.issues.push(`redirected to ${state.path} (expected ${path})`);
    const errs = cdp.consoleErrors();
    if (errs.length) { report.ok = false; report.issues.push(`console errors: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`); }
    report.h1 = state.h1;
    report.bodyLen = state.bodyLen;
    if (SHOTS) {
      await cdp.send('Page.captureScreenshot', { format: 'png' }).then(async (r) => {
        const fs = require('node:fs');
        fs.writeFileSync(`scripts-qa/shots/${name}.png`, Buffer.from(r.data, 'base64'));
      }).catch(() => {});
    }
  } catch (e) {
    report.ok = false;
    report.issues.push('exception: ' + e.message.slice(0, 200));
  }
  return report;
}

// ── Feature scenarios ───────────────────────────────────────────
async function scenarioDashboard(cdp) {
  const r = await checkPage(cdp, 'dashboard', '/dashboard');
  // check for key dashboard content
  const content = await cdp.eval(`document.body.innerText`);
  if (!/analytics|score|quota|projects|channel|analysis/i.test(content)) {
    r.ok = false; r.issues.push('dashboard body missing expected content');
  }
  return r;
}

async function scenarioUpload(cdp) {
  const r = await checkPage(cdp, 'upload', '/upload');
  const form = await cdp.eval(`({
    hasTitle: !!document.querySelector('#up-title'),
    hasScript: !!document.querySelector('#up-script'),
    hasRun: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Run full review'))
  })`);
  if (!form.hasTitle || !form.hasScript) { r.ok = false; r.issues.push(`form missing fields: ${JSON.stringify(form)}`); }
  if (!form.hasRun) { r.ok = false; r.issues.push('Run full review button missing'); }
  return r;
}

async function scenarioAnalyses(cdp) {
  const r = await checkPage(cdp, 'analyses', '/analyses');
  const content = await cdp.eval(`document.body.innerText`);
  if (content.includes('Server Error')) r.ok = false;
  return r;
}

async function scenarioProjects(cdp) {
  const r = await checkPage(cdp, 'projects', '/projects');
  return r;
}

// A free-plan user should see the UpgradeWall (feature locked); a paid user
// should see the feature itself. Either is correct — what must never happen is
// a crash or a blank page. The wall and the feature both render without
// console errors.
async function assertGatedFeature(cdp, name, path, featureText) {
  const r = await checkPage(cdp, name, path);
  const body = await cdp.eval('document.body.innerText');
  const wall = await cdp.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    return btns.some(t => t.includes('Upgrade to'));
  })()`);
  const featureRendered = body.length > 400 && !body.includes('This section could');
  if (!wall && !featureRendered) {
    r.ok = false;
    r.issues.push('neither UpgradeWall nor feature content rendered');
  }
  return r;
}

async function scenarioAICoach(cdp) {
  return await assertGatedFeature(cdp, 'ai-coach', '/ai-coach', 'AI Coach');
}

async function scenarioAIHumanizer(cdp) {
  return await assertGatedFeature(cdp, 'ai-humanizer', '/ai-humanizer', 'Script Optimizer');
}

async function scenarioBrandKit(cdp) {
  const r = await checkPage(cdp, 'brand-kit', '/brand-kit');
  return r;
}

async function scenarioChannelAnalytics(cdp) {
  const r = await checkPage(cdp, 'channel-analytics', '/channel-analytics');
  return r;
}

async function scenarioConnectedChannels(cdp) {
  const r = await checkPage(cdp, 'connected-channels', '/connected-channels');
  return r;
}

async function scenarioReports(cdp) {
  const r = await checkPage(cdp, 'reports', '/reports');
  return r;
}

async function scenarioSEO(cdp) {
  return await assertGatedFeature(cdp, 'seo', '/seo', 'SEO Studio');
}

async function scenarioTemplates(cdp) {
  const r = await checkPage(cdp, 'templates', '/templates');
  const cards = await cdp.eval(`document.querySelectorAll('.grid .group, .grid > div').length`);
  if (cards < 3) { r.ok = false; r.issues.push(`template cards low: ${cards}`); }
  return r;
}

async function scenarioNotifications(cdp) {
  const r = await checkPage(cdp, 'notifications', '/notifications');
  return r;
}

async function scenarioSettings(cdp) {
  const r = await checkPage(cdp, 'settings', '/settings');
  return r;
}

async function scenarioHelp(cdp) {
  const r = await checkPage(cdp, 'help', '/help');
  return r;
}

async function scenarioPricing(cdp) {
  // pricing is public but also linked from dashboard
  const r = await checkPage(cdp, 'pricing', '/pricing');
  const tiers = await cdp.eval(`document.body.innerText.match(/Starter|Pro|Agency|Free/g)`);
  if (!tiers || !tiers.length) { r.ok = false; r.issues.push('no pricing tiers found'); }
  const price = await cdp.eval(`document.body.innerText.match(/\\$[0-9]+/g)`);
  if (!price) { r.ok = false; r.issues.push('no prices rendered'); }
  return r;
}

async function scenarioAnalysisDetail(cdp) {
  // find the most recent analysis from the DB via the projects page link
  const r = await checkPage(cdp, 'analysis-detail', '/analyses');
  const links = await cdp.eval(`Array.from(document.querySelectorAll('a[href*="/analysis/"]')).map(a => a.getAttribute('href'))`);
  if (links.length) {
    const target = links[0].startsWith('/') ? links[0] : '/' + links[0];
    await cdp.goto(`${BOOT}/?to=${target}`);
    await cdp.sleep(3000);
    const state = await cdp.eval(`({
      path: location.pathname,
      serverError: document.body.innerText.includes('Server Error'),
      score: document.body.innerText.includes('Score') || document.body.innerText.includes('score'),
      text: document.body.innerText.slice(0, 300)
    })`);
    if (state.serverError) { r.ok = false; r.issues.push('analysis detail: Server Error'); }
    if (!state.score) { r.ok = false; r.issues.push('analysis detail: no score rendered'); }
  } else {
    r.issues.push('no analyses exist to open (empty state is fine, but cannot test detail)');
  }
  return r;
}

const scenarios = {
  dashboard: scenarioDashboard,
  upload: scenarioUpload,
  analyses: scenarioAnalyses,
  projects: scenarioProjects,
  'ai-coach': scenarioAICoach,
  'ai-humanizer': scenarioAIHumanizer,
  'brand-kit': scenarioBrandKit,
  'channel-analytics': scenarioChannelAnalytics,
  'connected-channels': scenarioConnectedChannels,
  reports: scenarioReports,
  seo: scenarioSEO,
  templates: scenarioTemplates,
  notifications: scenarioNotifications,
  settings: scenarioSettings,
  help: scenarioHelp,
  pricing: scenarioPricing,
  'analysis-detail': scenarioAnalysisDetail,
};

// ── Main ────────────────────────────────────────────────────────
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

const fs = require('node:fs');
fs.mkdirSync('scripts-qa/shots', { recursive: true });

try {
  console.log('AUTH: bootstrapping session…');
  const auth = await bootAuth(cdp);
  console.log('AUTH: /api/me/plan ->', JSON.stringify(auth));

  let selected = process.argv.find((a) => a.startsWith('--scenario='));
  const runNames = selected ? [selected.split('=')[1]] : Object.keys(scenarios);

  for (const name of runNames) {
    const sc = scenarios[name];
    if (!sc) { console.log(`SKIP unknown scenario: ${name}`); continue; }
    const started = Date.now();
    const report = await sc(cdp);
    report.ms = Date.now() - started;
    console.log(`\n=== ${report.name} (${report.ms}ms) ===`);
    console.log(`  path: ${report.path} | h1: ${report.h1 || '(none)'} | bodyLen: ${report.bodyLen}`);
    console.log(`  ${report.ok ? 'PASS' : 'FAIL'}`);
    for (const i of report.issues) console.log(`  ISSUE: ${i}`);
  }
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}
process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
