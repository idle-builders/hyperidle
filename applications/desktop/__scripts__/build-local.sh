#!/usr/bin/env bash
set -euo pipefail

# Build the desktop app locally WITHOUT code signing or notarization.
# Produces a runnable .app bundle for testing — no Apple credentials needed.
#
# @lore PGlite migration: no native module rebuild needed. PGlite is pure WASM.
#
# Usage: ./__scripts__/build-local.sh
#   Then: open release/mac-arm64/HyperIdle.app

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/applications/desktop"

echo "==> Building web SPA"
npm run -w @hyperidle/core-ui build

echo "==> Bundling desktop (esbuild → dist/main.cjs)"
npx tsx "$DESKTOP_DIR/__scripts__/bundle.ts"

echo "==> Building unsigned app (no signing, no notarization)"
cd "$DESKTOP_DIR"
# @lore electron is hoisted to the monorepo-root node_modules, so electron-builder
# run from this workspace subdir cannot compute the version from a "^43.1.1" range.
# Derive the exact installed version and pass it explicitly.
ELECTRON_VERSION="$(node -p "require('electron/package.json').version")"
CSC_IDENTITY_AUTO_DISCOVERY=false \
  npx electron-builder \
  --config electron-builder.yml \
  --mac --arm64 \
  -c.electronVersion="$ELECTRON_VERSION" \
  -c.mac.notarize=false \
  --publish never
cd "$REPO_ROOT"

echo ""
echo "Done! Unsigned app built."
echo "Run with: open $DESKTOP_DIR/release/mac-arm64/HyperIdle.app"
