// Reusable CDP driver: keeps ONE tab alive across invocations (tab id persisted
// to scripts-qa/.cdp-tab.json) so interactive journeys continue in the same
// page context. Usage:
//   node scripts-qa/cdp-repl.mjs goto <url>
//   node scripts-qa/cdp-repl.mjs eval "<js expression>"
//   node scripts-qa/cdp-repl.mjs click <selector>
//   node scripts-qa/cdp-repl.mjs fill <selector> <text>
//   node scripts-qa/cdp-repl.mjs screenshot <path>
//   node scripts-qa/cdp-repl.mjs text
//   node scripts-qa/cdp-repl.mjs console
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 9223;
const TABFILE = resolve('scripts-qa/.cdp-tab.json');

async function getTab() {
  if (existsSync(TABFILE)) {
    try {
      const saved = JSON.parse(readFileSync(TABFILE, 'utf-8'));
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const t = list.find((x) => x.id === saved.id && x.type === 'page');
      if (t) return t;
    } catch {}
  }
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  writeFileSync(TABFILE, JSON.stringify({ id: tab.id }));
  return tab;
}

const [,, cmd, ...args] = process.argv;
const PROMPT_TEXT = process.env.QA_PROMPT_TEXT || '';
let promptResponse = PROMPT_TEXT;
if (cmd === 'confirm') { promptResponse = 'ACCEPT'; }
const tab = await getTab();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const consoleBuf = []; let dialogSeen = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Page.javascriptDialogOpening') {
    dialogSeen = m.params;
    // Auto-respond so the renderer never blocks: 'confirm'/'delete' command
    // accepts; anything else accepts with the QA_PROMPT_TEXT response.
    const accept = cmd === 'cancel' ? false : true;
    ws.send(JSON.stringify({ id: 999999 - ++id, method: 'Page.handleJavaScriptDialog', params: { accept, promptText: promptResponse } }));
    consoleBuf.push('DIALOG[' + m.params.type + ']: ' + (m.params.message || '').slice(0, 120) + ' -> ' + (accept ? (m.params.type === 'prompt' ? JSON.stringify(promptResponse) : 'accept') : 'dismiss'));
  }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    consoleBuf.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 250));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleBuf.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 250));
  }
};
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return 'EXCEPTION: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400);
  return r?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

const APP = process.env.TARGET_PORT ? `http://localhost:${process.env.TARGET_PORT}` : 'http://localhost:3001';
try {
  if (cmd === 'goto') {
    const url = args[0].startsWith('http') ? args[0] : APP + args[0];
    const prevPath = await evalJs('location.pathname');
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 800)); // let the old document go away first
    for (let i = 0; i < 90; i++) {
      const st = await evalJs('document.readyState + "|" + location.pathname');
      if (st === 'complete|' + new URL(url).pathname || (st.startsWith('complete|') && (i > 20 || st.split('|')[1] !== prevPath))) break;
      await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, parseInt(args[1] || '2500')));
    console.log('URL:', await evalJs('location.pathname + location.search'), '| H1:', await evalJs('(document.querySelector("h1")?.textContent||"").trim()'));
  } else if (cmd === 'eval') {
    console.log(await evalJs(args[0]));
  } else if (cmd === 'click') {
    console.log(await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(args[0])});
      if (!el) return 'NOT_FOUND';
      el.scrollIntoView({ block: 'center' });
      el.click();
      return 'CLICKED ' + (el.textContent || '').trim().slice(0, 60);
    })()`));
    await new Promise(r => setTimeout(r, parseInt(args[1] || '1500')));
  } else if (cmd === 'fill') {
    console.log(await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(args[0])});
      if (!el) return 'NOT_FOUND';
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
      setter ? setter.call(el, ${JSON.stringify(args[1])}) : el.value = ${JSON.stringify(args[1])};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'FILLED';
    })()`));
  } else if (cmd === 'type') {
    console.log(await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(args[0])});
      if (!el) return 'NOT_FOUND';
      el.focus();
      return document.activeElement === el ? 'FOCUSED' : 'FOCUS_FAILED';
    })()`));
    await send('Input.insertText', { text: args[1] });
    console.log('TYPED');
  } else if (cmd === 'screenshot') {
    await send('Page.captureScreenshot', { format: 'png' }).then(r => {
      writeFileSync(args[0], Buffer.from(r.data, 'base64'));
      console.log('SAVED', args[0]);
    });
  } else if (cmd === 'text') {
    console.log((await evalJs('document.body.innerText') || '').slice(0, parseInt(args[0] || '4000')));
  } else if (cmd === 'console') {
    console.log(consoleBuf.length ? consoleBuf.join('\n') : '(no console errors/warnings)');
  } else if (cmd === 'html') {
    console.log((await evalJs(`document.querySelector(${JSON.stringify(args[0])})?.outerHTML`) || 'NOT_FOUND').slice(0, 4000));
  } else if (cmd === 'refresh-auth') {
    console.log(await evalJs(`(async () => {
      const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
      const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
      const base = 'https://resolved-buzzard-30.clerk.accounts.dev';
      const common = '?__clerk_api_version=2025-11-10&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
      const g = await fetch(base + '/v1/client' + common, { credentials: 'include' });
      const gj = await g.json().catch(() => ({}));
      const active = ((gj.response||{}).sessions||[]).find(s => s.status === 'active');
      if (!active) return 'NO_SESSION';
      const t = await fetch(base + '/v1/client/sessions/' + active.id + '/tokens' + common, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
      const tj = await t.json().catch(() => ({}));
      const jwtStr = tj.jwt || tj.response?.jwt;
      if (!jwtStr) return 'NO_JWT';
      const exp = 'expires=Fri, 01 Jan 2027 00:00:00 GMT';
      document.cookie = '__session=' + jwtStr + '; path=/; samesite=lax; ' + exp;
      document.cookie = '__client_uat=' + Math.floor(Date.now()/1000) + '; path=/; ' + exp;
      return 'OK';
    })()`));
  } else if (cmd === 'api') {
    console.log(await evalJs(`(async () => {
      const r = await fetch(${JSON.stringify(args[0])}, { method: ${JSON.stringify(args[1] || 'GET')}, headers: args[2] ? { 'Content-Type': 'application/json' } : undefined, body: args[2] || undefined, cache: 'no-store' });
      return r.status + ' ' + (await r.text()).slice(0, 400);
    })()`));
  } else {
    console.log('unknown cmd', cmd);
  }
} catch (e) {
  console.error('ERR:', e.message);
}
ws.close(); process.exit(0);
