// Test the SEO Studio and Script Optimizer (AI Humanizer) flows with real AI.
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
      const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return false;
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    })()`);
    return !!r;
  };
  const pollResult = async (findFn, label) => {
    for (let i = 0; i < 50; i++) {
      await sleep(3000);
      const r = await evalJs(findFn);
      if (r) { console.log(`  ${label}: DONE after ~${(i + 1) * 3}s`); return r; }
    }
    console.log(`  ${label}: TIMEOUT`);
    return null;
  };

  await send('Page.enable'); await send('Runtime.enable');

  // ── SEO Studio ──
  console.log('=== SEO Studio ===');
  await goto('/seo');
  const seoInputs = await evalJs(`Array.from(document.querySelectorAll('input, textarea')).map((i, idx) => ({ idx, ph: i.getAttribute('aria-label') || i.placeholder || '', tag: i.tagName }))`);
  console.log('  inputs:', JSON.stringify(seoInputs));
  // Fill the title input (first input with aria-label "Paste the exact title...")
  await fillSel('input[aria-label="Paste the exact title you plan to publish"], input[placeholder*="title"]', '10 Secret Study Tips That Actually Work in 2026');
  const buttons = await evalJs(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 12)`);
  console.log('  buttons:', JSON.stringify(buttons));
  await clickBtn('Analyze');
  const seoResult = await pollResult(`(() => {
    const t = document.body.innerText;
    if (t.includes('Analysis failed')) return 'ERROR: ' + t.slice(t.indexOf('Analysis failed'), t.indexOf('Analysis failed') + 150);
    return /Optimized titles|SEO score/.test(t) ? 'found' : null;
  })()`, 'SEO analyze');
  if (seoResult && seoResult !== 'found') console.log('  SEO issue:', seoResult);
  if (seoResult === 'found') {
    const body = (await evalJs('document.body.innerText')) || '';
    const scores = ['SEO score', 'Keyword strength', 'CPM potential', 'CTR prediction']
      .map((l) => (body.includes(l) ? l + ': yes' : l + ': MISSING'));
    console.log('  SEO sections:', JSON.stringify(scores));
    const ti = body.indexOf('Optimized titles');
    console.log('  SEO optimized titles sample:', JSON.stringify((ti >= 0 ? body.slice(ti, ti + 200) : 'MISSING').replace(/\n/g, ' ')));
  }

  // ── Script Optimizer ──
  console.log('=== Script Optimizer ===');
  await goto('/ai-humanizer');
  const script = `Hey everyone welcome back to the channel. Today I am going to show you how to grow your channel with consistent uploads. Remember to like and subscribe and hit the bell icon so you never miss an upload.`;
  const ta = await evalJs(`(() => {
    const t = document.querySelector('textarea');
    if (!t) return null;
    t.setAttribute('data-qa-ta', '1');
    return true;
  })()`);
  if (ta) {
    await fillSel('textarea[data-qa-ta]', script);
    const btns = await evalJs(`Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 12)`);
    console.log('  buttons:', JSON.stringify(btns));
    await clickBtn('Optimize');
    const humanResult = await pollResult(`(() => {
      const t = document.body.innerText;
      if (t.includes('Something went wrong') || t.includes('Optimization failed')) return 'ERROR';
      // "Rewrite changes" only renders after a successful /api/optimize response.
      if (t.includes('Rewrite changes') && t.includes('Est. AI risk')) return 'found';
      return null;
    })()`, 'Humanize');
    if (humanResult === 'found') {
      const body = (await evalJs('document.body.innerText')) || '';
      const oi = body.indexOf('Optimized rewrite');
      const ci = body.indexOf('Rewrite changes');
      console.log('  humanizer output sample:', JSON.stringify(body.slice(oi, oi + 250).replace(/\n/g, ' ')));
      console.log('  humanizer changes sample:', JSON.stringify(body.slice(ci, ci + 200).replace(/\n/g, ' ')));
    } else {
      console.log('  humanizer result:', humanResult, '(not found — possible failure)');
      const tail = (await evalJs('document.body.innerText')) || '';
      console.log('  body tail:', tail.slice(-250).replace(/\n/g, ' '));
    }
  } else {
    console.log('  NO TEXTAREA');
  }

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
