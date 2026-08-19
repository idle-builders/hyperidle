# host-process — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — package deleted.**

This package is three unrelated things stapled together because they all touch `node:` APIs:
a git subprocess runner, an SSRF URL guard, and deployment-profile/env resolution. No consumer
uses more than one of the three. That is not a shared package; it is three homeless modules.

1. **`git/git-runner.ts` → `layers/agent-orchestration`** (layer-level `src/`, next to `boot.ts`).
   The package's own lore claims the runner must be framework because "consumers end up on BOTH
   sides of the Layer boundary" (core-api/filesystems vs agent-orchestration). **That claim is
   stale.** The filesystems probe now lives at `layers/agent-orchestration/filesystems/` — every
   production importer of `createGitRunner` is inside `layers/agent-orchestration`
   (`src/routes/filesystems.ts`, `src/boot.ts`). The core-api references are test files only.
   The founding reason for the framework package is gone; the package outlived its excuse.

2. **`net/ssrf.ts` → `layers/agent-orchestration`**. The module header says it was "extracted
   from notifications so the same blocklist can guard webhook adapters." **That sharing never
   happened.** `layers/core-api/notifications/src/install.ts` re-implements the entire thing
   privately (`isPrivateIPv4`, `isPrivateIPv6`, `sanitizeNtfyUrl`, `assertNtfyUrlNotSSRF`,
   lines 461–558) and imports only the one-line `SanitizeResult` type. The only production
   consumers of the shared behavior are `agent-orchestration/src/routes/connections.ts` and
   `run-orchestration/src/connection-provisioning.ts`. One real owner. The "shared" SSRF package
   failed its own founding purpose and the two copies are already free to drift.

3. **`profiles.ts` → `applications/remote-server`; `validate-env.ts` → inlined into
   `applications/remote-server/src/index.ts`.** Consumers use different slices:
   - remote-server: full 3-profile table (laptop/vps/cloud) + `validateStartupEnv`.
   - desktop: calls `resolveProfile` but IS the laptop product — a "vps" profile inside Electron
     yields a docker-compose hostname (`postgres:5432`) that is nonsense there. Desktop should
     hardcode its pglite laptop defaults (~4 lines).
   - setup-cli: needs only the validated profile name + a `dbDriver` label for one log line —
     a 6-line local parse.
   Three consumers using three different slices of an 80-line module is not sharing.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/host-process"` — production importers only (tests excluded):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/src/routes/filesystems.ts` | `createGitRunner` | Yes — becomes same-layer module |
| `layers/agent-orchestration/src/boot.ts` | `createGitRunner` | Yes — same |
| `layers/agent-orchestration/src/routes/connections.ts` | `isPrivateHostLiteral`, `resolveUrlForSSRF` | Yes — becomes same-layer module |
| `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts` | `resolveUrlForSSRF` | Yes — same |
| `layers/core-api/notifications/src/install.ts` | `SanitizeResult` (type only; behavior duplicated locally) | Yes — writes its own 1-line union |
| `applications/remote-server/src/index.ts` | `validateStartupEnv` | Yes — inline, 10 lines, sole caller |
| `applications/remote-server/src/create-server.ts` | `resolveProfile` | Yes — becomes the module's home |
| `applications/desktop/src/create-server.ts` | `resolveProfile` | Yes — hardcode laptop defaults |
| `tools/setup/src/setup-cli.ts` | `resolveProfile`, `DeploymentProfile` | Yes — 6-line local parse |

`tools/repo-gates/typecheck-gate.ts` and `filesystem-mounting`/`filesystems` mention the package
in comments/package.json only — the two Services deliberately re-declare the runner shape as
structural ports (`FilesystemsGitRunner`, `MountingGitRunner`) and never import a single symbol.
Note the trace graph reports "nothing references createGitRunner" — the DI-factory-value wiring
(`gitRunnerFactory: createGitRunner`) is a known graph blind spot; rg is the evidence above.

## If written today, from scratch

- `layers/agent-orchestration/src/git-runner.ts` — `createGitRunner(repoPath)` with **12** verbs
  (the 4 git-export leftovers deleted), no options param.
- `layers/agent-orchestration/src/ssrf.ts` — `resolveUrlForSSRF`, `isPrivateHostLiteral`, and
  the private IP/parse helpers unexported.
- `applications/remote-server/src/profiles.ts` — `resolveProfile` over a 3-row table with
  **3** fields (`profile`, `dbDriver`, `dbUrlDefault`); `validateStartupEnv` inlined in `index.ts`.
- No framework package.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| MERGE | 1 |
| SIMPLIFY | 14 |
| KEEP | 2 |

Surface: 23 exports → 0 exports from this package (package deleted; ~8 symbols survive as
module-level code inside their owners, most unexported). Within the survivors: `GitRunner`
loses 4 of 16 verbs, `ProfileDefaults` loses 3 of 6 fields.

## Feature-level kills

1. **Dead git-export verbs: `init`, `push`, `configSet`, `remoteAdd`.** Both production ports
   (`FilesystemsGitRunner`, `MountingGitRunner`) omit them; no production call site exists —
   they served the git-export feature deleted in C1 and survived it. Their tests die with them.
   Nothing breaks.
2. **The "shared SSRF" pretense.** Notifications keeps its own copy (it already does); the
   `SanitizeResult` type import — the last thread — dies. Nothing breaks; the drift between the
   two copies is already real and this makes it honest instead of hidden.
3. **Profile fields nobody reads: `sandboxAdapter`, `requiresDockerCompose`, `ports`.**
   Zero readers repo-wide (`rg -a` on all three names: only the package and its own test).
   The `SandboxAdapterKind` type dies with its field. Nothing breaks.
4. **Test-only public API: `sanitizeHttpUrl`, `assertUrlNotSSRF`, `CreateGitRunnerOptions`.**
   Only `__tests__/ssrf.test.ts` and `git-runner.integration.test.ts` touch them. Dead code plus
   tests that should die with it.
5. **`LAPTOP_DEV_API_KEY` as a shared constant.** The one place that must agree with it —
   `layers/core-ui/src/services/api-fetch.ts:33` — hardcodes the literal `"hyperidle-dev-local"`
   because the browser bundle cannot import host-process. The constant never enforced anything.
   Inline the literal at its one real use.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `createGitRunner` | UI:`/api/filesystems/*` + BOOTSTRAP:`boot.ts`→mount engine (AGENT session path) | SIMPLIFY | Moves to `layers/agent-orchestration/src/`; drop the `opts` param — no production caller passes options; returned runner drops 4 dead verbs. |
| 2 | `isPrivateIPv4` | INTERNAL | SIMPLIFY | Zero external callers (notifications has its own copy). Unexport; moves with ssrf module. |
| 3 | `isPrivateIPv6` | INTERNAL | SIMPLIFY | Same — unexport, module-private helper. |
| 4 | `isPrivateHostLiteral` | UI:`/api/connections` (connections.ts:74) | KEEP | Real door, real guard on user-supplied MCP server URLs. Moves to agent-orchestration. |
| 5 | `isLoopbackHost` | INTERNAL | SIMPLIFY | Only `parseAndCheckUrl` calls it. Unexport. |
| 6 | `sanitizeHttpUrl` | TEST-ONLY | DELETE | Only `__tests__/ssrf.test.ts` calls it. The sync gate nobody wired; `resolveUrlForSSRF` does its own parse. Test dies with it. |
| 7 | `assertUrlNotSSRF` | TEST-ONLY | DELETE | Wrapper over `resolveUrlForSSRF` that throws away the addresses. Its own `@lore` says it exists for "existing call sites (notifications/ntfy)" — those call sites use notifications' private copy, not this. Zero production callers. |
| 8 | `resolveUrlForSSRF` | UI:`POST /api/connections/:id/validate` + AGENT:connection-provisioning (session start) | KEEP | The one real SSRF gate, earned from a security review, two live doors. Moves to agent-orchestration. |
| 9 | `resolveProfile` | BOOTSTRAP:remote-server + desktop `create-server`, setup-cli | SIMPLIFY | Moves to remote-server. Desktop hardcodes its laptop/pglite defaults; setup-cli owns a 6-line name parse. Table shrinks to 3 fields. |
| 10 | `validateStartupEnv` | BOOTSTRAP:remote-server `index.ts:26` (sole prod caller) | MERGE | 10 lines, one caller — inline into `applications/remote-server/src/index.ts`. The core-api tests exercising it (`index.startup.integration.test.ts`) move or die. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `GitConfigInjection` | SIMPLIFY | No external importer — both consumer Services re-declare it structurally (`FilesystemsGitConfigInjection`, `MountingGitConfigInjection`). Unexport; moves with runner. |
| `GitRunner` | SIMPLIFY | No production importer of the type (structural ports everywhere). Delete members `init`, `push`, `configSet`, `remoteAdd` — production reaches the runner only through the two ports, and both omit them; they are git-export (C1) leftovers. 16 verbs → 12. Unexport. |
| `CreateGitRunnerOptions` | DELETE | Only `git-runner.integration.test.ts` passes `{ logger, timeouts }`. Production always calls `createGitRunner(path)` bare. Test-only surface on a public factory. |
| `SanitizeResult` | DELETE | Sole external importer is notifications — which duplicated all the behavior and kept only this 1-line union import. It writes its own `{ ok: true } | { ok: false; reason: string }`. |
| `ResolveResult` | SIMPLIFY | Return type of `resolveUrlForSSRF`; every consumer uses it structurally, none imports it by name. Moves with the function, unexported from any barrel. |
| `SanitizeUrlOptions` | SIMPLIFY | Drop `requireHttps` — zero production callers set it (rg repo-wide: one test). Keep `label` (used) and `lookup` (used via `_ssrfLookup` in connection-provisioning — note: that is a test seam threaded through a production signature; flagged, owner's problem after the move). |
| `DeploymentProfile` | SIMPLIFY | One external type importer (setup-cli, for a `satisfies` check). Moves to remote-server; setup-cli owns its own 3-literal union. |
| `DbDriver` | SIMPLIFY | Module-internal already (not in barrel). Moves with profiles; stays private. |
| `SandboxAdapterKind` | DELETE | The `sandboxAdapter` field it types is read by nobody, anywhere. Dies with the field. |
| `ProfileDefaults` | SIMPLIFY | 3 of 6 fields dead (`sandboxAdapter`, `requiresDockerCompose`, `ports` — zero readers repo-wide). Shrink to `{ profile, dbDriver, dbUrlDefault }`. |
| `ResolveOptions` | SIMPLIFY | Param type of `resolveProfile`; moves with it, module-private. |
| `PROFILE_DEFAULTS` (const) | SIMPLIFY | Module-internal already; only its own unit test names it. Moves with `resolveProfile`, rows shrink to 3 fields. |
| `LAPTOP_DEV_API_KEY` (const) | DELETE | Only prod use is the adjacent function; the browser code that must agree (`core-ui/api-fetch.ts:33`) hardcodes the literal anyway. Inline `"hyperidle-dev-local"` into the inlined `validateStartupEnv`; the core-api test importing it dies/moves with #10. |

## Holes this leaves

- **Desktop loses non-laptop profiles.** Hardcoding pglite defaults in desktop means
  `HYPERIDLE_PROFILE=vps` inside Electron stops "working" — it never worked meaningfully (the
  vps default DB URL is a docker-compose hostname). Real hole: pointing desktop at an external
  postgres via `DATABASE_URL` + profile switch stops working. If that is a real use case, desktop
  keeps a 2-row table; it is still not a framework package.
- **Default DB URL drift.** remote-server, desktop, and setup-cli each own their profile slice;
  if the laptop pglite default path ever changes, three files change instead of one. Priced: the
  two create-server files already keep a byte-for-byte duplicated DB-open block by explicit
  `@lore` policy — this hole already exists and is accepted.
- **SSRF blocklist drift between agent-orchestration and notifications** becomes permanent.
  It is already real (two independent IPv4/IPv6 checkers today); deleting the type import just
  stops pretending otherwise. A future security learning must be applied in two places.
- **Deleting `init`/`push`/`configSet`/`remoteAdd`** removes ready-made verbs a future
  git-export-like feature would want. It re-adds them against the same spawn path when a real
  feature earns them.
- **Test relocation:** `core-api/src/__tests__/index.startup.integration.test.ts`,
  `AO1-reachability-lane-b`, `AO1-filesystem-reachability` and the package's own 4 test files
  import the deleted package and must move to the new owners or die with their deleted subjects.
