#!/usr/bin/env bash
# Runs inside the Android emulator job: install the APK, then let smoke-test.js launch and drive it.
set -x
adb install -r zen-pacer.apk || exit 1
adb logcat -c
node scripts/smoke-test.js
RESULT=$?

echo "---- app log ----"
adb logcat -d | grep -E "Capacitor|AndroidRuntime|FATAL" | tail -80

if adb logcat -d | grep -E "js.error|FATAL EXCEPTION|Capacitor/Plugin.*(rror|ailed)"; then
  echo "FAIL: the app logged a JavaScript or native error"
  RESULT=1
fi
exit $RESULT
