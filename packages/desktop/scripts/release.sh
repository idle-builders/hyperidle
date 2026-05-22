#!/usr/bin/env bash
set -euo pipefail

# Local release script: build → sign → notarize → upload to GitHub Release.
# CI picks up the release event and distributes to hyperidle-releases + Homebrew.
#
# Prerequisites:
#   - Developer ID Application certificate in your keychain
#   - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID in .env or environment
#   - gh CLI authenticated
#   - bun, node installed
#
# Usage: ./scripts/release.sh <version>
#   e.g. ./scripts/release.sh 0.1.0

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "  e.g. $0 0.1.0"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"
TAG="v$VERSION"

# Load .env if it exists (for Apple credentials)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

# Validate Apple credentials
for var in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var is not set. Add it to .env or export it."
    exit 1
  fi
done

# Validate gh CLI
if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI not authenticated. Run 'gh auth login'."
  exit 1
fi

echo "==> Releasing HyperIdle $TAG"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: uncommitted changes. Commit or stash before releasing."
  exit 1
fi

# Bump version in package.json (node -e avoids npm's workspace:* issues)
echo "==> Setting version to $VERSION"
node -e "
  const fs = require('fs');
  const p = '$DESKTOP_DIR/package.json';
  const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(p, JSON.stringify(pkg, null, '\t') + '\n');
"

# Build everything
echo "==> Building web SPA"
bun run --filter @hyperidle/web build

echo "==> Bundling desktop (esbuild → dist/main.cjs)"
bun packages/desktop/scripts/bundle.ts

# @lore N5: electron-rebuild needs a package-lock.json but bun uses bun.lockb.
# npm install --package-lock-only fails in workspace root due to workspace:*
# protocol. Workaround: generate in an isolated temp dir with only better-sqlite3.
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

echo "==> Building, signing, and notarizing DMG"
cd "$DESKTOP_DIR"
npx electron-builder --config electron-builder.yml --mac --arm64 --publish never
cd "$REPO_ROOT"

DMG="$DESKTOP_DIR/release/HyperIdle-${VERSION}-arm64.dmg"
if [ ! -f "$DMG" ]; then
  echo "Error: DMG not found at $DMG"
  ls "$DESKTOP_DIR/release/" 2>/dev/null || echo "(release dir does not exist)"
  exit 1
fi

echo "==> DMG built: $(du -sh "$DMG" | cut -f1)"

# Commit version bump, tag, and push
echo "==> Committing version bump and tagging $TAG"
git add packages/desktop/package.json
git commit -m "release: HyperIdle $TAG"
git tag "$TAG"
git push origin HEAD "$TAG"

# Create GitHub Release with the DMG
echo "==> Creating GitHub Release $TAG"
gh release create "$TAG" "$DMG" \
  --title "HyperIdle $TAG" \
  --notes "Desktop release $TAG (arm64)" \
  --repo ambrovia/hyperidle

echo ""
echo "Done! Release $TAG created with DMG uploaded."
echo "CI will automatically distribute to hyperidle-releases and Homebrew."
