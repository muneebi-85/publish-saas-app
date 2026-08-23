// Functional tests: brand kit, connected channels, restore page, public pages.
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
  const goto = async (path) => {
    await send('Page.navigate', { url: 'http://localhost:3100' + path });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
  };
  const fillSel = async (sel, val) => {
    await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(val)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  };
  const clickBtn = async (text) => {
    const r = await evalJs(`(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return false;
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    })()`);
    return !!r;
  };

  await send('Page.enable'); await send('Runtime.enable');

  // ── Brand Kit ──
  console.log('=== Brand Kit ===');
  await goto('/brand-kit');
  const bk = await evalJs(`({
    inputs: Array.from(document.querySelectorAll('input, textarea')).length,
    saveBtn: Array.from(document.querySelectorAll('button')).some(b => /Save|Update/.test(b.textContent.trim())),
    body: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
  })`);
  console.log('  brand kit:', JSON.stringify(bk));
  if (bk.inputs > 0) {
    const firstInput = await evalJs(`(() => {
      const els = Array.from(document.querySelectorAll('input, textarea'));
      const target = els.find(e => (e.getAttribute('aria-label') || e.placeholder || '').toLowerCase().includes('tone')) || els[0];
      target.setAttribute('data-qa-bk', '1');
      return true;
    })()`);
    if (firstInput) {
      await fillSel('[data-qa-bk]', 'QA test tone value');
      await sleep(300);
      await clickBtn(/Save/.test(bk.saveBtn.toString()) ? 'Save' : 'Save changes');
      await sleep(2000);
      const saved = await evalJs(`document.body.innerText.includes('saved') || document.body.innerText.includes('Saved')`);
      console.log('  brand kit save ->', saved);
    }
  }

  // ── Connected Channels ──
  console.log('=== Connected Channels ===');
  await goto('/connected-channels');
  const cc = await evalJs(`({
    hasConnect: Array.from(document.querySelectorAll('button, a')).some(b => /Connect/.test(b.textContent.trim())),
    hasYoutube: document.body.innerText.includes('YouTube'),
    body: document.body.innerText.slice(0, 250).replace(/\\n/g, ' ')
  })`);
  console.log('  connected channels:', JSON.stringify(cc));

  // ── Restore page (public) ──
  console.log('=== Restore ===');
  await goto('/restore');
  const restore = await evalJs(`({
    hasInput: document.querySelectorAll('input').length > 0,
    hasEmail: !!document.querySelector('input[type="email"], input[name="email"]'),
    body: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
  })`);
  console.log('  restore:', JSON.stringify(restore));

  // ── Public pages ──
  console.log('=== Public pages ===');
  for (const p of ['/', '/pricing', '/legal/terms', '/legal/privacy', '/help', '/sign-in', '/sign-up']) {
    await goto(p);
    const state = await evalJs(`({
      err: document.body.innerText.includes('Server Error') || document.body.innerText.includes('Internal Server Error'),
      h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 60) || null,
      len: document.body.innerText.length
    })`);
    console.log(`  ${p}: err=${state.err} h1=${JSON.stringify(state.h1)} len=${state.len}`);
  }

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
