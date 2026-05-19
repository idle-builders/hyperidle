# N5 Architecture — Ship: production bundle + sign + notarize + Homebrew

## Required reading

- `plans/work-packages/TRACK-N.md` lines 183-221 (N5 spec)
- `packages/desktop/package.json`
- `packages/desktop/electron-builder.yml`
- `packages/desktop/build/entitlements.mac.plist`
- `packages/desktop/src/main.ts`
- `packages/desktop/src/boot-server.ts`
- `packages/desktop/src/migrate.ts`
- `packages/desktop/src/preload.ts`
- `packages/desktop/src/splash.html`
- `packages/server/src/server-factory.ts`
- `packages/server/src/index.ts`
- `packages/server/package.json`
- `packages/db/package.json`
- `.github/workflows/ci.yml`

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `esbuild` bundles server to `build/server.cjs` | No esbuild in project. Existing `build:node` uses `bun build`. | Add esbuild as devDependency. Bundle from `main.ts` entry (see design-it-twice below). |
| `electron-builder.yml` has mac target dmg | Skeleton exists with dmg + arm64/x64. Missing: hardenedRuntime, notarize, entitlements ref, signing identity. | Expand skeleton to final form. |
| `entitlements.mac.plist` covers allow-jit, allow-unsigned-executable-memory, network.client | File exists with those plus `disable-library-validation` and `files.user-selected.read-write`. | Already correct. No change needed. |
| `resolveMigrationsFolder()` works in packaged app | Current impl uses `import.meta.url` relative path only — no production branch. Comment says "N5 will fix." | Add `app.isPackaged` branch to resolve from `process.resourcesPath`. |
| `main.ts` references `Dirname` for splash.html and preload.js | After bundling, `import.meta.url` resolves to the bundle file location (`dist/`). splash.html and preload.cjs must be co-located. | Copy splash.html into dist/. Compile preload.ts to dist/preload.cjs separately. |
| `electron-rebuild` rebuilds `better-sqlite3` | `@electron/rebuild` is in optionalDependencies. Root package.json has `native:electron` script. | Use `electron-rebuild` in CI workflow. |
| `package-lock.json` generated as CI artifact | No package-lock.json exists (bun workspace uses bun.lockb). | CI generates via `npm install --package-lock-only` in desktop package. |
| `boot-server.ts` imports `@hyperidle/server/server-factory` | Correct — static ESM import. After esbuild bundling, this is inlined. | No change needed — esbuild resolves workspace imports. |
| Postgres-related code in `@hyperidle/db` (pg-connection.ts, etc.) | Server imports from `@hyperidle/db` which re-exports pg types. | esbuild tree-shakes unused pg code. The `postgres` npm package is never called at runtime in desktop mode. If esbuild pulls it in, mark it external (pure JS, no native). |

---

## Design-it-twice: bundling strategy

### Option A: Bundle server separately, compile main process separately

- esbuild bundles `packages/server/src/index.ts` to `packages/desktop/build/server.cjs`
- tsc (or esbuild) compiles `packages/desktop/src/*.ts` to `packages/desktop/dist/`
- At runtime, `boot-server.ts` does `require("../build/server.cjs")`
- **Trade-off:** Two build steps, runtime require() indirection, `boot-server.ts` needs rewrite for production path.
- **Reject because:** The spec says the server is bundled, but the main process also depends on workspace packages (`@hyperidle/db` for migrations). Two separate bundles means managing the boundary between them — which code goes where, shared dependencies duplicated or externalized.

### Option B: Bundle everything from main.ts entry point

- esbuild bundles `packages/desktop/src/main.ts` to `packages/desktop/dist/main.cjs`
- Single entry point, single output. All workspace deps (`@hyperidle/server`, `@hyperidle/db`, `@hyperidle/shared`, `@hyperidle/fabric`) are inlined.
- Externalize only: `electron`, `better-sqlite3`.
- **Trade-off:** Slightly larger bundle (includes main process code alongside server code). But main process code is <500 lines — negligible.
- **Advantage:** One build command, no runtime require() tricks, no split-brain dependency management.

### Decision: Option B

Bundle from `main.ts`. The output is `dist/main.cjs` — a single CJS file containing the entire application logic except `better-sqlite3` (native) and `electron` (provided by the runtime). The spec's intent ("self-contained bundle, no npm install") is achieved more cleanly.

The preload script is a separate esbuild entry point producing `dist/preload.cjs` (it runs in a different Electron context and cannot share the main bundle).

---

## Architecture

### 1. Build pipeline (local + CI)

```
bun run build:desktop
  │
  ├── 1. vite build (packages/web)          → packages/web/dist/
  ├── 2. esbuild main.ts → dist/main.cjs    → packages/desktop/dist/main.cjs
  ├── 3. esbuild preload.ts → dist/preload.cjs → packages/desktop/dist/preload.cjs
  ├── 4. copy splash.html → dist/splash.html → packages/desktop/dist/splash.html
  └── 5. electron-builder                    → packages/desktop/release/
        ├── copies dist/ into asar
        ├── copies extraResources (drizzle migrations, web-dist)
        ├── rebuilds better-sqlite3 via electron-rebuild
        ├── signs with Developer ID Application cert
        └── notarizes with App Store Connect API key
```

### 2. esbuild configuration

File: `packages/desktop/scripts/bundle.ts`

```typescript
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const DESKTOP_DIR = path.resolve(import.meta.dirname, "..");
const DIST_DIR = path.join(DESKTOP_DIR, "dist");

// Clean dist
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// Bundle main process
await esbuild.build({
  entryPoints: [path.join(DESKTOP_DIR, "src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node20",      // Electron 36 ships Node ~20
  format: "cjs",
  outfile: path.join(DIST_DIR, "main.cjs"),
  external: [
    "electron",
    "better-sqlite3",
    // pg-related: tree-shaken in practice but explicitly excluded
    // to avoid bundling the postgres driver into the desktop app
    "postgres",
    "@electric-sql/pglite",
  ],
  sourcemap: true,
  minify: false,          // Keep readable for crash diagnostics
  // Resolve workspace packages via their source
  // esbuild follows the exports map in package.json
});

// Bundle preload script (separate Electron context)
await esbuild.build({
  entryPoints: [path.join(DESKTOP_DIR, "src/preload.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(DIST_DIR, "preload.cjs"),
  external: ["electron"],
  sourcemap: false,       // Preload is tiny
  minify: false,
});

// Copy splash.html to dist (main.ts loads it via path.join(Dirname, "splash.html"))
fs.copyFileSync(
  path.join(DESKTOP_DIR, "src/splash.html"),
  path.join(DIST_DIR, "splash.html"),
);

console.log("Desktop bundle complete.");
```

Key decisions:
- `platform: "node"` — Electron main process is Node.
- `format: "cjs"` — electron-builder expects CJS for main entry.
- `target: "node20"` — Electron 36 uses Node 20.x headers.
- `external: ["electron", "better-sqlite3"]` — electron is provided by the runtime; better-sqlite3 is a native module that must be rebuilt against Electron's Node ABI and cannot be bundled.
- `minify: false` — crash stack traces should be readable; the bundle size increase is irrelevant for a desktop app.
- `sourcemap: true` for main only — useful for crash diagnostics.

### 3. Handling `better-sqlite3` in the packaged app

better-sqlite3 is externalized from the bundle. electron-builder must include it in the asar/unpacked resources. The flow:

1. CI runs `npm install --package-lock-only` in `packages/desktop/` to generate a package-lock.json (required by electron-rebuild to resolve native module versions).
2. `electron-rebuild` rebuilds better-sqlite3 against Electron's Node ABI for the target arch.
3. electron-builder's `files` glob includes `node_modules/better-sqlite3/**/*` and the rebuilt `.node` binary lands in the app resources.

Since better-sqlite3 lives in `packages/db/node_modules/` (not `packages/desktop/node_modules/`), the desktop package.json needs `better-sqlite3` as a direct production dependency so electron-rebuild and electron-builder find it in the right place.

### 4. Code changes needed in existing files

#### 4a. `packages/desktop/src/migrate.ts` — production path

```typescript
export function resolveMigrationsFolder(): string {
  if (app.isPackaged) {
    // In the packaged app, drizzle migrations are in extraResources
    return path.join(process.resourcesPath, "drizzle");
  }
  // Dev mode: relative to source
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..", "db", "drizzle");
}
```

This requires importing `app` from electron. Currently `migrate.ts` does not import `app`. Add `import { app } from "electron";` — since electron is externalized, this resolves at runtime.

#### 4b. `packages/desktop/src/main.ts` — Dirname resolution

After bundling, `import.meta.url` points to the bundled file (`dist/main.cjs`). The `Dirname` constant:

```typescript
const Dirname = path.dirname(fileURLToPath(import.meta.url));
```

In CJS output, `import.meta.url` is shimmed by esbuild to `require("url").pathToFileURL(__filename).href`. So `Dirname` resolves to the directory containing `main.cjs`, which is `dist/`. Since splash.html and preload.cjs are also in `dist/`, the path joins still work:

- `path.join(Dirname, "splash.html")` → `dist/splash.html` (correct)
- `path.join(Dirname, "preload.js")` → `dist/preload.js` (WRONG — it's `preload.cjs`)

Fix: change the preload path reference to `preload.cjs`:

```typescript
const preloadPath = path.join(Dirname, "preload.cjs");
```

But this breaks dev mode where the preload is loaded as `preload.js` via tsx. Solution: use `IS_DEV` to pick the right extension, OR use a build step that names the output `preload.js`. The simplest fix: name the esbuild output `preload.js` (not `.cjs`). CJS files can have a `.js` extension. This avoids any conditional logic.

Updated esbuild: `outfile: path.join(DIST_DIR, "preload.js")`.

Wait — in dev mode, `electron .` runs with `NODE_OPTIONS='--import tsx'` and the `main` field points to `src/main.ts`. The preload path resolves to `src/preload.js` which doesn't exist (it's `preload.ts`). Let me check how dev mode actually loads the preload.

Looking at main.ts line 312: `const preloadPath = path.join(Dirname, "preload.js");`

In dev mode, Dirname = `packages/desktop/src/`. There's no `preload.js` in src — only `preload.ts`. This means the dev preload path is already wrong... unless tsx handles it. Actually, tsx registers a loader that intercepts `.js` imports and looks for `.ts` files. So `preload.js` in dev mode gets resolved to `preload.ts` by tsx. In production (bundled), the file will be `dist/preload.js` (our esbuild output). This works.

#### 4c. `packages/desktop/package.json` — update for production

```json
{
  "main": "dist/main.cjs",
  "scripts": {
    "dev": "bun scripts/check-native.ts && NODE_OPTIONS='--import tsx' electron .",
    "build": "bun scripts/bundle.ts",
    "build:dist": "electron-builder --config electron-builder.yml",
    "check:native": "bun scripts/check-native.ts",
    "check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^12.9.0"
  }
}
```

Critical: The `main` field switches from `src/main.ts` (dev, interpreted by tsx) to `dist/main.cjs` (production, pre-bundled). But dev mode still needs `src/main.ts` as the entry.

Resolution: electron-builder reads `main` from package.json to determine the app entry point. In the production build, `main` must point to `dist/main.cjs`. In dev mode, `main` points to `src/main.ts` (tsx interprets it).

Approach: Keep `"main": "src/main.ts"` for dev mode. The `bundle.ts` script writes a temporary `package.json` into `dist/` (or electron-builder's `extraMetadata` option overrides `main` at build time).

electron-builder supports `extraMetadata`:
```yaml
extraMetadata:
  main: dist/main.cjs
```

This overrides the `main` field in the packaged app's package.json without modifying the source file. This is the standard electron-builder pattern for this exact problem.

### 5. electron-builder.yml — final form

```yaml
appId: com.hyperidle.app
productName: HyperIdle
copyright: Copyright © 2025 HyperIdle

# Override main entry for production bundle
extraMetadata:
  main: dist/main.cjs

mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [arm64, x64]
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: true
  icon: build/icon.icns

# What goes into the asar
files:
  - "dist/**/*"
  - "!dist/**/*.map"
  - "node_modules/better-sqlite3/**/*"

# Resources outside the asar (accessible via process.resourcesPath)
extraResources:
  - from: "../../packages/db/drizzle"
    to: "drizzle"
    filter:
      - "**/*.sql"
      - "meta/**/*"
  - from: "../../packages/web/dist"
    to: "web-dist"

# Native module rebuild
npmRebuild: true

# Signing — env vars injected by CI
# CSC_LINK / CSC_KEY_PASSWORD for the Developer ID Application cert
# APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER for notarization

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# Explicit artifact naming so Homebrew URLs are predictable
artifactName: "${productName}-${version}-${arch}.${ext}"

# Do not publish to any update server
publish: null
```

Notes:
- `entitlementsInherit` applies to helper processes (e.g., GPU process, renderer). Must match or be a subset of the main entitlements.
- `notarize: true` uses the Apple notarytool via environment variables. electron-builder 25+ supports this natively.
- `npmRebuild: true` triggers electron-rebuild automatically during the build.
- `publish: null` — no auto-updater. Distribution is via Homebrew only (v1).
- `icon: build/icon.icns` — needs an icon file. If not present, electron-builder uses the Electron default icon.

### 6. App icon

An `icon.icns` file is needed at `packages/desktop/build/icon.icns`. This is a creative asset, not a code artifact. The builder should create a placeholder (or the founders provide one). electron-builder will warn but not fail if the icon is missing — it falls back to the default Electron icon.

For a proper icns file, the source needs a 1024x1024 PNG converted via `iconutil` or `png2icns`. This is out of scope for the architecture plan but noted as a dependency.

### 7. GitHub Actions workflow: `.github/workflows/desktop-release.yml`

```yaml
name: Desktop Release

on:
  push:
    tags:
      - "v*"

# Only one release build at a time
concurrency:
  group: desktop-release
  cancel-in-progress: false

jobs:
  build:
    strategy:
      matrix:
        arch: [arm64, x64]
    runs-on: macos-latest  # Apple Silicon runners for arm64, Rosetta for x64
    timeout-minutes: 30
    env:
      # Code signing
      CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
      CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
      # Notarization (App Store Connect API key)
      APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
      APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
      APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: bun install

      - name: Build web SPA
        run: bun run --filter @hyperidle/web build

      - name: Bundle desktop
        run: bun packages/desktop/scripts/bundle.ts

      - name: Generate package-lock.json for electron-rebuild
        working-directory: packages/desktop
        run: npm install --package-lock-only

      - name: Build & sign & notarize
        working-directory: packages/desktop
        run: npx electron-builder --config electron-builder.yml --mac --${{ matrix.arch }}

      - name: Upload DMG to release
        uses: softprops/action-gh-release@v2
        with:
          files: packages/desktop/release/*.dmg

  update-homebrew:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Get release info
        id: release
        run: |
          TAG=${GITHUB_REF#refs/tags/}
          VERSION=${TAG#v}
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Wait for release assets
        run: |
          # Poll until the arm64 DMG is available
          for i in $(seq 1 30); do
            URL="https://github.com/hyperidle/hyperidle/releases/download/${{ steps.release.outputs.tag }}/HyperIdle-${{ steps.release.outputs.version }}-arm64.dmg"
            if curl -sIL "$URL" | grep -q "200"; then
              break
            fi
            sleep 10
          done

      - name: Download DMGs and compute sha256
        run: |
          TAG=${{ steps.release.outputs.tag }}
          VERSION=${{ steps.release.outputs.version }}
          BASE_URL="https://github.com/hyperidle/hyperidle/releases/download/${TAG}"

          curl -sL "${BASE_URL}/HyperIdle-${VERSION}-arm64.dmg" -o arm64.dmg
          curl -sL "${BASE_URL}/HyperIdle-${VERSION}-x64.dmg" -o x64.dmg

          ARM64_SHA=$(shasum -a 256 arm64.dmg | cut -d' ' -f1)
          X64_SHA=$(shasum -a 256 x64.dmg | cut -d' ' -f1)

          echo "arm64_sha=$ARM64_SHA" >> "$GITHUB_OUTPUT"
          echo "x64_sha=$X64_SHA" >> "$GITHUB_OUTPUT"
        id: sha

      - name: Update Homebrew cask
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          repository: hyperidle/homebrew-tap
          event-type: update-cask
          client-payload: |
            {
              "version": "${{ steps.release.outputs.version }}",
              "arm64_sha256": "${{ steps.sha.outputs.arm64_sha }}",
              "x64_sha256": "${{ steps.sha.outputs.x64_sha }}"
            }
```

Notes on the workflow:
- `macos-latest` on GitHub Actions is an Apple Silicon runner (M1/M2). For x64 builds, electron-builder cross-compiles or uses Rosetta. Native module rebuilds for x64 on arm64 may require explicit arch flags — electron-rebuild supports `--arch x64`.
- The `update-homebrew` job uses `repository-dispatch` to trigger a workflow in the tap repo rather than directly pushing. This decouples the repos and avoids needing write access to the tap from the main repo's CI.
- DMG naming: electron-builder's default output naming is `${productName}-${version}-${arch}.dmg`. Verify after first build.
- `softprops/action-gh-release@v2` attaches assets to the GitHub Release created by the tag push.
- Secrets required: `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `HOMEBREW_TAP_TOKEN`.

### 8. Homebrew tap repo structure

Repository: `hyperidle/homebrew-tap`

```
homebrew-tap/
├── Casks/
│   └── hyperidle.rb
├── .github/
│   └── workflows/
│       └── update-cask.yml
└── README.md
```

#### `Casks/hyperidle.rb`

```ruby
cask "hyperidle" do
  version "0.0.1"

  if Hardware::CPU.arm?
    url "https://github.com/hyperidle/hyperidle/releases/download/v#{version}/HyperIdle-#{version}-arm64.dmg"
    sha256 "PLACEHOLDER_ARM64_SHA256"
  else
    url "https://github.com/hyperidle/hyperidle/releases/download/v#{version}/HyperIdle-#{version}-x64.dmg"
    sha256 "PLACEHOLDER_X64_SHA256"
  end

  name "HyperIdle"
  desc "Agentic operating system for AI product teams"
  homepage "https://github.com/hyperidle/hyperidle"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "HyperIdle.app"

  zap trash: [
    "~/Library/Application Support/HyperIdle",
    "~/Library/Logs/HyperIdle",
    "~/Library/Preferences/com.hyperidle.app.plist",
    "~/Library/Saved Application State/com.hyperidle.app.savedState",
  ]
end
```

Key points:
- Architecture detection via `Hardware::CPU.arm?` — serves the correct DMG for the user's CPU.
- `livecheck` uses `:github_latest` strategy — `brew upgrade` detects new GitHub releases automatically.
- No `uninstall_preflight` or `uninstall_postflight` — `brew uninstall --cask hyperidle` removes the app but NOT `~/Library/Application Support/HyperIdle` (where `hyperidle.db` lives). This preserves user data across reinstalls.
- The `zap` clause handles full purge: `brew uninstall --cask --zap hyperidle` removes everything including the database.

#### `.github/workflows/update-cask.yml`

```yaml
name: Update Cask

on:
  repository_dispatch:
    types: [update-cask]

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update cask formula
        run: |
          VERSION="${{ github.event.client_payload.version }}"
          ARM64_SHA="${{ github.event.client_payload.arm64_sha256 }}"
          X64_SHA="${{ github.event.client_payload.x64_sha256 }}"

          # Update version
          sed -i "s/version \".*\"/version \"${VERSION}\"/" Casks/hyperidle.rb

          # Update arm64 sha256
          # The arm64 sha is on the line after the arm64 url
          sed -i "/arm64.dmg/{ n; s/sha256 \".*\"/sha256 \"${ARM64_SHA}\"/; }" Casks/hyperidle.rb

          # Update x64 sha256
          sed -i "/x64.dmg/{ n; s/sha256 \".*\"/sha256 \"${X64_SHA}\"/; }" Casks/hyperidle.rb

      - name: Create PR
        uses: peter-evans/create-pull-request@v6
        with:
          title: "Update HyperIdle to ${{ github.event.client_payload.version }}"
          commit-message: "Update HyperIdle to ${{ github.event.client_payload.version }}"
          branch: "update-${{ github.event.client_payload.version }}"
          body: |
            Automated update from hyperidle/hyperidle release workflow.
            Version: ${{ github.event.client_payload.version }}
```

Note: uses `create-pull-request` action rather than auto-merge. This matches the spec's parenthetical: "PR if auto-merge is too aggressive." A human (or a second workflow with auto-merge enabled on the tap repo) merges the PR.

### 9. Handling native modules in the packaged app

The `better-sqlite3` native addon (`.node` file) must be:
1. Rebuilt against Electron's Node ABI (different from system Node)
2. Included in the app bundle outside the asar (native modules cannot be loaded from inside an asar)

electron-builder handles this automatically when `npmRebuild: true` and better-sqlite3 is in the package's dependencies. It runs electron-rebuild internally.

However, there's a subtlety: the esbuild bundle has `require("better-sqlite3")` as an external. At runtime, Electron resolves this require against the app's `node_modules/`. electron-builder includes `node_modules/better-sqlite3/` in the asar (with the `.node` binary unpacked automatically — electron-builder detects native modules and unpacks them).

For this to work, `packages/desktop/package.json` must list `better-sqlite3` as a production dependency (not just via the workspace `@hyperidle/db` reference, which esbuild has already inlined).

### 10. Security considerations

| Surface | Assessment |
|---|---|
| Signing credentials in CI | Secrets only — `CSC_LINK` (base64 p12), `CSC_KEY_PASSWORD`, Apple API key. Never committed, never logged. electron-builder reads from env vars. |
| Notarization API key | App Store Connect API key (`.p8` format), stored as CI secret. Scoped to notarization only — no App Store upload permissions. |
| HOMEBREW_TAP_TOKEN | GitHub PAT with `repo` scope on `hyperidle/homebrew-tap`. Minimal scope: only needs push to the tap repo. |
| Hardened runtime | Required for notarization. Entitlements are minimal: JIT (Electron V8), unsigned memory (Electron), network client (API calls), file access (user-selected for db), disable-library-validation (Electron helper processes). |
| DMG integrity | sha256 in the Homebrew cask formula. Updated atomically via PR. Users verify via `brew audit --cask hyperidle`. |
| No auto-updater | Eliminates the Squirrel/electron-updater attack surface entirely. Updates only via brew (user-initiated). |

### 11. What can be tested locally vs CI-only

| Item | Local testable? | Method |
|---|---|---|
| esbuild bundle produces valid CJS | Yes | Run `bun packages/desktop/scripts/bundle.ts`, then `node -e "require('./packages/desktop/dist/main.cjs')"` (will fail at electron import but proves the bundle is valid CJS with correct externals) |
| Bundle excludes tsx | Yes | `grep -c "tsx" packages/desktop/dist/main.cjs` returns 0 |
| Bundle externalizes better-sqlite3 | Yes | `grep "require.*better-sqlite3" packages/desktop/dist/main.cjs` shows the external require |
| Bundle externalizes electron | Yes | `grep "require.*electron" packages/desktop/dist/main.cjs` shows the external require |
| preload.cjs is valid | Yes | `node -e "require('./packages/desktop/dist/preload.js')"` (fails at electron import but proves syntax) |
| splash.html copied | Yes | File exists at `packages/desktop/dist/splash.html` |
| electron-builder.yml valid | Yes | `npx electron-builder --config electron-builder.yml --mac --dir` (unsigned, no notarize) builds a .app directory |
| Migrations resolve in packaged mode | Partially | Unit test mocks `app.isPackaged` and `process.resourcesPath`, asserts correct path |
| Code signing | No — requires Developer ID cert | CI only |
| Notarization | No — requires Apple API key | CI only |
| DMG creation | Yes (unsigned) | `electron-builder --mac` without signing env vars produces unsigned DMG |
| Homebrew cask install | No — requires signed+notarized DMG | CI only (but cask syntax can be validated locally via `brew audit`) |
| Homebrew cask formula syntax | Yes | `brew audit --cask --online Casks/hyperidle.rb` (in the tap repo) |

---

## Acceptance criteria with verification methods

| # | Criterion | Verification |
|---|---|---|
| AC1 | esbuild bundles main.ts to a single CJS file at `packages/desktop/dist/main.cjs`, externalizing only `better-sqlite3` and Electron built-ins. tsx is NOT in the bundle. | Test: run bundle script, assert file exists, assert `grep -c "tsx" dist/main.cjs` = 0, assert `require("better-sqlite3")` appears as external, assert no other `require()` calls to non-Node-builtin modules. |
| AC2 | `vite build` produces the SPA; electron-builder copies it into resources. | Test: run `bun run --filter @hyperidle/web build`, assert `packages/web/dist/index.html` exists. electron-builder config test: `extraResources` includes web-dist mapping. |
| AC3 | `package-lock.json` generated as CI artifact (not committed). | Workflow inspection: step runs `npm install --package-lock-only`. `.gitignore` includes `packages/desktop/package-lock.json`. |
| AC4 | electron-rebuild rebuilds better-sqlite3 against Electron's Node ABI for arm64 and x64. | CI workflow inspection: `npmRebuild: true` in electron-builder.yml. Local: `electron-builder --dir` succeeds and the resulting app includes a `.node` file. |
| AC5 | electron-builder.yml: dmg target, hardened runtime, notarize, correct entitlements. | File inspection: all keys present with correct values. |
| AC6 | Developer ID cert + API key as CI secrets, never committed, never logged. | Workflow inspection: secrets referenced via `${{ secrets.* }}`, no `echo` of secret values. |
| AC7 | desktop-release.yml runs on tag push, produces signed DMG, uploads to release. | Workflow file inspection + first-run validation (tag `v0.0.1`). |
| AC8 | Homebrew cask with name, desc, homepage, version, sha256, URL, livecheck. | Cask file inspection. `brew audit --cask Casks/hyperidle.rb` passes. |
| AC9 | Release workflow updates cask formula (version + sha256) via PR to tap repo. | Workflow file inspection: `repository-dispatch` + `create-pull-request` action. |
| AC10 | `brew uninstall --cask hyperidle` preserves userData. `--zap` clause for full purge. | Cask inspection: no `uninstall_postflight` removing Application Support. `zap` block includes `~/Library/Application Support/HyperIdle`. |
| AC11 | `resolveMigrationsFolder()` resolves correctly in packaged app. | Unit test: mock `app.isPackaged = true`, mock `process.resourcesPath`, assert returns `<resourcesPath>/drizzle`. |
| AC12 | Production bundle is self-contained: no npm install on user's Mac. | Inspection: electron-builder output contains no postinstall scripts; `files` glob includes only dist/ and better-sqlite3. |

---

## Ordered implementation tasks

### Task 1: Add esbuild dependency and bundle script

**Files:**
- `packages/desktop/package.json` — add `esbuild` to devDependencies, add `better-sqlite3` to dependencies, add `"build": "bun scripts/bundle.ts"` script
- `packages/desktop/scripts/bundle.ts` — new file, esbuild config as specified above
- `package.json` (root) — add `"build:desktop": "bun run --filter @hyperidle/web build && bun packages/desktop/scripts/bundle.ts"` script

**Depends on:** nothing
**Proves:** AC1 (bundle exists, externals correct, no tsx)

**Test:** `packages/desktop/__tests__/bundle.test.ts`
- Runs the bundle script
- Asserts `dist/main.cjs` exists and is >0 bytes
- Asserts `dist/preload.js` exists
- Asserts `dist/splash.html` exists
- Reads `dist/main.cjs` content, asserts `require("better-sqlite3")` present (external)
- Reads `dist/main.cjs` content, asserts no `tsx` reference
- Reads `dist/main.cjs` content, asserts `require("electron")` present (external)

### Task 2: Fix `resolveMigrationsFolder()` for production

**Files:**
- `packages/desktop/src/migrate.ts` — add `app.isPackaged` branch

**Depends on:** nothing (independent of Task 1)
**Proves:** AC11

**Test:** `packages/desktop/__tests__/migrate.test.ts` — add test case:
- Mock `app.isPackaged = true` and `process.resourcesPath = "/tmp/test-resources"`
- Assert `resolveMigrationsFolder()` returns `/tmp/test-resources/drizzle`

### Task 3: Finalize electron-builder.yml

**Files:**
- `packages/desktop/electron-builder.yml` — replace skeleton with final form
- `packages/desktop/.gitignore` — add `package-lock.json`, `release/`, `dist/`

**Depends on:** Task 1 (needs dist/ structure to be defined)
**Proves:** AC2, AC3, AC4, AC5, AC12

**Test:** File content inspection test in `packages/desktop/__tests__/electron-builder-config.test.ts`:
- Reads `electron-builder.yml`, parses YAML
- Asserts `mac.hardenedRuntime === true`
- Asserts `mac.notarize === true`
- Asserts `mac.entitlements` points to existing file
- Asserts `extraMetadata.main === "dist/main.cjs"`
- Asserts `files` includes `dist/**/*` and `node_modules/better-sqlite3/**/*`
- Asserts `extraResources` includes drizzle and web-dist
- Asserts `publish === null`

### Task 4: Create GitHub Actions desktop-release.yml

**Files:**
- `.github/workflows/desktop-release.yml` — new file

**Depends on:** Tasks 1-3 (workflow references the build pipeline)
**Proves:** AC6, AC7, AC9

**Test:** Workflow YAML lint (actionlint if available). Manual inspection of:
- Trigger: `on.push.tags`
- Secrets: referenced but never echoed
- Steps: install → build web → bundle desktop → package-lock → electron-builder → upload
- update-homebrew job: repository-dispatch to tap repo

### Task 5: Create Homebrew tap repo structure

**Files:** (in a separate repository `hyperidle/homebrew-tap`)
- `Casks/hyperidle.rb` — cask formula
- `.github/workflows/update-cask.yml` — dispatch handler
- `README.md` — minimal

**Depends on:** Task 4 (workflow dispatches to tap)
**Proves:** AC8, AC9, AC10

**Test:** `brew audit --cask Casks/hyperidle.rb` (run locally in the tap repo)

Note: The tap repo is a separate GitHub repository. The builder creates the files; a human (or separate automation) creates the repo and pushes. The `HOMEBREW_TAP_TOKEN` secret must be configured in the main repo's settings.

### Task 6: App icon placeholder

**Files:**
- `packages/desktop/build/icon.icns` — placeholder or real icon

**Depends on:** nothing
**Proves:** electron-builder uses it (AC5 implicitly)

**Test:** File exists and is valid icns format.

### Task 7: Local dry-run validation

**Depends on:** Tasks 1-3
**Proves:** AC1, AC2, AC4, AC11, AC12

Run the full local build pipeline without signing:
1. `bun run build:desktop` — web build + esbuild bundle
2. `cd packages/desktop && npm install --package-lock-only`
3. `npx electron-builder --config electron-builder.yml --mac --dir` (no signing)
4. Verify the output `.app` directory contains:
   - `Contents/Resources/app.asar` with `dist/main.cjs`, `dist/preload.js`, `dist/splash.html`
   - `Contents/Resources/drizzle/` with migration SQL files
   - `Contents/Resources/web-dist/` with `index.html`
   - `Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/` with `.node` binary

---

## Risks and ambiguities

1. **electron-builder + bun workspace resolution.** electron-builder expects npm/yarn workspace layouts. With bun workspaces, `node_modules` hoisting may differ. The `npmRebuild` step runs `electron-rebuild` which needs to find better-sqlite3. Mitigation: add better-sqlite3 as a direct dependency in desktop's package.json + generate package-lock.json.

2. **Cross-compilation for x64 on arm64 runner.** Building the x64 better-sqlite3 native module on an arm64 GitHub Actions runner requires cross-compilation. electron-rebuild supports `--arch x64` but the C++ compilation needs the right toolchain. Mitigation: use separate runner types (arm64 runner for arm64, x64 runner for x64) OR verify electron-rebuild cross-compilation works on macOS. If not, the matrix can use `runs-on: macos-13` (Intel) for x64 and `runs-on: macos-latest` (arm64) for arm64.

3. **DMG naming convention.** electron-builder's default DMG filename includes the version and arch. The exact format depends on the `artifactName` config. The Homebrew cask URL must match. Mitigation: set explicit `artifactName` in electron-builder.yml: `"${productName}-${version}-${arch}.${ext}"`.

4. **First-time signing setup.** Creating the Developer ID Application certificate, exporting it as p12, and setting up the App Store Connect API key is a manual process involving Apple Developer Portal. This is a one-time founder task, not automatable.

5. **postgres package in the bundle.** The `@hyperidle/db` index.ts re-exports from `pg-connection.ts` which imports the `postgres` npm package. esbuild will try to bundle it. Since it's never called at runtime in desktop mode, it won't cause errors, but it adds dead weight. Mitigation: add `postgres` to the external list in esbuild, or rely on tree-shaking. If esbuild fails to tree-shake it (it won't — the export is used in the barrel file), add it to externals.

6. **Tap repo does not exist yet.** The `hyperidle/homebrew-tap` GitHub repo needs to be created. This is a manual step.

---

## Protected tests

```
protectedTests:
  - packages/desktop/__tests__/main.test.ts
  - packages/desktop/__tests__/boot-server.test.ts
  - packages/desktop/__tests__/migrate.test.ts
  - packages/desktop/__tests__/window-state.test.ts
  - packages/desktop/__tests__/log-rotation.test.ts
  - packages/desktop/__tests__/safe-credentials.test.ts
  - packages/desktop/__tests__/app-menu.test.ts
```

These existing test files must not have their assertions changed. New test cases may be added (e.g., the production migration path test in migrate.test.ts).

---

## File inventory

### New files
| File | Purpose |
|---|---|
| `packages/desktop/scripts/bundle.ts` | esbuild bundle script |
| `packages/desktop/__tests__/bundle.test.ts` | Bundle validation tests |
| `packages/desktop/__tests__/electron-builder-config.test.ts` | Config validation tests |
| `.github/workflows/desktop-release.yml` | Release CI workflow |
| `packages/desktop/build/icon.icns` | App icon (placeholder) |
| `packages/desktop/.gitignore` | Ignore dist/, release/, package-lock.json |

### Modified files
| File | Change |
|---|---|
| `packages/desktop/package.json` | Add esbuild devDep, better-sqlite3 dep, build scripts |
| `packages/desktop/electron-builder.yml` | Full production config |
| `packages/desktop/src/migrate.ts` | Add production path resolution |
| `package.json` (root) | Add `build:desktop` script |

### External (separate repo)
| File | Purpose |
|---|---|
| `hyperidle/homebrew-tap/Casks/hyperidle.rb` | Homebrew cask formula |
| `hyperidle/homebrew-tap/.github/workflows/update-cask.yml` | Cask update automation |

---

## CI secrets inventory

| Secret name | Value | Where configured |
|---|---|---|
| `MAC_CERT_P12_BASE64` | Base64-encoded Developer ID Application certificate (.p12) | hyperidle/hyperidle repo settings |
| `MAC_CERT_PASSWORD` | Password for the .p12 file | hyperidle/hyperidle repo settings |
| `APPLE_API_KEY` | App Store Connect API key content (.p8 base64) | hyperidle/hyperidle repo settings |
| `APPLE_API_KEY_ID` | API key ID (e.g., "XXXXXXXXXX") | hyperidle/hyperidle repo settings |
| `APPLE_API_ISSUER` | API issuer ID (UUID from App Store Connect) | hyperidle/hyperidle repo settings |
| `HOMEBREW_TAP_TOKEN` | GitHub PAT with repo scope on hyperidle/homebrew-tap | hyperidle/hyperidle repo settings |
