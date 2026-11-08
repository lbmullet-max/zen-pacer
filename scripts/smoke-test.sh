#!/usr/bin/env bash
# Runs inside the Android emulator job: install the APK, launch it, and drive it.
set -x
adb install -r zen-pacer.apk || exit 1
adb logcat -c
adb shell am start -n com.zenpacer.app/.MainActivity
sleep 20

PID=$(adb shell pidof com.zenpacer.app | tr -d '\r')
if [ -z "$PID" ]; then
  echo "FAIL: app is not running"
  adb logcat -d | tail -150
  exit 1
fi
echo "App running as pid $PID"

adb logcat -d | grep -E "Capacitor|chromium|AndroidRuntime|FATAL" | tail -60

adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node scripts/smoke-test.js
