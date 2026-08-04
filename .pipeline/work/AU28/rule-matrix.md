# AU28 — The rule matrix

**The question this answers** (Ruling 6 / Open question 6, founder verbatim):

> "Not sure if our architecture is already complete — are we already able to define each legal and
> illegal connection as rules?"

**The answer, by construction:** yes, with **9 open cells out of 1169**. Every cell of the connection
space is enumerated below and carries exactly one verdict — `Allowed` (with the general rule that makes
it legal), `Forbidden` (with the legal alternative), or `Unsettled — blocked on <what>`. The
Unsettled list is nine cells in three groups, each with a named blocker and a named owner.

**Two named structural blockers dissolved during the enumeration:**

- **`core-api`'s dual Layer/Application role is not a blocker.** Ruling 5 makes role a
  registry property of a *package*, never of a path or a file. Under a package-grained registry the
  26 composition-root crossings inside `packages/core-api/src/**` are simply **Forbidden crossings in
  a Layer package**, with a named closing work package. There is no role ambiguity to resolve and no
  file-grained override to build. The same resolution disposes of `web/scripts/*`.
- **MCP had no kind, and the worker transport was mis-attributed.** Both are fixed in §1. Once
  correctly stated, neither introduces a mechanism outside the founder's `API / MCP / events`.

Scope note: this document states **verdicts**, not relocations. Per Ruling 2, deciding *where code
should move* is a later round. Every Forbidden cell with live instances names the alternative and the
successor that closes it; none of that cleanup is AU28's build.

All counts measured in this worktree at `aaa5243f`, 2026-08-04. Reproduction commands: §12.

---

## 1. The crossing kinds — nine, closed

A **boundary crossing** is one concrete instance of code (or a running process) in unit A reaching
unit B: a specific `file:line`, a specific `package.json` row, or a specific runtime channel. It
always happens through exactly one of these nine kinds. There is no tenth. Anything not on this list
is Forbidden by default, in every direction, for every actor pair.

| # | Kind | What it is | How it is detected |
|---|---|---|---|
| 1 | **Module import** | `import` / `export … from` / dynamic `import()` of another unit's module. Type-only and subpath are *sub-properties*, not exemptions. | AST: `ImportDeclaration`, `ExportDeclaration` with a specifier, `CallExpression` on `import` |
| 2 | **Declared resolution** | A `@hyperidle/*` row in `package.json` `dependencies`, **or** a `tsconfig.base.json` `paths` mapping that makes the package resolvable. Independent of #1 in both directions: the hoisted monorepo resolves imports never declared, and a manifest can declare what is never imported. | `package.json` + `tsconfig.base.json:19-27` |
| 3 | **Injected port** | An object typed by an interface, handed to a constructor/factory by a third party. The consumer never names the provider — invisible to #1 **by construction**. | AST: composition-bundle detection (`layer-boundary-scan.ts` Mechanism 3) |
| 4 | **API call** | A request to an HTTP or WebSocket endpoint that the target **hosts on its own router**. Three live shapes, one kind: (a) the injected-transport seam (`CoreApiPort` / `AgentOrchestrationPort`, `(req: Request) => Promise<Response>`); (b) the browser channel (`apiFetch`, and the deleted Hono RPC client); (c) a WebSocket dial (`ws-client.ts`, the remote-worker socket). | route registry + client-call sites |
| 5 | **MCP tool call** | JSON-RPC over HTTP to an MCP router, authed by a per-session bearer token, contracted by tool schemas. The caller is a **running harness process**, not a package. | MCP router ownership + `open()`/token issuance |
| 6 | **Domain event** | `EventBus.emit` / `.on` with an event type from `@hyperidle/shared`. In-process only. The publisher never names a subscriber. | AST: `layer-boundary-scan.ts` Mechanism 2 |
| 7 | **Owned table** | A Drizzle read or write of a SQL table, **or an import of the table symbol from `@hyperidle/db`** (type-only included). Zero imports across the package boundary, zero DI — invisible to #1 and #3 by construction. | `table-ownership-guard.ts` (query + value-import + namespace detectors) |
| 8 | **Workspace handoff** | A file written into an agent's working directory that a harness process reads: `.mcp.json`, `AGENTS.md`, injected credentials. Zero imports, zero DB, zero HTTP. | writer-side call sites into a session working dir |
| 9 | **Capability reach** | Importing a raw runtime SDK (`@modelcontextprotocol/sdk`, `openai`, `@anthropic-ai/sdk`) or spawning a harness CLI binary via `child_process`. The **target is a capability, not a package** — so it has no role, and needs its own axis. | `execution-boundary-guard.ts` checks 3+4 |

### 1.1 What changed from the round-1 seven, and why

| Round 1 | Now | Reason |
|---|---|---|
| "Seam call" — *"the only way one Layer synchronously asks another"* | **API call** (kind 4), widened | False as written. 97 `apiFetch(` invocations across 51 files in `packages/web/src` plus 4 WebSocket topic subscriptions carry ~100% of the UI's data and matched no kind. The founder's own word is "API"; the injected-transport seam is one *shape* of it. |
| "Worker transport" as a distinct `agent-orchestration ↔ agent-execution` kind | **deleted** — folded into kind 4 | Mis-attributed. The WS server is `packages/core-api/src/server-factory.ts:1230`; `/api/workers` is `packages/core-api/src/routes/workers.ts`; `agent-orchestration` hosts zero routers; `packages/remote-worker/package.json` declares exactly one dependency (`@hyperidle/shared`). As built it is a remote Application dialling core-api's socket — an API call. Left as-is, the taxonomy would have admitted a fourth cross-Layer mechanism the founder never named. |
| MCP folded into the seam | **kind 5, its own row** | Ruling 1(3) names it. Structurally distinct on every axis (§1.2). |
| — | **kind 8 workspace handoff, new** | A real zero-import channel. Provisioning writes files a harness reads. Unnamed, it is a hole with no name on it. |
| — | **kind 9 capability reach, new** | `execution-boundary-guard.ts:133-138` bans external modules and `child_process` harness spawns. External packages hold no role and a spawn is not a package-to-package crossing, so `verdict = f(kind, source role+identity, target role+identity)` could not express them. Without this axis the reconciliation target of "zero guards implementing a rule absent from the contract" is unreachable. |

### 1.2 MCP is not a shape of the API call

| | API call (kind 4) | MCP tool call (kind 5) |
|---|---|---|
| Transport | injected `(req: Request) => Promise<Response>`, or browser fetch/WS | HTTP + JSON-RPC |
| Auth | API key header / session cookie / worker token query param | per-session bearer token issued by `open()` (`harness-registry/src/mcp/index.ts:8-16`) |
| Type contract | hand-mirrored port interface in `@hyperidle/api-contract` | MCP tool schemas; no `api-contract` mirror |
| Router owner | the target Layer's own routes | **agent-execution** owns `McpToolBridge.router: Hono` |
| Caller | a package | a **running harness process** — not a package, so "code in A reaches code in B" does not describe it |

### 1.3 The dialler owns the crossing

A modelling rule, stated once because it decides 9 cells:

> For kinds 4 and 5, the crossing belongs to the party that **initiates the connection**. Traffic
> flowing back down a connection the other side opened is not a second, reverse crossing.

Consequently `core-api → core-ui` WebSocket push (`work-state-push-gateway.ts:40,51`,
`session-activity-gateway.ts:51-57` → `WsConnectionHub.broadcast`) is **not** a `core-api → core-ui`
crossing; it is traffic inside the `core-ui → core-api` crossing that `ws-client.ts:124` opened. Same
for the worker socket: `remote-worker → core-api` is the crossing; core-api dispatching work down it
is not a `core-api → remote-worker` crossing. Without this rule, `X → core-ui` is undecidable and the
12-of-12 Layer-pair target cannot be met truthfully.

---

## 2. The actors

Roles are assigned by an explicit registry (Ruling 5), **never derived from a directory path**. A
package with no registry entry is a build error, not a default. `packages/` currently holds 34
packages; all 34 are classified below and none is unclassified.

| Role | Count | Identities |
|---|---|---|
| **Foundation** | 4 | `@hyperidle/shared`, `@hyperidle/db`, `@hyperidle/api-contract`, `@hyperidle/design-system` |
| **Layer** | 4 | `@hyperidle/web` (core-ui), `@hyperidle/core-api`, `@hyperidle/agent-orchestration`, `@hyperidle/agent-execution` |
| **Service** | 20 | 15 under `core-api/` · 4 under `agent-orchestration/` (`dispatch`, `run-orchestration`, `session-requests`, `tool-handlers`) · 1 under `agent-execution/` (`harness-registry`) · 0 under `core-ui` |
| **Application** | 3 | `@hyperidle/desktop`, `@hyperidle/remote-server`, `@hyperidle/remote-worker` |
| **Tooling** | 3 | `@hyperidle/eval`, `eslint-plugin-authz`, `eslint-plugin-design` |
| **Harness process** | — | a running harness CLI. A non-package actor, named in the registry explicitly because it is the caller of kind 5 and the reader of kind 8. |

**Role is a property of a package, not of a file.** This resolves both open role questions the founder
flagged, in the same stroke:

- `packages/core-api/src/**`'s composition-root files (`app.ts`, `server-factory.ts`, `session.ts`,
  `services/*-bindings.ts`, `services/run-orchestration-composition.ts`) are **core-api Layer code**.
  Their 26 cross-Layer crossings are Forbidden, not exempt. Closing WP: **AU26**.
- `packages/web/scripts/*-test-server.ts` are **core-ui Layer code**. Their imports of
  `@hyperidle/core-api/server-factory`, `@hyperidle/connections`, `@hyperidle/harness-registry` and
  `@hyperidle/db` are Forbidden, not exempt. Alternative: relocate them into a Tooling package, where
  the Tooling row (§7) grants Layer access.

A file-grained override was the alternative and is rejected: it reintroduces the hand-maintained map
that `runtime-simplification.md:108-114` chose package-per-Service to escape, and that
`au6-agent-boundary-guard.ts` is the live proof of (its `SOURCE_ROOTS = ["packages/server/src"]`
points at a directory that no longer exists; it visits zero files and exits 0, seventh in the
`npm run lint` chain).

### 2.1 Foundation target surfaces

`@hyperidle/db` is ACL'd at **table grain** (Ruling 3.2), so as a *target* it is four distinct
surfaces, not one:

| Surface | What it is |
|---|---|
| `db:owned-table` | a table symbol imported or queried **by the Service that owns it** |
| `db:foreign-table` | a table symbol imported or queried by anyone else |
| `db:schema-ns` | `export * as schema` (`packages/db/src/index.ts:32`) — hands **all 43 tables** through one symbol, invisible to any name-based ACL |
| `db:non-table` | `HyperIdleDb`, `WriteExecutor`, `applyMigrations`, `isDowngrade`, `createPgliteDb`, `applyFactoryBootstrap`, Drizzle row types |

Foundation-as-target is therefore **7 surfaces**: `shared`, `api-contract`, `design-system`, and the
four `db:*`.

---

## 3. M1 — Layer → Layer (96 cells)

The literal root cause of AU28. All 12 **ordered** pairs, both directions of every pair, all 8
package-to-package kinds. `A` = Allowed · `F` = Forbidden · `U` = Unsettled.

| # | Source → Target | 1 import | 2 declared | 3 DI | 4 API | 5 MCP | 6 event | 7 table | 8 workspace |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | core-ui → core-api | F | F | F | **A** | F | F | F | F |
| 2 | core-ui → agent-orchestration | F | F | F | **U** | F | F | F | F |
| 3 | core-ui → agent-execution | F | F | F | F | F | F | F | F |
| 4 | core-api → core-ui | F | F | F | F | F | F | F | F |
| 5 | core-api → agent-orchestration | F | F | F | **U** | F | **A** | F | F |
| 6 | core-api → agent-execution | F | F | F | F | F | **A** | F | F |
| 7 | agent-orchestration → core-ui | F | F | F | F | F | F | F | F |
| 8 | agent-orchestration → core-api | F | F | F | **A** | F | **A** | F | F |
| 9 | agent-orchestration → agent-execution | F | F | F | F | F | **A** | F | F |
| 10 | agent-execution → core-ui | F | F | F | F | F | F | F | F |
| 11 | agent-execution → core-api | F | F | F | **A** | F | **A** | F | F |
| 12 | agent-execution → agent-orchestration | F | F | F | **U** | F | **A** | F | F |

**Totals: 9 Allowed · 84 Forbidden · 3 Unsettled.**

### Rules behind the columns

- **Kinds 1, 2 — Forbidden, all 12.** *A Layer may import only from Foundation or from within its own
  Layer* (Ruling 1(2)). Type-only and subpath do not exempt: they still couple the build graph and the
  manifest. **Alternative:** kind 4, 5, or 6.
- **Kind 3 — Forbidden, all 12.** *DI is legal only within the same Layer* (Ruling 1(1)). An injected
  port crossing a Layer boundary is the crossing the founder names first and the one invisible to
  import-based checks by construction. **Alternative:** the receiving Layer declares the port itself
  and reaches the provider over kind 4/5/6.
- **Kind 4 — Allowed iff the target Layer hosts its own router.** Today: core-api hosts
  (`app.ts:316-661`, ~40 mounted route families + the WS server); core-ui hosts nothing (browser);
  agent-execution hosts only the MCP router (kind 5's surface, not an API); **agent-orchestration hosts
  zero routers** — so the three cells targeting it are Unsettled, not Forbidden: the mechanism is
  legal, its endpoint does not exist yet.
- **Kind 5 — Forbidden, all 12.** The MCP caller is a harness process. A package never makes an MCP
  call. See §8 (M8) for the harness-process rows.
- **Kind 6 — Allowed between the three server-side Layers; Forbidden on any pair touching core-ui.**
  The `EventBus` is an in-process object; the browser has no access to it and must not. The six
  Allowed cells are live and healthy — 21 EventBus edges measured. **Alternative for core-ui:** kind 4
  (the WS subscription it already dialled).
- **Kind 7 — Forbidden, all 12.** Exactly one Service owns each table and is the only code that may
  read or write it (§5, Ruling 6). A shared table is not a message channel. **Alternative:** kind 4 or 6.
- **Kind 8 — Forbidden, all 12.** The reader of a workspace handoff is always a harness process, never
  a Layer. See M1b.

### Live crossings against M1

| Crossing | Kind | Count | Verdict | Alternative / closing WP |
|---|---|---|---|---|
| `core-api → agent-orchestration` (`session-requests` 15, `run-orchestration` 5, `dispatch` 4, `tool-handlers` 3) | 1 | 27 stmts | **Forbidden** | events (already the pattern for 21 edges); AU26 relocates the 21 composition-root ones |
| `core-api → agent-execution` (`harness-registry` 10, Layer root 1) | 1 | 11 stmts | **Forbidden** | agent-execution exports its own app; the Application mounts it — AU26 |
| `core-ui → core-api` (`web/src/api/client.ts:27`, `import type { AppType }`) | 1 | 1 stmt | **Forbidden** | **deleted in AU28** (Ruling 4.1) — the file is dead, `AppType = Hono` bare, zero call sites |
| `web/scripts/*` → `@hyperidle/core-api/server-factory` | 1 | 3 stmts | **Forbidden** | relocate the scripts to a Tooling package |
| `dispatch`/`run-orchestration` → `harness-registry` via `DispatchPorts`, `RunOptions`, `RunTransitionSpec`, `RuntimeDeps` | 3 | 4 edges | **Forbidden** | see §3.1 — this one is expensive |
| 21 EventBus edges | 6 | 21 | **Allowed** | — |
| `apiFetch` + WS from `packages/web/src` | 4 | 97 calls / 51 files / 4 subscriptions | **Allowed** | — |

> **Note — 27 + 11 + 1 = 39 module-import statements, of which 37 are Layer-root → *foreign Layer's
> Service*, which is M5 row (b), not M1.** M1's own kind-1 cells cover Layer-root → Layer-root: 1
> live (`core-api → @hyperidle/agent-execution`, `app.ts:1`) plus 1 (`web → @hyperidle/core-api`).
> They are counted once, in the matrix whose row shape they match.

### 3.1 The cell that changes the product's topology

`core-api → agent-execution` and `agent-orchestration → agent-execution` at **kind 3** are the four
live injected-port crossings, and closing them is not an import rewrite. `packages/desktop/src/boot-server.ts:19`
injects `createLocalAdapterPool` / `createSandboxAdapter` into `createServer`, and `run-orchestration`
consumes the resulting `AdapterPool` as an injected object. Under Ruling 1(1) that is Forbidden, so
laptop-solo's in-process embedding of the harness must become API/MCP/events too. **This is a runtime
topology change to the product's primary deployment**, not a refactor. It is the single largest cost of
the ruling and it is stated here so it is visible before anything is built.

### 3.2 The founder's own legal mechanism is illegally wired

MCP is one of the three mechanisms Ruling 1(3) declares legal. Today it exists **only by virtue of a
Forbidden crossing**:

- `packages/agent-execution/harness-registry/src/mcp/index.ts:8-16` — agent-execution owns
  `McpToolBridge.router: Hono`.
- `packages/core-api/src/server-factory.ts:44` — core-api imports `createMcpToolBridge` (kind 1,
  Forbidden, cell #6).
- `packages/core-api/src/server-factory.ts:1043` — core-api constructs it.
- `packages/core-api/src/server-factory.ts:1199` — core-api reads `.router` and hosts it.

The legal mechanism's plumbing is the illegal one. **Alternative:** agent-execution exports its own
Hono app carrying the MCP router; the Application mounts both apps. That is exactly AU26's locked
design (`AU26/plan.md:32`).

---

## 4. M1b — Layer → Application / Tooling / Harness process (96 cells)

| Source Layer → Target | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| any Layer → Application (×4 rows) | F | F | F | F | F | F | F | F |
| any Layer → Tooling (×4 rows) | F | F | F | F | F | F | F | F |
| core-ui → harness process | F | F | F | F | F | F | F | F |
| core-api → harness process | F | F | F | F | F | F | F | F |
| agent-orchestration → harness process | F | F | F | F | F | F | F | F |
| **agent-execution → harness process** | F | F | F | F | F | F | F | **A** |

**Totals: 1 Allowed · 95 Forbidden · 0 Unsettled.**

**Rules.** *A Layer must not know its own deployment* — an Application composes Layers, never the
reverse; there is no legal mechanism from a Layer to an Application, in any kind. *Tooling is
out-of-band* — nothing in the runtime graph may depend on a bench or a lint plugin. *Only
`agent-execution` provisions a harness workspace* — the working directory is the harness's
environment, and the harness is agent-execution's exclusive concern.

**Live against the last rule (kind 8):**

| Writer | Verdict | Alternative |
|---|---|---|
| `agent-execution/harness-registry/src/{cli-mcp-config,harness-discovery,adapter-pool,cli-harness-adapter,mcp/mcp-bridge}.ts` | **Allowed** | — |
| `agent-orchestration/run-orchestration/src/provisioner.ts`, `connection-provisioning.ts` | **Forbidden** | call agent-execution's provisioning surface over kind 4/6 |
| `core-api/src/app.ts` (`.mcp.json` for harness auto-discovery), `core-api/filesystems/src/scaffolding-paths.ts` | **Forbidden** | same |

---

## 5. M2 — Layer → Foundation (224 cells), plus M2b table completeness (43 cells)

Ruling 3.1 kills the flat "Foundation is always importable" row. Importability is per-Layer, per
Foundation package, and for `db` per table.

**Blanket rule F-FOUND, covering 168 of M2's 224 cells:** *kinds 3–8 are Forbidden for every
Foundation target, from every source, in every matrix.* A Foundation package hosts no router (4), owns
no MCP bridge (5), is not an EventBus endpoint — `EventBus` is a class you import, not a Layer you
message (6), owns no table as a Service (7, the `db:*` surfaces are import-grain), and receives no
workspace file (8). Nothing is injected *into* a Foundation package (3). Stated once, applied
everywhere, counted honestly.

The remaining 56 cells — kinds 1 and 2 for each of 4 Layers × 7 surfaces:

| Layer | shared | api-contract | design-system | db:owned-table | db:foreign-table | db:schema-ns | db:non-table |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **core-ui** (`web`) | **A** | **A** | **A** | F | F | F | F |
| **core-api** | **A** | **A** | F | F | F | F | **A** |
| **agent-orchestration** | **A** | **A** | F | F | F | F | **A** |
| **agent-execution** | **A** | F | F | F | F | F | F |

(Each cell above stands for two cells — kind 1 and kind 2, which always agree here: you may declare
what you may import and nothing else.)

**Totals for M2: 20 Allowed · 204 Forbidden · 0 Unsettled.**

### Rules

- **`→ shared` — Allowed for all four Layers.** Ruling 1(2) names it. **Caveat, not a caveat on the
  verdict:** the *surface* narrows. 20 of 49 clusters in `@hyperidle/shared` are imported by ≤1 runtime
  Layer, 229 of 568 exports are values, and it ships `unified`/`remark`/`@noble/hashes`/`github-slugger`/
  `zod`/`node:dns` into every Layer's closure. The edge stays Allowed; what is behind it shrinks under
  the **`shared` decomposition** successor.
- **`→ api-contract` — Allowed iff the Layer is a party to a port family declared there.** This is the
  per-Layer rule Ruling 3.1 demands, stated as a general rule rather than a package list: a Layer may
  import only the port families it **hosts** or **calls**. core-ui calls `CoreApiPort`; core-api hosts
  `CoreApiPort` and calls `AgentOrchestrationPort`; agent-orchestration hosts `AgentOrchestrationPort`
  and calls `CoreApiPort`. **agent-execution is party to nothing declared there → Forbidden.** If it
  ever hosts a port, the row changes when the port lands, not by exception.
  - *Live reality check:* `api-contract` has **1 live consumer cell of 6** — core-api, 3 statements,
    all in composition-root files. Clusters E/F/G (11 of 69 exports) have zero importers anywhere. The
    far side of the seam deliberately hand-mirrors instead of importing
    (`tool-handlers/src/ports.ts:148,239`). The rule above is therefore mostly *prescriptive* — it
    says who *may*, and today almost nobody does.
- **`→ design-system` — Allowed for core-ui only.** 67 statements from `web`, 0 from anywhere else.
  The strictest rule is already obeyed; making it a rule costs nothing.
- **`→ db:owned-table` — Forbidden for every Layer root.** A Layer root owns no table; only a Service
  does (§6). **Alternative:** call the owning Service.
- **`→ db:foreign-table` — Forbidden, all four.** **8 live in `core-api/src`** (`sessions` ×7,
  `userSkills` ×1). These pass the guard today *only* because those two tables sit in
  `UNOWNED_SHARED_TABLES` — which Ruling 6 abolishes. When `sessions` gets an owner, these 8 become
  reported violations. **Blocked on the sessions-ownership WP.**
- **`→ db:schema-ns` — Forbidden for every actor, everywhere.** `export * as schema` hands all 43
  tables through one symbol that no name-based ACL can see. **Alternative:** `createPgliteDb` /
  `applyMigrations` from `@hyperidle/db`, which already do the Drizzle construction the four live
  users are re-implementing. Live: `eval/src/runner.ts:14`, `web/scripts/ah{1,5,6}-test-server.ts`.
  None dereferences a table through it today — a hole, not yet a violation.
- **`→ db:non-table` — Allowed for core-api and agent-orchestration; Forbidden for core-ui and
  agent-execution.** core-api imports `HyperIdleDb` 46× and `WriteExecutor` 8× — the DB handle type is
  how every Service signature is written. `core-ui` is a browser client and must never see the DB (0
  statements in `web/src`; the 6 in `web/scripts` are Forbidden under §2). **`agent-execution → db` is
  0 today and it owns 0 tables — the strictest possible rule is free there.**
- **Type-only does not exempt a table import.** `import type { bets } from "@hyperidle/db"` currently
  passes the ACL (`table-ownership-guard.ts:580,585` require `!isTypeOnly`). Under kind 1's
  sub-property rule it is a table import and must fail. Contract row, not a script bug.

### M2b — table ownership completeness (43 cells)

**Ruling 6: every table has exactly one owning Service. There is no unowned state and no exempt set.**

The existing guard is already complete at the *mapping* grain — `TABLE_OWNER` 39 rows +
`UNOWNED_SHARED_TABLES` 4 = 43 = every table in `packages/db/src/schema.ts`, with
`assertDisjointOwnership` hard-throwing on overlap at load time. **The exempt set is the hole, not the
mapping.**

| Verdict | Count | Tables |
|---|---|---|
| **Allowed** — owner named, ACL enforceable | **39** | 12 Services across 2 Layers (11 core-api Services + `session-requests`) |
| **Unsettled — blocked on the sessions-ownership WP** | **4** | `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills` |

The exemption's rationale (`table-ownership-guard.ts:276-330`) is circular: it argues that because
many Services access the table, naming one owner "would be a false-ownership claim the zero-exceptions
ACL principle forbids." That inverts the principle — **many Services touching a table directly IS the
violation.** The exemption preserves the smell and calls it rigor.

`sessions` sprawl, measured: **34 non-test files across 8 package areas in 3 Layers** — `eval/src` 12,
`core-api/src` 9, `agent-orchestration/run-orchestration` 7, `core-api/policy` 2,
`core-api/{work,review,realtime}` 3, `agent-orchestration/tool-handlers` 1. A table read and written
from three Layers with zero imports between them is the largest cross-Layer bypass in the system, and
it is invisible to every import- and DI-based check by construction.

**Contract rows this produces:** (1) every table has exactly one owning Service — completeness
enforced, no exempt set; (2) the four unowned tables are reported as **debt** on every lint run, never
exempted (Ruling 2: AU28 warns, later rounds clean); (3) `sessions` has no Service and one should
exist — assigning an owner is identifying a missing boundary, not bookkeeping.

---

## 6. M3 / M4 — Foundation as source (256 cells)

### M3 — Foundation → Foundation (96 cells) — live today and unruled

Two real edges exist and no rule covers them: `design-system → shared` (44 prod statements, 49
including stories/tests) and `db → shared` (6). A per-Layer matrix has no cell for these 50 statements.

**Rule: Foundation is a ranked DAG. A Foundation package may import only a strictly lower-ranked
Foundation package.** Rank 0: `shared` (imports zero `@hyperidle/*` today — the plan constraint holds).
Rank 1: `db`, `api-contract`, `design-system` (peers; none may import another).

| Source → | shared | db | api-contract | design-system |
|---|:--:|:--:|:--:|:--:|
| **shared** | — | F | F | F |
| **db** | **A** | — | F | F |
| **api-contract** | **A** | — | — | F |
| **design-system** | **A** | F | F | — |

(kinds 1 and 2; kinds 3–8 Forbidden by F-FOUND, 72 cells.)

**Totals: 6 Allowed · 90 Forbidden · 0 Unsettled.**

`api-contract → shared` is Allowed by rank but is **0 today by deliberate design**: the seam DTOs are
hand-mirrored rather than imported so the package keeps zero runtime dependencies
(`core-api-port.ts:145-147`). The rank rule permits it; the package's own constraint declines it. Both
are true and neither is an exception.

*Correction the inventory earns:* `api-contract/src/index.ts:6` claims "No runtime code — only
TypeScript interfaces and type aliases," contradicted 67 lines later at `:73` by the
`isPendingSessionStart` re-export. That function has zero consumers repo-wide. The `zero-runtime-deps`
claim is accurate and load-bearing; the `no runtime code` claim is false.

### M4 — Foundation → Layer / Service / Application / Tooling / Harness process (160 cells)

**All 160 Forbidden.** Rule: *Foundation is the floor. Nothing below it exists.* A Foundation package
that reaches upward inverts the dependency graph and makes every Layer's closure cyclic. Zero live
instances — all four Foundation packages import only Foundation today.

`@hyperidle/shared`'s own manifest carries six third-party runtime deps and zero `@hyperidle/*` deps;
`api-contract` declares no `dependencies` key at all. Both hold.

> **The one thing this rule cannot see.** `shared/src/agent-work-intent-recorder.ts:425,433` declares
> `AgentWorkIntentRecorder` / `AgentWorkIntentReader` — an **injected-port pair whose provider and
> consumer are in different Layers** (core-api 49 symbol-occurrences, agent-orchestration 9), plus the
> `bakeAgentRunnableConfig` domain function they exchange. No import crosses a Layer boundary, so M1
> kind 3 never fires. Parking a cross-Layer port interface in Foundation is precisely how such a port
> becomes invisible. **Verdict: Forbidden** — a Foundation package may not declare an interface whose
> implementer and caller are in different Layers; that is `api-contract`'s job or the port does not
> exist. Live: 1. Closing WP: **`shared` decomposition** (inventory S6 flags it as a rule question,
> which this row now answers).

---

## 7. M5 — Services (136 cells)

Deliberately **role-based, not pairwise.** A 20 × 20 Service matrix is ~400 cells at Layer-blind grain
and grows quadratically with every new Service; nobody maintains it, and it would encode as 400
special cases what is really six relations. The six relations below plus the Foundation surfaces cover
the entire Service space, and adding a 21st Service adds zero rows. Stated explicitly because the
completeness claim depends on it being a deliberate choice rather than an omission.

| # | Relation | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| a | Layer root → **own** Service | **A** | **A** | **A** | F | F | **A** | F | F |
| b | Layer root → **foreign Layer's** Service | F | F | F | F | F | F | F | F |
| c | Service → **own** Layer root | F | F | F | F | F | **A** | F | F |
| d | Service → **sibling** Service (same Layer) | F | F | **A** | F | F | **A** | F | F |
| e | Service → **foreign** Layer root | F | F | F | F | F | **A** | F | F |
| f | Service → **foreign Layer's** Service | F | F | F | F | F | **A** | F | F |
| g | Service → `shared` | **A** | **A** | F | F | F | F | F | F |
| h | Service → `api-contract` | F | F | F | F | F | F | F | F |
| i | Service → `design-system` | **U** | **U** | F | F | F | F | F | F |
| j | Service → `db:owned-table` | **A** | **A** | F | F | F | F | **A** | F |
| k | Service → `db:foreign-table` | F | F | F | F | F | F | F | F |
| l | Service → `db:schema-ns` | F | F | F | F | F | F | F | F |
| m | Service → `db:non-table` | **A** | **A** | F | F | F | F | F | F |
| n | Service → Application | F | F | F | F | F | F | F | F |
| o | Service → Tooling | F | F | F | F | F | F | F | F |
| p1 | Service **in agent-execution** → harness process | F | F | F | F | F | F | F | **A** |
| p2 | Service **elsewhere** → harness process | F | F | F | F | F | F | F | F |

**Totals: 17 Allowed · 117 Forbidden · 2 Unsettled.**

### Rules

- **(a) A Layer composes its own Services.** This is the one ground-truth statement AU28 **keeps**:
  `runtime-simplification.md:126-128` — the four Layer packages "depend on their own Layer's Service
  packages (**nothing more**)." Do not supersede it; cite it.
- **(b) — the 37-statement bucket.** Every one of `core-api`'s cross-Layer imports lands here
  (`session-requests` 15, `harness-registry` 10, `run-orchestration` 5, `dispatch` 4, `tool-handlers` 3),
  as do all three `web/scripts` imports of `@hyperidle/connections` / `@hyperidle/harness-registry`.
  **Alternative:** events (kind 6) for fire-and-forget, API (kind 4) for a synchronous ask.
- **(c) upward is a cycle.** A Service must never import its own Layer root. Zero live — free.
- **(d) — sibling Services talk through a port the Layer wires.** Kind 3 is Allowed here and *only*
  here plus (a): Ruling 1(1)'s "DI is legal only within the same Layer" is exactly this cell. Kind 1 is
  Forbidden — AU19 Mechanism C, enforced today by `composition-boundary-guard.ts`. Stating "same-Layer
  import" as one uniform kind (as `plan.md`'s candidate list did) would silently legalise the edge that
  guard exists to block.
- **(f) — the 4 live injected-port crossings.** `dispatch → harness-registry` (`DispatchPorts`),
  `run-orchestration → harness-registry` (`RunOptions`, `RunTransitionSpec`, `RuntimeDeps`), all wired
  at `core-api/src/services/{dispatch-bindings,run-orchestration-composition}.ts`. Forbidden. Cost:
  §3.1.
- **(g–m) — every Service manifest is already clean.** All 20 declare exactly
  `{@hyperidle/db, @hyperidle/shared}` (harness-registry: `{@hyperidle/shared}` only). Zero
  Service → Service, zero Service → Layer, zero Service → api-contract, zero Service → design-system,
  at both import and manifest grain. The whole M5 rule set costs the existing Service tree nothing.
- **(i) — the two Unsettled cells.** `core-ui` has **zero nested Services** today
  (`runtime-simplification.md:89-94` leaves its decomposition open). If it decomposes, a UI Service
  must import `design-system` and the cell flips to Allowed. Nothing in the evidence or the rulings
  decides it, because the actor does not exist yet. **Blocked on: the core-ui Service decomposition
  decision** (an open architecture question, not a registered WP).
- **(j) — the ACL, at import grain.** The owning Service may import and query its table. Everyone else
  may not, type-only included. This is the row Ruling 3.2 asks for.
- **(p1) — `harness-registry` writes the workspace.** The one Allowed kind-8 cell in the Service space.

---

## 8. M6 / M7 / M8 — Application, Tooling, Harness process (288 cells)

### M6 — Application → * (96 cells)

An Application composes Layers into a deployment. That is its entire job, and `plan.md`'s constraint
line already makes the exemption part of the spec rather than an ad-hoc carve-out.

| Target | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Layer | **A** | **A** | F | **A** | F | F | F | F |
| Service | F | F | F | F | F | F | F | F |
| `shared` | **A** | **A** | F | F | F | F | F | F |
| `api-contract` | F | F | F | F | F | F | F | F |
| `design-system` | F | F | F | F | F | F | F | F |
| `db:owned-table` | F | F | F | F | F | F | F | F |
| `db:foreign-table` | F | F | F | F | F | F | F | F |
| `db:schema-ns` | F | F | F | F | F | F | F | F |
| `db:non-table` | **A** | **A** | F | F | F | F | F | F |
| Application | F | F | F | F | F | F | F | F |
| Tooling | F | F | F | F | F | F | F | F |
| Harness process | F | F | F | F | F | F | F | F |

**Totals: 7 Allowed · 89 Forbidden · 0 Unsettled.**

**Rules and the four live Forbidden cells:**

- **→ Layer, kind 3 = Forbidden**, and this is the subtle one. An Application may wire **only ports
  whose declaring interface belongs to the receiving Layer**. `desktop/src/boot-server.ts:19` injects
  `createLocalAdapterPool` / `createSandboxAdapter` — interfaces declared in `harness-registry`
  (agent-execution) — into `createServer` (core-api). The port crosses a Layer boundary; routing it
  through an Application launders it, it does not legalise it. Ruling 1(1) is about the port, not the
  wirer.
- **→ Service = Forbidden.** An Application composes Layers; a Layer's internal decomposition is not
  the Application's business. Live: `desktop/src/boot-server.ts:19` and `remote-server`'s declared
  `@hyperidle/harness-registry`. **Alternative exists and is cheap:** `agent-execution/src/index.ts:20`
  already re-exports from `harness-registry`, so `import { createLocalAdapterPool } from "@hyperidle/agent-execution"`
  works today.
- **→ `db:non-table` = Allowed.** `desktop` runs `applyMigrations` / `isDowngrade` / `createPgliteDb` /
  `applyFactoryBootstrap`. Booting the database is a deployment concern.
- **→ Application = Forbidden.** *An Application is a deployment root; roots do not compose roots.*
  Live: `desktop/src/main.ts:20` imports `RemoteWorkerClient` from `@hyperidle/remote-worker`.
  **This cell deserves the founder's eye.** `remote-worker` is registered as an Application but is two
  things in one package — a deployable worker process (`index.ts`) and a reusable client class
  (`remote-worker-client.ts`, whose only dependency is `@hyperidle/shared`). The verdict is decidable
  and decided: Forbidden, with the alternative being that `RemoteWorkerClient` — a harness-side worker
  client — belongs in the `agent-execution` Layer. Relocation is the successor's job (Ruling 2).
- **Manifest blindness, measured.** `packages/desktop/package.json` declares **zero** `@hyperidle`
  dependencies while `desktop/src` imports five of them (`core-api/server-factory`, `harness-registry`,
  `db`, `shared`, `remote-worker`). It resolves purely by monorepo hoisting plus
  `tsconfig.base.json:25`. This is exactly the asymmetry kind 2 exists to catch, and every kind-2 cell
  above is currently unmeasured because `layer-boundary-scan.ts:247` returns early for any source whose
  role is not `layer`.

### M7 — Tooling → * (96 cells)

| Target | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Layer | **A** | **A** | F | **A** | F | F | F | F |
| Service | F | F | F | F | F | F | F | F |
| `shared` | **A** | **A** | F | F | F | F | F | F |
| `api-contract` | F | F | F | F | F | F | F | F |
| `design-system` | F | F | F | F | F | F | F | F |
| `db:owned-table` | F | F | F | F | F | F | F | F |
| `db:foreign-table` | F | F | F | F | F | F | F | F |
| `db:schema-ns` | F | F | F | F | F | F | F | F |
| `db:non-table` | **A** | **A** | F | F | F | F | F | F |
| Application | F | F | F | F | F | F | F | F |
| Tooling | F | F | F | F | F | F | F | F |
| Harness process | F | F | F | F | F | F | F | F |

**Totals: 7 Allowed · 89 Forbidden · 0 Unsettled.**

**Rules.** *A bench may boot and dial the system it benches* — Tooling gets the same Layer access an
Application gets (kinds 1, 2, 4), because that is the same act. It does **not** get to reach past a
Layer barrel, and it does **not** get privileged database access.

**Tooling → owned table is the single largest violation bucket in the repo, and it gets no carve-out.**
Ruling 6 asks for this verdict explicitly; the standing zero-exceptions-in-ownership-ACLs rule settles
it.

| Live | Count | Verdict | Alternative |
|---|---|---|---|
| `@hyperidle/eval` foreign-table imports (22 files) | **52** | **Forbidden** | seed and assert through the owning Service's API — `eval` already boots the real server, so it can POST |
| `packages/web/scripts/ah{5,6}-test-server.ts` foreign-table imports | **5** | **Forbidden** | same, after the scripts move to a Tooling package |
| `eval/src/runner.ts:14` `schema` namespace | 1 | **Forbidden** | `createPgliteDb` |
| `eval` → `@hyperidle/{harness-registry, settings, users}` (declared + imported) | 3 pkgs | **Forbidden** | reach the Layer barrel |
| `eval` → `@hyperidle/core-api` | — | **Allowed** | — |
| `eslint-plugin-authz`, `eslint-plugin-design` → any `@hyperidle/*` | **0** | — | (the two `@hyperidle/*` strings in their tests are lint-fixture source text, not imports) |

**57 foreign-table imports, all value imports, all outside every existing guard's scan scope** —
`table-ownership-guard.ts`'s `inspect()` walks only nested Service roots plus `packages/core-api/src`,
so it passes green while 57 violations sit in `eval` and `web/scripts`. The ACL's scan scope is the
hole, not its mapping.

### M8 — Harness process → * (96 cells)

A harness process is a non-package actor with no manifest, no imports, and no DI. It reaches the system
through exactly one door.

| Target | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Layer | F | F | F | F | **A** | F | F | F |
| Service · Foundation ×7 · Application · Tooling · Harness process (11 rows) | F | F | F | F | F | F | F | F |

**Totals: 1 Allowed · 95 Forbidden · 0 Unsettled.**

**Rules.** *A harness reaches the system only by MCP tool call, only against the Layer that owns an
MCP router* — today `agent-execution`. Kind 4 is **Forbidden**: a harness holds a per-session MCP
bearer token, not an API key, and giving it one would hand a sandboxed process the whole API surface.
Every other kind is structurally impossible for a process with no module graph, and stays Forbidden so
that making it possible would require changing this page first.

The tool handlers a harness reaches through MCP live in `core-api` and `agent-orchestration`
(`tool-provider-bindings.ts`, `tool-handlers-bindings.ts`). That is not a `harness → core-api`
crossing: the harness calls agent-execution's router, and agent-execution reaches the handlers over
its own legal mechanism. Under §1.3, the dialler owns the crossing.

---

## 9. M9 — Capability reach (30 cells)

Kind 9's target is a capability, not a package, so it needs its own axis. Without it, two live rules
(`execution-boundary-guard.ts:133-138` external-module ban; `:30-36` `child_process` harness-CLI-spawn
ban) implement a rule the contract could not express, and the reconciliation target of *zero guards
outside the contract* is unreachable by construction.

| Source | harness CLI spawn | raw LLM SDK (`openai`, `@anthropic-ai/sdk`) | MCP SDK (`@modelcontextprotocol/sdk`) |
|---|:--:|:--:|:--:|
| Foundation (any) | F | F | F |
| core-ui | F | F | F |
| core-api | F | F | F |
| agent-orchestration | F | F | F |
| **agent-execution** (Layer root) | **A** | **A** | **A** |
| **Service in agent-execution** | **A** | **A** | **A** |
| Service elsewhere | F | F | F |
| Application | F | F | F |
| Tooling | F | F | F |
| Harness process | **A** | **A** | **A** |

**Totals: 9 Allowed · 21 Forbidden · 0 Unsettled.**

**Rules.** *Only `agent-execution` touches the raw runtime* — the pre-existing rule AU19 Mechanism B
enforces, now a contract row. *A harness process is unconstrained* — it is a sandboxed external
process; the contract governs how it reaches HyperIdle (M8), not what it does internally.

**Live Forbidden:** `packages/eval/src/judges.ts:502` dynamically imports `@anthropic-ai/sdk`, and
`packages/eval/package.json` declares it. Tooling reaching a raw LLM SDK is Forbidden; **alternative:**
route judge calls through the model gateway, consistent with the standing "the only key" policy.
`execution-boundary-guard.ts` does not see this today — its scan scope is
core-api / agent-orchestration / agent-execution / web, and `eval` is outside it.

---

## 10. Completeness scorecard

| Matrix | Cells | Allowed | Forbidden | Unsettled |
|---|---:|---:|---:|---:|
| M1 Layer → Layer | 96 | 9 | 84 | **3** |
| M1b Layer → Application / Tooling / Harness | 96 | 1 | 95 | 0 |
| M2 Layer → Foundation | 224 | 20 | 204 | 0 |
| M2b table ownership completeness | 43 | 39 | 0 | **4** |
| M3 Foundation → Foundation | 96 | 6 | 90 | 0 |
| M4 Foundation → non-Foundation | 160 | 0 | 160 | 0 |
| M5 Services (6 relations + 7 Foundation surfaces + 4) | 136 | 17 | 117 | **2** |
| M6 Application → * | 96 | 7 | 89 | 0 |
| M7 Tooling → * | 96 | 7 | 89 | 0 |
| M8 Harness process → * | 96 | 1 | 95 | 0 |
| M9 Capability reach | 30 | 9 | 21 | 0 |
| **Total** | **1169** | **116** | **1044** | **9** |

**Reading the total honestly.** 1169 is the complete cell space, not 1169 independent decisions. **632
cells are covered by three blanket rules** stated once:

| Blanket rule | Cells |
|---|---:|
| **F-FOUND** — kinds 3–8 are Forbidden into any Foundation target, from any source (M2 168 · M3 72 · M5 42 · M6 42 · M7 42 · M8 42) | 408 |
| **Foundation is the floor** — M4, all kinds, all targets | 160 |
| **A Layer never knows its deployment** — M1b's Application and Tooling rows, all kinds | 64 |

The individually-reasoned remainder is **537 cells**. Both numbers matter: 1169 proves nothing is
omitted; 537 is the real size of the contract.

**Answer to the founder's question: yes — 9 cells of 1169 (0.8%) cannot be decided today.** Three
groups, each with a named blocker:

| Cells | What | Blocked on | Owner |
|---:|---|---|---|
| 3 | `{core-ui, core-api, agent-execution} → agent-orchestration`, kind 4 (API call) | `agent-orchestration` hosts **zero** routers, so "call its API" has no referent. The mechanism is legal; its endpoint does not exist. | **AU26** — locked design at `AU26/plan.md:32` ("each Layer owns and exports its own Hono app") |
| 4 | `db:owned-table` for `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills` | No owning Service exists. Ruling 6 abolishes the unowned state, so these are debt with no owner to be Allowed *for*. | **sessions-ownership WP** (new, §11) |
| 2 | `Service → design-system`, kinds 1–2 | `core-ui` has **zero nested Services**; the actor does not exist yet. | **core-ui Service decomposition** — open architecture question, `runtime-simplification.md:89-94` |

**Explicitly *not* Unsettled**, though each was a candidate:

- **`core-api`'s dual Layer/Application role** — dissolved by Ruling 5's package-grained registry. The
  26 composition-root crossings are Forbidden with AU26 as the closer, not ambiguous.
- **`web/scripts/*` package-vs-file role** — same resolution. They are core-ui Layer code; their 9
  Forbidden crossings close by relocating the scripts to Tooling.
- **`shared` split and `api-contract` disposition** — the *edges* are decided (`→ shared` Allowed for
  all four Layers; `→ api-contract` Allowed iff party to a port family). Only the *contents* move, and
  a content move never changes a cell's verdict.
- **Foundation → Foundation** — decided by rank, 6 Allowed cells.
- **Application → Application** — decided Forbidden; `remote-worker`'s registry entry is flagged for
  the founder's eye but the verdict does not depend on it.
- **MCP and the browser channel** — both now named kinds.

---

## 11. Successors the Unsettled cells block on

Named so every Unsettled cell has a real owner and every Forbidden cell with live instances has a
closer. All are **out of AU28's scope** (Ruling 2: AU28 ships the rules and the linting; "then we
figure out what we do where").

| WP | What it closes | Cells / violations |
|---|---|---|
| **AU26** (registered, locked design) | each Layer owns and exports its own Hono app; composition moves to the Application tier | 3 Unsettled cells · 26 composition-root crossings · the MCP-hosting import (§3.2) |
| **sessions-ownership** (new) | every table gets exactly one owning Service; `sessions` gets the Service it is missing | 4 Unsettled cells · 34 `sessions` files across 3 Layers · 8 `core-api/src` foreign-table imports |
| **db ACL hardening** (new) | widen `table-ownership-guard`'s scan scope beyond nested Services + `core-api/src`; close the type-only exemption and the `schema` namespace hole | 57 foreign-table imports · 4 `db:schema-ns` sites |
| **`shared` decomposition** (new) | S1–S5 from the inventory; and relocate the cross-Layer port pair out of `agent-work-intent-recorder.ts` | ~180 of ~940 symbol-occurrences · the M4 Foundation-hosted-port row |
| **api-contract disposition** (new) | re-cut a package with 1 live consumer cell of 6 and 11 zero-importer exports; fix the false "no runtime code" claim | the per-family scoping of M2's `→ api-contract` column |
| **web ↔ core-api typed contract** (new) | every `packages/web` response shape is an unchecked cast (`hooks/useFetch.ts:29`, `res.json() as Promise<T>`); server/client drift is undetectable by `tsc` | the correctness gap AU28's client.ts deletion does *not* close |
| **cross-Layer DI dissolution** | the 4 injected-port crossings and `desktop`'s in-process topology | 4 kind-3 edges · a runtime topology change to laptop-solo (§3.1) |
| **core-ui Service decomposition** (open question, unregistered) | whether `core-ui` decomposes into Services at all | 2 Unsettled cells |

---

## 12. Reproduction

| # | Command | Produces |
|---|---|---|
| C1 | `npx tsx scripts/layer-boundary-scan.ts` | 39 kind-1 statements / 7 pairs · 21 kind-6 edges · 4 kind-3 edges · 34 packages, 0 unclassified |
| C2 | `npx tsx scripts/table-ownership-guard.ts` | `PASS`, exit 0 — with 57 violations outside its scan scope |
| C3 | `npx tsx scripts/au6-agent-boundary-guard.ts --check` | `PASS`, exit 0, **zero files visited** (`SOURCE_ROOTS = ["packages/server/src"]`, a directory that does not exist), 7th in the `npm run lint` chain |
| C4 | `rg -a -o 'apiFetch\(' packages/web/src --glob '!*.test.*' --glob '!*.stories.tsx'` | 97 invocations across 51 files |
| C5 | `find packages -maxdepth 3 -name package.json -not -path '*/node_modules/*'` + `require(f).name` | the 34-package roster in §2 |
| C6 | per-Service manifest audit (§7) | all 20 Services declare exactly `{db, shared}` (harness-registry: `{shared}`) |
| C7 | `rg -a -n '^\s*(import\|export).*from "@hyperidle/' packages/<foundation>/src` | Foundation→Foundation: `design-system → shared` 44 prod / 49 all · `db → shared` 6 · `shared` 0 · `api-contract` 0 |
| C8 | `.pipeline/work/AU28/foundation-inventory.md` | the api-contract / shared / db-ACL inventories this matrix's Foundation rows rest on |
