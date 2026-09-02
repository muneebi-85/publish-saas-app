// Responsive + a11y probes that avoid shell-escaping issues: written as a file.
const PROBE = `(function () {
  var doc = document.documentElement;
  var overflowX = document.body.scrollWidth > doc.clientWidth + 2;
  // Elements carrying Tailwind md: variants, matched by substring since the
  // class attribute holds many classes (querying ".md\\:hidden" fails through
  // nested eval escaping; iterating classLists does not).
  var mdHiddenVisible = 0, mdFlexVisible = 0, mdBlockVisible = 0;
  document.querySelectorAll('*').forEach(function (el) {
    var cls = (el.getAttribute('class') || '');
    if (!cls.includes('md:')) return;
    var disp = getComputedStyle(el).display;
    if (cls.split(' ').some(function (c) { return c.startsWith('md:hidden'); }) && disp !== 'none') mdHiddenVisible++;
    if (cls.split(' ').some(function (c) { return c.startsWith('md:flex'); }) && disp !== 'none') mdFlexVisible++;
    if (cls.split(' ').some(function (c) { return c.startsWith('md:block'); }) && disp !== 'none') mdBlockVisible++;
  });
  var h1s = document.querySelectorAll('h1').length;
  return JSON.stringify({ overflowX: overflowX, clientW: doc.clientWidth, scrollW: document.body.scrollWidth, mdHiddenVisible: mdHiddenVisible, mdFlexVisible: mdFlexVisible, mdBlockVisible: mdBlockVisible, h1Count: h1s });
})()`;

const TAB = require('./scripts-qa/.cdp-tab.json').id;

async function main() {
  const list = await (await fetch('http://localhost:9223/json')).json();
  const t = list.find((x) => x.id === TAB) || list.find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (m, p = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
  await send('Runtime.enable'); await send('Page.enable');
  const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;

  const PAGES = ['/dashboard', '/upload', '/projects', '/reports', '/settings', '/pricing'];
  for (const [w, label] of [[375, 'mobile'], [768, 'tablet'], [1280, 'desktop']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
    for (const path of PAGES) {
      await send('Page.navigate', { url: 'http://localhost:3001' + path });
      await new Promise((r) => setTimeout(r, 3500));
      const res = await evalJs(PROBE);
      let out;
      try { out = JSON.parse(res); } catch { out = { raw: String(res).slice(0, 120) }; }
      const flag = out.overflowX ? ' <-- OVERFLOW' : '';
      console.log(`${label} ${w}px ${path}: overflow=${out.overflowX}${flag} mdHiddenVis=${out.mdHiddenVisible} mdFlexVis=${out.mdFlexVisible} h1=${out.h1Count}`);
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
