# H1 — Git Export Routine: Implementation Plan

**Worktree:** `/workspace/.worktrees/H1` (branch `feat/H1-git-export-routine`)
**Story source:** `docs/work-packages/TRACK-H.md` §H1
**Depends on graph:** B1, G1. **G1 is NOT built.** Build H1 as a standalone service callable from any trigger source (scheduler, manual API, future facilitator). Do NOT couple H1 to a facilitator agent.

---

## 1. Context & acceptance criteria -> verification map

| AC | Verification |
|----|--------------|
| Human edit to L4 PRINCIPLES -> export runs, commits new `PRINCIPLES.md` | Integration test: subscribe to `knowledge_updated`, assert repo has new commit whose file matches body. |
| Commit message includes which items changed | Unit test on `buildCommitMessage()`; integration test greps last commit log. |
| No commit if no changes since last export | Integration test: run export twice, assert only one commit exists. |
| Exported markdown matches item body exactly | Integration test: read file from disk, `expect(fs.readFileSync).toBe(item.body)`. |
| Configurable: repo path, remote URL, branch | Unit test on config loader; integration test injects config and confirms it's honored. |

Additional invariants from architecture:
- **Layer compliance** (ARCHITECTURE.md): git export lives in the Meta Layer (Adapters). Triggered by event bus (`knowledge_updated`) or the routine scheduler. Never called from Human Interface; never called by agents directly.
- **Idempotent**: running twice in a row with no changes is a no-op (AC3).
- **Non-blocking**: export failure must NOT fail the knowledge write that triggered it. Async handler; errors go to structured log + optional rail item (future).

---

## 2. Constraints (fixed)

- TypeScript strict, Bun runtime, Vitest, Drizzle ORM (SQLite first, dual-driver via `@hyperidle/db`).
- Event bus is synchronous in-process (`@hyperidle/shared/event-bus`) with at-least-once semantics — emit AFTER DB durability.
- `factory_settings` is a `key/value/updatedAt` KV table (schema.ts:220). Reuse it; do NOT add a new table.
- Knowledge items live in `knowledge_items` with `layer` in `{L0..L4}`, `scope_id` (= product id for L2, null/"factory" for L4), `kind`, `body` as markdown.
- No `console.log` in production code — use the logger in `@hyperidle/shared`.
- No new framework deps unless justified. Spawn native `git` via `Bun.spawn` (see §7).
- H1 is backend-only. No UI budget spend.

---

## 3. Design

### 3.1 Data flow

```
 knowledge_updated event (emitted by POST/PATCH /api/knowledge)
        │
        ▼
 git-export-handler  (subscribes once at app boot, debounced)
        │
        ▼
 runGitExport({db, cfg, trigger})   ◄────── also callable from:
        │                                     - routine-scheduler (calendar)
        │                                     - POST /api/git-export/run (manual)
        ▼
 1. loadConfig(db)                     (factory_settings keys)
 2. ensureRepo(cfg.repoPath, ...)      (first-run init)
 3. computeExportPlan(db)              (pure)
 4. writeFiles(plan, cfg.repoPath)
 5. if (git diff --quiet) return {status:"noop"}
 6. git add -A; git commit -m <msg>; git push --set-upstream origin <branch>
 7. record last_export_at in factory_settings
 8. structured log; (optional) rail item on push failure
```

### 3.2 New files (with responsibilities)

- `packages/server/src/services/git-export.ts` — orchestrator. Exports:
  - `loadGitExportConfig(db): GitExportConfig | null`
  - `computeExportPlan(db): ExportPlan` (pure: list of file writes)
  - `runGitExport(db, deps): Promise<GitExportResult>` (main entry)
  - `registerGitExportHandler(db, eventBus, opts): () => void` (event subscription + debounce)
  - `buildCommitMessage(entries, now, trigger): string` (pure)
- `packages/server/src/services/git-export-runner.ts` — spawn wrapper around `Bun.spawn(["git", ...])`. Exposes a `GitRunner` interface so tests can inject a FakeGitRunner; production exports `createGitRunner(repoPath)`.
- `packages/server/src/services/git-export-config.ts` — config loader/validator with typed defaults, reads/writes `factory_settings`.
- `packages/server/src/routes/git-export-routes.ts` — Hono router mounted at `/api/git-export` (GET/PATCH `/config`, POST `/run`, GET `/status`).
- Tests:
  - `packages/server/src/__tests__/git-export.test.ts` — unit with FakeGitRunner + in-memory FsAdapter.
  - `packages/server/src/__tests__/git-export.integration.test.ts` — real `git` against tmpdir.
  - `packages/server/src/__tests__/git-export-routes.test.ts` — route tests via createTestApp.

### 3.3 Files to modify

- `packages/server/src/app.ts` — register route and event handler at boot. Mirrors `registerPolicyEngine(options.db, eventBus)` around lines 75–76. Add `registerGitExportHandler(options.db, eventBus)` and `api.route("/git-export", createGitExportRoutes(options.db, eventBus))`.
- `packages/db/src/seed.ts` — add idempotent default config rows (enabled=false, no repo_path). Seed MUST NOT turn export on automatically; operator opts in.
- `packages/server/src/__tests__/api-scaffold.test.ts` — extend to assert `/api/git-export/*` is mounted and authenticated.
- No schema changes. No migration.

### 3.4 Data model changes

**None** — reuse `factory_settings` KV. Keys used:

| Key | Value | Default |
|-----|-------|---------|
| `git_export.enabled` | `"true" \| "false"` | `"false"` |
| `git_export.repo_path` | absolute filesystem path | *(unset)* |
| `git_export.remote_url` | any git URL or empty | *(unset)* |
| `git_export.branch` | branch name | `"main"` |
| `git_export.author_name` | string | `"HyperIdle Export"` |
| `git_export.author_email` | string | `"export@hyperidle.local"` |
| `git_export.debounce_ms` | integer-as-string | `"2000"` |
| `git_export.last_export_at` | ISO timestamp | *(written by service)* |
| `git_export.last_commit_sha` | SHA-1 hex | *(written by service)* |

### 3.5 Public API surface

**Service signatures:**
```ts
export interface GitExportConfig {
  enabled: boolean;
  repoPath: string;
  remoteUrl: string | null;
  branch: string;           // default "main"
  authorName: string;
  authorEmail: string;
  debounceMs: number;       // default 2000
}

export interface ExportPlanEntry {
  relPath: string;          // e.g. "factory/PRINCIPLES.md", "products/nimmly/BRIEF.md"
  body: string;
  knowledgeItemId: string;
  layer: "L2" | "L4";
  kind: string;             // e.g. "PRINCIPLES", "BRIEF", "REFLECTION"
  scopeId: string | null;
  version: number;
  title: string;
}

export interface ExportPlan { entries: ExportPlanEntry[]; }

export type GitExportResult =
  | { status: "disabled" }
  | { status: "noop";      reason: "no-changes" | "debounced" }
  | { status: "committed"; commitSha: string; filesChanged: string[]; message: string }
  | { status: "pushed";    commitSha: string; filesChanged: string[]; message: string }
  | { status: "error";     error: string; phase: "init" | "write" | "commit" | "push" };

export function loadGitExportConfig(db: HyperIdleDb): GitExportConfig | null;
export function computeExportPlan(db: HyperIdleDb): ExportPlan;
export async function runGitExport(
  db: HyperIdleDb,
  deps: { runner: GitRunner; fs: FsAdapter; now?: () => Date; logger?: Logger; trigger?: "event"|"manual"|"scheduled" }
): Promise<GitExportResult>;
export function registerGitExportHandler(
  db: HyperIdleDb,
  eventBus: EventBus,
  opts?: { debounceMs?: number; now?: () => Date; runner?: GitRunner; fs?: FsAdapter }
): () => void;
export function buildCommitMessage(
  entries: ExportPlanEntry[],
  now: Date,
  trigger: "event" | "manual" | "scheduled"
): string;
```

**HTTP API (under `/api/git-export`, behind authMiddleware):**
```
GET    /config     -> GitExportConfig (sanitized)
PATCH  /config     body: Partial<GitExportConfig> -> GitExportConfig
POST   /run        body: { trigger?: "manual" | "scheduled", force?: boolean } -> GitExportResult
GET    /status     -> { enabled, repoPath, branch, lastExportAt, lastCommitSha? }
```

Validation via `validateBody(zod)` pattern already used across routes.

### 3.6 Export layout on disk

```
<repoPath>/
├── factory/
│   ├── PRINCIPLES.md        (layer=L4, kind=PRINCIPLES)
│   ├── FOCUS.md             (layer=L4, kind=FOCUS)
│   ├── PORTFOLIO.md         (layer=L4, kind=PORTFOLIO)
│   └── REFLECTIONS/
│       └── <YYYY-MM>.md     (layer=L4, kind=REFLECTION, topic=YYYY-MM)
└── products/
    └── <scope_id>/
        ├── BRIEF.md         (layer=L2, kind=BRIEF)
        ├── ARCHITECTURE.md  (layer=L2, kind=ARCHITECTURE)
        ├── BRAND.md         (layer=L2, kind=BRAND)
        └── PRINCIPLES.md    (layer=L2, kind=PRINCIPLES)
```

### CONFUSION: `kind` casing for L2/L4 knowledge items
I'm uncertain about: whether existing L2/L4 rows use `kind = "PRINCIPLES"` (upper) or `"principles"` (lower). Schema is plain `text`. Seed does not yet insert L2/L4 example rows.

Options:
A) `computeExportPlan` does a case-insensitive match on `kind.toUpperCase() in {BRIEF, ARCHITECTURE, BRAND, PRINCIPLES, FOCUS, PORTFOLIO, REFLECTION}` — tolerant.
B) Enforce one canonical casing now — tighter but brittle.

Proceeding with (A). Flag for review when B1/G-track settles `kind` conventions.

### 3.7 Commit message format

```
docs(knowledge): export <N> item(s) [<trigger>]

<layer> <kind> [<scope>] (v<version>): <short title>
<layer> <kind> [<scope>] (v<version>): <short title>
...

Trigger: <event|manual|scheduled>
Source: HyperIdle Git Export
```

Example:
```
docs(knowledge): export 2 item(s) [event]

L4 PRINCIPLES [factory] (v7): Ship every Friday
L2 BRIEF [nimmly] (v3): Ambient intelligence for small teams

Trigger: knowledge_updated
Source: HyperIdle Git Export
```

`buildCommitMessage()` is a pure function, unit-testable in isolation (AC2 verification).

### 3.8 Change detection (AC3: no-op if unchanged)

Two layers:
1. **Pre-write**: skip any `ExportPlanEntry` whose `fs.readFileSync(relPath)` already equals `body` byte-for-byte.
2. **Post-write (authoritative)**: run `git diff --quiet HEAD`. If clean, return `{status:"noop", reason:"no-changes"}` without committing. This catches git-level equivalence (e.g. line-ending normalization).

### 3.9 Debounce (event-driven trigger)

The `knowledge_updated` handler filters early:
```
if (layer !== "L2" && layer !== "L4") return;
if (!EXPORTED_KINDS.has(kind.toUpperCase())) return;
```
Then schedules a debounced run: `setTimeout(() => runGitExport(...), debounceMs)`. A pending timer is cleared and reset on each new event so a burst of edits produces one commit.

@lore: debounce lives in-memory in the handler closure. If the server restarts mid-burst, the last export may not happen until the next event. Acceptable for v1 — document in code.

### 3.10 Concurrency

In-process async mutex (promise chain) inside `runGitExport`. Overlapping calls queue. Multi-node against the same repo is out of scope in v1 (single-node assumption).

### 3.11 First-run repo init

If `cfg.repoPath` exists but is not a git repo (`git rev-parse --is-inside-work-tree` fails):
1. `git init -b <branch>`
2. Set `user.name` / `user.email` locally.
3. If `remoteUrl` set: `git remote add origin <remoteUrl>`; `git fetch origin`; if `origin/<branch>` exists, `git reset --hard origin/<branch>`.
4. Otherwise proceed with empty repo.

If `cfg.repoPath` does not exist: `mkdir -p` then init.

---

## 4. Trade-offs

**Event-triggered AND calendar-triggered.** AC says "Human edit … Git export runs" — demands event-driven. We also want nightly backup even without edits. Plan supports both: `knowledge_updated` handler + `POST /run` callable by routine scheduler. Cost: two entry points. Gain: matches AC and the "Git is the history" principle from KNOWLEDGE_ARCHITECTURE.md §L4.

**Debounce vs. immediate.** Immediate = noisy history; debounce (~2s) = coalesced, readable commits. Chosen: debounce. Cost: ~2s window where a crash delays the commit until the next event.

**Native `git` vs. `isomorphic-git`.** See §7.

**Pure `ExportPlan` vs. streaming writes.** Pure plan is trivially testable (AC4 = 3-line test). Cost: holds all bodies in memory (~200KB worst case for full L2+L4). Acceptable.

---

## 5. Sequencing (each step independently testable)

1. **Config loader** (`git-export-config.ts`)
   - Tests: `loadGitExportConfig_returnsNullWhenDisabled`, `loadGitExportConfig_defaultsBranchToMain`, `loadGitExportConfig_returnsTypedShape`.
2. **Commit message builder** (`buildCommitMessage`)
   - Tests: `buildCommitMessage_listsEachChangedItem`, `buildCommitMessage_includesTrigger`, `buildCommitMessage_handlesSingleEntry`.
3. **Export plan** (`computeExportPlan`) — pure over `knowledge_items`.
   - Tests: `computeExportPlan_mapsL4PrinciplesToFactoryPrinciplesMd`, `computeExportPlan_mapsL2ByScope`, `computeExportPlan_mapsReflectionsByTopic`, `computeExportPlan_ignoresL0L1L3`, `computeExportPlan_ignoresUnknownKinds`, `computeExportPlan_bodyMatchesExactly` (AC4).
4. **GitRunner seam** (`git-export-runner.ts`) and a FakeGitRunner for tests.
5. **Orchestrator** (`runGitExport`) — unit tests with FakeGitRunner + in-memory fs.
   - Tests: `runGitExport_disabledReturnsDisabled`, `runGitExport_noChangesReturnsNoop` (AC3), `runGitExport_commitsChangedFiles` (AC1), `runGitExport_commitMessageListsItems` (AC2), `runGitExport_pushesWhenRemoteConfigured`, `runGitExport_returnsErrorOnPushFailure`, `runGitExport_firstRunInitializesRepo`, `runGitExport_concurrentCallsSerialized`, `runGitExport_honorsCustomBranch` (AC5), `runGitExport_honorsCustomRepoPath` (AC5), `runGitExport_writesLastExportAt`.
6. **Integration test** (`git-export.integration.test.ts`) — real `git` against tmpdir (highest-fidelity AC proof).
7. **Event handler** (`registerGitExportHandler`).
   - Tests: `handler_ignoresNonL2L4`, `handler_ignoresUnknownKind`, `handler_debouncesBursts`, `handler_firesExportAfterDebounce`, `handler_unsubscribeStopsFurtherRuns`.
8. **Route module** (`git-export-routes.ts`) + app mount.
   - Tests: `GET_config_requiresAuth`, `PATCH_config_validatesWithZod`, `POST_run_returnsResult`, `POST_run_respectsForceFlag`, `GET_status_returnsLastExportAt`.
9. **Seed update + api-scaffold.test.ts** amend.
10. `bun run check` + `bun run lint` + `bun run test` green.

TDD red phase first at every step (CLAUDE.md First Principle).

---

## 6. Test strategy

**Unit tests** (`git-export.test.ts`):
- FakeGitRunner records calls (`[["init"], ["add","-A"], ["commit","-m",msg], ["push","--set-upstream","origin",branch]]`).
- In-memory FsAdapter (`Map<string, string>`) — seam so unit tests don't touch disk.
- `computeExportPlan` seeded via `createTestDb()` + direct inserts into `knowledge_items`.
- `buildCommitMessage` tested as pure function.
- Debounce tested with `vi.useFakeTimers()`.

**Integration tests** (`git-export.integration.test.ts`):
- `node:fs` + `os.tmpdir()` + `crypto.randomUUID()` for throwaway dir per test.
- Create a bare "remote" repo: `git init --bare <remoteDir>`.
- Point `remoteUrl` to `file://<remoteDir>` (no network, no auth).
- Real `Bun.spawn(["git", ...])` runner.
- Fixtures: helpers `seedL4Principles(db, body)` and `seedL2Brief(db, productId, body)` in the test file.
- Assertions per AC:
  - `AC1`: insert L4 PRINCIPLES item -> `runGitExport` -> `<repoPath>/factory/PRINCIPLES.md` exists and equals body; `git log --oneline` has 1 entry; bare remote contains the commit after push.
  - `AC2`: parse last commit message; assert substring `L4 PRINCIPLES [factory]`.
  - `AC3`: call `runGitExport` again -> `{status:"noop"}`; `git log --oneline | wc -l` unchanged.
  - `AC4`: `fs.readFileSync(...).toString() === body` (byte-exact).
  - `AC5`: three tests parametrized over `repoPath`, `remoteUrl`, `branch`; assert paths, `git remote -v`, `git symbolic-ref HEAD`.
- Cleanup in `afterEach`: `rm -rf` tmpdirs.

**Route tests** (`git-export-routes.test.ts`):
- `createTestApp` pattern (see `api-scaffold.test.ts`). Assert 401 without auth, 200 with, payload shapes.

**Coverage target:** 100% of lines in `git-export*.ts`. Run `bun run test:coverage`.

---

## 7. Library choice: spawn native `git`

**Decision: spawn native `git` via `node:child_process.spawn`. Do NOT add `isomorphic-git`.**

_DEFERRED (review follow-up):_ the original plan said `Bun.spawn`. We're using
`node:child_process.spawn` instead so that Vitest-under-Node and Bun's runtime
execute the same code path; Bun provides the Node compat shim for
`child_process`. The security review's hardened env + credential scrubbing
apply identically. This footnote is the canonical source of truth; `Bun.spawn`
remains an option if we ever need abort-signal plumbing or typed exit codes.

Rationale:
- The repo is already a git repo; native `git` on PATH is not a new constraint. All H4 deployment profiles assume a posix toolchain.
- `isomorphic-git` adds ~100KB + a parallel implementation of git semantics we'd have to maintain (refspecs, hooks, signing).
- Push auth: `isomorphic-git` requires HTTP credential code; spawning `git` reuses the user's credential helper (`~/.git-credentials`, ssh-agent, GH_TOKEN). Major UX + security win.
- Shelling out composes with the observability adapter (stdout/stderr already framed).
- Downside: each command is a subprocess (~5–20ms on Linux). Negligible at our cadence.

Safety guards in the spawn wrapper:
- Never pass user-controlled strings as command args; all args typed + whitelisted in `GitRunner`.
- Always pass explicit `cwd: cfg.repoPath`.
- Set env `GIT_TERMINAL_PROMPT=0` so auth failures error immediately instead of hanging on a prompt.
- Timeouts: 30s for push, 5s for local ops.

⚠️ UNVERIFIED: Bun 1.x `Bun.spawn` stdin/stderr piping and exit code shape. Verify against https://bun.sh/docs/api/spawn before implementation. Confirm `await proc.exited` yields `number` (not `{code, signal}`).

@lore will be captured on `runner.push` documenting `GIT_TERMINAL_PROMPT=0` rationale.

---

## 8. Edge cases (each has a test)

1. **Empty DB / no L2 or L4 items** — `computeExportPlan` returns empty; `runGitExport` short-circuits to `noop` without touching disk.
2. **No-op export (AC3)** — run twice; second is `{status:"noop", reason:"no-changes"}`.
3. **Concurrent exports** — two simultaneous calls serialize via mutex; no overlapping commits.
4. **Push failure** — unreachable remote or auth fails -> commit still created locally; return `{status:"error", phase:"push"}`; log; (future) create rail item once H2 lands.
5. **Missing remote** — `remoteUrl == null` -> commit only; return `{status:"committed"}` not `"pushed"`.
6. **First-run init** — `repoPath` doesn't exist -> mkdir + init + (optional) fetch-reset to remote branch tip.
7. **Config disabled** — `enabled=false` -> `{status:"disabled"}` from event handler. Manual `POST /run` accepts `force: true` to override (useful for initial setup test).
8. **Body unchanged after version bump** — git sees no change -> `{status:"noop"}`.
9. **Unicode / large body** — L4 REFLECTION with emojis + 100KB — assert exact byte roundtrip.
10. **Multiple REFLECTIONS/** — per-month files written separately, not overwritten.
11. **L2 product archived** — v1: we do NOT `git rm` stale files; test asserts no delete attempted. Open question below.
12. **Custom branch** — `cfg.branch = "docs"` -> commit on that branch; push uses `--set-upstream origin docs`.
13. **Debounce window** — three events within 2s -> one export; one event outside window -> second export.
14. **Event for non-exported layer (L1)** — handler returns early; no disk access, no spawn.

---

## 9. Security & layer compliance

- Service lives in `packages/server/src/services/` — Meta Layer. ✓
- Human Interface never calls git directly; it calls `POST /api/git-export/run`. ✓
- Agent Runtime never calls git-export; agents write knowledge, the event bus triggers it. ✓
- Repo path config is operator-set (factory_settings), NOT user-tenant-controlled — no path traversal surface from API. PATCH `/config` validates absolute paths + rejects `..` segments.
- Commit author defaults to a synthetic identity; real human identity is NOT leaked into commits in v1. Configurable via `git_export.author_*` keys.

A fuller threat model would run via `/threat-model` after implementation.

---

## 10. Open questions (human decision)

1. **Deletion semantics.** When an L2 knowledge item is archived/deleted, should we `git rm` its `.md`? v1: no (additive export). Follow-up story.
2. **Manual edits in the exported repo.** If a user hand-edits `PRINCIPLES.md` in the repo, our next export overwrites it. v1: document "export-only" semantics. A later story could reverse-import edits.
3. **Signing.** GPG signing commits? v1: no (`--no-gpg-sign` not forced). Operator-controlled via their own git config.
4. **Multi-remote.** v1 supports one remote. Multi-remote mirror (GitHub + GitLab) is a future story.
5. **Seed a default nightly routine?** Plan says no — operator creates it via `/api/routines`. Flag for review.

---

**End of plan.**
