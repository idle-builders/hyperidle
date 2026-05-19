# Architecture Critique: N5

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:7 LI:9 AC:8 DM:N/A N:8 MD:8 FMC:6 S:7 V:7

---

## Dimension Scores

### 1. Spec Alignment — 7/10

The plan maps every spec AC to a task and verification method. The reconciliation table (plan section "Plan reconciliation") is thorough and honest — it calls out where the spec's assumptions diverge from reality (e.g., bundle entry point being `main.ts` not `server/src/index.ts`). The design-it-twice section is genuine: Option A is not straw-manned, and the rejection rationale (split-brain dependency management) is sound.

However, AC1 in the spec says bundle `packages/server/src/index.ts` to `packages/desktop/build/server.cjs`. The plan changes this to bundle from `main.ts` to `dist/main.cjs`. This is the right call — but the plan should explicitly note the spec deviation and justify it in the reconciliation table rather than burying it in the design-it-twice discussion. The reconciliation row for AC1 mentions esbuild but does not flag that the entry point and output path both differ from the spec.

Scope creep: Task 6 (App icon placeholder) is not in any AC. It is a reasonable dependency for a complete build, but it should be marked as a "forced dependency" not an AC-driven task.

### 2. Layer Integrity — 9/10

Clean. The plan stays entirely within the desktop package and CI infrastructure. No cross-layer violations. The esbuild strategy correctly treats workspace packages as inlined dependencies rather than reaching across layers at runtime. The `extraMetadata.main` pattern avoids modifying the source package.json, preserving dev/prod separation cleanly.

One minor note: the plan proposes the Homebrew tap as a separate repository with its own CI. This is a legitimate architectural boundary, not a layer violation, but the plan should note that the tap repo's `update-cask.yml` workflow has no validation gate — it blindly trusts the `client_payload` from the dispatch. This is not a layer issue but is noted here because the tap is treated as a "release artifact" per the spec's constraints.

### 3. API Contracts — 8/10

No new API routes are introduced. The plan correctly identifies that the only contract change is the production path resolution in `resolveMigrationsFolder()`. The function signature is specified with its return type and branch conditions. The esbuild external list is specified exhaustively.

The electron-builder.yml is fully specified with every key and value. The GitHub Actions workflow is specified step-by-step with input/output shapes for the `repository-dispatch` payload.

Deduction: The `client_payload` shape for `repository-dispatch` is specified but has no schema validation on the receiving end (`update-cask.yml`). The `sed` commands in the receiver blindly interpolate the payload. This is addressed under Failure-Mode Coverage.

### 4. Data Model Alignment — N/A

No schema changes. No migrations added. The plan correctly identifies that the only data concern is the migrations folder path resolution, not the migrations themselves.

### 5. Naming — 8/10

Names are honest and precise. `bundle.ts`, `dist/main.cjs`, `dist/preload.js`, `desktop-release.yml` — all self-documenting. The `extraMetadata` pattern is the standard electron-builder term. The Homebrew cask naming follows Homebrew conventions exactly.

Minor: `build:desktop` at the root level is clear. The `build` script in the desktop package.json runs `bun scripts/bundle.ts` — this is fine but the asymmetry between `build` (just esbuild) and `build:dist` (electron-builder) could confuse. Consider `bundle` and `dist` or `package` to make the distinction sharper. This is a suggestion, not a defect.

### 6. Module Depth — 8/10

The plan introduces exactly one new module (`scripts/bundle.ts`) and modifies one existing function (`resolveMigrationsFolder`). The public surface is minimal. The bundle script is a single-run build tool, not a library with exports. The electron-builder config is declarative. The GitHub Actions workflow is a single-purpose pipeline.

No unnecessary abstractions. No wrapper layers. No plugin points. The decision to use `extraMetadata` instead of a script that rewrites package.json is the simpler approach.

### 7. Failure-Mode Coverage — 6/10

This is the weakest dimension. Several failure paths are unaddressed.

**CRITICAL gaps:**

1. **esbuild will pull in `postgres` and `drizzle-orm/postgres-js` transitively.** The `@hyperidle/db` barrel file (`packages/db/src/index.ts`) re-exports `createPgDb` from `pg-connection.ts`, which has top-level `import postgres from "postgres"` and `import { drizzle } from "drizzle-orm/postgres-js"`. When esbuild resolves `import { applyMigrations } from "@hyperidle/db"`, it processes the entire barrel, including `pg-connection.ts`. The plan says "esbuild tree-shakes unused pg code" (Risk #5) but then immediately contradicts itself: "If esbuild fails to tree-shake it (it won't — the export is used in the barrel file), add it to externals." The plan's external list includes `postgres` and `@electric-sql/pglite` but NOT `drizzle-orm/postgres-js`. This subpath import will be bundled, and it will fail or produce dead weight because it imports from the externalized `postgres` package. Fix: either add `drizzle-orm/postgres-js` to externals, or (better) stop the bleed at the source by having `@hyperidle/db` use separate export paths for SQLite vs Postgres so the barrel doesn't force-include pg-connection.

2. **Server dependencies not in the external list.** The server imports `ws`, `nodemailer`, `@anthropic-ai/claude-agent-sdk`, `@hono/node-server`, and `hono`. These are all npm packages that esbuild will attempt to inline when bundling from `main.ts` (since `boot-server.ts` imports from `@hyperidle/server/server-factory` which imports these). The plan only externalizes `electron`, `better-sqlite3`, `postgres`, and `@electric-sql/pglite`. If these packages are pure JS, inlining works but bloats the bundle. If any have native components or rely on Node builtins that esbuild can't shim, the bundle breaks. The plan must either: (a) verify that all transitively-inlined packages are bundle-safe, or (b) explicitly list which ones to externalize. `ws` is pure JS and bundles fine. `nodemailer` is pure JS. `@anthropic-ai/claude-agent-sdk` and `@hono/node-server` need verification. `hono` is pure JS and bundles fine.

3. **Cross-compilation for native modules.** Risk #2 identifies this but the mitigation is vague: "use separate runner types OR verify cross-compilation works." The plan should commit to one approach. `macos-latest` on GitHub Actions is now Apple Silicon (M-series). Building an x64 native module (better-sqlite3) on an arm64 runner requires either Rosetta or cross-compilation toolchains. electron-rebuild's `--arch` flag handles the Electron headers but the C++ compilation still needs `arch -x86_64` or a cross-compile sysroot. The safer approach is `runs-on: macos-13` for x64 (Intel runner) and `runs-on: macos-latest` for arm64. The plan should pick this and update the matrix accordingly.

4. **Node version mismatch.** The plan says "Electron 36 ships Node ~20" and sets `target: "node20"`. Electron 36 ships Node 22 (Chromium 136, Node 22.x). The esbuild target should be `node22`. Using `node20` won't break anything (it's a lower target, so esbuild will downlevel unnecessarily), but it's factually incorrect and could mask issues if Electron's Node 22 APIs are used.

**WARNING gaps:**

5. **`import.meta.url` in CJS output.** The plan correctly identifies (section 4b) that esbuild shims `import.meta.url` to `require("url").pathToFileURL(__filename).href` in CJS output. However, `migrate.ts` also uses `import.meta.url` via `fileURLToPath(import.meta.url)`. In the production bundle, all code from `migrate.ts` is inlined into `main.cjs`. The `__filename` inside the bundle points to `dist/main.cjs`, not the original source. The plan's `app.isPackaged` branch bypasses this entirely by using `process.resourcesPath`, so the dev-mode fallback path is only used when `app.isPackaged === false`. In dev mode, the code runs as ESM via tsx, so `import.meta.url` works correctly. This is fine — but the plan should explicitly note that the dev-mode path in `resolveMigrationsFolder()` will NOT work if someone runs the bundled `dist/main.cjs` directly outside of a packaged app (e.g., `node dist/main.cjs`). Not critical since that's not a supported use case, but worth documenting.

6. **`npm install --package-lock-only` in CI.** The plan generates a package-lock.json from the desktop package.json. But the desktop package.json only lists `@hyperidle/db`, `@hyperidle/server`, and (proposed) `better-sqlite3` as dependencies. The workspace references (`workspace:*`) are not resolvable by `npm install` — npm doesn't understand bun workspace protocol. The `--package-lock-only` step may fail or produce a lock file that doesn't include better-sqlite3's native dependency tree correctly. The plan should verify this works, or use an alternative approach (e.g., a standalone `package.json` for the electron-rebuild step that only lists `better-sqlite3`).

7. **Homebrew `update-cask.yml` `sed` commands are fragile.** The sed commands use pattern matching (`/arm64.dmg/{ n; s/sha256 ".*"/sha256 "${ARM64_SHA}"/; }`) to find and replace sha256 lines. If the cask formula format changes (e.g., someone adds a comment between the url and sha256 lines), the sed silently fails. A templating approach or Ruby script would be more robust. This is a suggestion since the formula is auto-generated and its format is controlled.

8. **`shasum` command availability on ubuntu-latest.** The `update-homebrew` job runs on `ubuntu-latest` and uses `shasum -a 256`. Ubuntu has `sha256sum` by default, not `shasum` (which is a Perl script from macOS). The workflow will fail. Fix: use `sha256sum` instead of `shasum -a 256`, or install `perl` (which provides `shasum`).

### 8. Simplicity / Over-Engineering Risk — 7/10

The plan is lean. No unnecessary abstractions. The single-bundle approach (Option B) is simpler than the two-bundle approach (Option A). The `extraMetadata` trick is the standard electron-builder pattern — no custom invention.

The design-it-twice section is genuine and well-reasoned. The rejection of Option A is on practical grounds, not aesthetic preference.

The repository-dispatch + create-pull-request pattern for the Homebrew tap is slightly over-engineered for a project that may have 1-2 releases per month. A direct push to the tap repo (with the PAT) would be simpler. But the PR-based approach is safer for a "release artifact" as the spec demands, and the overhead is one extra GitHub Action, not a new system. Acceptable.

Minor concern: the plan creates a config-validation test (`electron-builder-config.test.ts`) that reads the YAML and asserts key values. This is testing configuration, not behavior. If the config changes, the test breaks even if the behavior is correct. This is a mild over-test — the real validation is "does `electron-builder --dir` produce a correct app directory?" But the plan also includes Task 7 (local dry-run validation) which covers that. The config test is belt-and-suspenders. Not a defect, but noted.

### 9. Verifiability — 7/10

Every AC has a concrete verification method with specific assertions. The test plan in Task 1 is detailed: file existence, grep for externals, grep for tsx absence. Task 2's migration test mocks `app.isPackaged` and asserts the path.

The "What can be tested locally vs CI-only" table (plan section 11) is excellent — it clearly separates what can be automated from what requires manual CI validation.

Deductions:

1. **No test for the full bundle → Electron boot cycle.** The plan tests that the bundle produces valid CJS, but doesn't test that `electron dist/main.cjs` actually boots (even partially). Task 7 (local dry-run) covers this manually but there's no automated test.

2. **Protected tests list is present and correct.** Existing test files are enumerated and the plan correctly states "assertions must not change, new cases may be added." Good.

3. **Homebrew formula validation.** The plan says `brew audit --cask Casks/hyperidle.rb` validates the formula. This is correct but requires Homebrew to be installed on the test machine, and the formula has PLACEHOLDER sha256 values that `brew audit` will flag. The plan should note that the initial formula only passes audit after the first real release populates the sha256 values.

---

## CRITICAL

1. **[plan section 2, section 5 Risks #5] Postgres/drizzle-orm transitive inclusion.** The `@hyperidle/db` barrel re-exports `createPgDb` from `pg-connection.ts` which imports `postgres` and `drizzle-orm/postgres-js` at the top level. esbuild processes the entire barrel file, not just the named imports. `postgres` is already in the external list, but `drizzle-orm/postgres-js` is not — it will be bundled (it's a subpath of `drizzle-orm` which is inlined). Fix: add `drizzle-orm/postgres-js` to the external list in esbuild config. Alternatively, restructure `@hyperidle/db` exports to separate SQLite and Postgres paths, but that's a larger change outside N5 scope.

2. **[plan section 7, workflow `update-homebrew` job] `shasum` does not exist on ubuntu-latest.** The `sha256` step uses `shasum -a 256` which is a macOS/Perl utility. Ubuntu provides `sha256sum` instead. Fix: replace `shasum -a 256 arm64.dmg | cut -d' ' -f1` with `sha256sum arm64.dmg | cut -d' ' -f1`.

3. **[plan section 7, workflow matrix] Cross-compilation strategy is uncommitted.** The plan's Risk #2 says "use separate runner types OR verify cross-compilation works" but the workflow uses `runs-on: macos-latest` for both arches. electron-rebuild cannot cross-compile better-sqlite3's C++ code from arm64 to x64 without explicit toolchain setup. Fix: use a matrix `include` that maps `arch: arm64` to `runs-on: macos-latest` and `arch: x64` to `runs-on: macos-13` (Intel runner).

## WARNING

4. **[plan section 2] Node target version is wrong.** The plan states "Electron 36 ships Node ~20" and uses `target: "node20"`. Electron 36 ships Node 22. Fix: change to `target: "node22"` in both esbuild invocations. (Using `node20` won't break the build but it's incorrect and prevents use of Node 22 features.)

5. **[plan section 2] Server dependencies not verified as bundle-safe.** The entire `@hyperidle/server` package graph is inlined, pulling in `ws`, `nodemailer`, `@anthropic-ai/claude-agent-sdk`, `@hono/node-server`, `hono`, and `zod`. The plan must verify these are all pure JS (no native addons) and that their total size is acceptable in the bundle. If any have native components, they must be added to the external list. Fix: add a reconciliation row for each server dependency confirming bundle-safety.

6. **[plan section 7] `npm install --package-lock-only` may not resolve workspace references.** The desktop package.json uses `"@hyperidle/db": "workspace:*"` and `"@hyperidle/server": "workspace:*"`. npm does not understand bun's `workspace:*` protocol. The `--package-lock-only` step may fail. Fix: the step only needs to resolve `better-sqlite3` for electron-rebuild. Either (a) use a minimal temporary package.json with just `better-sqlite3`, or (b) verify that npm handles the workspace protocol gracefully (it may ignore unresolvable deps during `--package-lock-only`). Document which approach is chosen.

7. **[plan section 7] Race condition in release asset polling.** The `update-homebrew` job waits for release assets by polling. But both arch matrix jobs upload to the same release concurrently. The polling loop only checks for the arm64 DMG — if the x64 DMG is not yet uploaded when the download step runs, the x64 download silently fails (curl returns a 404 HTML page, not a DMG) and the sha256 is computed on the error page. Fix: poll for BOTH DMGs before proceeding, or add a check that verifies the downloaded files are valid DMGs (e.g., file size > 1MB).

## SUGGESTION

8. **[plan section 2] Consider `--packages=external` for all non-workspace deps.** Instead of manually listing every npm package to externalize, esbuild's `--packages=external` flag externalizes everything in `node_modules`. Since electron-builder already includes `node_modules` in the asar, all npm packages would be available at runtime. This eliminates the need to track which packages have native components. The trade-off is a larger installed app (npm packages not tree-shaken) but removes an entire class of bundling bugs. Evaluate whether the simplicity gain outweighs the size cost.

9. **[plan section 5] `publish: null` may not fully suppress publishing.** In electron-builder 25+, `publish: null` suppresses auto-publish, but the CLI flag `--publish always` overrides it. The workflow does not pass `--publish`, so this is fine. But documenting that publish is suppressed by config AND by workflow omission makes the intent clearer.

10. **[plan section 8, Casks/hyperidle.rb] Copyright year is 2025 in a 2026 project.** The electron-builder.yml has `copyright: Copyright (c) 2025 HyperIdle`. The current date is May 2026. Update to 2025-2026 or 2026.

## What's Working Well

- **Design-it-twice is genuine.** Option A is a real alternative, not a straw man. The rejection rationale (split-brain dependency management) is specific and technical. This is the template for how design-it-twice should work.

- **The reconciliation table catches spec/reality drift proactively.** The plan doesn't pretend the spec matches reality — it enumerates every divergence and resolves each one. This eliminates a class of implementation surprises.

- **The "local vs CI-only" testability matrix.** This is a pattern other workpackages should adopt. It sets clear expectations for what the builder can verify locally and what requires the full CI pipeline, preventing false-negative testing.
