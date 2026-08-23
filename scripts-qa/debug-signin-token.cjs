// Test: navigate to the Clerk sign-in token verify URL and see what cookies land.
const fs = require('fs');
const port = 9223;
async function main() {
  const token = fs.readFileSync(__dirname + '/signin-token.jwt', 'utf8').trim();
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };

  const INSTANCE = 'resolved-buzzard-30.clerk.accounts.dev';
  const url = `https://${INSTANCE}/v1/sign_in_tokens/${token}/verify`;
  console.log('VERIFY URL:', url.slice(0, 100) + '...');
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 8000));
  console.log('FINAL URL:', await evalJs('location.href'));
  console.log('COOKIES:', await evalJs('document.cookie').catch(() => 'err'));
  // Does it redirect back to the app?
  console.log('BODY:', (await evalJs('document.body?.innerText') || '').slice(0, 200));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
