// Drives the running app through Chrome DevTools (WebView debugging is on in debug builds).
// Uses raw DevTools messages so no extra packages are needed (Node 22 has fetch + WebSocket built in).
//
// Note: Chrome keeps the screen awake while DevTools is attached, so every action below
// connects, does its thing, and disconnects BEFORE we look at whether the screen is held awake.
const { execSync } = require('child_process');

const sh = cmd => execSync(cmd, { encoding: 'utf8' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  if (!ok) failed = true;
};

// Is the app keeping the screen on? Android reports it two ways; look at both.
const screenHold = () => {
  const win = sh('adb shell dumpsys window').split('\n')
    .filter(l => /mHoldScreenWindow/.test(l)).map(l => l.trim());
  const power = sh('adb shell dumpsys power').split('\n')
    .filter(l => /WAKE_LOCK/.test(l) && /WindowManager/.test(l)).map(l => l.trim());
  return { win, power, held: win.some(l => l.includes('com.zenpacer.app')) || power.some(l => l.includes('com.zenpacer.app')) };
};

async function withPage(fn) {
  const targets = await (await fetch('http://localhost:9222/json')).json();
  const target = targets.find(t => t.type === 'page');
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
  try { return await fn(evaluate, target); } finally { ws.close(); await sleep(2500); }
}

(async () => {
  // Nothing attached yet: the screen should not be held.
  const baseline = screenHold();
  console.log('baseline ->', JSON.stringify(baseline));
  check('screen not held when idle', !baseline.held);

  await withPage(async (evaluate, target) => {
    console.log('target:', target.url);
    check('running inside Capacitor', await evaluate('!!(window.Capacitor && window.Capacitor.isNativePlatform())'));
    check('KeepAwake plugin visible to the page', await evaluate('!!(window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAwake)'));
    check('service worker NOT registered', (await evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')) === 0);
    console.log('layout:', JSON.stringify(await evaluate(`(() => {
      const r = document.getElementById('control-panel').getBoundingClientRect();
      return { innerWidth, innerHeight, panelTop: Math.round(r.top), panelBottom: Math.round(r.bottom) };
    })()`)));
    const light = await evaluate("({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor })");
    check('light mode by default', !light.dark && light.bg === 'rgb(255, 255, 255)', JSON.stringify(light));
  });

  // Flip the phone to dark mode; the app should follow.
  sh('adb shell cmd uimode night yes');
  await sleep(3000);
  await withPage(async evaluate => {
    const dark = await evaluate("({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor })");
    check('follows phone dark mode', dark.dark && dark.bg === 'rgb(18, 18, 18)', JSON.stringify(dark));
  });
  sh('adb shell cmd uimode night no');
  await sleep(3000);

  // Start a session, then detach and see whether the screen is held awake.
  await withPage(async evaluate => {
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(1500);
    check('session started', (await evaluate("document.getElementById('instruction').textContent.trim()")) === 'Inhale');
  });
  const during = screenHold();
  console.log('during session ->', JSON.stringify(during));
  check('screen held awake during session', during.held);

  // Pause, detach, and the screen should be released.
  await withPage(async evaluate => {
    await evaluate("document.getElementById('quick-pause-btn').click()");
    await sleep(500);
  });
  const after = screenHold();
  console.log('after pause ->', JSON.stringify(after));
  check('screen released after pause', !after.held);

  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL: smoke test crashed:', e); process.exit(1); });
