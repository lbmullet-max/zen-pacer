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

// Is the breathing-session service running as a foreground service (the thing that keeps audio alive)?
const serviceState = () => {
  const out = sh('adb shell dumpsys activity services com.zenpacer.app');
  return { listed: out.includes('SessionService'), foreground: /isForeground=true/.test(out) };
};

// Press a button on the session notification: pull down the shade, find the button, tap it.
async function tapNotificationButton(label) {
  sh('adb shell cmd statusbar expand-notifications');
  await sleep(2500);
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  const xml = sh('adb shell cat /sdcard/ui.xml');
  const re = new RegExp(`(?:text|content-desc)="${label}"[^>]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
  const m = xml.match(re);
  if (!m) { console.log(`could not find a "${label}" button. Notification texts seen:`, [...xml.matchAll(/text="([^"]+)"/g)].map(x => x[1]).slice(0, 25).join(' | ')); sh('adb shell cmd statusbar collapse'); return false; }
  const x = Math.round((+m[1] + +m[3]) / 2), y = Math.round((+m[2] + +m[4]) / 2);
  sh(`adb shell input tap ${x} ${y}`);
  await sleep(1500);
  sh('adb shell cmd statusbar collapse');
  await sleep(500);
  return true;
}

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

// Close and reopen the app so we get a fresh process (and a fresh DevTools socket).
async function launchApp() {
  sh('adb shell input keyevent KEYCODE_HOME');   // backgrounding lets the WebView flush saved settings
  await sleep(1500);
  sh('adb shell am force-stop com.zenpacer.app');
  sh('adb shell am start -n com.zenpacer.app/.MainActivity');
  let pid = '';
  for (let i = 0; i < 30 && !pid; i++) { await sleep(1000); pid = sh('adb shell pidof com.zenpacer.app || true').trim(); }
  await sleep(6000);
  sh(`adb forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  console.log('launched, pid', pid);
}
const THEME = "({ theme: document.documentElement.dataset.theme, dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor, select: document.getElementById('theme-select').value })";

(async () => {
  sh('adb shell pm grant com.zenpacer.app android.permission.POST_NOTIFICATIONS');
  sh('adb shell cmd uimode night no');
  await launchApp();

  // Nothing attached yet: the screen should not be held.
  const baseline = screenHold();
  console.log('baseline ->', JSON.stringify(baseline));
  check('screen not held when idle', !baseline.held);

  await withPage(async (evaluate, target) => {
    console.log('target:', target.url);
    check('running inside Capacitor', await evaluate('!!(window.Capacitor && window.Capacitor.isNativePlatform())'));
    check('KeepAwake plugin visible to the page', await evaluate('!!(window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAwake)'));
    check('AppTheme plugin visible to the page', await evaluate('!!(window.Capacitor.Plugins && window.Capacitor.Plugins.AppTheme)'));
    check('service worker NOT registered', (await evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')) === 0);
    const t = await evaluate(THEME);
    check('first launch matches a light phone', t.theme === 'light' && t.bg === 'rgb(255, 255, 255)' && t.select === 'light', JSON.stringify(t));
  });

  // Phone switches to dark; with no saved choice the app should start dark.
  sh('adb shell cmd uimode night yes');
  await sleep(2000);
  await launchApp();
  await withPage(async evaluate => {
    const t = await evaluate(THEME);
    check('no saved choice: follows a dark phone', t.theme === 'dark' && t.bg === 'rgb(0, 0, 0)' && t.select === 'dark', JSON.stringify(t));
    // Choose Light in the app's settings.
    await evaluate("(() => { const s = document.getElementById('theme-select'); s.value = 'light'; s.dispatchEvent(new Event('change')); })()");
    await sleep(500);
    const t2 = await evaluate(THEME);
    check('choosing Light switches the app', t2.theme === 'light' && t2.bg === 'rgb(255, 255, 255)', JSON.stringify(t2));
  });

  // Reopen with the phone still dark: the saved choice (Light) should win.
  await launchApp();
  await withPage(async evaluate => {
    const t = await evaluate(THEME);
    check('saved Light choice survives closing the app', t.theme === 'light' && t.bg === 'rgb(255, 255, 255)' && t.dark === true, JSON.stringify(t));
  });
  sh('adb shell cmd uimode night no');

  // Start a session, then detach and see whether the screen is held awake.
  await withPage(async evaluate => {
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(1500);
    check('session started', (await evaluate("document.getElementById('instruction').textContent.trim()")) === 'Inhale');
  });
  const during = screenHold();
  console.log('during session ->', JSON.stringify(during));
  check('screen held awake during session', during.held);

  // Pause, detach, and the screen should be released. Then Reset from the in-session row.
  await withPage(async evaluate => {
    await evaluate("document.getElementById('quick-pause-btn').click()");
    await sleep(500);
  });
  const after = screenHold();
  console.log('after pause ->', JSON.stringify(after));
  check('screen released after pause', !after.held);

  await withPage(async evaluate => {
    check('Reset button visible while paused', await evaluate("getComputedStyle(document.getElementById('mini-reset-btn')).display !== 'none' && document.getElementById('mini-reset-btn').offsetWidth > 0"));
    await evaluate("document.getElementById('mini-reset-btn').click()");
    await sleep(500);
    const r = await evaluate("({ instruction: document.getElementById('instruction').textContent.trim(), active: document.body.classList.contains('session-active') })");
    check('Reset returns to the start screen', r.instruction === 'Ready to breathe' && r.active === false, JSON.stringify(r));
  });

  // ---- Saved settings + the "Keep screen on" switch, on the real WebView ----
  await withPage(async evaluate => {
    await evaluate(`(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      set('pattern-select', 'box'); set('minutes-input', 7); set('sound-select', 'mute'); set('pacer-vol-slider', 0.4);
      for (const id of ['keep-awake-toggle', 'fade-toggle']) { const e = document.getElementById(id); e.checked = false; e.dispatchEvent(new Event('change')); }
    })()`);
  });
  await launchApp();
  await withPage(async evaluate => {
    const v = await evaluate(`({ pattern: document.getElementById('pattern-select').value, minutes: document.getElementById('minutes-input').value,
      sound: document.getElementById('sound-select').value, volume: document.getElementById('pacer-vol-slider').value,
      keep: document.getElementById('keep-awake-toggle').checked, fade: document.getElementById('fade-toggle').checked,
      timer: document.getElementById('timer-display').textContent })`);
    check('settings remembered after closing the app', v.pattern === 'box' && v.minutes === '7' && v.sound === 'mute' && v.volume === '0.4' && !v.keep && !v.fade && v.timer === '7:00', JSON.stringify(v));
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(1500);
  });
  const noKeep = screenHold();
  console.log('session with "Keep screen on" OFF ->', JSON.stringify(noKeep));
  check('screen NOT held when "Keep screen on" is off', !noKeep.held);
  await withPage(async evaluate => {
    await evaluate("document.getElementById('keep-awake-toggle').checked = true; document.getElementById('keep-awake-toggle').dispatchEvent(new Event('change'))");
    await sleep(500);
  });
  const nowKeep = screenHold();
  check('switching "Keep screen on" on mid-session holds the screen', nowKeep.held, JSON.stringify(nowKeep.win));
  await withPage(async evaluate => {
    await evaluate("localStorage.removeItem('zenPacerSettings'); document.getElementById('mini-reset-btn').click()");   // back to defaults for the next tests
  });

  // ---- Notification buttons (also what the lock screen shows) ----
  await launchApp();
  await withPage(async evaluate => {
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(1500);
  });
  if (await tapNotificationButton('Pause')) {
    await withPage(async evaluate => {
      const t = await evaluate("document.getElementById('instruction').textContent.trim()");
      check('notification "Pause" pauses the session', t === 'Paused', t);
    });
    const svc = serviceState();
    check('notification stays (with Resume) while paused', svc.foreground, JSON.stringify(svc));
    if (await tapNotificationButton('Resume')) {
      await withPage(async evaluate => {
        const t = await evaluate("document.getElementById('instruction').textContent.trim()");
        check('notification "Resume" resumes the session', t === 'Inhale' || t === 'Exhale', t);
      });
    } else check('notification "Resume" button found', false);
    if (await tapNotificationButton('Stop')) {
      await withPage(async evaluate => {
        const r = await evaluate("({ i: document.getElementById('instruction').textContent.trim(), active: document.body.classList.contains('session-active') })");
        check('notification "Stop" resets the session', r.i === 'Ready to breathe' && !r.active, JSON.stringify(r));
      });
      check('service gone after "Stop"', !serviceState().listed);
    } else check('notification "Stop" button found', false);
  } else check('notification "Pause" button found', false);

  // ---- Screen off: the session must keep going ----
  await launchApp();
  const SESSION_MIN = 3;
  let startWall = 0;
  await withPage(async evaluate => {
    await evaluate(`(() => { const m = document.getElementById('minutes-input'); m.value = ${SESSION_MIN}; m.dispatchEvent(new Event('change')); zenDebug.setAheadSeconds(15); })()`);
    startWall = Date.now();
    await evaluate("document.getElementById('start-btn').click()");
    await sleep(1500);
  });
  const svcOn = serviceState();
  console.log('service after Start ->', JSON.stringify(svcOn));
  check('foreground service running during a session', svcOn.foreground);

  sh('adb shell input keyevent KEYCODE_SLEEP');
  await sleep(3000);
  const wake = sh('adb shell dumpsys power').split('\n').find(l => /mWakefulness=/.test(l)) || '';
  console.log('power ->', wake.trim());
  check('screen is really off', /Asleep|Dozing/.test(wake), wake.trim());

  await sleep(65000);   // a minute+ with the screen off: far longer than the 15 s the audio was queued ahead
  const svcOff = serviceState();
  console.log('service with screen off ->', JSON.stringify(svcOff));
  check('foreground service still running with screen off', svcOff.foreground);

  await withPage(async evaluate => {
    const elapsed = (Date.now() - startWall) / 1000;
    const remaining = await evaluate('zenDebug.remaining');
    const queued = await evaluate('zenDebug.phasesQueued');
    const audio = await evaluate('zenDebug.audioState');
    const expectedQueued = Math.floor((elapsed + 15) / 5);   // 4:6 pattern = 2 phases per 10 s
    console.log(`screen off for ~${Math.round(elapsed)}s: remaining=${remaining.toFixed(1)}s queued=${queued} (expected ~${expectedQueued}) audio=${audio}`);
    check('audio keeps running with screen off', audio === 'running', audio);
    check('session clock kept time with screen off', Math.abs((SESSION_MIN * 60 - elapsed) - remaining) < 10, `expected ~${(SESSION_MIN * 60 - elapsed).toFixed(0)}s, got ${remaining.toFixed(0)}s`);
    check('audio kept being queued with screen off', queued >= expectedQueued - 4, `queued ${queued}, expected ~${expectedQueued}`);
    // Pause from the page; the service should stop.
    await evaluate("document.getElementById('quick-pause-btn').click()");
    await sleep(1500);
  });
  const svcPaused = serviceState();
  console.log('service after Pause ->', JSON.stringify(svcPaused));
  check('foreground service stops on pause', !svcPaused.foreground);
  sh('adb shell input keyevent KEYCODE_WAKEUP');

  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL: smoke test crashed:', e); process.exit(1); });
