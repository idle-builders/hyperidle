# AO2 — Architecture: Materialize the filesystem into the session sandbox

**Input precedence:** `plans/AO2/reconciliation.md` (reconciled ACs) > `docs/process-layer/filesystem-primitive.md` (shipped AO1 concept) > `.pipeline/work-packages/TRACK-AO.md` §AO2. The stale "no cred in sandbox" AC#4 is dead — build the **durable-auth → disposable-sandbox** projection.

**Verified base:** origin/main @ 2012467d. AO1 already shipped the AO2 contract types (`FilesystemMounter`, `FilesystemAuth`, `MountResult`, `CaptureResult` in `packages/shared/src/filesystem.ts:101-133`) and the hook-point comments ("Phase 4.5 mount, teardown captureBack"). **AO2 implements these types; it does not redesign them.**

---

## Required reading (engineer reads before building)

- `plans/AO2/reconciliation.md` — the reconciled ACs (esp. the credential reversal).
- `docs/process-layer/filesystem-primitive.md` — the Filesystem primitive + credential model.
- `plans/AO/concept.md` §Phase 4 (Contracts) + §Phase 1.6 (Authority) — materialization is driven by `sessions.agentId → filesystem_injections → filesystems`, never a global path; degrade-when-absent.
- `packages/shared/src/filesystem.ts` — the contract types AO2 implements (`FilesystemMounter`, `FilesystemAuth.provision`, `MountResult`, `CaptureResult`).
- `packages/server/src/services/session-provisioning.ts` — `admitSession()` (Phase 4 spawn, Phase 6 context assembly), `runSession()` teardown (Phase 11, `workspace.destroy`).
- `packages/server/src/services/filesystem-reachability.ts` — `probeGitRemote`, `repoToUrl`, `parseResourceRef`, the GIT_CONFIG token-injection convention (`x-access-token:<token>` → Basic header, host-scoped). AO2 reuses the SAME injection mechanism for clone/fetch.
- `packages/fabric/src/services/git-export-runner.ts` — `GitRunner` (export-only) + `buildGitEnv` hardening (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `GIT_CONFIG_NOSYSTEM=1`, env allow-list, `GIT_CONFIG_COUNT/KEY_n/VALUE_n` token path, `redactArg`). AO2's inbound-git capability extends this runner.
- `packages/server/src/services/service-connection-resolver.ts` — `ServiceConnectionResolver.resolve(userId, connectionId) → token|null`. The ONLY plaintext path.
- `packages/db/src/schema.ts` — `filesystems` (880-909), `filesystemInjections` (919-935), `serviceConnections` (1278-1309, **owned by `userId`**), `sessions.sandboxSnapshot` (260), `artifacts` (848-865).

---

## Plan reconciliation (spec ⇆ reality)

| Spec/contract assumption | Reality (grep-verified) | Plan handling |
|---|---|---|
| AO1 ships AO2 seam types | `FilesystemMounter`/`FilesystemAuth`/`MountResult`/`CaptureResult` exist in `shared/src/filesystem.ts`; **only types, no impl** | AO2 implements them in `packages/server`. Keep signatures byte-identical; refine `FilesystemAuth.provision` usage. |
| Hook point "Phase 4.5 / teardown" | `admitSession` Phase 4 = `workspace.spawn`; Phase 6 = `strategy.assembleContext`. `runSession` teardown destroys sandbox at 3 exit paths (crash/budget/normal: lines 1062, 1104, 1122) | Mount in `admitSession` **between Phase 5 (row insert) and Phase 6 (context assembly)** — see §1. captureBack in `runSession` **before each `workspace.destroy`** — see §5. |
| `resolveToken(connectionId)` available server-side | `ServiceConnectionResolverAdapter.resolveToken` binds `userId` from `c.get("userId")` (per-request). **AO2 runs DETACHED — no request context, no request userId.** | **Load-bearing reconciliation (§3).** The mounter resolves the token by the connection's **owning userId** (read `service_connections.userId` for the row), not a request userId. New server-side resolver method `resolveTokenByConnectionId(connectionId)`. |
| `GitRunner` can checkout | Export-only: `init/add/commit/push/lsRemote`, **no clone/fetch/checkout** | §2 adds `clone`/`fetchCheckout` to the runner (same file, same hardened `spawnGit`). |
| Connection supplies `source` for provision mode | `FilesystemAuth.provision` discriminator: `git-credential{remote}` / `env{vars}` / `none`. AO1's adapter currently returns `{mode:"none"}` (no row context) | AO2 builds the `git-credential` directive itself at mount (it HAS the row + resolved token); does not rely on the adapter's context-free `resolve()`. |
| Materialization driven by injection query | `filesystem_injections` PK `(agentUserId, filesystemId)`, index on `agentUserId` | §1 query: `SELECT f.* FROM filesystems f JOIN filesystem_injections fi ON fi.filesystemId=f.id WHERE fi.agentUserId = :agentId`. |
| Artifact provenance for captured commit | `artifacts` has NO commit/filesystem columns (848-865) | **No artifact write in AO2** (AO3/AL7 owns review subjects). Capture provenance recorded on a **new `filesystem_captures` table** (§6, Design-it-twice) — keeps `artifacts` kernel-clean. |

**No contradiction with an existing concept doc** — the credential reversal is already reconciled in `reconciliation.md` and matches `filesystem-primitive.md`.

---

## Phase 0 — Interrogation (resolved with recommended answers)

1. **Where does the resolved token's `userId` come from in a detached run?**
   Recommend: from the **connection row's `userId`** (the human/owner who registered the Connection), looked up by `connectionId`. The agent is a bot; it doesn't own the Connection — its team's founder does. AO2 adds `ServiceConnectionResolver.resolveTokenByConnectionId(connectionId)` that reads `service_connections.userId` then decrypts. This is the durable-auth → disposable-sandbox projection: the agent acts with the founder's forge auth. *Confirm.*

2. **Clone-per-session vs cached bare mirror + worktree?**
   Recommend: **plain clone per session into the isolated sandbox** (the spec says "plain checkout into the already-isolated per-session sandbox — no shared worktrees"). Caching is an optimization with a coupling/coherence cost (shared object store across sandboxes breaks the isolation guarantee). Single-founder scale; a shallow clone is seconds. *Confirm — defer caching.*

3. **Shallow vs full clone?**
   Recommend: **`--depth=1 --single-branch --branch <branch>`** for the materialize. The agent edits + tests + commits a working tree; full history is not needed for the build loop. captureBack commits locally (push/PR is AO3/AL7 landing, out of scope). A shallow clone that later needs push can `--unshallow` — but that's AO3's problem. *Confirm.*

4. **What is the agent's file/build/git tool surface?**
   Recommend: **rely on the harness's native fileEditing + shell** (Claude Code `fileEditing:true`; CLI harnesses run with `cwd: sandboxPath` and a shell). The agent reads/edits/builds/tests/commits **using the harness's own tools** — exactly the ETHOS "build on what the harness natively does" rule. AO2 adds **no new HyperIdle file/edit/build tools**. Git auth is provisioned as an ambient sandbox-scoped git config (§4) so the agent's own `git` just works. *Confirm — no new tool primitives.*

5. **captureBack scope: commit-only or commit+push?**
   Recommend: **commit-only** for `git` writeback (AO3/AL7 owns push/PR landing). `file` = write/snapshot the changed folder out to a durable capture dir. `none` = no-op. The AC says "captured… not lost when sandbox destroyed" — a local commit on a clone that's about to be deleted is NOT durable. So `git` capture must **bundle the commits to a durable location** (§5). *Confirm — capture = commit + `git bundle` to a durable path.*

These five are the load-bearing forks. All have a single sane recommended answer grounded in the spec/concept; none re-litigated downstream.

---

## §1 — Materialization hook point + driver query

**Where:** inside `admitSession()` in `session-provisioning.ts`, a **new Phase 5.5** between the Phase 5 session-row insert (line 479) and Phase 6 context assembly (line 488), INSIDE the existing `try` block (so a mount failure triggers `revertTaskToAccepted` exactly like a context-assembly failure — same rollback semantics, no new error path).

**Why before context assembly, not after:** context assembly writes `context/ knowledge/ work/` + `.fabric/manifest.json` into the sandbox; materialization writes the repo working tree. They write **disjoint subtrees** (repo at sandbox root or a `repo/` subdir; fabric in `.fabric/`, `context/`). Order is not semantically forced, but materializing **first** means a mount failure aborts before the (more expensive) context assembly runs and before `session_started` is emitted — fail fast, cheap rollback. Materialize → assemble context → start ingestion → emit `session_started`.

**Driver query (the AC1 "never a global path" requirement):**
```ts
// resolve the bot's injected filesystems
const injected = await db
  .select()
  .from(filesystems)
  .innerJoin(filesystemInjections, eq(filesystemInjections.filesystemId, filesystems.id))
  .where(eq(filesystemInjections.agentUserId, params.agentId));
```
For each injected filesystem row → `mounter.mount(...)`. **Zero rows → skip entirely (degradation path, AC3).** The session provisions with no working tree, context assembly + ingestion + harness run exactly as today.

**Mount target path within the sandbox:** a single injected `code` filesystem mounts at **`<sandboxPath>` root** (so the harness `cwd` IS the repo — matches "the sandbox holds the repo working tree", and `git`/build/test commands run with no `cd`). Multiple injected filesystems (rare, N:N allows it) mount at `<sandboxPath>/<filesystemId>/` — the FIRST `code` filesystem still goes to root for the common single-repo case. *Recommendation: v1 supports the common case (≤1 `code` fs at root, `doc_set` folders at `<sandboxPath>/<slug>/`); record multi-code as a known limitation, not a blocker (single-founder, one-repo-per-bot is the norm).*

**Wiring the mounter into provisioning deps:** add an optional `filesystemMounter?: FilesystemMounter` to `ProvisionSessionDeps`. Constructed in `app.ts` (where `db` + `ServiceConnectionResolver` already exist, lines 416-451) and threaded through `createSessionRoutes` → `startSessionProvision` deps, exactly like `mcpBridgeRegistry`. **Absent → no materialization** (kernel-only mode, tests without the adapter stay green — same pattern as `mcpBridgeRegistry`).

---

## §2 — Inbound-git capability (clone / fetch / checkout)

**Decision: extend `GitRunner`** in `packages/fabric/src/services/git-export-runner.ts` (NOT a sibling). Rationale: the runner already owns the hardened `spawnGit` + `buildGitEnv` + `redactArg` + the GIT_CONFIG token-injection path. A sibling would duplicate all of it (the exact env-hardening lore is load-bearing — see the `@lore` blocks). One runner, two directions (export was H1; inbound is AO2).

**New methods on the `GitRunner` interface:**
```ts
/** Clone a remote into cwd at a branch. Shallow by default (depth=1, single-branch).
 *  Token injected via GIT_CONFIG_* env (same path as lsRemote) — never in argv/URL. */
clone(url: string, branch: string, opts?: {
  depth?: number;
  tokenConfig?: GitConfigInjection;
}): Promise<void>;

/** Create a `git bundle` of all local commits not in the original remote tip,
 *  written to `bundlePath`. Used by captureBack to make a clone's commits durable
 *  before the sandbox is destroyed. */
bundle(bundlePath: string, ref: string): Promise<void>;
```
- `clone` runs `git clone --depth <n> --single-branch --branch <branch> -- <url> <cwd>` via `runExpectOk` with the token-config env (reuse the exact `GIT_CONFIG_COUNT/KEY_0/VALUE_0` injection `probeGitRemote` already builds; factor the header-builder out of `filesystem-reachability.ts` into a shared helper so both call sites share one implementation).
- `bundle` runs `git bundle create <bundlePath> <ref>` (local op, `localMs` timeout class).
- **No `checkout` method needed** — `--branch` on clone already lands the working tree at the branch. `fetch` is deferred (AO3 landing concern; a fresh clone per session needs no incremental fetch).

**Env hardening:** all new methods go through the existing `spawnGit` → `buildGitEnv`, so they inherit `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `GIT_CONFIG_NOSYSTEM=1`, the env allow-list, and credential-redacted logging **for free**. This is the single biggest reason to extend, not fork.

**Snapshot net / typecheck impact:** the `GitRunner` interface gains 2 methods; the `FakeGitRunner` used in export tests must implement them (no-op stubs in test doubles are fine — they're test doubles, not production stubs from memory).

---

## §3 — Server-side token resolution (the detached-run reconciliation)

The AO1 `ServiceConnectionResolverAdapter` binds `userId` from `c.get("userId")` — **unavailable in the detached `admitSession` run.** AO2 needs the token without a request.

**New method on `ServiceConnectionResolver`:**
```ts
/** Resolve the plaintext token for a connection by its OWNING user (read from the row).
 *  For server-side provisioning where there is no request userId. Same decrypt path,
 *  same null-on-any-failure contract. Never throws. */
async resolveTokenByConnectionId(connectionId: string): Promise<string | null>;
```
Implementation: `SELECT * FROM service_connections WHERE id = connectionId LIMIT 1` → if `authSource!=="token"` or no `encryptedToken` or no `serverSecret` → `null`; else `decryptCredentialValue(row.encryptedToken, serverSecret)`. This reads the **connection owner's** token (the founder who registered it) — the durable-auth → disposable-sandbox projection (the bot acts with the founder's forge auth, like a real employee).

**Security note (earned, not preemptive):** this is the ONLY new plaintext path AO2 adds. It is wired EXCLUSIVELY into the mounter → sandbox git config, never to a route response or logger (mirrors the AN1 `@lore`: "the resolver is the ONLY plaintext path… never to a route response"). No cross-user check is needed/added — AO2 is server-side provisioning resolving a Connection the team's founder bound to the team's filesystem; designing a cross-tenant guard here would be preemptive security against a non-threat (single-founder, team-scoped). The reviewer's security lens covers this in §Security.

---

## §4 — Disposable forge-auth projection into the sandbox

**Contract:** the resolved token is projected into the sandbox as a **disposable, sandbox-scoped git config**; the durable filesystem/session records store **no plaintext secret**; the projection **dies with the sandbox** (sandbox is `rm -rf`'d at teardown).

**Mechanism (build on git's native config, not a HyperIdle invention):** at mount, write the token as a **repo-local git config** inside the cloned working tree:
```
git config --local http.<host>/.extraHeader "Authorization: Basic <base64(x-access-token:TOKEN)>"
```
via the existing `GitRunner.configSet(key, value)` (already on the interface, line 50). The header is **host-scoped** (only sent to the forge origin), identical to the `probeGitRemote` convention. Because it is `--local`, it lives in `<sandboxPath>/.git/config` — inside the disposable sandbox, removed by `workspace.destroy`'s `rm -rf`. The agent's own `git fetch`/`push`/`gh` then authenticate ambiently with no token in argv, no env var the agent can echo to a log, no credential helper process.

`FilesystemAuth.provision` maps:
- `{ mode: "git-credential", remote }` → write the `http.<host>/.extraHeader` local config (the `code`+forge case).
- `{ mode: "env", vars }` → write the vars to the sandbox's harness env (e.g. `GH_TOKEN` for `gh` — already in `buildGitEnv`'s allow-list). v1 prefers `git-credential`; `env` is the `gh`-CLI escape hatch, optional.
- `{ mode: "none" }` → local-first, no projection (bare local repo / public repo / `null` token).

**The mounter builds the `provision` directive itself** (it has the row + the resolved token + the resolved remote host from `repoToUrl(resourceRef.repo)`), rather than calling the AO1 adapter's context-free `resolve()` which returns `{mode:"none"}`. AO1's `resolve()` stays as the seam; AO2's mounter is the real implementation that AN2 can later subsume.

**Teardown:** no explicit auth teardown call — the `.git/config` containing the header is inside the sandbox dir that `workspace.destroy` removes. Disposability is structural, not a cleanup step. (captureBack's bundle, §5, is taken BEFORE destroy and written OUTSIDE the sandbox, so the durable artifact never carries the `.git/config` secret.)

---

## §5 — Writeback / capture path

**Where:** a new `mounter.captureBack(...)` call in `runSession()`, placed **before every `workspace.destroy(sandboxHandle)`** (3 sites: line 1062 budget, 1104 not-returned, 1122 normal). Crash path (line 1040 `crashSession`) does NOT destroy the sandbox via `workspace.destroy` in the same way — confirm crash teardown; capture on crash is best-effort (the working tree may be inconsistent). Recommend: capture on normal + budget + not-returned completion; skip on crash (the agent didn't finish).

**Per `writeback` kind:**
- **`git`** → `runner.add([])` (`-A`) → `runner.commit(msg, agentName, agentEmail)` (author = the bot's identity) → `runner.bundle(<durableBundlePath>, "HEAD")`. The bundle is written to a **durable capture dir** outside the sandbox: `<captureBasePath>/<sessionId>/<filesystemId>.bundle`. This is what survives `rm -rf <sandbox>`. (Push/PR = AO3/AL7 landing, explicitly out of scope.)
- **`file`** → copy the changed folder tree out to `<captureBasePath>/<sessionId>/<filesystemId>/` (last-write-wins snapshot, per concept "ride the host"). No diff/merge engine.
- **`none`** → no-op, `CaptureResult{captured:false}`.

**Provenance row (§6):** each capture writes a `filesystem_captures` row linking `(sessionId, filesystemId, captureKind, capturePath, commitSha?, createdAt)` so the captured output is discoverable after teardown (AO3 reads this to build a review subject). `CaptureResult.success=false` is logged via the observability adapter, never throws into teardown (teardown must complete).

**`captureBasePath`:** a sibling of `sandboxBasePath` (e.g. `<sandboxBasePath>/../hyperidle-captures` or a configured path), threaded through deps like `sandboxBasePath`. Durable across the sandbox lifecycle by construction (different directory tree, never `rm`'d at session end).

---

## §6 — Design-it-twice: capture provenance storage

**Option A — extend `artifacts` with filesystem columns** (`filesystemId`, `commitSha`, `capturePath`).
- Trade-off: one table, AO3 reads artifacts directly.
- Reject: `artifacts` is deliberately **kernel-clean** (`@lore O2` stripped cost columns to keep kernel/strategy separation). Adding filesystem provenance re-couples the kernel artifact to the filesystem subsystem. Also an artifact is a *reviewable record* (AO3/AL7's concern) — AO2 captures **files**, not review subjects. Wrong layer.

**Option B — new `filesystem_captures` table** (chosen).
```ts
export const filesystemCaptures = pgTable("filesystem_captures", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  filesystemId: text("filesystem_id").notNull().references(() => filesystems.id, { onDelete: "cascade" }),
  writeback: text("writeback").notNull(),       // git | file | none (snapshot of the fs's mode at capture)
  capturePath: text("capture_path").notNull(),  // durable path to the bundle/snapshot
  commitSha: text("commit_sha"),                // git writeback only
  createdAt: text("created_at").notNull(),
}, (t) => [
  index("filesystem_captures_session_idx").on(t.sessionId),
  index("filesystem_captures_filesystem_idx").on(t.filesystemId),
]);
```
- Trade-off: a new table + migration.
- Reason chosen: keeps `artifacts` kernel-clean; gives AO3/AL7 a clean "what did this session capture, where, at what commit" query without coupling to the kernel artifact; forward-only migration (memory: forward-only). Captures are AO2's own subsystem record, distinct from the L3 reviewable Artifact.

**Migration:** one forward-only migration adding `filesystem_captures` (`npm run db:generate`). `sharedFiles: schema.ts`.

---

## §7 — Substrate-less degradation path (AC3)

Already structural: the §1 driver query returns zero rows for a bot with no injection → the new Phase 5.5 is a no-op → provisioning continues unchanged (context assembly, ingestion, harness, internal MCP tools all run as today). No code path special-cases "no filesystem" beyond `if (injected.length === 0) return;`. **Verification: an integration test that provisions a session for an agent with no injection row and asserts the session reaches `active` + internal tool registry is built** (proves today's behavior is intact).

---

## Acceptance criteria + verification methods

| # | AC (reconciled) | Verification |
|---|---|---|
| AC1 | Session for a bot with an injected `code` fs → sandbox holds the repo working tree at its branch; agent reads/edits/runs build/test | **Live-proof integration test** (§Live-proof): real local git repo → real session via the shipped `POST /api/sessions` provisioning path → assert `<sandbox>/.git` exists + a known file from the repo is present + `git rev-parse --abbrev-ref HEAD` == branch. Driver = injection query (assert NOT a global path: a second un-injected bot gets no tree). |
| AC2 | Working-tree changes captured per `writeback`, not lost on destroy | Live-proof: agent (or test harness acting as agent) edits a file + the test command runs; after session end assert a `filesystem_captures` row exists AND the durable bundle/snapshot at `capturePath` contains the edit (restore the bundle to a temp dir, `git log`/file-read asserts the change). Sandbox is destroyed — proving capture is durable. |
| AC3 | Bot with no injected fs still provisions/runs | Integration test: agent with zero `filesystem_injections` → `provisionSession` → assert `sessions.state` reaches a terminal/active outcome and no mount attempted (mounter spy/`filesystem_captures` empty). |
| AC4 | Forge auth provisioned as disposable projection; durable record stores no plaintext; dies with sandbox | (a) **Unit**: `resolveTokenByConnectionId` decrypts the owner's token; assert no plaintext in any `filesystems`/`sessions`/`filesystem_captures` column (read rows back, assert token string absent). (b) **Unit**: mount writes `http.<host>/.extraHeader` to `<sandbox>/.git/config` (host-scoped, base64), token NOT in argv (assert via runner spy argv). (c) **Structural**: after `workspace.destroy`, `<sandbox>/.git/config` is gone (dir removed). (d) **Live-proof Lane B** (local, network, skip-guarded like AO1 Lane B): real PAT → clone a real private repo → assert working tree present. |

**route-checklist:** AO2 mounts on the existing `POST /api/sessions` provisioning path only (no new routes). The materialization hook is in `admitSession` (1 call site) + captureBack in `runSession` (3 destroy sites). Checklist for the reviewer: Phase 5.5 mount present; captureBack before each of lines ~1062/1104/1122 `workspace.destroy`.

---

## Ordered task list

1. **(schema)** Add `filesystemCaptures` table to `schema.ts` + `npm run db:generate`. Export row types. *(proves: migration runs; `.schema` shows table)* — `sharedFiles: schema.ts`.
2. **(fabric)** Extend `GitRunner` interface + `createGitRunner` + `FakeGitRunner` with `clone` + `bundle`. Factor the GIT_CONFIG header-builder (`x-access-token` → Basic) into a shared helper reused by `probeGitRemote` and the mounter. *(proves: unit test clones a `file://` local repo into a temp dir, asserts working tree + branch; bundle round-trips)*.
3. **(server)** Add `ServiceConnectionResolver.resolveTokenByConnectionId(connectionId)`. *(proves: unit — seed encrypted connection, resolve by id, assert plaintext; wrong id → null)*.
4. **(server)** Implement `SandboxFilesystemMounter implements FilesystemMounter`: `mount` (clone via runner with host-scoped token config + write disposable local git config) + `captureBack` (commit + bundle / file-snapshot / none + write `filesystem_captures`). Lives at `packages/server/src/services/filesystem-mounter.ts`. *(proves: unit per provision mode + capture kind)*.
5. **(server)** Wire Phase 5.5 into `admitSession` (driver query → loop `mount`; zero rows → skip) inside the existing try/revert block. Add `filesystemMounter?` + `captureBasePath?` to `ProvisionSessionDeps`. *(proves: AC3 degradation integration test)*.
6. **(server)** Wire `captureBack` before the 3 `workspace.destroy` sites in `runSession`. *(proves: AC2 capture integration test)*.
7. **(server/app)** Construct `SandboxFilesystemMounter` in `app.ts` (reuse `scResolver`, `db`) and thread through `createSessionRoutes` → `startSessionProvision` deps. *(proves: live-proof test goes through the real route)*.
8. **(live-proof)** Lane A hermetic integration test + Lane B network-tagged (skip-guarded) test (§Live-proof).

Dependency order: 1 → 2,3 (parallel) → 4 → 5,6 → 7 → 8.

---

## Type signatures / contracts (deltas only)

```ts
// packages/fabric/src/services/git-export-runner.ts — GitRunner interface gains:
clone(url: string, branch: string, opts?: { depth?: number; tokenConfig?: GitConfigInjection }): Promise<void>;
bundle(bundlePath: string, ref: string): Promise<void>;

// packages/server/src/services/service-connection-resolver.ts:
async resolveTokenByConnectionId(connectionId: string): Promise<string | null>;

// packages/server/src/services/filesystem-mounter.ts (NEW):
export class SandboxFilesystemMounter implements FilesystemMounter {
  constructor(deps: { db: HyperIdleDb; resolver: ServiceConnectionResolver; captureBasePath: string });
  mount(input: { filesystem: Filesystem; sandboxPath: string; auth: FilesystemAuth | null }): Promise<MountResult>;
  captureBack(input: { filesystem: Filesystem; sandboxPath: string }): Promise<CaptureResult>;
}

// packages/server/src/services/session-provisioning.ts — ProvisionSessionDeps gains:
readonly filesystemMounter?: FilesystemMounter;
readonly captureBasePath?: string;
```
`MountResult`/`CaptureResult`/`FilesystemAuth`/`Filesystem` are imported from `@hyperidle/shared` (already defined — no change).

---

## Live-proof lane (non-negotiable for DONE)

**Lane A — hermetic, always runs (`AO2-materialize.integration.test.ts`):**
1. `test({ db, app })` fixture. Create a **real local git repo** in a temp dir (`git init`, commit a `README.md` + a trivial `package.json` with a `test` script, on branch `main`) — this is the "remote" (cloned via `file://`).
2. Seed team + bot user + a `filesystems` row (`kind:code`, `connectionId:null` local-first, `resourceRef:{kind:code, repo:"file:///<temp>", branch:"main"}`, `writeback:git`) + a `filesystem_injections` row for the bot.
3. Drive the **shipped provisioning path** — call `provisionSession`/`admitSession` with the real `SandboxFilesystemMounter` + `LocalSandboxAdapter` + a builtin/stub adapter (the harness adapter may be a test adapter; the **materialization + capture under test is real**, not mocked). Assert: `<sandbox>` contains `README.md` and `.git`; `HEAD` is on `main`.
4. Edit a file in the sandbox (the test acts as the agent's edit — the harness file-tool is the harness's concern, proven separately; here we prove the *capture path*), run `npm test`/`node` against the working tree to prove it's executable, then trigger session teardown.
5. After teardown: assert `<sandbox>` is gone AND a `filesystem_captures` row exists AND restoring `capturePath` (the bundle) to a temp dir shows the edit commit. **This proves clone→edit→run→capture→survive-destroy end to end, through the real route handler.**
6. AC3: a second bot with no injection → provision → assert no mount, session active, no capture row.

**Lane B — local-only, network, skip-guarded (mirrors AO1 Lane B):** env `AO2_GITHUB_PAT` + `AO2_GITHUB_REPO` → seed an encrypted `service_connections` row → filesystem referencing it → real session → real authed `clone` of a real (private) GitHub repo → assert working tree present. LOUDLY skip when env absent. This is the proof the disposable forge-auth projection accepts a real token (can't be mocked — a mock reproduces the rejected Noop stub).

**Harness reality (memory `supported_harnesses_and_hooks`):** the materialize+capture mechanism is harness-agnostic (it operates on the sandbox dir before/after the harness runs). The agent-edits-files step is the harness's native fileEditing/shell — proven per-harness in the existing real-harness lanes, not re-proven here. AO2's live-proof targets the materialization + capture pipeline, which is what AO2 owns.

---

## Security & abuse cases

- **Secret handling (new credential surface):** the ONLY new plaintext path is `resolveTokenByConnectionId`, wired exclusively mounter→sandbox-git-config. Token never in argv/URL/log (host-scoped `--local` config + `redactArg` + `buildGitEnv` allow-list). Durable records (`filesystems`/`sessions`/`filesystem_captures`) store no plaintext (AC4a). **Addressed.**
- **Path traversal (resourceRef.repo / folder as path input):** `repoToUrl` + `extractLocalPath` already constrain shapes; clone target is always `<sandboxPath>` (server-controlled), never agent-controlled. Mount writes only within the sandbox; capture writes only within `<captureBasePath>/<sessionId>/`. **Addressed** — assert capturePath is under captureBasePath (no `..`).
- **SSRF (outbound clone URL):** the clone URL comes from a founder-registered filesystem row (not agent input). `git clone` over `file://`/`https://`. Local-first `file://` is intended (local repos). No new SSRF surface beyond what AO1's `git ls-remote` already does against the same `resourceRef`. **N/A-beyond-AO1** — same trust boundary (founder-registered resource).
- **Rate-limit:** no new POST/PATCH route (rides existing `POST /api/sessions`). **N/A.**
- **Input-trust (agent-authored fields):** the agent does not author the filesystem/connection/branch — the founder registers them (AO1). The agent only authors file contents inside its own sandbox. **N/A.**
- **Disposability:** the auth projection lives in the sandbox `.git/config`, removed by `workspace.destroy`. Reviewer verifies no auth leaks into the durable bundle (the bundle is `git bundle` of commits/objects — contains no `.git/config`). **Addressed (AC4c).**

Security posture is **earned, not preemptive** (ETHOS): no cross-tenant guard, no rogue-agent design — single-founder, team-scoped, agent works with the founder's creds like an employee.

---

## protectedTests
- `packages/server/src/__tests__/AO1-filesystems.integration.test.ts`
- `packages/server/src/__tests__/AO1-reachability-lane-b.integration.test.ts`
- `packages/server/src/__tests__/AO1-filesystem-reachability.test.ts`

(AO2 must not alter AO1's registry/reachability assertions. AO2 extends the `GitRunner` interface — the export-runner's existing H1 tests must stay green; new methods are additive.)

## sharedFiles
- `packages/db/src/schema.ts` (new `filesystem_captures` table)
- `packages/fabric/src/services/git-export-runner.ts` (GitRunner interface + factory)
- `packages/server/src/services/session-provisioning.ts` (ProvisionSessionDeps + Phase 5.5 + captureBack)
- `packages/server/src/app.ts` (mounter construction + deps wiring)
- `packages/server/src/routes/sessions-routes.ts` (deps passthrough)
- `packages/fabric/src/index.ts` (re-export if any new fabric symbol is needed by server)

## Migrations
- Forward-only: add `filesystem_captures` table (`npm run db:generate`). No rename/remove of existing symbols. No call-site migration needed (new table, new methods are additive).

## Risks / ambiguities
- **Multi-`code`-filesystem-per-bot** mount layout (root vs subdir) — v1 handles ≤1 code-fs-at-root + doc_set-at-subdir; multi-code recorded as a known limitation. ⚠️ confirm acceptable.
- **Crash-path capture** — recommend skip (inconsistent tree); confirm.
- **Shallow clone + future push** — `--depth=1` is fine for AO2 (capture=bundle, no push); AO3 may need `--unshallow`. Out of scope here.
- **`captureBasePath` default** — needs a sane default sibling of `sandboxBasePath`; confirm path convention in build.
- ⚠️ UNVERIFIED: `git bundle create <path> HEAD` on a `--depth=1` shallow clone bundles only the shallow commits — sufficient to recover the agent's new commit (the durability target), but not full history. Acceptable for capture (the bundle carries the new work); verify in Lane A build.
