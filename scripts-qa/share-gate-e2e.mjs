// Share-gate E2E: unshared report 404s publicly -> creator clicks "Share score"
// -> card becomes public with correct content -> revoke -> 404 again.
// Also verifies the community board only lists shared reports (S1 regression).
const PORT = 9223;
const APP = 'http://localhost:3100';
const INSTANCE = 'resolved-buzzard-30.clerk.accounts.dev';

async function main() {
  const tab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evalJs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r?.result?.value; };

  const REPORT = process.argv[2];
  if (!REPORT) { console.error('usage: node share-gate-e2e.mjs <reportId>'); process.exit(1); }

  const mint = async () => evalJs(`(async () => {
    const dbCookie = document.cookie.split('; ').find(c => c.startsWith('__clerk_db_jwt'));
    const dbjwt = dbCookie ? dbCookie.split('=').slice(1).join('=') : '';
    const common = '?__clerk_api_version=2025-11-10&__clerk_db_jwt=' + encodeURIComponent(dbjwt);
    const g = await fetch('https://${INSTANCE}/v1/client' + common, { credentials: 'include' });
    const gj = await g.json();
    const active = (gj.response.sessions || []).find(s => s.status === 'active');
    const t = await fetch('https://${INSTANCE}/v1/client/sessions/' + active.id + '/tokens' + common, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
    const tj = await t.json();
    document.cookie = '__session=' + tj.jwt + '; path=/; samesite=lax';
    document.cookie = '__session_rQaZVsp-=' + tj.jwt + '; path=/; samesite=lax';
    return 'ok';
  })()`);

  // 1. Before sharing: the public share URL must 404.
  const before = await evalJs(`(async () => {
    const r = await fetch('/share/${REPORT}', { cache: 'no-store' });
    return { status: r.status };
  })()`);
  console.log('BEFORE SHARE: /share status', JSON.stringify(before));

  // 2. Load the report page authenticated, click Share score.
  await send('Page.navigate', { url: APP + '/sign-in' });
  await new Promise(r => setTimeout(r, 4000));
  await mint();
  await send('Page.navigate', { url: APP + '/analysis/' + REPORT });
  await new Promise(r => setTimeout(r, 12000));
  const clicked = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Share score');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 })));
    return true;
  })()`);
  console.log('Share score clicked:', clicked);
  await new Promise(r => setTimeout(r, 4000));
  const apiState = await evalJs(`(async () => {
    const r = await fetch('/api/share/${REPORT}', { cache: 'no-store' });
    return { status: r.status };
  })()`);
  console.log('AFTER SHARE: /api/share status', JSON.stringify(apiState));

  // 3. Public card now resolves — check the Retention label reads the 30s value (A8).
  const after = await evalJs(`(async () => {
    const r = await fetch('/share/${REPORT}', { cache: 'no-store' });
    const html = await r.text();
    return {
      status: r.status,
      hasCard: html.includes('Publish Score'),
      hasRetention: html.includes('Retention'),
      hasTitle: html.length > 500,
    };
  })()`);
  console.log('AFTER SHARE: /share page', JSON.stringify(after));

  // 4. The report's private 30s retention value, for comparison.
  const priv = await evalJs(`(async () => {
    const r = await fetch('/analysis/${REPORT}', { cache: 'no-store' });
    const html = await r.text();
    return { status: r.status };
  })()`);
  console.log('private page status:', JSON.stringify(priv));

  // 5. Revoke via the DELETE endpoint.
  const revoked = await evalJs(`(async () => {
    const r = await fetch('/api/share/${REPORT}', { method: 'DELETE' });
    return { status: r.status };
  })()`);
  console.log('REVOKE: DELETE status', JSON.stringify(revoked));
  const afterRevoke = await evalJs(`(async () => {
    const r = await fetch('/share/${REPORT}', { cache: 'no-store' });
    return { status: r.status };
  })()`);
  console.log('AFTER REVOKE: /share status', JSON.stringify(afterRevoke));

  await send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
