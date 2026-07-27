# filesystems — Service-as-Product Analysis (revised post-critique)

**Verdict:** standalone (earns its own boundary) — WITH one relocation carve-out the first pass missed.
**Current public exports:** 61
**Target public exports:** ~24 (~60% reduction) — 6 of the 61 leave the service entirely (relocated to `work`), the rest collapse into 6 general interfaces.
**isInfraPlatform:** true (platform product — consumers are other core-api/agent-orchestration services, not end users).

---

## What changed after review

The adversarial review was right on two counts, both fixed here:

1. **`checkAndUnblockDependents` (dependency-watcher.ts) was entirely unaccounted and does not belong here.** It is task-dependency orchestration squatting inside the filesystem substrate. Confirmed from source: it touches **zero owned tables** — it fires on task completion, calls the injected `work` store (`listHoldTasksWithDependencyPattern` / `getTaskById` / `transitionTask`) and forwards a `workIntents` recorder. Its own `@lore` concedes it lives here for a layering convenience only ("fabric cannot import from server"), never a product reason. **Disposition: RELOCATE out of `filesystems` into `work`.** This also dissolves the *only* reason `filesystems` depends on `work` at all: the ports block `FilesystemsWorkStore`, `FilesystemsAgentWorkIntentRecorder`, `FilesystemsAgentWorkIntentInput`, `FilesystemsAgentWorkIntentKind`, `FilesystemsAgentWorkIntentRecord` exist *solely* to feed this watcher. Six exports (1 function + 5 port types) leave the service, and the `filesystems->work` edge in the data package disappears with them.

2. **Export accounting was hand-wavy.** The prior "20" omitted the watcher export and ~9 db-row/config types (`FilesystemRow`, `NewFilesystem`, `FilesystemInjectionRow`, `NewFilesystemInjection`, `FilesystemCaptureInput`, `ProbeResult`, `FilesystemReachabilityInput`, `InspectLocalPathDeps`, `LocalPathInfo`) that consumers (routes, session-lifecycle) genuinely need. Honest target is **~24**, mapped below. Still a real ~60% collapse from 61 — the over-fragmentation finding stands.

Also incorporated (suggestions):
- **`listFilesystems` return contract nailed** — the `agentId` filter returns *full filesystem rows* via an injections->filesystems join, not bare ids. This collapses session-lifecycle's current two-step (`listFilesystemIdsByAgent` -> `listFilesystemsByIds`) into one call.
- **Scaffolding justification tempered** — the current single flat array already absorbs a new path without a new export; the genuine over-fragmentation is the *7 `EMITTED_ROOTS_*` spread-input constants*, which are internal-only (the drift-guard imports the real writers' copies from context-assembly/session-lifecycle, not filesystems'). The collapse is real; the "new file = new key" framing applies to the status-quo array too, so it is not the justification.

---

## Product purpose (restated — task orchestration removed)

The **agent-sandbox filesystem substrate**. It does exactly one family of things, all over its own 3 owned tables and the sandbox filesystem:

- **Register** a filesystem source (local folder / git clone / git worktree / cloud-not-built) — CRUD over `filesystems` + `filesystemInjections`.
- **Mount** a registered source into an agent sandbox (4-kind strategy polymorphism).
- **Watch** a mounted sandbox for write-back changes and **capture** them (`filesystemCaptures`, an against-grain EventBus edge).
- **Probe** whether a source is reachable before mounting.
- **Scaffold** the sandbox with harness config file paths.

Consumers: `routes/filesystems.ts` (registry CRUD + reachability), `routes/knowledge.ts` (display-name lookup), `server-factory.ts` (constructs the mounter), `app.ts` (boot wiring), plus two agent-orchestration services via Mechanism-C ports — `context-assembly` (`startWatcher`) and `session-lifecycle` (per-agent mount resolution).

**Explicitly NOT its purpose:** auto-unblocking dependent tasks when a task completes. That is a `work`-domain concern (task state machine + dependency graph) and relocates to `work`.

---

## Target interfaces (6) — the standalone surface

### 1. FilesystemRegistry — one store over the 3 owned tables
`getFilesystem(id)` / `listFilesystems(filter:{teamId?|agentId?|ids?})` / `saveFilesystem` / `updateFilesystemState` / `deleteFilesystem` / `get|save|deleteInjection` / `writeCapture`
+ data types: `FilesystemRow`, `NewFilesystem`, `FilesystemInjectionRow`, `NewFilesystemInjection`, `FilesystemCaptureInput`

Replaces: `getFilesystemById`, `listFilesystemsByTeamId`, `listFilesystemIdsByAgent`, `listFilesystemsByIds`, `insertFilesystem`, `updateFilesystemState`, `deleteFilesystemById`, `getFilesystemInjection`, `insertFilesystemInjection`, `deleteFilesystemInjection`, `writeFilesystemCapture` (11 free functions -> one store).

**Return-contract note (from review):** the 4 list/get variants conflate two tables. `listFilesystemsByTeamId`/`byIds` return full `filesystems` rows; `listFilesystemIdsByAgent` returns bare ids from the *separate* `filesystemInjections` table, forcing session-lifecycle into a two-step fetch. `listFilesystems(filter)` **always returns full filesystem rows**; the `agentId` case does the injections->filesystems join internally. New query use-cases (pinned-by-host, by-recency) add a filter field, not a method.

### 2. FilesystemMounter — the strategy registry keyed by source kind
`mount(context)` + `RegistryFilesystemMounter`, `FilesystemMounterDeps` (`AdapterDeps`), `MountContext`, `MalformedFilesystemError`

Replaces (-> internal): `GitCloneAdapter`, `GitWorktreeAdapter`, `LocalFolderAdapter`, `CloudNotBuiltAdapter`, `selectMountAdapter`, `isLocalRepoPath`, `MountAdapter`, `CaptureContext`, `AdapterCaptureResult`. The 4 adapter classes + `selectMountAdapter` have **zero external consumers** — pure internal machinery. A new source kind registers internally with **no new public export** (today: a new adapter class + a `selectMountAdapter` branch). This is the headline over-fragmentation.

### 3. FilesystemProbe — one "tell me about a source before mounting" surface
`resolveFilesystemState(input)` / `inspectLocalPath(path)`
+ types `FilesystemReachabilityInput`, `ProbeResult`, `LocalPathInfo`, `InspectLocalPathDeps`
+ auth impls `NoopAuthResolver`, `ServiceConnectionResolverAdapter`

Replaces (-> internal): `probeGitRemote`, `probeLocalPath`, `repoToUrl` — helpers composed inside `resolveFilesystemState`, external use is tests-only. New source-type probes are added below the interface.

### 4. FileWatcher — self-contained async watcher
`startWatcher(config) -> { stop() }` + `FileWatcher`, `FileWatcherConfig`

The debounced flush stays EventBus-inverted (`sandbox_writeback_changes_detected`) so no processor DI leaks through the barrel. Consumed by context-assembly.

### 5. SANDBOX_SCAFFOLDING_PATHS — one keyed record
`SANDBOX_SCAFFOLDING_PATHS.agentsMd / .codexHome / .contextAssembly / ...`

Replaces: the 7 `EMITTED_ROOTS_*` constants — **internal spread-input constants with no external consumers** (the drift-guard reads the writers' own copies, not these). Collapsing them to non-exported module constants removes 7 barrel exports. Note (tempered): the existing flat array already absorbs a new path without an export; the win is deleting 7 redundant public constants, not "new file = new key."

### 6. FilesystemsGitRunnerFactory — the one named DI port
`(cwd) => FilesystemsGitRunner` + `FilesystemsGitRunner`, `FilesystemsGitConfigInjection`, `FilesystemsServiceConnectionResolver`

Replaces the DI-port sprawl. Of the git/connections ports only `FilesystemsGitRunnerFactory` is named by an external consumer; the runner-shape + config + connection-resolver types are declared to type the service's own parameters and are satisfied structurally at the wiring site. The 5 `work`-facing port types are **gone entirely** (relocated with the watcher).

---

## Export math (honest)

| Group | current | target |
|---|---|---|
| Registry (11 fns + 5 data types) | 16 | 6 |
| Mounter (4 adapters + registry + 6 helper/type) | 11 | 4 |
| Probe (5 fns + 4 types) | 9 | 7 |
| Watcher | 3 | 3 |
| Scaffolding (8 constants) | 8 | 1 |
| Git/connections ports | 4 | 3 |
| **work-facing ports (relocated to `work`)** | **5** | **0** |
| **dependency-watcher fn (relocated to `work`)** | **1** | **0** |
| capture-store input type (folded into registry) | 1 | 0 |
| misc types folded above | 3 | 0 |
| **Total** | **61** | **~24** |

6 of the 61 (5 ports + 1 function) leave `filesystems` for `work`. The rest collapse in place.

---

## Inside lens

Adapters live behind the mounter as an internal strategy table keyed by source kind — the barrel never names an adapter, so a new kind is an internal registration. Reachability composes internal probe helpers under `resolveFilesystemState`. The watcher is a self-contained handle; the against-grain capture-writeback edge stays EventBus-inverted (no processor DI leak). Once the task-unblock watcher relocates, the service depends *only* downward on `git-export` (narrow `GitRunner` port) and `connections` (`resolve`) — a genuinely coherent substrate boundary. New source kinds, filters, and scaffolding files are internal edits that leave the barrel stable.

---

## Scaling test — PASSES

Every growth axis is absorbed by a parameterized interface, not a new method:
- New mount source kind (gdrive/dropbox) = 1 internal adapter registration, **0 new public exports** (today: a new adapter class + `selectMountAdapter` branch).
- New list use-case (pinned-by-host, by-recency) = 1 field on `listFilesystems(filter)`, **0 new methods** (today: a method per intent).
- New reachability source type = internal helper composed in `resolveFilesystemState`, **0 exports**.
- New harness scaffolding file = 1 key on `SANDBOX_SCAFFOLDING_PATHS`.

Imagine dozens more services and hundreds more calls: the API grows a filter field or an internal registration, never a method per caller. Sub-linear.

---

## Consolidation judgment

**standalone — with a relocation.** The proposed `git-export` merge is rejected: `git-export` is filesystems' **downward dependency**, not a sibling. filesystems consumes git-export's `GitRunner` (12 of ~19 verbs) via a narrow DI port; they are different products (git-export publishes knowledge to a repo; filesystems mounts a source into a sandbox and watches/captures it). Merging would fuse unrelated products and turn a clean downward edge into a cycle.

filesystems earns its boundary: 3 owned tables, 4-kind mount polymorphism, async watcher, reachability, an against-grain EventBus capture edge. The real finding was never "shouldn't exist" — it is "61 exports for ~5 real capabilities is ~4x over-exposed internal machinery, PLUS one task-orchestration concern (`checkAndUnblockDependents`) squatting here for a layering convenience that should live in `work`." Both are fixed above.
