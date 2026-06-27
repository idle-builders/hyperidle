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
| `resolveToken(connectionId)` available server-side | `ServiceConnectionResolverAdapter.resolveToken` binds `userId` from `c.get("userId")` (per-request). **AO2 runs DETACHED — no request context, no request userId.** | **Load-bearing reconciliation (§3).** AO2 adds a second `FilesystemAuthResolver` seam impl, `OwnerScopedAuthResolver`, that resolves the token by the connection's **owning userId** (`service_connections.userId`), reusing `ServiceConnectionResolver.resolve(userId, id)`. No new method on the concrete class — keeps the AO1 seam, AN2 subsumes. |
| `GitRunner` can checkout | Export-only: `init/add/commit/push/lsRemote`, **no clone/fetch/checkout** | §2 adds `clone`/`fetchCheckout` to the runner (same file, same hardened `spawnGit`). |
| Connection supplies `source` for provision mode | `FilesystemAuth.provision` discriminator: `git-credential{remote}` / `env{vars}` / `none`. AO1's adapter currently returns `{mode:"none"}` (no row context) | AO2 builds the `git-credential` directive itself at mount (it HAS the row + resolved token); does not rely on the adapter's context-free `resolve()`. |
| Materialization driven by injection query | `filesystem_injections` PK `(agentUserId, filesystemId)`, index on `agentUserId` | §1 query: `SELECT f.* FROM filesystems f JOIN filesystem_injections fi ON fi.filesystemId=f.id WHERE fi.agentUserId = :agentId`. |
| Artifact provenance for captured commit | `artifacts` has NO commit/filesystem columns (848-865) | **No artifact write in AO2** (AO3/AL7 owns review subjects). Capture provenance recorded on a **new `filesystem_captures` table** (§6, Design-it-twice) — keeps `artifacts` kernel-clean. |

**No contradiction with an existing concept doc** — the credential reversal is already reconciled in `reconciliation.md` and matches `filesystem-primitive.md`.

---

## Phase 0 — Interrogation (resolved with recommended answers)

1. **Where does the resolved token's `userId` come from in a detached run?**
   Recommend: from the **connection row's `userId`** (the human/owner who registered the Connection), looked up by `connectionId`. The agent is a bot; it doesn't own the Connection — its team's founder does. AO2 adds a detached-safe `FilesystemAuthResolver` seam impl, `OwnerScopedAuthResolver`, that reads `service_connections.userId` then delegates to `ServiceConnectionResolver.resolve(userId, id)` (the one decrypt path; no new crypto, no new method on the concrete class). This is the durable-auth → disposable-sandbox projection: the agent acts with the founder's forge auth. *Confirm.*

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

**Why before context assembly, not after:** materializing **first** means a mount failure aborts before the (more expensive) context assembly runs and before `session_started` is emitted — fail fast, cheap rollback. Materialize → assemble context → start ingestion → emit `session_started`. **Note: ordering does NOT buy subtree disjointness** — assembly + scaffolding (below) write into the same sandbox root the repo occupies, *after* the mount. The collision is resolved by capture scoping (§5b), not by ordering. The earlier "disjoint subtrees" claim was wrong and is retracted.

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

**Mount target path within the sandbox — root-mount, capture scoped (the CRITICAL resolution):**

The harness `cwd` is **hardwired to `sandboxPath`** in every adapter — `claude-agent-sdk-adapter.ts:252` (`cwd: config.sandboxPath`), `cli-harness-adapter.ts:377` + `:603` (spawn + re-engage), and codex/opencode pick up the same cwd (adapter-pool.ts:327-328, 380). There is no per-adapter cwd override on the AO2 surface. Therefore the repo working tree MUST sit at `<sandboxPath>` root so the agent's `git`/build/test commands run against it with no `cd`. **A `<sandbox>/workspace/<fs>/` subdir mount would require rewriting every harness adapter's cwd — out of AO2 scope and a bad coupling.** So a single injected `code` filesystem mounts at **`<sandboxPath>` root**.

**The collision the critique flagged is real and root-mount alone does not fix it.** The sandbox root is *co-owned* by provisioning scaffolding written AFTER the mount (verified call sites in `session-provisioning.ts`):

| Writer (verified file:fn) | Writes at root | Note |
|---|---|---|
| `context-assembly.ts:91-106` `assembleContext` | `.fabric/`, `context/`, `knowledge/`, `work/` | read-only context tree + manifest |
| `context-assembly-prompt.ts:277-279` `writeSandboxAgentsMd` | **`AGENTS.md` AND `CLAUDE.md`** (dual-write, every session) | `@lore AK1` — NOT `AGENTS.md`-only; both files written verbatim |
| `session-provisioning.ts` Phase 8b MCP | `.mcp.json` | internal-MCP config |
| `cli-mcp-config.ts:87-122` | `.codex-home/config.toml`, `opencode.json` | CLI-harness MCP config |
| `provision-return-hook.ts:118,198,222` `provisionReturnHook` | `.claude/`, `.codex/`, **`.codex-home/`** (auth.json + config.toml copied from `~/.codex`), `.opencode/` | `@lore AL6` — **`.codex-home/auth.json` is a real host credential copied in on the codex path** |

Two failures if capture is naive `git add -A`: **(a) pollution** — the bundle/commit stages all that HyperIdle scaffolding, and on the codex path it stages **`.codex-home/auth.json`, a real host credential** (this is the load-bearing leak, not cosmetic — see §Security); **(b) overwrite** — in the self-hosting case (materialized repo IS HyperIdle, the whole point of Track AO) `writeSandboxAgentsMd` overwrites the repo's own `AGENTS.md` **and `CLAUDE.md`**, and `.mcp.json`/`.claude/` shadow real repo files (HyperIdle tracks all of these at root — `git ls-files` confirms `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, a populated `.claude/` tree), and the polluted tree is what gets committed.

**Resolution (§5b): scoped capture + scaffolding-path exclusion + tracked-collision overwrite guard, all derived from a single shared constant (`SANDBOX_SCAFFOLDING_PATHS`) that the provisioning writers and the capture-exclude both import** — so a future writer can't silently drift off the exclude list. Capture is NOT `add -A`; it stages only the repo's own tracked + agent-authored paths, with the scaffolding paths excluded via a sandbox-local `.git/info/exclude` written at mount and an explicit negative pathspec at commit. The overwrite risk is handled at mount: the mounter records the repo's pre-scaffolding tree (the clone is pristine), and capture diffs against the clone's `HEAD`. The overwrite-guard pathspec is built at capture time from **`git ls-files ∩ SANDBOX_SCAFFOLDING_PATHS`** — the full set of tracked files that collide with a scaffolding path — not a hardcoded subset, so the self-hosting case (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude/`) is subtracted in full. See §5b for the exact mechanism. Multiple injected filesystems (rare, N:N): the FIRST `code` filesystem goes to root; additional `doc_set` folders mount at `<sandboxPath>/<slug>/` and capture per-folder. *v1 supports ≤1 `code` fs at root + `doc_set` at subdir; multi-code recorded as a known limitation.*

**Wiring the mounter into provisioning deps:** add an optional `filesystemMounter?: FilesystemMounter` to `ProvisionSessionDeps`. Constructed in `app.ts` (where `db` + `ServiceConnectionResolver` already exist, lines 416-451): build `OwnerScopedAuthResolver({ db, resolver: scResolver })` (§3), pass it into `SandboxFilesystemMounter` as its `FilesystemAuthResolver` seam, thread the mounter through `createSessionRoutes` → `startSessionProvision` deps, exactly like `mcpBridgeRegistry`. The driver in Phase 5.5 calls `authResolver.resolve(connectionId)` to produce the `auth` arg for `mount`. **Absent → no materialization** (kernel-only mode, tests without the adapter stay green — same pattern as `mcpBridgeRegistry`).

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

/** Create a `git bundle` at `bundlePath` containing everything reachable from `ref`.
 *  captureBack passes ref = the capture branch tip (the bot's commit), bundling
 *  the full branch ref so the bundle is self-contained and restorable on any clone
 *  (including a shallow one). Used to make the clone's commits durable before the
 *  sandbox is destroyed. */
bundle(bundlePath: string, ref: string): Promise<void>;
```
- `clone` binds the runner cwd to the (empty, freshly-spawned) target dir and runs `git clone --depth <n> --single-branch --branch <branch> -- <url> .` (clone into `.` = the bound cwd — resolves the SUGGESTION ambiguity; never `<url> <cwd>` with cwd===target). Token via the same `GIT_CONFIG_COUNT/KEY_0/VALUE_0` injection `probeGitRemote` builds, from the shared header-builder helper factored out of `filesystem-reachability.ts`.
- **`bundle` ref-spec pinned:** captureBack commits onto the cloned branch, then calls `bundle(<path>, "refs/heads/<branch>")` → `git bundle create <bundlePath> refs/heads/<branch>`. We bundle the **branch ref**, NOT bare `HEAD` and NOT a `<base>..HEAD` range:
  - bundling the named ref makes the bundle **self-describing** — `git clone <bundle>` / `git fetch <bundle> <branch>` restores the branch + the bot's commit without needing a base sha.
  - on a `--depth=1` shallow clone, `git bundle create <ref>` packs the shallow commits reachable from the ref (the bot's new commit + the single base commit). That is exactly the durability target: the bundle carries the authored work and restores it. A `<base>..HEAD` *range* bundle is what historically breaks on shallow clones (no negative base ref) — we avoid the range form entirely. (local op, `localMs` timeout class).
  - **Proven, not assumed:** Lane A restores the bundle (`git clone <bundle> <tmp>` / `git -C <tmp> log`) and asserts the bot's commit + edit are present — see §Live-proof. The shallow-bundle behavior is verified in that lane, not hoped.
- **No `checkout` method** — `--branch` on clone lands the working tree at the branch. `fetch` deferred (AO3 landing).

**Env hardening:** all new methods go through the existing `spawnGit` → `buildGitEnv`, so they inherit `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `GIT_CONFIG_NOSYSTEM=1`, the env allow-list, and credential-redacted logging **for free**. This is the single biggest reason to extend, not fork.

**Snapshot net / typecheck impact:** the `GitRunner` interface gains 2 methods; the `FakeGitRunner` used in export tests must implement them (no-op stubs in test doubles are fine — they're test doubles, not production stubs from memory).

---

## §3 — Server-side token resolution through the AO1 seam (the detached-run reconciliation)

**The seam, not the concrete class.** AO1 shipped the `FilesystemAuthResolver` seam (`shared/src/filesystem.ts:77`) with `resolve(connectionId) → FilesystemAuth | null` and `resolveToken(connectionId) → string | null` — *both keyed on `connectionId` only, no request userId in the signature*. AO2's mounter depends on **this seam**, exactly the consumer AO1 built it for. It does NOT couple to the concrete `ServiceConnectionResolver` and does NOT add a method to that class. This keeps the data flow coherent and lets **AN2 later subsume** the provisioning resolver behind the same seam.

**Why a second impl, not the AO1 adapter.** The shipped `ServiceConnectionResolverAdapter` (filesystem-reachability.ts:54) binds `userId` at construction from `c.get("userId")` — **request-bound, unusable in the detached `admitSession` run** (verified: constructor takes `(resolver, userId)`, line 55-57). AO2 adds a second seam impl, **`OwnerScopedAuthResolver implements FilesystemAuthResolver`**, that resolves the `userId` from the **connection row's owner** instead of a request:

```ts
// packages/server/src/services/owner-scoped-auth-resolver.ts (NEW)
// Detached-safe FilesystemAuthResolver: derives userId from service_connections.userId
// (the founder who registered the Connection), not from a request context.
export class OwnerScopedAuthResolver implements FilesystemAuthResolver {
  constructor(private readonly deps: { db: HyperIdleDb; resolver: ServiceConnectionResolver });
  async resolve(connectionId: string): Promise<FilesystemAuth | null>;       // wrapper; mount enriches host
  async resolveToken(connectionId: string): Promise<string | null>;          // owner-scoped decrypt
  async canResolve(connectionId: string): Promise<boolean>;
  sourceOf(_: string): null;
}
```
`resolveToken` impl: `SELECT userId, ... FROM service_connections WHERE id = connectionId LIMIT 1` → delegate to the existing `ServiceConnectionResolver.resolve(row.userId, connectionId)` (the **one** plaintext path; no new decrypt code, no duplicated crypto). Null on any failure; never throws. This is the durable-auth → disposable-sandbox projection: the bot acts with the founder's forge auth, like an employee.

**No new method on `ServiceConnectionResolver`.** The earlier rev's `resolveTokenByConnectionId` is dropped — it orphaned the seam. The owner→token lookup lives in the seam impl, reusing `ServiceConnectionResolver.resolve(userId, id)` unchanged.

**Security note (earned, not preemptive):** the only plaintext path remains `ServiceConnectionResolver.resolve` (unchanged); `OwnerScopedAuthResolver` is wired EXCLUSIVELY into the mounter → sandbox git config, never to a route response or logger (mirrors the AN1 `@lore`). No cross-tenant guard — server-side provisioning of a Connection the team's founder bound to the team's filesystem; a cross-tenant guard here would be preemptive security against a non-threat (single-founder, team-scoped). Reviewer's security lens covers this in §Security.

---

## §4 — Disposable forge-auth projection into the sandbox

**Contract:** the resolved token is projected into the sandbox as a **disposable, sandbox-scoped git config**; the durable filesystem/session records store **no plaintext secret**; the projection **dies with the sandbox** (sandbox is `rm -rf`'d at teardown).

**Auth data flow (coherent, through the seam — resolves WARNING 2):**

`mount`'s frozen signature carries `auth: FilesystemAuth | null`. **It is now live, not vestigial.** Provisioning passes it: at Phase 5.5, for each injected filesystem with a `connectionId`, the driver calls `authResolver.resolve(connectionId)` on the `OwnerScopedAuthResolver` seam impl and passes the result as `mount(...).auth`. The mounter then:
1. reads the raw token via the **same seam**: `authResolver.resolveToken(filesystem.connectionId)` (single owner-scoped decrypt);
2. builds the host-scoped directive itself using the remote host it owns from `repoToUrl(filesystem.resourceRef.repo)` — the seam can't supply the host (the seam is keyed on `connectionId` only, which is why AO1's `resolve()` returns `{mode:"none"}`). The mounter contributes the host; the seam contributes the token. Both auth touches go through the seam — nothing self-resolves crypto.

So `auth` is consumed (it signals "a Connection is bound; resolve & project"), and the token comes through the seam. `auth === null` → local-first, no projection. **This is the coherent flow the prior rev lacked** — no dropped param, no orphaned seam, no concrete-class coupling. AN2 subsumes by swapping the seam impl.

**Mechanism (build on git's native config, not a HyperIdle invention):** at mount, write the token as a **repo-local git config** inside the cloned working tree:
```
git config --local http.${protocol}//${host}/.extraHeader "Authorization: Basic <base64(x-access-token:TOKEN)>"
```
via the existing `GitRunner.configSet(key, value)` (interface line 50). The header key uses the **exact host-scoped shape** from filesystem-reachability.ts:161 — `http.${protocol}//${host}/.extraHeader` — produced by the shared header-builder helper (§2, factored out of `probeGitRemote` so the shapes can't drift). Because it is `--local`, it lives in `<sandboxPath>/.git/config` — inside the disposable sandbox, removed by `workspace.destroy`'s `rm -rf`. The agent's own `git fetch`/`push`/`gh` then authenticate ambiently with no token in argv, no env var the agent can echo to a log, no credential helper process.

`FilesystemAuth.provision` maps (the directive the mounter builds from the seam token + its own host):
- `git-credential` (remote host known) → write the `http.${protocol}//${host}/.extraHeader` local config (the `code`+forge case).
- `env{vars}` → write the vars to the sandbox's harness env (e.g. `GH_TOKEN` — already in `buildGitEnv`'s allow-list). v1 prefers `git-credential`; `env` is the `gh`-CLI escape hatch, optional.
- `none` → local-first, no projection (bare local repo / public repo / `auth === null`).

**Teardown:** no explicit auth teardown call — the `.git/config` containing the header is inside the sandbox dir that `workspace.destroy` removes. Disposability is structural, not a cleanup step. (captureBack's bundle, §5, is taken BEFORE destroy and written OUTSIDE the sandbox, so the durable artifact never carries the `.git/config` secret.)

---

## §5 — Writeback / capture path

**Where:** a new `mounter.captureBack(...)` call in `runSession()`, placed **before every `workspace.destroy(sandboxHandle)`** (3 sites: line 1062 budget, 1104 not-returned, 1122 normal). Crash path (line 1040 `crashSession`) does NOT call `workspace.destroy` — capture on normal + budget + not-returned; skip on crash (agent didn't finish, tree may be inconsistent).

**Mounted-filesystem handle (resolves WARNING 1 — runSession can't see the mounts):** mount runs in `admitSession`; capture runs in `runSession`. The only handoff is `AdmittedSession`, which today carries no mounted-filesystem rows, so captureBack would have nothing to iterate. **Fix: carry the mounted rows on `AdmittedSession`.** Add `readonly mountedFilesystems: readonly MountedFilesystem[]` (default `[]`) to the `AdmittedSession` interface (line 281), where `MountedFilesystem = { filesystem: Filesystem; mountPath: string }`. Phase 5.5 populates it as it mounts each row; `runSession` iterates `admitted.mountedFilesystems` before each destroy site and calls `captureBack({ filesystem, sandboxPath: mountPath })` per entry. Carrying the rows (vs re-querying `agentId → injections → filesystems` in `runSession`) avoids drift if injections changed mid-session — capture exactly what was mounted. Zero mounts → empty array → captureBack loop is a no-op (degradation path intact).

**Per `writeback` kind:**
- **`git`** → **scoped stage (NOT `add -A`)** → `runner.commit(msg, agentName, agentEmail)` (author = the bot's identity) → `runner.bundle(<durableBundlePath>, "refs/heads/<branch>")`. The bundle is written to a **durable capture dir** outside the sandbox: `<captureBasePath>/<sessionId>/<filesystemId>.bundle`. This is what survives `rm -rf <sandbox>`. Scoped stage = §5b. (Push/PR = AO3/AL7 landing, out of scope.)
- **`file`** → copy the changed folder tree out to `<captureBasePath>/<sessionId>/<filesystemId>/` (last-write-wins snapshot, per concept "ride the host"), **excluding the scaffolding paths (§5b list)**. No diff/merge engine.
- **`none`** → no-op, `CaptureResult{captured:false}`.

## §5b — Scaffolding-scoped capture (the CRITICAL part-b resolution)

Root-mount means HyperIdle scaffolding lives in the same tree as the repo. Naive `git add -A` would commit it (pollution — including, on the codex path, a real host credential) and, in the self-hosting case, commit scaffolding-overwritten tracked files (overwrite). Four measures, all at the mounter, none touching the harness or assembly.

**0. Single source of truth — `SANDBOX_SCAFFOLDING_PATHS`, co-located with the writers (closes the drift bug).** The exclude list is NOT a free-floating literal in the mounter (that is exactly what drifted: `CLAUDE.md` and `.codex-home/` fell off it). It is a **shared exported constant** that the writers themselves import, so a future writer added to provisioning physically cannot fall off the capture exclude list without changing the constant. Both writer packages (`fabric` for context-assembly + AGENTS/CLAUDE, `server` for MCP/return-hook) need it, so the constant lives in `@hyperidle/shared`:
```ts
// packages/shared/src/filesystem.ts (co-located with the FilesystemMounter contract)
/** Every root path the session-provisioning writers create inside the sandbox.
 *  Capture MUST exclude all of these — they are HyperIdle injection, never the
 *  agent's authored repo work. A writer that adds a new sandbox path MUST add it
 *  here (and the writers import this so the relationship is enforced, not hoped). */
export const SANDBOX_SCAFFOLDING_PATHS = [
  "AGENTS.md",        // context-assembly-prompt.ts:278 writeSandboxAgentsMd (dual-write)
  "CLAUDE.md",        // context-assembly-prompt.ts:279 writeSandboxAgentsMd (dual-write, @lore AK1)
  ".mcp.json",        // session-provisioning Phase 8b internal MCP
  ".claude/",         // provision-return-hook.ts:118 settings.json + return-check.sh
  ".codex/",          // provision-return-hook.ts:198 legacy/compat hooks
  ".codex-home/",     // provision-return-hook.ts:222 — auth.json + config.toml COPIED FROM ~/.codex (CREDENTIAL), @lore AL6
  "opencode.json",    // cli-mcp-config.ts:122 opencode MCP config
  ".opencode/",       // provision-return-hook.ts opencode plugin path
  ".fabric/",         // context-assembly.ts:91 manifest
  "context/",         // context-assembly.ts:92-94 read-only context tree
  "knowledge/",       // context-assembly.ts:95-97
  "work/",            // context-assembly.ts:98 + task-notes.md
] as const;
```
The build wires `context-assembly.ts`, `context-assembly-prompt.ts`, `cli-mcp-config.ts`, `provision-return-hook.ts`, and `session-provisioning.ts` (Phase 8b) to derive their write paths from / be guarded against this constant (at minimum a same-file unit assertion that each writer's literal is `∈ SANDBOX_SCAFFOLDING_PATHS`), so adding a writer that isn't listed fails a test rather than silently leaking into the next capture.

**1. Pristine baseline at mount.** The clone lands a pristine repo; its `HEAD` is the untouched upstream tip. Capture diffs the working tree against **that** `HEAD`. Repo files the agent never touched stay unstaged regardless of what assembly wrote *around* them.

**2. Scaffolding-path exclusion (`.git/info/exclude`), written at mount.** The mounter writes **`SANDBOX_SCAFFOLDING_PATHS`** (each prefixed `/` to anchor at root) to `<sandbox>/.git/info/exclude` immediately after clone, **before** Phase 6/8b run. `.git/info/exclude` keeps these **untracked** even after assembly writes them, so a scoped `git add` never picks them up. This is what keeps **`.codex-home/auth.json` out of the commit on the codex path** — the credential dir is never staged because it's on the constant. (`info/exclude` is local-only, dies with the sandbox, never alters the repo's own committed `.gitignore`.)

**3. Tracked-collision overwrite guard, derived (not hardcoded).** If the repo *itself* tracks a file that collides with a scaffolding path (the self-hosting case: HyperIdle tracks `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, and a populated `.claude/` tree), `info/exclude` won't un-track it, so assembly's overwrite *would* show as a modification. Guard: at mount the mounter runs `git ls-files` and computes the **collision set = tracked paths that match any entry of `SANDBOX_SCAFFOLDING_PATHS`** (a path matches a `dir/` entry if it's under that dir). The scoped stage subtracts the full collision set via an explicit pathspec built from it: `git add -- . ':(exclude)AGENTS.md' ':(exclude)CLAUDE.md' ':(exclude).mcp.json' ':(exclude).claude/**' …` — **every** colliding tracked path, computed from the constant, never a hardcoded `AGENTS.md`/`.mcp.json` pair. So an assembly-overwritten tracked `CLAUDE.md` or `.claude/settings.json` is never staged; the bot's *intended* edits to other files are. The agent editing a genuinely-tracked scaffolding file on purpose is out of v1 scope (rare; recorded as a known limitation — the common bot edits source, not its own context/settings files).

**Net:** the commit/bundle contains the agent's authored repo changes and nothing HyperIdle injected — **no scaffolding, and specifically no `.codex-home/auth.json`**. The `file`-writeback snapshot applies the same exclusion list when copying out. Verified by Lane A asserting the restored bundle contains the edit AND does **not** contain any of `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.fabric/`, `context/`, **`.codex-home/`** — and specifically no `auth.json` and no secret string (the credential-leak proof, exercised on a codex-path variant — see §Live-proof).

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
| AC2 | Working-tree changes captured per `writeback`, not lost on destroy | Live-proof (Lane A, §Live-proof): test simulates the agent edit + test command runs; after session end assert a `filesystem_captures` row exists AND **restoring the bundle** (`git clone <capturePath>` → `git log`/file-read) shows the bot's commit + the edit, AND the restored tree does NOT contain the scaffolding (`AGENTS.md`/`CLAUDE.md`/`.mcp.json`/`.fabric/` — §5b anti-pollution). **Plus a codex-path variant (Lane A 5b) asserting `.codex-home/`/`auth.json`/secret string is ABSENT from the bundle** (the credential-leak proof). Sandbox destroyed first — proves durable. Bundle ref-spec = `refs/heads/<branch>` (§2). |
| AC3 | Bot with no injected fs still provisions/runs | Integration test: agent with zero `filesystem_injections` → `provisionSession` → assert `sessions.state` reaches a terminal/active outcome and no mount attempted (mounter spy/`filesystem_captures` empty). |
| AC4 | Forge auth provisioned as disposable projection; durable record stores no plaintext; dies with sandbox | (a) **Unit**: `OwnerScopedAuthResolver.resolveToken` decrypts the owner's token; assert no plaintext in any `filesystems`/`sessions`/`filesystem_captures` column (read rows back, assert token string absent). (b) **Unit**: mount writes `http.${protocol}//${host}/.extraHeader` to `<sandbox>/.git/config` (host-scoped, base64), token NOT in argv (assert via runner spy argv). (c) **Structural**: after `workspace.destroy`, `<sandbox>/.git/config` is gone (dir removed). (d) **Live-proof Lane B** (local, network, skip-guarded like AO1 Lane B): real PAT → clone a real private repo → assert working tree present. |

**route-checklist:** AO2 mounts on the existing `POST /api/sessions` provisioning path only (no new routes). The materialization hook is in `admitSession` (1 call site) + captureBack in `runSession` (3 destroy sites). Checklist for the reviewer: Phase 5.5 mount present; captureBack before each of lines ~1062/1104/1122 `workspace.destroy`.

---

## Ordered task list

0. **(shared)** Add `SANDBOX_SCAFFOLDING_PATHS` to `packages/shared/src/filesystem.ts` (the complete verified writer set, §5b·0). Wire the writers (`context-assembly.ts`, `context-assembly-prompt.ts`, `cli-mcp-config.ts`, `provision-return-hook.ts`, session-provisioning Phase 8b) to derive-from / be asserted-against it. *(proves: a same-file unit test per writer asserts its written root path ∈ `SANDBOX_SCAFFOLDING_PATHS` — adding an unlisted writer fails a test, not a capture)*. **This task must land before §5b's mounter can import the list.**
1. **(schema)** Add `filesystemCaptures` table to `schema.ts` + `npm run db:generate`. Export row types. *(proves: migration runs; `.schema` shows table)* — `sharedFiles: schema.ts`.
2. **(fabric)** Extend `GitRunner` interface + `createGitRunner` + `FakeGitRunner` with `clone` + `bundle`. Factor the GIT_CONFIG header-builder (`x-access-token` → Basic) into a shared helper reused by `probeGitRemote` and the mounter. *(proves: unit test clones a `file://` local repo into a temp dir, asserts working tree + branch; bundle round-trips)*.
3. **(server)** Add `OwnerScopedAuthResolver implements FilesystemAuthResolver` (`owner-scoped-auth-resolver.ts`): `resolveToken` reads `service_connections.userId` → `ServiceConnectionResolver.resolve(userId, id)`. **No new method on the concrete class.** *(proves: unit — seed encrypted connection, resolve by id via owner, assert plaintext; wrong id → null)*.
4. **(server)** Implement `SandboxFilesystemMounter implements FilesystemMounter` (`filesystem-mounter.ts`), constructed with the `FilesystemAuthResolver` seam: `mount` (clone via runner → write `.git/info/exclude` from `SANDBOX_SCAFFOLDING_PATHS` §5b·2 → compute tracked-collision set `git ls-files ∩ SANDBOX_SCAFFOLDING_PATHS` §5b·3 → write disposable host-scoped local git config from seam token §4) + `captureBack` (scoped stage with derived overwrite-guard pathspec §5b + commit + bundle `refs/heads/<branch>` / file-snapshot / none + write `filesystem_captures`). *(proves: unit per provision mode + capture kind; scoped-stage excludes scaffolding INCLUDING a seeded `.codex-home/auth.json`)*.
5. **(server)** Add `mountedFilesystems` to `AdmittedSession` (WARNING 1). Wire Phase 5.5 into `admitSession` (driver query → `authResolver.resolve` → loop `mount`; zero rows → skip; populate `mountedFilesystems`) inside the existing try/revert block. Add `filesystemMounter?` + `captureBasePath?` to `ProvisionSessionDeps`. *(proves: AC3 degradation integration test)*.
6. **(server)** Wire `captureBack` before the 3 `workspace.destroy` sites in `runSession`, iterating `admitted.mountedFilesystems`. *(proves: AC2 capture integration test)*.
7. **(server/app)** Construct `OwnerScopedAuthResolver` + `SandboxFilesystemMounter` in `app.ts` (reuse `scResolver`, `db`) and thread the mounter through `createSessionRoutes` → `startSessionProvision` deps. *(proves: live-proof test goes through the real route)*.
8. **(live-proof)** Lane A hermetic integration test (incl. anti-pollution negative assertion + **codex-path credential-absence variant, §Live-proof 5b** + named sanity-break) + Lane B network-tagged (skip-guarded) test (§Live-proof).

Dependency order: 0 → 1 → 2,3 (parallel) → 4 → 5,6 → 7 → 8.

---

## Type signatures / contracts (deltas only)

```ts
// packages/shared/src/filesystem.ts — NEW shared constant (single source of truth, §5b·0):
export const SANDBOX_SCAFFOLDING_PATHS: readonly string[]; // complete verified writer set incl. CLAUDE.md + .codex-home/

// packages/fabric/src/services/git-export-runner.ts — GitRunner interface gains:
clone(url: string, branch: string, opts?: { depth?: number; tokenConfig?: GitConfigInjection }): Promise<void>;
bundle(bundlePath: string, ref: string): Promise<void>;

// packages/server/src/services/owner-scoped-auth-resolver.ts (NEW) — detached-safe seam impl:
export class OwnerScopedAuthResolver implements FilesystemAuthResolver {
  constructor(deps: { db: HyperIdleDb; resolver: ServiceConnectionResolver });
  resolve(connectionId: string): Promise<FilesystemAuth | null>;
  resolveToken(connectionId: string): Promise<string | null>; // owner-scoped: row.userId → resolver.resolve(userId, id)
  canResolve(connectionId: string): Promise<boolean>;
  sourceOf(_: string): null;
}
// NO new method on ServiceConnectionResolver — owner→token lives in the seam impl, reusing resolve(userId, id).

// packages/server/src/services/filesystem-mounter.ts (NEW):
export class SandboxFilesystemMounter implements FilesystemMounter {
  constructor(deps: { authResolver: FilesystemAuthResolver; captureBasePath: string });
  mount(input: { filesystem: Filesystem; sandboxPath: string; auth: FilesystemAuth | null }): Promise<MountResult>;
  captureBack(input: { filesystem: Filesystem; sandboxPath: string }): Promise<CaptureResult>;
}

// packages/server/src/services/session-provisioning.ts:
// AdmittedSession gains (resolves WARNING 1 — runSession sees the mounts):
readonly mountedFilesystems: readonly { filesystem: Filesystem; mountPath: string }[];
// ProvisionSessionDeps gains:
readonly filesystemMounter?: FilesystemMounter;
readonly captureBasePath?: string;
```
The mounter depends on the **`FilesystemAuthResolver` seam**, not the concrete `ServiceConnectionResolver` — AN2 subsumes by swapping the impl. `MountResult`/`CaptureResult`/`FilesystemAuth`/`Filesystem`/`FilesystemAuthResolver` imported from `@hyperidle/shared` (already defined — no change).

---

## Live-proof lane (non-negotiable for DONE)

**Lane A — hermetic, always runs (`AO2-materialize.integration.test.ts`):**
1. `test({ db, app })` fixture. Create a **real local git repo** in a temp dir (`git init`, commit a `README.md` + a trivial `package.json` with a `test` script, on branch `main`) — this is the "remote" (cloned via `file://`).
2. Seed team + bot user + a `filesystems` row (`kind:code`, `connectionId:null` local-first, `resourceRef:{kind:code, repo:"file:///<temp>", branch:"main"}`, `writeback:git`) + a `filesystem_injections` row for the bot.
3. Drive the **shipped provisioning path** — call `provisionSession`/`admitSession` with the real `SandboxFilesystemMounter` + `LocalSandboxAdapter` + a builtin/stub adapter (the harness adapter may be a test adapter; the **materialization + capture under test is real**, not mocked). Assert: `<sandbox>` contains `README.md` and `.git`; `HEAD` is on `main`.
4. Edit a file in the sandbox. **Boundary stated explicitly:** the test *simulates the agent's edit* (writes/edits a file in the sandbox tree directly). This is acceptable and intentional — the harness's native fileEditing/shell is the harness's concern, proven per-harness in the existing real-harness lanes; **what AO2 owns and must prove is the materialization + capture pipeline**, not the harness edit path. Run `npm test`/`node` against the working tree to prove it's executable, then trigger teardown.
5. After teardown, assert (the **restore-and-read-back** is an assertion, not a hope):
   - `<sandbox>` is gone (structural disposability);
   - a `filesystem_captures` row exists with `commitSha` + `capturePath`;
   - **restore the bundle** to a fresh temp dir (`git clone <capturePath> <tmp>` or `git -C <tmp> fetch <capturePath> <branch>`) → `git -C <tmp> log` shows the bot's commit AND the edited file content is present (the edit survived destroy);
   - **anti-pollution negative assertion (§5b):** the restored tree does NOT contain `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.fabric/`, `context/` — proving scoped capture excluded the scaffolding.

   **This proves clone→edit→run→scoped-capture→survive-destroy end to end, through the real route handler.**
5b. **Credential-leak variant (load-bearing — a Claude-only test cannot catch this; memory: agent-behavior needs the hardest member).** Run at least one Lane A variant under the **codex** provisioning path (`cliMcpDialect`/`settings-codex` so `provisionReturnHook` writes `<sandbox>/.codex-home/`), OR directly seed a `<sandbox>/.codex-home/auth.json` containing a known sentinel secret string before capture. After capture + teardown, assert the restored bundle (and the `file`-snapshot path) contain **NONE** of: `.codex-home/`, any `auth.json`, the sentinel secret string. This exercises the exact directory that leaks. The plain (non-codex) variant alone passes even with `.codex-home/` off the exclude list — so this variant is what actually proves the disposable-auth guarantee (§4) holds through the capture back door.
6. AC3: a second bot with no injection → provision → assert no mount, session active, no capture row.

**Sanity-break (memory `mock-validation-trap` — names the revert→red, required):** the reviewer must be able to un-wire the fix and watch Lane A go red. Pinned break: **un-wire the Phase 5.5 mount call** (or set `filesystemMounter` to undefined in the test's deps) → Lane A's step-5 `<sandbox>/.git` / restored-bundle assertions go **red** (no clone happened, no capture row, nothing to restore). This is feasible and cheap (one deps line) and is the gate that proves Lane A tests the real wiring, not a fixture. Lane A must NOT pass with the mount un-wired.

**Lane B — local-only, network, skip-guarded (mirrors AO1 Lane B):** env `AO2_GITHUB_PAT` + `AO2_GITHUB_REPO` → seed an encrypted `service_connections` row → filesystem referencing it → real session → real authed `clone` of a real (private) GitHub repo → assert working tree present. LOUDLY skip when env absent. This is the proof the disposable forge-auth projection accepts a real token (can't be mocked — a mock reproduces the rejected Noop stub).

**Harness reality (memory `supported_harnesses_and_hooks`):** the materialize+capture mechanism is harness-agnostic (it operates on the sandbox dir before/after the harness runs). The agent-edits-files step is the harness's native fileEditing/shell — proven per-harness in the existing real-harness lanes, not re-proven here. AO2's live-proof targets the materialization + capture pipeline, which is what AO2 owns.

---

## Security & abuse cases

- **Secret handling (new credential surface):** the plaintext path stays `ServiceConnectionResolver.resolve` (unchanged); `OwnerScopedAuthResolver` reuses it and is wired exclusively mounter→sandbox-git-config. Token never in argv/URL/log (host-scoped `--local` config + `redactArg` + `buildGitEnv` allow-list). Durable records (`filesystems`/`sessions`/`filesystem_captures`) store no plaintext (AC4a). **Addressed.**
- **Capture pollution → credential disclosure (STRIDE Information-Disclosure, §5b) — reclassified from cosmetic.** On the codex path `provisionReturnHook` writes `<sandbox>/.codex-home/auth.json`, a **real host credential copied from `~/.codex`** (`@lore AL6`). A naive `git add -A` would `git bundle` it into the durable, post-teardown capture — a host secret reaching a durable artifact that survives `rm -rf <sandbox>`. This is NOT pollution-as-cosmetic; it is an Information-Disclosure finding, and it is the load-bearing reason the capture must be scoped. **Invariant (must hold):** capture stages ONLY paths that differ from the pristine-clone `HEAD` AND are on the agent-authored set — **never any path in `SANDBOX_SCAFFOLDING_PATHS`**, and specifically never `.codex-home/`/`auth.json`. The §4 disposability claim ("the bundle contains no `.git/config` secret") is true for the `.git/config` token but is silently false for any *staged* secret file unless the scaffolding exclusion holds — so the exclusion is a security control, not a cleanliness nicety. Enforced by: the shared `SANDBOX_SCAFFOLDING_PATHS` constant (drift-proof exclude list, §5b·0), `.git/info/exclude` + derived tracked-collision pathspec (§5b·2/3), and **proven by Lane A's codex-path credential-absence assertion** (§Live-proof 5b). **Addressed.**
- **Path traversal (resourceRef.repo / folder as path input):** `repoToUrl` + `extractLocalPath` already constrain shapes; clone target is always `<sandboxPath>` (server-controlled), never agent-controlled. Mount writes only within the sandbox; capture writes only within `<captureBasePath>/<sessionId>/`. **Addressed** — assert capturePath is under captureBasePath (no `..`).
- **SSRF (outbound clone URL):** the clone URL comes from a founder-registered filesystem row (not agent input). `git clone` over `file://`/`https://`. Local-first `file://` is intended (local repos). No new SSRF surface beyond what AO1's `git ls-remote` already does against the same `resourceRef`. **N/A-beyond-AO1** — same trust boundary (founder-registered resource).
- **Rate-limit:** no new POST/PATCH route (rides existing `POST /api/sessions`). **N/A.**
- **Input-trust (agent-authored fields):** the agent does not author the filesystem/connection/branch — the founder registers them (AO1). The agent only authors file contents inside its own sandbox. **N/A.**
- **Disposability:** the forge-auth projection lives in the sandbox `.git/config`, removed by `workspace.destroy`. The `git bundle` is commits/objects only — it carries no `.git/config`, so the forge token never reaches the durable artifact. **But disposability of `.git/config` is NOT the whole story:** any *staged secret file* (the `.codex-home/auth.json` case above) WOULD reach the bundle unless the scaffolding exclusion holds. Disposability is therefore guaranteed by two independent controls — `.git/config` lives in the disposed sandbox (forge token) AND scoped capture excludes every scaffolding path (codex auth). Reviewer verifies both: no `.git/config` in the bundle AND no `.codex-home/`/`auth.json`/secret string (Lane A 5b). **Addressed (AC4c + §5b).**

Security posture is **earned, not preemptive** (ETHOS): no cross-tenant guard, no rogue-agent design — single-founder, team-scoped, agent works with the founder's creds like an employee.

---

## protectedTests
- `packages/server/src/__tests__/AO1-filesystems.integration.test.ts`
- `packages/server/src/__tests__/AO1-reachability-lane-b.integration.test.ts`
- `packages/server/src/__tests__/AO1-filesystem-reachability.test.ts`

(AO2 must not alter AO1's registry/reachability assertions. AO2 extends the `GitRunner` interface — the export-runner's existing H1 tests must stay green; new methods are additive.)

## sharedFiles
- `packages/shared/src/filesystem.ts` (NEW `SANDBOX_SCAFFOLDING_PATHS` constant — single source of truth for the capture-exclude list, imported by writers + mounter)
- `packages/fabric/src/context-assembly.ts` + `packages/fabric/src/context-assembly-prompt.ts` (assert/derive their root write paths against `SANDBOX_SCAFFOLDING_PATHS`)
- `packages/server/src/harness/cli-mcp-config.ts` + `packages/server/src/harness/provision-return-hook.ts` (assert/derive write paths against `SANDBOX_SCAFFOLDING_PATHS` — esp. `.codex-home/`)
- `packages/db/src/schema.ts` (new `filesystem_captures` table)
- `packages/fabric/src/services/git-export-runner.ts` (GitRunner interface + factory + `FakeGitRunner` no-op stubs for `clone`/`bundle`)
- `packages/server/src/services/filesystem-reachability.ts` (factor the host-scoped header-builder helper out of `probeGitRemote` for shared reuse)
- `packages/server/src/services/owner-scoped-auth-resolver.ts` (NEW — detached-safe `FilesystemAuthResolver` seam impl)
- `packages/server/src/services/filesystem-mounter.ts` (NEW — `SandboxFilesystemMounter`)
- `packages/server/src/services/session-provisioning.ts` (`AdmittedSession.mountedFilesystems` + `ProvisionSessionDeps` + Phase 5.5 + captureBack)
- `packages/server/src/app.ts` (resolver + mounter construction + deps wiring)
- `packages/server/src/routes/sessions-routes.ts` (deps passthrough)
- `packages/fabric/src/index.ts` (re-export if any new fabric symbol is needed by server)

## Migrations
- Forward-only: add `filesystem_captures` table (`npm run db:generate`). No rename/remove of existing symbols. No call-site migration needed (new table, new methods are additive).

## Risks / ambiguities
- **Multi-`code`-filesystem-per-bot** mount layout (root vs subdir) — v1 handles ≤1 code-fs-at-root + doc_set-at-subdir; multi-code recorded as a known limitation. ⚠️ confirm acceptable.
- **Crash-path capture** — recommend skip (inconsistent tree); confirm.
- **Shallow clone + future push** — `--depth=1` is fine for AO2 (capture=bundle, no push); AO3 may need `--unshallow`. Out of scope here.
- **`captureBasePath` default** — needs a sane default sibling of `sandboxBasePath`; confirm path convention in build.
- **Bundle ref-spec on shallow clone (was UNVERIFIED, now pinned + proven):** §2 bundles `refs/heads/<branch>` (named ref, NOT bare `HEAD`, NOT a `<base>..HEAD` range — the range form is what breaks on shallow clones). On `--depth=1` this packs the shallow commits reachable from the branch (bot's new commit + the single base) — sufficient to restore the authored work. **Lane A asserts the restore-and-read-back** (restore the bundle, read the commit + edit), so this is proven in-build, not assumed. Full history is intentionally not preserved (out of scope; AO3 `--unshallow` if it ever needs push).
