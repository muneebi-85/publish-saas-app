// CDP-based authenticated browser test harness.
// Drives headless Chrome via the DevTools Protocol. Authentication is done by
// signing in through the REAL Clerk form (like a real user), because injecting
// cookies fakes a session that Clerk's client JS later invalidates client-side.
// Run: node scripts-qa/cdp-harness.mjs <signin|upload|projects|templates|debug>
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 9223; // 9222 is owned by Lenovo Vantage's Edge — never touch it
const APP = process.env.TARGET_PORT ? `http://localhost:${process.env.TARGET_PORT}` : 'http://localhost:3100';
const QA_EMAIL = process.env.QA_EMAIL || 'qa2.freebuff.tester@gmail.com';
const QA_PASSWORD = process.env.QA_PASSWORD || 'FreebuffQA#2026x!';

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
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (i === 1) {
      const chrome = spawn(findChrome(), [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--user-data-dir=scripts-qa/.chrome-profile',
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
  async clickSubmit() {
    await this.eval(`(() => {
      const b = document.querySelector('button[type="submit"]');
      if (b) b.scrollIntoView({ block: 'center' });
      return !!b;
    })()`);
    await this.sleep(200);
    const rect = await this.eval(`(() => {
      const b = document.querySelector('button[type="submit"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return true;
  }
  async clickByText(text) {
    // scroll into view + real mouse click so user-activation APIs (clipboard) work
    await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (b) b.scrollIntoView({ block: 'center' });
      return !!b;
    })()`);
    await this.sleep(250);
    const rect = await this.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) return false;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    return true;
  }
  consoleErrors() {
    return this.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => (e.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
}

function jwtClaims(jwt) {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    return { sid: p.sid, iat: p.iat, exp: p.exp, nbf: p.nbf, iss: p.iss, sub: p.sub };
  } catch {
    return 'unparseable';
  }
}

// Set a controlled input's value the way React can see it (native setter + input event).
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

async function fetchPlanStatus(cdp) {
  return await cdp.eval(`(async () => {
    const r = await fetch('/api/me/plan', { cache: 'no-store' });
    return { status: r.status, authenticated: (await r.json().catch(() => ({}))).authenticated };
  })()`);
}

/**
 * Ensure a real authenticated session: go to a protected page (so the middleware
 * hands Clerk a redirect_url), then complete the embedded SignIn form with the
 * QA user's real email + password. Returns true when /api/me/plan says authed.
 */
async function ensureSignedIn(cdp) {
  await cdp.goto(APP + '/upload');
  await cdp.sleep(1500);
  const before = await fetchPlanStatus(cdp);
  if (before.status === 200 && before.authenticated === true) {
    console.log('SIGNIN: already authenticated');
    return true;
  }

  const onSignIn = await cdp.eval(`location.pathname.startsWith('/sign-in')`);
  if (!onSignIn) {
    await cdp.goto(APP + '/sign-in');
    await cdp.sleep(1200);
  }
  console.log('SIGNIN: on sign-in page, filling credentials…');

  // Identifier (email) field
  await cdp.waitFor(`!!document.querySelector('input[name="identifier"]')`, 20000);
  const setIdent = await cdp.eval(setInputValue('input[name="identifier"]', QA_EMAIL));
  await cdp.sleep(300);

  // Password field is usually on the same screen for password-based accounts.
  const hasPassword = await cdp.eval(`!!document.querySelector('input[name="password"]')`);
  if (hasPassword) {
    const setPw = await cdp.eval(setInputValue('input[name="password"]', QA_PASSWORD));
    await cdp.sleep(200);
    console.log('SIGNIN: set ident/pw ->', setIdent, '/', setPw);
  } else {
    // Two-step flow: submit identifier first, then fill the password step.
    await cdp.clickSubmit();
    await cdp.waitFor(`!!document.querySelector('input[name="password"]')`, 15000);
    await cdp.eval(setInputValue('input[name="password"]', QA_PASSWORD));
  }

  const fieldValues = await cdp.eval(`Array.from(document.querySelectorAll('input')).map(i => i.name + '=' + i.value).join(' | ')`);
  const buttons = await cdp.eval(`Array.from(document.querySelectorAll('button')).map(b => (b.type || 'no-type') + ':' + b.textContent.trim().slice(0, 20)).join(' || ')`);
  console.log('SIGNIN: field values ->', fieldValues);
  console.log('SIGNIN: buttons ->', buttons);
  // Click the real Clerk primary button: type=submit with exact text "Continue"
  // (the social "Continue with Google" is also type=submit — never pick it).
  const clicked = await cdp.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button[type="submit"]')).find(b => b.textContent.trim() === 'Continue');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true };
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => b.dispatchEvent(new MouseEvent(t, { ...opts, clientX: r.x + r.width/2, clientY: r.y + r.height/2 })));
    return true;
  })()`);
  console.log('SIGNIN: Continue clicked:', clicked);
  await cdp.sleep(500);

  // If an OTP step appears (shouldn't for password auth), report it.
  const otpStep = await cdp.eval(`!!document.querySelector('input[name="code"]')`);
  if (otpStep) console.log('SIGNIN: OTP step appeared (unexpected for password auth)');

  await cdp.waitFor(`!location.pathname.startsWith('/sign-in')`, 30000).catch(() => {});
  await cdp.sleep(1200);
  // If we landed on a factor-two / verification step, dump what it asks for.
  if ((await cdp.eval(`location.pathname`)).includes('factor')) {
    const step = await cdp.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(i => i.name + ':' + (i.type || ''));
      const heading = document.querySelector('h1, h2, .cl-headerTitle')?.textContent?.trim() || '';
      return { path: location.pathname, heading, inputs, body: document.body.innerText.slice(0, 400) };
    })()`);
    console.log('SIGNIN: factor step ->', JSON.stringify(step, null, 1).slice(0, 900));
  }
  // Diagnostics: what does the form say now?
  const formState = await cdp.eval(`(() => {
    const errs = Array.from(document.querySelectorAll('[role="alert"], .cl-formFieldError, .cl-alert')).map(e => e.textContent.trim()).filter(Boolean);
    const btn = document.querySelector('button[type="submit"]');
    return { errs, btnText: btn?.textContent.trim(), hasIdent: !!document.querySelector('input[name="identifier"]'), hasPw: !!document.querySelector('input[name="password"]') };
  })()`);
  console.log('SIGNIN: form diagnostics ->', JSON.stringify(formState));
  await cdp.sleep(2500); // let Clerk client finish the handshake + rotation
  const after = await fetchPlanStatus(cdp);
  console.log('SIGNIN: me/plan after sign-in ->', JSON.stringify(after));
  const url = await cdp.eval('location.href');
  console.log('SIGNIN: landed on', url);
  return after.status === 200 && after.authenticated === true;
}

async function signin(cdp) {
  const ok = await ensureSignedIn(cdp);
  console.log('SIGNIN: success =', ok);
  console.log('SIGNIN: consoleErrors=', JSON.stringify(cdp.consoleErrors()));
}

async function upload(cdp) {
  if (!(await ensureSignedIn(cdp))) {
    console.log('UPLOAD: sign-in failed, aborting');
    return;
  }
  await cdp.goto(APP + '/upload');
  await cdp.sleep(1200);

  const slotLabels = await cdp.eval(`Array.from(document.querySelectorAll('div')).filter(d=>d.textContent.trim().match(/^(Video|Thumbnail|Script|Voiceover)\\s*\\*?$/)).length`);
  console.log('UPLOAD: slotLabelsFound=', slotLabels);

  await cdp.eval(setInputValue('#up-title', 'QA deep test video'));
  const script = `Hey everyone, welcome back to the channel. Today I am going to show you how to grow your channel with consistent uploads. Remember to like and subscribe and hit the bell icon so you never miss an upload. This has been a great week for analytics and I can not wait to share the full breakdown with you.`;
  await cdp.eval(setInputValue('#up-script', script));
  await cdp.sleep(300);
  const canRun = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Run full review' && !b.disabled)`);
  console.log('UPLOAD: Run full review enabled:', canRun);

  await cdp.clickByText('Run full review');
  console.log('UPLOAD: clicked Run full review, waiting for report…');
  await cdp.sleep(2500);
  const analyzing = await cdp.text();
  console.log('UPLOAD: analyzing state shown:', analyzing.includes('Starting review') || analyzing.includes('Queued') || analyzing.includes('Analyzing'));

  const finalUrl = await cdp.waitFor(`location.pathname.startsWith('/analysis/')`, 240000).catch(() => null);
  console.log('UPLOAD: finalUrl=', finalUrl ?? 'NONE (timed out waiting for report)');
  if (finalUrl) {
    await cdp.sleep(3000);
    const body = await cdp.text();
    console.log('UPLOAD: report page has "Server Error":', body.includes('Server Error'));
    console.log('UPLOAD: report heading:', await cdp.eval(`document.querySelector('h1')?.textContent || document.title`));
  } else {
    const errBanner = await cdp.eval(`Array.from(document.querySelectorAll('div')).filter(d=>d.className&&String(d.className).includes('crimson')).map(d=>d.textContent.trim().slice(0,150)).filter(Boolean).slice(0,3)`);
    console.log('UPLOAD: error banners:', JSON.stringify(errBanner));
  }
  console.log('UPLOAD: consoleErrors=', JSON.stringify(cdp.consoleErrors()));
}

async function projects(cdp) {
  if (!(await ensureSignedIn(cdp))) {
    console.log('PROJECTS: sign-in failed, aborting');
    return;
  }
  await cdp.goto(APP + '/projects');
  await cdp.sleep(1500);
  const hasProject = await cdp.eval(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent.includes('QA deep test video'))`);
  console.log('PROJECTS: report visible in list:', hasProject);

  // Rename via prompt dialog — set the prompt text BEFORE clicking so the auto-accept handler uses it.
  cdp.setPromptText('QA renamed project');
  await cdp.clickByText('Rename');
  await cdp.sleep(1500);
  const renamed = await cdp.eval(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent.includes('QA renamed project'))`);
  console.log('PROJECTS: rename applied:', renamed);

  // Delete via confirm dialog (auto-accepted).
  await cdp.clickByText('Delete');
  await cdp.sleep(1500);
  const stillThere = await cdp.eval(`Array.from(document.querySelectorAll('h3')).some(h=>h.textContent.includes('QA renamed project'))`);
  console.log('PROJECTS: deleted (still present:', stillThere, ')');
  console.log('PROJECTS: consoleErrors=', JSON.stringify(cdp.consoleErrors()));
}

async function templates(cdp) {
  // Templates needs no auth for its interactions, but the middleware redirects
  // unauthenticated users away — sign in first so the page loads.
  if (!(await ensureSignedIn(cdp))) {
    console.log('TEMPLATES: sign-in failed, aborting');
    return;
  }
  await cdp.goto(APP + '/templates');
  await cdp.sleep(2500);
  const count = await cdp.eval('document.querySelectorAll(".grid .group, .grid > div").length');
  const first3 = await cdp.eval(`Array.from(document.querySelectorAll('h3')).slice(0,3).map(e=>e.textContent)`);
  console.log('TEMPLATES: cards=', count, 'first3=', JSON.stringify(first3));

  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Hooks')?.click()`);
  await cdp.sleep(400);
  const hooksFirst = await cdp.eval(`Array.from(document.querySelectorAll('h3')).slice(0,1).map(e=>e.textContent)`);
  console.log('TEMPLATES: Hooks tab -> first card=', JSON.stringify(hooksFirst));

  await cdp.eval(setInputValue('input[aria-label="Search templates"]', 'curiosity'));
  await cdp.sleep(400);
  const searchResults = await cdp.eval(`Array.from(document.querySelectorAll('h3')).map(e=>e.textContent)`);
  console.log('TEMPLATES: search "curiosity" ->', JSON.stringify(searchResults));

  await cdp.clickByText('Use template');
  await cdp.sleep(600);
  const copied = await cdp.eval(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim().includes('Copied'))`);
  console.log('TEMPLATES: Use template -> shows Copied:', copied);
  console.log('TEMPLATES: consoleErrors=', JSON.stringify(cdp.consoleErrors()));
}

const scenarios = { signin, upload, projects, templates };

const scenarioName = process.argv[2];
if (!scenarios[scenarioName]) {
  console.error('usage: node cdp-harness.mjs <signin|upload|projects|templates>');
  process.exit(1);
}

await waitForChrome();
const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
try {
  await cdp.send('Browser.grantPermissions', { origin: APP, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
} catch { /* older Chrome */ }

try {
  await scenarios[scenarioName](cdp);
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: tab.id }); } catch {}
  try { cdp.ws.close(); } catch {}
}
process.exit(0);
