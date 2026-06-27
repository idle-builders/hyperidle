# AQ1 — Architecture: delete isolation machinery, host-only run path

**Concept:** LOCKED — `plans/AQ1/concept.md`. Run-unit = a per-session working directory on the host; the agent runs as a host process with the user's environment; **no isolation is built, claimed, or defaulted-to.** Code noun stays `Sandbox*` (AK1 guard forbids `Workspace*`).

**Type:** pure deletion + wiring reduction. No new types, no schema, no API surface added. AQ2 builds isolation from scratch — never from this code.

**Design:** N/A (runtime, no rendered surface). One web Settings section is *removed* (see BLOCKER-1); no new UI.

---

## Required reading (engineer, before implementing)

- `plans/AQ1/concept.md` — the locked run-unit definition + rejection list.
- `.pipeline/work-packages/TRACK-AQ.md` → AQ1 section — ACs + "Scope of remove — HARD DELETE".
- `packages/server/src/harness/sandbox-adapter.ts` — the `SandboxAdapter` contract (KEEP).
- `packages/server/src/harness/local-sandbox-adapter.ts` — the surviving adapter (EDIT: lore/error-string scrub only).
- `packages/server/src/harness/cli-harness-adapter.ts` — the real host run path (KEEP, unchanged).
- `packages/server/src/server-factory.ts` — the composition root (EDIT).
- `packages/server/src/harness/adapter-pool.ts` — the isolated gate lives here (EDIT).
- ETHOS.md §1–§2 — *Build for the Fast*; *security earned, never preemptive*.

---

## Plan reconciliation (spec ⇆ reality)

Every spec assumption checked against the codebase. Disagreements and how the plan handles each:

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "`CredentialResolver` usage that only existed to feed `IsolatedHarnessAdapter`" | **FALSE.** `DbCredentialResolver` is the sole production credential resolver, wired throughout `server-factory.ts` (model resolution, dispatcher, assistant turns, MCP). `IsolatedHarnessAdapter` is the *only HarnessAdapter* whose constructor takes a `CredentialResolver`, but the resolver itself is load-bearing everywhere. | **KEEP `credential-resolver.ts` entirely.** Only delete the isolated adapter's *use* of it (the whole adapter file). No resolver edits. |
| "`HYPERIDLE_ENABLE_DOCKER` gate in adapter-pool" | The flag is **never read in production** — only named in comments + tests. No Docker adapter is ever registered. `DockerSandboxAdapter` is referenced only by tests, a disabled-adapter lore comment, and server-factory comments. | Delete the comment references + the file + its tests. There is no live Docker registration to unwire. |
| "`HYPERIDLE_ENABLE_ISOLATED` gate + registration in adapter-pool" | The flag **is read** (`adapter-pool.ts` §4, lines 504–540) but only logs a warning and **never registers** an adapter (the local pool factory has no resolver/config to wire it). Dead gate. | Delete the whole §4 block (lines ~504–540) + the `node:fs`/`node:path` imports it added. |
| "RemoteHarnessAdapter + its WebSocket worker wiring" | RemoteHarnessAdapter is the server end of a **full shipped subsystem (S4: desktop-as-remote-worker)** spanning server + shared + desktop + web UI. It is non-functional without RemoteHarnessAdapter. | Clean-cut the entire S4 remote-worker subsystem (see DELETE list + **BLOCKER-1**). No stub. |
| `LocalSandboxAdapter` is the only `SandboxAdapter` | Already true in production for the laptop profile; `DisabledSandboxAdapter` is selected for non-laptop server profiles; Docker/Isolated never selected. | KEEP `LocalSandboxAdapter` + `DisabledSandboxAdapter`. Remove Docker/Isolated selection paths (there are none live — just comments). |
| Host run path already real | Confirmed: dispatcher/`provisionSession` → `AdapterPool.select()` → `CliHarnessAdapter`/`ClaudeAgentSdkAdapter`/`BuiltinHarnessAdapter` → `spawn()` with `cwd = sandboxPath` (created by `LocalSandboxAdapter.spawn()`), env allowlist `["PATH","HOME","LANG"]` forwards real `HOME`. | **No change to the run path.** AQ1 only removes the alternatives + the "isolated/contained" framing. |

---

## The post-deletion run path (concrete)

Unchanged by AQ1 — this *is* the honest host path the concept describes:

1. Task ready → fabric dispatcher (or `provisionSession` for assistant turns) calls `adapterPool.select({ harnessType })` → returns a `CliHarnessAdapter` (codex/opencode), `ClaudeAgentSdkAdapter` (claude-code), or `BuiltinHarnessAdapter`.
2. `LocalSandboxAdapter.spawn(baseDir)` (`local-sandbox-adapter.ts`) `mkdir`s a per-session working dir under `HYPERIDLE_WORKSPACES_DIR` (default `os.tmpdir()/hyperidle-workspaces`) and returns `{ sandboxId, path }`.
3. AN2 provisioning re-applies held connections into that working dir; inherited tools are present for free because the harness reads the real `$HOME`.
4. The harness runs as a **host child process**: `CliHarnessAdapter` calls `spawn(binary, args, { cwd: sandboxPath, env: <allowlist + real HOME> })` (`cli-harness-adapter.ts`). No container, no fork-isolation, no WS.
5. Session ends → `LocalSandboxAdapter.destroy()` `rm -rf`s the working dir.

The only `SandboxAdapter` implementations after AQ1: `LocalSandboxAdapter` (laptop) and `DisabledSandboxAdapter` (non-laptop server profile — boots but refuses to provision; **not** isolation, it's a "no agents here" guard for the shared backend). Both honest, neither claims isolation.

---

## DELETE / EDIT — file-by-file

### A. Isolation machinery (mandatory, the core of AQ1)

**DELETE (source):**
- `packages/server/src/harness/docker-sandbox-adapter.ts`
- `packages/server/src/harness/isolated-harness-adapter.ts`
- `packages/server/src/harness/isolated-session-worker.ts`
- `packages/server/src/harness/isolated-session-protocol.ts`

**DELETE (tests):**
- `packages/server/src/harness/__tests__/docker-workspace-adapter.security.test.ts`
- `packages/server/src/__tests__/docker-workspace-adapter.lifecycle.test.ts`
- `packages/server/src/harness/__tests__/isolated-harness-adapter.test.ts`

**EDIT:**
- `packages/server/src/harness/adapter-pool.ts` — delete §4 block (lines ~504–540: the `HYPERIDLE_ENABLE_ISOLATED` gate + warnings + the Z8-050 Docker/Isolated lore comments) and the now-unused `import * as fs` / `import * as path` (lines 9–10) introduced for that block. `createLocalAdapterPool` then ends after `registerCliAdaptersIfAvailable`. No behavior change — the block never registered anything.
- `packages/server/src/harness/__tests__/af7-adapter-pool-gating.test.ts` — this test asserts the isolated/docker EXCLUSION + the gate-unset behavior. Its whole premise (gate the experimental adapters) is gone. **Replace** it with a single assertion that `createLocalAdapterPool()` registers only host adapters (claude-code, builtin, + available CLI tools) and contains **no** id matching `/isolated|docker|remote/`. (Rename to `aq1-adapter-pool-host-only.test.ts`.) This is the static "no isolation path" guard.
- `packages/server/src/harness/__tests__/AM4-adapter-pool-disabled.test.ts`, `adapter-pool.test.ts`, `X3-adapter-pool-type.test.ts`, `X5-adapter-pool-multi.test.ts`, `adapter-pool-ab1.test.ts`, `adapter-pool-s4.test.ts` — **scan each** for assertions on isolated/docker registration or the `HYPERIDLE_ENABLE_*` flags; remove only those assertions. (Most test selection/load-balancing, untouched. `adapter-pool-s4.test.ts` is named for the S4 remote feature — see §B; if it asserts remote-kind registration it goes with §B.)
- `packages/server/src/harness/local-sandbox-adapter.ts` — EDIT lore + error strings only: the file header lore and the constructor error message reference `DockerSandboxAdapter` as "the production isolated path." Rewrite to state the honest AQ1 reality (host execution in a working dir; the non-laptop refusal is a "no agents on shared backend" guard, not an isolation boundary). **Do not change behavior** — the `HYPERIDLE_PROFILE` non-laptop refusal stays (it backs `DisabledSandboxAdapter` selection; it is not isolation).
- `packages/server/src/harness/disabled-sandbox-adapter.ts` — EDIT lore comment only: drop the `DockerSandboxAdapter` reference ("DockerSandboxAdapter isn't provisioned"); restate as "the shared backend runs no agents; LocalSandboxAdapter executes on the host and is forbidden on server profiles." KEEP the class (it's the server-profile boot guard, unrelated to isolation).
- `packages/server/src/server-factory.ts` — EDIT comments only: lines 251–253 ("LocalSandboxAdapter refuses … Use a disabled no-op adapter") are fine; the selection logic (`isServerProfile ? DisabledSandboxAdapter : LocalSandboxAdapter`) **stays**. Remove any stray Docker/Isolated mention in comments. (If §B is taken, also remove the worker-WS wiring here — see §B.)

> **Note on `AdapterMeta.kind: "local" | "remote"`:** after §B the only registration site that sets `"remote"` (worker-ws.ts) is gone, so `kind` is effectively always `"local"`. Keep the field as-is (cheap; `AdapterInfo` is consumed by `GET /api/workers`). Do **not** churn it to a literal — out of scope, AK1-style no-rename discipline.

### B. Remote-worker (S4) subsystem — clean cut (see BLOCKER-1)

This is the "RemoteHarnessAdapter + its WebSocket worker wiring" the spec names. It is one coherent shipped feature (desktop app acts as a remote worker for a shared server). Deleting RemoteHarnessAdapter makes every other piece dead; the clean cut removes the whole subsystem rather than leaving a non-functional UI + protocol.

**DELETE (server):**
- `packages/server/src/harness/remote-harness-adapter.ts`
- `packages/server/src/routes/worker-ws.ts` (`WorkerConnectionManager` + `registerWorkerWsRoute` + `LIVE_WORKER_SOCKETS`)
- `packages/server/src/routes/workers.ts` (`GET /api/workers` admin route — its only purpose is listing remote workers; after §A there are no remote adapters and the local pool isn't user-surfaced) — **CONFIRM with BLOCKER-1**; if kept, it harmlessly lists local adapters.

**DELETE (server tests):**
- `packages/server/src/harness/__tests__/remote-harness-adapter.test.ts`
- `packages/server/src/routes/__tests__/worker-ws.test.ts`
- `packages/server/src/routes/__tests__/worker-ws-s4.test.ts`
- `packages/server/src/routes/__tests__/workers.test.ts`
- `packages/server/src/routes/__tests__/auth-worker-token.integration.test.ts`

**DELETE (shared):**
- `packages/shared/src/harness/worker-protocol.ts`
- `packages/shared/src/harness/__tests__/worker-protocol.test.ts`

**DELETE (desktop):**
- `packages/desktop/src/desktop-worker-client.ts`
- `packages/desktop/__tests__/desktop-worker-client.test.ts`

**DELETE (web):**
- `packages/web/src/settings/SettingsWorker.tsx`
- `packages/web/src/settings/SettingsWorker.stories.tsx`

**EDIT (rewire the cut):**
- `packages/shared/src/harness/index.ts` — remove the `worker-protocol.js` re-export block (lines 53–65).
- `packages/shared/src/index.ts` — remove the 11 worker/server message re-exports (lines ~218–235).
- `packages/server/src/app.ts` — remove `registerWorkerWebSocket` hook field + its call (lines ~124–133, 336–339), the `createWorkersRoutes` import + mount (line 47, ~455–459). Keep the `SandboxAdapter`/`workspaceAdapter`/`sandboxBasePath` wiring (host path).
- `packages/server/src/server-factory.ts` — remove the `registerWorkerWsRoute` import (line 23) + the `registerWorkerWebSocket` option (lines ~379–381).
- `packages/server/src/routes/auth.ts` — remove the `POST /worker-token` route (lines ~103–127) + the `HYPERIDLE_WORKER_TOKEN` read.
- `packages/server/src/routes/__tests__/AF11-authz.integration.test.ts` — remove AC3 (worker-token confinement) + AC3c (duplicate-active-id `WorkerConnectionManager`) blocks; keep the rest. (`protectedTests` candidate — confirm the remaining assertions are unchanged.)
- `packages/server/src/harness/__tests__/AL6-return-gate.integration.test.ts` — remove the single `RemoteHarnessAdapter: returnEnforcement='process-reengage'` sub-test (lines ~654–671). The opencode `process-reengage` coverage stays via the CLI adapter tests; only the *remote* variant goes.
- `packages/desktop/src/main.ts` — remove the `DesktopWorkerClient` import (line 23) + the entire worker block (worker IPC channels, `createWorkerClient`, `worker:enable/disable/pause/resume/status` handlers, auto-start on boot — lines ~643–760+) + the persisted `workerEnabled/workerMaxConcurrent/workerDeviceId` client-config usage at those sites.
- `packages/web/src/settings/settings-types.ts` — remove the `"worker"` section id (lines ~26, 59–60) + lore.
- `packages/web/src/pages/SettingsPage.tsx` — remove the `SettingsWorker` import (line 28) + the worker section render (lines ~171–178).
- `packages/web/src/window.d.ts` — remove the `WorkerStatus` type + the worker IPC bridge surface (lines ~9, 46+).
- Web AppShell `visibleSettingsSections` filter for `"worker"` (referenced from `settings-types.ts` lore) — **grep `AppShell.tsx` for `worker`** and remove the gate.

> After §B, `AdapterMeta.kind` / `AdapterInfo.kind` and the `paused`/`pause()`/`resume()` pool methods (S4 worker pause) become unused-by-anything-but-pool. Leave the pool methods (small, self-contained, no dead-import); `knip` will flag any newly-unreferenced exported symbol — clear those it reports, keep internal ones.

### C. Env / config cleanup

- `HYPERIDLE_ENABLE_DOCKER` — remove all comment references (`adapter-pool.ts`, server-factory, disabled-/local-sandbox lore). Never read in code; no config entry to remove.
- `HYPERIDLE_ENABLE_ISOLATED` — removed with the §A adapter-pool block. Confirm no remaining reads (`grep` must return zero non-test, non-deleted-test hits).
- `HYPERIDLE_WORKER_TOKEN` — removed with §B (`auth.ts`, `worker-ws.ts`). Remove from any `.env.example`/`docs/deployment/shared-backend.md` (flag for Phase-5 write-docs; do not edit docs now).
- `mountPath` / docker `image` options — gone with `docker-sandbox-adapter.ts`.
- `HYPERIDLE_WORKSPACES_DIR` — **KEEP** (the host working-dir base; honest AQ1 config).
- `HYPERIDLE_PROFILE` / `HYPERIDLE_LOCAL_MAX_CONCURRENT` / `HYPERIDLE_BUILTIN_MAX_CONCURRENT` — **KEEP** (host-path config, not isolation).
- `validate-env.ts` — no change (no docker/isolated/worker env validated there).

### D. Docs (note for Phase-5 `/write-docs` builder — do NOT edit now)

These describe Docker/isolated/remote-worker as the run-unit boundary and must be reconciled to "host working directory, no isolation (AQ2 adds opt-in)":
- `docs/architecture/components.md` (line ~300: "Each workspace is an isolated environment …")
- `docs/architecture/deployment-architecture.md`, `docs/architecture/system-overview.md`, `docs/architecture/technology-summary.md`
- `docs/deployment/shared-backend.md` (worker-token, remote worker), `docs/deployment/vps.md`, `docs/deployment/index.md`, `docs/guides/developer/deployment.md`, `docs/guides/user/deployment.md`, `docs/guides/developer/prerequisites.md` (Docker prereq)
- `docs/requirements/system-requirements.md`

---

## Ordered task list (each = one commit boundary)

1. **Red: host-only-pool guard + AC-encoding tests.** Rewrite `af7-adapter-pool-gating.test.ts` → `aq1-adapter-pool-host-only.test.ts` asserting `createLocalAdapterPool()` registers only host adapters and **no** id matches `/isolated|docker|remote/`. Add the live-proof spec stub (see Test strategy). These fail against current code (gate block still present / remote types still exported). *(depends on: nothing)*
2. **Delete §A isolation machinery.** Remove the 4 source files + 3 tests; edit `adapter-pool.ts` (drop §4 block + unused imports); scrub lore in `local-`/`disabled-sandbox-adapter.ts` + server-factory comments. `npm run check` + the §A tests green. *(depends on: 1)*
3. **Delete §B remote-worker subsystem — server + shared.** Remove remote adapter, worker-ws, workers route, worker-protocol (+ tests); rewire `index.ts` ×2, `app.ts`, `server-factory.ts`, `auth.ts`, AF11/AL6 test edits. `npm run check` green. *(depends on: 2; **gated by BLOCKER-1**)*
4. **Delete §B remote-worker subsystem — desktop + web.** Remove `desktop-worker-client.ts` (+ test), web `SettingsWorker*`, rewire `main.ts`, `settings-types.ts`, `SettingsPage.tsx`, `window.d.ts`, AppShell filter. `npm run check` + desktop build green. *(depends on: 3)*
5. **Env/comment scrub + knip clear.** Remove dangling `HYPERIDLE_ENABLE_*` / `HYPERIDLE_WORKER_TOKEN` references; run `npm run knip` + `npm run knip:production` and clear any newly-dead exports the cut surfaced. *(depends on: 4)*
6. **Live-proof.** Run the host-execution live proof (see Test strategy). Capture the transcript. *(depends on: 2 — only needs §A; can run after 5)*
7. **Verify.** `npm run verify` green (check + lint + knip + harness-vocab-guard + test:all + build + desktop build + attestation). *(depends on: all)*

> Order rationale (per the dependency-order learning): the host-only guard test (task 1) precedes deletion so the "no isolation path" AC is encoded before the code changes that satisfy it. §A precedes §B because §B is the larger, decision-gated cut.

---

## Acceptance criteria → verification method

| AC (from TRACK-AQ.md) | Verification |
|---|---|
| Session runs in a per-session host working dir with env inherited; **live run** proves a CLI harness executes + inherited tools work with no per-session auth | **Live-proof** (see below) — a real `claude`/`codex`/`opencode` (or `gh` inherited) session run on the host, transcript captured. This is the behavioral AC; it cannot be a unit test (real binary + real `$HOME`). |
| Default & only run path is host execution; Docker/Isolated/Remote + workers/gates/registration/tests **deleted** (not gated/stubbed) | `aq1-adapter-pool-host-only.test.ts` asserts pool has no `/isolated\|docker\|remote/` id (runtime). `npm run check` (TS strict) fails on any dangling import → proves the symbols are gone. `npm run knip` + `npm run lint` → no dead references. `git status` shows the files deleted, not emptied. |
| Held connections (AN2) provision into the host working dir; inherited present via host env (AN1 hard-rule 4 — nothing extracted) | AN2's existing provisioning tests stay green (host working dir is their default target — concept §Consumers). Live-proof step exercises an inherited tool. No new extraction code added (review lens). |
| `npm run verify` green | Task 7. |

---

## Test strategy (red phase + live-proof)

**Static/structural (the bulk of a deletion):**
- `npm run check` — TS strict is the primary net: any remaining import of a deleted symbol fails the build. This is what proves "deleted, not stubbed."
- `npm run knip` + `npm run knip:production` — dead-code net; confirms no orphan exports/files remain after the cut.
- `npm run lint` — Biome/ESLint; catches unused imports left by edits.
- `npm run harness-vocab-guard:check` — confirms no `Workspace*` noun crept back during edits (concept hard rule 3).

**Runtime behavioral (one new/rewritten test):**
- `aq1-adapter-pool-host-only.test.ts` — imports `createLocalAdapterPool`, asserts `pool.list()` contains only host adapters (`local-claude-code`, `local-builtin`, + any available CLI) and **no** id/kind indicating isolated/docker/remote. Encodes "no code path defaults to isolation."

**Live-proof (required by AC + the live-proof learning — a real session on the host):**
- Run the dev server (`npm run dev`) on the laptop profile, trigger one real agent session (assistant turn or task dispatch) through a CLI harness, and observe: (a) a working dir is created under `HYPERIDLE_WORKSPACES_DIR`; (b) the harness runs as a host child process (`ps`/transcript shows the `claude`/`codex`/`opencode` process with `cwd` = that dir); (c) an **inherited** tool works with no per-session login — e.g. the agent runs `gh auth status` (or `gh repo view`) and it succeeds because `$HOME`/`~/.config/gh` is the real one. Capture the transcript + the session result in the PR (link-only per AJ4 — no screenshots).
- This is the proof the run-unit is honestly the host. It belongs to the builder's green phase, not the designer.

**`protectedTests` (assertions must not change — DoD audits via `git diff --name-only`):**
- `packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts` — the inherited-tools-work invariant; must survive untouched (it is the closest existing automated proxy for the live-proof AC).
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts` — the host-spawn (`cwd`/env-allowlist) contract; the surviving run path.
- AN2 provisioning tests (held-connection provisioning into the working dir) — locate via `grep` for AN2 in `__tests__`; must stay green.

> Note: AF11/AL6 test files are **edited** (remote sub-cases removed) — they are *not* in `protectedTests` because the deletion legitimately removes assertions about deleted code. The migration step lists exactly which blocks are removed.

---

## Migrations (symbol/route/file removals → call sites)

Enumerated in the DELETE/EDIT list above. Summary of cross-file removals the builder must complete in one pass each:
- `worker-protocol` types → `delete` from `shared/src/harness/index.ts` + `shared/src/index.ts` re-exports; `delete` all importers (`remote-harness-adapter`, `worker-ws`, `desktop-worker-client` — all themselves deleted).
- `POST /api/auth/worker-token` route → `delete` (auth.ts) + delete its integration test + remove the desktop client that called it.
- `GET /api/workers` (`createWorkersRoutes`) → `delete`/confirm (app.ts mount + import + test).
- `SettingsWorker` → `delete` import + render (`SettingsPage.tsx`) + section id (`settings-types.ts`) + AppShell visibility filter + window.d.ts type.
- `HYPERIDLE_ENABLE_ISOLATED` / `HYPERIDLE_ENABLE_DOCKER` / `HYPERIDLE_WORKER_TOKEN` env reads → `delete` (no config schema entries exist for these — they were raw `process.env` reads).

---

## Route checklist (the cut must cover every mount/registration)

| Route / hook | File | Action |
|---|---|---|
| `GET /api/ws/worker` (worker WS upgrade) | `routes/worker-ws.ts` + `registerWorkerWebSocket` hook in `app.ts`/`server-factory.ts` | DELETE route file + hook field + call + import |
| `POST /api/auth/worker-token` | `routes/auth.ts` | DELETE route + `HYPERIDLE_WORKER_TOKEN` read |
| `GET /api/workers` | `routes/workers.ts` mounted in `app.ts` | DELETE (or confirm-keep as local-only) per BLOCKER-1 |
| user WS `/api/ws`, MCP route, all domain routes | unchanged | KEEP |

The §A adapter-pool gate is **not** a route — it's the `HYPERIDLE_ENABLE_ISOLATED` env branch in `createLocalAdapterPool`; deletion verified by the host-only pool test + `grep` returning zero reads.

---

## Security & abuse cases

This WP **removes** surface; it adds none. Per the default checklist:
- **Rate-limit / input-trust / SSRF / path-traversal / secret-handling on new POST/PATCH:** N/A — no new endpoints, fields, URLs, or paths introduced.
- **Removed attack surface (net positive):** deleting `worker-ws` (a token-gated WS that accepted remote registration + ran dispatched sessions) and `DockerSandboxAdapter` (argv-to-docker boundary) *shrinks* the attack surface. No security regression — the host run path (`CliHarnessAdapter` argv-form `spawn`, `local-sandbox-adapter` shell-via-`sh -c` cwd'd to the working dir) is unchanged and already the production reality.
- **AN1 hard-rule 4 (no credential extraction):** preserved — nothing is extracted; inherited tools work via the real host env, and no new code touches credentials. The deleted `IsolatedHarnessAdapter` was the one place that *injected* a resolved key into a forked env; removing it removes a copy-the-secret path. Net improvement, concept-aligned.
- **ETHOS §2 (no preemptive wall):** AQ1 ships zero isolation by default — exactly the posture. Isolation is AQ2, opt-in.

---

## Risks & BLOCKERs

**BLOCKER-1 (decision the builder must confirm before task 3) — scope of the remote-worker (S4) cut.**
AQ1's HARD-DELETE list names "RemoteHarnessAdapter + its WebSocket worker wiring." In reality that adapter is the server end of a **complete shipped feature**: the desktop app can register as a remote worker for a shared server (worker-ws route + worker-protocol + `DesktopWorkerClient` + `POST /worker-token` + a web **Settings → Worker** section + desktop IPC). Deleting RemoteHarnessAdapter makes all of it dead. The plan's recommendation is the **clean cut: delete the whole S4 subsystem** (§B) — leaving no stub, no dead UI — because (a) the concept explicitly rejects remote as a run path, and (b) a half-deleted subsystem (live UI + protocol with no server adapter) is worse than removal. This is a *scope expansion beyond "isolation machinery"* into a UI-bearing feature, so it is raised explicitly. If the founder wants the desktop-worker feature preserved for a future AQ2/remote track, the alternative is: delete only `RemoteHarnessAdapter` + `worker-ws` server wiring and **park** the desktop/web/shared-protocol pieces — but that leaves them non-functional and `knip`-dead, which contradicts "no dead references remain." **Recommendation: take the clean cut (§B).** Builder proceeds with §B unless the founder overrides.

**Risk 2 — `knip` surfacing newly-dead exports after the cut.** Removing remote consumers may strand exports (`AdapterInfo.kind`/`paused` pool methods, capability fields used only by remote). Mitigation: task 5 runs `knip` and clears exactly what it reports; keep internal-only pool methods (no dead-import). Quantified: low effort, bounded by `knip`'s report.

**Risk 3 — AN2/AO2 assume the host run-unit.** They are *downstream consumers* (concept §Consumers) and not yet built on remote/isolated, so the cut unblocks rather than breaks them. Verify AN2 provisioning tests stay green (protectedTests).

**Risk 4 — `disabled-sandbox-adapter` mistaken for isolation.** It is **not** — it's the "shared backend runs no agents" boot guard. Keep it; the lore edit must make this unambiguous so a future reader doesn't re-delete it as "isolation."

**Risk 5 — desktop build is a separate verify gate** (`npm run -w @hyperidle/desktop build`). The `main.ts` edit (task 4) must keep the desktop app compiling. Mitigation: task 4 ends on a green desktop build before task 7.

---

## sharedFiles (concurrent-WP overlap)

- `packages/shared/src/index.ts` — barrel; remote-protocol re-exports removed.
- `packages/shared/src/harness/index.ts` — harness barrel; worker-protocol re-export removed.
- `packages/server/src/app.ts` — composition; worker WS hook + workers route removed.
- `packages/server/src/server-factory.ts` — composition root; worker WS wiring removed.
- `packages/server/src/routes/auth.ts` — worker-token route removed.
- `packages/web/src/pages/SettingsPage.tsx`, `packages/web/src/settings/settings-types.ts`, `packages/web/src/window.d.ts` — Settings/IPC surface.
- `packages/desktop/src/main.ts` — desktop entry; worker block removed.

If another WP touches these concurrently, schedule AQ1 to merge first or rebase (it is a wide deletion).

---

## protectedTests

- `packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts`
- AN2 provisioning tests (resolve exact filenames via `grep AN2 packages/server/src/**/__tests__`).

(AF11/AL6 test files are intentionally edited — see Migrations — and are NOT protected.)
