// Debug project rename: click Rename, fill the prompt, verify the PATCH.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  let dialog = null; let promptText = '';
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Page.javascriptDialogOpening') {
      dialog = m.params;
      console.log('DIALOG:', JSON.stringify(m.params));
      send('Page.handleJavaScriptDialog', { accept: true, promptText }).catch(() => {});
    }
  };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3100/projects' });
  for (let i = 0; i < 60; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await new Promise((x) => setTimeout(x, 250)); }
  await new Promise((r) => setTimeout(r, 3000));

  promptText = 'QA renamed via debug';
  // Click the Rename button via element.click() — reliable for React buttons
  const clicked = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label') || '').includes('Rename') || b.textContent.trim().includes('Rename'));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`);
  console.log('RENAME CLICKED:', clicked);
  await new Promise((r) => setTimeout(r, 2500));
  const state = await evalJs(`({
    titles: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
    dialogs: window.__dialogs || 'n/a'
  })`);
  console.log('AFTER RENAME:', JSON.stringify(state));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
