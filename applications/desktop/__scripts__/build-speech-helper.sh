#!/usr/bin/env bash
set -euo pipefail

# Compile the speech helper the record button runs (native/speech/main.swift). Needs a Mac with
# Swift; called by build-local.sh and release.sh before electron-builder packs it as
# Resources/speech-helper. Linux CI never packs the app, so it never needs this.

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$DESKTOP_DIR/native/speech/build"
mkdir -p "$OUT_DIR"
swiftc -O -swift-version 5 -target arm64-apple-macos13.0 \
  "$DESKTOP_DIR/native/speech/main.swift" \
  -o "$OUT_DIR/speech-helper"
echo "Built $OUT_DIR/speech-helper"
