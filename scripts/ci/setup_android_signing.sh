#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_KEY_BASE64:?ANDROID_KEY_BASE64 is required}"
: "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required}"
: "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD is required}"
: "${ANDROID_STORE_PASSWORD:?ANDROID_STORE_PASSWORD is required}"

ANDROID_GEN="src-tauri/gen/android"
GRADLE_FILE="$ANDROID_GEN/app/build.gradle.kts"
KEYSTORE_FILE="${RUNNER_TEMP:-/tmp}/upload-keystore.jks"

printf '%s' "$ANDROID_KEY_BASE64" | base64 --decode > "$KEYSTORE_FILE"

cat > "$ANDROID_GEN/keystore.properties" <<EOF
keyAlias=$ANDROID_KEY_ALIAS
keyPassword=$ANDROID_KEY_PASSWORD
storePassword=$ANDROID_STORE_PASSWORD
storeFile=$KEYSTORE_FILE
EOF

python3 scripts/ci/patch_android_signing.py "$GRADLE_FILE"
