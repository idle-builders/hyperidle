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

# @lore proven-bug guard: a `.env` NODE_ENV=development line anywhere Vite loads
# it (even a machine-local, gitignored one) forces import.meta.env.DEV/.PROD true
# for the whole build, which silently ships the dev-only ws://localhost:3001
# address into a packaged app — no live update ever reaches the window again.
# ws-client.ts now reads MODE (immune to that) instead, but this hard-fails the
# build if the regression ever comes back, in this file or the pattern it uses.
echo "==> Verifying the web bundle never hardcodes the dev websocket address"
WEB_BUNDLE_DIR="$REPO_ROOT/layers/core-ui/dist/assets"
WEB_BUNDLE_JS=("$WEB_BUNDLE_DIR"/index-*.js)
if [ ! -e "${WEB_BUNDLE_JS[0]}" ]; then
  echo "Error: no built bundle found at $WEB_BUNDLE_DIR/index-*.js — cannot verify the ws address."
  exit 1
fi
if grep -l "ws://localhost" "${WEB_BUNDLE_JS[@]}" >/dev/null 2>&1; then
  echo "Error: the built web bundle hardcodes ws://localhost — a packaged app would never receive live updates."
  echo "See layers/core-ui/src/services/ws-client.ts and its MODE-based dev/prod branch."
  exit 1
fi

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
