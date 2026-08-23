// Test the plan-gated features (AI Coach, SEO, Script Optimizer) with a paid
// plan active, and exercise their real AI calls end to end.
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
  const clickByText = async (text) => {
    const rect = await evalJs(`(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    })()`);
    return !!rect;
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

  await send('Page.enable'); await send('Runtime.enable');

  // ── AI Coach ──
  await goto('/ai-coach');
  let state = await evalJs(`({
    wall: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Upgrade to')),
    prompts: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.includes('Rewrite titles') || t.includes('Analyze my first')),
    input: !!document.querySelector('input[aria-label="Message the AI Coach"]')
  })`);
  console.log('AI-COACH gated?', state.wall, '| prompts:', JSON.stringify(state.prompts), '| input:', state.input);

  if (!state.wall && state.input) {
    await fillSel('input[aria-label="Message the AI Coach"]', 'How can I improve my first 10 seconds?');
    await clickByText('Send');
    // Poll for the reply (NVIDIA reasoning calls take ~30s)
    let reply = 'still thinking';
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const r = await evalJs(`(() => {
        const t = document.body.innerText;
        if (t.includes('Something went wrong reaching the coach')) return 'ERROR';
        if (t.includes('Thinking…')) return 'thinking';
        return 'reply';
      })()`);
      if (r === 'reply' || r === 'ERROR') { reply = r; break; }
      reply = r;
    }
    console.log('AI-COACH reply state:', reply);
    const coachBody = await evalJs(`document.body.innerText.slice(-400).replace(/\n/g, ' ')`);
    console.log('AI-COACH tail:', coachBody.slice(-250));
  }

  // ── SEO Studio ──
  await goto('/seo');
  state = await evalJs(`({
    wall: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Upgrade to')),
    inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => (i.getAttribute('aria-label') || i.placeholder || '')).filter(Boolean).slice(0, 4)
  })`);
  console.log('SEO gated?', state.wall, '| inputs:', JSON.stringify(state.inputs));

  // ── Script Optimizer (AI Humanizer) ──
  await goto('/ai-humanizer');
  state = await evalJs(`({
    wall: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().includes('Upgrade to')),
    textareas: document.querySelectorAll('textarea').length
  })`);
  console.log('HUMANIZER gated?', state.wall, '| textareas:', state.textareas);

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
