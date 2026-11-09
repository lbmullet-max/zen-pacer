# Zen Pacer

A simple breathing pacer. It runs as a website and as an Android app (APK). The look is plain: light and dark themes that follow the phone's setting.

## Files

- `index.html` – the whole app (this is the file you edit)
- `icon.png`, `manifest.json`, `sw.js` – icon and offline cache for the website
- `android/` – the Android app wrapper (made with [Capacitor](https://capacitorjs.com))
- `scripts/build-web.js` – copies the website files into `www/`
- `scripts/smoke-test.*` – optional emulator check (run it by hand from the Actions tab)
- `signing/` – the app's signing key, encrypted
- `.github/workflows/android.yml` – builds the APK automatically on GitHub

## Getting the APK

Every push to `main` builds the app and publishes it on the repo's **Releases** page
(release name "Zen Pacer (latest)"). On your phone:

1. Open the repo's Releases page and download `zen-pacer.apk`
2. Open the downloaded file and allow "install unknown apps" for your browser/files app when asked
3. Install and open **Zen Pacer**

Builds of other branches don't publish a release; the APK is attached to that run on the
repo's **Actions** tab instead (under "Artifacts").

### Installing updates without uninstalling

Android only installs a new APK over an old one if both were signed with the same key.
The key lives in the repo **encrypted** (`signing/zenpacer.keystore.enc`). To switch it on,
add the passphrase once as a repository secret:

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**,
name `ZEN_SIGNING_PASSPHRASE`, value = the passphrase.

From the next build on, every APK is signed with the same key (the build log prints its
fingerprint) and installs over the previous version. Until the secret exists, builds use a
temporary key, so each new build must be installed after uninstalling the old one.

Keep the passphrase somewhere safe: it protects the key that proves updates are yours.

## Building locally (optional)

Needs Node 22, JDK 21 and the Android SDK:

```
npm install
npm run sync
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.
