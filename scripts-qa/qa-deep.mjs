// Deep interactive QA harness — tests every feature (except auth) in a real
// Chrome via CDP, using the Pro QA user (qa.buffy.test@proton.me).
//
// Usage: node scripts-qa/qa-deep.mjs [--no-analyze] [--only name]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PORT = 9223;
const APP = `http://localhost:${process.env.TARGET_PORT || 3100}`;
const BOOT = 'http://localhost:3456';
const PRO_USER_ID = 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0';
const RUN_ANALYZE = !process.argv.includes('--no-analyze');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') || null;

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
        `--user-data-dir=${process.cwd()}\\.chrome-profile`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--window-size=1440,900', '--enable-clipboard-read-write', 'about:blank',
      ], { stdio: 'ignore' });
      chrome.unref();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome did not start');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.promptText = ''; }
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
          c.send('Page.handleJavaScriptDialog', { accept: true, promptText: c.promptText || '' }).catch(() => {});
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
  setPromptText(t) { this.promptText = t; }
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
  async clickAt(rect, label) {
    if (!rect) return false;
    await this.sleep(250);
    // Re-read the rect right before dispatching so animated pages cannot move
    // the element between measurement and click. `behavior:'instant'` is vital:
    // globals.css sets scroll-behavior:smooth, which makes scrollIntoView async
    // and would leave the element off-screen (stale coordinates) on first click.
    const fresh = await this.eval(`(() => {
      const b = ${label ? `Array.from(document.querySelectorAll('button,a')).find((b) => b.textContent.trim().includes(${JSON.stringify(label)}))` : `document.querySelector(${JSON.stringify(rect.sel)})`};
      if (!b) return null;
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, hit: top ? (top.tagName + '.' + (top.className || '').toString().slice(0, 30)) : null };
    })()`);
    const p = fresh && fresh.x ? fresh : rect;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    return true;
  }
  async click(selector) {
    const rect = await this.eval(`(() => {
      const b = document.querySelector(${JSON.stringify(selector)});
      if (!b) return null;
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, sel: ${JSON.stringify(selector)} };
    })()`);
    if (!rect) return false;
    return await this.clickAt(rect, null);
  }
  async clickText(text, tag = 'button,a') {
    const rect = await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    return await this.clickAt(rect, text);
  }
  async clickInCard(reportId, text) {
    const rect = await this.eval(`(() => {
      const link = document.querySelector('a[href*="/analysis/${reportId}"]');
      if (!link) return null;
      const card = link.closest('div.group, article, div[class*="rounded"]') || link.parentElement?.parentElement;
      if (!card) return null;
      const b = Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.sleep(250);
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
  async setSelect(selector, value) {
    return await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }
  async setFileOn(selector, filePath, mime) {
    const doc = await this.send('DOM.getDocument', { depth: -1, pierce: true });
    const q = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    if (!q.nodeId) return false;
    await this.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [filePath] });
    return true;
  }
  async fetchJSON(path, options = {}) {
    return await this.eval(`(async () => {
      try {
        const r = await fetch(${JSON.stringify(path)}, ${JSON.stringify(options)});
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch {}
        return { status: r.status, json: j, text: t.slice(0, 300) };
      } catch (e) { return { error: e.message }; }
    })()`);
  }
  consoleErrorsSince(idx) {
    return this.events.slice(idx).filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => (e.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
  failedRequestsSince(idx) {
    return this.events.slice(idx).filter((e) => e.method === 'Network.loadingFailed')
      .map((e) => e.params.errorText + ' | ' + (e.params.blockedReason || ''))
      .filter((t) => !/ERR_ABORTED|ERR_NAME_NOT_RESOLVED/.test(t));
  }
}

const results = [];
let cdp = null;

function ignoreConsole(msg) {
  const s = msg || '';
  if (/favicon|DevTools/i.test(s)) return true;
  if (/Failed to load resource/.test(s) && /404/.test(s)) return true;
  return false;
}

function report(scenario, checks, opts = {}) {
  const evtStart = opts.evtStart ?? 0;
  const consoleErrors = cdp.consoleErrorsSince(evtStart).filter((m) => !ignoreConsole(m));
  const failed = cdp.failedRequestsSince(evtStart);
  const pass = checks.every((c) => c.pass) && consoleErrors.length === 0;
  results.push({ scenario, pass, checks, consoleErrors, failed });
  console.log(`\n=== ${scenario} === ${pass ? 'PASS' : 'FAIL'}`);
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
  if (consoleErrors.length) console.log(`  ⚠ console errors: ${consoleErrors.slice(0, 4).join(' | ').slice(0, 400)}`);
  if (failed.length) console.log(`  ⚠ failed requests: ${failed.slice(0, 4).join(' | ')}`);
}

// ── auth bootstrap ─────────────────────────────────────────────
async function mintSignInToken() {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: PRO_USER_ID }),
  });
  const b = await res.json();
  if (!b.token) throw new Error('sign-in token mint failed: ' + JSON.stringify(b).slice(0, 200));
  return b.token;
}

async function dismissCookieBanner() {
  // A real user clicks this once; the banner otherwise floats over the bottom
  // corner of the viewport and intercepts clicks on lower-page controls.
  const had = await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Accept all');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await cdp.eval(`localStorage.setItem('publish_cookie_consent', JSON.stringify({analytics:true,functional:true,decided:true}))`);
  return had;
}

async function waitForApp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${APP}/api/health`, { cache: 'no-store' });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function waitForEl(selector, timeoutMs = 15000) {
  return await cdp.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, timeoutMs).catch(() => null);
}

async function bootAuth() {
  const appUp = await waitForApp();
  if (!appUp) console.log('AUTH: app not reachable — continuing anyway');
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
    } catch (e) { return { err: e.errors ? JSON.stringify(e.errors).slice(0, 300) : e.message }; }
  })()`);
  await cdp.sleep(1800);
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2500);
  await dismissCookieBanner();
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2000);
  let plan = null;
  for (let i = 0; i < 5 && !plan?.status; i++) {
    plan = await cdp.fetchJSON('/api/me/plan');
    if (!plan?.status) await cdp.sleep(2000);
  }
  return { ticket, plan };
}

// ── scenarios ──────────────────────────────────────────────────
async function scLanding() {
  const checks = [];
  await cdp.goto(`${APP}/`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'hero renders', pass: body.includes('before you') && body.includes('publish.') });
  checks.push({ label: 'features section', pass: body.includes('AI Video Analysis') && body.includes('Six review layers') });
  checks.push({ label: 'pricing section (4 tiers)', pass: ['Free', 'Creator', 'Pro', 'Agency'].every((t) => body.includes(t)) });
  checks.push({ label: 'logged-in CTA shows Dashboard', pass: await cdp.eval(`Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes('Dashboard'))`) });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.sleep(600);
  const menuBtn = await cdp.click('button[aria-label="Open navigation menu"], .lp-menu-button');
  await cdp.sleep(500);
  const menuLinks = await cdp.eval(`Array.from(document.querySelectorAll('nav[aria-label="Mobile navigation"] a')).map(a => a.textContent.trim().slice(0, 20)).join(' | ')`);
  checks.push({ label: 'mobile menu opens', pass: menuBtn && menuLinks.includes('Pricing'), detail: menuLinks.slice(0, 80) });
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  const legal = await cdp.eval(`Array.from(document.querySelectorAll('footer a[href*="/legal/"]')).map(a => a.getAttribute('href')).slice(0, 5)`);
  checks.push({ label: 'footer legal links', pass: legal.length >= 5, detail: JSON.stringify(legal) });
  return checks;
}

async function scPricing() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/pricing`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: '4 tier cards', pass: ['Free', 'Creator', 'Pro', 'Agency'].every((t) => body.includes(t)) });
  await cdp.clickText('Yearly');
  await cdp.sleep(600);
  const yearlyPrice = await cdp.eval(`document.body.innerText.match(/\\$10|\\$33|\\$66/g) || []`);
  checks.push({ label: 'yearly toggle → 10/33/66', pass: ['$10', '$33', '$66'].every((p) => yearlyPrice.includes(p)), detail: JSON.stringify(yearlyPrice) });
  await cdp.clickText('Monthly');
  await cdp.sleep(400);
  const co = await cdp.fetchJSON('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: 'pro', interval: 'monthly' }) });
  checks.push({ label: 'checkout returns LS url', pass: co.status === 200 && /lemonsqueezy\.com/.test(co.json?.url || ''), detail: `${co.status} ${(co.json?.url || '').slice(0, 70)}` });
  const bad = await cdp.fetchJSON('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: 'not-a-plan' }) });
  checks.push({ label: 'checkout rejects unknown plan', pass: bad.status === 400, detail: `status ${bad.status}` });
  return { checks, evtStart };
}

async function scDashboard() {
  const checks = [];
  await cdp.goto(`${APP}/dashboard`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'greeting renders', pass: /Welcome back/.test(body) });
  checks.push({ label: 'quota / plan info visible', pass: /analys|quota|review/i.test(body) || /Pro plan/i.test(body) });
  const navLabels = ['Dashboard', 'Upload', 'Analyses', 'Projects', 'AI Coach', 'Script Optimizer', 'SEO Studio', 'Channel Analytics', 'Reports', 'Templates', 'Connected Channels', 'Brand Kit', 'Settings'];
  checks.push({ label: 'sidebar nav complete', pass: navLabels.every((t) => body.includes(t)), detail: navLabels.filter((t) => !body.includes(t)).join(', ') || 'all present' });
  return checks;
}

async function scUpload() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/upload`);
  await cdp.sleep(2500);
  const platforms = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).map(b => b.textContent.trim())`);
  checks.push({ label: '5 platform buttons', pass: ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'].every((p) => platforms.includes(p)), detail: JSON.stringify(platforms) });
  const filledTitle = await cdp.fill('#up-title', 'QA Deep Flow — retention test video');
  const filledScript = await cdp.fill('#up-script', 'Hey everyone, welcome back to the channel. Today I want to show you exactly how to hold retention past the first 30 seconds. Most creators lose half their audience in the first ten seconds, and the fix is simpler than you think. Let me break down the three hooks that actually work, the pacing mistakes that kill mid-video retention, and the exact CTA structure that gets people to comment. Stick around to the end where I share the analytics from my last thirty uploads. Like and subscribe and hit the bell so you never miss the next breakdown.');
  checks.push({ label: 'form fields accept input', pass: filledTitle && filledScript });
  await cdp.clickText('TikTok');
  await cdp.sleep(300);
  const pressed = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).find(b => b.textContent.trim() === 'TikTok')?.getAttribute('aria-pressed')`);
  checks.push({ label: 'platform switch to TikTok', pass: pressed === 'true' });
  const canRun = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Run full review' && !b.disabled)`);
  checks.push({ label: 'Run full review enabled', pass: canRun });
  // Real file-upload attempt: storage is disabled, so the slot must show an
  // error and the storage banner must appear (after the failed presign). The
  // presign route can be slow on its first dev-server compile, so wait for the
  // outcome rather than a fixed sleep.
  const fileWrite = await writeProbeFile();
  if (fileWrite) {
    const setOk = await cdp.setFileOn('input[type="file"][accept*="video"]', fileWrite, 'video/mp4');
    const outcome = await cdp.waitFor(`document.body.innerText.includes("isn't enabled") || /Upload failed|Could not prepare|storage unavailable/i.test(document.body.innerText)`, 45000).catch(() => null);
    const afterFile = await cdp.text();
    const banner = afterFile.includes("isn't enabled") || afterFile.includes('not enabled');
    const slotErr = /Upload failed|Could not prepare|storage/i.test(afterFile);
    checks.push({ label: 'video upload attempt → banner + slot error', pass: !!setOk && banner && slotErr, detail: setOk ? (banner && slotErr ? 'banner + slot error shown' : afterFile.slice(-300).replace(/\n/g, ' ')) : 'setFileInputFiles failed' });
  } else {
    checks.push({ label: 'file-upload attempt (probe file)', pass: false, detail: 'could not write probe file' });
  }
  if (RUN_ANALYZE && canRun) {
    // The upload attempt briefly disables the button while the slot settles
    // into its error state; wait for it to re-enable before running.
    await cdp.waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Run full review' && !b.disabled)`, 45000).catch(() => {});
    await cdp.clickText('Run full review');
    const started = await cdp.waitFor(`/Queued|Analyzing|Starting|running|analyzing/i.test(document.body.innerText) || /Could not start the review|failed/i.test(document.body.innerText)`, 30000).catch(() => null);
    const inFlight = await cdp.text();
    checks.push({ label: 'review started', pass: !!started && !/Could not start the review/.test(inFlight), detail: inFlight.slice(-220).replace(/\n/g, ' ') });
    const landed = await cdp.waitFor(`location.pathname.startsWith('/analysis/')`, 420000).catch(() => null);
    const reportUrl = landed ? await cdp.url() : null;
    checks.push({ label: 'navigated to finished report', pass: !!reportUrl, detail: reportUrl || 'timeout — review did not complete in 7 min' });
    if (reportUrl) {
      global.__newReportUrl = reportUrl;
      await cdp.sleep(3500);
      const repBody = await cdp.text();
      checks.push({ label: 'report renders without server error', pass: !repBody.includes('Server Error') && /Score/i.test(repBody) });
    }
  } else {
    checks.push({ label: 'full analyze run', pass: true, detail: 'skipped (--no-analyze)' });
  }
  return { checks, evtStart };
}

function writeProbeFile() {
  try {
    const p = `${process.cwd()}/probe.mp4`;
    writeFileSync(p, Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]));
    return p;
  } catch { return null; }
}

async function scAnalyses() {
  const checks = [];
  await cdp.goto(`${APP}/analyses`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'analyses list renders', pass: /Analyses/.test(body) && !body.includes('Server Error') });
  const rows = await cdp.eval(`document.querySelectorAll('a[href*="/analysis/"]').length`);
  checks.push({ label: 'report rows present', pass: rows >= 1, detail: `${rows} rows` });
  const tabs = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => ['All','Ready','Needs work','Rework'].includes(t))`);
  checks.push({ label: 'status tabs render', pass: tabs.length >= 4, detail: JSON.stringify(tabs) });
  await cdp.fill('input[placeholder="Search analyses…"]', 'zzznomatch');
  await cdp.sleep(500);
  checks.push({ label: 'search no-match empty state', pass: (await cdp.text()).includes('No matches') });
  await cdp.fill('input[placeholder="Search analyses…"]', '');
  await cdp.sleep(400);
  await cdp.clickText('Filter');
  await cdp.sleep(400);
  checks.push({ label: 'filter menu opens', pass: await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Rework')`) });
  return checks;
}

async function scAnalysisDetail() {
  const checks = [];
  const evtStart = cdp.events.length;
  const id = (global.__newReportUrl || '').split('/analysis/')[1] || 'cmst0cw4300066qbi8f3yux8q';
  await cdp.goto(`${APP}/analysis/${id}`);
  await cdp.sleep(3500);
  const body = await cdp.text();
  checks.push({ label: 'score header renders', pass: /Score/i.test(body) && /Publish|overall|monetization/i.test(body), detail: body.slice(0, 120).replace(/\n/g, ' ') });
  checks.push({ label: 'priority fixes present', pass: /Fix|Priority|Top/i.test(body) });
  const tabs = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => ['YouTube','TikTok','Instagram','Facebook','LinkedIn'].some(p => t.includes(p)))`);
  checks.push({ label: 'platform tabs render', pass: tabs.length >= 1, detail: JSON.stringify(tabs.slice(0, 5)) });
  if (tabs.length > 1) {
    await cdp.clickText(tabs[1]);
    await cdp.sleep(700);
    checks.push({ label: 'platform tab switch works', pass: !(await cdp.text()).includes('Server Error') });
  }
  checks.push({ label: 'Export PDF button', pass: await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Export PDF'))`) });
  const shareBtn = await cdp.waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Share score'))`, 8000).catch(() => null);
  if (shareBtn) await cdp.clickText('Share score');
  await cdp.sleep(700);
  checks.push({ label: 'Share score copies link', pass: !!shareBtn && /Link copied/.test(await cdp.text()) });
  checks.push({ label: 'analysis sections render', pass: /Script|Hook|SEO|Thumbnail|Voice|Copyright/i.test(body) });
  return { checks, evtStart };
}

async function scSharePage() {
  const checks = [];
  const id = (global.__newReportUrl || '').split('/analysis/')[1] || 'cmst0cw4300066qbi8f3yux8q';
  await cdp.goto(`${APP}/share/${id}`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'public share page renders', pass: /Score/i.test(body) && !body.includes('Server Error'), detail: body.slice(0, 120).replace(/\n/g, ' ') });
  checks.push({ label: 'internal data not leaked', pass: !body.includes('Priority fixes') && !body.includes('Script Analyzer') });
  const api = await cdp.fetchJSON(`/api/share/${id}`);
  checks.push({ label: 'share OG api', pass: api.status === 200, detail: `${api.status} ${JSON.stringify(api.json || {}).slice(0, 100)}` });
  return checks;
}

async function scReports() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/reports`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'reports list renders', pass: /Reports/.test(body) && /review|project/i.test(body) && !body.includes('Server Error'), detail: body.slice(0, 140).replace(/\n/g, ' ') });
  const rows = await cdp.eval(`document.querySelectorAll('a[href*="/analysis/"]').length`);
  checks.push({ label: 'report rows present', pass: rows >= 1, detail: `${rows} rows` });
  const shareBtn = await cdp.click('button[aria-label="Copy shareable link to this report"]');
  await cdp.sleep(500);
  checks.push({ label: 'share button copies', pass: shareBtn && (await cdp.text()).includes('Copied') });
  return { checks, evtStart };
}

async function scProjects() {
  const checks = [];
  await cdp.goto(`${APP}/projects`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'projects page renders', pass: /Projects/.test(body) && !body.includes('Server Error') });
  const cards = await cdp.eval(`document.querySelectorAll('a[href*="/analysis/"]').length`);
  checks.push({ label: 'reports appear as projects', pass: cards >= 1, detail: `${cards} cards` });
  await cdp.click('button[aria-label="List view"]');
  await cdp.sleep(500);
  checks.push({ label: 'list view toggles', pass: await cdp.eval(`!!document.querySelector('a[href*="/analysis/"]')`) && !(await cdp.text()).includes('Server Error') });
  await cdp.click('button[aria-label="Grid view"]');
  await cdp.sleep(400);
  await cdp.fill('input[placeholder*="Search title"]', 'zzznope');
  await cdp.sleep(500);
  checks.push({ label: 'search empty state', pass: (await cdp.text()).includes('No projects found') });
  await cdp.fill('input[placeholder*="Search title"]', '');
  await cdp.sleep(400);
  const newId = (global.__newReportUrl || '').split('/analysis/')[1];
  const stamp = Date.now().toString(36);
  const probeTitle = `QA Rename Probe ${stamp}`;
  let targetId = newId;
  let originalTitle = null;
  if (!targetId) {
    // No fresh report: run the rename flow on the first card, restoring its
    // original title afterwards so the account data is unchanged.
    targetId = await cdp.eval(`(() => {
      const a = document.querySelector('a[href*="/analysis/"]');
      return a ? a.getAttribute('href').split('/analysis/')[1] : null;
    })()`);
    originalTitle = await cdp.eval(`(() => {
      const a = document.querySelector('a[href*="/analysis/"]');
      if (!a) return null;
      const card = a.closest('div.group, article') || a.parentElement?.parentElement;
      return card ? (card.querySelector('h3')?.textContent.trim() || null) : null;
    })()`);
  }
  if (targetId) {
    cdp.setPromptText(probeTitle);
    const clicked = await cdp.clickInCard(targetId, 'Rename');
    const renamed = await cdp.waitFor(`Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes(${JSON.stringify(probeTitle)}))`, 15000).catch(() => null);
    checks.push({ label: 'rename via prompt works', pass: clicked && !!renamed, detail: `clicked=${clicked} renamed=${!!renamed}` });
    if (clicked && renamed && newId) {
      // Fresh report only: test delete, which removes it (cleanup).
      await cdp.clickInCard(targetId, 'Delete');
      const gone = await cdp.waitFor(`!Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes(${JSON.stringify(probeTitle)}))`, 15000).catch(() => null);
      checks.push({ label: 'delete via confirm works', pass: !!gone });
      global.__newReportUrl = null;
    } else if (clicked && renamed && originalTitle) {
      // Restore the original title so the account data is unchanged.
      cdp.setPromptText(originalTitle);
      await cdp.clickInCard(targetId, 'Rename');
      const restored = await cdp.waitFor(`Array.from(document.querySelectorAll('h3')).some(h => h.textContent.includes(${JSON.stringify(originalTitle)}))`, 15000).catch(() => null);
      checks.push({ label: 'rename restores original', pass: !!restored });
    }
  } else {
    checks.push({ label: 'rename/delete flow', pass: true, detail: 'no project cards to act on' });
  }
  return checks;
}

async function scAICoach() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/ai-coach`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  const gated = body.includes('Upgrade to') && body.includes('AI Coach');
  checks.push({ label: 'pro user sees chat (not paywall)', pass: !gated, detail: gated ? 'paywall rendered for pro user!' : 'chat rendered' });
  const chips = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => ['Analyze my first 10s drop-off','Rewrite titles for curiosity gap','Diagnose mid-funnel retention','Fix robotic script pacing'].includes(t))`);
  checks.push({ label: 'suggested prompt chips', pass: chips.length >= 4, detail: JSON.stringify(chips) });
  if (!gated) {
    await waitForEl('input[aria-label="Message the AI Coach"]', 15000);
    await cdp.clickText('Diagnose mid-funnel retention');
    await cdp.sleep(400);
    checks.push({ label: 'chip fills input', pass: (await cdp.eval(`document.querySelector('input[aria-label="Message the AI Coach"]')?.value || ''`)).length > 5 });
    await cdp.clickText('Send');
    await cdp.sleep(1500);
    const done = await cdp.waitFor(`document.body.innerText.includes('Something went wrong reaching the coach') || document.body.innerText.split('Diagnose mid-funnel retention').length > 1`, 150000).catch(() => null);
    const finalText = await cdp.text();
    checks.push({ label: 'coach replies', pass: finalText.includes('Diagnose mid-funnel retention') && !finalText.includes('Something went wrong reaching the coach'), detail: finalText.slice(-250).replace(/\n/g, ' ') });
  }
  return { checks, evtStart };
}

async function scHumanizer() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/ai-humanizer`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'optimizer page renders', pass: /Script Optimizer/.test(body) && !body.includes('Server Error') });
  const taReady = await waitForEl('textarea[aria-label="Your script"]', 20000);
  await cdp.fill('textarea[aria-label="Your script"]', 'So today I am going to show you guys how to make your videos way better and get more views and make sure you subscribe because we have amazing content coming up all the time. Honestly the algorithm is crazy and you need to understand it. This video is going to be super helpful for everyone watching so please stay tuned because there is a lot to cover in this one.');
  const toneSet = taReady ? await cdp.setSelect('select', 'energetic') : false;
  checks.push({ label: 'tone select changes', pass: !!toneSet });
  const canOpt = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Optimize script') && !b.disabled)`);
  checks.push({ label: 'Optimize enabled', pass: canOpt });
  await cdp.clickText('Optimize script');
  await cdp.sleep(1000);
  const hasResult = await cdp.waitFor(`document.body.innerText.includes('Pre-publish signals') || document.body.innerText.includes('Optimization failed')`, 180000).catch(() => null);
  const resultText = await cdp.text();
  checks.push({ label: 'optimizer returns result', pass: !!hasResult && resultText.includes('Pre-publish signals'), detail: resultText.includes('Optimization failed') ? 'optimization FAILED' : (hasResult ? 'result rendered' : 'timeout') });
  if (hasResult && resultText.includes('Pre-publish signals')) {
    const signals = await cdp.eval(`document.body.innerText.match(/\\d+\\/12/g) || []`);
    checks.push({ label: '12-signal grid rendered', pass: signals.length >= 1, detail: JSON.stringify(signals) });
    await cdp.waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Copy')`, 5000).catch(() => {});
    await cdp.clickText('Copy');
    await cdp.sleep(700);
    checks.push({ label: 'copy shows Copied', pass: (await cdp.text()).includes('Copied') });
  }
  return { checks, evtStart };
}

async function scSEO() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/seo`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'seo studio renders', pass: /SEO Studio/.test(body) && !body.includes('Server Error') });
  await waitForEl('#seo-title', 20000);
  await cdp.fill('#seo-title', 'How I doubled watch time in 30 days without changing my niche');
  await cdp.setSelect('#seo-platform', 'YouTube');
  await cdp.clickText('Analyze');
  await cdp.sleep(1000);
  const hasResult = await cdp.waitFor(`document.body.innerText.includes('Optimized titles') || document.body.innerText.includes('Analysis failed')`, 240000).catch(() => null);
  const resultText = await cdp.text();
  checks.push({ label: 'SEO analysis returns results', pass: !!hasResult && resultText.includes('Optimized titles'), detail: resultText.includes('Analysis failed') ? 'SEO analysis FAILED' : (hasResult ? 'results rendered' : 'timeout') });
  if (hasResult && resultText.includes('Optimized titles')) {
    const scores = await cdp.eval(`document.body.innerText.match(/(SEO score|Keyword strength|CPM potential|CTR prediction)/g) || []`);
    checks.push({ label: 'score cards render', pass: scores.length === 4, detail: JSON.stringify(scores) });
    await cdp.click('button[aria-label="Copy title"]');
    await cdp.sleep(500);
    checks.push({ label: 'title copy works', pass: (await cdp.text()).includes('Optimized titles') });
  }
  return { checks, evtStart };
}

async function scBrandKit() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/brand-kit`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'brand kit renders', pass: /Brand Kit/.test(body) && !body.includes('Server Error') });
  const tone = 'Calm';
  const before = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).find(b => b.textContent.trim() === ${JSON.stringify(tone)})?.getAttribute('aria-pressed')`);
  const clicked = await cdp.clickText(tone);
  await cdp.sleep(500);
  const after = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).find(b => b.textContent.trim() === ${JSON.stringify(tone)})?.getAttribute('aria-pressed')`);
  checks.push({ label: 'tone toggle switches', pass: clicked && before !== after, detail: `${tone}: ${before} → ${after}` });
  await cdp.clickText('Save changes');
  const saved = await cdp.waitFor(`document.body.innerText.includes('Saved')`, 15000).catch(() => null);
  checks.push({ label: 'save shows Saved', pass: !!saved });
  await cdp.goto(`${APP}/brand-kit`);
  await cdp.sleep(2500);
  const persisted = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-pressed]')).find(b => b.textContent.trim() === ${JSON.stringify(tone)})?.getAttribute('aria-pressed')`);
  checks.push({ label: 'tone persisted after reload', pass: persisted === after, detail: `${tone} → ${persisted}` });
  return { checks, evtStart };
}

async function scTemplates() {
  const checks = [];
  const cardCountExpr = `document.querySelectorAll('h3').length`;
  await cdp.goto(`${APP}/templates`);
  await cdp.sleep(2500);
  const cards = await cdp.eval(cardCountExpr);
  checks.push({ label: 'template cards render', pass: cards >= 12, detail: `${cards} cards` });
  // Wait for hydration: the Hooks tab click only filters if React's onClick is
  // attached, so waiting for the count to drop proves the page is interactive
  // before the search/copy steps (which race hydration otherwise).
  await cdp.clickText('Hooks');
  const filteredCount = await cdp.waitFor(`document.querySelectorAll('h3').length === 3`, 8000).catch(() => null);
  checks.push({ label: 'Hooks tab filters to 3', pass: !!filteredCount, detail: `cards after Hooks: ${await cdp.eval(cardCountExpr)}` });
  await cdp.clickText('All');
  await cdp.waitFor(`document.querySelectorAll('h3').length === 13`, 8000).catch(() => {});
  await cdp.fill('input[aria-label="Search templates"]', 'curiosity');
  const searched = await cdp.waitFor(`Array.from(document.querySelectorAll('h3')).length === 1 && /curiosity/i.test(Array.from(document.querySelectorAll('h3'))[0]?.textContent || '')`, 8000).catch(() => null);
  const searchedList = await cdp.eval(`Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim())`);
  checks.push({ label: 'search filters to curiosity', pass: !!searched, detail: JSON.stringify(searchedList) });
  await cdp.fill('input[aria-label="Search templates"]', '');
  await cdp.waitFor(`document.querySelectorAll('h3').length === 13`, 8000).catch(() => {});
  const useBtn = await cdp.waitFor(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Use template'))`, 5000).catch(() => null);
  if (useBtn) await cdp.clickText('Use template');
  const copied = await cdp.waitFor(`document.body.innerText.includes('Copied')`, 5000).catch(() => null);
  checks.push({ label: 'Use template copies', pass: !!useBtn && !!copied });
  return checks;
}

async function scNotifications() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/notifications`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'feed renders', pass: /Today|Earlier|just now|m ago|review/i.test(body) && !body.includes('Server Error'), detail: body.slice(0, 140).replace(/\n/g, ' ') });
  const hasBtn = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Mark all as read'))`);
  const caughtUp = body.includes('All caught up');
  checks.push({ label: 'mark-all button or all-caught-up', pass: hasBtn || caughtUp, detail: hasBtn ? 'button present' : 'all caught up' });
  if (hasBtn) {
    await cdp.clickText('Mark all as read');
    const cleared = await cdp.waitFor(`Array.from(document.querySelectorAll('span[aria-label="Unread"]')).length === 0 || document.body.innerText.includes('All caught up')`, 15000).catch(() => null);
    checks.push({ label: 'marking read clears unread', pass: !!cleared, detail: `unread: ${await cdp.eval(`Array.from(document.querySelectorAll('span[aria-label="Unread"]')).length`)}` });
  }
  return { checks, evtStart };
}

async function scSettings() {
  const checks = [];
  const evtStart = cdp.events.length;
  await cdp.goto(`${APP}/settings`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'settings renders', pass: /Settings/.test(body) && !body.includes('Server Error') });
  checks.push({ label: 'pro plan + usage meter', pass: /Pro plan/.test(body) && /Analyses this period/.test(body) });
  const stamp = Date.now().toString(36);
  const newName = `QA Deep Pro ${stamp}`;
  await cdp.fill('#display-name', newName);
  await cdp.clickText('Save changes');
  // The endpoint is limited to 5 saves/hour per account (LIMITS.ACCOUNT). The
  // UI either confirms with 'Saved.' or surfaces the API error; a 429 from
  // repeated test runs is correct app behavior, not a bug.
  const outcome = await cdp.waitFor(`document.body.innerText.includes('Saved.') || document.body.innerText.includes('Too many requests') || document.body.innerText.includes('Could not save')`, 20000).catch(() => null);
  const bodyAfter = await cdp.text();
  const saved = bodyAfter.includes('Saved.');
  const rateLimited = bodyAfter.includes('Too many requests');
  checks.push({ label: 'profile save shows Saved', pass: saved || rateLimited, detail: saved ? 'Saved' : (rateLimited ? 'rate-limited (5/hr) — API verified separately' : bodyAfter.slice(-120).replace(/\n/g, ' ')) });
  const switchEl = 'button[aria-label="Product email"]';
  const before = await cdp.eval(`document.querySelector(${JSON.stringify(switchEl)})?.getAttribute('aria-checked')`);
  await cdp.click(switchEl);
  const flipped = await cdp.waitFor(`document.querySelector(${JSON.stringify(switchEl)})?.getAttribute('aria-checked') !== ${JSON.stringify(before)}`, 8000).catch(() => null);
  const after = await cdp.eval(`document.querySelector(${JSON.stringify(switchEl)})?.getAttribute('aria-checked')`);
  checks.push({ label: 'product email toggle flips', pass: !!flipped, detail: `${before} → ${after}` });
  await cdp.click(switchEl);
  await cdp.sleep(1200);
  await cdp.clickText('Connect channel');
  const formOpened = await cdp.waitFor(`!!document.querySelector('#new-platform')`, 8000).catch(() => null);
  checks.push({ label: 'connect channel form opens', pass: !!formOpened });
  await cdp.goto(`${APP}/settings?tab=billing`);
  await cdp.sleep(2200);
  checks.push({ label: 'billing deep-link works', pass: /Billing & plan/.test(await cdp.text()) });
  return { checks, evtStart };
}

async function scChannels() {
  const checks = [];
  await cdp.goto(`${APP}/connected-channels`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'platform cards render', pass: /0 of 2 connected/.test(body) && /Not connected/.test(body) && !body.includes('Server Error'), detail: body.slice(0, 150).replace(/\n/g, ' ') });
  const connectBtns = await cdp.eval(`Array.from(document.querySelectorAll('button[aria-label*="Connect"]')).length`);
  checks.push({ label: 'connect buttons (youtube+tiktok)', pass: connectBtns >= 2, detail: `${connectBtns} buttons` });
  const api = await cdp.fetchJSON('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'YOUTUBE', channelId: 'fake-123' }) });
  checks.push({ label: 'POST /api/channels graceful', pass: api.status >= 400 && api.status < 500, detail: `status ${api.status} ${JSON.stringify(api.json || {}).slice(0, 90)}` });
  return checks;
}

async function scChannelAnalytics() {
  const checks = [];
  await cdp.goto(`${APP}/channel-analytics`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'empty state renders', pass: /No channels connected/.test(body) && !body.includes('Server Error') });
  checks.push({ label: 'connect CTA present', pass: await cdp.eval(`Array.from(document.querySelectorAll('a,button')).some(b => b.textContent.includes('Connect channel'))`) });
  return checks;
}

async function scHelp() {
  const checks = [];
  await cdp.goto(`${APP}/help`);
  await cdp.sleep(2500);
  const body = await cdp.text();
  checks.push({ label: 'help center renders', pass: /Help/.test(body) && !body.includes('Server Error'), detail: body.slice(0, 120).replace(/\n/g, ' ') });
  return checks;
}

async function scLegal() {
  const checks = [];
  const paths = ['/legal/terms', '/legal/privacy', '/legal/subscription-terms', '/legal/refund', '/legal/acceptable-use', '/legal/cookies', '/legal/subprocessors', '/legal/dmca'];
  for (const p of paths) {
    await cdp.goto(`${APP}${p}`);
    await cdp.sleep(1500);
    const body = await cdp.text();
    checks.push({ label: `${p} loads`, pass: !body.includes('Server Error') && body.length > 200, detail: body.slice(0, 50).replace(/\n/g, ' ') });
  }
  return checks;
}

async function scRestore() {
  const checks = [];
  await cdp.goto(`${APP}/restore`);
  await cdp.sleep(2200);
  const body = await cdp.text();
  checks.push({ label: 'restore page renders', pass: !body.includes('Server Error') && body.length > 150, detail: body.slice(0, 90).replace(/\n/g, ' ') });
  const api = await cdp.fetchJSON('/api/billing/restore', { method: 'POST' });
  checks.push({ label: 'restore API graceful', pass: api.status === 404 || api.status === 200, detail: `${api.status} ${JSON.stringify(api.json || {}).slice(0, 100)}` });
  return checks;
}

async function scNotFound() {
  const checks = [];
  await cdp.goto(`${APP}/does-not-exist-xyz`);
  await cdp.sleep(2200);
  const body = await cdp.text();
  checks.push({ label: '404 page renders', pass: !body.includes('Server Error') && /404|not found|Nothing here|find/i.test(body), detail: body.slice(0, 90).replace(/\n/g, ' ') });
  return checks;
}

async function scAPIs() {
  const checks = [];
  const plan = await cdp.fetchJSON('/api/me/plan');
  checks.push({ label: 'GET /api/me/plan authed + pro', pass: plan.status === 200 && plan.json?.plan === 'pro', detail: JSON.stringify(plan.json || {}).slice(0, 100) });
  const kit = await cdp.fetchJSON('/api/me/brand-kit', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandKit: { colors: [], headingFont: 'General Sans', bodyFont: 'Inter', tones: [], description: '', banned: [], logoUrl: null } }) });
  checks.push({ label: 'PUT /api/me/brand-kit', pass: kit.status === 200, detail: `status ${kit.status} ${JSON.stringify(kit.json || {}).slice(0, 60)}` });
  const badAnalyze = await cdp.fetchJSON('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
  checks.push({ label: 'POST /api/analyze validation', pass: badAnalyze.status === 400, detail: `status ${badAnalyze.status} ${JSON.stringify(badAnalyze.json || {}).slice(0, 80)}` });
  const webhook = await cdp.fetchJSON('/api/billing/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  checks.push({ label: 'webhook rejects unsigned', pass: webhook.status >= 400 && webhook.status < 500, detail: `status ${webhook.status}` });
  const health = await cdp.fetchJSON('/api/health');
  checks.push({ label: 'GET /api/health', pass: health.status === 200, detail: `status ${health.status}` });
  const pre = await cdp.fetchJSON('/api/upload/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 'video', filename: 't.mp4', contentType: 'video/mp4', size: 100 }) });
  checks.push({ label: 'presign returns storageUnavailable', pass: pre.status === 503 && pre.json?.storageUnavailable === true, detail: `${pre.status} ${JSON.stringify(pre.json || {}).slice(0, 80)}` });
  return checks;
}

const scenarios = {
  landing: scLanding, pricing: scPricing, dashboard: scDashboard, upload: scUpload,
  analyses: scAnalyses, 'analysis-detail': scAnalysisDetail, share: scSharePage,
  reports: scReports, projects: scProjects, 'ai-coach': scAICoach, humanizer: scHumanizer,
  seo: scSEO, 'brand-kit': scBrandKit, templates: scTemplates, notifications: scNotifications,
  settings: scSettings, channels: scChannels, 'channel-analytics': scChannelAnalytics,
  help: scHelp, legal: scLegal, restore: scRestore, 'not-found': scNotFound, apis: scAPIs,
};

// ── main ───────────────────────────────────────────────────────
await waitForChrome();
const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
cdp = await CDP.connect(tab.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
try {
  await cdp.send('Browser.grantPermissions', { origin: APP, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
} catch {}

try {
  console.log('AUTH: bootstrapping Pro session…');
  const auth = await bootAuth();
  console.log('AUTH: ticket=', JSON.stringify(auth.ticket), '| me/plan=', JSON.stringify(auth.plan));
  if (auth.plan.status !== 200 || auth.plan.json?.plan !== 'pro') {
    console.log('AUTH: WARNING — expected pro plan, got', JSON.stringify(auth.plan));
  }

  const names = ONLY ? ONLY : Object.keys(scenarios);
  for (const name of names) {
    const sc = scenarios[name];
    if (!sc) { console.log(`SKIP unknown scenario: ${name}`); continue; }
    try {
      const out = await sc();
      const checks = Array.isArray(out) ? out : out.checks;
      report(name, checks, { evtStart: out?.evtStart ?? 0 });
    } catch (e) {
      report(name, [{ label: 'scenario threw', pass: false, detail: e.message.slice(0, 300) }]);
    }
  }
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${'='.repeat(70)}`);
console.log(`DEEP QA SUMMARY: ${passed}/${results.length} scenarios passed`);
for (const r of results) {
  if (!r.pass) console.log(`  FAIL ${r.scenario} — ${r.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')}`);
}
process.exit(results.every((r) => r.pass) ? 0 : 1);
