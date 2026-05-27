#!/usr/bin/env bash
set -euo pipefail

# Build the desktop app locally WITHOUT code signing or notarization.
# Produces a runnable .app bundle for testing — no Apple credentials needed.
#
# Usage: ./scripts/build-local.sh
#   Then: open release/mac-arm64/HyperIdle.app

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"

echo "==> Building web SPA"
npm run -w @hyperidle/web build

echo "==> Bundling desktop (esbuild → dist/main.cjs)"
npx tsx "$DESKTOP_DIR/scripts/bundle.ts"

# electron-rebuild needs a package-lock.json scoped to just better-sqlite3.
# Generate in an isolated temp dir to avoid cross-package dependency issues.
echo "==> Generating package-lock.json for electron-rebuild"
ISOLATED=$(mktemp -d)
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$DESKTOP_DIR/package.json', 'utf-8'));
  const minimal = { name: pkg.name, version: pkg.version,
    dependencies: { 'better-sqlite3': pkg.dependencies['better-sqlite3'] } };
  fs.writeFileSync(process.argv[1] + '/package.json', JSON.stringify(minimal, null, 2));
" "$ISOLATED"
(cd "$ISOLATED" && npm install --package-lock-only --ignore-scripts 2>/dev/null)
cp "$ISOLATED/package-lock.json" "$DESKTOP_DIR/package-lock.json"
rm -rf "$ISOLATED"

# Rebuild better-sqlite3 for Electron's Node ABI (not system Node).
# electron-builder's built-in npmRebuild doesn't reliably find hoisted
# workspace deps, so we rebuild the native binary explicitly using
# Electron's Node headers.
echo "==> Rebuilding better-sqlite3 for Electron"
ELECTRON_VERSION=$(node -e "console.log(require('$REPO_ROOT/node_modules/electron/package.json').version)")
cd "$REPO_ROOT/node_modules/better-sqlite3"
HOME="$HOME/.electron-gyp" npx --yes node-gyp rebuild \
  --target="$ELECTRON_VERSION" \
  --arch=arm64 \
  --dist-url=https://electronjs.org/headers \
  --runtime=electron
cd "$REPO_ROOT"

echo "==> Building unsigned app (no signing, no notarization)"
cd "$DESKTOP_DIR"
CSC_IDENTITY_AUTO_DISCOVERY=false \
  npx electron-builder \
  --config electron-builder.yml \
  --mac --arm64 \
  -c.mac.notarize=false \
  --publish never
cd "$REPO_ROOT"

# Restore better-sqlite3 for system Node (dev tooling).
echo "==> Restoring dev-compatible native modules"
npm rebuild better-sqlite3 2>/dev/null

echo ""
echo "Done! Unsigned app built."
echo "Run with: open $DESKTOP_DIR/release/mac-arm64/HyperIdle.app"
