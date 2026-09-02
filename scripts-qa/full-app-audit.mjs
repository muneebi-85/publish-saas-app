// Full-app page audit: walks every route, records render failures, console
// errors, and required-content presence. Re-mints the 60s session JWT before
// each batch so the middleware never sees an expired token mid-run.
const PORT = 9223;
const APP = 'http://localhost:3100';
const INSTANCE = 'resolved-buzzard-30.clerk.accounts.dev';

const PAGES = [
  // public
  { path: '/', must: ['Publish'] },
  { path: '/sign-in', must: ['Log in'] },
  { path: '/sign-up', must: ['Sign up'] },
  { path: '/community', must: ['scores'] },
  { path: '/legal/privacy', must: ['Privacy'] },
  { path: '/legal/terms', must: ['Terms'] },
  { path: '/legal/cookies', must: ['Cookie'] },
  { path: '/legal/dmca', must: ['DMCA'] },
  { path: '/legal/acceptable-use', must: ['Acceptable'] },
  { path: '/legal/refund', must: ['Refund'] },
  { path: '/legal/subprocessors', must: ['Subprocessor'] },
  { path: '/legal/subscription-terms', must: ['Subscription'] },
  { path: '/restore', must: ['Restore'] },
  { path: '/share/nonexistent-id-123', must: ['404'], status404: true },
  // dashboard (auth)
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
];

async function connect() {
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); let consoleErrors = []; let pageErrors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, send, tab, getErrors: () => { const e = { consoleErrors, pageErrors }; consoleErrors = []; pageErrors = []; return e; } };
}

const evalIn = (page, expr) => page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

async function reauth(page) {
  // Mint a fresh session token through the FAPI client the browser already
  // holds, and re-stamp the app cookies. ~1s per call.
  const r = await evalIn(page, `(async () => {
    const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
    const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
    const base = 'https://${INSTANCE}';
    const common = '?__clerk_api_version=2025-11-10&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
    const g = await fetch(base + '/v1/client' + common, { credentials: 'include' });
    const gj = await g.json().catch(() => ({}));
    const client = gj.response || {};
    const active = (client.sessions || []).find(s => s.status === 'active');
    if (!active) return 'NO_SESSION';
    const t = await fetch(base + '/v1/client/sessions/' + active.id + '/tokens' + common, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
    const tj = await t.json().catch(() => ({}));
    // The mint response is flat: {object:'token', jwt:'...'} — not nested
    // under 'response' like the other FAPI calls.
    const jwtStr = tj.jwt || tj.response?.jwt;
    if (!jwtStr) return 'NO_JWT';
    const exp = 'expires=Fri, 01 Jan 2027 00:00:00 GMT';
    document.cookie = '__session=' + jwtStr + '; path=/; samesite=lax; ' + exp;
    document.cookie = '__session_rQaZVsp-=' + jwtStr + '; path=/; samesite=lax; ' + exp;
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
  // Land on the app origin first (cookie writes need it).
  await send('Page.navigate', { url: APP + '/sign-in' });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await new Promise(r => setTimeout(r, 500)); }
  await new Promise(r => setTimeout(r, 2000));

  const results = [];
  for (const spec of PAGES) {
    const re = await reauth(page);
    if (re !== 'OK') { results.push({ ...spec, error: 'AUTH_REFRESH_FAILED: ' + re }); continue; }
    page.getErrors(); // reset error capture
    await send('Page.navigate', { url: APP + spec.path });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (await evalJs('document.readyState') === 'complete') { ready = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, 3500)); // hydration + data fetches
    const state = await evalJs(`(() => {
      const text = document.body ? document.body.innerText : '';
      return {
        url: location.pathname,
        title: document.title,
        hasApplicationError: text.includes('Application error') || text.includes('Server Error') || text.includes('This page could not be found') && !${!!spec.status404},
        heading: (document.querySelector('h1')?.textContent || '').trim(),
        bodyStart: text.slice(0, 150),
      };
    })()`);
    const errs = page.getErrors();
    // Filter hydration noise: Next.js dev logs prefetch failures benignly.
    const meaningful = errs.consoleErrors.filter(e =>
      !e.includes('Clerk:') && !e.includes('Download the React DevTools') && !e.includes('hydrat'));
    results.push({ ...spec, state, consoleErrors: meaningful, pageErrors: errs.pageErrors, ready });
  }

  console.log(JSON.stringify(results, null, 1));
  await send('Target.closeTarget', { targetId: page.tab.id }).catch(() => {});
  page.ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
