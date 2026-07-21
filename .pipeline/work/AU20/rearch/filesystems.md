# filesystems — Service-as-Product (BOTH lenses)

**Layer:** core-api · **Owned tables:** 3 (`filesystems`, `filesystemInjections`, `filesystemCaptures`)
**Now:** 35 methods / 16 types · **Target:** 15 methods / 13 types
**Substrate:** owned-tables (primary) — CRUD over 3 tables — with three genuine adapter capabilities layered on top (mount/watch/probe over the OS filesystem + git).

---

## 1. INSIDE-OUT (anchor)

### Substrate = owned DB tables (3)
This is NOT a 0-table adapter service. It **owns** 3 tables and every read/write of them must route here (ownership = reads AND writes). The floor is plain CRUD:

| Table | Role | CRUD floor |
|---|---|---|
| `filesystems` | registered source (code/doc_set, forge/local, writeback policy, state) | create / get / list / update(state) / delete = 5 |
| `filesystemInjections` | per-agent link row (agentUserId × filesystemId) — no mutable field | create / get / list / delete = 4 |
| `filesystemCaptures` | append-only writeback provenance (session, path, sha) read by AO3 | create / list = 2 |

**Floor ≈ 15** (5 × 3 tables). The general `listFilesystems(filter)` absorbs the three current list variants **and** the injection join, so the realized store lands at **10 methods — below the raw floor**.

### Genuine owned capabilities beyond CRUD (the actual product)
The registry tables are the ledger; the product is the **agent-sandbox filesystem substrate**. Three genuine capabilities it truly owns, each an adapter over an external system, each UNIFIED (not one method per backend):

1. **Mount** — `mount` / `captureBack`: put a registered source into a sandbox and capture its writeback. 4-kind strategy (git-clone / git-worktree / local-folder / cloud-not-built) collapsed behind ONE `selectMountAdapter` — the barrel never names an adapter. `captureBack` writes a `filesystemCaptures` row. **2 ops.**
2. **Probe** — `resolveFilesystemState` (is a registered source reachable before mount: `git ls-remote` / `fs.access`) + `inspectLocalPath` (onboarding: does this local path exist / is it a git repo / what branch). Adapter over git + OS fs. **2 ops.**
3. **Watch** — `startWatcher(config) → {stop}`: watch a mounted sandbox's `knowledge/`+`work/` and emit `sandbox_writeback_changes_detected` on the EventBus (against-grain edge inverted — no processor DI leaks). Adapter over `fs.watch`. **1 op.**

Plus one owned constant: `SANDBOX_SCAFFOLDING_PATHS` (the exhaustive scaffolding-root set the git adapters exclude from authored commits).

Floor 15 = store 10 + 5 genuine adapter ops. We land **at** the floor because the general-list collapse offsets the genuine capabilities exactly.

---

## 2. OUTSIDE-IN (real demand)

`consumers[]` is empty in the census (no method-level cross-package capture), so demand is read from source + the prior analysis. Real callers:

- **`routes/filesystems.ts`** — register/get/list/delete a filesystem (store CRUD) + live reachability on register/get (`resolveFilesystemState`) + onboarding path probe (`inspectLocalPath`).
- **`routes/knowledge.ts`** — filesystem display-name lookup (`getFilesystem` / `listFilesystems`).
- **`session-lifecycle` (Mechanism-C)** — per-agent mount resolution: `listFilesystems({agentId})` → `mount` → `captureBack`. Today forced into a two-step `listFilesystemIdsByAgent` → `listFilesystemsByIds`; the general filter collapses it to one call returning full rows.
- **`context-assembly` (Mechanism-C)** — `startWatcher`.
- **`server-factory.ts` / `app.ts`** — construct `RegistryFilesystemMounter`, wire the git/connections DI ports, build the auth resolver.

Demand is a small coherent family: register a source, tell me if it's reachable, list what an agent has, mount it, capture it back, watch it. No caller wants a method-per-source-kind or a method-per-query — they want a filter and a polymorphic mount.

---

## 3. THE COHERENT PRODUCT API (6 interfaces, 15 methods)

### 1. FilesystemStore — one store over the 3 owned tables (lens: both)
```
getFilesystem(id): FilesystemRow | undefined
listFilesystems(filter: { teamId? | agentId? | ids? }): FilesystemRow[]   // agentId does the injections→filesystems join, returns FULL rows
saveFilesystem(values: NewFilesystem): void
updateFilesystemState(id, state): void
deleteFilesystem(id): void                                                // injections + captures cascade
getInjection(agentUserId, filesystemId): FilesystemInjectionRow | undefined
saveInjection(values: NewFilesystemInjection): void
deleteInjection(agentUserId, filesystemId): void
writeCapture(input: FilesystemCaptureInput): void
listCaptures(filter: { sessionId? | filesystemId? }): FilesystemRow[]      // owned-table read for AO3 (ownership = reads too)
```
10 methods. From: the 3 owned tables. Replaces 11 free functions. New query need = a filter field, never a new method.

### 2. FilesystemMounter — polymorphic mount seam (lens: both)
```
mount({ filesystem, sandboxPath, auth }): MountResult
captureBack({ filesystem, sandboxPath, sessionId }): CaptureResult
```
2 methods, `RegistryFilesystemMounter` + `MalformedFilesystemError`. From: genuine mount capability + session-lifecycle demand. 4 adapters + `selectMountAdapter` + `isLocalRepoPath` internal — a new source kind is an internal registration, **0 new exports**.

### 3. FilesystemProbe — reachability + local inspect (lens: both)
```
resolveFilesystemState(row: FilesystemReachabilityInput, deps): FilesystemState
inspectLocalPath(path, deps): LocalPathInfo
```
2 methods + `NoopAuthResolver` / `ServiceConnectionResolverAdapter` (the two auth-resolver impls routes construct). From: genuine probe capability + register/onboarding demand. `probeGitRemote` / `probeLocalPath` / `repoToUrl` internalized.

### 4. FileWatcher — self-contained sandbox watcher (lens: inside-out)
```
startWatcher(config: FileWatcherConfig): FileWatcher   // { stop() }
```
1 method. From: genuine watch capability; EventBus-inverted; consumed by context-assembly.

### 5. SANDBOX_SCAFFOLDING_PATHS — one keyed constant (lens: inside-out)
The single scaffolding-root set. From: genuine owned constant the git adapters exclude. The 7 `EMITTED_ROOTS_*` constants are **deleted** (the drift-guard imports the writers' own copies, not these).

### 6. Git/connections DI ports — Mechanism-C downward edges (lens: inside-out)
```
FilesystemsGitRunnerFactory = (cwd) => FilesystemsGitRunner
FilesystemsServiceConnectionResolver { resolve(userId, connectionId) }
```
Types only, wired at the composition root. From: the two real downward dependencies (`git-export`, `connections`). Structurally satisfied — the real `createGitRunner` / `ServiceConnectionResolver` pass unchanged.

---

## 4. TARGET NUMBERS

**targetMethods = 15** = floor 15 (store 10, sitting below raw 5×3 because the general filter collapses 3 list variants + the injection join) + 5 genuine adapter capabilities (mount, captureBack, resolveFilesystemState, inspectLocalPath, startWatcher). Every method is justified by an owned table or a genuine capability.

**targetTypes = 13:** `FilesystemRow`, `NewFilesystem`, `FilesystemInjectionRow`, `NewFilesystemInjection`, `FilesystemFilter`, `FilesystemCaptureInput`, `FilesystemReachabilityInput`, `LocalPathInfo`, `FileWatcherConfig`, `FileWatcher`, `AdapterDeps` (mounter deps), `FilesystemsGitRunnerFactory`, `FilesystemsServiceConnectionResolver`. (`FilesystemsGitRunner`, `FilesystemsGitConfigInjection`, `InspectLocalPathDeps`, `MountContext`, `ProbeResult` fold in as structural/internal.)

### DELETED (leave the codebase — not internalized)
- **6 work-facing exports relocate to `@hyperidle/work`**: `checkAndUnblockDependents` (task-orchestration squatting on zero owned tables) + the 5 `FilesystemsWorkStore`/`FilesystemsAgentWorkIntent*` port types that existed solely to feed it. This deletes the `filesystems → work` edge entirely.
- **7 `EMITTED_ROOTS_*` constants deleted** — redundant with the real writers' own copies (drift-guard reads those).
- **3 list-variant methods deleted** — `listFilesystemsByTeamId` / `listFilesystemsByIds` / `listFilesystemIdsByAgent` → one `listFilesystems(filter)`.

### INTERNALIZED (stay, un-exported)
4 adapter classes + `selectMountAdapter` + `isLocalRepoPath`; probe helpers `probeGitRemote` / `probeLocalPath` / `repoToUrl`; capture-store `writeFilesystemCapture` (behind `writeCapture`).

---

## 5. LEAN *AND* COMPLETE — every real feature still deliverable

| Real feature | Delivered by |
|---|---|
| Register a code/doc_set source | `saveFilesystem` + `resolveFilesystemState` |
| Onboarding: detect local repo + branch | `inspectLocalPath` |
| Team filesystem list / display name | `listFilesystems({teamId})` / `getFilesystem` |
| Per-agent mount at session start | `listFilesystems({agentId})` → `mount` (one call, full rows) |
| Writeback capture at session end | `captureBack` → `writeCapture` |
| AO3 locate a durable capture | `listCaptures({sessionId})` |
| Watch sandbox for writeback | `startWatcher` (EventBus) |
| New source kind (gdrive/dropbox) | internal adapter registration — 0 new exports |
| New reachability source type | internal helper under `resolveFilesystemState` — 0 exports |
| New harness scaffolding file | 1 key on `SANDBOX_SCAFFOLDING_PATHS` |

No capability lost; fragmentation removed. Sub-linear growth — every axis is a filter field or an internal registration, never a method-per-caller.

**Consolidation judgment:** standalone. The `git-export` merge is rejected — `git-export` is filesystems' *downward* dependency (narrow `FilesystemsGitRunner` port), a different product (publishes to a repo vs mounts a source into a sandbox). Merging would turn a clean edge into a cycle.

---

## External-adapter re-plan (founder correction — supersedes §1's substrate + §3/§4 numbers)

**Substrate: EXTERNAL-API adapter (primary), owned-tables (secondary bookkeeping).**
The founder's correction: filesystems is fundamentally an **externally-focused adapter** — the sibling of `harness-registry`. Where harness-registry adapts the harness CLIs + the process sandbox, filesystems **adapts the external OS filesystem + git + `fs.watch`**. Its 3 tables are *metadata bookkeeping around that external substrate*, not its identity. §1 mislabelled the substrate as `owned-tables (primary)` and derived a 5×3 CRUD floor; that inverts the product. The IDENTITY is the adapter; the ledger is the register-of-record the adapter reads/writes.

This mirrors `harness-registry.md` exactly: an adapter over external systems, **unified across backends** (one `mount`, not one method per source kind), with the per-backend machinery (git-clone / git-worktree / local-folder / cloud-not-built adapters, `selectMountAdapter`, `probeGitRemote` / `probeLocalPath` / `repoToUrl`, `isLocalRepoPath`) **INTERNAL** — never on the barrel. The one difference from harness-registry: filesystems genuinely owns 3 DB tables (harness-registry owns 0), so a thin metadata ledger survives — but as bookkeeping *serving* the adapter, not as the anchor.

### The external systems it adapts + the minimal UNIFIED adapter surface (the floor)

| External system | Unified adapter seam | Ops | Consumer |
|---|---|---|---|
| **OS fs + git → sandbox** (clone/worktree/local place + commit/bundle capture) | `FilesystemMounter` (`RegistryFilesystemMounter`) — one polymorphic seam; 4 adapters + `selectMountAdapter` internal | `mount` · `captureBack` = **2** | session-lifecycle (Mechanism-C) |
| **git remote + local fs reachability** (`git ls-remote` / `fs.access` / local-repo inspect) | `FilesystemProbe` — adapter over git + OS fs; `probeGitRemote`/`probeLocalPath`/`repoToUrl` internal | `resolveFilesystemState` · `inspectLocalPath` = **2** | routes (register + onboarding) |
| **`fs.watch`** (sandbox writeback detection) | `FileWatcher` — EventBus-inverted | `startWatcher(config) → {stop}` = **1** | context-assembly (Mechanism-C) |

**External-adapter floor = 5 unified ops.** This is the product — the coherent "mount / capture / resolve / watch a filesystem" surface. Exactly the tiny real demand the census shows (consumers ask only for mount / startWatcher / stop / resolve). Everything else the old 35-method surface exposed is per-backend machinery that is now INTERNAL.

### The metadata ledger (secondary — bookkeeping the 3 tables genuinely need)

Not a 5-op CRUD × 3 tables. The ownership rule (reads AND writes route here) plus the **real** call-sites in `routes/filesystems.ts` + `session-lifecycle-bindings.ts` fix the genuine ledger surface — and two current store methods drop off the public API entirely:

| Table | Genuine external ledger ops | Cut → internal / deleted |
|---|---|---|
| `filesystems` (the source registry) | `saveFilesystem` · `getFilesystem` · `listFilesystems(filter)` · `updateFilesystemState` · `deleteFilesystem` = 5 | — |
| `filesystemInjections` (per-agent edge) | `saveInjection` · `deleteInjection` = 2 | `getInjection` **DELETED** — it is a read-after-write at `routes/filesystems.ts:402`; the route builds its response wire object from the `NewFilesystemInjection` it just wrote (no round-trip). The `agentId` join stays folded into `listFilesystems`. |
| `filesystemCaptures` (append-only provenance) | `listCaptures(filter)` = 1 | `writeCapture` **INTERNALIZED** — the adapter writes its own provenance row inside `captureBack` (mirrors harness-registry's `provisionHarnessEnvironment` writing its own config). No consumer writes captures except the mounter itself. |

**Metadata ledger = 8 ops** (registry 5 + injection edge 2 + capture read 1) — below the naive 5×3=15 CRUD floor, because `listFilesystems(filter)` absorbs 3 list variants + the injection join, `writeCapture` is internal, and `getInjection` is deleted.

### Corrected coherent API (6 exported constructs → 13 methods / 11 types)

```
FilesystemMounter   (RegistryFilesystemMounter + MalformedFilesystemError)   [external, primary]
  mount({ filesystem, sandboxPath, auth }): MountResult
  captureBack({ filesystem, sandboxPath, sessionId }): CaptureResult          // writes its OWN filesystem_captures row (writeCapture internal)

FilesystemProbe     (resolveFilesystemState + inspectLocalPath)               [external, primary]
  resolveFilesystemState(input, deps): FilesystemState
  inspectLocalPath(path, deps): LocalPathInfo

FileWatcher         (startWatcher)                                            [external, primary]
  startWatcher(config): FileWatcher   // { stop() }

FilesystemRegistry  (the metadata ledger over the 3 owned tables)            [bookkeeping, secondary]
  saveFilesystem(values)
  getFilesystem(id)
  listFilesystems(filter: { teamId? | agentId? | ids? })   // agentId does the injection join, full rows
  updateFilesystemState(id, state)
  deleteFilesystem(id)                                      // injections + captures cascade
  saveInjection(values)
  deleteInjection(agentUserId, filesystemId)
  listCaptures(filter: { sessionId? | filesystemId? })

SANDBOX_SCAFFOLDING_PATHS   (owned constant the git adapters exclude)        [inside-out]

Git/connections DI ports   (FilesystemsGitRunnerFactory, FilesystemsServiceConnectionResolver)   [Mechanism-C edges, types only]
```

### Corrected target numbers

**targetMethods = 13** = 5 external-adapter (mount, captureBack, resolveFilesystemState, inspectLocalPath, startWatcher) + 8 metadata-ledger. Down from the §3/§4 figure of 15. The delta from 15: `writeCapture` internalized (−1) + `getInjection` deleted (−1). The BIG change is not the two-method delta — it is the **substrate re-label**: the 5 external ops are now the anchor/identity, and the 8-method ledger is explicitly secondary bookkeeping, not a 5×3 CRUD floor. Going below 13 would delete genuine registry capability (the `/api/filesystems` REST registry is real CRUD demand — register a repo, list a team's sources, revoke an agent's access), so 13 is lean *and* complete: `featuresLost = []`.

**targetTypes = 11:** `FilesystemRow`, `NewFilesystem`, `NewFilesystemInjection`, `FilesystemFilter`, `FilesystemReachabilityInput`, `LocalPathInfo`, `FileWatcherConfig`, `FileWatcher`, `AdapterDeps`, `FilesystemsGitRunnerFactory`, `FilesystemsServiceConnectionResolver`. Down from 13: `FilesystemCaptureInput` folds internal (only `captureBack`/`writeCapture` use it; `listCaptures` returns `FilesystemCaptureRow`), and `FilesystemInjectionRow` drops from the barrel (only `getInjection` returned it; with `getInjection` deleted, the route no longer needs the row type).

### DELETED / INTERNALIZED beyond §4

- `writeCapture` — public → **internal** (adapter self-writes provenance in `captureBack`).
- `getInjection` — **deleted** (read-after-write; route builds response from its own write input).
- `FilesystemCaptureInput`, `FilesystemInjectionRow` — dropped from the public barrel (fold internal).
- Everything §4 already internalized (4 mount adapters, `selectMountAdapter`, `isLocalRepoPath`, `probeGitRemote`/`probeLocalPath`/`repoToUrl`) stays internal — reaffirmed: these are the per-backend adapter machinery, never the product surface.
