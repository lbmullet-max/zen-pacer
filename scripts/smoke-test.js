// Drives the running app through Chrome DevTools (WebView debugging is on in debug builds).
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');

const holdingScreen = () => {
  const out = execSync('adb shell dumpsys window', { encoding: 'utf8' });
  const line = out.split('\n').find(l => l.includes('mHoldingScreenWindow')) || '(none)';
  return line.trim();
};
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('page url:', page.url());
  check('running inside Capacitor', await page.evaluate(() => !!(window.Capacitor && window.Capacitor.isNativePlatform())));
  check('service worker NOT registered', (await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0);

  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].map(f => `${f.family}:${f.status}`));
  check('bundled fonts loaded', fonts.length >= 2 && fonts.every(f => f.endsWith(':loaded')), JSON.stringify(fonts));

  const before = holdingScreen();
  console.log('before start ->', before);
  check('screen not held before session', !before.includes('com.zenpacer.app'));

  await page.click('#start-btn');
  await page.waitForTimeout(3000);
  check('session started', (await page.textContent('#instruction')).trim() === 'Inhale');
  const during = holdingScreen();
  console.log('during session ->', during);
  check('screen held awake during session', during.includes('com.zenpacer.app'));

  await page.click('#quick-pause-btn');
  await page.waitForTimeout(1500);
  const after = holdingScreen();
  console.log('after pause ->', after);
  check('screen released after pause', !after.includes('com.zenpacer.app'));

  check('no JS errors', errors.length === 0, JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FAIL: smoke test crashed:', e); process.exit(1); });
