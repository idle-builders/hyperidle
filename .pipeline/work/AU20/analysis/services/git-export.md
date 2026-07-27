# git-export — Service-as-Product Analysis (AU20)

Layer: core-api · Current public exports: **47** · Owned tables: **0** · Service consumers: **1** (`filesystems`)

## 1. Existence / Consolidation Verdict — **STANDALONE** (reject fold-into-filesystems)

The package is honestly **two products in one barrel**, and naming it "git-export" hides the more important one:

- **Product A — the git-execution platform (`GitRunner`).** A single hardened, security-audited seam over the `git` subprocess: env allow-list (drops `HYPERIDLE_API_KEY`/`credential.helper`), `GIT_CONFIG_*` token injection that never touches argv/URL, argv redaction, `-b/--`/leading-`-` guards. Value delivered to **`filesystems`** (agent-session clone/worktree/bundle/reachability — 12 verbs) **and** to Product B. This is a real platform/framework product with a genuine second consumer.
- **Product B — the knowledge→git publish feature (`runGitExport` + config).** Reads `knowledge`, maps L2/L4 items to `products/…`/`factory/…` markdown, commits+pushes. Config lives in `server_config.gitExport` (borrowed from `settings` via DI). Its consumers are the HTTP routes in `packages/server` (GET/PATCH `/config`, `/status`, `/run`) + the boot-wired `knowledge_updated` handler — the data package shows 0 *service* consumers precisely because routes and boot-wiring are the composition root, not peer services.

**Why the data package looks like "0-table, 1-consumer utility":** the only service→service edge counted is `filesystems→GitRunner`. That undercounts Product B entirely (its consumers are routes) and mislabels the whole package as "the GitRunner filesystems needs."

**Reject the `filesystems` fold.** GitRunner is a shared primitive consumed by BOTH `filesystems` and Product B, which are core-api peers. Folding GitRunner *into* `filesystems` would force the knowledge-publish feature to depend on `filesystems` (a session-runtime concern) merely to spawn `git` — an inverted, meaningless dependency. And Product B (knowledge read + export config + markdown mapping) has nothing to do with agent-session working directories. The candidate-cluster hypothesis ("just the GitRunner utility filesystems needs") is **false**: it ignores the live publish feature and the shared-platform role.

**Latent split, deliberately NOT taken (MVP).** A purist "one service = one product" read would extract `git-runner` (platform) from `git-export` (feature). I decline: both live at ~1800 LOC in one package, `filesystems` + routes both import from one place, and splitting adds boundary ceremony with zero consumer benefit at MVP tier. Keep one package; shape the API around the two internal products.

## 2. Deliberate Target Public API (47 → ~20)

Five coherent surfaces. The collapse comes almost entirely from **internalizing the per-field sanitizer sprawl and the orchestration internals** that leaked out only for tests/defense-in-depth.

### A. Git-execution platform — `GitRunner`
- `createGitRunner(repoPath, opts?)` + types `GitRunner`, `CreateGitRunnerOptions`, `GitConfigInjection`. **(4)**
- **Note on GitRunner's ~22 methods:** this is the ONE place where method-per-verb is *correct*, not sprawl. Each verb (`add`, `commit`, `clone`, `bundle`, `worktreeAdd`, `lsRemote`…) exists so argv is typed + whitelisted + token-injected safely. A generic `git(args)` passthrough would destroy the exact security seam the `@lore` warns about (token/argv leak to `ps`/logs). The method set is bounded by the git subcommands the app actually runs — not by the number of consumers.
- Test doubles `createFakeGitRunner`, `FakeGitRunner`, `FakeGitCall` → move to a `@hyperidle/git-export/testing` subpath. They are cross-package test utilities, not product API — out of the counted product surface.

### B. Export operation — `runGitExport`
- `runGitExport(db, deps)` — the single publish entry, **parameterized by `deps.trigger` (`event|manual|scheduled`) and `deps.force`**. One method serves all three trigger occasions. Types `GitExportResult`, `RunGitExportDeps`. **(3)**
- Subsumes/internalizes: `computeExportPlan`, `buildCommitMessage`, `EXPORTED_KINDS`, `EXPORTED_STATUSES`, `createNodeFsAdapter` (make it the default `fs`), `resetExportMutexes` (test-only), `ExportPlan`/`ExportPlanEntry`/`FsAdapter`/`GitExportTrigger` types — all are internal mechanics of one operation, exported today only for unit tests or a preview route that can call `runGitExport` in a dry mode.

### C. Export event wiring — `registerGitExportHandler`
- `registerGitExportHandler(db, eventBus, opts)` + type `RegisterGitExportHandlerOptions`. Boot-wiring seam (debounced `knowledge_updated` → export). **(2)**

### D. Export config accessor — read / update / meta
- `readGitExportConfig(db, deps)`, `updateGitExportConfig(db, patch, deps)`, `getLastExportMeta(db, deps)` + types `GitExportConfig`, `GitExportConfigPatch`, `LastExportMeta`. **(6)**
- **Validation folds inward.** `updateGitExportConfig` validates the whole patch itself and returns ok/error; `readGitExportConfig` returns an already-redacted `remoteUrl`. This internalizes **all 7 sanitizers** (`sanitizeRepoPath`, `sanitizeRemoteUrl`, `sanitizeBranch`, `sanitizeAuthorName`, `sanitizeAuthorEmail`, `sanitizePathSegment`, `redactRemoteUrl`) + `loadGitExportConfig`, `writeLastCommit`, `writeLastPush` (all runGitExport-internal). Routes stop reaching in for per-field validators — a config writer that owns its section validates its own writes.

### E. DI port bag — `GitExportDeps`
- `GitExportDeps`, and the two implementable port interfaces `GitExportServerConfigPort` (→`settings`) + `GitExportKnowledgeReader` (→`knowledge`), plus the shapes they reference (`GitExportConfigSection`, `GitExportConfigSectionPatch`, `GitExportKnowledgeItemRow`, `GitExportKnowledgeItemProjection`). **(~5–7)** — structurally required so the composition root can implement the adapters; `GitExportConfigDeps` (a sub-bag of `GitExportDeps`) collapses away.

**Target: ~20 product exports** (down from 47), + a 3-symbol test-only subpath.

## 3. Inside Lens (evolvability)

- **Two internal modules, one clean seam each.** `runner.ts` owns the security boundary; `export.ts` owns the publish pipeline (plan → write → commit → push) as private stages; `config.ts` owns the `server_config.gitExport` section + its validation. A behaviour change (new exported kind, new commit-message format, a debounce tweak) touches exactly one private module and adds **zero** exports.
- **Validation lives with the writer, not the caller.** Folding sanitizers into `updateGitExportConfig` means a new config field is validated in one place; no route learns a new sanitizer name.
- **GitRunner's allow-list is the feature, not a limit.** Keeping each git verb explicit keeps the token/argv-leak class impossible to reintroduce by a careless caller.

## 4. Scaling Argument (sub-linear)

Add dozens of services and hundreds of calls:
- **New git *consumer*** (say a future `mirror` feature) composes from the existing `GitRunner` verbs — **0 new methods**. Only a genuinely new git *subcommand* adds one method, and that's correct (it needs its own safe argv construction). Growth is bounded by distinct git operations (a small finite set), not by consumers → sub-linear.
- **New export trigger** (a cron "scheduled" run already exists; a webhook trigger next) → a new value of `deps.trigger`, **0 new methods**. Contrast the failed shape: `runScheduledExport` / `runWebhookExport` / `runManualExport`.
- **New config field** → validated inside `updateGitExportConfig`, **0 new exports**. Contrast the current shape: one `sanitizeX` export per field (7 today) — pure method-per-intent sprawl that grows linearly with fields.

The parameterized `runGitExport(trigger)` + `update(patch)` shapes absorb new occasions; the current `sanitize*`-per-field + `compute/build/reset` helper spray does not.

## 5. Key Collapses

1. **7 exported sanitizers + `redactRemoteUrl` → 0 public.** Fold into `updateGitExportConfig` (validates patch) and `readGitExportConfig` (returns redacted). Biggest single win; kills the poster-child method-per-field sprawl.
2. **6 orchestration internals → private:** `computeExportPlan`, `buildCommitMessage`, `EXPORTED_KINDS`, `EXPORTED_STATUSES`, `createNodeFsAdapter` (becomes default), `resetExportMutexes` (test-only).
3. **`loadGitExportConfig`, `writeLastCommit`, `writeLastPush` → private** (runGitExport-internal); config surface shrinks to read/update/getMeta.
4. **Test doubles (`createFakeGitRunner`, `FakeGitRunner`, `FakeGitCall`) → `/testing` subpath**, out of the product API.
5. **Trigger variants unified** under `runGitExport(deps.trigger)` — one operation, not three.

Net: 47 → ~20 product exports, and the package's true shape (a git-execution *platform* + a knowledge-publish *feature* on top of it) becomes legible instead of hidden behind a flat 47-symbol barrel.
