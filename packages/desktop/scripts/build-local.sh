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

echo "==> Building unsigned app (no signing, no notarization)"
cd "$DESKTOP_DIR"
CSC_IDENTITY_AUTO_DISCOVERY=false \
  npx electron-builder \
  --config electron-builder.yml \
  --mac --arm64 \
  -c.mac.notarize=false \
  --publish never
cd "$REPO_ROOT"

# electron-builder's npmRebuild recompiles better-sqlite3 for Electron's Node
# ABI, breaking it for Node dev tooling. Restore the dev-compatible binary.
echo "==> Restoring dev-compatible native modules"
cd "$REPO_ROOT"
npm rebuild better-sqlite3 2>/dev/null

echo ""
echo "Done! Unsigned app built."
echo "Run with: open $DESKTOP_DIR/release/mac-arm64/HyperIdle.app"
