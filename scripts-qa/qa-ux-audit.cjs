// Programmatic UX audit — checks real DOM states for common UI problems.
const port = 9223;
const BOOT = 'http://localhost:3456';
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
  const goto = async (path, w = 1440, h = 900) => {
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
  };
  const audit = async (path, width, height) => {
    await goto(path, width, height);
    const r = await evalJs(`(() => {
      const out = { path: location.pathname, issues: [] };
      // horizontal overflow
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      if (docW > winW + 4) out.issues.push('HORIZONTAL_OVERFLOW scrollW=' + docW + ' winW=' + winW);
      // unlabeled icon buttons
      const unlabeled = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.textContent || '').trim();
        const aria = b.getAttribute('aria-label') || b.getAttribute('title') || '';
        return !t && !aria;
      }).length;
      if (unlabeled) out.issues.push('unlabeled icon buttons: ' + unlabeled);
      // empty links
      const emptyLinks = Array.from(document.querySelectorAll('a')).filter(a => !(a.textContent || '').trim() && !a.getAttribute('aria-label')).length;
      if (emptyLinks) out.issues.push('empty links: ' + emptyLinks);
      // images without alt
      const noAlt = Array.from(document.querySelectorAll('img')).filter(i => !i.hasAttribute('alt')).length;
      if (noAlt) out.issues.push('images without alt: ' + noAlt);
      // contrast check on common text (sample): find text elements with very low effective contrast
      // truncated text (line-clamp hidden)
      const overflowed = Array.from(document.querySelectorAll('*')).filter(el => {
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 50 && getComputedStyle(el).overflow !== 'hidden') return true;
        return false;
      }).length;
      if (overflowed > 3) out.issues.push('elements with clipped content: ' + overflowed);
      // empty buttons (no text)
      const emptyBtns = Array.from(document.querySelectorAll('button')).filter(b => !(b.textContent || '').trim() && !b.querySelector('svg')).length;
      if (emptyBtns) out.issues.push('fully empty buttons: ' + emptyBtns);
      // input without label or aria
      const unlabeledInputs = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select')).filter(i => {
        const id = i.id;
        const lbl = id ? document.querySelector('label[for="' + id + '"]') : null;
        return !lbl && !i.getAttribute('aria-label') && !i.getAttribute('placeholder') && !i.getAttribute('name');
      }).length;
      if (unlabeledInputs) out.issues.push('unlabeled inputs: ' + unlabeledInputs);
      out.bodyLen = document.body.innerText.length;
      out.h1 = document.querySelector('h1')?.textContent?.trim()?.slice(0, 60) || null;
      return out;
    })()`);
    console.log(`\n[${path} @${width}x${height}]` + (r.h1 ? ' h1=' + r.h1 : ''));
    if (r.issues.length) r.issues.forEach(i => console.log('  ⚠ ' + i));
    else console.log('  ✓ no issues');
    return r;
  };

  await send('Page.enable'); await send('Runtime.enable');
  const pages = [
    '/dashboard', '/upload', '/projects', '/analyses', '/analysis/cmst0cw4300066qbi8f3yux8q',
    '/templates', '/pricing', '/ai-coach', '/ai-humanizer', '/seo', '/brand-kit',
    '/connected-channels', '/channel-analytics', '/reports', '/notifications', '/settings', '/help',
  ];
  for (const p of pages) await audit(p, 1440, 900);
  console.log('\n--- MOBILE (390px) ---');
  for (const p of ['/dashboard', '/upload', '/projects', '/pricing', '/analysis/cmst0cw4300066qbi8f3yux8q', '/templates']) {
    await audit(p, 390, 844);
  }
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
