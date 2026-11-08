// Drives the running app through Chrome DevTools (WebView debugging is on in debug builds).
// Uses raw DevTools messages so no extra packages are needed (Node 22 has fetch + WebSocket built in).
const { execSync } = require('child_process');

const sh = cmd => execSync(cmd, { encoding: 'utf8' });
const holdingScreen = () =>
  (sh('adb shell dumpsys window').split('\n').find(l => l.includes('mHoldingScreenWindow')) || '(no mHoldingScreenWindow line)').trim();
let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  if (!ok) failed = true;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const targets = await (await fetch('http://localhost:9222/json')).json();
  const target = targets.find(t => t.type === 'page');
  console.log('target:', target && target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const evaluate = expression => new Promise(resolve => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  }).then(d => {
    if (d.result.exceptionDetails) throw new Error(JSON.stringify(d.result.exceptionDetails));
    return d.result.result.value;
  });

  check('running inside Capacitor', await evaluate('!!(window.Capacitor && window.Capacitor.isNativePlatform())'));
  check('KeepAwake plugin visible to the page', await evaluate('!!(window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAwake)'));
  check('service worker NOT registered', (await evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')) === 0);

  const fonts = await evaluate('document.fonts.ready.then(() => [...document.fonts].map(f => f.family + ":" + f.status))');
  check('bundled fonts loaded', fonts.length >= 2 && fonts.every(f => f.endsWith(':loaded')), JSON.stringify(fonts));

  console.log('layout:', JSON.stringify(await evaluate(`(() => {
    const r = document.getElementById('control-panel').getBoundingClientRect();
    return { innerWidth, innerHeight, panelTop: Math.round(r.top), panelBottom: Math.round(r.bottom),
             safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') };
  })()`)));

  const before = holdingScreen();
  console.log('before start ->', before);
  check('screen not held before session', !before.includes('com.zenpacer.app'));

  await evaluate("document.getElementById('start-btn').click()");
  await sleep(3000);
  check('session started', (await evaluate("document.getElementById('instruction').textContent.trim()")) === 'Inhale');
  const during = holdingScreen();
  console.log('during session ->', during);
  check('screen held awake during session', during.includes('com.zenpacer.app'));

  await evaluate("document.getElementById('quick-pause-btn').click()");
  await sleep(1500);
  const after = holdingScreen();
  console.log('after pause ->', after);
  check('screen released after pause', !after.includes('com.zenpacer.app'));

  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL: smoke test crashed:', e); process.exit(1); });
