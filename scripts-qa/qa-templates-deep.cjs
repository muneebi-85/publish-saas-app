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
  const goto = async (path) => {
    await send('Page.navigate', { url: `${BOOT}/?to=${path}` });
    for (let i = 0; i < 80; i++) { const r = await evalJs('document.readyState'); if (r === 'complete') break; await sleep(250); }
    await sleep(3000);
  };
  await send('Page.enable'); await send('Runtime.enable');

  await goto('/templates');
  const state = await evalJs(`({
    h1: document.querySelector('h1')?.textContent?.trim(),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().replace(/\\s+/g,' ')).filter(Boolean),
    links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent.trim().replace(/\\s+/g,' ').slice(0,40), href: a.href.slice(0,80) })).slice(0,10),
    cards: document.querySelectorAll('.group, [class*="card"]').length,
    h3s: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()).slice(0,6)
  })`);
  console.log('TEMPLATES STATE:', JSON.stringify(state, null, 1));

  // what are the card structures? look for any button inside cards
  const cardBtns = await evalJs(`Array.from(document.querySelectorAll('.group button, [class*="card"] button')).map(b => b.textContent.trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,10)`);
  console.log('CARD BUTTONS:', JSON.stringify(cardBtns));

  // search for something that exists - 'stakes' from Cold-open stakes
  await evalJs(`(() => {
    const i = document.querySelector('input[aria-label="Search templates"]');
    if (!i) return false;
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, 'stakes');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(800);
  const searchState = await evalJs(`({
    h3s: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()).slice(0,6),
    empty: document.body.innerText.includes('No templates match'),
    body: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
  })`);
  console.log('AFTER SEARCH "stakes":', JSON.stringify(searchState));

  // clear search and look for a template card with a button/action
  await evalJs(`(() => {
    const i = document.querySelector('input[aria-label="Search templates"]');
    if (!i) return false;
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, '');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(800);
  // full HTML of first card region
  const cardHTML = await evalJs(`Array.from(document.querySelectorAll('.group, [class*="card"]')).slice(0,2).map(c => c.outerHTML.slice(0, 800))`);
  console.log('CARD HTML:', JSON.stringify(cardHTML));

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
