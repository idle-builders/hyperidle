# AU19 — Architecture: Applications · Layers · Services

**Type:** framework · **Complexity:** L (~8–10d, multi-session build) · **Supersedes:** AU8 + AU17
**Depends on:** AU12–AU16, AU18 (all merged). **Gates:** Refinement — done (`plans/AU19/requirements.md`, commit `a373cb5f`). Design — N/A (no UI). Human concept review — No.
**Locked inputs:** `plans/AU19/requirements.md` · `plans/AU19/concept.html` (founder-approved DWG AU19-001) · `docs/architecture/runtime-simplification.md` §"Applications, Layers, and Services" · `.pipeline/work-packages/TRACK-AU.md` §AU19.
**Revision:** round 1 (post architecture-critique `99b7b00d`). Resolves C1 (tool-provider), C2 (real edge census), W1–W4, and the file-count facts. See the end-of-doc *Revision log*.

> **Read this first — resumability contract.** This build spans multiple pipeline sessions. It is cut into **Increment 0** (the minimal-slice enforcement proof — a HARD GATE, must land and be green before anything else) and **Increments 1–5** (bulk migration, one Layer/Service group each). A builder resuming mid-WP determines "done vs pending" from **git history + the increment checklist in §12**, never from a prior session's context. Each increment ends on green `npm run check && npm run lint && npm run test` and is a single logical commit. Do not start increment N+1 until increment N is green and committed.

---

> ### ✅ AC-4 CORRECTION — founder sign-off closed 2026-07-13 (W3)
> Spec **AC-4** (TRACK-AU §AU19) previously stated orchestration/execution Services *"own no SQL table, so their boundary is the package/exports-map itself, not Table ACL."* This was factually contradicted by the code and by the spec's own AC-9: three durable-handoff tables live in `agent-orchestration` — `agent_work_intents`, `agent_session_requests` (owner: `session-requests` Service), and `agent_lifecycle_inbox` (owner: `lifecycle-projection` Service). The **founder confirmed** the correction is not "orchestration owns no tables" (that was never a real architectural rule, only this one overgeneralized sentence) — it's a split: `agent-execution` owning zero tables is a **hard constraint** (zero-DB-credential `remote-worker`); `agent-orchestration` **may** own tables, most don't today, and `session-requests`/`lifecycle-projection` are the two that do, Table-ACL-enforced like any other SQL-owning Service. AC-4's text in `TRACK-AU.md` is now updated to this split wording. **No behavior or scope changes** — this architecture was already built against the correct (table-owning) classification for `session-requests`/`lifecycle-projection`; only the AC wording needed to catch up. Closed, no longer an open item.

---

## 1. Context

`packages/server` is one npm workspace package of **238 production `.ts` files** (240 counting the two shared test helpers `test-fixtures.ts` / `test-utils.ts`; matches the spec's "~238"). Domain ownership was carved out incrementally (AU12–AU18) but *location still declares nothing*: `services/` is a flat **76-file** dump mixing SQL-owning domain modules (`work-service.ts`, `conversation-store.ts`) with agent-orchestration lifecycle code (`agent-run-boundary.ts`, `context-assembly.ts`) with execution-support (`cost-cap.ts`). Nine hand-typed AST guard scripts (`au10`…`au18`) enforce ownership; each has a scan-root that silently goes blind when files move (this failure hit twice building AU17).

AU19 turns location into a mechanically-enforced contract via a **two-level package hierarchy** — 4 thin Layer packages composing ~31 Service packages nested at `packages/<layer>/<service>/` — plus **three** `tsc`/dependency-resolution-enforced mechanisms (Table ACL, Execution boundary, Composition boundary). AU17 (PR #447, closed unmerged) already proved the package-boundary technique works and produced a verified acyclic classification; its two-package split is re-cut here against the new four-Layer / N-Service taxonomy.

## 2. Constraints (carried from spec + refine, not re-litigated)

- One npm workspace package **per Service**, nested `packages/<layer>/<service>/` — never a folder in 4 monolithic Layer packages.
- A SQL-owning Service's barrel (`src/index.ts`) **never exports its raw Drizzle table object** — typed functions only.
- The residual Table-ACL guard is **one general declarative check** (a `TABLE_OWNER` map), replacing the nine hand-typed per-domain scripts — not a tenth instance.
- **No Service package depends on another Service package or a Layer package.** A Service's `dependencies` = `@hyperidle/db` + `@hyperidle/shared` only (agent-execution Services: `@hyperidle/shared` + harness/MCP runtime, **no `@hyperidle/db`**). Cross-Service wiring is the owning **Layer**'s job; cross-**process** wiring (orchestration↔execution) is the **Application**'s job.
- Only `agent-execution` Services may import an LLM-CLI / harness-adapter / MCP-bridge / tool-execution symbol.
- `agent-execution` holds **zero** Service/table reference of any kind (incl. `knowledge`) — it receives an assembled context bundle, returns raw output over the existing worker channel. **This is now honored literally, not deferred** — see the `tool-provider`/`tool-handlers` split (§7.5).
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

Downward-only dependency: `core-ui → core-api → agent-orchestration → agent-execution` (each Layer may reach **down** the chain; an orchestration Service reaching *down* to a core-api Service is legal DI, a core-api Service reaching *up* into orchestration is **not** — it inverts through the event bus, see §10.2). The one cross-**process** seam (`agent-orchestration` dispatching a run to `agent-execution`) is **not** a package dependency — it is a `HarnessPort` interface (see §7.4) the Application injects.

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

### agent-orchestration Layer — 11 Services

> **Finding (corrects the concept diagram's "orchestration owns no tables") — see the AC-4 correction callout at top.** The durable-handoff tables (`agent_work_intents`, `agent_session_requests`, `agent_lifecycle_inbox`) live in orchestration. So `session-requests` and `lifecycle-projection` **are** SQL-owning and Table-ACL applies.

| Service | ⛁ | Owns | Seed files |
|---|:--:|---|---|
| `trigger-resolution` | ⛁ | `triggerResolutionHistory` (confirmed at Increment 3a migration — roster's original "—" undercounted it) | `services/trigger-resolution.ts` |
| `session-requests` | ⛁ | `agent_work_intents`, `agent_session_requests`, `explicit_session_starts` (confirmed at Increment 3b migration — roster's original two-table listing undercounted the sibling table; `agent_lifecycle_inbox` stays `lifecycle-projection`'s per this row's original assignment — `session-requests` reaches it via a DI port, not raw access, see `ports.ts` top comment) | `services/agent-session-requests.ts`, `agent-work-intents.ts`, `agent-work-intent-worker.ts`, `session-run-registry.ts` |
| `run-orchestration` | — | — | `services/agent-run-boundary.ts`, `agent-session-runtime.ts`, `agent-layer-boot.ts`, `worker-ws.ts` |
| `lifecycle-projection` | ⛁ | `agent_lifecycle_inbox` (confirmed at Increment 3d migration — sole owner, `TABLE_OWNER` row added) | `services/agent-lifecycle-projectors.ts` |
| `agent-selection` | — | — | `services/agent-selection.ts`, `select-agent.ts`, `roster.ts`, `agent-defaults/resolvers.ts`, `agent-utils.ts` |
| `context-assembly` | — | — | `services/context-assembly.ts`, `context-assembly-prompt.ts`, `session-context.ts`, `agent-context/assemble-context.ts` |
| `capture-writeback` | — | — | `services/writeback.ts`, `session-activity-buffer.ts` |
| `cost` | — | — | `services/cost-cap.ts`, `cost-sentinel.ts` |
| `dispatch` | — | — | `services/task-dispatcher.ts`, `assistant-dispatcher.ts`, `routine-scheduler.ts`, `builtin-routine-handlers.ts`, `agent-work-assistant.ts` |
| `session-lifecycle` | — | — | `services/session-provisioning.ts`, `session-lifecycle.ts`, `routine-session-reaper.ts`, `sandbox-reaper.ts` |
| **`tool-handlers`** *(new — C1)* | — | — | the **DB-/domain-touching handler bodies** of `tools/*` (see §7.5). Wired to domain Services via DI by the orchestration Layer; runs where the DB is, in every topology. |

### agent-execution Layer — 3 Services (zero Service/DB access — enforced literally)

| Service | Seed files | deps |
|---|---|:--|
| `harness-registry` | `harness/*` (21) incl. `remote-harness-adapter.ts`, `llm-client.ts`, adapters; `services/harness-capability-read-model.ts` | shared + harness runtime |
| `tool-provider` | the **harness-facing tool surface** only: tool descriptors (name/schema/roles/description) + the dispatch that marshals a call to an injected handler port. `tools/tool-registry.ts`, `index.ts`, `tool-result.ts`, `assistant-tool-result.ts`, `return-status-tool.ts` (execution-internal only) — **stripped of all domain/DB imports** (see §7.5). *`assistant-draft-registry.ts` imports `work`/`users` → it is a handler body → `tool-handlers`, not here.* | **shared only** (no `@hyperidle/db`) |
| `mcp-provider` | `mcp/*` (2), `services/mcp-route.ts` | shared + MCP runtime |

**Roster total: 31 Service packages + 1 undecomposed core-ui Layer** — within the ~25–35 the floor predicted. (Was 30; +1 = the `tool-handlers` orchestration Service extracted from `tools/` per the C1 resolution.)

---

## 5. File-by-file classification (category-level; per-file map reuses AU17's audit)

Every production file lands in exactly one Service, one Layer-package composition root, one Application bootstrap, or the ambiguous-disposition table (§6). This section is **category-level** (it enumerates the assignment rules + the residual dispositions); the exhaustive per-file table is AU17's verified classification, reused as migration input, re-cut against the four-Layer taxonomy. The Service seed-file columns in §4 assign the bulk (`harness/`, `mcp/`, `tools/`, `knowledge/`, `notifications/`, `filesystem/`, `observability/`, and the named `services/*` + top-level domain files). The **238** production files reconcile as: ~207 assigned by §4 seed columns, the remainder dispositioned below.

**Layer-composition-root / Application-bootstrap (not a Service):**

| File | Home | Why |
|---|---|---|
| `app.ts`, `server-factory.ts` | `@hyperidle/core-api` Layer package (composition barrel) | Wires routes + Services into the Hono app — Layer wiring, not a Service. Also the injection point for Application-supplied cross-Layer ports (§11). |
| `index.ts` | `desktop` / `remote-server` Application bootstrap | Process entrypoint = Application. |
| `session.ts` | `@hyperidle/core-api` Layer (HTTP session middleware wiring) | Cross-Service HTTP concern. |
| `validate-env.ts` | Application bootstrap (shared boot util → `@hyperidle/shared`) | Env validation runs at process start. |
| `routes/*` (38) | `@hyperidle/core-api` Layer package | HTTP surface = the Layer's composition of its Services. Routes are **allowed** to import multiple core-api Services (they are the Layer doing composition) — but must not import a raw table (Table-ACL) nor an agent-execution symbol (Mechanism B), and must not directly import an orchestration Service (that is Application-injected — §11). `routes/ws.ts`, `routes/workers.ts` are the orchestration/worker channel surface — see §7.4. |
| `middleware/*` (7), `auth/access-boundary.ts`, `auth/authorize.ts` | `@hyperidle/core-api` Layer package | HTTP infra. (`auth/upgrade-token-store.ts` → `users` Service, per §4.) |
| `schemas/*` (4) | `@hyperidle/api-contract` (or core-api Layer) | Shared request/response schemas — see §9. |
| `config/builtin-routines.ts` | `routine` Service (seed data) | Default routine records. |
| `config/builtin-tool-catalog.ts` | **`@hyperidle/shared`** (static config data) | Default tool catalog — a plain name/description list read by **both** `settings` (core-api) and `tool-provider` (execution). Keeping it in execution would make `settings → execution` an against-grain edge (§10.2); it is pure data with no domain/DB reference → shared. |
| `config/git-export-config.ts` | `git-export` Service | Per §4. |

**Test infra (per-package or shared):** `test-fixtures.ts`, `test-utils.ts`, `vitest-setup.ts`, `harness/__tests__/require-harness.ts`, `tools/__tests__/_helpers.ts` → move into the owning Service's `src/__tests__/` or a shared `@hyperidle/test-utils` if imported cross-package (confirm consumers at migration).

## 6. Ambiguous-file disposition table (Q5 requirement — no default `shared` dumping)

Each of these has no single obvious domain. **None is defaulted into a flat `shared` bucket without a named reason.**

| File | Home | Reasoning |
|---|---|---|
| `services/ws-broadcaster.ts` | `realtime` Service (core-api) | Broadcasts domain events to UI clients — a core→ui push capability, not infra of any one domain. |
| `services/worker-ws.ts` | `run-orchestration` Service (orchestration side of the worker channel) | The server-side WS **host** that receives worker connections; it is the orchestration end of the `HarnessPort` cross-process seam (§7.4). The **client** (`remote-harness-adapter.ts`) is `harness-registry`. |
| `services/org-edges.ts` | `org` Service | Org graph is `org`'s owned data. |
| `services/credential-encryption.ts` | `connections` Service | Encrypts the secrets `connections` owns; sole consumer domain. |
| `services/model-gateway.ts` | `model-gateway` Service | Its own capability (model routing); reads `settings`+`connections` via DI. |
| `services/item-router.ts` | `work` Service | Routes work items — `work`'s domain. |
| `services/like-escape.ts` | `@hyperidle/db` (SQL util) | Escapes SQL `LIKE` wildcards; belongs with the DB query layer, used by any table doing text search. Zero-domain util. |
| `services/schedule-label.ts` | `routine` Service | Human-readable cron labels — `routine`'s concern. |
| `services/agent-utils.ts` | `agent-selection` (verified: selection helpers) | Agent identity/selection helpers; if migration finds cross-cutting identity *types* → split those to `@hyperidle/shared`. |
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
  explicitSessionStarts: "packages/agent-orchestration/session-requests", // confirmed Inc 3b
  agentLifecycleInbox:   "packages/agent-orchestration/lifecycle-projection",
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

- A Service package's `dependencies` may only be `@hyperidle/db` + `@hyperidle/shared` (execution Services: `@hyperidle/shared` + harness/MCP runtime, **no db**). Listing another `@hyperidle/<service>` or a Layer package → `tsc` fails to resolve (the import isn't a declared dep) — AU17's negative-case technique, now at the Service grain.
- `scripts/composition-boundary-guard.ts` — reads every `packages/*/*/package.json`, **fails** if any Service's `dependencies` contains a `@hyperidle/<service>` or `@hyperidle/<layer>` name (whitelist = exactly `@hyperidle/db`, `@hyperidle/shared`, plus third-party runtime deps). `--fixtures` self-test.

**The DI pattern (from the concept's worked example):** a Service that needs another Service's data takes it as a **parameter typed by a port interface**; the **owning Layer** package wires the concrete Service in.

**Port type source (W4 resolution).** Where a port interface sources its domain row/DTO types depends on which side of the execution boundary it lives:

- **core-api and agent-orchestration Services keep `@hyperidle/db`** (their `dependencies` include it). Their in-layer ports may type off `@hyperidle/db` row types directly. So §7.3's `context-assembly` example (below) is correct **because `context-assembly` is an orchestration Service and orchestration keeps db** — a `type`-only import from db is legal there.
- **agent-execution Services drop `@hyperidle/db` entirely** (§8). An execution-side port therefore may **not** type off `@hyperidle/db`. Its cross-boundary types come from **`@hyperidle/shared`**, which is verified **db-free** (its runtime deps are `zod`, `@noble/hashes`, `github-slugger`, `remark-*`, `unified` — zero `@hyperidle/db`). This is the "narrow shared ports/contracts package" the spec allows; **no new package is warranted** — `@hyperidle/shared` already fills that role and is already the home for `HarnessPort`. The execution-side cross-boundary surface is small and lands in `@hyperidle/shared`: `HarnessPort` / `RunContextBundle` / `RunOutput` (harness-registry) and `ToolDescriptor` / `ToolContext` / `ToolHandler<Args>` / `ToolResult` (tool-provider). Under the §7.5 split, `tool-provider` needs **no domain row types at all** (the domain-touching handler bodies live in orchestration's `tool-handlers`, which keeps db) — so W4 is minimal in practice.
- *Rejected alternative:* a dedicated `@hyperidle/agent-execution-contracts` package. Rejected because `@hyperidle/shared` is already a universal, verified-db-free dependency of every execution Service; a second contracts package adds a package + import churn for zero enforcement gain, contradicting the no-ports-package stance.

```ts
// packages/agent-orchestration/context-assembly/src/index.ts  (ORCHESTRATION Service — keeps @hyperidle/db)
import type { KnowledgeItem } from "@hyperidle/db";          // TYPE import from db — legal here (orch keeps db)
export interface KnowledgeReader { list(scope: Scope): Promise<KnowledgeItem[]>; }
export function assemble(reader: KnowledgeReader, /* … */) { /* uses reader.list */ }

// packages/agent-orchestration/src/index.ts  (the LAYER package — the only place both are named)
import { assemble } from "@hyperidle/context-assembly";
import { list } from "@hyperidle/knowledge";                  // Layer reaches DOWN to core-api's knowledge
export const wiredAssemble = (/* … */) => assemble({ list }, /* … */);
```

```ts
// packages/agent-execution/tool-provider/src/index.ts  (EXECUTION Service — NO @hyperidle/db)
import type { ToolContext, ToolHandler, ToolResult } from "@hyperidle/shared"; // db-free type source
// tool-provider holds ONLY descriptors + dispatch; no domain row type is referenced here.
```

**Ports package decision — NO new package.** Port interfaces are declared **in the consuming Service** (in-layer, db-keeping side) or in **`@hyperidle/shared`** (execution boundary crossings + the `HarnessPort` cross-process contract). This keeps the allowed-deps set at exactly `db`+`shared` (or `shared` for execution) and avoids a ceremony package. If migration finds an in-layer port shared by 3+ consumers with drift risk, promote *that* interface to `@hyperidle/shared` — but do not pre-build a ports package.

### 7.4 The one genuine cross-process seam — `HarnessPort` (not new abstraction)

`agent-orchestration`'s `session-lifecycle`/`run-orchestration` must dispatch a run to *some* execution. Per the schedule, that execution is in-process (`desktop`) or a remote worker (`remote-server`+`remote-worker`). Enforced without breaking Mechanism B or the layering:

- `agent-orchestration` depends on a **`HarnessPort` interface** in `@hyperidle/shared` — **two methods, `admitSession(...)`/`runSession(...)`, not the single `provisionAndRun(bundle): Promise<RunOutput>` this section originally sketched** (§7.4 amendment below) — **never** on `@hyperidle/harness-registry`.
- All concrete adapters — including `remote-harness-adapter.ts` (the WS client that speaks to a worker) — live in `agent-execution`'s `harness-registry`.
- The **Application** injects the concrete impl: `desktop` wires the in-process registry; `remote-server` wires a WS client to `remote-worker`. This is Mechanism C at the Application tier. **Not new abstraction** — `worker-ws.ts`/`remote-harness-adapter.ts` already exist; AU19 only relocates ownership of the *choice* to the Application (spec Out-of-scope §).

**§7.4 amendment (2026-07-15, founder-directed, resolves Increment 3i's founder-signoff):** this section's original `provisionAndRun(bundle): Promise<RunOutput>` was a sketch "lifted from" the pre-migration code at architecture-planning altitude, before the actual detached-execution path was read line-by-line. `run-orchestration`'s `agent-session-runtime.ts` (`consumeAgentSessionRequest`'s `detachAfterAdmission` branch) needs the admitted `sessionId` back **synchronously**, to record the request as "running" in the DB, **before** the run itself proceeds — the caller then returns to its 1s poll loop without awaiting run completion (`void ports.sessionProvisioner.runSession(...)`, not awaited). A single opaque call that only resolves once the entire run finishes cannot support this — the whole point of detached execution is not blocking on run completion. Verified directly in `agent-session-runtime.ts:238-291`, not just accepted on the builder's word. A wrapper shape (`provisionAndRun` returning `{sessionId, done: Promise<RunOutput>}`) would technically satisfy "one call," but is equivalent complexity dressed differently — still two points of resolution, just packaged inside one return value instead of two methods — and would be new, unproven interface shape for zero functional gain, exactly the kind of invented abstraction `ETHOS.md`'s "Search Before Building" warns against. The two-method shape is a straight rename+relocation of `run-orchestration`'s pre-existing `RunOrchestrationSessionProvisioner` (Increment 3c) — zero new design, zero behavior change, and (contrary to a first-glance worry) does **not** newly cost the Increment-5 remote-worker wire protocol anything: that protocol already speaks in these same two phases today, this ruling just keeps it that way rather than requiring an actual wire-protocol redesign that was never this migration's job. **`HarnessPort`'s permanent, founder-approved shape is `admitSession`/`runSession` (two methods), not `provisionAndRun` (one call).** This is the same "plan is a floor, refinable during migration" principle already exercised repeatedly in this WP (composition census corrections, Increment 1k, the §10.3 amendments) — applied here to a Layer-seam sketch instead of an edge census.

### 7.5 The tool boundary — `tool-provider` (execution) vs `tool-handlers` (orchestration) (C1 resolution)

**The tension (locked by the founder):** (a) tools live under `agent-execution`; (b) `agent-execution` holds **zero** Service/table reference of any kind. The prior draft tried to hold both by claiming `tool-provider` deps = shared only **while** leaving today's DB-touching tool bodies unconverted — which is unachievable: a tool body that does `import { teams } from "@hyperidle/db"` + `import * as work` cannot sit in a package whose deps are `shared` only.

**Codebase reality (this worktree, production files):** of **28** non-test files in `tools/`, **11** import `@hyperidle/db`, and **8** of those do direct foreign-table Drizzle access (`create-bet.ts`→`teams`, `create-artifact.ts`, `create-routine.ts`, `add-agent.ts`, `create-conflict-review.ts`, `promote-knowledge.ts`, `create-team.ts`, `score-attention.ts` — tables owned by `work`/`org`/`knowledge`/`routine`). (The critique's "37 files import db" counts the 28 test files too; the production surface is 11.) A tool today is one file holding **both** a harness-facing descriptor (name, zod schema, roles) **and** a DB-touching handler that receives `ctx.db`.

**Resolution — Option B (split across the boundary; the classification that makes package-location match runtime-location).**

| Half | Package | Layer | Holds | deps |
|---|---|---|---|---|
| **Descriptor + dispatch** | `tool-provider` | agent-execution | per tool: `{ name, description, inputSchema, roles }` + the dispatch that parses args and calls an **injected handler port**. This is exactly what the harness/LLM needs to see and route. **Zero domain Service, zero table, zero `@hyperidle/db`.** | **shared only** |
| **Handler bodies** | `tool-handlers` | agent-orchestration | the DB-/domain-touching implementations (the 11 db-touching + the domain-Service-calling tool bodies). Each handler takes domain-Service **ports** (`WorkWriter`, `TeamReader`, `KnowledgeWriter`, …) DI-wired by the orchestration Layer; raw `import { teams }` + `import * as work` become injected ports (Mechanism C). | db + shared |

**Why B, not A (keep bodies in tool-provider, fully DI-converted):** both satisfy the *letter* of "zero Service/table reference" (a port-parameterized body imports only a `shared` port). B is chosen because it also satisfies it *semantically* and makes **package location match runtime execution location**: today a tool invocation already runs where the DB is — in-process on `desktop`, and **proxied back over MCP to the orchestration process on a `remote-worker`** (existing behavior). Under B the handler is *packaged* in orchestration and *runs* in orchestration in **both** topologies; the descriptor ships to wherever the harness runs. Under A the handler code would be packaged in `agent-execution` yet execute in the orchestration process on a worker — a package/runtime mismatch. B removes that mismatch and keeps `agent-execution` genuinely free of domain logic.

**No behavior change.** The seam between descriptor and handler is the **existing** `ToolContext`/MCP-bridge invocation path. On `desktop`, the orchestration Layer injects concrete handler references into the in-process `tool-provider` catalog; on `remote-worker`, descriptors ship out and invocations marshal back to `tool-handlers` over the existing MCP bridge. The zod `inputSchema` (pure) stays with the descriptor in `tool-provider`; the parsed-arg **type** and the `ToolHandler<Args>`/`ToolContext` interfaces live in `@hyperidle/shared` so both halves reference them without depending on each other (§7.3). The shared tool types (`ToolContext`, `AssistantToolShape`, `ToolResult`) moving to `@hyperidle/shared` also dissolves the ~68 current `tools/tool-registry.ts ↔ handler` intra-`tools` call sites (they become shared type-imports + DI registration, not runtime Service edges) — see §10.

**Scope + cost (stated, not deferred):** the DI conversion of the 8 foreign-table + 3 db-importing handler bodies to injected ports **is** the work, and it is real, scheduled (**Increment 4**), and bounded (11 files). This is the "actual scope and cost" the critique demanded — not a "behavior unchanged, deps=shared, DB deferred" middle position (which was unreachable). What this WP proves: the package/dependency boundary (`tool-provider` deps = shared only, tsc-enforced; zero domain import) **and** the handler bodies relocated + DI-wired so no `agent-execution` package holds a domain/DB reference. What it does **not** newly build: the MCP proxy-back path (already exists) — it is reused unchanged.

---

## 8. Scaffolding template + generator (so ~31 packages is mechanical repetition)

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
**agent-execution Services drop `@hyperidle/db`** (zero DB access) and add their harness/MCP runtime deps; their cross-boundary port types come from `@hyperidle/shared` (db-free — §7.3), never from `@hyperidle/db`. This is consistent with §7.3: only db-keeping layers (core-api, orchestration) type ports off `@hyperidle/db`.

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
> Note the **three-level** relative depth (`../../../`) for nested packages, vs two-level for existing top-level packages. Create `tsconfig.base.json` at repo root holding the current `compilerOptions` so both depths extend one source. Layer packages additionally `references` their Service packages. agent-execution Service `tsconfig` drops the `../../db` reference (references `../../shared` only).

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

## 10. Composition-boundary edge census (Mechanism C — the genuinely new refactoring)

**This is a real edge-by-edge census, not an estimate.** Method (reproducible): map every one of the 238 production files to its §4 Service, parse each file's relative imports, resolve each import to its target file → target Service, and count distinct `sourceService → targetService` pairs (excluding intra-Service imports, imports of `@hyperidle/db`/`@hyperidle/shared`, and **routes/middleware/app-factory as source** — those are legitimate core-api Layer composition per §5). Tools are counted as a single `tools` unit here (their internal descriptor/handler split, §7.5, moves the shared tool types to `@hyperidle/shared` and DI-registers handlers, so the ~68 intra-`tools` `tool-registry ↔ handler` call sites do **not** become runtime Service edges).

**Result: 110 distinct Service→Service edges across 208 call sites at original census time; 111 distinct edges / 210 call sites after Increment 2c's `git-export → knowledge` addition; 112 distinct edges / 211 call sites after Increment 2f's `realtime → org` addition; 114 distinct edges / 214 call sites after Increment 2g's `retention → users` + `retention → knowledge` additions; 115 distinct edges / 215 call sites after Increment 3a's `trigger-resolution → org` addition; 118 distinct edges / 219 call sites after Increment 3b's `session-requests → org` + `session-requests → review` + `session-requests → knowledge` additions (3 new distinct edges) plus a second `session-requests → trigger-resolution` call site; 120 distinct edges / 223 call sites after Increment 3d's `session-requests → lifecycle-projection` (3 call sites — `insertIfAbsent`/`listProjectedBefore`/`deleteByRequestIds`) and `lifecycle-projection → session-requests` (1 call site — `projectExplicitStart`'s terminal-state write) additions (2 new distinct edges, §10.2 — the census is a floor, refinable during migration, per §10 method note); 121 distinct edges / 240 call sites after Increment 3g's `cost → org` addition (a genuinely NEW edge, 6 call sites — `getTeamMembersById` reads in `getTeamSpend`/`checkCostCap`/`recordCostAndCheck`, plus `incrementTeamMembersCost`/`resetTeamMembersCost`/`resetAllTeamMembersCost` writes) alongside three census corrections to `cost`'s originally-listed edges, all under-counted at original census time (`cost → settings` 1→2 call sites — `readServerConfig` + `updateServerConfig`; `cost → work` 1→3 call sites — `getTaskById` + `incrementBetCost` + `createItem`; `cost → users` 1→7 call sites — `getUserById` ×3 + `incrementUserCost`/`resetAllUserCost`/`sumAllUserCost`/`updateUser`); 121 distinct edges / 271 call sites after Increment 3h's six call-site corrections to `dispatch`'s originally-listed edges (no new distinct edge — every real target `dispatch`'s 5 source files touch was already census-listed), all under-counted at original census time: `dispatch → work` 2→8 (`listTasks`/`getTaskById`×2/`getBetById`×2/`createItem`×2/`findRetroItemByThreadIds`); `dispatch → routine` 4→19 (`insertRoutine`/`getRoutineById`×4/`insertRoutineRun`×3/`updateRoutineById`×6/`findRunningRoutineRun`/`listActiveRoutines`×2/`listScheduledRoutinesMissingNextRunAt`/`sumRoutineRunCostSince`); `dispatch → conversation` 3→8 (`insertMessage`×2/`listMessagesByThread`/`getThreadById`/`updateThread`/`getThreadIdsByHost`/`insertThread`×2); `dispatch → settings` 2→3 (`readServerConfig` ×3 — `agent-work-assistant.ts`×2 + `routine-scheduler.ts`×1); `dispatch → model-gateway` 1→3 (`resolveAgentModel`×1 + `resolveModelTier`×2); `dispatch → knowledge` 2→4 (`runAutoPromotionSweep`/`runStaleSweep`/the NEW `listRecentByLayers` portfolio-retro read/the collapsed `recomputeAttentionForCandidates`). `dispatch → users` (2, unchanged) and `dispatch → review` (1, unchanged — collapsed to a single `createPracticeMeeting` port method, see `@hyperidle/dispatch`'s `ports.ts` top `@lore`) matched the original count exactly. `dispatch § harness-registry`/`dispatch § mcp-provider` counts (4/1) are left as originally census-derived — both stay INTERIM forward-references (Increment 4), and their real shape collapsed to opaque `unknown` pass-through (`AdapterPool`/`McpBridgeRegistry`) plus one real interim factory call (`workspaceFactory.create()`), not a like-for-like function-call recount worth re-deriving before Increment 4 actually migrates those targets; 123 distinct edges / 279 call sites after Increment 3i's TWO census-missed additions (`session-lifecycle → filesystems`, 2 call sites — `mountFilesystemsForAgent`'s `listFilesystemIdsByAgent`/`listFilesystemsByIds`; `session-lifecycle → connections`, 3 call sites — the AN2 Phase-8b-connections block's `resolveOwningHumanUserId`/`buildProvisioningPlan`/`applyProvisioningPlan`, previously a dynamic `await import("@hyperidle/connections")` needing conversion since `composition-boundary-guard.ts` scans dynamic `import()` too) alongside one census correction to `session-lifecycle`'s originally-listed edges, under-counted at original census time (`session-lifecycle → session-requests` 2→5 call sites — `sessionRunRegistry` (2, unchanged) + two new `@hyperidle/session-requests` exports `requestAgentSessionTermination`/`findAgentSessionRequestTerminationReasonInTx` plus reusing the already-exported `listRunningAgentSessionRequests` (3), closing a pre-migration raw `agentSessionRequests` table read/write Table ACL violation in `requestAgentTermination`/`recoverRequestedTerminations`/`transitionAgentRunLifecycle`).** Each distinct edge becomes one DI port wired by the owning Layer (downward edges, §10.2) or one event-bus inversion (against-grain edges, §10.3). The per-source breakdown below sums exactly to 123 (post-3i).

### 10.1 Per-source summary (sums to 123, post-Increment-3i)

| Source Service | Layer | Distinct edges | Call sites |
|---|---|:--:|:--:|
| `dispatch` | orch | 16 | 60 |
| `session-lifecycle` | orch | 13 | 35 |
| `tools` (→ `tool-handlers`) | orch | 11 | 39 |
| `policy` | core-api | 8 | 19 |
| `review` | core-api | 6 | 8 |
| `session-requests` | orch | 10 | 13 |
| `context-assembly` | orch | 5 | 12 |
| `notifications` | core-api | 5 | 7 |
| `settings` | core-api | 5 | 5 |
| `filesystems` | core-api | 4 | 9 |
| `run-orchestration` | orch | 4 | 12 |
| `work` | core-api | 4 | 6 |
| `cost` | orch | 4 | 18 |
| `realtime` | core-api | 4 | 4 |
| `retention` | core-api | 3 | 4 |
| `trigger-resolution` | orch | 4 | 4 |
| `capture-writeback` | orch | 1 | 3 |
| `knowledge` | core-api | 2 | 2 |
| `lifecycle-projection` | orch | 3 | 3 |
| `agent-selection` | orch | 2 | 4 |
| `mcp-provider` | exec | 2 | 3 |
| `connections`, `harness-registry`, `model-gateway`, `observability`, `org` | (mixed) | 1 each (5 total) | 6 |
| `git-export` | core-api | 2 | 3 |
| **Total** | | **123** | **279** |

*Row updated post-Increment-3i: `session-lifecycle` moved from 11 distinct edges / 27 call sites to 13 / 35 — the real migration surfaced TWO census-missed edges (`session-lifecycle → filesystems`, 2 call sites — `mountFilesystemsForAgent`'s `listFilesystemIdsByAgent`/`listFilesystemsByIds`; `session-lifecycle → connections`, 3 call sites — the AN2 Phase-8b-connections block's `resolveOwningHumanUserId`/`buildProvisioningPlan`/`applyProvisioningPlan`, previously a dynamic `await import("@hyperidle/connections")` needing conversion since `composition-boundary-guard.ts` scans dynamic `import()` too) alongside one census correction to `session-lifecycle`'s originally-listed edges, under-counted at original census time: `session-lifecycle → session-requests` 2→5 (`sessionRunRegistry` (2, unchanged) + two new `@hyperidle/session-requests` exports `requestAgentSessionTermination`/`findAgentSessionRequestTerminationReasonInTx` plus reusing the already-exported `listRunningAgentSessionRequests` (3), closing a pre-migration raw `agentSessionRequests` table read/write Table ACL violation in `requestAgentTermination`/`recoverRequestedTerminations`/`transitionAgentRunLifecycle`). See `@hyperidle/session-lifecycle`'s `ports.ts` top comment.*

*Row updated post-Increment-3g: `cost` moved from 3 distinct edges / 3 call sites to 4 / 18 — the real migration surfaced a NEW `cost → org` edge (6 call sites: `getTeamMembersById` in `getTeamSpend`/`checkCostCap`/`recordCostAndCheck`, `incrementTeamMembersCost`, `resetTeamMembersCost`, `resetAllTeamMembersCost` — `teamMembers` is `org`'s `TABLE_OWNER`, and `cost-cap.ts` read/wrote it directly, an ownership violation the moment `cost-cap.ts` becomes its own Service package) plus corrected all three originally-listed edges, each under-counted at original census time: `cost → settings` 1→2 (`readServerConfig`+`updateServerConfig`), `cost → work` 1→3 (`getTaskById`+`incrementBetCost`+`createItem`), `cost → users` 1→7 (`getUserById` ×3 + `incrementUserCost`/`resetAllUserCost`/`sumAllUserCost`/`updateUser`). See `@hyperidle/cost`'s `ports.ts` top comment.*

*Row updated post-Increment-3f: `capture-writeback` moved from 2 distinct edges / 3 call sites to 1 / 3 — the real migration surfaced a THIRD `capture-writeback → knowledge` call site (`writeback.ts`'s two raw `knowledgeConflicts` inserts, unified into one `recordConflict` port method, alongside the originally-listed `create`/`update`) while the originally-listed `capture-writeback → context-assembly` edge (1 call site, `Manifest`/`ManifestEntry`) DISSOLVED entirely — it was always a pure-type reference, never a runtime call, and Mechanism C forbids importing even a real target's types cross-Service; the shape is now a local structural mirror in `ports.ts`, same idiom as the `settings → *(catalog)*` dissolution (§10.2). Net: distinct edges −1 (2→1), call sites unchanged (3, the +1 `recordConflict` call site cancels the −1 dissolved edge). See `@hyperidle/capture-writeback`'s `ports.ts` top comment.*

*Row updated post-Increment-3e: `agent-selection` moved out of the "1 each" group — the real migration found the original 2-call `agent-selection → users` count under-counted (3 real call sites: `isAgentAtWipLimit`, `enumerateTeamCandidates`'s `listActiveAiUsersByTeams`, `selectOwner`'s `getUserById`) and surfaced a census-missed edge (`agent-selection → org`, 1 call site, `enumerateTeamCandidates`'s `teamMembers` membership-group read, converted to `getTeamMembersByTeamId` under the same 1:1-invariant equivalence `trigger-resolution`/`session-requests` already established). See `@hyperidle/agent-selection`'s `ports.ts` top comment.*

*Row updated post-Increment-3d: `session-requests` moved from 9 distinct edges / 10 call sites to 10 / 13 — the real migration closed its own Increment-3b interim `agent_lifecycle_inbox` forward-reference for real (`session-requests → lifecycle-projection`, 3 call sites: `insertIfAbsent` in `terminalizeAgentSessionRequestInTx`, `listProjectedBefore`+`deleteByRequestIds` in `reapTerminalAgentWorkIntents`). `lifecycle-projection` moved from 2 distinct edges / 2 call sites to 3 / 3 — the real migration surfaced a census-missed edge (`lifecycle-projection → session-requests`, 1 call site, `projectExplicitStart`'s `explicit_session_starts` terminal-state write, previously an inline `packages/server` raw table update at original census time) alongside the two originally-listed edges (`→ routine`/`→ work`). See `lifecycle-projection`'s `ports.ts` top comment.

*Row updated post-Increment-3b: `session-requests` moved from 6 distinct edges / 6 call sites to 9 / 10 — the real migration surfaced THREE census-missed edges (`session-requests → org`, 1 call site, `teamMembers` membership-group read in `resolveAuthoritativeInput`'s `bet_decomposition` branch; `session-requests → review`, 1 call site, `proposedCalls ⋈ tailoredGrants` read in the `reengagement` branch; `session-requests → knowledge`, 1 call site, `knowledgeItems` read in the `knowledge_action` branch) alongside a SECOND `session-requests → trigger-resolution` call site (`markRequestRunning`'s post-admission `triggerResolutionHistory.session_id` backfill, flagged at Increment 3a, closed here) — same distinct edge, +1 call site, +0 distinct edges. See `@hyperidle/session-requests`'s `ports.ts` top comment.*

*Row updated post-Increment-2c: `git-export` moved out of the "1 each" group — the real migration surfaced a second, census-missed edge (`git-export → knowledge`, 2 call sites) alongside the originally-listed `git-export → settings` (1 call site). See `git-export`'s `ports.ts` top comment.*

*Row updated post-Increment-2f: `realtime` moved from 3 distinct edges / 3 call sites to 4 / 4 — the real migration surfaced a census-missed edge (`realtime → org`, 1 call site, `senderInTeam`'s `teamMembers` read) alongside the three originally-listed edges (`realtime → work`/`→ conversation`/`→ users`). See `realtime`'s `ports.ts` top comment.*

*Row updated post-Increment-2g: `retention` moved out of the "1 each" group — the real migration surfaced TWO census-missed edges (`retention → users`, 2 call sites for `reapLoginSessions`/`reapInviteCodes`; `retention → knowledge`, 1 call site for `reapKnowledgeAccessLog`) alongside the originally-listed `retention → notifications` (1 call site). Both new edges were raw `@hyperidle/db` table access at original census time (not a countable relative-import edge until `users`/`knowledge` existed as real owner packages — Table ACL is what surfaces them, on migrating `retention` for real). See `retention`'s `ports.ts` top comment. This closes Increment 2 (core-api non-SQL Services).*

### 10.2 Full edge table (all 123, post-Increment-3i — the migration inventory)

Legend: `→` legal **downward** DI (orchestration→core-api, intra-layer) — becomes an injected port wired by the owning Layer. `§` = **execution seam** (orchestration→execution) — becomes `HarnessPort`/execution-port injection at the Application tier (not a package dep, §7.4). `⚠` = **against-grain** (core-api→orchestration/execution) — cannot be a downward DI port; **inverts through the existing `EventBus`** (the lower Service emits a domain event; the higher Service subscribes — the pattern `bet-decomposition-subscriber.ts` / `notification-listener.ts` already use) **or** is reclassified. These ⚠ edges are the real risk the census surfaces (§10.3).

**core-api sources (47 edges):**

| Source | → Target | calls | example |
|---|---|:--:|---|
| connections | → users | 1 | connection-provisioning → user-store |
| filesystems | → git-export | 4 | git-clone-adapter → git-export-runner |
| filesystems | ⚠ capture-writeback | 2 | file-watcher → writeback |
| filesystems | → work | 2 | dependency-watcher → work-service |
| filesystems | → connections | 1 | filesystem-reachability → service-connection-resolver |
| git-export | → settings | 1 | git-export-config → server-config |
| git-export | → knowledge | 2 | computeExportPlan → listExportableKnowledgeItems |
| knowledge | → review | 1 | attention-service → review-item-factory |
| knowledge | → work | 1 | attention-service → work-service |
| model-gateway | → connections | 1 | model-gateway → credential-resolver |
| notifications | → settings | 3 | silence-policy → server-config |
| notifications | → conversation | 1 | daily-digest → conversation-store |
| notifications | → work | 1 | daily-digest → work-service |
| notifications | → users | 1 | silence-policy → user-store |
| notifications | → connections | 1 | config → credential-encryption |
| observability | → settings | 1 | observability/config → server-config |
| org | → users | 2 | scaffold-agents → user-store |
| policy | → work | 6 | approval-rate → work-service |
| policy | → conversation | 4 | approval-rate → conversation-store |
| policy | → notifications | 2 | lifecycle-propagation → notification-queue |
| policy | → users | 2 | lifecycle-propagation → user-store |
| policy | ⚠ session-requests | 2 | handoff-protocol → agent-work-intents |
| policy | → knowledge | 1 | lifecycle-propagation → knowledge/types |
| policy | ⚠ cost | 1 | handoff-protocol → cost-cap |
| policy | ⚠ session-lifecycle | 1 | handoff-protocol → session-lifecycle |
| realtime | → work | 1 | ws-broadcaster → work-service |
| realtime | → conversation | 1 | ws-broadcaster → conversation-store |
| realtime | → users | 1 | ws-broadcaster → user-store |
| realtime | → org | 1 | ws-broadcaster → team-lookup (census correction, added Increment 2f — see `realtime`'s `ports.ts` top comment) |
| retention | → notifications | 1 | retention-reaper → notification-queue |
| retention | → users | 2 | retention-reaper → reapLoginSessions/reapInviteCodes (census correction, added Increment 2g — see `retention`'s `ports.ts` top comment) |
| retention | → knowledge | 1 | retention-reaper → reapKnowledgeAccessLog (census correction, added Increment 2g — see `retention`'s `ports.ts` top comment) |
| review | → work | 2 | session-review-creator → work-service |
| review | → conversation | 2 | session-review-creator → conversation-store |
| review | → org | 1 | session-review-creator → org-routing |
| review | → users | 1 | session-review-creator → user-store |
| review | → knowledge | 1 | practice-meeting → knowledge/types |
| review | ⚠ session-requests | 1 | proposed-call-workflow → agent-work-intents |
| settings | → routine | 1 | plugin-configuration → routine-service |
| settings | → users | 1 | plugin-configuration → user-store |
| settings | → connections | 1 | server-config → credential-encryption |
| settings | → model-gateway | 1 | server-config → model-gateway |
| settings | → *(catalog)* | 1 | plugin-configuration → builtin-tool-catalog → **reclassified to `@hyperidle/shared` (§5), edge dissolves** |
| work | ⚠ session-requests | 2 | task-state-machine → agent-work-intents |
| work | ⚠ agent-selection | 2 | bet-decomposition → agent-defaults/resolvers |
| work | ⚠ cost | 1 | bet-decomposition → cost-cap |
| work | → users | 1 | bet-decomposition → user-store |

**agent-orchestration sources (65 edges):**

| Source | → Target | calls | example |
|---|---|:--:|---|
| agent-selection | → users | 3 | agent-selection → user-store (census correction, count updated Increment 3e — see `@hyperidle/agent-selection`'s `ports.ts` top comment) |
| agent-selection | → org | 1 | select-agent → team-lookup (census correction, added Increment 3e) |
| capture-writeback | → knowledge | 3 | writeback → create/update/recordConflict (census correction, count updated Increment 3f — see `@hyperidle/capture-writeback`'s `ports.ts` top comment) |
| capture-writeback | → context-assembly | 0 | writeback → Manifest/ManifestEntry → **DISSOLVED Increment 3f: pure-type reference, never a runtime call; declared as a local structural mirror in `ports.ts` instead (Mechanism C forbids cross-Service type imports too), same idiom as `settings → *(catalog)*`'s dissolution above** |
| context-assembly | → knowledge | 7 | context-assembly-prompt → role-community-map |
| context-assembly | → work | 2 | session-context → work-service |
| context-assembly | → filesystems | 1 | assemble-context → file-watcher |
| context-assembly | → routine | 1 | session-context → routine-service |
| context-assembly | → users | 1 | session-context → user-store |
| cost | → settings | 2 | cost-sentinel → server-config (census correction, count updated Increment 3g — see `@hyperidle/cost`'s `ports.ts` top comment) |
| cost | → work | 3 | cost-cap → work-service (census correction, count updated Increment 3g) |
| cost | → users | 7 | cost-cap → user-store (census correction, count updated Increment 3g) |
| cost | → org | 6 | cost-cap → team-lookup (census addition, NEW edge, Increment 3g) |
| dispatch | → routine | 19 | routine-scheduler/builtin-routine-handlers → routine-service (census correction, count updated Increment 3h — see `@hyperidle/dispatch`'s `ports.ts` top `@lore`) |
| dispatch | § harness-registry | 4 | agent-work-assistant → adapter-pool (interim — `AdapterPool`/`McpBridgeRegistry` collapsed to opaque `unknown` pass-through this migration; count left as originally census-derived, not a like-for-like recount, see `ports.ts` top `@lore`) |
| dispatch | → conversation | 8 | agent-work-assistant/assistant-dispatcher/builtin-routine-handlers → conversation-store (census correction, count updated Increment 3h) |
| dispatch | → work | 8 | task-dispatcher/builtin-routine-handlers → work-service (census correction, count updated Increment 3h) |
| dispatch | → tool-handlers | 2 | agent-work-assistant → assistant-draft-registry |
| dispatch | → users | 2 | agent-work-assistant → user-store |
| dispatch | → knowledge | 4 | builtin-routine-handlers → promotion-pipeline/portfolio-retro-store/attention-service (census correction, count updated Increment 3h — includes the NEW `listRecentByLayers` portfolio-retro read) |
| dispatch | → settings | 3 | agent-work-assistant/routine-scheduler → server-config (census correction, count updated Increment 3h) |
| dispatch | § mcp-provider | 1 | agent-work-assistant → mcp-bridge-registry |
| dispatch | → model-gateway | 3 | agent-work-assistant → model-gateway (census correction, count updated Increment 3h) |
| dispatch | → session-lifecycle | 1 | agent-work-assistant → session-provisioning |
| dispatch | → agent-selection | 1 | agent-work-assistant → agent-defaults/resolvers |
| dispatch | → run-orchestration | 1 | agent-work-assistant → agent-run-boundary |
| dispatch | → session-requests | 1 | routine-scheduler → agent-work-intents |
| dispatch | → cost | 1 | routine-scheduler → cost-cap |
| dispatch | → review | 1 | builtin-routine-handlers → practice-meeting (collapsed call shape, see `ports.ts` top `@lore`) |
| lifecycle-projection | → routine | 1 | agent-lifecycle-projectors → routine-service |
| lifecycle-projection | → work | 1 | agent-lifecycle-projectors → work-service |
| lifecycle-projection | → session-requests | 1 | projectExplicitStart → projectExplicitSessionStartTerminalState (census correction, added Increment 3d — see `lifecycle-projection`'s `ports.ts` top comment) |
| run-orchestration | → session-lifecycle | 5 | agent-layer-boot → session-lifecycle |
| run-orchestration | → session-requests | 4 | agent-layer-boot → agent-session-requests |
| run-orchestration | § harness-registry | 2 | worker-ws → adapter-pool |
| run-orchestration | → dispatch | 1 | agent-layer-boot → agent-work-assistant |
| session-lifecycle | § harness-registry | 7 | session-provisioning → adapter-pool |
| session-lifecycle | → routine | 3 | session-provisioning → routine-service |
| session-lifecycle | → work | 3 | session-provisioning → work-service |
| session-lifecycle | → context-assembly | 3 | session-provisioning → assemble-context |
| session-lifecycle | § mcp-provider | 2 | session-provisioning → mcp-bridge |
| session-lifecycle | § tool-provider | 2 | session-provisioning → return-status-tool |
| session-lifecycle | → cost | 2 | session-provisioning → cost-cap |
| session-lifecycle | → session-requests | 5 | session-provisioning → session-run-registry; requestAgentTermination/recoverRequestedTerminations/transitionAgentRunLifecycle → requestAgentSessionTermination/findAgentSessionRequestTerminationReasonInTx/listRunningAgentSessionRequests (census correction, count updated Increment 3i — see `@hyperidle/session-lifecycle`'s `ports.ts` top comment) |
| session-lifecycle | → observability | 1 | session-provisioning → observability/dispatcher |
| session-lifecycle | → settings | 1 | session-provisioning → server-config |
| session-lifecycle | → users | 1 | session-provisioning → user-store |
| session-lifecycle | → filesystems | 2 | mountFilesystemsForAgent → listFilesystemIdsByAgent/listFilesystemsByIds (census addition, NEW edge, Increment 3i) |
| session-lifecycle | → connections | 3 | AN2 Phase-8b-connections block → resolveOwningHumanUserId/buildProvisioningPlan/applyProvisioningPlan (census addition, NEW edge, Increment 3i) |
| session-requests | → routine | 1 | agent-work-intent-worker → routine-service |
| session-requests | → work | 1 | agent-work-intent-worker → work-service |
| session-requests | → agent-selection | 1 | agent-work-intent-worker → agent-selection |
| session-requests | → conversation | 1 | agent-work-intent-worker → conversation-store |
| session-requests | → trigger-resolution | 2 | agent-work-intent-worker → trigger-resolution; markRequestRunning → recordSessionForResolutionHistory (census correction, added Increment 3b) |
| session-requests | → users | 1 | agent-work-intent-worker → user-store |
| session-requests | → org | 1 | agent-work-intent-worker → team-membership (census correction, added Increment 3b — see `session-requests`'s `ports.ts` top comment) |
| session-requests | → review | 1 | agent-work-intent-worker → findGrantedProposedCall (census correction, added Increment 3b) |
| session-requests | → knowledge | 1 | agent-work-intent-worker → findById (census correction, added Increment 3b) |
| session-requests | → lifecycle-projection | 3 | terminalizeAgentSessionRequestInTx → insertLifecycleInboxFactIfAbsent; reapTerminalAgentWorkIntents → listProjectedLifecycleInboxBefore/deleteLifecycleInboxByRequestIds (resolves the Increment-3b interim forward-reference; added Increment 3d) |
| trigger-resolution | → session-requests | 1 | trigger-resolution → agent-session-requests |
| trigger-resolution | → settings | 1 | trigger-resolution → plugin-configuration |
| trigger-resolution | → users | 1 | trigger-resolution → user-store |
| trigger-resolution | → org | 1 | trigger-resolution → team-membership (census correction, added Increment 3a — see `trigger-resolution`'s `ports.ts` top comment) |
| tools | → work | 13 | route-item → item-router |
| tools | → users | 7 | create-item → user-store |
| tools | → conversation | 4 | create-item → conversation-store |
| tools | → knowledge | 3 | query-practice → knowledge-repository |
| tools | → org | 3 | create-item → org-routing |
| tools | → agent-selection | 2 | add-agent → agent-defaults/resolvers |
| tools | → routine | 2 | create-routine → routine-service |
| tools | → dispatch | 2 | create-routine → routine-scheduler |
| tools | § harness-registry | 1 | return-status-tool → return-enforcement-registry |
| tools | → policy | 1 | handoff-to → handoff-protocol |
| tools | → session-lifecycle | 1 | handoff-to → session-lifecycle |

> *`tools` source rows use the merged census unit. Under the §7.5 split these route as: the 10 domain-/orchestration-touching tool edges (`work`,`users`,`conversation`,`knowledge`,`org`,`agent-selection`,`routine`,`dispatch`,`policy`,`session-lifecycle`) → **`tool-handlers`** (orchestration) downward-DI/intra-layer; the single execution-internal edge `return-status-tool → harness-registry` stays intra-`agent-execution` in **`tool-provider`** (so it is NOT an orch→exec seam). `dispatch → tool-handlers` (assistant-draft-registry) is intra-orchestration.*

**agent-execution sources (3 edges — all intra-execution, resolved by the §7.5 split):**

| Source | → Target | calls | example |
|---|---|:--:|---|
| harness-registry | → tool-provider | 1 | builtin-harness-adapter → tool-registry (intra-exec, descriptor side) |
| mcp-provider | → tool-provider | 2 | mcp-bridge → tool-registry (intra-exec, descriptor side) |
| mcp-provider | → harness-registry | 1 | mcp-route → return-enforcement-registry (intra-exec) |

*(The prior draft's `harness-registry/mcp-provider → tools` edges land on the `tool-provider` descriptor half — all intra-`agent-execution`, legal. No execution Service touches a domain Service or the DB.)*

### 10.3 Against-grain edges — the real finding the census surfaces

Nine core-api→orchestration/execution edges (16 call sites) run **against the downward-dependency grain** and therefore **cannot** be plain injected ports (a core-api Service package listing an orchestration dep fails Mechanism C / `tsc`). Each inverts through the **existing `EventBus`** (emit domain event ↓, subscribe ↑) or is reclassified — confirmed per-edge at its increment:

| Against-grain edge | Resolution lever |
|---|---|
| `work ⚠ session-requests` (×2), `work ⚠ agent-selection` (×2), `work ⚠ cost` (×1) | `work` emits a domain event (`bet-decomposed`, `task-ready`); `session-requests`/`agent-selection`/`cost` subscribe. The `bet-decomposition-subscriber.ts` inversion pattern already exists — extend it. |
| `policy ⚠ session-requests` (×2), `policy ⚠ cost` (×1), `policy ⚠ session-lifecycle` (×1) | `handoff-protocol.ts` is orchestration-flavored — **reclassify `handoff-protocol` into an orchestration Service** (candidate: `dispatch` or a `handoff` Service) so these become intra-orchestration; else invert via event. **Decided (Increment 2a, confirmed at Increment 2g — see below): DEFER to Increment 3.** |
| `review ⚠ session-requests` (×1) | `proposed-call-workflow` emits a "call proposed" event; `session-requests` subscribes (records the intent). |
| `filesystems ⚠ capture-writeback` (×2) | `file-watcher` already fires on sandbox change — emit that as an event; `capture-writeback` subscribes. Pure inversion, no reclassification. |
| `settings ⚠ (builtin-tool-catalog)` (×1) | **reclassified**: `builtin-tool-catalog` → `@hyperidle/shared` (static data, §5). Edge dissolves entirely — no inversion needed. |

The migration must **not** reproduce the ad-hoc-route bypass anti-pattern (MEMORY: post-bet-retro bypassed the durable-intent queue) — every inversion routes through the standard durable-event / durable-intent path, never a fresh side-channel.

**`handoff-protocol` reclassification — final Increment-2 decision (resolved at Increment 2g, retention, the last Increment 2 item, as scheduled):** DEFER, confirmed. The three against-grain targets (`session-requests`, `cost`, `session-lifecycle`) are still not real packages — all three are scheduled Increment 3, which has not started. Reclassifying `handoff-protocol` into a real orchestration Service (`dispatch` or a new `handoff` Service) now would mean standing up an agent-orchestration Service ahead of its own increment, purely to host one core-api Service's outbound edges — a structural inversion of the plan's increment ordering for no present benefit (the interim DI ports built at Increment 2a already satisfy Mechanism C correctly; they are not incorrect, just not-yet-inverted-to-EventBus). `handoff-protocol.ts` stays in `@hyperidle/policy` with its three interim DI ports (`PolicyAgentWorkIntentRecorder`/`PolicyAgentSessionRequestReader`/`PolicySessionRunRegistry`, `PolicyCostDedupReleaser`, `PolicySessionTerminationRequester` — `packages/core-api/policy/src/ports.ts`), each already flagged with an Increment-3 EventBus-rewire `@lore`. This closes Increment 2's "Decide `handoff-protocol` reclassification" action item (§12) — the decision is DEFER, not an open question; Increment 3 executes the actual EventBus inversion (or, if `dispatch`/a `handoff` Service is stood up first and the edges turn out to compose more naturally as intra-orchestration DI at that point, the reclassification lever stays available — but the inversion is the default, sanctioned lever, not reclassification).

**§10.3 amendment — atomicity carve-out (decided 2026-07-14, founder-directed, resolves Increment 3b's founder-signoff on `policy ⚠ session-requests`/`review ⚠ session-requests`):** the EventBus-inversion default is **not unconditional**. `session-requests`'s Increment-3b migration reached the two edges where the interim DI port carries a caller-supplied `tx` into the SAME transaction as the source Service's own domain write — `handoff-protocol.ts`'s `findBySessionId` read feeding a same-request `requestTermination` branch, and `composeTailoredGrant`'s intent record inside the identical transaction as its `tailoredGrants` insert + `proposedCalls` status transition. An emit-after-commit EventBus inversion would split each into two transactions; a crash between them leaves a granted call / terminated session with no recorded intent — **a genuine durability regression**, not a mechanical rewire. This is not a novel problem: `plans/AU9/requirements.md` (the source of the durable-intent guarantee these ports protect) states the rule directly — *"Persist the domain action first, then emit its typed event with the durable source identity and idempotency key."* — i.e. AU9 itself mandates synchronous, same-transaction recording; an event is how OTHER consumers learn about the fact afterward, not how the fact gets durably recorded in the first place. §11's `AgentWorkIntentRecorder` (the `routes/threads.ts` case, resolved earlier in this same plan) already established the exception lever for exactly this shape: an Application-wired synchronous port that carries the caller's `tx`, not an EventBus emit. Mechanism C is not weakened by this — `composition-boundary-guard` already confirms `policy`/`review` depend on no orchestration package (`@hyperidle/db`/`@hyperidle/shared` only); the concrete wiring is supplied by the composition root (today `packages/server`, Increment-5's `desktop`/`remote-server` Applications going forward), exactly as §11 specifies.

**Ruling:** `policy ⚠ session-requests` (via `handoff-protocol.ts`) and `review ⚠ session-requests` (via `composeTailoredGrant`) are **permanent** Application-wired synchronous DI ports — remove their "Increment-3 EventBus rewire" `@lore` flags (the rewire will not happen; replace with a comment citing this ruling + AU9's requirements.md line 51 + §11's precedent). This is a **case-by-case exception**, not a blanket retraction of the EventBus-inversion default — every other against-grain edge (`work ⚠ session-requests`/`agent-selection`/`cost`, `policy ⚠ cost`, `policy ⚠ session-lifecycle`, `filesystems ⚠ capture-writeback`) still needs its own atomicity check before Increment 3 finalizes it: if the source Service's write is NOT sharing a transaction with the target read/write (the common case — most of these are fire-and-forget domain-event shapes, matching `bet-decomposition-subscriber.ts`'s existing pattern), the EventBus inversion is still the correct, sanctioned default and should proceed as originally planned. `policy ⚠ cost` and `policy ⚠ session-lifecycle` stay deferred (those Services don't exist yet) — when their increment arrives, apply this same same-transaction test before choosing EventBus vs. permanent DI port; do not assume either outcome from this ruling alone.

---

## 11. `agent_work_intents` TABLE_OWNER + accessor closure (AC-9) — concrete DI mechanism (W1)

Owner module: `services/agent-work-intents.ts` (exports `recordAgentWorkIntent`, `reapTerminalAgentWorkIntents`) → the sole table path inside the **`session-requests`** Service package. `agentWorkIntents`/`agentSessionRequests` get `TABLE_OWNER` rows (§7.1). The **three known non-owner accessors** are closed **this WP** (Increment 3), each with a named mechanism — no migration-time TBD:

| Accessor | Layer | Current op | Concrete closure |
|---|---|---|---|
| `routes/threads.ts:1195` | core-api (route) | raw `tx.insert(agentWorkIntents)` **inside a transaction** (co-written atomically with the message insert at L1180) | **Application-injected, transaction-carrying recorder port.** Define `AgentWorkIntentRecorder { record(tx: DbTx, intent: AgentWorkIntentInput): Promise<void> }` in `@hyperidle/shared`. `session-requests` exports the concrete `recordAgentWorkIntent(tx, intent)` (it already accepts a tx-scoped write). Because a route is core-api and the table is orchestration-owned, the route **must not** import `session-requests` — the **Application** (`desktop`/`remote-server` bootstrap) obtains the concrete recorder from the `agent-orchestration` Layer and passes it into `createApp(deps)`/`server-factory` (which already threads a `Deps` bundle — `TaskDispatcherDeps`, `AssistantTurnDeps`, etc.); the threads route reads `deps.recordAgentWorkIntent` from that bundle and calls `deps.recordAgentWorkIntent(tx, {...})` **inside its existing `tx`**, preserving atomicity. Mechanism C holds (no orchestration import in the route); cross-Layer wiring is done by the Application, as the model requires. |
| `routes/sessions-routes.ts` | core-api (route) | raw `read` | Same shape: an injected `AgentWorkIntentReader` port (in `@hyperidle/shared`), concrete from `session-requests`, supplied by the Application through `createApp(deps)`. Route calls `deps.readAgentWorkIntents(...)`. |
| `services/agent-layer-boot.ts` | orchestration (`run-orchestration`) | raw `read` | **Same Layer as the owner** → standard intra-orchestration Mechanism C: takes the reader as a DI param wired by the `agent-orchestration` Layer package. No Application involvement needed. |

**Why an injected recorder, not a route→Service import:** the model locks "a Layer composes only its own Services; cross-Layer wiring is the Application's job." A core-api route importing an orchestration Service would violate that. Injecting a `shared`-typed port that the Application wires keeps the route ignorant of orchestration while still recording a **durable** intent through the canonical `session-requests` writer (not a bypass channel). The recorder carries the caller's `tx` so the intent write stays atomic with the message write, matching today's behavior exactly.

Scheduled in **Increment 3** (when `session-requests` becomes a package); the three accessors close in the **same commit** — not deferred again.

**Closed at Increment 3b, same commit as the `session-requests` migration.** All three accessors landed exactly as designed: `routes/threads.ts`'s tx-carrying recorder and `routes/sessions-routes.ts`'s reader are `AgentWorkIntentRecorder<TTx>`/`AgentWorkIntentReader<TDb>` (generic-over-tx, since `@hyperidle/shared` has zero `@hyperidle/db` dependency) in `packages/shared/src/agent-work-intent-recorder.ts`, defaulted in `createApp`'s `AppOptions` (`agentWorkIntentRecorder`/`agentWorkIntentReader`, optional-injectable for tests) to `packages/server/src/services/session-requests-bindings.ts`'s real production singletons (concrete = `@hyperidle/session-requests`'s `recordAgentWorkIntent`/`findAgentWorkIntentByKindAndSource`), and threaded into `createThreadRoutes`/`createSessionRoutes` as explicit params. `agent-layer-boot.ts`'s boot-time reader is a direct `findAgentWorkIntentSourceByRequestId` import from `@hyperidle/session-requests` (intra-orchestration, no Application involvement, as designed). A fourth non-owner `agentSessionRequests` accessor surfaced during the same migration — `policy-bindings.ts`'s `HandoffDeps.sessionRequests.findBySessionId` ran a raw `agentSessionRequests` select in `packages/server` — closed the same way (mechanical repoint to a new `findAgentSessionRequestBySessionId` export), not flagged in this table's original three but the identical shape.

---

## 12. Ordered build plan (RESUMABLE — the increment checklist)

> A resuming builder reads this section + `git log` to know where things stand. Each increment = one commit, ends green. **Increment 0 is a hard gate.**

### Increment 0 — Minimal-slice enforcement proof  *(HARD GATE — nothing else starts until this is green + committed)*

Scope: prove all three mechanisms on the **smallest genuinely single-edge real slice** before touching the other ~230 files. (W2: the slice is deliberately narrowed to a **single real cross-Service edge** — `context-assembly ← knowledge` — with the other 4 context-assembly edges handled by clearly-marked transitional stubs, so the hard gate does not balloon.)

1. Root tooling: `tsconfig.base.json`; workspaces glob `packages/*/*`; `typecheck-gate.ts` recursion (§9.1–9.3). Prove: `npm run check` discovers a nested package.
2. `scripts/scaffold-service.ts` (§8) + create the 3 Layer packages `@hyperidle/core-api`, `@hyperidle/agent-orchestration`, `@hyperidle/agent-execution` (thin barrels).
3. Migrate **3 Service packages**:
   - `packages/core-api/knowledge/` — full Service, barrel = functions only, no raw table (proves Table ACL + barrel).
   - `packages/agent-execution/harness-registry/` — full Service, deps = shared + harness runtime, **no `@hyperidle/db`** (proves Mechanism B + the execution scaffold, §8).
   - `packages/agent-orchestration/context-assembly/` — its four files. **Only the `knowledge` edge is wired for real** — a `KnowledgeReader` port whose concrete impl is the real `@hyperidle/knowledge`, wired by the `agent-orchestration` Layer (the §7.3 worked example). Its **other four ports** (`WorkReader`, `UsersReader`, `RoutineReader`, `FilesystemsReader`) are wired to **explicit, clearly-commented transitional stubs in the Layer's Inc-0 wiring** (`// TRANSITIONAL STUB — replaced when work/users/routine/filesystems migrate, Inc 1–3`). **No transitional deep-import of `@hyperidle/server`.**
4. **Do not swap the Inc-0 `context-assembly` package into the live app.** `server-factory` keeps calling the existing in-`packages/server` `context-assembly` for production until Increment 3 fully migrates it (real work/users/routine/filesystems ports). This keeps **"no behavior change"** true (the stubbed ports are never on a production path) while the package still compiles, typechecks, passes all three guards, and is unit-tested on the real knowledge path — proving Mechanism C's DI wiring end-to-end for one real edge.
   - *Rejected alternative:* migrate all of context-assembly with the 4 non-knowledge ports wired to concrete impls deep-imported from `@hyperidle/server`. Rejected: it drags a transitional `@hyperidle/server` dep into the orchestration Layer + needs a guard carve-out, defeating "minimal."
5. Build the 3 general guards: `table-ownership-guard.ts` (map seeded with `knowledgeItems`), `execution-boundary-guard.ts`, `composition-boundary-guard.ts` — each with `--fixtures`. Wire into `lint` (alongside, not yet replacing, the `au*` guards).
6. **Three sanity-breaks — inject, confirm RED, revert, in the commit message / a scratch log:**
   - **A:** re-export the raw `knowledgeItems` table from `knowledge`'s barrel → `table-ownership-guard` (and/or a consumer touching it) fails → revert.
   - **B:** import `@modelcontextprotocol/sdk` (or `@hyperidle/harness-registry`) from `context-assembly` → `execution-boundary-guard` / `tsc` fails → revert.
   - **C:** add `"@hyperidle/knowledge": "*"` to `context-assembly`'s `package.json` dependencies and `import { list } from "@hyperidle/knowledge"` → `composition-boundary-guard` / `tsc` fails → revert.
7. Full existing test suite green; the migrated `knowledge`/`harness-registry`/`context-assembly` behavior unchanged (production still uses in-server context-assembly).

**Increment 0 exit = the enforcement scaffolding is real and proven on one genuinely single-edge slice. Commit. This satisfies AC-7 (minimal-slice + sanity-break-per-mechanism).**

### Increment 1 — core-api SQL-owning Services
Migrate `knowledge` (W3 correction — omitted from the original list despite being a core-api SQL-owning Service seeded in §4; Inc 0 already stood up its package skeleton alongside the untouched monolith, so this is the increment that finishes it for real and swaps it into production), `work`, `conversation`, `users`, `settings`, `notifications`, `routine`, `connections`, `org`, `review` (+confirm `review`'s table). Each: scaffold package (or finalize Inc-0's) → move files → barrel (no raw table) → add `TABLE_OWNER` row(s) → convert this group's outbound edges to DI wired by `core-api` Layer. `routes/*` move into the `@hyperidle/core-api` Layer package. Move `config/builtin-tool-catalog.ts` → `@hyperidle/shared` (§5). Green + commit.

**Increment 1a (this session's slice) — `knowledge` only, real cut-over:** move all 15 `packages/server/src/knowledge/*` files (+ tests) into `packages/core-api/knowledge/src/`, delete the old directory, repoint every real consumer (`routes/knowledge.ts`, `tools/promote-knowledge.ts`, `context-assembly`'s knowledge port, `dispatch/builtin-routine-handlers`, `review/practice-meeting`, `policy/lifecycle-propagation`, `work-service`'s knowledge edge per the §10 census) to `@hyperidle/knowledge`, add the `knowledgeItems` `TABLE_OWNER` row for real (guard already ships the map entry from Inc 0), and swap `context-assembly`'s Inc-0 transitional `KnowledgeReader` wiring from stub-adjacent to the actual production path (server-factory now boots the real migrated Service, not the in-`packages/server` copy). `work`/`conversation`/`users`/… remain scheduled but not started — a later session continues Increment 1 with the next Service in the list.

**Increment 1b–1j — `work`, `org`, `users`, `conversation`, `settings`, `notifications`, `connections`, `routine`, `review`:** each landed for real via the same pattern (scaffold/finalize package → move files → barrel functions-only → `TABLE_OWNER` row(s) → outbound edges to DI, §10.3 against-grain check → repoint consumers + `package.json` deps → verify → commit → independent checkpoint review). Full narrative + per-increment findings in `.pipeline/progress/AU19.json`. `review`'s increment (1j) surfaced the item below and did not close cleanly — Increment 1 is not done until it lands.

**Increment 1k — finish AU3's half-done Strategy-vocabulary rename (registered 2026-07-14, founder-directed):** `review`'s migration (1j) needed `taskStrategyFabric`'s `riskTier` (session-review-creator.ts). Investigating surfaced that AU3 (the Kernel/Strategy runtime retirement) never actually renamed `knowledgeStrategyFabric`/`taskStrategyFabric` — it left them as the real `pgTable` declarations and bolted `knowledgeAppProjection`/`taskPlanningSignals` on as mere JS alias exports (`export const taskPlanningSignals = taskStrategyFabric`), with physical SQL table names (`knowledge_strategy_fabric`/`task_strategy_fabric`) untouched "to avoid a destructive migration for existing databases" (schema.ts comment). Two consequences surfaced live in this Increment:
  1. `table-ownership-guard.ts`'s `TABLE_OWNER`-enforcement AST scan only recognizes `export const X = pgTable(...)` declarations, not alias assignments — importing the AU3-compliant alias name silently evades Table ACL enforcement entirely. The Inc-1a/1c builders worked around this by importing the *raw legacy* name in production code (`knowledge`'s barrel comment + `review`'s `session-review-creator.ts` both do this, documented inline) — which is itself a violation of AU3's "production code uses the app-owned alias" rule.
  2. `au3-runtime-vocab-guard.ts` (the guard meant to catch exactly that violation) never fired, because its `SOURCE_ROOTS` is hardcoded to `packages/server/src` and has been blind to every `packages/core-api/**` (and future `agent-orchestration/**`/`agent-execution/**`) file since Inc 0 — this is the same alias/scan-root gap flagged non-blocking since Inc-1a's checkpoint review (W1) and carried forward through Inc-1c, now materialized as a real, silent, cross-cutting regression rather than a theoretical one.

  **Decision (founder-directed — finish the rename for real, not a workaround):** this repo's philosophy is boil-the-lake, not legacy-preserving shims (`ETHOS.md`), and this is pre-launch software — a real, non-destructive rename is cheap and removes the confusion permanently rather than leaving TS code and SQL forever disagreeing on the table's name.
  - `packages/db/src/schema.ts`: the `pgTable` declarations themselves become `knowledgeAppProjection`/`taskPlanningSignals` (the *only* exported names — no more legacy alias pair); physical SQL table names renamed too (`knowledge_app_projection`/`task_planning_signals`) via a hand-authored, non-destructive migration (`ALTER TABLE ... RENAME TO ...`, this repo's existing hand-authored-incremental-SQL convention, `packages/db/drizzle/000N_...sql` + `meta/_journal.json` entry — see the `0049_AU18_drop_factory_settings.sql` precedent for style). Consolidate the currently-duplicated `Row`/`NewRow` type exports (schema.ts has both an app-projection pair near the alias declarations and a legacy pair near the bottom of the file — one canonical pair survives).
  - Every real consumer repointed to the single canonical name (`packages/db/src/index.ts`, `factory-bootstrap.ts`, `packages/eval/src/{judges,seeding,scenarios/*}.ts`, `packages/core-api/knowledge/src/index.ts`, `packages/core-api/review/src/{session-review-creator,index}.ts`, `scripts/{au3-runtime-vocab-guard,au14-knowledge-ownership-guard,table-ownership-guard}.ts`, integration test fixtures under `packages/server/src/__tests__/`) — zero remaining references to the legacy identifier anywhere outside historical `@lore`/migration-history prose.
  - `table-ownership-guard.ts`: `TABLE_OWNER` keys become the canonical names (`taskPlanningSignals: "packages/core-api/work"`, `knowledgeAppProjection: "packages/core-api/knowledge"` — see the ownership call below); the long comment explaining the alias-evades-the-AST-scan tradeoff is deleted, since there is no longer a second name to evade through.
  - `au3-runtime-vocab-guard.ts`: extend `SOURCE_ROOTS` to cover every migrated Layer (`packages/core-api`, `packages/agent-orchestration`, `packages/agent-execution`, recursively) so it is never again blind to a package this WP creates. (This also closes the general form of Inc-1a's carried W1/W2 for this specific guard.)
  - **Ownership call for `taskPlanningSignals` specifically:** `work` owns it, not `review`. `@lore O2` documents `riskTier` as data "moved from `tasks`" (owned by `work`) into its own extension table — same domain, same owner, matching the precedent this WP already set twice (`sessions` → `UNOWNED_SHARED_TABLES` because it is genuinely cross-cutting with no single domain owner; `org`'s `teamMembers` → `work`'s `TeamCapacityReader` DI port because `work` only *read* another Service's owned data). `review` has zero production writers and exactly one read site — it gets a new DI port (e.g. `TaskRiskTierReader`, mirroring `TeamCapacityReader`'s shape) wired to `work`'s real exported accessor, not direct table ownership. `knowledgeAppProjection` keeps its existing owner, `knowledge` (already correct — `knowledge` is the extension table's natural domain owner and already the sole accessor; only the alias-scan-blindness workaround needs fixing there, not the ownership assignment).
  - Verify: full rename compiles clean, migration applies cleanly against a fresh + an already-seeded local DB (rename, not drop/recreate — no data loss), `au3-runtime-vocab-guard.ts` now actually scans the migrated packages and stays green, `table-ownership-guard --fixtures` green, scoped tests for `work`/`knowledge`/`review`/`eval` green, `test:integration:service` green.

  This closes Increment 1 for real (review's 1j lands clean) and pre-empts the same alias/scan-root gap from recurring in every remaining increment.

### Increment 2 — core-api non-SQL Services — CLOSED
`policy`, `git-export`, `observability`, `model-gateway`, `filesystems`, `realtime`, `retention`. Confirm `policy`/`filesystems` table ownership (SQL or DI). Convert edges. **Decide `handoff-protocol` reclassification** (§10.3). Green + commit.

All seven Services landed (2a `policy`, 2b `filesystems`, 2c `git-export`, 2d `observability`, 2e `model-gateway`, 2f `realtime`, 2g `retention`). `policy`/`filesystems` table ownership confirmed (`policy` owns zero tables; `filesystems` owns three: `filesystems`/`filesystemInjections`/`filesystemCaptures`). `handoff-protocol` reclassification decided: DEFER — see §10.3's final-decision paragraph. Increment 2's real edge count (§10.1/§10.2) grew from the original 43/64/3-split census (110 total) to 114 via four census corrections surfaced during real migration (`git-export → knowledge` at 2c, `realtime → org` at 2f, `retention → users` + `retention → knowledge` at 2g) — all documented inline at their landing increment, per §14's "census is a floor, refinable during migration" sanction.

### Increment 3 — agent-orchestration Services
`trigger-resolution`, `session-requests` (**+ AC-9 `agent_work_intents` closure with the injected recorder/reader, §11**), `run-orchestration`, `lifecycle-projection`, `agent-selection`, `capture-writeback`, `cost`, `dispatch`, `session-lifecycle`. **Finalize `context-assembly`** (replace the Inc-0 transitional stubs with real work/users/routine/filesystems ports; swap into the live app). Add the `HarnessPort` interface to `@hyperidle/shared`; wire `session-lifecycle`/`run-orchestration` to it (not to `harness-registry`). Land the against-grain event-bus inversions (§10.3). Green + commit.

**3a `trigger-resolution` + 3b `session-requests` landed.** §11's AC-9 closure done (see §11's own closure note). `session-requests`'s real outbound edges (`routine`/`work`/`conversation`/`users`/`org`/`review`/`knowledge`/`trigger-resolution`, ordinary; `agent-selection` interim, not yet migrated) are injected DI ports per `ports.ts`; three census corrections (`org`/`review`/`knowledge`) plus a second `trigger-resolution` call site landed (§10.1/§10.2). `agent_lifecycle_inbox` (roster-assigned `lifecycle-projection`, not yet migrated) is written by `session-requests`' single-terminal-writer/reaper through an INTERIM `SessionRequestsLifecycleInboxWriter`/`Reaper` port, concrete impl still raw table ops in `packages/server` — this is a forward-reference, not against-grain (both Services are agent-orchestration), same interim-port shape as policy/work's against-grain precedent but for a different reason.

**3d `lifecycle-projection` landed.** Its `⛁` "confirm" column (§4) resolves to ONE owned table, `agentLifecycleInbox` (`agent-lifecycle-projectors.ts`'s claim/project/ack drain loop, moved unchanged from `packages/server/src/services/`). Its two real outbound edges (`routine`, `work`) are injected DI ports per `ports.ts`, ORDINARY downward DI (both core-api). This migration is also the primary forcing function that resolves `session-requests`' own Increment-3b interim `agent_lifecycle_inbox` forward-reference: `packages/server`'s `session-requests-bindings.ts` now wires `SessionRequestsLifecycleInboxWriter`/`Reaper` to `@hyperidle/lifecycle-projection`'s real exports instead of raw table ops — a genuinely NEW `session-requests → lifecycle-projection` edge (§10.2, 3 call sites). The migration also surfaced a NEW `lifecycle-projection → session-requests` edge (`projectExplicitStart`'s `explicit_session_starts` terminal-state write, previously an inline `packages/server` raw update at original census time, not a countable relative-import edge until both packages existed for real) — converted to `LifecycleProjectionExplicitSessionStartWriter`, wired to a new `@hyperidle/session-requests` export, `projectExplicitSessionStartTerminalState`. Both new edges are ORDINARY same-layer DI (both Services are agent-orchestration, neither above the other) — not §10.3 against-grain, and not needing the atomicity carve-out (the port carries the caller's `tx` directly, same-transaction DI being the normal downward/same-layer case, §7.3's worked example).

**3e `agent-selection` landed.** Its `⛁` "confirm" column (§4) resolves to zero owned tables, confirming the roster's original `—`/`—` entry. Its two real outbound edges (`users`, `org`) are injected DI ports per `ports.ts`, ORDINARY downward DI (`agent-selection` is agent-orchestration, both targets are core-api — same "orchestration reaches down" shape as every other ordinary edge in this Increment). Two census corrections landed: the `agent-selection → users` call count was under-counted (2 → 3: `isAgentAtWipLimit`, `enumerateTeamCandidates`'s `listActiveAiUsersByTeams`, `selectOwner`'s `getUserById`) and a genuinely NEW `agent-selection → org` edge surfaced (`enumerateTeamCandidates`'s `teamMembers` membership-group read, converted to `getTeamMembersByTeamId` under the same 1:1-invariant equivalence `trigger-resolution`/`session-requests` already established — see `ports.ts`'s top `@lore`). This migration is also the forcing function that resolves the LAST remaining interim forward-reference `session-requests` carried since Increment 3b: `packages/server`'s `session-requests-bindings.ts` now wires `SessionRequestsAgentSelector` to `@hyperidle/agent-selection`'s real `createAgentSelectionOps(...)`-bound exports instead of the deleted `services/agent-selection.ts` flat module. `work`'s own §10.3 against-grain `AgentSelectionDefaults` port (interim since Increment 1b) had its concrete wiring repointed the same way at `server-factory.ts` — per this item's explicit scope, the EventBus-inversion rewire itself is OUT OF SCOPE here (a later, separate item once `agent-selection`/`cost` have both landed, per Increment 3b's own closing note); this migration only lands `agent-selection` as an ordinary Service migration and repoints the two interim ports' concrete targets.

**3f `capture-writeback` landed.** Its `⛁` "confirm" column (§4) resolves to zero owned tables, confirming the roster's original `—`/`—` entry — `writeback.ts`'s only DB access is `sessions.notes` (`UNOWNED_SHARED_TABLES`, unaffected) plus the newly-ported `knowledge` writes. `writeback.ts` + `session-activity-buffer.ts` (+ its test) moved from `packages/server/src/services/` unchanged. `session-activity-buffer.ts` has zero outbound edges (pure `EventBus` subscriber). One census correction: `capture-writeback → knowledge` moves from the originally-listed 2 call sites (`create`/`update`) to 3 — `writeback.ts` also wrote `knowledgeConflicts` (`knowledge`'s `TABLE_OWNER`) directly via two raw `db.insert(...)` calls (a Table ACL violation the moment `writeback.ts` becomes its own Service package), converted to a new `@hyperidle/knowledge` export, `recordWritebackConflict` (`writeback-conflict-store.ts`). `update`'s `VersionConflictError` throw could not cross the port boundary as an `instanceof` check (Mechanism C forbids importing the error class cross-Service too) — the port's `update` returns a discriminated `CaptureWritebackUpdateResult` instead, translated at the composition root (`server-factory.ts`, the one place both `@hyperidle/knowledge` and the port type are legally importable together). `capture-writeback → context-assembly` (the census-listed 1 call site, `Manifest`/`ManifestEntry`) is a pure-type edge — `context-assembly.ts` is still the old flat `packages/server` file (its own "finalize" item hasn't landed), and even a real target's types are never imported cross-Service (Mechanism C) — declared locally in `ports.ts` as a structural mirror, same idiom `agent-selection`'s `TeamMember` mirror established; zero port method, no runtime edge. **Also resolves the inbound `filesystems ⚠ capture-writeback` (×2) against-grain edge (§10.3):** applied the atomicity test from §10.3's amendment — `file-watcher.ts`'s change detection is a filesystem read, not a DB write, so there is no shared transaction an async handoff could split — confirming §10.3 line 517's own prediction that this is the pure-inversion case. `@hyperidle/filesystems`' interim `FilesystemsWritebackProcessor` DI port (Increment 2b) is REMOVED; `file-watcher.ts`'s debounced flush now emits a new `EventBus` event, `sandbox_writeback_changes_detected` (`@hyperidle/shared`'s `events.ts`, `KernelEvent` union), and `@hyperidle/capture-writeback`'s `registerCaptureWriteback` subscriber (wired at boot, `server-factory.ts`, alongside `registerBetDecomposition`) drives `processWriteback` off it — the `bet-decomposition-subscriber.ts` fire-and-forget shape §10.3 points to. One accepted, documented behavior nuance: the pre-inversion `file-watcher.ts` proactively closed its `fs.watch` handles on an ENOENT signal it could see synchronously; post-inversion it cannot see the subscriber's outcome, so that early-stop optimization is dropped (safe — `session-lifecycle.ts` ALWAYS calls `ingestion.dispose()` at session end regardless, see `file-watcher.ts`'s own `@lore`). This closes the LAST §10.3 against-grain edge scheduled as a plain "check the atomicity test, apply the sanctioned default" item this Increment (`policy ⚠ cost`/`policy ⚠ session-lifecycle` stay deferred — `cost`/`session-lifecycle` still not real packages).

**3g `cost` landed.** Its `⛁` "confirm" column (§4) resolves to zero owned tables, confirming the roster's original `—`/`—` entry — `cost-cap.ts`'s only DB access is via `users`/`work`/`org`, none of which `cost` owns. `cost-cap.ts` + `cost-sentinel.ts` moved from `packages/server/src/services/` unchanged (no co-located unit tests existed; the four `cost-cap*`/`AF10-*`/`L17-*`/`factory-cost-actual`/`builtin-routines`/`sessions`/`R5-agent-work-loop`/`AF8-notification-delivery` `__tests__` integration files needing `{db,app,eventBus}` fixtures stayed in `packages/server/src/__tests__/`, repointed to `services/cost-bindings.js`). One census addition: `cost → org` (NEW edge, 6 call sites) — `cost-cap.ts` read/wrote `teamMembers` directly (per-team spend read, atomic `costActual` accumulation, reset writes); `teamMembers` is `org`'s `TABLE_OWNER` since Increment 1c, so this is a genuinely new ownership violation surfaced only now that `cost-cap.ts` becomes its own Service package (no guard boundary existed to catch it while flat in `packages/server`) — same shape as `agent-selection`'s Increment-3e `→ org` finding. Closed via a new `CostTeamAccessor` port wired to `org`'s pre-existing `getTeamMembersById` plus three new `org` exports added for this closure (`incrementTeamMembersCost`/`resetTeamMembersCost`/`resetAllTeamMembersCost`, `team-lookup.ts`, mirroring `@hyperidle/users`' `incrementUserCost`/`resetAllUserCost`). A parallel finding on the `work` edge: `cost-cap.ts`'s bet-cost accumulation built a `coalesce(bets.costActualMinor, 0) + delta` SQL fragment itself via a raw `updateBetById` patch, which would have required importing the `bets` table object directly (`bets` is `work`'s `TABLE_OWNER`) — closed the same way, a new `@hyperidle/work` export, `incrementBetCost` (mirrors the same coalesce-ownership idiom). Three census corrections landed on `cost`'s originally-listed edges (all under-counted at original census time — see `@hyperidle/cost`'s `ports.ts` top comment and §10.1's per-source footnote): `cost → settings` 1→2, `cost → work` 1→3, `cost → users` 1→7.
**This is also the forcing function for the two `cost`-targeted §10.3 against-grain edges, each resolved via its own atomicity check per the §10.3 amendment (line 526) — outcomes differ, as the amendment itself warns not to assume:**
- **`work ⚠ cost` (`CostCapChecker`, ×1) — RULED PERMANENT.** `bet-decomposition.ts`'s `runBetDecomposition` calls `deps.costCap.checkCostCap(...)` synchronously and branches on its `allowed` return value in the SAME code path (`if (!capResult.allowed) { markTerminal(...); return; }`) — a pre-flight budget QUERY consumed for control flow, not a fire-and-forget domain-event notification. `checkCostCap` itself performs zero writes (pure reads), so this is not even a "same transaction" borderline case — it fails the more fundamental test the §10.3 amendment's own `policy ⚠ session-requests` precedent already established: a synchronous read-then-branch whose return value gates the caller's next branch cannot be served by an EventBus's fire-and-forget, no-response-channel semantics, full stop. `server-factory.ts` repoints this port's concrete wiring to `@hyperidle/cost`'s real `createCostOps(...)`-bound `checkCostCap` (via the new `packages/server/src/services/cost-bindings.ts`) instead of the deleted `services/cost-cap.ts` flat module — mechanical, zero behavior change to the port's shape. See `@hyperidle/work`'s `ports.ts` top `@lore` for the full reasoning; `AgentWorkIntentRecorder` (`work`'s third §10.3 port, same-transaction write shape, already covered by the original amendment) is unaffected.

**FOUNDER RULING (2026-07-14, closes the founder-signoff this checkpoint raised):** approved as built — `work ⚠ cost` stays permanent. The reviewer correctly flagged that this broadens the amendment's test past literal same-transaction writes to synchronous read-then-branch control flow, and that the same broadened test logically applies to `work`'s still-open `AgentSelectionDefaults` port (deferred at Increment 3e). Verified directly: `bet-decomposition.ts`'s `selectOwner`/`enumerateTeamCandidates`/`resolveDecompositionPlan` calls are the identical synchronous request/response shape (return value consumed immediately to continue decomposition) — **`work ⚠ agent-selection` is ALSO RULED PERMANENT**, same reasoning, registered in `@hyperidle/work`'s `ports.ts` top `@lore`. This closes every §10.3 against-grain edge in the original census except `policy ⚠ session-lifecycle` (correctly deferred — `session-lifecycle` still not a real package). The broadened test is confirmed discriminating, not a blanket excuse: `filesystems ⚠ capture-writeback` (Increment 3f, same session as `cost`'s ruling) is a genuine fire-and-forget case and WAS successfully EventBus-inverted.
- **`policy ⚠ cost` (`PolicyCostDedupReleaser`, ×1) — INVERTED to EventBus, the sanctioned default.** `handoff-protocol.ts`'s `deps.cost.release(sessionContext.sessionId)` call was already POST-COMMIT (outside `buildHandoff`'s transaction) and touches only `cost`'s in-memory dedup `Map` — no DB write, no shared transaction an emit-after-commit split could endanger. This is the "common case" pure-inversion shape §10.3 describes (the `bet-decomposition-subscriber.ts`/`sandbox_writeback_changes_detected` idiom), NOT the `policy ⚠ session-requests`/`review ⚠ session-requests` same-transaction exception. `handoff-protocol.ts` now emits a NEW event, `session_handoff_completed` (`@hyperidle/shared`'s `events.ts`, `KernelEvent` union — handoff still deliberately does not emit `session_ended`, unchanged), in the exact spot the direct port call used to sit; `@hyperidle/cost`'s `registerCostCapDedupReleaser` now subscribes to both `session_ended` AND `session_handoff_completed`. `PolicyCostDedupReleaser` and `HandoffDeps.cost` are REMOVED from `@hyperidle/policy`'s `ports.ts`. Also required a new exhaustiveness-guard case in `@hyperidle/observability`'s `dispatcher.ts` (internal plumbing, not translated to an observability event — same treatment as `sandbox_writeback_changes_detected`) and in `packages/shared/src/__tests__/AL7-proposed-call-types.test.ts`'s `KernelEvent` exhaustive-switch test.

`policy ⚠ session-lifecycle` (×1) stays deferred, untouched — `session-lifecycle` has not migrated yet, still not a real package (a separate, later Increment-3 item). This closes the SECOND-TO-LAST §10.3 against-grain edge scheduled as a "check the atomicity test, apply the sanctioned lever" item this Increment.

**3h `dispatch` landed.** Its `⛁` "confirm" column (§4) resolves to zero owned tables, confirming the roster's original `—`/`—` entry. `task-dispatcher.ts`/`assistant-dispatcher.ts`/`routine-scheduler.ts`/`builtin-routine-handlers.ts`/`agent-work-assistant.ts` moved from `packages/server/src/services/` unchanged (behavior-preserving — one dead commented-out `createReviewItem` block in `routine-scheduler.ts` dropped, no functional change), alongside `config/builtin-routines.ts` (pure config, renamed `builtin-routines-config.ts`, no cross-Service imports). `dispatch`'s real outbound edges (`work`/`routine`/`conversation`/`users`/`settings`/`model-gateway`, ordinary downward; `agent-selection`/`run-orchestration`/`session-requests`/`cost`, ordinary same-layer per Mechanism C's no-same-layer-exception rule; `review`/`knowledge`, ordinary downward with two collapsed call shapes; `tool-handlers`/`harness-registry`'s workspace factory, INTERIM forward-references, Increment 4) are all injected `DispatchPorts` per `ports.ts`. No §10.3 against-grain edge targets `dispatch` — confirmed, `dispatch` only ever appears as a SOURCE row in the census. Six census corrections landed on `dispatch`'s originally-listed edges (all under-counted at original census time, no new distinct edge — see §10.1/§10.2 and `@hyperidle/dispatch`'s `ports.ts` top `@lore`): `work` 2→8, `routine` 4→19, `conversation` 3→8, `settings` 2→3, `model-gateway` 1→3, `knowledge` 2→4 (includes a genuinely NEW `listRecentByLayers` portfolio-retro read, closing a raw `knowledgeItems ⋈ knowledgeAppProjection` join `runPortfolioRetro` did directly — Table ACL violation the moment `builtin-routine-handlers.ts` becomes part of the `dispatch` package, new `@hyperidle/knowledge` file `portfolio-retro-store.ts`). Two call shapes genuinely COLLAPSED (not a 1:1 port-per-function mirror) because Mechanism C forbids `dispatch` from importing the Services it used to wire together itself: (1) the `practiceMeetingKnowledgeStore` construction (9 raw `@hyperidle/knowledge` accessors passed into `@hyperidle/review`'s `createPracticeMeeting`) collapsed into one `DispatchReviewAccessor.createPracticeMeeting` port method; (2) the `buildAttentionService({db, eventBus, work, review}).recomputeScope(filter)` wiring collapsed into one `DispatchKnowledgeAccessor.recomputeAttentionForCandidates` port method. Both wirings moved verbatim to the composition root (`packages/server/src/services/dispatch-bindings.ts`, the new binding file mirroring `cost-bindings.ts`/`session-requests-bindings.ts`/`run-orchestration-bindings.ts`'s factory-curry idiom) — `dispatch`'s own domain logic (the `sweep.scanned > 0`/`candidateIds.length > 0` branching) is unaffected, only the cross-Service wiring relocated. `HttpError`/`CassetteMissError` (previously `packages/server/src/harness/llm-client.ts`/`llm-cassette.ts`) reclassified to `@hyperidle/shared` — `mapErrorToNotice`'s `instanceof` checks need them across the agent-orchestration → agent-execution seam, and Mechanism C forbids a Service `instanceof`-checking another Service's class; both files now re-export the shared class unchanged (zero behavior change, same idiom `BUILT_IN_GATEWAY_CONFIG`'s Increment-1f reclassification established). `AdapterPool`/`McpBridgeRegistry` (harness-registry/mcp-provider, both still INTERIM) are pure pass-through values `agent-work-assistant.ts` never inspects — typed `unknown` on `AssistantTurnDeps` rather than reconstructed, same idiom `run-orchestration`'s own `ports.ts` documents for its `sessionWorkflow`/`conversational` fields; `LocalSandboxAdapter`'s per-turn construction moved behind a new interim `DispatchWorkspaceFactory` port. `run-orchestration`'s own `→ dispatch` port (interim since Increment 3c) is now REAL — its concrete wiring repoints from the deleted `agent-work-assistant.ts` to `dispatch-bindings.ts`'s bound `executeAssistantRequest`; the two files' pre-existing safe circular import (documented at Increment 3c) simply relocates to sit between `run-orchestration-bindings.ts` and `dispatch-bindings.ts` instead, same ESM-safety argument (every cross-reference lives inside a function body, never at module top-level). Two guard allowlist additions were required (both same-shape precedent as `session-requests-bindings.ts`/`run-orchestration-bindings.ts`'s own Increment-3b/3c entries): `au9-direct-handoff-guard.ts`'s `agentFiles` (dispatch-bindings.ts calls `executeAgentRunRequest` directly, no `...Internal` alias) and `au11-runtime-ownership-guard.ts`'s `AGENT_OWNED_ALLOWLIST` (dispatch-bindings.ts is now the sanctioned sink core routes reach for `provisionTeamRoutines`/`runBuiltinRoutine`/etc, stopping AC-2's transitive-reach recursion before it hits `harness/`/`tool-registry.ts`).

**§10.3 EventBus-rewire — partial landing, explicit split (Increment 3b).** Of the `session-requests`-targeted against-grain ports (`policy ⚠ session-requests` ×2, `review ⚠ session-requests` ×1), the DEFAULT lever (§10.3's own text) is the EventBus inversion. **Neither converted this increment — both stay ordinary DI ports, concrete wiring repointed to the now-real `@hyperidle/session-requests` package (mechanical, zero behavior change).** Reasoning, not a guess: `policy`'s `handoff-protocol.ts` uses `sessionRequests.findBySessionId` synchronously to decide whether to call `sessionLifecycle.requestTermination` in the same code path, both inside one transaction — EventBus fire-and-forget cannot preserve that read-then-branch control flow without a genuine redesign, out of scope for a mechanical migration. `review`'s `composeTailoredGrant` records the intent INSIDE the same transaction as its `tailoredGrants` insert + `proposedCalls` status transition — an EventBus emit-after-commit would split that into two transactions, weakening the durability guarantee `@lore AU9`'s "durable intent, no bypass channel" design repeatedly insists on. `policy ⚠ cost` (×1) and `policy ⚠ session-lifecycle` (×1) are untouched — `cost`/`session-lifecycle` have not migrated yet, still not real packages. **Flagged for founder/review confirmation** rather than silently forcing a durability-weakening inversion or silently declining the whole lever: see `policy`'s and `review`'s `ports.ts` top `@lore` comments for the per-port detail. The `bet-decomposition-subscriber.ts`-style inversion pattern §10.3 points to (`work`'s three against-grain ports) is untouched by this item — out of `session-requests`'s own migration scope, a candidate for a later, separate item once `agent-selection`/`cost` land (`agent-selection` landed at Increment 3e — its own `AgentSelectionDefaults` port stays an ordinary interim DI port for now, per that item's explicit scope; the inversion itself still waits on `cost`).

**3i `session-lifecycle` landed.** Its `⛁` "confirm" column (§4) resolves to zero owned tables, confirming the roster's original `—`/`—` entry. `session-provisioning.ts`/`session-lifecycle.ts`/`routine-session-reaper.ts`/`sandbox-reaper.ts`/`contracts.ts` (the last carrying `IngestionHandle`, this Service's real owner per that file's own pre-migration `@lore`) moved from `packages/server/src/services/` unchanged (behavior-preserving). Real outbound edges (`routine`/`work`/`users`/`settings`/`observability`, ordinary downward; `session-requests`/`cost`, ordinary same-layer) are injected `SessionLifecyclePorts` per `ports.ts`; `harness-registry`/`mcp-provider`/`tool-provider`-shaped touches and `context-assembly` stay INTERIM forward-references wired at the composition root (`packages/server/src/services/session-lifecycle-bindings.ts`, mirroring `cost-bindings.ts`/`session-requests-bindings.ts`/`run-orchestration-bindings.ts`'s factory-curry idiom), same shape `run-orchestration` used for its own harness-registry touch before Increment 4. **Two NEW census additions** (§10.1/§10.2, neither a countable relative-import edge until this migration made them real cross-package touches): `session-lifecycle → filesystems` (`mountFilesystemsForAgent`'s `listFilesystemIdsByAgent`/`listFilesystemsByIds` calls) and `session-lifecycle → connections` (the AN2 Phase-8b-connections block's `resolveOwningHumanUserId`/`buildProvisioningPlan`/`applyProvisioningPlan` calls — previously a dynamic `await import("@hyperidle/connections")`, already Mechanism-C-aware per Increment 1h's `deps.users` port on `resolveOwningHumanUserId`, but the dynamic import itself still needed converting since `composition-boundary-guard.ts` scans dynamic `import()` too). One census correction: `session-lifecycle → session-requests` moves from the originally-listed 2 call sites (`sessionRunRegistry`) to 5 — `session-lifecycle.ts`'s own `requestAgentTermination`/`recoverRequestedTerminations`/`transitionAgentRunLifecycle` raw-read/wrote `agentSessionRequests` directly pre-migration (a Table ACL violation the moment `session-lifecycle.ts` becomes its own Service package), closed via two new `@hyperidle/session-requests` exports (`requestAgentSessionTermination`, `findAgentSessionRequestTerminationReasonInTx`) plus reusing the already-exported `listRunningAgentSessionRequests` — see that package's `agent-session-requests.ts` top `@lore`. A parallel coalesce-ownership finding on the `routine` edge: `session-lifecycle.ts`'s `updateRoutineRunOnSessionEnd` built a `costActualMinor = coalesce(...) + n` SQL fragment itself via a raw `routines` table reference — closed the same way `cost`'s Increment-3g `bets`/`teamMembers` findings were, a new `@hyperidle/routine` export, `incrementRoutineCost`.

**This is also the forcing function that resolves the LAST remaining §10.3 against-grain edge, `policy ⚠ session-lifecycle`** (`handoff-protocol.ts`'s `requestTermination` call), per the atomicity test from the §10.3 amendment: the call ran BEFORE `buildHandoff`'s transaction even opened (using bare `db`, never a shared `tx`) and its return value was never consumed for branching (fire-and-forget) — the "common case" pure-inversion shape (`filesystems ⚠ capture-writeback`/`policy ⚠ cost`), NOT the `policy ⚠ session-requests`/`review ⚠ session-requests` same-transaction-write-consumed-for-control-flow exception. **INVERTED to EventBus, the sanctioned default.** `handoff-protocol.ts` no longer calls `deps.sessionLifecycle.requestTermination`/`deps.sessionRequests.findBySessionId` — both removed from `HandoffDeps` (`PolicySessionTerminationRequester`/`PolicyAgentSessionRequestReader`/`PolicyTerminationReason`/`PolicyTerminationRequest` deleted from `@hyperidle/policy`'s `ports.ts`/`index.ts`, no real call site remained). `session-lifecycle-bindings.ts`'s new `registerHandoffTerminationRequester(db, eventBus)` subscribes to the existing `session_handoff_completed` event (the same one `cost`'s `registerCostCapDedupReleaser` already subscribes to, Increment 3g) and re-resolves the correlated request via its own `session-requests` port before calling `requestAgentTermination` — registered at boot in `server-factory.ts` alongside `registerCostCapDedupReleaser`. **This closes every §10.3 against-grain edge in the original census** (the founder's 2026-07-14 broadened same-transaction/synchronous-read-then-branch test was applied and, unlike `work ⚠ cost`/`work ⚠ agent-selection`, came out on the EventBus-inversion side here — confirming the test is genuinely discriminating, not a rubber stamp for either lever).

**`HarnessPort` added to `@hyperidle/shared`** (`harness-port.ts`) per §12's explicit Increment-3 scope. §7.4's literal text sketches a single `provisionAndRun(bundle): Promise<RunOutput>` call; implementing that literally would collapse `admitSession`+`runSession` into one opaque call, losing the synchronous "know the sessionId immediately after admission" requirement `run-orchestration`'s detached-execution path depends on (`consumeAgentSessionRequest`'s `detachAfterAdmission` branch marks the request "running" with the admitted `sessionId` BEFORE `runSession` resolves, returning to the 1s poll loop without awaiting the run). Preserving that real behavior without inventing new callback-based signaling (a genuine design exercise, out of scope for a mechanical migration) means `HarnessPort` keeps the two-phase `admitSession`/`runSession` shape `run-orchestration` already had (`RunOrchestrationSessionProvisioner`, Increment 3c) as its two methods — a straight rename+relocation into the shared, Application-visible abstraction, not a new one (flagged as an interpretive deviation from §7.4's literal single-call text, documented in `harness-port.ts`'s own top `@lore`). `run-orchestration`'s `RunOrchestrationProvisionDeps`/`Params`/`AdmittedSession`/`ProvisionResult`/`SessionProvisioner` types are now straight aliases of `HarnessPortDeps<HyperIdleDb>`/`RunContextBundle`/`AdmittedRun`/`HarnessRunOutput`/`HarnessPort<HyperIdleDb>` — every existing reference in that package (`agent-session-runtime.ts`, `agent-layer-boot.ts`) is unchanged. `run-orchestration-bindings.ts`'s `sessionProvisionerPort` now wires directly to `session-lifecycle-bindings.ts`'s exported `harnessPort` (satisfying `HarnessPort<HyperIdleDb>`), replacing the Increment-3c interim wiring. Today (pre-Increment-5) `packages/server`'s composition root is still the one place that wires the concrete implementation — the `desktop`/`remote-server` split `HarnessPort` genuinely enables is Increment 5's own item.

One guard-allowlist addition (same shape as `session-requests-bindings.ts`/`run-orchestration-bindings.ts`/`dispatch-bindings.ts`'s own precedent): `au11-runtime-ownership-guard.ts`'s `AGENT_OWNED_ALLOWLIST` (`session-lifecycle-bindings.ts` is the sanctioned sink core routes reach for `admitSession`/`runSession`/`provisionSession`/`requestAgentTermination`/etc, stopping AC-2's transitive-reach recursion before it hits `harness/`/`mcp/`/`tool-registry.ts`). `au9-direct-handoff-guard.ts` needed no new entry — `session-lifecycle-bindings.ts` never literally calls the forbidden `provisionSession` symbol (it calls the aliased `provisionSessionInternal`).

**Still open after this item:** per §12's own Increment-0 note, Increment 3 also requires finalizing `context-assembly` (replacing the Increment-0 transitional stubs with real `work`/`users`/`routine`/`filesystems` ports and swapping the real package into the live app) before Increment 3 can be declared closed — this remains a separate, not-yet-started follow-up item.

**`teams` table ownership — founder ruling (2026-07-15, resolves context-assembly-finalize's founder-signoff):** context-assembly's `session-context.ts` reads `teams` directly; the builder's first attempt added `teams` to `UNOWNED_SHARED_TABLES`, citing pre-AU19 `@lore` in `work-service.ts`/`search.ts` claiming *"teams is not one of the [five] owned tables, so any file may query it."* **This is wrong — RULING: `teams` IS `org`-owned, per this document's own §4 line 69 (`| org | ⛁ | teams, org edges | ...`), which the exemption attempt contradicted without reconciling.** The AU13-era "any file may query it" comments are not a competing architectural decision — they are exactly the **foreign-import-ceiling carve-out pattern this project has a standing zero-exceptions rule against** (a table WITH a real owner never gets a bypass for a "foreign" caller, no matter how established the calling pattern is elsewhere). Those comments predate `org` existing as a real, enforced Table-ACL package (AU13 shipped before AU19); they describe a gap, not a rule, and are now stale.

**Required remediation (verified in-scope, not assumed — `org` currently exports zero direct `getTeamById`-shaped accessor, only `teamMembers`-prefixed functions in `team-lookup.ts`):**
1. Remove `"teams"` from `scripts/table-ownership-guard.ts`'s `UNOWNED_SHARED_TABLES`; add a `teams: "packages/core-api/org"` `TABLE_OWNER` row (re-run `assertDisjointOwnership`'s fixture to confirm no overlap, same discipline as Increment 1c's `teamMembers` closure).
2. Add a real `getTeamById`-shaped export to `@hyperidle/org` (`team-lookup.ts`, alongside its existing `teamMembers`-prefixed functions) and route `context-assembly`'s `session-context.ts` read through a new DI port (e.g. `TeamReader`), wired to it — same idiom as `work`'s `TeamCapacityReader` (Increment 1c) and `cost`'s `CostTeamAccessor` (Increment 3g).
3. **Do not stop at context-assembly.** The stale `@lore` in `packages/core-api/work/src/work-service.ts:341` and `packages/server/src/routes/search.ts:233` are themselves evidence of the SAME unconverted direct `teams` access sitting in already-migrated/not-yet-migrated real files — grep every real (non-test, non-`packages/web`, non-string-literal-`"teams"`-route-path) file for an actual `import { teams } from "@hyperidle/db"` / `.from(teams)` Drizzle access and convert each to the new `org` port or a direct call to `org`'s real export, same as every other `TABLE_OWNER` closure this WP has done. Correct both stale comments once their sites are converted (they should no longer claim "any file may query it").
4. This is the same class of forcing function `teamMembers` (Increment 1c) and `taskPlanningSignals` (Increment 1k) already exercised — a table whose ownership only becomes enforceable once the owning Service is a real, guarded package. Treat it with the same rigor: no partial fix that "just gets context-assembly to compile" while leaving another already-migrated NESTED package's real accessor on the old bypass.

**Scope ruling (2026-07-15, founder-directed, resolves this item's own founder-signoff on how far "full sweep" reaches):** executed as commit `3f435af7` — `table-ownership-guard.ts`'s ACL/completeness tiers, its own top comment (Mechanism A header) confirms, scan **only the new nested `packages/<layer>/<service>/` packages, never `packages/server`**, until Increment 5 dissolves it. `packages/server`'s own remaining direct `teams` accessors (`routes/{bets,org,agent-profile,teams-routes,knowledge,routines-routes,settings}.ts`, `tools/{create-bet,create-routine,add-agent}.ts`, ~10-12 sites) are **correctly left unconverted** — this is not a new exception, it is the *exact same* precedent every other `TABLE_OWNER` row in this document has already followed without objection (`teamMembers` itself is STILL directly accessed today in `routes/bets.ts:406`, confirmed green against the legacy `au13` guard, since Increment 1c). "Full sweep" in step 3 means every real accessor in an **already-migrated nested Service package** (which is what `search.ts`'s and `work-service.ts`'s stale `@lore` sites turned out to be — `search.ts` is `packages/server` but was named explicitly because of its false claim, not because `packages/server` in general is in scope) — it does **not** mean pulling `packages/server`'s composition-root routes/tools forward into Increment 3's scope. That pull-forward is Increment 5's own job, scheduled and named ("Retire the nine `au10`…`au18` guard invocations... replaced by `table-ownership-guard` now that every owner package exists"). This closes Increment 3 entirely.

### Increment 4 — agent-execution Services + the tool split
`harness-registry` (already migrated in Inc 0 — finalize), `mcp-provider`, and the **tool split (§7.5)**: extract the 11 db-/domain-touching handler bodies into the `agent-orchestration/tool-handlers` Service (DI-wired to domain Services); leave descriptors + dispatch in `agent-execution/tool-provider` (deps = shared only; move `ToolContext`/`ToolHandler`/`ToolResult` types to `@hyperidle/shared`). Convert the 11 tool→domain edges to injected ports (§10.2). Resolve `harness-capability-read-model` split (§6). Green + commit.

### Increment 5 — Layers, Applications, cleanup, guard retirement
- `core-ui` Layer boundary: enforce Mechanisms B+C on `packages/web` (no internal reorg). **Landed** (Increment 5 item 1, commit `6036f05c`).
- **Application bootstrap packages — scoping ruling (2026-07-15, founder-directed, resolves this item's own founder-signoff):** `packages/server` today still holds ~72 real files (`server-factory.ts` 964 lines, `app.ts` 751 lines, `routes/`, `middleware/`, `auth/`, `schemas/`, and 10 `*-bindings.ts` DI-wiring files) — the pre-AU19 composition root, still serving both `desktop` and a remote topology via a runtime env toggle (`HYPERIDLE_PROFILE`), not a structural split. §5 already scheduled `routes/*` → `@hyperidle/core-api` (line 123/585); it just hasn't happened yet. **Ruling: this item is the SAME "move code out of the flat package into its real Layer" pattern already applied ~25 times in this WP, not a novel design exercise** — the bulk of `packages/server` (routes, the 10 `*-bindings.ts` files' Service-wiring logic, middleware, auth, schemas) moves into `@hyperidle/core-api` (each Layer composes its own Services — this is ordinary Mechanism-C wiring, ends up looking exactly like `context-assembly-bindings.ts`'s pattern already does today, just owned by the Layer instead of `packages/server`). **Only the genuinely deployment-varying pieces become the real `desktop`/`remote-server`/`remote-worker` Application packages**: which concrete `HarnessPort` adapter to inject (in-process `LocalSandboxAdapter` for `desktop`; a `RemoteHarnessAdapter`-based WS server for `remote-server`/`remote-worker`), process bootstrap, and starting the listener — a thin file per topology, matching §5's original "Application = bootstrap only" intent for real once `core-api` actually holds the wiring.
  - **`RemoteHarnessAdapter` placement — not a new design question, same pattern already proven:** stays in `agent-execution`'s `harness-registry` (already correctly classified, same as `LocalSandboxAdapter`) — Services (`run-orchestration` et al.) depend only on the abstract `HarnessPort` from `@hyperidle/shared`; the Application injects whichever concrete adapter matches its topology. This is §7.4's existing pattern, not a gap — the contradiction the founder-signoff raised was `packages/server` (not yet a real, guarded package) currently wiring the concrete adapter directly inside a `*-bindings.ts` file; once that wiring moves to the real Application bootstrap file, the contradiction dissolves on its own.
  - **`remote-worker` scope line:** extract `desktop/src/desktop-worker-client.ts`'s `DesktopWorkerClient` into a real, standalone `packages/agent-execution` or Application-tier `remote-worker` package (mechanical relocation, proven working code) — but **do not build new deployment/ops infrastructure** (standalone CI images, process supervisors, etc.) for it. That is outside AU19's scope (a code-structure project, not a deployment/ops project) — flag it as a genuine future item if a real deployment need arises, do not invent it speculatively (`ETHOS.md`, "Build for the Fast, Not the Enterprise").
- External-consumer migration (AU17's table, reused): `packages/eval`, `packages/web/scripts/*` — repoint deep-imports to the new Layer/Service surfaces.
- **Retire the nine `au10`…`au18` guard invocations** from the `lint` chain, replaced by `table-ownership-guard` (now that every owner package exists). Delete the guard scripts. This is also where `table-ownership-guard.ts`'s scan scope finally widens to cover the former `packages/server` surface (now inside `core-api`), closing every deferred direct-table-access item this WP has carried forward (`teamMembers`/`teams` in the old routes/tools, etc.).

**Full-sweep ruling (2026-07-15, founder-directed, resolves item 4's founder-signoff):** widening the scan for real surfaced 119 findings across 18 files / 6 Services (`org` 47/9 — the briefed scope; plus ~70 more never previously named, in `knowledge`/`work`/`connections`/`review`/`session-requests`, including `routes/connections.ts`/`routes/credentials.ts`; plus one wholly unmapped table, `hintProgress`). **Ruling: full sweep, all 119 findings, not deferred.** The Increment-3 `teams` ruling explicitly promised this item would close every deferred `packages/server` direct-table-access debt "for real" — deferring most of it again to yet another later increment would renege on that promise and is exactly the indefinite-deferral pattern the founder's zero-exceptions ACL stance exists to prevent. **But decompose it the same way every other multi-Service change in this WP has been done — one Service at a time, not one giant diff**: a sub-item per affected Service (`org`, `knowledge`, `work`, `connections`, `review`, `session-requests`), each its own scaffold/convert/verify/commit/review cycle, same TABLE_OWNER/DI-port pattern already proven ~30 times. `connections`'s two routes (`connections.ts`/`credentials.ts`) touch credential resolution — ordinary care, not a reason to defer; they convert to `connections`'s real exported functions via a DI port exactly like every other Service's routes.

**`hintProgress` ownership:** verified directly (`packages/db/src/schema.ts:1419-1429`) — cascades from `users.id`, sole real accessor `packages/core-api/src/routes/hints.ts`, no other Service touches it. Same shape as `teamMembers`/`taskPlanningSignals` before their owning Service was assigned (a clear FK-anchored domain home, not a genuinely cross-cutting multi-Service table). **Ruled: `hintProgress` owned by `users`** — add the `TABLE_OWNER` row, convert `routes/hints.ts` to `users`'s real exports (or keep it in-Service if `hints.ts` itself becomes part of `users`'s owned route surface — either satisfies the ACL, builder's call which shape fits best). Not an `UNOWNED_SHARED_TABLES` candidate.
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
| 4 | orchestration + execution are real Service packages, not flat dirs; **run-coordination tables owned by `session-requests`/`lifecycle-projection` (AC-4 correction, top callout)** | §4, §7.1, Inc 3–4 | Packages exist with own `package.json`/tests; `services/` flat dir emptied; `agent_work_intents`/`agent_session_requests`/`agent_lifecycle_inbox` have `TABLE_OWNER` rows. |
| 5 | Only agent-execution Services reach LLM/harness/MCP/tools; **execution holds zero Service/DB reference** | §7.2, §7.5, Inc 0 (sanity-break B), Inc 4 | `execution-boundary-guard --fixtures`; `composition-boundary-guard` proves `tool-provider`/`harness-registry`/`mcp-provider` deps = shared(+runtime), no `@hyperidle/db`; negative fixtures fail `tsc`. |
| 6 | No Service imports another Service/Layer; deps = db/shared(+shared port); cross-Service wired by Layer | §7.3, §10, Inc 0 (sanity-break C), all increments | `composition-boundary-guard --fixtures`; negative fixture fails; the **114** census edges (post-Increment-2g) are all Layer-wired (downward DI) or event-bus-inverted (against-grain, §10.3). |
| 7 | Enforcement built + proven on minimal slice with ≥1 sanity-break per mechanism BEFORE bulk migration | **Increment 0** (§12) | Inc 0 commit shows 3 sanity-breaks (A/B/C) injected→RED→reverted; single real edge (`context-assembly←knowledge`); lands before Inc 1. |
| 8 | ~238 files migrated (reuse AU17 classification); behavior unchanged all topologies | §5, §6, Inc 1–5 | Full existing test suite (unit/component/integration/e2e) green unchanged; boot each topology. |
| 9 | `agent_work_intents` TABLE_OWNER + 3 accessors migrated onto owner | §11, Inc 3 | `TABLE_OWNER` has `agentWorkIntents` row; guard fails any non-`session-requests` access; the 3 sites converted (route recorder/reader injected; boot-time reader DI-wired). |
| 10 | AU8 + AU17 stay superseded; no orphan schedulable entry | Inc 5 verify | `pipeline-manifest.yaml` + `TRACK-AU.md` reviewed; both marked superseded. |
| 11 | (workspaces glob widened) | §9.1, Inc 0 | `package.json` workspaces = `["packages/*","packages/*/*"]`; `npm install` links nested packages. |

---

## 14. Trade-offs, risks, open questions

- ~~**AC-4 text needs spec-owner sign-off (W3, top callout)**~~ — **CLOSED 2026-07-13.** Founder confirmed the split wording (execution = hard zero-table constraint; orchestration = may own tables, `session-requests`/`lifecycle-projection` are the two that do). `TRACK-AU.md` AC-4 updated. No behavior/scope change.
- **`@hyperidle/db` exports all tables to everyone (§7.1)** — the barrel-discipline half of Table ACL is weaker than the concept implies; the general `TABLE_OWNER` guard is the real enforcement. Stated plainly; splitting `db` per-owner is out of scope. **Biggest correctness caveat in the plan.**
- **`tool-provider`/`tool-handlers` split (§7.5, C1)** — the largest DI conversion (11 handler bodies) and the one place the "zero-Service execution" ideal meets today's DB-touching tools. **Resolved, not deferred:** the descriptor/dispatch surface stays in execution (deps = shared only, provable); the DB-touching bodies move to an orchestration `tool-handlers` Service and are DI-converted (real scope, Increment 4). No "package clean but behavior deferred" middle position. Cost: +1 Service, and each tool's arg types move to `@hyperidle/shared`.
- **Against-grain edges (§10.3)** — 9 core-api→orchestration edges invert through the existing `EventBus` or reclassify (`handoff-protocol`). This is real refactoring the census surfaced; none is a plain DI port. Risk: an inversion that changes timing/atomicity — mitigated by reusing the existing subscriber pattern and keeping durable-intent writes on the canonical path (no ad-hoc bypass).
- **`review`/`policy`/`filesystems` table ownership (⛁*)** — unconfirmed; first task of each Service's increment is to `grep` its `pgTable` usage and either add a `TABLE_OWNER` row or convert reads to DI.
- **Multi-session build** — the increment cut (§12) is the resumability mechanism; the risk is a builder resuming and re-doing Inc 0. Mitigation: Inc 0 lands the three guards + three Layer packages, all visible in `git log` and `ls packages/*/`.
- **No new ports package (§7.3)** — execution-side cross-boundary types live in `@hyperidle/shared` (verified db-free); in-layer ports are declared in the consuming Service. Chosen for boring-tech / minimal-ceremony; risk is port-interface drift, mitigated by promoting a shared port to `@hyperidle/shared` only when 3+ consumers share it.
- **`write-executor.ts`, `agent-utils.ts`, `contracts.ts`, `harness-capability-read-model.ts`** — dispositions marked "inspect at migration," not pre-decided, to avoid a wrong bulk-move. The disposition table (§6) is append-only.

## 15. Self-critique

- **C1/C2 close honestly.** C1 is resolved by moving the DB-touching work *out* of execution entirely (not by claiming zero-DB while deferring it) — package location now matches runtime location. C2 is a real, reproducible 110-edge / 208-call-site census (111 edges / 210 call sites post-Increment-2c, once `git-export → knowledge` was found mid-migration) whose per-source breakdown sums to its own total; the prior "115 vs 133" self-inconsistency is gone. The census additionally surfaced 9 against-grain edges the estimate had hidden — the single most useful output of doing it for real.
- **Over-reach check:** the roster (31 Services) is at the top of the floor range; `retention`, `realtime`, `model-gateway`, `observability`, and the new `tool-handlers` are candidates a reviewer should probe. `tool-handlers` is justified (it is where the DB-touching tool logic must live once execution is clean); the thin core-api ones are kept separate to avoid re-introducing the grab-bag module this WP kills — `retention` flagged as a fold candidate (§9.5).
- **Scope honesty:** the tool split (§7.5) reuses the existing MCP proxy-back path unchanged — the WP proves the package/dependency boundary + relocates+DI-converts the 11 handler bodies; it builds no new cross-process machinery.
- **Did I invent abstraction?** `HarnessPort` and the `AgentWorkIntentRecorder`/`Reader` ports are the only new interfaces, all bound to existing seams (worker-ws/remote-harness-adapter; the existing transactional intent insert). No ports package. No new runtime layer. `tool-handlers` is an extraction, not an invention.
- **Enforcement realism:** the plan's single biggest silent-failure risk (typecheck-gate not recursing into nested packages, §9.2) is gated first in Inc 0; without it every `tsc`-based mechanism is theatre.

---

## Revision log (round 1, post-critique `99b7b00d`)

- **C1** — `tool-provider`/`tool-handlers` split (§7.5): descriptor+dispatch stay in `agent-execution` (deps = shared only, genuinely zero-DB); the 11 DB-touching handler bodies move to a new `agent-orchestration/tool-handlers` Service and are DI-converted (Increment 4). No deferred DB access inside execution.
- **C2** — real edge census (§10): **110 distinct Service→Service edges / 208 call sites**, full committed table grouped by owning Layer, per-source breakdown sums to 110; the inconsistent "115"/"machine-generated scratchpad" claims removed.
- **W1** — AC-9 route closure (§11): concrete Application-injected, `tx`-carrying `AgentWorkIntentRecorder`/`Reader` ports (typed in `@hyperidle/shared`, wired via `createApp(deps)`); boot-time reader is intra-orchestration DI. No migration-time TBD.
- **W2** — Increment 0 narrowed (§12): single real edge `context-assembly←knowledge`; the other 4 context-assembly ports are clearly-marked transitional stubs; the Inc-0 package is proven but not swapped into the live app (so "no behavior change" holds).
- **W3** — AC-4 correction: factual contradiction flagged, founder sign-off obtained 2026-07-13, `TRACK-AU.md` AC-4 updated to the execution-hard-constraint / orchestration-may-own-tables split. Closed.
- **W4** — execution port type source named (§7.3, §8): execution ports type off **`@hyperidle/shared`** (verified db-free); db-keeping layers may type off `@hyperidle/db`; §7.3's db-typed example is correct precisely because it is an orchestration Service. No new contracts package.
- **File-count facts** — corrected: `services/` = **76** (was 82); production `.ts` = **238** (was 240; 240 incl. 2 shared test helpers); §5 marked category-level.
