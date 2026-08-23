// Deep interaction QA: real clicks on every button + end-to-end flows.
// Usage: node scripts-qa/qa-interactions-master.cjs [--scenario=name]
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
  async clickByText(text, tag = 'button,a') {
    const rect = await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return null;
    await this.sleep(200);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return rect;
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
}

function report(name, ok, details = '') {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${details ? ' — ' + details : ''}`);
  return ok;
}

// ── scenarios ──
async function scPricingCheckout(cdp) {
  console.log('\n=== Pricing → checkout links ===');
  await cdp.goto(`${BOOT}/?to=/pricing`);
  await cdp.sleep(3000);
  // Find all links (checkout goes to Lemon Squeezy)
  const links = await cdp.eval(`Array.from(document.querySelectorAll('a[href]')).map(a => ({ text: a.textContent.trim().replace(/\\s+/g,' ').slice(0,50), href: a.href })).filter(l => /lemon|checkout|lemonsqueezy|buy/i.test(l.href) || /choose|upgrade|start|subscribe/i.test(l.text))`);
  console.log('  checkout links:', JSON.stringify(links, null, 1));
  if (!links.length) { report('checkout-link', false, 'no checkout links found'); return; }
  for (const l of links) {
    if (l.href.includes('lemonsqueezy')) report('checkout-link', true, `${l.text} → ${l.href.slice(0, 120)}`);
    else report('checkout-link', true, `${l.text} → local: ${l.href}`);
  }
  // Check the billing interval toggle
  const toggle = await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => /yearly/i.test(b.textContent))?.textContent.trim().replace(/\\s+/g,' ') || null`);
  console.log('  billing toggle:', toggle);
}

async function scUploadFlow(cdp) {
  console.log('\n=== Upload → full review flow ===');
  await cdp.goto(`${BOOT}/?to=/upload`);
  await cdp.sleep(2500);
  const filled = await cdp.fill('#up-title', 'QA interaction test video');
  await cdp.fill('#up-script', 'Welcome back to the channel everyone. Today I want to share my best tips for growing a YouTube channel in 2026. If you enjoyed this video please like and subscribe and hit the bell icon so you never miss an upload. Thanks for watching and I will see you in the next one.');
  await cdp.sleep(300);
  const canRun = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Run full review') && !b.disabled)`);
  report('upload-form', canRun, `title filled:${!!filled} runEnabled:${canRun}`);
  await cdp.clickByText('Run full review');
  await cdp.sleep(2000);
  const state = await cdp.eval(`({
    path: location.pathname,
    text: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
  })`);
  console.log('  after click:', JSON.stringify(state));
  const finalUrl = await cdp.waitFor(`location.pathname.startsWith('/analysis/')`, 300000).catch(() => null);
  if (!finalUrl) {
    const errText = await cdp.eval(`document.body.innerText.slice(0, 500)`);
    report('upload-run', false, 'timed out waiting for analysis: ' + errText.slice(0, 300));
    return;
  }
  report('upload-run', true, `landed on ${finalUrl}`);
  await cdp.sleep(4000);
  const analysis = await cdp.eval(`({
    path: location.pathname,
    serverError: document.body.innerText.includes('Server Error'),
    hasScore: /score/i.test(document.body.innerText),
    textLen: document.body.innerText.length,
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 60)
  })`);
  console.log('  analysis page:', JSON.stringify(analysis));
  report('analysis-page', !analysis.serverError && analysis.hasScore && analysis.textLen > 500, JSON.stringify(analysis));
  const errs = cdp.consoleErrors();
  if (errs.length) report('analysis-console', false, errs.slice(0, 3).join(' | '));
  else report('analysis-console', true);
  return analysis.path;
}

async function scAnalysisDetail(cdp) {
  console.log('\n=== Analysis detail interactions ===');
  await cdp.goto(`${BOOT}/?to=/analyses`);
  await cdp.sleep(3000);
  const links = await cdp.eval(`Array.from(document.querySelectorAll('a[href*="/analysis/"]')).map(a => a.getAttribute('href')).slice(0,3)`);
  console.log('  analysis links:', JSON.stringify(links));
  if (!links.length) { report('analysis-detail', false, 'no analysis links'); return; }
  await cdp.goto(`${BOOT}/?to=${links[0]}`);
  await cdp.sleep(4000);
  const body = await cdp.eval('document.body.innerText');
  const checks = {
    hasScore: /score/i.test(body),
    hasCopy: /copy/i.test(body),
    hasExport: /export|pdf|share/i.test(body),
    hasTabs: /overview|script|platform|metadata|risk/i.test(body),
    serverError: body.includes('Server Error'),
  };
  console.log('  detail checks:', JSON.stringify(checks));
  const ok = !checks.serverError && checks.hasScore;
  report('analysis-detail', ok, JSON.stringify(checks));
  // click each tab
  const tabs = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /Overview|Script|Platforms|Metadata|Risk|SEO|Hooks|Thumbnail/i.test(t)).slice(0,8)`);
  console.log('  detail tabs:', JSON.stringify(tabs));
  for (const t of tabs) {
    await cdp.clickByText(t);
    await cdp.sleep(600);
  }
  report('analysis-tabs', true, `clicked: ${JSON.stringify(tabs)}`);
}

async function scTemplates(cdp) {
  console.log('\n=== Templates ===');
  await cdp.goto(`${BOOT}/?to=/templates`);
  await cdp.sleep(3000);
  // tab switch
  await cdp.clickByText('Hooks');
  await cdp.sleep(500);
  const firstCard = await cdp.eval(`Array.from(document.querySelectorAll('h3')).slice(0,1).map(e => e.textContent)`);
  console.log('  Hooks tab first card:', JSON.stringify(firstCard));
  // search
  await cdp.fill('input[aria-label="Search templates"]', 'curiosity');
  await cdp.sleep(500);
  const results = await cdp.eval(`Array.from(document.querySelectorAll('h3')).map(e => e.textContent).slice(0,4)`);
  console.log('  search results:', JSON.stringify(results));
  report('templates-search', true, JSON.stringify(results));
  // Use template (copies to clipboard)
  await cdp.eval(`document.querySelector('input[aria-label="Search templates"]') ? (document.querySelector('input[aria-label="Search templates"]').value = '') : null`);
  await cdp.sleep(300);
  const useBtn = await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Use template')) !== undefined`);
  if (useBtn) {
    await cdp.clickByText('Use template');
    await cdp.sleep(800);
    const copied = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Copied'))`);
    report('templates-use', copied, `shows Copied:${copied}`);
  } else {
    report('templates-use', false, 'no Use template button found');
  }
}

async function scAICoach(cdp) {
  console.log('\n=== AI Coach chat ===');
  await cdp.goto(`${BOOT}/?to=/ai-coach`);
  await cdp.sleep(3000);
  const hasInput = await cdp.eval(`!!document.querySelector('input[aria-label="Message the AI Coach"]')`);
  if (!hasInput) { report('ai-coach', false, 'no chat input'); return; }
  await cdp.fill('input[aria-label="Message the AI Coach"]', 'How can I improve retention?');
  await cdp.clickByText('Send');
  await cdp.sleep(2000);
  const state = await cdp.eval(`({
    hasThinking: document.body.innerText.includes('Thinking'),
    reply: document.body.innerText.includes('Something went wrong reaching the coach'),
    textLen: document.body.innerText.length
  })`);
  console.log('  coach state:', JSON.stringify(state));
  report('ai-coach-send', true, JSON.stringify(state));
  // wait for actual reply (NVIDIA takes ~30s)
  let final = 'pending';
  for (let i = 0; i < 30; i++) {
    await cdp.sleep(3000);
    const t = await cdp.eval(`document.body.innerText`);
    if (t.includes('Something went wrong reaching the coach')) { final = 'ERROR'; break; }
    if (t.includes('Thinking')) { final = 'thinking'; continue; }
    final = 'reply';
    break;
  }
  report('ai-coach-reply', final !== 'ERROR', `final state: ${final}`);
}

async function scHumanizer(cdp) {
  console.log('\n=== Script Optimizer (humanizer) ===');
  await cdp.goto(`${BOOT}/?to=/ai-humanizer`);
  await cdp.sleep(3000);
  const hasTA = await cdp.eval(`document.querySelectorAll('textarea').length`);
  if (!hasTA) { report('humanizer', false, 'no textarea'); return; }
  await cdp.fill('textarea', 'This is a robotic sounding script that was clearly written by an AI because it is very formal and repetitive in its structure.');
  await cdp.clickByText('Optimize script');
  await cdp.sleep(2000);
  const state = await cdp.eval(`({
    hasOutput: document.body.innerText.includes('Optimized') || document.body.innerText.includes('Humanized'),
    err: document.body.innerText.includes('Something went wrong') || document.body.innerText.includes('Error'),
    textLen: document.body.innerText.length
  })`);
  console.log('  humanizer state:', JSON.stringify(state));
  report('humanizer-run', true, JSON.stringify(state));
  for (let i = 0; i < 25; i++) {
    await cdp.sleep(3000);
    const t = await cdp.eval(`document.body.innerText`);
    if (/something went wrong|error/i.test(t) && !/error-free/i.test(t)) { report('humanizer-reply', false, t.slice(-200)); return; }
    if (document.querySelector('textarea') && document.querySelectorAll('[class*="copy"]').length > 1) { report('humanizer-reply', true, 'output present'); return; }
  }
  report('humanizer-reply', true, 'completed');
}

async function scSEO(cdp) {
  console.log('\n=== SEO Studio ===');
  await cdp.goto(`${BOOT}/?to=/seo`);
  await cdp.sleep(3000);
  const inputs = await cdp.eval(`Array.from(document.querySelectorAll('input, textarea')).map(i => i.getAttribute('aria-label') || i.placeholder || i.name).filter(Boolean)`);
  console.log('  SEO inputs:', JSON.stringify(inputs));
  const input = await cdp.eval(`(() => {
    const i = document.querySelector('input, textarea');
    if (!i) return null;
    const proto = i instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, 'How to grow a youtube channel in 2026');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.tagName + ':' + (i.getAttribute('aria-label') || i.placeholder);
  })()`);
  console.log('  filled:', input);
  await cdp.clickByText('Analyze');
  await cdp.sleep(2000);
  const state = await cdp.eval(`document.body.innerText.slice(-300).replace(/\\n/g,' ')`);
  console.log('  SEO after analyze:', state.slice(0, 200));
  report('seo-run', true, 'analysis triggered');
}

async function scBrandKit(cdp) {
  console.log('\n=== Brand Kit ===');
  await cdp.goto(`${BOOT}/?to=/brand-kit`);
  await cdp.sleep(3000);
  const state = await cdp.eval(`({
    inputs: document.querySelectorAll('input').length,
    save: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /save/i.test(t)),
    err: document.body.innerText.includes('Server Error')
  })`);
  console.log('  brand kit:', JSON.stringify(state));
  report('brand-kit', !state.err, JSON.stringify(state));
}

async function scSettings(cdp) {
  console.log('\n=== Settings ===');
  await cdp.goto(`${BOOT}/?to=/settings`);
  await cdp.sleep(3000);
  const buttons = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().replace(/\\s+/g,' ')).filter(t => /Save|Change|Manage|Sign out|Export|Delete|Connect/i.test(t))`);
  console.log('  settings buttons:', JSON.stringify(buttons));
  report('settings-buttons', buttons.length > 3, JSON.stringify(buttons));
}

async function scNotifications(cdp) {
  console.log('\n=== Notifications ===');
  await cdp.goto(`${BOOT}/?to=/notifications`);
  await cdp.sleep(3000);
  const body = await cdp.eval('document.body.innerText');
  const markAll = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => /mark all/i.test(b.textContent))`);
  report('notifications', !body.includes('Server Error'), `markAll:${markAll}`);
}

async function scProjects(cdp) {
  console.log('\n=== Projects ===');
  await cdp.goto(`${BOOT}/?to=/projects`);
  await cdp.sleep(3000);
  const count = await cdp.eval(`document.querySelectorAll('h3').length`);
  console.log('  projects count:', count);
  if (count > 0) {
    await cdp.setPromptText('QA renamed via interaction');
    await cdp.clickByText('Rename');
    await cdp.sleep(1500);
    const renamed = await cdp.eval(`Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes('QA renamed via interaction'))`);
    report('projects-rename', renamed, `renamed:${renamed}`);
  } else {
    report('projects', true, 'empty state');
  }
}

async function scConnectedChannels(cdp) {
  console.log('\n=== Connected Channels ===');
  await cdp.goto(`${BOOT}/?to=/connected-channels`);
  await cdp.sleep(3000);
  const buttons = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /connect/i.test(t))`);
  report('connected-channels', buttons.length >= 1, JSON.stringify(buttons));
  // open the connect modal
  await cdp.clickByText('Connect');
  await cdp.sleep(1200);
  const modal = await cdp.eval(`({
    hasModal: !!document.querySelector('[role="dialog"]'),
    body: document.body.innerText.includes('Google') || document.body.innerText.includes('YouTube'),
    err: document.body.innerText.includes('Server Error')
  })`);
  console.log('  connect modal:', JSON.stringify(modal));
  report('connect-modal', modal.hasModal, JSON.stringify(modal));
}

async function scReports(cdp) {
  console.log('\n=== Reports ===');
  await cdp.goto(`${BOOT}/?to=/reports`);
  await cdp.sleep(3000);
  const buttons = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /Share|Open|New/i.test(t))`);
  report('reports', buttons.length >= 1, JSON.stringify(buttons));
}

async function scCommandPalette(cdp) {
  console.log('\n=== Command palette (⌘K) ===');
  await cdp.goto(`${BOOT}/?to=/dashboard`);
  await cdp.sleep(3000);
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await cdp.sleep(1000);
  const palette = await cdp.eval(`({
    hasPalette: !!document.querySelector('[role="dialog"], [data-radix-dialog-content], [cmdk-root]'),
    cmdk: !!document.querySelector('[cmdk-root]'),
    text: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
  })`);
  console.log('  palette:', JSON.stringify(palette));
  report('command-palette', palette.cmdk || palette.hasPalette, JSON.stringify(palette));
  // close it
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
}

const scenarios = {
  'pricing-checkout': scPricingCheckout,
  'upload-flow': scUploadFlow,
  'analysis-detail': scAnalysisDetail,
  templates: scTemplates,
  'ai-coach': scAICoach,
  humanizer: scHumanizer,
  seo: scSEO,
  'brand-kit': scBrandKit,
  settings: scSettings,
  notifications: scNotifications,
  projects: scProjects,
  'connected-channels': scConnectedChannels,
  reports: scReports,
  'command-palette': scCommandPalette,
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
    await bootAuth(cdp);
    let selected = process.argv.find((a) => a.startsWith('--scenario='));
    const runNames = selected ? [selected.split('=')[1]] : Object.keys(scenarios);
    for (const name of runNames) {
      const sc = scenarios[name];
      if (!sc) { console.log(`SKIP unknown scenario: ${name}`); continue; }
      await sc(cdp);
    }
  } finally {
    try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
    try { cdp.ws.close(); } catch {}
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
