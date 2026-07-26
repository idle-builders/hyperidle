# git-export — Service-as-Product Re-Architecture (AU20, BOTH lenses)

Layer: core-api · Owned tables: **0** · Census: currentMethods **24**, currentTypes **25** · Service consumers: **1** (`filesystems`, 12 verbs) + route/boot consumers (composition root).

---

## 1. INSIDE-OUT — substrate, floor, genuine capabilities

### Substrate = **external-api: the `git` CLI**

git-export owns **zero DB tables**. Its lowest-level substrate is `node:child_process.spawn("git", …)`. The config it reads/writes lives in `server_config.gitExport` — a **`settings`-owned** table reached through a DI port. The knowledge rows it publishes are **`knowledge`-owned**, reached through a DI port. So this is **not** a table service and **not** arbitrary internal logic — it is an **adapter over git**, with one thin feature layered on top.

It is honestly **two products in one package**, and both bottom out on git:

- **Product A — the git-execution platform (`GitRunner`).** A single hardened seam over the `git` subprocess: env allow-list (drops `HYPERIDLE_API_KEY` / `credential.helper`), `GIT_CONFIG_*` token injection that never touches argv/URL, argv redaction, `-b`/`--`/leading-`-` guards, `GIT_TERMINAL_PROMPT=0`. Real second consumer: **`filesystems`** (agent-session clone/worktree/bundle/reachability).
- **Product B — the knowledge→git publish feature (`runGitExport`).** Reads `knowledge`, maps L2/L4 items to `products/…` / `factory/…` markdown, commits + pushes. Consumers are the HTTP routes + the boot-wired `knowledge_updated` handler (the composition root — which is why the census shows "0 service consumers").

### The floor (unified git-adapter op-count) = **17**

For an external-api adapter the floor is the **minimal coherent adapter surface over the external capability** — here, the distinct git operations the product actually drives, each behind a typed+whitelisted+token-injected argv seam.

**This is the ONE substrate where method-per-verb is correct, not sprawl.** Git's subcommands are genuinely heterogeneous (clone ≠ commit ≠ bundle ≠ worktree-add). A generic `git(args)` passthrough is the *worst* outcome: it re-opens the exact token/argv-leak class (`@lore AO1 v2`, security-review `git-export-runner.ts:64`) the package exists to close. So the floor is bounded by **distinct git ops actually driven**, and the discipline is applied by **deleting unused verbs**, not by collapsing safe distinct ops into an unsafe passthrough.

**Floor = `createGitRunner` factory (1) + the 16 verbs a real consumer or the export feature actually calls:**

| Verb | Driven by |
|---|---|
| `init` | export `ensureRepo` |
| `configSet` | export `ensureRepo` |
| `remoteAdd` | export `ensureRepo` |
| `add` | export + filesystems |
| `commit` | export + filesystems |
| `push` | export |
| `diffCached` | export + filesystems |
| `revParseIsInsideWorkTree` | export + filesystems |
| `lsFiles` | export `applyDeletions` + filesystems |
| `lsRemote` | filesystems reachability |
| `clone` | filesystems session mount |
| `bundle` | filesystems capture-back |
| `worktreeAdd` | filesystems session worktree |
| `worktreeRemove` | filesystems cleanup |
| `restoreStaged` | filesystems unstage |
| `currentBranch` | filesystems onboarding branch detect |

**Floor = 1 + 16 = 17.**

### Genuine owned capabilities beyond the floor = **5** (the export feature)

Product B is a genuine owned capability layered on the adapter + injected ports — not padding:

- `runGitExport(db, deps)` — the publish pipeline (ensureRepo → plan → write → delete → commit → push), one operation **parameterized by `deps.trigger` (event|manual|scheduled) + `deps.force`**.
- `registerGitExportHandler(db, eventBus, opts)` — the reactive trigger (debounced `knowledge_updated` → export). Returns a dispose fn.
- `readGitExportConfig` / `updateGitExportConfig` / `getLastExportMeta` — the config accessor (read redacted for HTTP; write validates its own patch; meta stamps). The config table is `settings`-owned, so this is an **accessor over an injected port**, not table ownership.

---

## 2. OUTSIDE-IN — real consumer demand (from the data)

- **`filesystems`** declares a `FilesystemsGitRunner` mirror of **exactly 12 verbs**: `add, commit, diffCached, revParseIsInsideWorkTree, lsFiles, lsRemote, clone, bundle, worktreeAdd, worktreeRemove, restoreStaged, currentBranch`. It composes agent-session flows (clone into sandbox, worktree add/remove, bundle capture-back, remote reachability) purely from these existing verbs — **0 new methods per new flow**.
- **HTTP routes** (`git-export-routes.ts`) call `readGitExportConfig`, `updateGitExportConfig`, `runGitExport`, `getLastExportMeta`, and `createGitRunner` (as the default runner factory). Routes **no longer import per-field sanitizers** — validation folded into `updateGitExportConfig`.
- **Boot wiring** (`server-factory.ts`) calls `registerGitExportHandler`.

Demand is a **coherent set**, not a method-per-caller spray: the 12 filesystems verbs are a subset of the 16-verb adapter; the routes hit one config accessor + one run op + one meta read.

---

## 3. THE COHERENT PRODUCT API (fusing both lenses)

### A. Git-execution adapter — `createGitRunner`  *(lens: both — floor)*
`createGitRunner(repoPath, opts?) → GitRunner` returning **16 typed, whitelisted, token-injected git verbs**. Inside-out: the minimal safe adapter over the git subprocess. Outside-in: exactly the ops `filesystems` (12) + the export feature (init/configSet/remoteAdd/push) drive. Types: `GitRunner`, `CreateGitRunnerOptions`, `GitConfigInjection`.

### B. Export operation — `runGitExport`  *(lens: both — genuine capability)*
`runGitExport(db, deps) → GitExportResult`, one op parameterized by `deps.trigger` + `deps.force`. Inside-out: owns the plan→write→commit→push pipeline as private stages. Outside-in: serves the `/run` route + the boot handler + a future scheduled/webhook trigger with **0 new methods**. Types: `GitExportResult`, `RunGitExportDeps`.

### C. Export event wiring — `registerGitExportHandler`  *(lens: inside-out)*
`registerGitExportHandler(db, eventBus, opts) → dispose`. The reactive trigger seam (debounced `knowledge_updated` → export). Type: `RegisterGitExportHandlerOptions`.

### D. Config accessor — read / update / meta  *(lens: both)*
`readGitExportConfig(db, deps)` (returns **redacted** `remoteUrl`, HTTP-safe), `updateGitExportConfig(db, patch, deps) → {ok:true,config}|{ok:false,reason}` (**validates its own patch** — all 7 sanitizers internal), `getLastExportMeta(db, deps)`. Inside-out: the writer owns its validation; outside-in: the exact surface the config/status/run routes drive. Types: `GitExportConfig`, `GitExportConfigPatch`, `UpdateGitExportConfigResult`, `LastExportMeta`.

### E. DI port bag — `GitExportDeps`  *(lens: inside-out)*
`GitExportDeps = { serverConfig: GitExportServerConfigPort, knowledge: GitExportKnowledgeReader }`. git-export owns 0 tables; it reaches `settings` + `knowledge` **only** through these injected ports (Table ACL — a service never imports another service). Structural-mirror types: `GitExportServerConfigPort`, `GitExportConfigSection`, `GitExportConfigSectionPatch`, `GitExportKnowledgeReader`, `GitExportKnowledgeItemRow`, `GitExportKnowledgeItemProjection`. These 7 are the **DI-seam tax** mandated by the no-cross-service-import rule, not sprawl.

---

## 4. TARGET NUMBERS

| | Current | Target |
|---|---|---|
| **Methods** | 24 | **22** (floor 17 + 5 export capabilities) |
| **Types** | 25 | **17** (10 product + 7 DI-port) |

**Floor = 17** (createGitRunner + 16 driven git verbs).

### DELETED (removed from the product, not internalized)
- **4 dead GitRunner verbs → DELETE from interface + real runner + fake:**
  - `rm` — zero callers (export deletes via `add([])` + `fs.unlinkSync`).
  - `statusPorcelain` — zero callers (export uses `diffCached`).
  - `fetch` — no real consumer; only exercised by `git-export-runner-fake.test.ts`.
  - `checkout` — no real consumer; only exercised by the fake unit test.
  - *(Test/story-only reachable code is dead → DELETE, not keep.)*
- **Type `GitExportConfigDeps`** (config sub-bag) → collapse into `GitExportDeps`.

### INTERNALIZED / moved off product surface (already done, kept)
7 sanitizers + `redactRemoteUrl` fold into `updateGitExportConfig`/`readGitExportConfig`; `computeExportPlan`, `buildCommitMessage`, `EXPORTED_KINDS`, `EXPORTED_STATUSES`, `createNodeFsAdapter`, `resetExportMutexes`, `loadGitExportConfig`, `writeLastCommit`, `writeLastPush`, and the `FakeGitRunner` doubles live in the `@hyperidle/git-export/testing` subpath — out of the counted product surface.

---

## 5. Lean AND complete — every real feature still deliverable

- **Agent-session git flows** (clone / worktree add+remove / bundle capture-back / remote reachability / unstage / branch detect) — all 12 filesystems verbs retained; composed, not per-flow methods.
- **Repo bootstrap** (init/configSet/remoteAdd) — retained (export `ensureRepo`).
- **Knowledge publish** (event / manual / scheduled / force) — one `runGitExport(trigger)` covers every occasion; a new trigger = a new enum value, 0 new methods.
- **Config CRUD over HTTP** (GET/PATCH/status/run) — `read` (redacted) / `update` (self-validating) / `getMeta` cover it.
- **Nothing lost:** the only removals (`rm`, `statusPorcelain`, `fetch`, `checkout`) have **zero real consumers** — deleting them removes fragmentation, not capability.

**Confidence: high** — every method traced to a live consumer or the export pipeline; every deletion proven dead by grep across the repo.
