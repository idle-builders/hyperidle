# filesystem-mounting — destroyer verdict

## Should this service exist?

**KILL THE PACKAGE. Merge the mount engine into `run-orchestration`.**

Four exports, one class, one production consumer. The only production reference to this package
anywhere is `layers/agent-orchestration/src/boot.ts:56` (imports `RegistryFilesystemMounter`, wires
it into `run-orchestration`'s provisioning deps). Neither exported type is imported by anyone —
`AdapterDeps` and `MountingGitRunnerFactory` have **zero** external references (boot.ts passes
structural object literals). The graph shows 0 doors for every symbol because the whole package is
reached through one DI port (`deps.mounter?: FilesystemMounter`) — dynamic dispatch, a known graph
blind spot; rg confirms the real chain: session-start doors → `run-orchestration/provisioner.ts`
(mount at Phase 4.5, captureBack at teardown Hook B) → this class.

The package's entire reason to be a separate Service was ownership of the `filesystem_captures`
table (barrel `@lore`, AU26 F1). That table is a **write-only archive**: this class is its only
writer and there are zero production readers of the rows, the `.bundle` files, or the snapshot dirs
(`rg` across layers/framework/applications/tools: only schema, this package, and tests). Its
designed consumer, AO3 "land captured code", is **WONT DO** (founder, 2026-07-03,
`TRACK-AO.md:123`) — the ruling says code work rides provider-native git/gh: agents branch and push
themselves. The other dependent, AO5 session-fork, is registered but unbuilt. Delete the archive
and the package owns nothing; a table-less mount engine with a single same-Layer consumer is a file
in `run-orchestration`, not a Service.

Survivors route to: `layers/agent-orchestration/run-orchestration/src/` (mount adapters +
scaffolding exclusion), as internal modules. Not to `filesystems` — that sibling owns the
filesystem *record*; mounting is a provisioning implementation detail and provisioning lives in
run-orchestration. This also deletes the structural re-declaration rationale for `ports.ts` (the
port was re-typed only because it crossed a Service boundary that stops existing).

## If written today, from scratch

Three functions inside run-orchestration, no class, no registry ceremony:

- `mountFilesystem(fs, sandboxPath)` — symlink a local folder; `git worktree add` a local repo;
  depth-1 clone a connected repo; write the scaffolding exclude. Error result for anything else.
- `releaseWorktree(fs, sandboxPath, sessionId)` — teardown for the worktree case only: unstage
  scaffolding, commit leftovers onto the `agent/<session>` branch (already visible in the user's
  own repo — work rides git, per the AO3 ruling), `git worktree remove --force`.
- `SANDBOX_SCAFFOLDING_PATHS` — the one mirrored list, living next to the scaffolding writers it
  mirrors.

No captures dir, no bundles, no snapshots, no DB table, no containment check, no auth parameter.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 1 |
| SIMPLIFY | 3 |
| KEEP | 0 |

Surface: 5 exported declarations → 0 (package dissolved; 2 shrunken internal survivors inside
run-orchestration). The capture-archive feature — roughly half the package's code and its entire
DB surface — dies outright.

## Feature-level kills

1. **The capture archive** (git bundles, local-folder snapshots, `filesystem_captures` inserts,
   `capturesDir`, the capture-root containment check, the sessionId regex, the
   insert-failure-rollback dance in `RegistryFilesystemMounter.captureBack`,
   `mounter-registry.ts:307-361`). Zero production readers of any output. AO3, the consumer it was
   built for, is WONT-DO; the founder ruling replaced it with "agents use normal git/gh tools".
   What breaks: AO5 session-fork loses its substrate — acceptable because AO5 is unbuilt, and a
   capture write-path rebuilt when AO5 actually starts will be shaped by AO5's real restore needs
   instead of a two-tracks-stale guess. Also kills: the `filesystemCaptures` schema +
   drop-table migration, its table-ownership-guard entry, `CaptureResult`/`captureBack` in
   `framework/filesystem-contract`, and four test files
   (`capture-provenance.integration.test.ts`, the three adapter captureBack suites).

2. **Local-folder snapshot backup** (`LocalFolderAdapter.captureBack`, lines 105-120). The mount is
   a symlink to the real folder — the agent's edits land live; the teardown `cpSync` copy is a
   backup nobody can see or restore. Nothing breaks.

3. **Clone-source teardown capture** (`GitCloneAdapter.captureBack`, lines 149-169). The bundle was
   the only artifact surviving sandbox destruction and nothing can read it — the work was already
   effectively lost. Hole: an agent on a connected remote repo that never pushed loses uncommitted
   work at teardown. That is the founder-sanctioned model (AO3 ruling: agent pushes, provider owns
   the rest). Trust the agent to push.

4. **The `CloudNotBuiltAdapter` class** (lines 58-74) — a class whose whole job is returning an
   error string for gdrive/dropbox/s3 sources no adapter exists for. Becomes one inline error
   return in the adapter selector.

5. **The package itself** — package.json, barrel, vitest config, tsconfig, the `AdapterDeps`
   export, the Mechanism-C port re-declaration story. Mount adapters + their mount tests +
   `git-worktree-live-proof` move into run-orchestration.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `RegistryFilesystemMounter.mount` | BOOTSTRAP wire (`boot.ts:301`) → DI port `deps.mounter`, called at session-provisioning Phase 4.5 (`filesystem-provisioning.ts:103`); ultimate doors are the session-start doors. Graph-blind: dynamic dispatch through `FilesystemMounter`. | SIMPLIFY | Core — this is how an agent session gets the user's repo/folder; but drop the `auth` param (every call site passes `null`, no adapter reads `ctx.auth`), inline the cloud-stub error, and demote from exported class to an internal run-orchestration function. |
| 2 | `RegistryFilesystemMounter.captureBack` | Same DI port, called at teardown Hook B (`provisioner.ts:1637,1690,1716`) for all three end paths. | SIMPLIFY | Shrink to worktree-only `releaseWorktree` (unstage scaffolding, commit leftovers to the `agent/*` branch, `worktree remove`) — that part has real user value (work appears as a branch in the user's own repo; no stale worktree registrations). Everything else it does — bundle, snapshot, DB insert, containment check, sessionId regex, rollback — is the dead archive: DELETE per feature-kill 1. |

Internal members not in the input surface, for completeness: `LocalFolderAdapter.captureBack`,
`GitCloneAdapter.captureBack` → DELETE (feature-kills 2, 3). `CloudNotBuiltAdapter` → DELETE
(feature-kill 4). `LocalFolderAdapter.mount`, `GitCloneAdapter.mount`, `GitWorktreeAdapter.mount`,
`writeExclude`, `sanitizeBranch`, `resolveCommonGitDir`, `isLocalRepoPath`, `selectMountAdapter` →
survive inside run-orchestration as the mount function's guts. `MalformedFilesystemError` →
DELETE the class; return the error result the caller already handles.
`GitWorktreeAdapter.captureBack` → survives shrunken as `releaseWorktree` (row 2).

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AdapterDeps` | DELETE | Zero external references — boot.ts builds the deps structurally without importing it. After feature-kill 1, two of its three members (`capturesDir`, `db`) are dead anyway; the survivor is "pass the git-runner factory", which needs no interface. |
| `MountingGitRunnerFactory` | SIMPLIFY | The port is real (Application injects `createGitRunner`), but zero external importers of the *type*, and 4 of its 11 verbs have zero production callers in this package: `lsRemote` (never called here), `revParseIsInsideWorkTree` (TEST-ONLY), `currentBranch` (DEAD, nothing references it anywhere), `bundle` (dies with the archive). Delete those four; the type becomes an internal declaration in run-orchestration. |
| `SANDBOX_SCAFFOLDING_PATHS` | MERGE | Live and load-bearing — feeds `writeExclude` at mount and the unstage filter at teardown, and the cross-layer drift-guard test (`layers/core-api/src/__tests__/scaffolding-drift-guard.test.ts`) pins it against every real scaffolding writer's `EMITTED_ROOTS_*`. Moves with the engine into run-orchestration, next to the scaffolding writers it mirrors; drift-guard re-points its import. |

## Holes this leaves

- **AO5 (session fork from checkpoint) loses its substrate.** `TRACK-AO.md` says AO5 "literally
  cannot be built" without AO2's capture write-path. True — and rebuilding a capture path when AO5
  starts is small, will target AO5's actual restore verbs, and beats paying storage + code + a DB
  table for an unbuilt feature indefinitely. If the founder holds AO5 as imminent, the cheapest
  counter-verdict is keeping only `GitWorktreeAdapter`'s commit (the branch IS the checkpoint;
  `commitSha` is recoverable from the branch itself with no table).
- **Unpushed work on connected (clone-source) repos dies at teardown.** Today it "survives" into a
  bundle no product surface can open — so nothing users could reach is lost. The sanctioned path
  is the agent pushing its branch.
- **Accumulated `filesystem_captures` rows and `.ao2-captures` files become orphans.** Drop the
  table, delete the dir; nothing ever read either.
- **The `writeback` setting's teardown-capture promise goes fully hollow** (it was already half
  hollow — nothing gates captureBack on it and nothing reads captures). Whether the field itself
  dies belongs to the `filesystems` / settings destroyer; flagging the cross-service seam here.
- **Contract shrink ripples:** `FilesystemMounter` and `CaptureResult` in
  `framework/filesystem-contract` shrink or die with the port; `provisioner.ts` Hook B call sites
  become "release worktrees" calls; `boot.ts:299-307` wiring loses `capturesDir` and `db`.
