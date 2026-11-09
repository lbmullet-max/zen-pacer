#!/usr/bin/env bash
# Creates the app's signing key, encrypted with the passphrase in $PASSPHRASE, at
# signing/zenpacer.keystore.enc. The passphrase is only ever read from the environment (it is
# never printed). Run by the "Create signing key" workflow.
#
# Safety: if a key file already exists, it is only replaced when REPLACE=true, because replacing
# the key breaks "install over the old version" for apps already signed with it.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PASSPHRASE:?Set the ZEN_SIGNING_PASSPHRASE repository secret first (Settings > Secrets and variables > Actions).}"
if [ "${#PASSPHRASE}" -lt 12 ]; then
  echo "::error::The passphrase is too short. Use at least 12 characters (a long phrase is best)."
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ -f signing/zenpacer.keystore.enc ]; then
  if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:PASSPHRASE \
       -in signing/zenpacer.keystore.enc -out "$work/existing.keystore" 2>/dev/null \
     && keytool -list -keystore "$work/existing.keystore" -storepass:env PASSPHRASE >/dev/null 2>&1; then
    echo "A signing key already exists and this passphrase opens it. Nothing to do."
    exit 0
  fi
  if [ "${REPLACE:-false}" != "true" ]; then
    echo "::error::A signing key already exists and this passphrase does NOT open it. Check the secret. To replace the key anyway (apps signed with the old key will need uninstalling), run the workflow again with 'replace' ticked."
    exit 1
  fi
  echo "Replacing the existing signing key, as requested."
fi

mkdir -p signing
keytool -genkeypair -keystore "$work/zenpacer.keystore" -alias zenpacer -keyalg RSA -keysize 2048 \
  -validity 36500 -storepass:env PASSPHRASE -dname "CN=Zen Pacer, O=Zen Pacer" >/dev/null 2>&1
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:PASSPHRASE \
  -in "$work/zenpacer.keystore" -out signing/zenpacer.keystore.enc

echo "Signing key created. Its public fingerprint (every build signed with it will show this):"
keytool -list -keystore "$work/zenpacer.keystore" -storepass:env PASSPHRASE 2>/dev/null | grep "SHA-256"
