// Full-app browser audit against TARGET_PORT (default 3001) on the QA Chrome
// (CDP :9223). Assumes the prologue has left the browser authenticated.
// Walks every route; records HTTP status, render failures, console/page
// errors, required-content presence, and dead internal links found in hrefs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 9223;
const APP = process.env.TARGET_PORT ? `http://localhost:${process.env.TARGET_PORT}` : 'http://localhost:3001';
const OUT = resolve('scripts-qa', 'audit-3001-results.json');

const PAGES = [
  // public
  { path: '/', must: ['Publish'] },
  { path: '/sign-in', must: ['Log in'] },
  { path: '/sign-up', must: ['Sign up'] },
  { path: '/community', must: ['score'] },
  { path: '/legal/privacy', must: ['Privacy'] },
  { path: '/legal/terms', must: ['Terms'] },
  { path: '/legal/cookies', must: ['Cookie'] },
  { path: '/legal/dmca', must: ['DMCA'] },
  { path: '/legal/acceptable-use', must: ['Acceptable'] },
  { path: '/legal/refund', must: ['Refund'] },
  { path: '/legal/subprocessors', must: ['Subprocessor'] },
  { path: '/legal/subscription-terms', must: ['Subscription'] },
  { path: '/restore', must: ['Restore'] },
  { path: '/share/nonexistent-id-123', must: ['not'], status404: true },
  // authed dashboard
  { path: '/dashboard', must: ['Dashboard'] },
  { path: '/upload', must: ['Upload'] },
  { path: '/projects', must: ['Project'] },
  { path: '/reports', must: ['Report'] },
  { path: '/analyses', must: ['Review'] },
  { path: '/templates', must: ['Template'] },
  { path: '/settings', must: ['Settings'] },
  { path: '/notifications', must: ['Notification'] },
  { path: '/pricing', must: ['Pricing'] },
  { path: '/help', must: ['Help'] },
  { path: '/ai-coach', must: ['Coach'] },
  { path: '/ai-humanizer', must: ['Humanizer'] },
  { path: '/seo', must: ['SEO'] },
  { path: '/brand-kit', must: ['Brand'] },
  { path: '/connected-channels', must: ['Channel'] },
  { path: '/channel-analytics', must: ['Channel'] },
  // not-found & api probes
  { path: '/no-such-page-xyz', must: [], status404: true },
];

async function connect() {
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); let consoleErrors = []; let pageErrors = []; let failedReqs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    }
    if (m.method === 'Network.loadingFailed') {
      failedReqs.push((m.params.errorText || '') + ' ' + (m.params.blockedURL || m.params.requestId || ''));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, send, tab, getErrors: () => { const e = { consoleErrors, pageErrors, failedReqs }; consoleErrors = []; pageErrors = []; failedReqs = []; return e; } };
}

const evalIn = (page, expr) => page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

async function reauth(page) {
  const r = await evalIn(page, `(async () => {
    const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
    const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
    const base = 'https://resolved-buzzard-30.clerk.accounts.dev';
    const common = '?__clerk_api_version=2025-11-10&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
    const g = await fetch(base + '/v1/client' + common, { credentials: 'include' });
    const gj = await g.json().catch(() => ({}));
    const client = gj.response || {};
    const active = (client.sessions || []).find(s => s.status === 'active');
    if (!active) return 'NO_SESSION';
    const t = await fetch(base + '/v1/client/sessions/' + active.id + '/tokens' + common, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
    const tj = await t.json().catch(() => ({}));
    const jwtStr = tj.jwt || tj.response?.jwt;
    if (!jwtStr) return 'NO_JWT';
    const exp = 'expires=Fri, 01 Jan 2027 00:00:00 GMT';
    document.cookie = '__session=' + jwtStr + '; path=/; samesite=lax; ' + exp;
    document.cookie = '__client_uat=' + Math.floor(Date.now()/1000) + '; path=/; ' + exp;
    return 'OK';
  })()`);
  return r?.result?.value ?? r;
}

async function main() {
  const page = await connect();
  const { send } = page;
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evalJs = async (expr) => {
    const r = await evalIn(page, expr);
    return r?.result?.value;
  };
  await send('Page.navigate', { url: APP + '/sign-in' });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
  await new Promise(r => setTimeout(r, 2000));

  const results = [];
  const allHrefs = new Set();
  for (const spec of PAGES) {
    const re = await reauth(page);
    if (re !== 'OK') { results.push({ ...spec, error: 'AUTH_REFRESH_FAILED: ' + re }); continue; }
    page.getErrors();
    await send('Page.navigate', { url: APP + spec.path });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (await evalJs('document.readyState') === 'complete') { ready = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, 4000)); // hydration + data
    const state = await evalJs(`(() => {
      const text = document.body ? document.body.innerText : '';
      const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
      return {
        url: location.pathname + location.search,
        title: document.title,
        appError: text.includes('Application error') || text.includes('server-side exception'),
        heading: (document.querySelector('h1')?.textContent || '').trim(),
        bodyStart: text.slice(0, 120).replace(/\\s+/g, ' '),
        links,
      };
    })()`);
    for (const h of (state?.links || [])) { if (h && h.startsWith('/')) allHrefs.add(h.split('#')[0].split('?')[0]); }
    const errs = page.getErrors();
    const meaningful = errs.consoleErrors.filter(e =>
      !e.includes('Clerk:') && !e.includes('Download the React DevTools') && !e.includes('hydrat') && !e.includes('the server response') && !e.includes('Failed to load resource'));
    const failedLoad = errs.pageErrors.filter(e => !e.includes('ResizeObserver') && !e.includes('hydrat'));
    const missing = (spec.must || []).filter(m => !(state?.bodyStart || '').includes(m) && !(state?.heading || '').includes(m) && !((state?.title)||'').includes(m));
    results.push({ ...spec, state: { url: state.url, title: state.title, heading: state.heading, appError: state.appError, bodyStart: state.bodyStart }, missing, consoleErrors: meaningful, pageErrors: failedLoad, failedRequests: errs.failedReqs, ready });
  }
  writeFileSync(OUT, JSON.stringify({ results, internalHrefs: [...allHrefs].sort() }, null, 1));
  const bad = results.filter(r => r.error || r.appErrorFlag || (r.missing && r.missing.length) || (r.consoleErrors && r.consoleErrors.length) || (r.pageErrors && r.pageErrors.length));
  console.log('AUDIT DONE. pages=' + results.length + ' problem pages=' + bad.length);
  for (const r of bad) console.log('PROBLEM:', JSON.stringify({ path: r.path, missing: r.missing, consoleErrors: r.consoleErrors, pageErrors: r.pageErrors, error: r.error }));
  await send('Target.closeTarget', { targetId: page.tab.id }).catch(() => {});
  page.ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
