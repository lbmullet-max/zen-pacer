// Copies the website files into www/. Netlify publishes www/ as the website,
// and Capacitor bundles the same folder into the Android APK.
// (www/ is generated and git-ignored; index.html at the repo root stays the source of truth.)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of ['index.html', 'icon.png', 'manifest.json', 'sw.js']) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.cpSync(path.join(root, 'fonts'), path.join(out, 'fonts'), { recursive: true });

console.log('Built web assets into www/');
