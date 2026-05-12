# Track N: Desktop Distribution

Ship HyperIdle as an installable Mac desktop app: `brew install --cask hyperidle`, double-click, the Factory is running on the user's machine. The server, database, and SPA all live inside one signed, notarized `.app` bundle.

See `plans/electron/concept.md` (UX concept), `plans/electron/concept-review.md` (adversarial review with two BLOCKERs), `plans/electron/plan-audit.md` (audit of original migration plan), and `plans/electron-node-migration.md` (technical migration sketch). The concept is the source of truth for UX; the review's BLOCKERs are folded into N2 and N3.

**Scope rule:** Bun stays as the dev runner and package manager. Only the user-shipped runtime (server + db + fabric + shared, plus the `web` build output) migrates to Node. Internal-only packages (`design-system`, `pipeline`, root `scripts/*.ts`) remain Bun.

---

### N1 — Node runtime for the user-shipped server

**Story.** As an agent packaging the desktop app, I want `packages/server` (and any production dependency it transitively needs) to run under Node so it can execute inside Electron's main process, while the rest of the monorepo continues to develop under Bun.

**Depends on.** None (works against current `main`).

**Acceptance criteria.**
- `packages/server/src/server-factory.ts` uses `@hono/node-server`'s `serve`; the Bun `serve` import is removed; the factory exports the raw `http.Server` so WS can attach.
- `packages/server/src/routes/ws.ts` uses `@hono/node-ws`'s `createNodeWebSocket(app)`; `wsHandler` export is replaced by `injectWebSocket(server)` which the factory calls after the HTTP server is created.
- `openProductionDb` in the factory uses `better-sqlite3` only; the `bun:sqlite` dynamic import is deleted.
- `packages/db/src/setup-cli.ts` no longer branches on `RUNNING_UNDER_BUN`; the `globalThis.Bun` shim is removed; the CLI runs under both `bun packages/db/src/setup-cli.ts` (dev) and `node packages/db/src/setup-cli.js` (post-build).
- `packages/server/src/services/git-export-runner.ts` `@lore` block updated to drop the "DEFERRED vs plan §7" framing — `node:child_process.spawn` is canonical.
- `packages/fabric/src/knowledge-repository.ts:189` comment updated; a Vitest covers BEGIN/COMMIT semantics under `better-sqlite3` if not already covered.
- `bun run dev` continues to work (server runs under `bun --hot` against the new factory; same paths, no Bun-specific runtime APIs are reintroduced).
- A new `packages/server/package.json` script `start:node` runs `node dist/index.cjs` (the bundled production entry); a separate workpackage produces the bundle (N6).
- `bun run check`, `bun run lint`, `bun run test` all green. Existing integration tests for `server-factory` and `ws-broadcaster` pass under both Bun (dev) and Node (when invoked via `tsx`).
- The full e2e WebSocket test suite (`__tests__/ws-subscribe-authz.test.ts` and friends) passes against the Node-served WS path.

**Validation scenarios.**
- Given a fresh checkout, when I run `bun run dev`, then the server boots, the SPA loads at `localhost:5173`, `/api/health` returns 200, and a WS subscribe + broadcast roundtrip succeeds.
- Given the same code path, when I run `tsx packages/server/src/index.ts` with `HYPERIDLE_API_KEY=test`, then the server starts under plain Node and the same e2e roundtrip succeeds.
- Given `packages/db/src/setup-cli.ts`, when I run it under both Bun and Node, then a fresh SQLite DB is created with all migrations applied identically.

**Contracts / constraints.**
- No new Bun APIs anywhere under `packages/{server,db,shared,fabric,web}`.
- No `tsx` or `@hono/node-*` deps leak into `packages/{design-system,pipeline}` or root `scripts/`.
- The dev server still uses `bun run --hot` — full process restart under Node is N6's concern, not N1's.
- Native modules (`better-sqlite3`) are not yet rebuilt against Electron — that's N4. N1 only proves Node-runtime parity.

**Effort.** M (~2d)

---

### N2 — Desktop auth model (X-API-Key injection) [BLOCKER from review]

**Story.** As a user launching HyperIdle for the first time, I want the SPA to talk to its bundled server without ever seeing or pasting an API key, so the app "just works" — while the server's `HYPERIDLE_API_KEY` auth gate (which protects every `/api/*` request via the `auth` middleware) remains intact.

**Depends on.** N1.

**Background.** The server's `index.ts` `process.exit(1)`s when `HYPERIDLE_API_KEY` is unset (`packages/server/src/index.ts:10`). Every `/api/*` request must include `X-API-Key` matching that value (`packages/server/src/middleware/auth.ts:39-40`). The React SPA today calls `fetch("/api/...")` with no header. In dev this works because the auth middleware reads `HYPERIDLE_API_KEY` from `.env` and the dev tooling presumably injects the header somewhere — verify or fix as part of this workpackage. In Electron production, no SPA call would succeed without explicit injection.

**Acceptance criteria.**
- A documented decision in `plans/electron/auth-decision.md` covering: how the desktop generates `HYPERIDLE_API_KEY` (auto-generated random 256-bit key on first launch, persisted to `userData/secrets.json`), how it reaches the server (env var on spawn), and how it reaches the SPA (preload script exposing a sealed `window.__HYPERIDLE_API_KEY__` consumed by a single fetch wrapper).
- A single fetch wrapper (`packages/web/src/services/api-client.ts` or extension of existing `useFetch`) injects `X-API-Key` on every `/api/*` request in both browser dev and Electron production. Hard-coded `fetch()` calls to `/api/*` are migrated.
- In dev, the wrapper reads `HYPERIDLE_API_KEY` from a Vite-injected env var (`VITE_HYPERIDLE_API_KEY`); a `.env.example` documents this.
- In Electron, the preload script exposes only the key (no node integration leak); the wrapper reads from `window.__HYPERIDLE_API_KEY__` if present, falls back to the Vite env var otherwise.
- CORS middleware (`packages/server/src/middleware/cors.ts`) becomes origin-aware: accepts `http://localhost:5173` (dev), `http://127.0.0.1:*` (Electron localhost), and is a no-op for same-origin requests when `HYPERIDLE_STATIC_DIR` is set.
- Vitest covers the fetch wrapper: header is present, header is correct, missing header → 401.
- Playwright e2e covers the desktop case: a request to `/api/health` succeeds same-origin without `X-API-Key` (health is unauthenticated), a request to `/api/teams` succeeds with the injected key.

**Validation scenarios.**
- Given a fresh Electron launch, when the SPA mounts and calls `/api/teams`, then the request includes `X-API-Key` and returns 200.
- Given the same launch, when the user inspects `window.__HYPERIDLE_API_KEY__` from DevTools, then the value is sealed (cannot be reassigned, not enumerable on its own without explicit access).
- Given a `userData/secrets.json` file with an existing key, when the app launches a second time, then the same key is reused and the SPA continues to make successful API calls.
- Given a Vite dev environment with `VITE_HYPERIDLE_API_KEY` set, when the SPA calls `/api/teams`, then the header is injected and the request succeeds.

**Contracts / constraints.**
- The `HYPERIDLE_API_KEY` is never displayed in UI — it's plumbing the user does not own. (The `ANTHROPIC_API_KEY` is what the user manages in Settings; that's N5.)
- Storage: filesystem in `userData/`, file mode 0600. No plaintext leak in logs. The bundle path itself is signed and notarized; we are not protecting against a local attacker with filesystem access on a single-user Mac.
- The preload script does NOT expose any other capability to the renderer. No `ipcRenderer`, no `require`, no Node globals.

**Effort.** M (~2d)

---

### N3 — Agent execution scope decision (harness-agnostic) [BLOCKER from review]

**Story.** As the founder, I want a written, evidence-backed decision on whether v1 ships with any agent execution, treating the harness as a generic abstraction over external AI agent runtimes (Claude, Cursor, Codex, custom — HyperIdle is the meta-harness, not a Claude wrapper). The decision drives the desktop's execution surface, not the choice of which AI vendor to integrate first.

**Depends on.** N1.

**Background.** The concept (`plans/electron/concept.md` §5) defers agent execution to v2 because "the harness requires Docker." The reviewer (`concept-review.md` Finding 1) found the harness adapters are not actually wired into production code today. The architecture (`packages/server/src/harness/`) already separates the **harness adapter** (the AI runtime — `claude-agent-sdk-adapter.ts` is one impl) from the **workspace adapter** (the execution sandbox — `local-` and `docker-` impls). The desktop question is about the workspace surface, not which AI vendor we plug in. Claude is the first impl available, but the design must keep harness selection open — Cursor, Codex, and bring-your-own runtimes are first-class.

**Acceptance criteria.**
- A spike that wires a `WorkspaceAdapter` + any one available `HarnessAdapter` end-to-end through the existing `session-provisioning` path. The spike must invoke the adapter through `HarnessAdapter` interface, not call vendor SDKs directly — proving the abstraction holds. The chosen harness adapter is whichever is most ready in the codebase; the test is that the *next* adapter could drop in without changing the desktop wiring.
- Capture from the spike: what binaries does the workspace path shell out to (`git`, `sh`, anything else)? what filesystem regions does it touch? what env vars must be present? does the harness adapter make outbound network calls beyond its vendor's API endpoint?
- Threat-model the workspace surface (NOT the harness vendor). In a single-user desktop context, is `LocalWorkspaceAdapter` an acceptable execution surface for an agent that the user explicitly invokes? Worst case: agent writes outside the workspace dir, agent runs an arbitrary binary the user has installed, agent exfiltrates files via the harness's API. Compare against the cost of requiring Docker Desktop (400MB, license question for orgs > 250 employees, a second background daemon) or building a new sandbox (Seatbelt / process limits / `chroot`-style on macOS).
- A written decision in `plans/electron/agent-execution-decision.md` with one of three outcomes:
  - **(a) Ship with `LocalWorkspaceAdapter` + a desktop-mode gate.** The gate replaces the current `NODE_ENV === "production"` refusal with a positive opt-in: only enabled when running inside the signed Electron bundle (e.g., `process.versions.electron && app.isPackaged`). Threat-modeled and documented.
  - **(b) Require Docker Desktop.** The first-run flow detects Docker; if absent, agent features are disabled with a clear "Install Docker to enable agents" CTA. The shell still ships and works without it.
  - **(c) Defer agent execution to a later track.** v1 desktop is a planner/reviewer. Agent execution lands when a sandbox decision is made.
- If the decision is (a) or (b): a follow-up workpackage entry is added to this track describing the wiring work and is added to `pipeline-manifest.yaml`.
- The decision document explicitly states **which harness adapters v1 supports** (likely "any harness with a Node-library SDK that the user provides credentials for") and **how new harnesses are added** (a one-paragraph extension point spec — not a full design, just enough that the next contributor knows where to look).

**Validation scenarios.**
- Given the spike completes, when I read `agent-execution-decision.md`, then the chosen option is justified by either a successful end-to-end run (a/b) or a documented blocker (c).
- Given the spike's harness adapter is swapped for a stub second adapter, when the same `session-provisioning` flow runs, then the swap is a one-file change with no desktop-layer modification — proving harness-agnosticism.
- Given the decision is locked, when I look at N4's acceptance criteria, then the agent UI scope matches the decision (no agent panes without an executor; no Claude-specific UI affordances).

**Contracts / constraints.**
- This is a decision workpackage — output is a document, a spike script, and possibly an added workpackage entry. No production code merges.
- **No vendor lock-in.** The decision and the spike must treat Claude as one harness among many. UI strings, settings labels, and code paths added downstream of this decision must read "AI harness" / "agent runtime," not "Claude."
- The decision is reversible: if v1 ships without agents and we later wire them, the desktop pipeline still works.

**Effort.** S (~1d for the spike, half-day for the writeup)

---

### N3a — Agent execution wiring for desktop

**Story.** As a desktop user, I want agents to execute when I start a session, using the `LocalWorkspaceAdapter` with desktop-mode gating and env sandboxing, so that the harness abstraction proven in N3's spike is wired into the production server boot path.

**Depends on.** N3, N4.

**Background.** N3's decision document (`plans/electron/agent-execution-decision.md`) chose option (a): ship with `LocalWorkspaceAdapter` + desktop-mode gate. The spike proved the adapter abstraction holds end-to-end. This workpackage implements the two required mitigations (env sandboxing, desktop-mode gate) and wires `provisionSession` into the server so sessions actually execute agents.

**Acceptance criteria.**
- `LocalWorkspaceAdapter` constructor accepts desktop mode via `HYPERIDLE_DESKTOP_MODE=true` env var instead of refusing on `NODE_ENV === "production"`. The multi-tenant guard remains active when the flag is absent.
- `runShell` in `local-workspace-adapter.ts` uses a sandboxed env allow-list (`PATH`, `HOME`, `LANG`, `TERM`) instead of inheriting `process.env`. `HYPERIDLE_API_KEY`, `DATABASE_URL`, and other process secrets are not accessible in the workspace shell.
- `provisionSession` is wired into the server boot path via the deployment profile system. The `laptop` profile instantiates `LocalWorkspaceAdapter` + the configured `HarnessAdapter`.
- The session CRUD route (`POST /api/sessions`) is updated to optionally trigger `provisionSession` when the server has a wired harness + workspace adapter pair.
- Settings UI (from N5) includes harness credential entry with harness-agnostic labels ("AI Runtime API Key", not "Anthropic API Key").

**Contracts / constraints.**
- No vendor lock-in. All labels, settings, and code paths use "harness" / "agent runtime" terminology.
- The desktop-mode gate uses an env var (`HYPERIDLE_DESKTOP_MODE`), not `process.versions.electron`, because the server may run under Node as an Electron subprocess.

**Effort.** M (~2d)

---

### N4 — Electron shell + server-in-main-process + first-run essentials

**Story.** As a user double-clicking HyperIdle.app, I want a single window that opens to the empty Factory in under 2 seconds on Apple Silicon (under 4s on Intel), with the server, database, migrations, and key storage all set up invisibly inside the same process.

**Depends on.** N1, N2.

**Acceptance criteria.**

*Shell + server*
- A new `packages/desktop/` package containing: `src/main.ts`, `src/preload.ts`, `electron-builder.yml`, `build/entitlements.mac.plist`, `package.json` with `electron`, `electron-builder` deps.
- `main.ts` resolves the DB path to `app.getPath('userData') + '/hyperidle.db'`, generates or reads `HYPERIDLE_API_KEY` from `userData/secrets.json` (per N2), sets `HYPERIDLE_STATIC_DIR` to the bundled web dist, calls the Node `server-factory` to start Hono on port 0 (random), and waits for `/api/health` to return 200 before opening the BrowserWindow.
- BrowserWindow loads `http://127.0.0.1:{port}` (literal `127.0.0.1`, not `localhost`).
- A startup splash is shown in the BrowserWindow until `/api/health` returns 200; if it doesn't return within 30s, an error dialog appears with [Open Logs] and [Quit].
- `app.requestSingleInstanceLock()` is called; second-instance launch focuses the existing window.
- Window state (position, size, fullscreen) is persisted to `userData/window-state.json` and restored on next launch.
- The application menu has the five-menu structure from concept §4.3 (HyperIdle / Edit / View / Window / Help) with Cmd+,, Cmd+Q, Cmd+W, Cmd+R (dev only), Cmd+Option+I (dev only), Help > Open Logs Folder, Help > Open Data Folder.
- A dev mode (`bun run --filter @hyperidle/desktop dev`) launches Electron pointed at the Vite dev server (`http://localhost:5173`) instead of the bundled static dir; the in-process server still runs.
- Server stdout/stderr is teed to `~/Library/Logs/HyperIdle/server.log` with size-based rotation (10MB, keep 3).
- Quitting the app gracefully calls `disposeApp` and `server.close()` before exit; no zombie processes.

*Migrations on launch*
- DB migrations run programmatically in `main.ts` (not via the CLI) before the server begins listening. Uses the existing `packages/db` migration logic.
- A schema-version check refuses to start if the DB schema is newer than the bundled migrations (downgrade protection); a fullscreen error dialog with [Quit] and [Reveal in Finder] is shown instead of the Factory shell.
- Migration progress is visible in the startup splash if it takes > 2 seconds; for fast installs, no flash.
- No sample/seed data on fresh install — the empty Factory shell is the first screen.

*User secrets via safeStorage*
- The Settings panel (existing component) gains a section for any user-supplied harness credentials (e.g., `ANTHROPIC_API_KEY` if the chosen v1 harness needs one — labels are harness-agnostic per N3). Keys stored via Electron's `safeStorage`, masked after entry (last 4 chars visible).
- `safeStorage.isEncryptionAvailable()` is checked at write time; if false, an inline warning ("Keychain unavailable — your key will be stored unencrypted in this session only") is shown and the key is held in memory only.
- The empty-state CTA on the welcome screen ("Add credentials") opens the Settings panel scrolled to the credentials section.

**Validation scenarios.**
- Given `electron .` is run from `packages/desktop/`, when the app launches against a fresh `userData/`, then migrations run, the BrowserWindow opens, the SPA loads, `/api/health` returns 200, a WS subscribe roundtrip works, and the empty Factory shell renders.
- Given the app is open, when I launch a second instance, then the existing window focuses and the second instance exits.
- Given the app is closed mid-session, when I relaunch, then the window opens at the same position/size and the same view I left.
- Given the user enters a harness credential in Settings, when the app is restarted, then the key is decrypted from `safeStorage` and is available to the harness adapter without re-prompting.
- Given `safeStorage.isEncryptionAvailable()` returns false, when the user enters a key, then the warning is shown and the key is not persisted to disk.
- Given a `userData/hyperidle.db` with a schema version higher than the bundled app's migrations, when the app launches, then the schema-newer error dialog appears (no Factory shell).
- Given the server fails to start within 30s (simulate by passing a bad DB path), when the app launches, then the error dialog appears and clicking [Quit] terminates the process cleanly.

**Contracts / constraints.**
- No `ipcRenderer` or `require` exposure to the renderer. The preload script exposes only the API key per N2.
- No setup wizard. Empty state is the first screen.
- Settings UI is harness-agnostic: no "Anthropic" / "Claude" copy hardcoded anywhere unless the chosen v1 harness from N3 dictates a specific label.
- Native modules are not yet rebuilt against Electron headers — running locally with `electron .` uses the dev `better-sqlite3`. The rebuild happens at packaging time (N5).
- This workpackage produces a runnable Electron app, NOT a distributable. Signing, notarization, and brew distribution are N5.

**Effort.** L (~4d)

---

### N5 — Ship: production bundle + sign + notarize + Homebrew

**Story.** As a user, I want one command — `brew install --cask hyperidle` — to put a signed, notarized HyperIdle.app in `/Applications/` that launches without a Gatekeeper warning.

**Depends on.** N4.

**Acceptance criteria.**

*Bundle*
- `esbuild` bundles `packages/server/src/index.ts` to a single CJS file at `packages/desktop/build/server.cjs`, externalizing only `better-sqlite3` and Electron-built-in modules. `tsx` is NOT included in the production bundle.
- `vite build` produces the SPA into `packages/web/dist/`; `electron-builder` copies it into the bundle's resources.
- `package-lock.json` is generated as a CI build artifact (`npm install --package-lock-only` against `packages/desktop/package.json`) so `electron-rebuild` can resolve native modules. NOT committed.
- `electron-rebuild` rebuilds `better-sqlite3` against Electron's Node ABI for `arm64` (and `x64` if Intel support is in scope — pick one, document it). The bundle includes the rebuilt native module.

*Sign + notarize*
- `electron-builder.yml`: `mac.target: dmg`, `mac.category: public.app-category.productivity`, `mac.hardenedRuntime: true`, `mac.notarize: true`, entitlements at `build/entitlements.mac.plist` covering `allow-jit` and `allow-unsigned-executable-memory` (Electron requires both) and `network.client` (for outbound harness-vendor API calls).
- A Developer ID Application certificate is configured (CI secret); notarization uses an App Store Connect API key (CI secret). Neither is committed; neither is logged.
- A GitHub Actions workflow `.github/workflows/desktop-release.yml` runs on tag push: install deps → bundle server → vite build → electron-builder package → notarize → upload signed DMG to the GitHub Release as a release asset.

*Homebrew distribution*
- A `hyperidle/homebrew-tap` GitHub repo exists with `Casks/hyperidle.rb` defining the cask: name, desc, homepage, version, sha256, URL pointing to the GitHub Release DMG.
- The cask formula uses `livecheck` so `brew upgrade` reports new versions correctly.
- Each release in the workflow above also updates the cask formula — version bump + sha256 update — committed to the tap repo (PR if auto-merge is too aggressive).
- `brew uninstall --cask hyperidle` removes the app; `userData/` is preserved across reinstalls. A `--zap` clause is defined for full purge.

**Validation scenarios.**
- Given a tagged release `v0.0.1`, when the workflow runs, then a signed and notarized DMG is uploaded to the GitHub Release AND the cask formula in the tap repo is updated to point at it.
- Given a fresh user account on macOS Sonoma (or later) with Homebrew installed, when they run `brew tap hyperidle/tap && brew install --cask hyperidle`, then the app installs and launches without a Gatekeeper "cannot verify" warning.
- Given the installed app, when I run `codesign -dv /Applications/HyperIdle.app`, the signature is valid; `spctl --assess --type execute /Applications/HyperIdle.app` reports `accepted`.
- Given the user runs `brew uninstall --cask hyperidle` and reinstalls, their `userData/hyperidle.db` is preserved.
- Given a new release is published and the tap formula updates, when the user runs `brew upgrade --cask hyperidle`, then the app upgrades to the new version.

**Contracts / constraints.**
- The production bundle is fully self-contained: no `npm install` or `node_modules` rehydration on the user's Mac.
- Signing identity and notarization credentials are CI secrets; never committed; never logged.
- The tap repo is the public-facing install surface — treat it like a release artifact.
- **No in-app auto-updater in v1.** Users update via `brew upgrade --cask hyperidle`. Adding `electron-updater` is a follow-up workpackage if/when brew-only updates prove insufficient.

**Effort.** L (~4d, plus ~1d of CI iteration the first time)

---

## Summary

```
N1 (Node migration)
  ├── N2 (Auth model — BLOCKER)
  ├── N3 (Agent exec decision, harness-agnostic — BLOCKER)
  └── N4 (Electron shell + first-run essentials)
        └── N5 (Ship: bundle + sign + notarize + Homebrew)
```

**Critical path:** N1 → N2 → N4 → N5.
N3 is a parallel decision that may add a follow-up workpackage (agent-execution wiring) before N4 if the founder chooses option (a) or (b). Updates are via `brew upgrade` for v1; in-app auto-update is deferred.
