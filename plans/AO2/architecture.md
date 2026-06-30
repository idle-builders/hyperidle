# AO2 — Architecture: Mount the bound filesystem into the session working directory (per-source)

**Concept:** `plans/AO2/concept.md` (LOCKED — re-lock + per-source adapter generalization). This plan does not re-open it.
**Base:** `concept/AO2-rerun-post-aq1` = `origin/main` HEAD `dd355c4b`. Migration tail on base = `0040_chubby_chimera` (real `_journal.json`, idx 40). Deps installed.
**Scope:** S–M. Residual = (a) `GitRunner` inbound verbs, (b) registry-backed `FilesystemMounter` + 3 v1 adapters, (c) 2 session-provisioning hooks, (d) `filesystem_captures` provenance, (e) live-proof.

---

## 1. Context

AO1 shipped the seam **types only** (`FilesystemMounter`, `MountResult`, `CaptureResult`, `FilesystemAuth`, `FilesystemAuthResolver` — `packages/shared/src/filesystem.ts:101-133`) plus the registry + injection model (`filesystems` / `filesystem_injections`, `packages/db/src/schema.ts:880-940`; routes `packages/server/src/routes/filesystems.ts`). No implementation exists. AQ1 deleted the isolation boundary: the harness runs as a host child process with the real `$HOME`; the run-unit is a plain host directory `rm -rf`'d on destroy (`LocalSandboxAdapter.spawn`/`.destroy`, `packages/server/src/harness/local-sandbox-adapter.ts:75-105`).

AO2 implements the seam as a **registry of per-source mount adapters**, adds inbound-git verbs to the one `GitRunner`, wires two session-provisioning hooks (mount after spawn / capture-back before the working dir is deleted), and persists a `filesystem_captures` provenance row for AO3. No auth path is built (inherited `$HOME` is ambient; held = AN2). No isolation. No sync engine. No landing.

## 2. Constraints (binding — from concept Phase 4 hard rules)

1. **Mount places files only** — never injects/extracts/resolves auth (hard rule 1, 2).
2. **Capture-back ≠ landing** — commit/snapshot/bundle only; push/PR/publish = AL7/AO3 (hard rule 3).
3. **No isolation machinery** — zero boundary; never resurrect AQ1-deleted Docker/isolated adapters (hard rule 4).
4. **No custom sync engine** — git for `code`; last-write + snapshot for `doc_set`; no OT/CRDT/merge (hard rule 5).
5. **Provisioning flow is source-agnostic** — `session-provisioning` calls the uniform `mount`/`captureBack`; **a `switch(source)` in the flow is a defect** (hard rule 6). All source branches live inside an adapter behind the registry.
6. **Inbound-git rides one runner** — extend `GitRunner` with `clone`/`worktree`/`fetch`/`checkout`, reusing `buildGitEnv` (`git-export-runner.ts:135-173`); never fork a sibling runner (hard rule 7).
7. **A new transport instance is a Connection, not an adapter** (hard rule 8).
8. **No new AO1 column** — selection closes on `kind` + `source` + `connectionId` + `resourceRef`, all shipped (concept Phase 5 field-flag).
9. **TS strict** — explicit return types, no `any`/`as`, result types for expected errors (`.claude/rules/typescript.md`).

## 3. Plan reconciliation — every named symbol verified against `dd355c4b`

| Symbol | Status | Location |
|---|---|---|
| `FilesystemMounter` / `MountResult` / `CaptureResult` / `FilesystemAuth` | EXISTS (type only, no impl) | `packages/shared/src/filesystem.ts:104-133` |
| `Filesystem` (`kind`/`source`/`connectionId`/`resourceRef`/`writeback`) | EXISTS | `packages/shared/src/filesystem.ts:36-47` |
| `ResourceRef` (`{kind:'code';repo;branch}` \| `{kind:'doc_set';folder}`) — `code` field is `repo` (string) | EXISTS — `isLocalRepoPath` keys on `resourceRef.repo` | `packages/shared/src/filesystem.ts:30-32` |
| `GitRunner` (`init/add/rm/commit/push/diffCached/…/lsRemote`) — **no `clone`/`worktree`/`fetch`/`checkout`** | EXISTS, EXTEND | `packages/fabric/src/services/git-export-runner.ts:34-71` |
| `buildGitEnv` / `spawnGit` / `redactArgs` / `GitConfigInjection` | EXISTS (reuse) | `git-export-runner.ts:27-32,135-229` |
| `createGitRunner(repoPath, opts)` | EXISTS (extend return obj) | `git-export-runner.ts:236-360` |
| `admitSession` Phase 4 spawn (`workspace.spawn`) | EXISTS — **mount hook here** | `session-provisioning.ts:463-464` |
| Phase 6 context assembly (`strategy.assembleContext`) | EXISTS (mount runs before this) | `session-provisioning.ts:488-497` |
| **`endSession` does the `rm -rf`** (`fs.promises.rm(context.sandboxPath, {recursive,force})`) | EXISTS — **the delete is HERE, not in `workspace.destroy`** | `session-lifecycle.ts:341` |
| normal teardown — `endSession(...)` → `workspace.destroy(sandboxHandle)` | EXISTS — **capture BEFORE the `endSession` call at `:1117`** | `session-provisioning.ts:1117-1122` |
| not-returned path — `endSession(...)` → `workspace.destroy` | EXISTS — **capture BEFORE `endSession` at `:1102`** | `session-provisioning.ts:1102-1104` |
| budget_exhausted path — `endSession(...)` → `workspace.destroy` | EXISTS — **capture BEFORE `endSession` at `:1060`** | `session-provisioning.ts:1060-1062` |
| in-`runSession` crash path — `crashSession(...)` (NO `rm`, NO `destroy` → dir leaks) | EXISTS — **capture BEFORE `crashSession` at `:1039`** | `session-provisioning.ts:1039-1040` |
| detached-tail crash funnel — `.catch → crashSession(admitted.sessionContext, …)` (passes `SessionContext`, NOT `mountedFilesystems`) | EXISTS — last-resort funnel; **capture NOT wired here** (W1 decision §9) | `session-provisioning.ts:1172-1175` |
| `ProvisionSessionDeps` (`db`,`eventBus`,`adapterPool`,`workspace`,…) — assembled at **3 sites** | EXISTS — **add `mounter?` at ALL 3** | def `session-provisioning.ts:178-187`; sites `server-factory.ts:353`, `routines-routes.ts:658`, `sessions-routes.ts:317` |
| `AdmittedSession` (carries `sandboxPath`,`agentId` via `sessionContext`) | EXISTS — add `mountedFilesystems` | `session-provisioning.ts:281-296` |
| `AdapterPool.select(requirements)` registry precedent | EXISTS (mirror, don't reuse) | `adapter-pool.ts:193-245` |
| `filesystem_injections` resolution (`agentUserId → filesystemId → filesystems`) | EXISTS | `filesystems.ts:234-245`; schema `:919-933` |
| `filesystems` columns (`source`,`kind`,`connectionId`,`resourceRef`) | EXISTS | `schema.ts:880-908` |
| `filesystem_captures` table | **DOES NOT EXIST** (salvage `ad0c3ec8`) | NEW — `schema.ts` + migration `0041` |
| `SANDBOX_SCAFFOLDING_PATHS` | **DOES NOT EXIST on `dd355c4b`** (lived only on dead #370) — **author fresh from the real writers, §8** | NEW — `packages/server/src/filesystem/scaffolding-paths.ts` |
| `WRITEBACK_MODES` (`git`/`file`/`none`) | EXISTS | `packages/shared/src/filesystem.ts:12-13` |

**Stale docstring to correct:** `FilesystemMounter.mount()` JSDoc (`filesystem.ts:122-128`) says *"provision the bound Connection's auth INTO the sandbox"* and `FilesystemAuth` JSDoc (`:62-63`) says *"provisioned INTO the sandbox by AO2"*. Both contradict the re-lock (mount places files; auth is ambient/AN2). **Edit the docstrings** (no type change) to: *"Place the filesystem's working set into the session working directory at its branch/folder. Mount places files only — auth is ambient (inherited `$HOME`, AQ1) or held-connection provisioning (AN2); AO2 produces no auth. `auth` is honored if present but AO2 never produces it."*

## 4. File / type layout

**Decision: new directory `packages/server/src/filesystem/`** (not `harness/`). Justification: the harness layer owns the *run-unit* (`SandboxAdapter`); the mount layer owns *file placement into* that run-unit — a distinct concern that consumes a `SandboxHandle.path` but is not a harness. Keeping them separate prevents the "mount adapter" ⟷ "sandbox adapter" vocabulary collision the concept locks (Phase 3) from leaking into one directory. The `GitRunner` lives in `packages/fabric` (its current home) and is imported by the git adapters.

```
packages/server/src/filesystem/
  mount-adapter.ts            # MountAdapter interface + MountContext type (internal seam)
  mounter-registry.ts         # RegistryFilesystemMounter (implements FilesystemMounter) + selectMountAdapter()
  git-worktree-adapter.ts     # adapter 1 — local repo → git worktree add / commit + worktree remove
  git-clone-adapter.ts        # adapter 2 — remote repo → shallow clone / commit + bundle
  local-folder-adapter.ts     # adapter 3 — doc_set local folder → in-place / snapshot
  cloud-not-built-adapter.ts  # adapter 4 placeholder — explicit needs_attention throw (NOT a stub)
  capture-store.ts            # writeFilesystemCapture(db, {...}) → inserts filesystem_captures row
  scaffolding-paths.ts        # NEW — SANDBOX_SCAFFOLDING_PATHS authored from the real writers (§8) + the drift-guard list

packages/server/src/filesystem/__tests__/
  mounter-registry.test.ts                  # unit — selectMountAdapter dispatch table + selection precedence
  scaffolding-drift-guard.test.ts           # unit — SANDBOX_SCAFFOLDING_PATHS covers every real writer's emitted paths (C2)
  git-export-runner-fake.test.ts            # unit — argv-shape assertions on FakeGitRunner ONLY (N1)
  git-export-runner.integration.test.ts     # integration — REAL git worktreeAdd/worktreeRemove/clone/bundle round-trip (N1)
  git-worktree-adapter.integration.test.ts
  git-clone-adapter.integration.test.ts
  local-folder-adapter.integration.test.ts
  session-mount.integration.test.ts         # the two hooks wired through provisionSession
  ao2-live-proof.integration.test.ts        # hard-rule-9 keystone

packages/shared/src/filesystem.ts     # EDIT — docstring corrections (§3)
packages/fabric/src/services/git-export-runner.ts  # EXTEND — clone/worktree/worktreeRemove/fetch/checkout + FakeGitRunner parity
packages/db/src/schema.ts             # ADD filesystemCaptures + types
packages/db/drizzle/0041_*.sql        # NEW migration
packages/server/src/services/session-provisioning.ts  # EDIT — 2 hooks + mounter in deps
packages/server/src/server-factory.ts                 # EDIT — wire mounter into ProvisionSessionDeps (site 1/3)
packages/server/src/routes/routines-routes.ts         # EDIT — wire mounter (site 2/3)
packages/server/src/routes/sessions-routes.ts         # EDIT — wire mounter (site 3/3)
```

### 4.1 The internal `MountAdapter` interface (`mount-adapter.ts`)

A **narrower internal interface** — NOT the public `FilesystemMounter` (concept Phase 5 leaves this an architecture choice; narrower is cleaner because adapters need a `GitRunner` factory + a capture-store, which don't belong on the public seam).

```ts
export interface MountContext {
  readonly filesystem: Filesystem;
  readonly sandboxPath: string;          // SandboxHandle.path
  readonly auth: FilesystemAuth | null;  // honored if present; AO2 never produces it
}
export interface CaptureContext {
  readonly filesystem: Filesystem;
  readonly sandboxPath: string;
  readonly sessionId: string;            // for the filesystem_captures provenance row
}
export interface AdapterCaptureResult extends CaptureResult {
  readonly capturePath?: string;         // durable bundle/snapshot path, for the provenance row
  readonly commitSha?: string;
}
export interface MountAdapter {
  readonly id: string;                   // "git-worktree" | "git-clone" | "local-folder" | "cloud-not-built:<source>"
  mount(ctx: MountContext): Promise<MountResult>;
  captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult>;
}
```

### 4.2 The registry + selector (`mounter-registry.ts`)

`RegistryFilesystemMounter implements FilesystemMounter` — the ONE seam `session-provisioning` sees. Its `mount`/`captureBack` call `selectMountAdapter(fs)` and delegate; `captureBack` then calls `writeFilesystemCapture()` with the adapter's `AdapterCaptureResult`.

```ts
export function selectMountAdapter(fs: Filesystem, deps: AdapterDeps): MountAdapter {
  if (fs.kind === "code") {
    // W4 — explicit precedence, no silent fallthrough:
    if (fs.connectionId != null) return new GitCloneAdapter(deps);          // remote forge → clone
    if (isLocalRepoPath(fs.resourceRef)) return new GitWorktreeAdapter(deps); // local path → worktree
    // connectionId == null AND a non-path `owner/repo` is MALFORMED for worktree → explicit error, never silent worktree:
    throw new MalformedFilesystemError(fs, "code fs with no connectionId must have a local-path repo for the worktree adapter");
  }
  if (fs.kind === "doc_set") {
    if (CLOUD_SOURCES.has(fs.source)) return new CloudNotBuiltAdapter(fs.source); // adapter 4
    return new LocalFolderAdapter(deps);                                          // adapter 3
  }
  return new CloudNotBuiltAdapter(fs.source); // unknown (kind,source) → explicit needs_attention, never silent
}
// isLocalRepoPath(ref): ref.kind==='code' && (ref.repo startsWith '/' | 'file://' | '.' | '~') — a path, not 'owner/repo' or an https/ssh URL
// CLOUD_SOURCES = new Set(['gdrive','dropbox','s3'])
```

**W4 — local-vs-remote `code` selection precedence (explicit, ordered):**
1. `connectionId != null` → **clone** adapter (a forge Connection is present → remote, regardless of `repo` shape).
2. `connectionId == null` **AND** `isLocalRepoPath(resourceRef)` → **worktree** adapter (a host-local path).
3. `connectionId == null` **AND** non-path `repo` (`owner/repo` or a bare URL) → **`MalformedFilesystemError`** (a registered-as-local `code` fs with no usable path is a data defect; surfacing it loud beats silently worktree-ing a non-path and failing deep inside git). The provisioning hook maps this to a logged warning + (optional) `needs_attention`, never a session crash (§5 adapter-4 failure handling applies identically). Aligns with `filesystem.ts:30-31` where `code`'s `repo` is a free string that may be `owner/repo`, a URL, **or** a path.

`AdapterDeps` = `{ gitRunnerFactory: (repoPath: string) => GitRunner }` (defaults to `createGitRunner`; tests inject `FakeGitRunner`). Mirrors `AdapterPool` (registry keyed by a discriminant + a selector) without importing it (`adapter-pool.ts:193` is the precedent, different layer).

## 5. The three v1 adapters + the placeholder

**Adapter 1 — `GitWorktreeAdapter`** (local `code`). Mount: derive `agent/<sessionId>` branch; run a worktree-create against the host repo (`resourceRef.repo` = local path) targeting `sandboxPath`. Capture-back: `git add`/`commit` on the worktree branch → `git bundle` to a durable path → **`git worktree remove`**. Returns `{captured:true, capturePath:<bundle>, commitSha}`. The commit lives in the shared object store; the bundle is the AO3-portable artifact.
- *Same-branch constraint:* `git worktree` refuses two worktrees on the same branch → each session gets its **own** branch `agent/<sessionId>` (concept Phase 5 caveat). Branch name sanitized (reuse the no-leading-`-` discipline already in `push`).

**Adapter 2 — `GitCloneAdapter`** (remote `code`). Mount: shallow `clone(url, branch, {depth:1})` into `sandboxPath` (salvage `443c705d` clone — clone into `.`, token via `GIT_CONFIG_*` env, never argv/URL). Auth: ambient `$HOME` for live-proof; `auth.provision.mode==='git-credential'|'env'` honored when AN2 supplies it. Capture-back: `git add`/`commit` → `bundle(bundlePath, "refs/heads/<branch>")` (salvage — named-ref bundle, shallow-safe) → returns `{captured:true, capturePath:<bundle>, commitSha}`. **Push/PR = landing, NOT here.**

**Adapter 3 — `LocalFolderAdapter`** (local `doc_set`). Mount: **work in place** — symlink `resourceRef.folder` into `sandboxPath/<basename>` (no copy; AQ1 = no boundary; preserves Obsidian live-reload). Capture-back: snapshot the changed subtree to a durable path (`cp -R` of the folder, or a tar) → returns `{captured:true, capturePath:<snapshotDir>}`. Last-write-wins, no merge (hard rule 5). Concurrency on same vault = same risk a human with two editors has; mitigation (per-session copy) is a localized future change behind the registry, not a contract change.

**Adapter 4 — `CloudNotBuiltAdapter`** (deferred `gdrive`/`dropbox`/`s3` + unknown). `mount` returns `{success:false, error:"mount adapter not built for source '<source>' (built in its connector WP)"}`; `captureBack` returns `{success:false, captured:false, error:…}`. The provisioning hook maps a failed mount (and the `MalformedFilesystemError` of §4.2 case 3) to a logged warning + (optionally) a `needs_attention` state update — **never a session crash, never silent**. NOT stubbed-from-memory (MEMORY: no stubs from memory): it is an explicit, honest "not built".

## 6. `GitRunner` extension (`git-export-runner.ts`)

Add to the `GitRunner` interface + `createGitRunner` return object + `FakeGitRunner` (salvage `443c705d` for `clone`/`bundle`; `worktree`/`worktreeRemove`/`fetch`/`checkout` are NEW — the worktree decision is post-AQ1). All reuse `spawnGit → buildGitEnv` (hardened env: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `GIT_CONFIG_NOSYSTEM=1`, redacted logging) for free.

```ts
clone(url: string, branch: string, opts?: { depth?: number; tokenConfig?: GitConfigInjection }): Promise<void>;
// `git clone --depth N --single-branch --branch <branch> -- <url> .`  (cwd = sandboxPath)
bundle(bundlePath: string, ref: string): Promise<void>;
// `git bundle create <bundlePath> <ref>`  (named-ref, shallow-safe)
worktreeAdd(worktreePath: string, branch: string, opts?: { createBranch?: boolean }): Promise<void>;
// `git worktree add [-b <branch>] -- <worktreePath> [HEAD]`  (cwd = host repo path)
worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
// `git worktree remove [--force] -- <worktreePath>`
fetch(remote: string, ref: string, opts?: { depth?: number; tokenConfig?: GitConfigInjection }): Promise<void>;
// `git fetch [--depth N] <remote> <ref>`  (token via env)
checkout(ref: string): Promise<void>;
// `git checkout -- <ref>` / `git checkout -b <branch>` (sanitize ref; no leading `-`)
```

- **cwd note:** `createGitRunner(repoPath)` binds cwd at construction. Worktree-create runs against the **host repo** (`gitRunnerFactory(hostRepoPath)`); clone/bundle/commit run against the **session dir** (`gitRunnerFactory(sandboxPath)`). The adapter constructs the runner with the right cwd per op — no new cwd param on the runner.
- `tokenConfig` is the AN2 seam (env-only `GIT_CONFIG_*`). v1 passes nothing → ambient `$HOME` auth.
- `FakeGitRunner` gets matching no-op resolutions for argv-shape assertions. **N1:** argv-shape assertions live ONLY in `git-export-runner-fake.test.ts` (Fake); the REAL runner's `worktreeAdd`/`worktreeRemove`/`clone`/`bundle` are exercised against on-disk state in `git-export-runner.integration.test.ts` — the two never share a file, so a Fake argv check can never masquerade as a real round-trip (mock-validation-trap).

## 7. `filesystem_captures` provenance (salvage `ad0c3ec8`, re-derived)

Source-agnostic — one row per capture; `capturePath` points at a **bundle** (git) OR a **snapshot dir** (folder). Re-numbered to **`0041`** off the real `0040` tail (the salvage was also 0041, off the same tail — clean re-derive, `npm run db:generate`).

```ts
// packages/db/src/schema.ts (after filesystemInjections, ~:940)
export const filesystemCaptures = pgTable("filesystem_captures", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  filesystemId: text("filesystem_id").notNull().references(() => filesystems.id, { onDelete: "cascade" }),
  writeback: text("writeback").notNull(),      // git | file | none — snapshot of mode at capture time
  capturePath: text("capture_path").notNull(), // durable bundle (.bundle) | snapshot dir | "none"
  commitSha: text("commit_sha"),               // git writeback only
  createdAt: text("created_at").notNull(),
}, (t) => [
  index("filesystem_captures_session_idx").on(t.sessionId),
  index("filesystem_captures_filesystem_idx").on(t.filesystemId),
]);
export type FilesystemCaptureRow = typeof filesystemCaptures.$inferSelect;
export type NewFilesystemCaptureRow = typeof filesystemCaptures.$inferInsert;
```

`capture-store.ts`: `writeFilesystemCapture(db, { sessionId, filesystemId, writeback, capturePath, commitSha })`. Called by `RegistryFilesystemMounter.captureBack` after the adapter returns. AO3 reads this to locate the durable artifact (separate from `artifacts` — a capture is a filesystem op record, not an L3 Artifact).

## 8. Scaffolding-exclusion — `SANDBOX_SCAFFOLDING_PATHS` authored fresh from the real writers

`SANDBOX_SCAFFOLDING_PATHS` **does not exist on `dd355c4b`** (grep returns nothing; it lived only on the dead #370 branch). It is **authored new** in `packages/server/src/filesystem/scaffolding-paths.ts` — NOT salvaged — by enumerating every path the session-provisioning + harness layers write into the working dir, so the git adapters never (a) commit scaffolding as authored output and (b) clobber a self-host repo's tracked `CLAUDE.md`/`AGENTS.md`/`.mcp.json`.

**The real writers and the full path set they emit (each verified on `dd355c4b`):**

| Writer | Emitted paths |
|---|---|
| `packages/fabric/src/context-assembly.ts:90-106` (`createDirectoryStructure` + `task-notes`) | `.fabric/`, `context/product/`, `context/practices/`, `context/factory/`, `knowledge/practices/`, `knowledge/decisions/`, `knowledge/failures/`, `work/artifacts/`, `work/task-notes.md` |
| `packages/fabric/src/context-assembly.ts:254` | `context/session.toon` |
| `packages/fabric/src/context-assembly.ts:266-267` | `.fabric/manifest.json` |
| `packages/fabric/src/context-assembly-prompt.ts:277-280` (`writeSandboxAgentsMd`, dual-write) | `AGENTS.md`, `CLAUDE.md` |
| `packages/server/src/services/session-provisioning.ts:752-762` | `.mcp.json` (claude-native MCP config) |
| `packages/server/src/harness/provision-return-hook.ts:118-141` (`provisionClaudeSettings`) | `.claude/settings.json`, `.claude/return-check.sh` |
| `packages/server/src/harness/provision-return-hook.ts:192-253` (`provisionCodexHome`) | `.codex/` (`:198` — hooks dir), `.codex-home/` (`:222` — per-session CODEX_HOME: auth + config + hooks) |
| `packages/server/src/harness/provision-return-hook.ts:345-371` (`provisionOpencodePlugin`) | `.opencode/plugins/` (`:350` — `return-signal.ts`) |
| `packages/server/src/harness/cli-mcp-config.ts` (`writeCliMcpConfig`, dialect-keyed) | `.codex-home/config.toml` (codex), `opencode.json` (opencode) |

`SANDBOX_SCAFFOLDING_PATHS` enumerates the **roots** of this set (root-anchored): `.fabric`, `context`, `knowledge`, `work`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude`, `.codex`, `.codex-home`, `.opencode`, `opencode.json`. (Directory roots cover their whole subtree; the two markdown files + the two json/toml files are listed by name.) **All harness provisioners are enumerated** — `provisionClaudeSettings` (`.claude`), `provisionCodexHome` (`.codex` + `.codex-home`), `provisionOpencodePlugin` (`.opencode`) — so a codex/opencode session on the self-host repo cannot leak `.codex`/`.opencode` scaffolding into the authored commit (C2 round-2 fix).

**The git adapters, before `git add`:**
1. Write `.git/info/exclude` (local-only, never the committed `.gitignore`) with each entry root-anchored — keeps untracked scaffolding untracked even after context-assembly writes it.
2. Compute the tracked-collision set = `git ls-files ∩ SANDBOX_SCAFFOLDING_PATHS` (the self-hosting case: this repo tracks `AGENTS.md`/`CLAUDE.md`/`.mcp.json` — assembly overwrites them) and exclude those via pathspec at stage time so the authored commit never carries a clobbered tracked file.

**Drift-guard (`scaffolding-drift-guard.test.ts`, C2):** a unit test that, for each real writer, asserts every path it emits is covered by `SANDBOX_SCAFFOLDING_PATHS` (a path is "covered" if it equals an entry or sits under a root entry). The test imports the writer modules' emitted-path lists (the context-assembly `dirs` array + the literal file names) and the constant, then asserts coverage. **It must enumerate ALL harness provisioners in `provision-return-hook.ts` — `provisionClaudeSettings`, `provisionCodexHome`, `provisionOpencodePlugin` — not just the claude one (C2 round-2: the codex/opencode roots were the gap), so a future harness provisioner cannot silently re-open the hole.** Where a provisioner's emitted roots aren't exported as a literal list, export one (a small `EMITTED_ROOTS` const per provisioner) so the guard imports the real surface rather than re-hardcoding it. **When a future writer adds a scaffolding path the constant doesn't cover, CI goes red** — the constant can never silently fall behind and corrupt capture. (This is a static-property test on a code constant + literal lists, not a filesystem grep — it imports the real writer surface.)

*Self-host critical:* the live-proof (§12) runs on THIS repo, which tracks those files; without the collision-set exclusion the bot's "authored commit" would include a clobbered `CLAUDE.md`. `SANDBOX_SCAFFOLDING_PATHS` + the drift-guard are **load-bearing for hard rule 9** and must land with adapters 1+2.

## 9. The two session-provisioning hooks (`session-provisioning.ts`)

`ProvisionSessionDeps` gains `readonly mounter?: FilesystemMounter` (optional → a filesystem-less server degrades to today). `AdmittedSession` gains `readonly mountedFilesystems: Filesystem[]` (resolved at admit, consumed at teardown — avoids a second DB query at capture and is the authority for "did this session mount anything").

**Hook A — MOUNT (new Phase 4.5).** Insert in `admitSession` **after** `sandboxPath = sandboxHandle.path` (`:464`) and **before** Phase 6 `strategy.assembleContext` (`:488`), inside the existing try/catch (revert-on-failure already wraps `:461-515`). Resolve the bot's injected filesystems (`filesystem_injections.agentUserId == params.agentId → filesystems`, mirroring `filesystems.ts:234-245`); for each, `await deps.mounter?.mount({ filesystem, sandboxPath, auth: null })`. A failed mount (e.g. cloud-not-built, or the §4.2 `MalformedFilesystemError`) logs a warning and continues — **mount failure never strands the task** (degrade-to-today is the contract; a no-filesystem bot simply has an empty list → no-op). Store the resolved list on `AdmittedSession.mountedFilesystems`.
- *Ordering rationale:* mount BEFORE context assembly so `.git/info/exclude` is written before assembly drops scaffolding into the dir (§8), and so the working tree exists when the harness reads it. This is the Phase 4.5 AO1's architecture located (`plans/AO1/architecture.md:410`).

**Hook B — CAPTURE-BACK (teardown, all paths) — anchored BEFORE the delete, not before `workspace.destroy`.**

**The delete lives in `endSession`, not `workspace.destroy`.** `endSession` (`session-lifecycle.ts:341`) does `await fs.promises.rm(context.sandboxPath, {recursive,force})` as its step 6; the subsequent `workspace.destroy(sandboxHandle)` is only the adapter-map cleanup (`rm -rf` is a no-op on the already-deleted tree). So a capture anchored "before `workspace.destroy`" runs against an **already-deleted** working tree → empty/failed capture on every completed/not-returned/budget session. The capture helper must run **before each `endSession(...)`** so the working tree still exists.

Insert a single helper `await captureMountedFilesystems(deps, admitted, sessionId)` immediately **before each `endSession(...)` call**:
- normal: before `endSession` at `:1117`
- not-returned: before `endSession` at `:1102`
- budget_exhausted: before `endSession` at `:1060`
- **in-`runSession` crash path:** before `crashSession` at `:1039` (guarded `if (admitted.mountedFilesystems.length)`).

**Crash framing (W2):** `crashSession` (`session-lifecycle.ts:351+`) does NOT `rm` the dir and does NOT call `workspace.destroy` — on crash the working dir **leaks** (a future GC reclaims it). So the crash-path capture protects a *future* deletion, not an imminent one; the crash-path test must NOT assert "before destroy" — there is no destroy on that path. It asserts: crash with a mounted fs → a `filesystem_captures` row is written (the authored work is bundled/snapshotted before any later GC).

**Second crash funnel (W1) — decided: capture only at `:1039`.** There is a second crash funnel — the detached `.catch → crashSession(admitted.sessionContext, …)` in `startSessionProvision` (`:1172-1175`). It is a **last-resort** funnel for a throw escaping `runSession` (which already tears itself down through its own end/crash paths), and it is handed only a `SessionContext` (has `sandboxPath`, NOT `mountedFilesystems`). **Decision:** capture is wired ONLY at the in-`runSession` `:1039` site; the `:1175` funnel gets NO capture. Rationale: `:1175` fires only when `runSession`'s own teardown (including the `:1039` capture) failed to run at all — an already-exceptional path where the working dir leaks anyway and a future GC reclaims it; threading `mountedFilesystems` onto `SessionContext` to serve a never-expected funnel is not worth the cross-cutting type change. Stated explicitly so this is a choice, not an oversight.

The helper iterates `admitted.mountedFilesystems`, calls `deps.mounter?.captureBack({ filesystem, sandboxPath, sessionId })`, and is best-effort (a capture failure is logged, never blocks teardown — uncommitted-but-failed is the same loss as today, not worse). `RegistryFilesystemMounter.captureBack` writes the `filesystem_captures` row on success.

## 10. Auth

**AO2 builds NONE.** Inherited `$HOME` is ambient (AQ1 — `cli-harness-adapter.ts:376-380` forwards `HOME`; `buildGitEnv` already allow-lists `HOME`/`SSH_AUTH_SOCK`/`GH_TOKEN`). The git adapters authenticate via ambient host git: worktree (adapter 1) needs none (local object store); clone/fetch (adapter 2) ride the host's `gh`/`~/.config/gh`/`~/.ssh` for free. The `FilesystemAuth | null` arg is **honored if present** (threaded into `tokenConfig` as `GIT_CONFIG_*` env when `mode==='git-credential'|'env'`) but AO2 **never produces it** — AN1's resolver / AN2's provisioning do. v1 always passes `auth: null`. **The stale `mount()`/`FilesystemAuth` docstrings get corrected** (§3) so the code no longer claims AO2 provisions auth.

## 11. Acceptance criteria → verification

| AC (from concept Spec corrections) | Verification |
|---|---|
| **AC1** `code` fs → working dir has the working tree at its branch; provisioning never branches on source; **the agent can read/edit in the mounted tree** | adapter-level: `git-worktree-adapter.integration.test.ts` etc. (files present post-mount) + `mounter-registry.test.ts` (dispatch + W4). **Session-level (the proof the first ship lacked):** Lane (a) `ao2-session-roundtrip.integration.test.ts` (§12) — real `runSession` + real mounter; `admitted.mountedFilesystems` length 1 + fixture file present in `sandboxPath` when the harness ran. Lane (b) `ao2-real-session.real-harness.test.ts` (local-only) — real `claude` edits the mounted tree |
| **AC2** authored changes captured, routed through the mount adapter, **before `endSession`'s `rm -rf`** | **Lane (a)** `ao2-session-roundtrip.integration.test.ts` (§12): real `runSession` + real `RegistryFilesystemMounter` + **edit-stub harness that writes a REAL file in its cwd** → assert a `filesystem_captures` row exists and `git clone <capturePath>` contains the harness's on-disk edit (NOT a test-written file). `session-mount.integration.test.ts` retained for hook-ordering (capture-before-`endSession`) on normal/not-returned/budget/crash, with its stub mounter |
| **AC4 (rewritten)** real authenticated `git` against the repo via inherited `$HOME`; AO2 builds no auth-into-sandbox; fs row stores no secret | `ao2-live-proof.integration.test.ts` (§12) runs real git with ambient auth; assert `filesystems` row has no token column (static — schema has none) |
| **AC6 (new)** registry of adapters by `(kind,source)`; v1 = worktree+clone+local-folder; cloud → explicit `needs_attention`/"not built", never silent | `mounter-registry.test.ts`: each `(kind,source)` → expected adapter id; malformed local `code` → `MalformedFilesystemError`; `CloudNotBuiltAdapter.mount` returns `success:false` with the "not built" error |
| **Scaffolding-exclusion holds (self-host)** | `scaffolding-drift-guard.test.ts`: `SANDBOX_SCAFFOLDING_PATHS` covers every real writer's emitted paths (C2); `git-worktree-adapter.integration.test.ts` asserts a tracked `CLAUDE.md` is excluded from the authored commit |
| **No-fs session degrades** | `session-mount.integration.test.ts`: bot with zero injections → `provisionSession` completes, no `filesystem_captures` row, no error |
| Crash path captures | `session-mount.integration.test.ts`: force a crash with a mounted fs → assert a capture row is written (NO destroy on this path — W2; do not assert "before destroy") |
| `GitRunner` verbs | `git-export-runner-fake.test.ts` (argv shape on Fake) + `git-export-runner.integration.test.ts` (REAL worktree/clone/bundle round-trip) — split files, N1 |

Gate: `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration` all green; final `npm run verify`.

## 11.1 AMENDMENT (re-run, post human-review) — wiring audit + the validation gap

Human review rejected the first AO2 ship: CI-green but **never proven to actually
work**. Every test either stubbed the mounter (`session-mount.integration.test.ts`
uses a `createTrackingMounter` stub + a mock harness) or simulated the edit by hand
(`ao2-live-proof.integration.test.ts` drives the REAL `GitWorktreeAdapter` but the
TEST writes the file and it BYPASSES `runSession` entirely). No test drove the real
`admitSession → mount → harness → captureBack` chain with the real mounter wired into
`ProvisionSessionDeps` and an edit performed **by the harness in its cwd**.

### Wiring audit verdict — the chain IS wired (no dead-on-arrival break)

Traced the real runtime path. The feature is live in production, not gated off:

1. **Mounter constructed + passed in prod.** `server-factory.ts:275` constructs
   `new RegistryFilesystemMounter({ gitRunnerFactory, capturesDir, db })` and passes
   it to `createApp` (`:385`) **and** into `dispatcherDeps` (`:375`). `createApp`
   forwards `options.mounter` to **both** route registrations — `createSessionRoutes`
   (`app.ts:457`) and `createRoutineRoutes` (`app.ts:436`). Routine-dispatched sessions
   get it via `dispatcherDeps`. So `deps.mounter` is **defined in prod on all three
   session-entry paths** — Hook A/B are NOT reachable-only-via-an-undefined-optional.
2. **Hook A runs before the harness, in the same dir.** `admitSession` Phase 4.5
   (`session-provisioning.ts:634`) calls `mountFilesystemsForAgent(db, agentId,
   sandboxPath, deps.mounter)` AFTER `workspace.spawn` (`:611`, sets `sandboxPath`) and
   BEFORE context assembly (`:650`). The worktree adapter does `git worktree add` into
   that exact `sandboxPath` (`git-worktree-adapter.ts:64`). The harness then spawns with
   `cwd: config.sandboxPath` (`cli-harness-adapter.ts:412-416`), and
   `sessionStartConfig.sandboxPath = admitted.sandboxPath` — the SAME dir. The agent
   literally runs inside the mounted worktree. Mount-before-run holds (admit precedes the
   Phase 9 `harness.startSession` in `runSession`).
3. **Capture reads the agent's real on-disk edits.** Hook B
   (`captureMountedFilesystems`, `:284`) runs on that same `sandboxPath` on every
   teardown branch (normal `:1294`, not_returned `:1275`, budget `:1229`, crash `:1205`)
   BEFORE `endSession`/`crashSession` deletes the tree. The worktree adapter's
   `captureBack` does `git add` / `commit` / `bundle` from `cwd = sandboxPath`
   (`git-worktree-adapter.ts:99-145`) — it commits whatever the agent left on disk.
4. **Real harness available for live-proof = `claude-code`.** `CLAUDE_CLI_CONFIG`
   (`adapter-pool.ts:441`) drives the real `claude` binary via `CliHarnessAdapter`,
   `envAllowlist: ["PATH","HOME","LANG","USER","LOGNAME"]` — HOME/USER/LOGNAME proven
   sufficient for macOS-keychain claude.ai OAuth (claude 2.1.170, `total_cost_usd>0`).
   Prerequisites: `claude` on PATH + a completed `claude login` on the host. No API key
   needed (auth rides `$HOME`).

**Verdict: the real chain works as wired — no CRITICAL break, no write-code wiring
fix required.** The defect is purely a **validation gap**: the wiring was never
exercised end-to-end. §12 below replaces the simulated-edit proof with two lanes that
actually drive it. (Audit confidence is high for the no-LLM path; Lane (b) is the
belt-and-braces real-LLM confirmation.)

## 12. Validation — two lanes that actually prove the chain (REPLACES the simulated-edit live-proof)

The old `ao2-live-proof.integration.test.ts` (real adapter, hand-written edit, no
`runSession`) is **retained but demoted** to an adapter-level round-trip test (it still
proves the worktree adapter + bundle + scaffolding-exclusion in isolation). The
load-bearing AC1/AC2 proof moves to the two lanes below.

### Lane (a) — CI-able real end-to-end, no LLM — `ao2-session-roundtrip.integration.test.ts`

The test the first ship was missing. Drives the **real** `admitSession` → `runSession`
→ teardown with the **real** `RegistryFilesystemMounter` + real `GitWorktreeAdapter`
wired into `ProvisionSessionDeps` (NOT the tracking-stub mounter), against a real git
fixture repo, with a **stub harness that performs a REAL fs edit in its cwd**. Runs in
`test:integration` (and therefore in CI / attested `test:all`) — no LLM, deterministic.

**Wiring (exact):**
- **Fixture repo:** create a fresh temp git repo (`git init` in a `mkdtemp` dir; one
  committed file so `HEAD` exists), NOT this repo — keeps the test hermetic and fast and
  avoids polluting the worktree's `.git`. (The §12-old self-host case stays in the
  demoted adapter test.) `resourceRef = { kind:"code", repo:<tmpRepoPath>, branch:"main" }`,
  `connectionId: null` → `isLocalRepoPath` true → `GitWorktreeAdapter` selected.
- **Mounter:** `new RegistryFilesystemMounter({ gitRunnerFactory: (p) => createGitRunner(p),
  capturesDir: <tmp>/captures, db })` — the **real** production class, real GitRunner.
- **`ProvisionSessionDeps`:** real `db` (fixture), real `eventBus`, a real
  `LocalSandboxAdapter` workspace, an `AdapterPool` holding the **edit-stub harness**
  (below), `setActiveStrategy(fabricStrategy)` (or a minimal strategy that no-ops
  `assembleContext`/`beginLearningIngestion`), and **`mounter:` set to the real mounter**.
- **Edit-stub harness** (the key change from the rejected test — the stub harness's
  `startSession`/`streamEvents` does a REAL on-disk edit in its cwd, not a no-op):
  - `startSession(config)`: capture `config.sandboxPath`; `fs.writeFileSync(
    path.join(config.sandboxPath, "AGENT_OUTPUT.txt"), "<token>")` — a deterministic
    edit literally written into the mounted worktree, exactly as a real agent would.
    Return a `SessionHandle`.
  - `streamEvents`: yield nothing (or one terminal event) then complete — the edit is
    already on disk. `stopSession`: no-op. `getCapabilities`: minimal (no MCP, no return
    enforcement) so the session takes the plain completed-teardown branch.
  - meta type `builtin` is fine; the edit happens in `startSession` so it lands before
    Hook B regardless of the drain path.
- Seed: team → teamMember → agent (`role:"builder"`), the `code` filesystem, a
  `filesystem_injections` row binding it to the agent, a `task` in `accepted`.

**Assertions (each is the AC the first ship left unproven):**
- **Mount actually happened in a real session:** after `admitSession` resolves,
  `admitted.mountedFilesystems` has length 1, and `<sandboxPath>/.git` exists and the
  fixture's committed file is present in `sandboxPath` (the worktree checked out the
  repo) — proves AC1 (working tree present when the harness ran).
- **The harness's REAL on-disk edit is captured:** after `runSession` returns
  `outcome:"completed"`, a `filesystem_captures` row exists; `git clone <capturePath>
  <tmp2>` succeeds and the clone's `agent/<sessionId>` branch tip contains
  `AGENT_OUTPUT.txt` with exactly `<token>` — proves AC2 (authored change captured)
  AND that capture read the agent's edit, not a test-written file.
- **Scaffolding excluded:** any scaffolding file (e.g. `.mcp.json`/`AGENTS.md`) written
  into `sandboxPath` during the run is NOT in the captured commit.
- **Sandbox cleaned:** `git worktree list` in the fixture repo shows no entry for
  `sandboxPath`; the dir is gone.
- **Ordering (carried from the old session-mount test):** capture ran BEFORE
  `endSession`'s delete (assert via the capture row existing + clone succeeding — if
  delete had run first, the worktree's objects would be gone and the bundle empty).

This is the test most likely to surface a wiring bug; if any of mount/cwd/capture were
mis-threaded it goes RED here in CI, deterministically.

### Lane (b) — local-only live-proof with the REAL `claude-code` harness — `ao2-real-session.real-harness.test.ts`

Closes the "but does a REAL agent's edit land?" question. Drives the **real** `claude`
binary through **real provisioning** into a mounted worktree. Gated local-only via the
existing `.real-harness.test.ts` convention: matched only by `vitest.real-harness.config.ts`
(`include: ["packages/**/*.real-harness.test.ts"]`), **excluded** from `vitest.config.ts`
(unit), `vitest.integration.config.ts`, and therefore from `test:all` / attested CI.
Invoked on demand by `npm run test:real-harness`. **Cannot run in attested CI** — it
makes a real LLM call and needs host-installed auth (honest, same lane as AL6/AL7
real-harness proofs).

**Prerequisites (skip-with-log if absent, mirroring AL6/AL7 binary gating):**
- `which claude` succeeds (binary on PATH), AND
- a host `claude login` has completed (auth in `$HOME` / macOS Keychain). The test
  probes a trivial real turn once and `test.skipIf(!binaryPresent || !authOk)` — never a
  false-green, never a hard fail on a CI box that has neither.

**Mechanism:**
- Same real wiring as Lane (a) — real `RegistryFilesystemMounter` + `GitWorktreeAdapter`
  + `ProvisionSessionDeps` — but the `AdapterPool` holds the **real**
  `new CliHarnessAdapter(CLAUDE_CLI_CONFIG)`, and the agent's `harnessType` is
  `"claude-code"`. Fixture repo = a fresh temp git repo (hermetic).
- **Deterministic trivial task:** the assembled prompt instructs exactly:
  *"Create a file named `FILE.txt` in the current directory containing EXACTLY this and
  nothing else: `<token>`"* where `<token>` is a per-run `randomUUID()`. (Delivered via
  the normal context-assembly/prompt path; no MCP tools required — the agent only needs
  its native file-write tool, which operates in `cwd = sandboxPath`.)
- Run `provisionSession` (the awaiting wrapper) to completion.

**Assertions:**
- A `filesystem_captures` row exists; `git clone <capturePath> <tmp>` → the captured
  commit contains `FILE.txt` whose content `=== <token>` exactly. This is the **only**
  proof that a real agent, given a real task, really edited the mounted tree and the edit
  survived capture.
- `git worktree list` shows no dangling worktree for `sandboxPath`.

If `claude` ever wrote outside the mount, or cwd were mis-set, or capture read the wrong
dir, this goes RED locally. It is the human-review-grade "it actually works" evidence,
run by the builder once locally before `done` and noted in the PR (link to the local run
output — NOT a CI job, per the e2e-local-only rule).

### Old §12 (demoted, retained)

The original `ao2-live-proof.integration.test.ts` keeps proving the worktree adapter +
named-ref bundle + self-host scaffolding-exclusion (§8) in isolation on THIS repo, real
git, no `tsc`. It is necessary but **no longer sufficient** for AC1/AC2 — Lanes (a)+(b)
above are the session-level proof it was missing.


## 13. Ordered task list (red-test-first per AC)

1. **Schema + migration.** Add `filesystemCaptures` to `schema.ts` + types; `npm run db:generate` → `0041`. *(no runtime test — static; `npm run check` + migration applies in integration fixtures.)*
2. **`GitRunner` verbs — RED then GREEN.** Write `git-export-runner-fake.test.ts` (argv shape via Fake) **and** `git-export-runner.integration.test.ts` (REAL worktree/clone/bundle round-trip in a temp repo) — **two files, N1** → add `clone`/`bundle`/`worktreeAdd`/`worktreeRemove`/`fetch`/`checkout` to interface + impl + `FakeGitRunner` (salvage `443c705d` clone/bundle).
3. **Registry + selector — RED then GREEN.** `mounter-registry.test.ts` (dispatch table for every `(kind,source)`; W4 precedence incl. malformed-local → `MalformedFilesystemError`; unknown → CloudNotBuilt) → `mount-adapter.ts` + `mounter-registry.ts` + `RegistryFilesystemMounter` + `selectMountAdapter` + `isLocalRepoPath` + `MalformedFilesystemError`.
4. **Scaffolding constant + drift-guard — RED then GREEN.** `scaffolding-drift-guard.test.ts` (constant covers every real writer's emitted paths, C2) → `scaffolding-paths.ts` authoring `SANDBOX_SCAFFOLDING_PATHS` from the §8 writer set.
5. **Adapter 1 worktree — RED then GREEN.** `git-worktree-adapter.integration.test.ts` (mount creates worktree on `agent/<sessionId>`; capture commits + bundles + removes; tracked `CLAUDE.md` excluded) → `git-worktree-adapter.ts`.
6. **Adapter 2 clone — RED then GREEN.** `git-clone-adapter.integration.test.ts` (shallow clone of a local bare repo; capture commits + named-ref bundle) → `git-clone-adapter.ts`.
7. **Adapter 3 local-folder — RED then GREEN.** `local-folder-adapter.integration.test.ts` (in-place symlink; snapshot capture) → `local-folder-adapter.ts`.
8. **Adapter 4 placeholder.** `cloud-not-built-adapter.ts` + assertion in registry test (explicit "not built").
9. **Capture-store.** `capture-store.ts` `writeFilesystemCapture` (covered by adapter integration tests asserting the row).
10. **Session hooks — RED then GREEN.** `session-mount.integration.test.ts` (mount after spawn; **capture before `endSession`** on normal/not-returned/budget; **capture before `crashSession`** on the `:1039` crash path; no-fs degrade) → edit `session-provisioning.ts` (`mounter?` in deps, `mountedFilesystems` on `AdmittedSession`, Hook A at `:464`, Hook B helper before each `endSession` at `:1060`/`:1102`/`:1117` + before `crashSession` at `:1039`).
11. **Wire `mounter` at all 3 deps sites (W3).** Inject `RegistryFilesystemMounter` (optional) into `ProvisionSessionDeps` where it's assembled: `server-factory.ts:353`, `routines-routes.ts:658`, `sessions-routes.ts:317`. *Recommended:* hoist a shared `provisionDeps`/`buildProvisionDeps` factory so the three sites don't drift — else routine/assistant sessions silently never mount. Covered by `session-mount.integration.test.ts` (drive a routine path + a session path, both capture).
12. **Docstring corrections.** Edit `FilesystemMounter.mount` + `FilesystemAuth` JSDoc in `shared/src/filesystem.ts` (§3).
13. **Live-proof.** `ao2-live-proof.integration.test.ts` (§12) — execute, assert, before `done`. No `npm run check` inside it.
14. **Verify.** `npm run verify` (note the AM4 flake, §14).

### §13 AMENDMENT (re-run, post human-review) — the validation-gap tasks

The build (steps 1–14) shipped CI-green; the wiring audit (§11.1) confirms it is
correctly wired. These tasks close the proof gap that triggered the reopen — no
production wiring fix is required (audit found no break). Builder order:

A1. **Wiring re-confirm (no code).** Re-read §11.1 file:line cites; confirm
   `server-factory.ts:275/375/385` → `app.ts:436/457` → Hook A `:634` → harness
   `cwd:sandboxPath` `cli-harness-adapter.ts:412` → Hook B `:1294`. If any cite has
   drifted, that drift IS the bug — fix it before writing the lanes. (Expected: clean.)
A2. **Lane (a) — RED then GREEN.** Write `ao2-session-roundtrip.integration.test.ts`
   (§12 Lane a): real `admitSession`/`runSession`/teardown + real
   `RegistryFilesystemMounter` + real `GitWorktreeAdapter` in `ProvisionSessionDeps` +
   an **edit-stub harness whose `startSession` writes `AGENT_OUTPUT.txt=<token>` in its
   cwd**, against a temp git fixture repo. Assert: mounted tree present at run time;
   the harness's on-disk edit is in the cloned bundle; scaffolding excluded; worktree
   removed. Runs in `test:integration` → CI/attested. This is the regression net.
A3. **Lane (b) — local-only live-proof.** Write `ao2-real-session.real-harness.test.ts`
   (§12 Lane b): real `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` through real provisioning
   into a mounted worktree; deterministic task "create `FILE.txt` = `<uuid>`"; assert the
   captured commit contains `FILE.txt===<token>`. `.real-harness.test.ts` suffix →
   excluded from `test:all`/CI; gated `skipIf(!claudePresent || !authOk)`. Builder runs
   `npm run test:real-harness` ONCE locally, pastes the pass output into the PR (not CI).
A4. **Demote old proof.** `ao2-live-proof.integration.test.ts` stays as the adapter-level
   round-trip (worktree + bundle + self-host scaffolding-exclusion); it is no longer the
   AC1/AC2 keystone — Lanes (a)+(b) are.
A5. **Verify + ship.** `npm run verify` green (Lane a included); Lane (b) local pass
   noted in PR; honest statement that Lane (b) cannot run in attested CI.

## 14. Risks / decisions / open questions

- **Capture is anchored before `endSession`, not before `workspace.destroy`** (C1, DECIDED) — `endSession` (`session-lifecycle.ts:341`) holds the `rm -rf`; `workspace.destroy` is only adapter-map cleanup. The capture helper runs before each `endSession`/`crashSession`. Anchoring it at the old "before `workspace.destroy`" site would capture an already-deleted tree.
- **`mounter` wired at 3 sites** (W3, DECIDED) — `ProvisionSessionDeps` is assembled at `server-factory.ts:353`, `routines-routes.ts:658`, `sessions-routes.ts:317`. All three must inject `RegistryFilesystemMounter` (optional). Recommend a shared `buildProvisionDeps` factory so the three never drift; a missed site = routine/assistant sessions silently never mount.
- **Second crash funnel — capture only at `:1039`** (W1, DECIDED) — the detached `.catch` funnel at `:1175` is handed only a `SessionContext` (no `mountedFilesystems`) and fires only when `runSession`'s own teardown failed; it gets no capture. Not worth threading `mountedFilesystems` onto `SessionContext` for a never-expected last-resort path.
- **Crash path leaks the dir, no destroy** (W2, DECIDED) — `crashSession` neither `rm`s nor calls `workspace.destroy`; the crash-path capture protects a future GC, not an imminent delete; tests assert a capture row, never "before destroy".
- **W4 selection precedence** (DECIDED) — `connectionId != null` → clone; `null` + local path → worktree; `null` + non-path repo → `MalformedFilesystemError` (loud, never silent worktree). Aligns with `filesystem.ts:30-31`.
- **`SANDBOX_SCAFFOLDING_PATHS` authored fresh + drift-guarded** (C2, DECIDED) — does not exist on base; authored from the 3 real writer surfaces (context-assembly + provision-return-hook + harness mcp/AGENTS writers); a drift-guard test fails CI if a future writer adds an uncovered path. Load-bearing on self-host.
- **Worktree same-branch constraint** → each session gets `agent/<sessionId>` (DECIDED, concept Phase 5). Branch sanitized like `push`.
- **In-place vs copy for local folder** → in-place (DECIDED, concept Phase 5). Concurrency same-vault = last-write + snapshot; per-session-copy is a future localized adapter change, not a contract change.
- **Live-proof uses real git, no `npm run check`** (W5, DECIDED) — real `git worktree add` off THIS repo → real edit → real `git add/commit` → `git bundle` → assert the bundle clones + contains the edit/commit + the edit is not a clobbered scaffolding file. No monorepo `tsc` inside the integration test.
- **AM4 redetect rate-limiter flake (known).** `adapter-pool.ts refreshDiscoveries()` has a known timing flake that can redden full `verify` at ship unrelated to AO2. NOTE it; if it blocks ship, the candidate small unblock is making `refreshDiscoveries()` test-injectable (a test-seam, **NOT a behavior change**) — only if it actually blocks, and flagged as such in the PR.
- **`isLocalRepoPath` heuristic** — `connectionId==null` AND `resourceRef.repo` is a path (`/`, `file://`, `.`, `~`) vs `owner/repo`/`https`. Derivable today (concept Phase 5 field-flag); no new column. OPEN (soft): a future WP MAY adopt a `source:'local'`-for-`code` convention to make this a pure `source` check — a convention, not a column AO2 adds.
- **`⚠️ UNVERIFIED`** — `git worktree add`/`remove` argv and `git bundle create <ref>` shallow-safety are verified against the salvage `443c705d` (which ran them) + git's stable CLI; the worktree verbs are new this pass and proven by the live-proof, not by training data.

---

## Self-critique (1 round)

- **New directory justified?** Yes — `filesystem/` vs `harness/` prevents the locked "mount adapter ≠ sandbox adapter" vocabulary collision from sharing a folder. Small, named, one concern.
- **Internal `MountAdapter` vs reusing `FilesystemMounter`?** Narrower internal interface chosen because adapters need a `gitRunnerFactory` + capture-store that don't belong on the public seam. The outward seam (`FilesystemMounter`) is unchanged → AO1 needs no type change (concept Phase 5 honored).
- **Capture anchored correctly?** Yes — at the `endSession` site (which holds the `rm -rf`), not the old `workspace.destroy` site (adapter-map cleanup only). The original "before destroy" framing would have captured an empty tree on every completed/not-returned/budget session — the primary AC2 path. Fixed.
- **Over-built?** v1 = git (full keystone) + thin local-folder; cloud = explicit "not built" throw (not a stub-from-memory, MEMORY-aligned). Honest cut.
- **Source-agnostic flow?** Yes — `session-provisioning` calls one `mounter`; `selectMountAdapter` is the only dispatcher (hard rule 6). The AC1 test asserts the flow has no source switch.
- **Capture ≠ landing held?** Every adapter stops at commit/bundle/snapshot; no push/PR (hard rule 3).
- **Crash path** — capture added at the in-`runSession` `:1039` site; the detached `:1175` funnel deliberately excluded (W1); crash-path tests assert a capture row, not "before destroy" (W2).
- **Scaffolding constant won't drift** — the drift-guard test reds CI on a new uncovered writer path (C2), so capture can't silently corrupt as the provisioning surface grows.
