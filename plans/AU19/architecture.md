# AU19 — Architecture: Applications · Layers · Services

**Type:** framework · **Complexity:** L (~8–10d, multi-session build) · **Supersedes:** AU8 + AU17
**Depends on:** AU12–AU16, AU18 (all merged). **Gates:** Refinement — done (`plans/AU19/requirements.md`, commit `a373cb5f`). Design — N/A (no UI). Human concept review — No.
**Locked inputs:** `plans/AU19/requirements.md` · `plans/AU19/concept.html` (founder-approved DWG AU19-001) · `docs/architecture/runtime-simplification.md` §"Applications, Layers, and Services" · `.pipeline/work-packages/TRACK-AU.md` §AU19.

> **Read this first — resumability contract.** This build spans multiple pipeline sessions. It is cut into **Increment 0** (the minimal-slice enforcement proof — a HARD GATE, must land and be green before anything else) and **Increments 1–5** (bulk migration, one Layer/Service group each). A builder resuming mid-WP determines "done vs pending" from **git history + the increment checklist in §12**, never from a prior session's context. Each increment ends on green `npm run check && npm run lint && npm run test` and is a single logical commit. Do not start increment N+1 until increment N is green and committed.

---

## 1. Context

`packages/server` is one npm workspace package of **240 production `.ts` files**. Domain ownership was carved out incrementally (AU12–AU18) but *location still declares nothing*: `services/` is a flat 82-file dump mixing SQL-owning domain modules (`work-service.ts`, `conversation-store.ts`) with agent-orchestration lifecycle code (`agent-run-boundary.ts`, `context-assembly.ts`) with execution-support (`cost-cap.ts`). Nine hand-typed AST guard scripts (`au10`…`au18`) enforce ownership; each has a scan-root that silently goes blind when files move (this failure hit twice building AU17).

AU19 turns location into a mechanically-enforced contract via a **two-level package hierarchy** — 4 thin Layer packages composing ~30 Service packages nested at `packages/<layer>/<service>/` — plus **three** `tsc`/dependency-resolution-enforced mechanisms (Table ACL, Execution boundary, Composition boundary). AU17 (PR #447, closed unmerged) already proved the package-boundary technique works and produced a verified acyclic classification; its two-package split is re-cut here against the new four-Layer / N-Service taxonomy.

## 2. Constraints (carried from spec + refine, not re-litigated)

- One npm workspace package **per Service**, nested `packages/<layer>/<service>/` — never a folder in 4 monolithic Layer packages.
- A SQL-owning Service's barrel (`src/index.ts`) **never exports its raw Drizzle table object** — typed functions only.
- The residual Table-ACL guard is **one general declarative check** (a `TABLE_OWNER` map), replacing the nine hand-typed per-domain scripts — not a tenth instance.
- **No Service package depends on another Service package or a Layer package.** A Service's `dependencies` = `@hyperidle/db` + `@hyperidle/shared` only. Cross-Service wiring is the owning **Layer**'s job; cross-**process** wiring (orchestration↔execution) is the **Application**'s job.
- Only `agent-execution` Services may import an LLM-CLI / harness-adapter / MCP-bridge / tool-execution symbol.
- `agent-execution` holds **zero** Service/table reference of any kind (incl. `knowledge`) — it receives an assembled context bundle, returns raw output over the existing worker channel.
- `remote-server` **never** composes `agent-execution`, unconditionally.
- `core-ui` (`packages/web`) internal reorg is **deferred** — it participates only as a Layer boundary (Mechanisms B + C apply; no internal Service mirroring).
- **Zero allowlist exceptions** for cross-owned-table access — decompose into one call per owning Service.
- **No behavior change** in any topology. The one sanctioned signature change: an exported function gains a DI parameter instead of importing another Service (Mechanism C).
- AU8 + AU17 stay marked superseded in the manifest + track file.

## 3. The four Layers, four Applications, composition schedule (locked)

| Application | core-ui | core-api | agent-orchestration | agent-execution |
|---|:--:|:--:|:--:|:--:|
| `desktop` | ● | ● | ● | ● |
| `remote-server` | — | ● | ● | — |
| `ui` | ● | — | — | — |
| `remote-worker` | — | — | — | ● |

Downward-only dependency: `core-ui → core-api → agent-orchestration → agent-execution`. The one cross-**process** seam (`agent-orchestration` dispatching a run to `agent-execution`) is **not** a package dependency — it is a `HarnessPort` interface (see §7) the Application injects.

---

## 4. Layer / Service roster (final for this WP; a floor, refinable during migration)

Legend: **⛁** = SQL-table owner (Table-ACL-enforced). Package name = `@hyperidle/<service>` at path `packages/<layer>/<service>/`. Layer packages are `@hyperidle/core-ui|core-api|agent-orchestration|agent-execution`.

### core-ui Layer — **not decomposed** (deferred, Q4)
`packages/web` **is** the `core-ui` Layer package (rename `@hyperidle/web` → `@hyperidle/core-ui` is optional cosmetic; **recommend keeping `@hyperidle/web`** to avoid ~200 import-churn edits for zero enforcement gain — the Layer boundary is enforced by *what it's allowed to depend on*, not its name). No internal Service packages this WP.

### core-api Layer — 17 Services

| Service | ⛁ | Owns table(s) | Seed files (current path → new package) |
|---|:--:|---|---|
| `knowledge` | ⛁ | `knowledgeItems`, knowledge projections, FTS | `knowledge/*` (15) — **`search` folds in here** (FTS is `knowledge/fts.ts`) |
| `work` | ⛁ | bets, tasks, items, artifacts | `work-service.ts`, `services/bet-*.ts`, `services/task-*.ts`, `services/item-router.ts` |
| `conversation` | ⛁ | threads, messages | `services/conversation-store.ts` |
| `users` | ⛁ | users | `services/user-store.ts`, `services/login-session.ts`, `services/invite-code.ts`, `auth/upgrade-token-store.ts` |
| `settings` | ⛁ | `server_config` | `services/server-config.ts`, `services/plugin-configuration.ts`, `services/agent-behavior-config.ts` |
| `notifications` | ⛁ | `notificationQueue` | `notifications/*` (15) |
| `routine` | ⛁ | routines, routine_runs | `routine-service.ts`, `routines.ts` |
| `connections` | ⛁ | `server_credentials`, service_connections | `services/connection-provisioning.ts`, `credential-encryption.ts`, `credential-resolver.ts`, `service-connection-projection.ts`, `service-connection-resolver.ts` |
| `org` | ⛁ | teams, org edges | `services/org-edges.ts`, `org-routing.ts`, `team-lookup.ts`, `team-default-harness.ts`, `scaffold-agents.ts` |
| `review` | ⛁* | reviews / proposed-calls (confirm table at migration) | `services/review-item-factory.ts`, `session-review-creator.ts`, `proposed-call-workflow.ts`, `practice-meeting.ts` |
| `policy` | ⛁* | trust verdicts / approval (confirm) | `services/policy-engine.ts`, `approval-rate.ts`, `handoff-protocol.ts`, `lifecycle-propagation.ts` |
| `git-export` | — | (config on `server_config`) | `services/git-export.ts`, `git-export-runner.ts`, `config/git-export-config.ts` |
| `observability` | — | (config on `server_config`) | `services/observability/*` (4) |
| `model-gateway` | — | (config on `server_config`) | `services/model-gateway.ts` |
| `filesystems` | ⛁* | filesystems/mounts (confirm) | `filesystem/*` (8), `services/file-watcher.ts`, `filesystem-reachability.ts`, `inspect-local-path.ts`, `dependency-watcher.ts` |
| `realtime` | — | — | `services/ws-broadcaster.ts` (core→ui event push) |
| `retention` | — | — | `services/retention-reaper.ts` (cross-domain GC; candidate to fold — see §9) |

`⛁*` = **architecture finding to confirm at its increment**: `review`/`policy`/`filesystems` may own tables; if a module only *reads other Services' tables* it is a non-SQL orchestration Service and its table access becomes DI. The migration's first task per Service is `grep` its `pgTable` ownership.

### agent-orchestration Layer — 10 Services

> **Finding (corrects the concept diagram's "orchestration owns no tables").** The durable-handoff tables (`agent_work_intents`, `agent_session_requests`, `agent_lifecycle_inbox`) live in orchestration. So `session-requests` and `lifecycle-projection` **are** SQL-owning and Table-ACL applies. The spec's own AC-9 (close `agent_work_intents` ownership) confirms this — it cannot be simultaneously true that orchestration owns no table *and* that `agent_work_intents` gets a `TABLE_OWNER` entry.

| Service | ⛁ | Owns | Seed files |
|---|:--:|---|---|
| `trigger-resolution` | — | — | `services/trigger-resolution.ts` |
| `session-requests` | ⛁ | `agent_work_intents`, `agent_session_requests` | `services/agent-session-requests.ts`, `agent-work-intents.ts`, `agent-work-intent-worker.ts`, `session-run-registry.ts` |
| `run-orchestration` | — | — | `services/agent-run-boundary.ts`, `agent-session-runtime.ts`, `agent-layer-boot.ts` |
| `lifecycle-projection` | ⛁ | `agent_lifecycle_inbox` (confirm) | `services/agent-lifecycle-projectors.ts` |
| `agent-selection` | — | — | `services/agent-selection.ts`, `select-agent.ts`, `roster.ts`, `agent-defaults/resolvers.ts` |
| `context-assembly` | — | — | `services/context-assembly.ts`, `context-assembly-prompt.ts`, `session-context.ts`, `agent-context/assemble-context.ts` |
| `capture-writeback` | — | — | `services/writeback.ts`, `session-activity-buffer.ts` |
| `cost` | — | — | `services/cost-cap.ts`, `cost-sentinel.ts` |
| `dispatch` | — | — | `services/task-dispatcher.ts`, `assistant-dispatcher.ts`, `routine-scheduler.ts`, `builtin-routine-handlers.ts`, `agent-work-assistant.ts` |
| `session-lifecycle` | — | — | `services/session-provisioning.ts`, `session-lifecycle.ts`, `routine-session-reaper.ts`, `sandbox-reaper.ts` |

### agent-execution Layer — 3 Services (zero Service/DB access)

| Service | Seed files |
|---|---|
| `harness-registry` | `harness/*` (21) incl. `remote-harness-adapter.ts`, `llm-client.ts`, adapters; `services/harness-capability-read-model.ts` |
| `tool-provider` | `tools/*` (29) |
| `mcp-provider` | `mcp/*` (2), `services/mcp-route.ts` |

**Roster total: 30 Service packages + 1 undecomposed core-ui Layer** — within the ~25–35 the floor predicted.

---

## 5. File-by-file classification (all 240 production files)

Every production file lands in exactly one Service, one Layer-package composition root, one Application bootstrap, or the ambiguous-disposition table (§9). This re-cuts AU17's classification against the four-Layer taxonomy. The Service seed-file columns in §4 assign **207** files (the `harness/`, `mcp/`, `tools/`, `knowledge/`, `notifications/`, `filesystem/`, and the named `services/*` + top-level domain files). The remaining files are dispositioned here:

**Layer-composition-root / Application-bootstrap (not a Service):**

| File | Home | Why |
|---|---|---|
| `app.ts`, `server-factory.ts` | `@hyperidle/core-api` Layer package (composition barrel) | Wires routes + Services into the Hono app — Layer wiring, not a Service. |
| `index.ts` | `desktop` / `remote-server` Application bootstrap | Process entrypoint = Application. |
| `session.ts` | `@hyperidle/core-api` Layer (HTTP session middleware wiring) | Cross-Service HTTP concern. |
| `validate-env.ts` | Application bootstrap (shared boot util → `@hyperidle/shared`) | Env validation runs at process start. |
| `routes/*` (38) | `@hyperidle/core-api` Layer package | HTTP surface = the Layer's composition of its Services. Routes are **allowed** to import multiple core-api Services (they are the Layer doing composition) — but must not import a raw table (Table-ACL) nor an agent-execution symbol (Mechanism B). `routes/ws.ts`, `routes/workers.ts` are the orchestration/worker channel surface — see §7. |
| `middleware/*` (7), `auth/access-boundary.ts`, `auth/authorize.ts` | `@hyperidle/core-api` Layer package | HTTP infra. (`auth/upgrade-token-store.ts` → `users` Service, per §4.) |
| `schemas/*` (4) | `@hyperidle/api-contract` (or core-api Layer) | Shared request/response schemas — see §9. |
| `config/builtin-routines.ts` | `routine` Service (seed data) | Default routine records. |
| `config/builtin-tool-catalog.ts` | `tool-provider` Service (seed data) | Default tool catalog. |
| `config/git-export-config.ts` | `git-export` Service | Per §4. |

**Test infra (per-package or shared):** `test-fixtures.ts`, `test-utils.ts`, `vitest-setup.ts`, `harness/__tests__/require-harness.ts`, `tools/__tests__/_helpers.ts` → move into the owning Service's `src/__tests__/` or a shared `@hyperidle/test-utils` if imported cross-package (confirm consumers at migration).

## 6. Ambiguous-file disposition table (Q5 requirement — no default `shared` dumping)

Each of these has no single obvious domain. **None is defaulted into a flat `shared` bucket without a named reason.**

| File | Home | Reasoning |
|---|---|---|
| `services/ws-broadcaster.ts` | `realtime` Service (core-api) | Broadcasts domain events to UI clients — a core→ui push capability, not infra of any one domain. |
| `services/worker-ws.ts` | `run-orchestration` Service (orchestration side of the worker channel) | The server-side WS **host** that receives worker connections; it is the orchestration end of the `HarnessPort` cross-process seam (§7). The **client** (`remote-harness-adapter.ts`) is `harness-registry`. |
| `services/org-edges.ts` | `org` Service | Org graph is `org`'s owned data. |
| `services/credential-encryption.ts` | `connections` Service | Encrypts the secrets `connections` owns; sole consumer domain. |
| `services/model-gateway.ts` | `model-gateway` Service | Its own capability (model routing); reads `settings`+`connections` via DI. |
| `services/item-router.ts` | `work` Service | Routes work items — `work`'s domain. |
| `services/like-escape.ts` | `@hyperidle/db` (SQL util) | Escapes SQL `LIKE` wildcards; belongs with the DB query layer, used by any table doing text search. Zero-domain util. |
| `services/schedule-label.ts` | `routine` Service | Human-readable cron labels — `routine`'s concern. |
| `services/agent-utils.ts` | Split by callee; default `agent-selection` | Inspect exports at migration — if purely selection helpers → `agent-selection`; if cross-cutting agent identity types → `@hyperidle/shared`. **Do not bulk-move; read it first.** |
| `services/contracts.ts` | `@hyperidle/shared` (types only) | If it is pure TS interfaces shared across Services (verify — no runtime), it is the natural home for cross-Service DTOs. If it holds runtime, split. |
| `services/retention-reaper.ts` | `retention` Service (or fold — §9) | Cross-domain GC; keep as its own thin Service rather than smuggling deletes into each owner. |
| `write-executor.ts` | Inspect; likely `knowledge` or `@hyperidle/db` | A write executor — read its imports; if it wraps knowledge writes → `knowledge`; if generic DB tx helper → `@hyperidle/db`. Flagged, not defaulted. |
| `services/session-run-registry.ts` | `session-requests` Service | In-memory run registry keyed by request — sits with the request queue. |
| `services/harness-capability-read-model.ts` | `harness-registry` (execution) **read model** — but see finding | It projects harness capabilities. If it reads a DB table it violates zero-DB-execution → then it splits: the *projection storage* is core-api, the *capability descriptors* are execution. Resolve at Increment 4. |
| `services/session-activity-buffer.ts` | `capture-writeback` Service | Buffers run activity for writeback. |
| `services/session-context.ts` | `context-assembly` Service | Builds session context bundle. |

Any file surfaced during migration not covered here gets an **explicit row appended to this table in the same commit** — the disposition table is append-only, never a silent `shared` default.

---

## 7. Enforcement mechanism design

### 7.1 Mechanism A — Table ACL (one general guard replaces nine)

**Two tiers, as the frame specifies:**

1. **Structural (barrel discipline).** A SQL-owning Service's `src/index.ts` exports typed functions only, never re-exports a `pgTable` object. This blocks obtaining the table *transitively through the Service package*.
2. **General residual guard (the real enforcement).** `scripts/table-ownership-guard.ts` — **one** map-driven AST scan replacing `au10`–`au18`.

> **Critical finding — why barrel discipline alone is insufficient.** `@hyperidle/db` exports **every** table object, and every Service legitimately depends on `@hyperidle/db`. So `work` can still write `import { threads } from "@hyperidle/db"` and touch `conversation`'s table — the barrel discipline does not stop this. The general guard is therefore **load-bearing**, not merely residual. (Splitting `@hyperidle/db` so each table is exported only to its owner is a far larger change — explicitly out of scope; the guard is the pragmatic mechanism.)

**Guard design** (generalizes `au14-knowledge-ownership-guard.ts`'s AST technique — the `.from/.insert/.update/.delete/.leftJoin/.innerJoin/.rightJoin/.fullJoin(<bareTableIdentifier>)` matcher — from one file/one table to a repo-wide map):

```ts
// scripts/table-ownership-guard.ts  — the SINGLE source of truth, zero per-line allowlist
const TABLE_OWNER: Record<string, string> = {
  knowledgeItems:        "packages/core-api/knowledge",
  bets:                  "packages/core-api/work",
  threads:               "packages/core-api/conversation",
  users:                 "packages/core-api/users",
  serverConfig:          "packages/core-api/settings",
  notificationQueue:     "packages/core-api/notifications",
  routines:              "packages/core-api/routine",
  serverCredentials:     "packages/core-api/connections",
  agentWorkIntents:      "packages/agent-orchestration/session-requests", // AC-9
  agentSessionRequests:  "packages/agent-orchestration/session-requests",
  // …one row per table, populated as each Service migrates (Increments 1–4)
};
// For every pgTable symbol exported by @hyperidle/db, any .from/.insert/.update/.delete/.join(symbol)
// OR any import of that symbol, in a file whose path is NOT under TABLE_OWNER[symbol] → FAIL.
// A table with no TABLE_OWNER row that is accessed anywhere → FAIL (forces the map to stay complete).
```

- Reads **both** access (query methods) and imports, in **any** package (repo-wide), for reads AND writes (AU12/AU13/AU18 corrected standard).
- Ships `--fixtures` self-test (positive: owner file legal; negative: synthetic foreign `.from(bets)` fails; **completeness**: a table symbol with no map row fails).
- Replaces the nine scripts in the `lint` chain in **one edit** (delete `au10…au18` guard invocations, add `table-ownership-guard`) — done in Increment 5 once every owner package exists, **not** before (deleting them early would un-guard mid-migration).

### 7.2 Mechanism B — Execution boundary (only agent-execution touches harness/LLM/MCP/tools)

Two enforcers, both `tsc`/dependency-resolution-based (no scan-root to stale):

1. **Package resolution.** `harness-registry`, `tool-provider`, `mcp-provider` are packages. Only the `agent-execution` Layer package and the `desktop`/`remote-worker` Applications list them as dependencies. Any other package importing `@hyperidle/harness-registry` etc. fails `tsc` module resolution (the AU17-proven negative-case technique).
2. **Capability-dep guard** `scripts/execution-boundary-guard.ts` — asserts the LLM/harness/MCP npm surface (`@modelcontextprotocol/sdk`, CLI-spawn of `claude`/`codex`/`opencode`, `llm-client` internals) appears **only** in `package.json` files and source under `packages/agent-execution/*`. Closes the hole where a package could import the raw SDK directly rather than through a Service package. `--fixtures` self-test (negative: an `@modelcontextprotocol/sdk` import outside `agent-execution/` fails).

### 7.3 Mechanism C — Composition boundary (Services never import Services)

**Enforcer: package dependency resolution + a `package.json` dependency guard.**

- A Service package's `dependencies` may only be `@hyperidle/db` + `@hyperidle/shared`. Listing another `@hyperidle/<service>` or a Layer package → `tsc` fails to resolve (the import isn't a declared dep) — AU17's negative-case technique, now at the Service grain.
- `scripts/composition-boundary-guard.ts` — reads every `packages/*/*/package.json`, **fails** if any Service's `dependencies` contains a `@hyperidle/<service>` or `@hyperidle/<layer>` name (whitelist = exactly `@hyperidle/db`, `@hyperidle/shared`, plus third-party runtime deps). `--fixtures` self-test.

**The DI pattern (from the concept's worked example):** a Service that needs another Service's data takes it as a **parameter typed by a locally-declared port interface** referencing shared row types from `@hyperidle/db`/`@hyperidle/shared`; the **owning Layer** package wires the concrete Service in.

```ts
// packages/agent-orchestration/context-assembly/src/index.ts
import type { KnowledgeItem } from "@hyperidle/db";          // TYPE import from db — allowed
export interface KnowledgeReader { list(scope: Scope): Promise<KnowledgeItem[]>; }
export function assemble(reader: KnowledgeReader, /* … */) { /* uses reader.list */ }

// packages/agent-orchestration/src/index.ts  (the LAYER package — the only place both are named)
import { assemble } from "@hyperidle/context-assembly";
import { list } from "@hyperidle/knowledge";                  // Layer reaches DOWN to core-api's knowledge
export const wiredAssemble = (/* … */) => assemble({ list }, /* … */);
```

**Ports package decision — NO new package (mostly).** Port interfaces are declared **locally in the consuming Service**, referencing shared domain types that already live in `@hyperidle/db`/`@hyperidle/shared` (structural typing lets the Layer pass the concrete Service's function). This keeps the allowed-deps set at exactly `db`+`shared` and avoids a ceremony package. **One exception is warranted:** the `HarnessPort` cross-**process** contract (below) goes in `@hyperidle/shared`, because orchestration and execution must share it **without** either depending on the other, and it crosses a process boundary (a genuinely different case from an in-process type import). If migration finds a port shared by 3+ consumers with drift risk, promote *that* interface to `@hyperidle/shared` — but do not pre-build a ports package.

### 7.4 The one genuine cross-process seam — `HarnessPort` (not new abstraction)

`agent-orchestration`'s `session-lifecycle`/`run-orchestration` must dispatch a run to *some* execution. Per the schedule, that execution is in-process (`desktop`) or a remote worker (`remote-server`+`remote-worker`). Enforced without breaking Mechanism B or the layering:

- `agent-orchestration` depends on a **`HarnessPort` interface** in `@hyperidle/shared` (`provisionAndRun(bundle: RunContextBundle): Promise<RunOutput>` — shapes lifted from today's `worker-ws.ts`/`remote-harness-adapter.ts`), **never** on `@hyperidle/harness-registry`.
- All concrete adapters — including `remote-harness-adapter.ts` (the WS client that speaks to a worker) — live in `agent-execution`'s `harness-registry`.
- The **Application** injects the concrete impl: `desktop` wires the in-process registry; `remote-server` wires a WS client to `remote-worker`. This is Mechanism C at the Application tier. **Not new abstraction** — `worker-ws.ts`/`remote-harness-adapter.ts` already exist; AU19 only relocates ownership of the *choice* to the Application (spec Out-of-scope §).

---

## 8. Scaffolding template + generator (so ~30 packages is mechanical repetition)

`scripts/scaffold-service.ts <layer> <service>` writes four files under `packages/<layer>/<service>/`:

**`package.json`**
```json
{
  "name": "@hyperidle/<service>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "check": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@hyperidle/db": "*", "@hyperidle/shared": "*" }
}
```
(agent-execution Services drop `@hyperidle/db` — zero DB access — and add their harness/MCP runtime deps.)

**`tsconfig.json`**
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [
    { "path": "../../db" },
    { "path": "../../shared" }
  ]
}
```
> Note the **three-level** relative depth (`../../../`) for nested packages, vs two-level for existing top-level packages. Create `tsconfig.base.json` at repo root holding the current `compilerOptions` so both depths extend one source. Layer packages additionally `references` their Service packages.

**`vitest.config.ts`** — minimal, mirrors an existing package's config (project name = `<service>`).

**`src/index.ts`** — barrel skeleton with a header comment: *"Barrel: typed functions only. SQL-owning Services MUST NOT re-export a raw pgTable object (Table ACL, Mechanism A)."*

The generator also: (a) appends `{ "path": "packages/<layer>/<service>" }` to the appropriate Layer package's `tsconfig.json` references, (b) is idempotent (skips existing files).

## 9. Structural changes to root tooling

1. **`package.json` workspaces** — `"packages/*"` → `["packages/*", "packages/*/*"]` (npm workspaces natively supports the nested glob; no tooling change beyond the glob). Verify `npm install` links the nested packages.
2. **`scripts/typecheck-gate.ts` `discoverPackages`** (line ~77–84) currently `readdirSync(packages/)` **one level** and checks `packages/<name>/tsconfig.json`. It **must recurse one level** to find `packages/<layer>/<service>/tsconfig.json`, else the nested Service packages are never typechecked and Mechanisms B/C go unenforced by `npm run check`. **This is a hard Increment-0 task** — without it the whole enforcement story is silent.
3. **Root `tsconfig.json`** — add `{ "path": "packages/<layer>" }` references for the 4 Layer packages (Service packages are reached transitively via Layer references). Add `tsconfig.base.json` (extracted `compilerOptions`).
4. **`knip.json`** — the nested packages become new entry points; re-run knip after each increment and **delete** newly-dead code (AC), do not add ignore entries (memory: tests/stories never knip entry points).
5. **`retention` fold decision (open):** if `retention-reaper` only issues deletes on tables it doesn't own, Mechanism A forces each delete to route through the owning Service — at which point `retention` may reduce to a thin scheduler that calls `work.reap()`, `notifications.reap()`, etc. Keep it a Service; revisit folding into `dispatch` only if it shrinks to a single call.

---

## 10. Composition-boundary edge audit (Mechanism C — the genuinely new refactoring)

An import-graph scan of all 240 files (grouped by the §4 Service assignment) finds **115 distinct cross-Service module→module edges** (excluding routes-as-source, which are legitimate core-api Layer composition). Every one becomes a DI parameter wired by the owning Layer. Full machine-generated list retained in the build scratchpad; the load-bearing structure:

**Highest-coupling sources (the DI conversion cost is concentrated here):**

| Source Service | Edges | Notable targets (count) | Conversion |
|---|:--:|---|---|
| `tool-provider` (execution) | ~40 | `work`(13), `users`(7), `conversation`(4), `knowledge`(3), `org`(3), `routine`(2), `dispatch`(2), `agent-selection`(2), `policy`(1), `session-lifecycle`(1), `harness-registry`(1) | **Largest + hardest.** See §10.1. |
| `session-lifecycle` (orch) | ~30 | `harness-registry`(7), `work`(3), `routine`(3), `context-assembly`(3), `cost`(2), `mcp-provider`(2), `tool-provider`(2), `session-requests`(2), + 8 more | Provisioning wires many Services → injected ports. |
| `dispatch` (orch) | ~30 | `conversation`(3), `harness-registry`(4), `work`(2), `users`(2), `settings`(2), `routine`(2), `tool-provider`(2), + 10 more | |
| `policy` (core-api) | ~20 | `work`(6), `conversation`(4), `users`(2), `notifications`(2), `session-requests`(2), `cost`(1), `knowledge`(1), `session-lifecycle`(1) | Cross-domain orchestration; ports for each. |
| `context-assembly` (orch) | ~13 | `knowledge`(7), `work`(2), `users`(1), `routine`(1), `filesystems`(1) | **The minimal-slice proof edge** (`knowledge`). |
| `session-requests`, `review`, `run-orchestration`, `notifications`, `settings`, `filesystems`, `org`, `cost`, `work`, `realtime`, `harness-registry`, `mcp-provider`, `trigger-resolution`, `agent-selection`, `capture-writeback`, `lifecycle-projection`, `connections`, `git-export`, `observability`, `retention`, `model-gateway`, `knowledge` | remainder | mostly 1–4 edges each | Straightforward port injection. |

Each increment converts **only its own group's outbound edges**; the target Service need not yet be a package (the Layer imports the concrete impl from its current location during transition, then updates the import path when the target migrates). The DI seam is what makes the migration incremental.

### 10.1 The `tool-provider` finding (the single biggest architectural tension)

Today's ~29 tools (`create-bet.ts`, `send-message.ts`, `write-memory.ts`, …) **directly import domain Services and `@hyperidle/db`** to do their work. But `agent-execution` must hold **zero** Service/DB access. Reconciliation, staged:

- The `tool-provider` package exports **tool factories parameterized by ports** (`createBetTool(deps: { work: WorkWriter, … })`). Its `package.json` deps become `@hyperidle/shared` only (no `db`, no Service) — structurally zero-DB, honoring the execution constraint.
- The **wiring** of concrete domain Services into those ports happens in the composing Layer/Application: on `desktop` (execution in-process), the `agent-execution` bootstrap receives the port bundle from `agent-orchestration`; on a `remote-worker`, tool calls that mutate domain state already **proxy back over MCP to the orchestration process** (existing runtime behavior — tools execute where the DB is, the harness calls them over the bridge), so no worker-side DB access is introduced. **Behavior is unchanged** in every current topology; the package boundary just makes the injection explicit.
- This is the **largest single DI conversion** (~40 edges) and is deliberately scheduled **last** (Increment 4). Do **not** attempt it in the minimal slice. Splitting `tool-provider` internals further is out of scope (spec).

> Honesty note for the reviewer: fully realizing "tools run on a DB-less worker" is a *capability this structure unlocks*, not a behavior this WP proves end-to-end. The WP proves the **package/dependency** boundary (deps = shared only, tsc-enforced) and preserves current runtime behavior; it does not re-route today's in-process tool execution.

---

## 11. `agent_work_intents` TABLE_OWNER debt closure (AC-9)

Owner module: `services/agent-work-intents.ts` (exports `recordAgentWorkIntent`, `reapTerminalAgentWorkIntents`) → becomes the sole table path inside the **`session-requests`** Service package. Three known non-owner accessors migrate onto it:

| Accessor | Current op | Migration |
|---|---|---|
| `routes/threads.ts` | raw `insert` into `agent_work_intents` | Call `recordAgentWorkIntent(...)` (add the exported writer if the exact shape isn't covered). Route is core-api Layer → allowed to call the orchestration Service **only via the Layer wiring** (a route importing an orchestration Service directly would violate downward-only layering — so this insert is triggered by emitting the intent through the orchestration seam, per how threads already hands off). Confirm the existing handoff path at migration; if `routes/threads.ts` genuinely must record an intent, it does so through a core-api→orchestration wiring point, not a raw table write. |
| `routes/sessions-routes.ts` | raw `read` | Replace with an exported reader from `session-requests`. |
| `services/agent-layer-boot.ts` | raw `read` | Same reader; `agent-layer-boot.ts` is `run-orchestration` (same Layer as the owner) so it takes the reader as a DI param wired by the `agent-orchestration` Layer. |

Add `agentWorkIntents`/`agentSessionRequests` rows to the `TABLE_OWNER` map (§7.1). Scheduled in **Increment 3** (orchestration group), when `session-requests` becomes a package — but the raw accessors can be closed then in the same commit, not deferred again.

---

## 12. Ordered build plan (RESUMABLE — the increment checklist)

> A resuming builder reads this section + `git log` to know where things stand. Each increment = one commit, ends green. **Increment 0 is a hard gate.**

### Increment 0 — Minimal-slice enforcement proof  *(HARD GATE — nothing else starts until this is green + committed)*

Scope: prove all three mechanisms on the smallest real slice **before** touching the other ~230 files.

1. Root tooling: `tsconfig.base.json`; workspaces glob `packages/*/*`; `typecheck-gate.ts` recursion (§9.1–9.3). Prove: `npm run check` discovers a nested package.
2. `scripts/scaffold-service.ts` (§8) + create the 3 Layer packages `@hyperidle/core-api`, `@hyperidle/agent-orchestration`, `@hyperidle/agent-execution` (thin barrels).
3. Migrate **3 Service packages**: `packages/core-api/knowledge/` (barrel = functions only, no raw table), `packages/agent-execution/harness-registry/`, `packages/agent-orchestration/context-assembly/` (its `knowledge` edge converted to a `KnowledgeReader` DI param; its other edges — work/users/routine/filesystems — injected as ports whose concrete impls are imported by the `agent-orchestration` Layer from their *current* `packages/server/src` location, transitionally).
4. Wire the real cross-Service composition — `context-assembly` ← `knowledge` — in the `@hyperidle/agent-orchestration` Layer package (the worked example, §7.3).
5. Build the 3 general guards: `table-ownership-guard.ts` (map seeded with `knowledgeItems`), `execution-boundary-guard.ts`, `composition-boundary-guard.ts` — each with `--fixtures`. Wire into `lint` (alongside, not yet replacing, the `au*` guards).
6. **Three sanity-breaks — inject, confirm RED, revert, in the commit message / a scratch log:**
   - **A:** re-export the raw `knowledgeItems` table from `knowledge`'s barrel → `table-ownership-guard` (and/or a consumer touching it) fails → revert.
   - **B:** import `@modelcontextprotocol/sdk` (or `@hyperidle/harness-registry`) from `context-assembly` → `execution-boundary-guard` / `tsc` fails → revert.
   - **C:** add `"@hyperidle/knowledge": "*"` to `context-assembly`'s `package.json` dependencies and `import { list } from "@hyperidle/knowledge"` → `composition-boundary-guard` / `tsc` fails → revert.
7. Full existing test suite green; the migrated `knowledge`/`harness-registry`/`context-assembly` behavior unchanged.

**Increment 0 exit = the enforcement scaffolding is real and proven. Commit. This satisfies AC-6 (minimal-slice + sanity-break-per-mechanism).**

### Increment 1 — core-api SQL-owning Services
Migrate `work`, `conversation`, `users`, `settings`, `notifications`, `routine`, `connections`, `org`, `review` (+confirm `review`'s table). Each: scaffold package → move files → barrel (no raw table) → add `TABLE_OWNER` row(s) → convert this group's outbound edges to DI wired by `core-api` Layer. `routes/*` move into the `@hyperidle/core-api` Layer package. Green + commit.

### Increment 2 — core-api non-SQL Services
`policy`, `git-export`, `observability`, `model-gateway`, `filesystems`, `realtime`, `retention`. Confirm `policy`/`filesystems` table ownership (SQL or DI). Convert edges. Green + commit.

### Increment 3 — agent-orchestration Services
`trigger-resolution`, `session-requests` (**+ AC-9 `agent_work_intents` closure, §11**), `run-orchestration`, `lifecycle-projection`, `agent-selection`, `capture-writeback`, `cost`, `dispatch`, `session-lifecycle`. Add the `HarnessPort` interface to `@hyperidle/shared`; wire `session-lifecycle`/`run-orchestration` to it (not to `harness-registry`). Green + commit.

### Increment 4 — agent-execution Services
`harness-registry` (already migrated in Inc 0 — finalize), `tool-provider` (**the ~40-edge DI conversion, §10.1**), `mcp-provider`. Resolve `harness-capability-read-model` split (§6). Green + commit.

### Increment 5 — Layers, Applications, cleanup, guard retirement
- `core-ui` Layer boundary: enforce Mechanisms B+C on `packages/web` (no internal reorg).
- Application bootstrap packages: `desktop`, `remote-server`, `ui`, `remote-worker` — each composes its scheduled Layers (§3), injects the concrete `HarnessPort`.
- External-consumer migration (AU17's table, reused): `packages/eval`, `packages/web/scripts/*` — repoint deep-imports to the new Layer/Service surfaces.
- **Retire the nine `au10`…`au18` guard invocations** from the `lint` chain, replaced by `table-ownership-guard` (now that every owner package exists). Delete the guard scripts.
- `knip` sweep → delete newly-dead code (AC).
- Verify AU8/AU17 still marked superseded in `pipeline-manifest.yaml` + `TRACK-AU.md`.
- Full `npm run verify` green. Green + commit.

---

## 13. Acceptance criteria → plan-step / verification mapping

| # | Spec AC (abbrev.) | Plan step(s) | Verification |
|---|---|---|---|
| 1 | Application units compose Layers; bootstrap-only | §3, §5 (bootstrap files), Inc 5 | `desktop`/`remote-server`/`ui`/`remote-worker` packages exist, contain only wiring; boot each topology → identical behavior. |
| 2 | 4 Layer packages are real boundaries; foreign import fails typecheck | §4, §7.2–7.3, Inc 0/5 | Negative-case fixture: a Layer importing outside its Services + db/shared → `tsc` fails (typecheck-gate recursion §9.2 makes this bite). |
| 3 | Every SQL-owning Service is its own package, sole table path, barrel hides table; **one** general guard replaces nine | §4, §7.1, Inc 0–4, Inc 5 (retirement) | `table-ownership-guard --fixtures` green; negative fixture (foreign `.from(bets)`) fails; nine `au*` invocations gone from `lint`. |
| 4 | orchestration + execution are real Service packages, not flat dirs; none Table-ACL (except the run-coordination tables — finding §4) | §4, Inc 3–4 | Packages exist with own `package.json`/tests; `services/` flat dir emptied. |
| 5 | Only agent-execution Services reach LLM/harness/MCP/tools; else structurally forbidden | §7.2, Inc 0 (sanity-break B), Inc 4 | `execution-boundary-guard --fixtures`; negative fixture fails; non-dep import fails `tsc`. |
| 6 | No Service imports another Service/Layer; deps = db/shared(+shared port); cross-Service wired by Layer | §7.3, §10, Inc 0 (sanity-break C), all increments | `composition-boundary-guard --fixtures`; negative fixture fails; the 115 edges are all Layer-wired. |
| 7 | Enforcement built + proven on minimal slice with ≥1 sanity-break per mechanism BEFORE bulk migration | **Increment 0** (§12) | Inc 0 commit shows 3 sanity-breaks (A/B/C) injected→RED→reverted; lands before Inc 1. |
| 8 | ~238 files migrated (reuse AU17 classification); behavior unchanged all topologies | §5, §6, Inc 1–5 | Full existing test suite (unit/component/integration/e2e) green unchanged; boot each topology. |
| 9 | `agent_work_intents` TABLE_OWNER + 3 accessors migrated onto owner | §11, Inc 3 | `TABLE_OWNER` has `agentWorkIntents` row; guard fails any non-`session-requests` access; the 3 sites converted. |
| 10 | AU8 + AU17 stay superseded; no orphan schedulable entry | Inc 5 verify | `pipeline-manifest.yaml` + `TRACK-AU.md` reviewed; both marked superseded. |
| 11 | (workspaces glob widened) | §9.1, Inc 0 | `package.json` workspaces = `["packages/*","packages/*/*"]`; `npm install` links nested packages. |

---

## 14. Trade-offs, risks, open questions

- **`@hyperidle/db` exports all tables to everyone (§7.1)** — the barrel-discipline half of Table ACL is weaker than the concept implies; the general `TABLE_OWNER` guard is the real enforcement. Stated plainly; splitting `db` per-owner is out of scope. **Biggest correctness caveat in the plan — reviewer should confirm the guard, not the barrel, is treated as load-bearing.**
- **Orchestration owns tables (§4 finding)** — contradicts the concept diagram's "orchestration owns no SQL table." Resolved by applying Table ACL to `session-requests`/`lifecycle-projection`. The AC text should be read as "most orchestration Services don't own tables," not "none."
- **`tool-provider` (§10.1)** — the largest DI conversion and the one place the "zero-Service execution" ideal meets today's DB-touching tools. The package boundary (deps = shared only) is provable; end-to-end DB-less-worker tool execution is a capability unlocked, not a behavior re-routed. Scheduled last, deliberately.
- **`review`/`policy`/`filesystems` table ownership (⛁*)** — unconfirmed; first task of each Service's increment is to `grep` its `pgTable` usage and either add a `TABLE_OWNER` row or convert reads to DI.
- **Multi-session build** — the increment cut (§12) is the resumability mechanism; the risk is a builder resuming and re-doing Inc 0. Mitigation: Inc 0 lands the three guards + three Layer packages, all visible in `git log` and `ls packages/*/`.
- **No new ports package** (§7.3) — chosen for boring-tech / minimal-ceremony; risk is port-interface drift across consumers. Mitigation: promote a shared port to `@hyperidle/shared` only when 3+ consumers share it (as `HarnessPort` already does).
- **`write-executor.ts`, `agent-utils.ts`, `contracts.ts`, `harness-capability-read-model.ts`** — dispositions marked "inspect at migration," not pre-decided, to avoid a wrong bulk-move. The disposition table (§6) is append-only.

## 15. Self-critique

- **Over-reach check:** the roster (30 Services) is at the top of the floor range; `retention`, `realtime`, `model-gateway`, `observability` are thin and could fold. Kept separate because each has a distinct interface and folding them re-introduces the "grab-bag module" this WP exists to kill — but flagged `retention` explicitly as a fold candidate (§9.5) rather than pretending certainty.
- **Scope honesty:** the `tool-provider` reconciliation (§10.1) is the place a reviewer should push hardest — I have stated its limit (boundary proven, behavior not re-routed) rather than overclaiming.
- **Did I invent abstraction?** `HarnessPort` is the only new interface, bound to the existing `worker-ws`/`remote-harness-adapter` pair per the spec's explicit "not new abstraction" constraint. No ports package. No new runtime layer.
- **Enforcement realism:** the plan's single biggest silent-failure risk (typecheck-gate not recursing into nested packages, §9.2) is called out as a hard Increment-0 task — without it every `tsc`-based mechanism is theatre. This is the thing most likely to be skipped; it is gated first.
</content>
</invoke>
