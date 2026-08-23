// Investigate specific QA flags found during the report-only sweep.
const port = 9223;
async function main() {
  const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (path, wait = 3500) => {
    await send('Page.navigate', { url: 'http://localhost:3100' + path });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(wait);
  };

  await send('Page.enable'); await send('Runtime.enable');

  // ── Humanizer page structure ──
  console.log('=== AI Humanizer page ===');
  await goto('/ai-humanizer');
  const hu = await evalJs(`({
    wall: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Upgrade to')),
    inputs: Array.from(document.querySelectorAll('input, textarea, [contenteditable]')).map(i => i.tagName + ':' + (i.getAttribute('aria-label') || i.placeholder || i.getAttribute('data-placeholder') || '') ),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 10),
    body: document.body.innerText.slice(0, 400).replace(/\\n/g, ' | ')
  })`);
  console.log('  wall:', hu.wall);
  console.log('  inputs:', JSON.stringify(hu.inputs));
  console.log('  buttons:', JSON.stringify(hu.buttons));
  console.log('  body:', hu.body);

  // ── Templates copy button exact text ──
  console.log('=== Templates copy ===');
  await goto('/templates');
  const tmpl = await evalJs(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 15)`);
  console.log('  buttons:', JSON.stringify(tmpl));
  const useBtn = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => /Use template|Use|Copy/.test(b.textContent.trim()));
    return b ? { text: b.textContent.trim(), cls: b.className.slice(0, 80) } : null;
  })()`);
  console.log('  use-template button:', JSON.stringify(useBtn));
  if (useBtn) {
    await evalJs(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => /Use template|Use|Copy/.test(b.textContent.trim()));
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    })()`);
    await sleep(1500);
    const after = await evalJs(`({
      copied: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Copied')),
      clipboardErr: Array.from(document.querySelectorAll('[role="alert"], .sonner, [data-sonner-toast]')).map(e => e.textContent.trim().slice(0, 120)).filter(Boolean).slice(0, 3)
    })`);
    console.log('  after click:', JSON.stringify(after));
  }

  // ── Projects rename ──
  console.log('=== Projects rename ===');
  await goto('/projects');
  const proj = await evalJs(`({
    cards: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 12),
    hasPrompt: !!window.prompt,
    links: Array.from(document.querySelectorAll('a')).map(a => a.textContent.trim()).filter(Boolean).slice(0, 8)
  })`);
  console.log('  cards:', JSON.stringify(proj.cards));
  console.log('  buttons:', JSON.stringify(proj.buttons));
  console.log('  links:', JSON.stringify(proj.links));

  // ── Notifications mark-all ──
  console.log('=== Notifications ===');
  await goto('/notifications');
  const notif = await evalJs(`({
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 10),
    body: document.body.innerText.slice(0, 300).replace(/\\n/g, ' | ')
  })`);
  console.log('  buttons:', JSON.stringify(notif.buttons));
  console.log('  body:', notif.body);

  // ── OG image route ──
  console.log('=== OG image ===');
  const og = await evalJs(`(async () => {
    try {
      const r = await fetch('/share/cmssrong50007xz2k18o3fhpv/opengraph-image');
      const t = await r.text();
      return { status: r.status, ct: r.headers.get('content-type'), len: t.length, head: t.slice(0, 60) };
    } catch (e) { return { err: String(e) }; }
  })()`);
  console.log('  og:', JSON.stringify(og));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
