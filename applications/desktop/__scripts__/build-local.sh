#!/usr/bin/env bash
set -euo pipefail

# Build the desktop app locally WITHOUT code signing or notarization.
# Produces a runnable .app bundle for testing — no Apple credentials needed.
#
# Usage: ./__scripts__/build-local.sh
#   Then: open release/mac-arm64/HyperIdle.app

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/applications/desktop"

echo "==> Building web SPA"
npm run -w @hyperidle/core-ui build

# @lore: .env NODE_ENV=development — forces import.meta.env.DEV true and ships ws://localhost into the packaged app
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

if grep -l "hyperidle-dev-local" "${WEB_BUNDLE_JS[@]}" >/dev/null 2>&1; then
  echo "Error: the built web bundle hardcodes the dev API key fallback (hyperidle-dev-local) — this build ran in dev mode."
  echo "See layers/core-ui/src/services/api-fetch.ts."
  exit 1
fi

echo "==> Bundling desktop (esbuild → dist/main.cjs)"
npx tsx "$DESKTOP_DIR/__scripts__/bundle.ts"

echo "==> Building unsigned app (no signing, no notarization)"
cd "$DESKTOP_DIR"
# @lore: electron version — hoisted to root node_modules; electron-builder in a workspace cannot resolve a range; pass exact
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
