# AQ1 — Architecture: delete isolation, realign remote to the scheduler axis, host-local run

**Concept:** LOCKED — `plans/AQ1/concept.md`. Run-unit = a per-session working directory on the host; the agent runs as a host process with the user's environment; **no isolation is built, claimed, or defaulted-to.** Code noun stays `Sandbox*` (AK1 guard forbids `Workspace*`).

**Founder scope (2026-06-28):** Two orthogonal axes. **Scheduler/distribution** axis = *where* a task runs (this desktop, or a joined remote desktop — which runs it **host-local**). **Sandbox** axis = *how isolated* it runs (a per-**agent** property, **deferred to AQ2**). AQ1 (a) **HARD-DELETES the isolation machinery only**, and (b) **KEEPS and REALIGNS the remote-worker subsystem** to the scheduler axis — it is distribution, not isolation. AQ1 does **not** implement the stubbed end-to-end remote transport (that is **AQ3**); it leaves remote correct-by-construction and clearly bounded.

**Type:** deletion + lore/comment realignment. No new types, no schema, no API surface added or removed (remote routes stay). AQ2 builds isolation from scratch — never from this code.

**Design:** N/A (runtime, no rendered surface). No UI removed (SettingsWorker stays — it is the scheduler surface, owned by AQ3).

---

## What changed from the prior plan (superseded)

The prior `architecture.md` planned to delete the **entire** S4 remote-worker subsystem (its BLOCKER-1: RemoteHarnessAdapter, worker-ws, /worker-token, desktop client, SettingsWorker, worker-protocol). **That is reverted.** Founder decision: remote = distribution/scheduling, NOT isolation — **keep it, realign it.** This plan deletes only the isolation adapters and realigns the remote path's framing. **All remote-DELETION edits from the prior plan are dropped.** Re-verified by grep against current code (see §Reconciliation).

---

## Required reading (engineer, before implementing)

- `plans/AQ1/concept.md` — locked run-unit definition + rejection list + the two-axis framing (founder refinement 2026-06-28).
- `.pipeline/work-packages/TRACK-AQ.md` → AQ1 section — ACs, "HARD DELETE (isolation only)", "KEEP and REALIGN the remote-worker subsystem"; skim AQ3 (owns the remote transport).
- `packages/server/src/harness/sandbox-adapter.ts` — the `SandboxAdapter` contract (KEEP).
- `packages/server/src/harness/local-sandbox-adapter.ts` — the surviving general adapter (EDIT: lore + error-string only).
- `packages/server/src/harness/disabled-sandbox-adapter.ts` — server-profile boot guard, NOT isolation (KEEP; EDIT lore only).
- `packages/server/src/harness/cli-harness-adapter.ts` — the real host run path (KEEP, unchanged; one lore line edit).
- `packages/server/src/harness/adapter-pool.ts` — the isolated gate + the lumped-with-remote lore live here (EDIT).
- `packages/server/src/harness/remote-harness-adapter.ts` — the kept scheduler adapter (KEEP; lore only if any).
- `ETHOS.md` §1–§2 — *Build for the Fast*; *security earned, never preemptive*.

---

## Plan reconciliation (spec ⇆ reality — re-verified by grep, 2026-06-28)

| Spec assumption | Reality (verified) | Plan handling |
|---|---|---|
| Isolation source files exist | `docker-sandbox-adapter.ts`, `isolated-harness-adapter.ts`, `isolated-session-worker.ts`, `isolated-session-protocol.ts` all present. | DELETE all 4 (§A). |
| Isolation tests | 5 files reference the isolation adapters as their subject: `__tests__/isolated-harness-adapter.test.ts`, `__tests__/docker-workspace-adapter.security.test.ts`, `src/__tests__/docker-workspace-adapter.lifecycle.test.ts`, plus a `DockerSandboxAdapter` `describe` block inside `__tests__/workspace-adapter.test.ts` (lines 155-180), plus `local-workspace-adapter.security.test.ts` asserting the error string recommends Docker. | DELETE the 3 docker/isolated-only test files; EDIT `workspace-adapter.test.ts` (remove the Docker block, keep the Local block) and `local-workspace-adapter.security.test.ts` (rewrite the Docker-string assertion). |
| `HYPERIDLE_ENABLE_ISOLATED` gate | **Read** in `adapter-pool.ts` §4 (lines 504-540) — logs a warning, **never registers** an adapter (no resolver/config in the local pool). Dead gate. | DELETE the §4 block + the `node:fs`/`node:path` imports it added (lines 9-10 if unused elsewhere — verify). |
| `HYPERIDLE_ENABLE_DOCKER` | **Never read** — only a comment in `adapter-pool.ts` (line 514) + a `vi.stubEnv` in `af7-adapter-pool-gating.test.ts` (line 47). | Scrub the comment + the test stub (test is rewritten anyway, §A). |
| `CredentialResolver` only fed the isolated adapter | **FALSE.** `DbCredentialResolver` is the sole production resolver, wired throughout `server-factory.ts`. `IsolatedHarnessAdapter` is the only HarnessAdapter taking a `CredentialResolver` in its ctor, but the resolver is load-bearing everywhere. | **KEEP `credential-resolver.ts` entirely.** Only the isolated adapter's *use* of it is removed (with the file). No resolver edits. |
| `IsolationConfig` type | Defined in `isolated-harness-adapter.ts`; imported only by `isolated-harness-adapter.test.ts` (both deleted) and named in adapter-pool §4 comment (deleted with the block). | Gone with §A. No orphan. |
| **`knip.json` force-lists the 3 deleted files as production entrypoints** | `knip.json` lines 49-51 (`packages/server` → `entry`) carry `src/harness/isolated-session-worker.ts!`, `…/isolated-harness-adapter.ts!`, `…/docker-sandbox-adapter.ts!` with a trailing `!` (forced entry — why knip never flagged them). After §A deletes the files, knip is configured to treat 3 **non-existent** files as entrypoints → `npm run knip` AND `npm run knip:production` (both in `verify`) ERROR on a missing configured entry. `harness-session-probe.ts!` (line 52) is NOT in the delete set. | EDIT `knip.json` (§A): delete the 3 forced-entry lines in the SAME commit as the source deletions; KEEP `harness-session-probe.ts!`. |
| **`AL6-return-gate.integration.test.ts` dynamically imports the deleted isolated adapter** | Lines 677-692 run `await import("../../harness/isolated-harness-adapter.js")` then `new IsolatedHarnessAdapter(...)`. `tsconfig` `moduleResolution:"bundler"` resolves dynamic-import specifiers → a deleted target is a TS2307 compile error → breaks `npm run check`. The `isolated-shaped-tier2` *mock name string* at line 545 is a bare string (no import) — harmless, KEEP. | EDIT (§A): remove the lines 677-692 subtest + its dynamic import; KEEP the `RemoteHarnessAdapter` subtest (line 654) and the line-545 mock. Move this file OUT of the "assertions must not change" protected set. |
| Remote = a boundary / isolation path | **FALSE — verified.** `grep -iE 'isolat\|boundary\|jail\|contain\|sandbox'` over `remote-harness-adapter.ts`, `worker-ws.ts`, `worker-protocol.ts`, `desktop-worker-client.ts`, `SettingsWorker.tsx` returns **zero** isolation hits. The only "boundary" hit is `requireBoundary` (the unrelated access-middleware in `workers.ts`). Remote is already framed as distribution ("delegates session execution to a connected worker"). `RemoteHarnessAdapter.getCapabilities()` declares an honest proxy (`mcpSupport:false`, `returnEnforcement:"process-reengage"`) — **no isolation semantics.** | KEEP the remote subsystem. REALIGN is **lore-level only** (§B): the one place that framed remote *together with* isolation is the adapter-pool §4 lore — deleted with the block. Confirm `AdapterMeta.kind:"local"\|"remote"` is the scheduler axis (it is) and leave it. |
| `AdapterMeta.kind:"local"\|"remote"` | This **is** the scheduler axis — `kind:"remote"` is set only when a worker registers a `RemoteHarnessAdapter` (`worker-ws.ts`); local adapters set `kind:"local"`. Honest distribution distinction, not isolation. | **KEEP as-is.** It is the correct realigned framing. No churn. |
| Host run path already real | Confirmed: dispatcher/`provisionSession` → `AdapterPool.select()` → `CliHarnessAdapter`/`ClaudeAgentSdkAdapter`/`BuiltinHarnessAdapter` → `spawn()` with `cwd = sandboxPath` (from `LocalSandboxAdapter.spawn()`), env allowlist `["PATH","HOME","LANG"]` forwards real `HOME`. | **No change to the run path.** AQ1 removes the isolation alternatives + the "isolated/contained" framing only. |

---

## The post-deletion run path (concrete, unchanged by AQ1)

This *is* the honest host path the concept describes — AQ1 does not touch it:

1. Task ready → fabric dispatcher (or `provisionSession` for assistant turns) calls `adapterPool.select({ harnessType })` → returns a `CliHarnessAdapter` (codex/opencode), `ClaudeAgentSdkAdapter` (claude-code), `BuiltinHarnessAdapter`, **or** — when the task is scheduled to a joined desktop — a `RemoteHarnessAdapter` (`kind:"remote"`) that proxies to that desktop, which runs the same host-local path there.
2. `LocalSandboxAdapter.spawn(baseDir)` `mkdir`s a per-session working dir under `HYPERIDLE_WORKSPACES_DIR` (default `os.tmpdir()/hyperidle-workspaces`) → `{ sandboxId, path }`.
3. AN2 provisioning re-applies held connections into that working dir; inherited tools are present for free because the harness reads the real `$HOME`.
4. The harness runs as a **host child process**: `CliHarnessAdapter.spawn(binary, args, { cwd: sandboxPath, env: <allowlist + real HOME> })`. No container, no fork-isolation. (A remotely-scheduled task does the identical thing on the joined desktop — host-local, not jailed.)
5. Session ends → `LocalSandboxAdapter.destroy()` `rm -rf`s the working dir.

The only `SandboxAdapter` implementations after AQ1: `LocalSandboxAdapter` (host execution) and `DisabledSandboxAdapter` (non-laptop server profile boot guard — boots, refuses to provision; **not** isolation, a "no agents on the shared backend" guard). Both honest; neither claims isolation.

---

## DELETE / EDIT — file-by-file

### A. Isolation machinery — HARD DELETE (the core of AQ1)

**DELETE (source):**
- `packages/server/src/harness/docker-sandbox-adapter.ts`
- `packages/server/src/harness/isolated-harness-adapter.ts` (carries `IsolationConfig`)
- `packages/server/src/harness/isolated-session-worker.ts`
- `packages/server/src/harness/isolated-session-protocol.ts`

**DELETE (tests — docker/isolated-only):**
- `packages/server/src/harness/__tests__/isolated-harness-adapter.test.ts`
- `packages/server/src/harness/__tests__/docker-workspace-adapter.security.test.ts`
- `packages/server/src/__tests__/docker-workspace-adapter.lifecycle.test.ts`

**EDIT (knip config — CRITICAL, same commit as the source deletions):**
- `knip.json` (`packages/server` → `entry`, lines 49-51): delete the three forced-entry lines
  ```json
  "src/harness/isolated-session-worker.ts!",
  "src/harness/isolated-harness-adapter.ts!",
  "src/harness/docker-sandbox-adapter.ts!",
  ```
  **KEEP** the next line `"src/harness/harness-session-probe.ts!"` (not in the delete set). Without this edit, `npm run knip` + `npm run knip:production` (both inside `npm run verify`) ERROR on three non-existent configured entrypoints — a knip *config* failure, not a dead-export one. Assertion: `npm run knip` + `npm run knip:production` green after the file deletions.

**EDIT (adapter-pool gate + lore):**
- `packages/server/src/harness/adapter-pool.ts`:
  - Delete the §4 block (lines ~504-540): the `HYPERIDLE_ENABLE_ISOLATED` gate, both `console.warn`s, the `@lore Z8-050` Docker + Isolated comments (this lore is the **one place** that framed Docker/Isolated/the experimental path together — its removal is the realignment of "isolation ≠ the run path"), and the `HYPERIDLE_ENABLE_DOCKER` comment (line 514). `createLocalAdapterPool` then ends after `registerCliAdaptersIfAvailable` → `return pool`.
  - Remove the now-unused `import * as fs from "node:fs"` / `import * as path from "node:path"` (lines ~9-10) **iff** grep confirms they are used nowhere else in the file.
  - **KEEP** `AdapterMeta.kind:"local"|"remote"` (lines 25, 36) and the `kind:"local"` registration sites — the scheduler axis (realigned, not removed).
  - Assertion: no behavior change (the block never registered anything); `npm run check` green; the host-only pool test (§Test strategy) green.

**EDIT (rewrite the gating test → host-only guard):**
- `packages/server/src/harness/__tests__/af7-adapter-pool-gating.test.ts` → rename `aq1-adapter-pool-host-only.test.ts`. Its premise (gate the experimental isolated/docker adapters) is gone. Replace with: `createLocalAdapterPool()` registers the always-present host adapters (`local-claude-code`, `local-builtin`, + any available CLI) and contains **no** id matching `/isolated|docker/`. **Do NOT assert remote absence** — remote adapters register at worker-connect time, not in the local-pool factory, and remote is kept (scheduler axis). This is the static "no isolation path on the local pool" guard.

**EDIT (isolation refs inside otherwise-surviving tests):**
- `packages/server/src/harness/__tests__/workspace-adapter.test.ts` — remove the `describe("DockerSandboxAdapter", …)` block (lines ~155-180) and its `import { DockerSandboxAdapter }` (line 5). **KEEP** the `LocalSandboxAdapter` block (lines 21-154) — it tests the surviving adapter. Assertion: file imports no deleted symbol; `LocalSandboxAdapter` block unchanged + green.
- `packages/server/src/harness/__tests__/local-workspace-adapter.security.test.ts` — the `"error message recommends DockerSandboxAdapter"` test asserts `toThrow(/Docker/i)`. After the error string is rewritten (see `local-sandbox-adapter.ts` edit), rewrite this assertion to match the new message (host-execution / server-profile guard wording — `/not allowed.*server/i`) and rename the test. The `"constructor throws … on a server profile"` (`/not allowed/i`) test stays. Assertion: green against the rewritten error string.
- `packages/server/src/harness/__tests__/AL6-return-gate.test.ts` — remove the `import { IsolatedHarnessAdapter }` (line 27) and the single `it("IsolatedHarnessAdapter: returnEnforcement='sdk-inprocess' …")` subtest (lines ~318-330). The SDK in-process coverage stays via `ClaudeAgentSdkAdapter`. Assertion: file compiles, remaining subtests green.
- `packages/server/src/harness/__tests__/AL6-reprompt-loop.integration.test.ts` — remove the `test("IsolatedHarnessAdapter declares returnEnforcement='sdk-inprocess'", …)` block (lines ~495-510). Assertion: file compiles, the SDK/CLI/remote subtests around it stay green.
- `packages/server/src/harness/__tests__/AL6-return-gate.integration.test.ts` — remove the `test("IsolatedHarnessAdapter: returnEnforcement='sdk-inprocess' …")` block (lines ~677-692) **and its dynamic `await import("../../harness/isolated-harness-adapter.js")`**. This is a `check` blocker, not just a test edit: `moduleResolution:"bundler"` resolves the dynamic-import specifier, so a deleted target is TS2307. **KEEP** the `RemoteHarnessAdapter` subtest (line 654 — the protected remote seam) and the `isolated-shaped-tier2` mock name string (line 545 — a bare string, no import). This file is therefore **intentionally edited** (isolated subtest removed) — it is NOT in the "assertions must not change" protected set; only its *remote* subtest's behavior is protected. Assertion: file compiles, remaining subtests (incl. the remote one) green.

**EDIT (source lore + error strings referencing the deleted adapters):**
- `packages/server/src/harness/local-sandbox-adapter.ts`:
  - Header lore (lines 3-4): drop "Error messages retain DockerSandboxAdapter to remain grep-able"; restate the honest AQ1 reality (host execution in a working dir; the non-laptop refusal backs `DisabledSandboxAdapter` and is a "no agents on the shared backend" guard, **not** isolation).
  - Constructor error message (line ~69) + the surrounding comment (lines ~60-72: "escape the intended Docker boundary"): rewrite to remove the `DockerSandboxAdapter` reference. New message e.g. `"LocalSandboxAdapter is not allowed on a server profile; the shared backend runs no agents (set HYPERIDLE_PROFILE=laptop to run host-local)."` **Do NOT change behavior** — the `HYPERIDLE_PROFILE` non-laptop refusal stays. (The matching test assertion is updated above.)
- `packages/server/src/harness/disabled-sandbox-adapter.ts` — lore (lines ~9): drop the `DockerSandboxAdapter` reference; restate as "the shared backend runs no agents; `LocalSandboxAdapter` executes host-local and is forbidden on server profiles." KEEP the class (server-profile boot guard, unrelated to isolation).
- `packages/server/src/harness/cli-harness-adapter.ts` — line ~678 `@lore X5 W1: … mirrors IsolatedHarnessAdapter pattern`: drop the dangling reference to the deleted adapter (restate the SIGTERM→SIGKILL pattern on its own terms). Behavior unchanged.
- `eslint.config.ts` — line ~1115 comment `// runtime. Forwarding relays (isolated-session-worker, desktop-worker-client)`: drop the `isolated-session-worker, ` from the prose (comment-only, in an AL6 relay-annotation rule's explanation — not a rule target, so it does not break `lint`/`check`/`knip`). Removes a stale reference to a deleted file so the sweep stays honest (New-Hire lens). KEEP `desktop-worker-client` (remote subsystem kept). Comment-only, no behavior change.

### B. Remote-worker subsystem — KEEP + REALIGN (lore only)

The grep sweep proved the remote path carries **no** isolation/sandbox/boundary framing in code — it is already distribution. So REALIGN is confined to (1) the lumped-with-isolation lore (deleted in §A's adapter-pool block) and (2) confirming the scheduler-axis seam is coherent in the no-sandbox world. **No remote source/test/route/UI file is deleted.**

| File → symbol | What changes | Assertion it's realigned |
|---|---|---|
| `adapter-pool.ts` — `@lore Z8-050` (Docker + Isolated) in §4 | Deleted with the §4 block (§A). This was the only lore that framed the experimental/remote/isolated paths as one "boundary" family. | `grep -iE 'isolat\|boundary\|jail' adapter-pool.ts` → 0 hits; `kind:"remote"` retained (scheduler axis). |
| `adapter-pool.ts` — `AdapterMeta.kind` / `AdapterInfo.kind` `"local"\|"remote"` | **No change** — this is the scheduler axis, the correct realigned model. Confirm no comment recasts it as isolation. | `kind` documented/used as where-it-runs (local vs joined desktop), not how-isolated. `npm run check` green. |
| `remote-harness-adapter.ts` — `getCapabilities()` (line 210), header lore (lines 1-9) | **No isolation framing exists** (verified). Leave the honest-proxy capabilities as-is. If any future reader could misread `S2:` as a sandbox tier, add one lore line: "remote = scheduler axis (run host-local on a joined desktop), not a sandbox boundary." Otherwise no edit. | `getCapabilities()` returns the proxy caps unchanged; `grep -iE 'isolat\|boundary\|jail' remote-harness-adapter.ts` → 0. |
| `routes/worker-ws.ts`, `routes/workers.ts` | **No change** — `requireBoundary` is the access-middleware, unrelated to isolation; worker-ws is the distribution transport (kept, AQ3 owns its end-to-end completion). | Files compile; their tests pass; no isolation semantics. |
| `shared/src/harness/worker-protocol.ts` + barrels | **No change** — protocol is distribution wire-format. Re-exports stay. | `npm run check` green; types still exported/consumed. |
| `desktop/src/desktop-worker-client.ts`, `desktop/src/main.ts` worker block | **No change** — desktop-as-worker is the scheduler client. | Desktop build green. |
| `web/src/settings/SettingsWorker.tsx` (+ `settings-types.ts`, `SettingsPage.tsx`, `window.d.ts`, AppShell filter) | **No change** — the scheduler surface, owned by AQ3 (the spec says `SettingsWorker` "may need work — `/design` decides" in AQ3). AQ1 leaves it untouched. | Renders; `npm run test` (snapshot net) unchanged. |
| Remote tests: `remote-harness-adapter.test.ts`, `worker-ws.test.ts`, `worker-ws-s4.test.ts`, `workers.test.ts`, `auth-worker-token.integration.test.ts`, `worker-protocol.test.ts`, `desktop-worker-client.test.ts`, AF11 worker-token blocks | **KEEP ALL.** These prove the realigned scheduler seam compiles and its contracts hold. The prior plan deleted them — **reverted.** | `npm run test` + `npm run check` green at the remote seam; the subsystem is coherent, not broken. |
| `AL6-return-gate.integration.test.ts` | **EDITED, not KEEP-ALL.** Its **remote** subtest (line 654) is protected (realign must not break the scheduler seam), but its **isolated** subtest (lines 677-692, with a dynamic import of the deleted adapter) is REMOVED in §A task 3. The line-545 `isolated-shaped-tier2` mock string stays. | Remote subtest green; isolated subtest gone; `npm run check` green (no dangling dynamic import). |

> **Seam-coherence assertion (AC).** After §A, the remote subsystem must still compile and its tests pass *in the no-sandbox world* — i.e. nothing the remote path imported was deleted (verified: remote imports `worker-protocol`, `AdapterPool`, `HarnessAdapter` types — none in the §A delete set). The end-to-end transport remains stubbed (AQ3); AQ1 asserts only that what exists is correct-by-construction and isolation-free.

### C. Env / config cleanup

- `HYPERIDLE_ENABLE_DOCKER` — remove the comment reference (`adapter-pool.ts` line 514) + the `vi.stubEnv` in the rewritten gating test. Never read; no config entry exists.
- `HYPERIDLE_ENABLE_ISOLATED` — removed with the §A adapter-pool block. Confirm zero remaining reads (`grep` returns only deleted-test hits, which are also gone).
- `HYPERIDLE_WORKER_TOKEN` — **KEEP** (the worker-WS join token; distribution, not isolation — auth.ts `/worker-token` stays).
- `HYPERIDLE_WORKSPACES_DIR` — **KEEP** (the host working-dir base; honest AQ1 config).
- `HYPERIDLE_PROFILE` / `HYPERIDLE_LOCAL_MAX_CONCURRENT` / `HYPERIDLE_BUILTIN_MAX_CONCURRENT` — **KEEP**.
- `mountPath` / docker `image` options — gone with `docker-sandbox-adapter.ts`.
- `validate-env.ts` — no change.

### D. Docs (note for Phase-5 `/write-docs` builder — do NOT edit now)

Reconcile only the **isolation** framing of the run-unit to "host working directory, no isolation (AQ2 adds opt-in)"; keep the remote-worker docs as **distribution/scheduling** (AQ3 completes them). Flagged files:
- `docs/architecture/components.md` (~line 300: "Each workspace is an isolated environment …"), `deployment-architecture.md`, `system-overview.md`, `technology-summary.md`.
- `docs/deployment/*` + `docs/guides/*/deployment.md` — keep the remote-worker/worker-token sections (distribution); only scrub Docker-as-isolation prereqs. `docs/guides/developer/prerequisites.md` (Docker prereq → drop, no longer needed).
- `docs/requirements/system-requirements.md`.
- `docs/agent-layer/return-gate-enforcement.md` (the `isolated` → `sdk-inprocess` adapter row), `docs/product/launch-readiness-audit.md` ("7 adapters … isolated"), `docs/product/vision-gap-audit.md` — all mention `isolated` as a live adapter. Phase-5 only, not a build gate; widen the sweep so the `/write-docs` builder finds them.

---

## Ordered task list (each = one commit boundary)

1. **Red: host-only-pool guard + isolation-ref test edits.** Rewrite `af7-adapter-pool-gating.test.ts` → `aq1-adapter-pool-host-only.test.ts` (pool has no `/isolated|docker/` id; **does not** assert remote absence). These fail against current code (the §4 gate still emits the isolated warning). *(depends on: nothing)*
2. **Delete §A isolation machinery + adapter-pool gate + knip config.** Remove the 4 source files + 3 docker/isolated-only test files; delete the adapter-pool §4 block (gate + lumped lore) + unused `fs`/`path` imports; **delete the 3 forced-entry lines from `knip.json` (lines 49-51) in this same commit** (keep `harness-session-probe.ts!`). `npm run check` + `npm run knip` + `npm run knip:production` + the host-only test green. *(depends on: 1)*
3. **Edit isolation refs inside surviving tests.** `workspace-adapter.test.ts` (drop Docker block + import), `local-workspace-adapter.security.test.ts` (rewrite Docker-string assertion), `AL6-return-gate.test.ts` (drop Isolated subtest + import), `AL6-reprompt-loop.integration.test.ts` (drop Isolated subtest), **`AL6-return-gate.integration.test.ts` (drop the lines 677-692 Isolated subtest + its dynamic import — a `check` blocker; KEEP the line-654 remote subtest + the line-545 mock string)**. `npm run check` + these files green. **KEEP every remote test (and every other file's remote subtests) untouched.** *(depends on: 2)*
4. **Source lore + error-string scrub.** `local-sandbox-adapter.ts` (header lore + ctor error string + comment), `disabled-sandbox-adapter.ts` (lore), `cli-harness-adapter.ts` (X5 W1 lore line), **`eslint.config.ts:1115` (drop `isolated-session-worker, ` from the relay comment)**. Behavior unchanged; matches the test edit in task 3. `npm run check` + `npm run lint` green. *(depends on: 3)*
5. **REALIGN confirm + knip clear.** Confirm `grep -iE 'isolat|boundary|jail' ` over the remote files is 0 and `kind:"remote"` is intact; add the one optional clarifying lore line to `remote-harness-adapter.ts` if warranted. Run `npm run knip` + `npm run knip:production` + `npm run harness-vocab-guard:check`; clear any newly-dead export the isolation cut surfaced (expect none — remote is kept). *(depends on: 4)*
6. **Live-proof.** Run the host-execution live proof (see Test strategy). Capture the transcript (link-only, AJ4 — no screenshots). *(depends on: 2 — only needs §A; run after 5)*
7. **Verify.** `npm run verify` green (check + lint + knip + harness-vocab-guard + test:all + build + desktop build + attestation). *(depends on: all)*

> Order rationale (dependency-order learning): the host-only guard test (task 1) precedes deletion so the "no isolation path" AC is encoded before the code that satisfies it. Test-ref edits (task 3) follow the deletion so `check` red→green is one clean transition. No §B deletion exists, so there is no decision-gated cut — task ordering is purely mechanical.

---

## Acceptance criteria → verification method

| AC (TRACK-AQ.md AQ1) | Verification |
|---|---|
| Session runs in a per-session host working dir, env inherited; **live run** proves a CLI harness executes + inherited tools work, no per-session auth | **Live-proof** (below) — a real `claude`/`codex`/`opencode` session on the host, an inherited tool (`gh`) succeeds; transcript captured. Behavioral AC; not a unit test (real binary + real `$HOME`). |
| Default & only **local** run path is host execution; `DockerSandboxAdapter`/`IsolatedHarnessAdapter` (+ workers/gates/registration/tests) **deleted** (not gated/stubbed) | `aq1-adapter-pool-host-only.test.ts` asserts the local pool has no `/isolated|docker/` id (runtime). `npm run check` (TS strict) fails on any dangling isolation import → proves the symbols are gone. `knip` + `lint` → no dead refs. `git status` shows the 4 source + 3 test files deleted, not emptied. |
| Remote subsystem **kept and realigned** to the scheduler axis: no isolation/boundary framing or coupling on the remote path; compiles + tests pass at the seam; **transport NOT implemented (AQ3)** | `grep -iE 'isolat\|boundary\|jail' ` over the 6 remote files → 0. Every remote test (and the remote subtest in `AL6-return-gate.integration.test.ts`) stays green (`npm run test`). `npm run check` proves the remote path's imports survive the isolation cut. The stub transport is unchanged — AQ3's scope, asserted untouched. |
| Live run proves the local host path works end-to-end | Same live-proof step. |
| Held connections (AN2) provision into the host working dir; inherited present via host env (AN1 hard-rule 4 — nothing extracted) | AN2 provisioning tests stay green (host working dir is their default target). Live-proof exercises an inherited tool. No new extraction code (review lens). |
| `npm run verify` green | Task 7. |

---

## Test strategy (red phase + live-proof)

**Static/structural (the bulk of a deletion — the "deleted, not stubbed" net):**
- `npm run check` — TS strict: any remaining import (static **or** dynamic — `moduleResolution:"bundler"` resolves `import()` specifiers) of a deleted isolation symbol fails the build. Primary proof of deletion. This is what catches the `AL6-return-gate.integration.test.ts` dynamic import if its subtest is not removed.
- `npm run knip` + `npm run knip:production` — dead-code net; confirms no orphan exports/files after the isolation cut **and** that no configured entrypoint is missing (the three forced `knip.json` entries must be deleted in lockstep with the files, else knip errors). (Remote exports stay live — kept subsystem.)
- `npm run lint` — Biome/ESLint; catches unused imports left by edits.
- `npm run harness-vocab-guard:check` — confirms no `Workspace*` noun crept back (concept hard rule 3).

**Runtime behavioral (one rewritten test):**
- `aq1-adapter-pool-host-only.test.ts` — imports `createLocalAdapterPool`, asserts `pool.list()` ids include the host adapters and **no** id matches `/isolated|docker/`. **Asserts only docker/isolated absence — remote adapters MAY register** (they register at worker-connect, not in this factory; remote is the kept scheduler axis). Encodes "no isolation path on the local pool."

**Live-proof (required by AC + the live-proof learning — a real session on the host):**
- Run `npm run dev` on the laptop profile, trigger one real agent session (assistant turn or task dispatch) through a CLI harness, observe: (a) a working dir created under `HYPERIDLE_WORKSPACES_DIR`; (b) the harness runs as a host child process (`ps`/transcript shows `claude`/`codex`/`opencode` with `cwd` = that dir); (c) an **inherited** tool works with no per-session login — the agent runs `gh auth status` (or `gh repo view`) and it succeeds because `$HOME`/`~/.config/gh` is the real one. Capture the transcript + session result in the PR (link-only per AJ4 — no screenshots).
- This is the builder's green-phase proof, not the designer's.

**`protectedTests` (assertions must not change — DoD audits via `git diff --name-only`):**
- `packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts` — the inherited-tools-work invariant; the closest automated proxy for the live-proof AC.
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts` — the host-spawn (`cwd`/env-allowlist) contract; the surviving run path.
- The remote-subsystem tests (`remote-harness-adapter.test.ts`, `worker-ws.test.ts`, `worker-ws-s4.test.ts`, `workers.test.ts`, `auth-worker-token.integration.test.ts`, `worker-protocol.test.ts`, `desktop-worker-client.test.ts`) — **protected: realign must not break the kept scheduler seam.** `AL6-return-gate.integration.test.ts` is **partially edited** (isolated subtest 677-692 removed); only its **remote** subtest (line 654) is protected — see the footnote.
- AN2 provisioning tests (resolve via `grep AN2 packages/server/src/**/__tests__`).

> Note: `AL6-return-gate.test.ts`, `AL6-reprompt-loop.integration.test.ts`, `AL6-return-gate.integration.test.ts`, `workspace-adapter.test.ts`, `local-workspace-adapter.security.test.ts`, `af7-adapter-pool-gating.test.ts` are **intentionally edited** (isolation sub-cases removed / Docker-string assertion rewritten) — they are NOT in the "assertions must not change" protected set. For `AL6-return-gate.integration.test.ts` the carve-out is precise: its **remote** subtest (line 654) must stay green, but its **isolated** subtest (677-692) + dynamic import are removed. The §A list names exactly which blocks change.

---

## Migrations (symbol/file removals → call sites)

- `DockerSandboxAdapter` / `docker-sandbox-adapter.ts` → delete file; remove importers in `workspace-adapter.test.ts` (Docker `describe` block) + the 2 docker test files (deleted); scrub the error-string + lore references in `local-`/`disabled-sandbox-adapter.ts`.
- `IsolatedHarnessAdapter` / `IsolationConfig` / `isolated-harness-adapter.ts` → delete file; remove importers in `isolated-harness-adapter.test.ts` (deleted), `AL6-return-gate.test.ts` (subtest+import removed), `AL6-reprompt-loop.integration.test.ts` (subtest removed), `AL6-return-gate.integration.test.ts` (lines 677-692 subtest + dynamic import removed — KEEP the line-654 remote subtest + line-545 mock string); drop the `cli-harness-adapter.ts` lore mention.
- `isolated-session-worker.ts` / `isolated-session-protocol.ts` → delete; referenced only by the adapter-pool §4 block (deleted) + the deleted isolated adapter.
- `HYPERIDLE_ENABLE_ISOLATED` / `HYPERIDLE_ENABLE_DOCKER` env reads/comments → delete (no config schema entries — raw `process.env` reads/comments only).
- `knip.json` forced-entry lines (`isolated-session-worker.ts!`, `isolated-harness-adapter.ts!`, `docker-sandbox-adapter.ts!`) → delete with the source files (keep `harness-session-probe.ts!`), else `knip`/`knip:production` error on missing entrypoints.
- `eslint.config.ts:1115` comment mention of `isolated-session-worker` → scrub.
- **No remote/worker migrations** — the subsystem is kept.

---

## Route checklist

| Route / hook | File | Action |
|---|---|---|
| `GET /api/ws/worker` (worker WS) + `registerWorkerWebSocket` hook | `routes/worker-ws.ts` + `app.ts`/`server-factory.ts` | **KEEP** — distribution transport (AQ3 completes it). |
| `POST /api/auth/worker-token` | `routes/auth.ts` | **KEEP** — worker join token (scheduler, not isolation). |
| `GET /api/workers` | `routes/workers.ts` | **KEEP** — lists joined workers (scheduler surface). |
| user WS `/api/ws`, MCP route, all domain routes | unchanged | KEEP. |

The §A adapter-pool gate is **not** a route — it's the `HYPERIDLE_ENABLE_ISOLATED` env branch in `createLocalAdapterPool`; deletion verified by the host-only pool test + `grep` returning zero reads.

---

## Security & abuse cases

This WP **removes** isolation surface; it adds none, and removes no remote surface.
- **Rate-limit / input-trust / SSRF / path-traversal / secret-handling on new endpoints:** N/A — no new endpoints, fields, URLs, or paths.
- **Removed attack surface (net positive):** deleting `DockerSandboxAdapter` (argv-to-docker boundary) + `IsolatedHarnessAdapter` (the one place that injected a resolved key into a forked env) *shrinks* surface and removes a copy-the-secret path. The host run path (`CliHarnessAdapter` argv-form `spawn`, `local-sandbox-adapter` `sh -c` cwd'd to the working dir) is unchanged and already the production reality.
- **Remote surface unchanged:** worker-ws (token-gated join) + `/worker-token` stay exactly as shipped; AQ1 introduces no new remote risk. AQ3 owns the transport completion + its threat model.
- **AN1 hard-rule 4 (no credential extraction):** preserved — nothing extracted; inherited tools work via the real host env; no new code touches credentials. Net improvement.
- **ETHOS §2 (no preemptive wall):** AQ1 ships zero isolation by default — exactly the posture. Isolation is AQ2, opt-in.

---

## Risks & BLOCKERs

**NO BLOCKERs.** The prior plan's BLOCKER-1 (scope of the remote-worker cut) is **resolved by founder decision**: keep + realign the remote subsystem. There is no scope-expansion decision left for the builder — §A is pure isolation deletion; §B is lore-only realignment with the remote feature intact.

- **Risk 1 — a surviving test imports a deleted isolation symbol** (incl. a *dynamic* `import()` — `moduleResolution:"bundler"` makes those TS2307 compile errors, not just runtime failures). Mitigation: §A task 3 enumerates every importer, re-verified by a full grep sweep for `DockerSandboxAdapter|IsolatedHarnessAdapter|IsolationConfig|isolated-session|HYPERIDLE_ENABLE_ISOLATED|HYPERIDLE_ENABLE_DOCKER` — `workspace-adapter.test.ts`, `local-workspace-adapter.security.test.ts`, `AL6-return-gate.test.ts`, `AL6-reprompt-loop.integration.test.ts`, **`AL6-return-gate.integration.test.ts` (dynamic import, lines 677-692)**; `npm run check` is the catch-all. Low, bounded.
- **Risk 2 — over-deleting a remote test as "isolation."** Mitigation: the grep sweep proved remote tests carry no isolation framing; they are in `protectedTests`. The realign is lore-only. `AL6-return-gate.integration.test.ts` remote subtest (line 654) + its `isolated-shaped-tier2` mock string (line 545) are explicitly KEPT; only that file's *isolated* subtest (677-692, with the dynamic import) is removed.
- **Risk 3 — `disabled-sandbox-adapter` mistaken for isolation and re-deleted.** Mitigation: it is the "shared backend runs no agents" boot guard; the lore edit (task 4) makes this unambiguous. KEEP.
- **Risk 4 — `knip` strands an export after the isolation cut.** Mitigation: task 5 runs `knip`; clears exactly what it reports. Expect near-zero (remote kept; only isolation-private symbols removed). Low.
- **Risk 5 — desktop build is a separate gate** (`npm run -w @hyperidle/desktop build`). AQ1 makes **no** desktop edits (worker block kept), so the desktop build is unaffected; task 7's `npm run verify` confirms.

---

## sharedFiles (concurrent-WP overlap)

- `packages/server/src/harness/adapter-pool.ts` — §4 gate block + lore removed (the only non-trivial source edit).
- `packages/server/src/harness/local-sandbox-adapter.ts`, `disabled-sandbox-adapter.ts`, `cli-harness-adapter.ts` — lore/error-string edits only.
- `knip.json` — three forced-entry lines removed (root-level config; high concurrent-overlap risk — schedule AQ1 first or rebase).
- `eslint.config.ts` — one comment line scrubbed (low overlap risk).

Narrower overlap surface than the prior (whole-subsystem) plan — no `app.ts`/`server-factory.ts`/`shared/index.ts`/`desktop/main.ts`/Settings edits. If another WP touches `adapter-pool.ts` concurrently, schedule AQ1 first or rebase (a focused deletion).

---

## protectedTests

- `packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts`
- Remote-subsystem tests (realign must not break the kept seam): `remote-harness-adapter.test.ts`, `routes/__tests__/worker-ws.test.ts`, `worker-ws-s4.test.ts`, `workers.test.ts`, `auth-worker-token.integration.test.ts`, `shared/.../worker-protocol.test.ts`, `desktop/.../desktop-worker-client.test.ts`.
- AN2 provisioning tests (resolve exact filenames via `grep AN2 packages/server/src/**/__tests__`).

(`af7-adapter-pool-gating.test.ts`, `workspace-adapter.test.ts`, `local-workspace-adapter.security.test.ts`, `AL6-return-gate.test.ts`, `AL6-reprompt-loop.integration.test.ts`, `AL6-return-gate.integration.test.ts` are intentionally edited — see Migrations — and are NOT in the protected set. For `AL6-return-gate.integration.test.ts` the edit is the removal of the isolated subtest [677-692] + its dynamic import; its **remote** subtest [654] must stay green, but the file is not "assertions frozen".)
