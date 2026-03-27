#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_ROOT="$REPO_ROOT/drivers/android"
ANDROID_APP_ROOT="$ANDROID_ROOT/app"
OUTPUT_ROOT="$REPO_ROOT/resources/android"

cd "$ANDROID_ROOT"
./gradlew --no-daemon app:assembleDebug app:assembleDebugAndroidTest

mkdir -p "$OUTPUT_ROOT"
cp -f "$ANDROID_APP_ROOT/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_ROOT/app-debug.apk"
cp -f "$ANDROID_APP_ROOT/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" \
  "$OUTPUT_ROOT/app-debug-androidTest.apk"

printf 'Android driver artifacts staged in %s\n' "$OUTPUT_ROOT"
