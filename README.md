# Zen Pacer

A simple breathing pacer. It runs as a website (Netlify) and as an Android app (APK).

## Files

- `index.html` – the whole app (this is the file you edit)
- `fonts/`, `icon.png`, `manifest.json`, `sw.js` – fonts, icon and offline cache for the website
- `android/` – the Android app wrapper (made with [Capacitor](https://capacitorjs.com))
- `scripts/build-web.js` – copies the website files into `www/`
- `.github/workflows/android.yml` – builds the APK automatically on GitHub

## Getting the APK

Every push to `main` builds the app and publishes it on the repo's **Releases** page
(release name "Zen Pacer (latest)"). On your phone:

1. Open the repo's Releases page and download `zen-pacer.apk`
2. Open the downloaded file and allow "install unknown apps" for your browser/files app when asked
3. Install and open **Zen Pacer**

Builds of other branches don't publish a release; the APK is attached to that run on the
repo's **Actions** tab instead (under "Artifacts").

The APK is signed with a throwaway debug key, so each new build has a different
signature. To install a newer version, uninstall the old one first (the app keeps
no data, so nothing is lost).

## Building locally (optional)

Needs Node 22, JDK 21 and the Android SDK:

```
npm install
npm run sync
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.
