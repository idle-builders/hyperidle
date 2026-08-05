#!/usr/bin/env bash
set -euo pipefail

# Build the desktop app locally WITHOUT code signing or notarization.
# Produces a runnable .app bundle for testing — no Apple credentials needed.
#
# @lore PGlite migration: no native module rebuild needed. PGlite is pure WASM.
#
# Usage: ./scripts/build-local.sh
#   Then: open release/mac-arm64/HyperIdle.app

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/applications/desktop"

echo "==> Building web SPA"
npm run -w @hyperidle/web build

echo "==> Bundling desktop (esbuild → dist/main.cjs)"
npx tsx "$DESKTOP_DIR/scripts/bundle.ts"

echo "==> Building unsigned app (no signing, no notarization)"
cd "$DESKTOP_DIR"
CSC_IDENTITY_AUTO_DISCOVERY=false \
  npx electron-builder \
  --config electron-builder.yml \
  --mac --arm64 \
  -c.mac.notarize=false \
  --publish never
cd "$REPO_ROOT"

echo ""
echo "Done! Unsigned app built."
echo "Run with: open $DESKTOP_DIR/release/mac-arm64/HyperIdle.app"
