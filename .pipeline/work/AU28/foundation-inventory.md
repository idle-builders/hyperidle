# AU28 — Foundation inventory

Evidence for founder Ruling 3 (`founder-rulings.md:76-99`): foundation importability is per-Layer,
`db` is ACL'd per table, `shared` may need splitting. **This document is evidence, not a proposal for
the rule.** The only judgement call it makes is Part 2's split recommendation, which Ruling 3 §3
explicitly asks for.

Every claim below carries a `file:line` or the command that produced it. Read-only pass — zero source
files changed (`git status --porcelain` clean except this WP's own `.pipeline/work/AU28/*` artifacts).

**Commands run (worktree `/Users/tg/hyperidle/.worktrees/pipeline-AU28`, 2026-08-04):**

| # | Command | Used for |
|---|---|---|
| C1 | `npx tsx scripts/layer-boundary-scan.ts` | cross-Layer crossings; package classification (34 packages, 0 unclassified) |
| C2 | `npx tsx scripts/table-ownership-guard.ts` | current ACL verdict → `table-ownership-guard: PASS`, exit 0 |
| C3 | custom AST scanner (scratchpad `inv.ts`, TypeScript compiler API) | import extraction across all `packages/**` prod files; cluster/owner attribution |
| C4 | `rg -a -n …` (various) | confirmation of every "zero matches" claim |

C3's method: `ts.createSourceFile` over every `.tsx?` under `packages/**` excluding `node_modules`,
`dist`, `__tests__`, `*.test.ts(x)`; collects `ImportDeclaration` + `ExportDeclaration` with a
`@hyperidle/*` specifier, per-symbol, with `isTypeOnly` at both clause and element grain. Package
attribution is by longest-matching package directory (so a nested Service wins over its Layer root).

**Two different units are counted below. They are not interchangeable:**
- **statements** — one `import …` / `export … from` line. Used in Parts 1 and 4.
- **symbol-occurrences** — one named symbol inside one statement. Used in Part 2's cluster tables,
  because a cluster is a set of symbols, not a set of lines.

---

## Part 1 — `@hyperidle/api-contract`: what is actually in it

### 1.1 Size and shape

6 source files, 950 LOC total (`wc -l packages/api-contract/src/*.ts`), of which 2 are tests.

`packages/api-contract/package.json` declares **no `dependencies` key at all** — zero runtime
dependencies, third-party or workspace. It is the only package under `packages/` with an empty
dependency surface.

**69 exported symbols: 68 type-only, 1 value.**

### 1.2 Clusters

| # | Cluster | File | LOC | Exports | Pure types? |
|---|---|---|---|---|---|
| A | **`CoreApiPort` seam family** | `core-api-port.ts` | 655 | 7 (6 port interfaces + `CoreApiTransport`) | yes |
| B | **`CoreApiPort` DTOs** | `core-api-port.ts` | (same file) | 38 request/response/view types | yes |
| C | **`AgentOrchestrationPort` seam family** | `agent-orchestration-port.ts` | 87 | 3 (2 port interfaces + `AgentOrchestrationTransport`) | yes |
| D | **`AgentOrchestrationPort` DTOs** | `agent-orchestration-port.ts` | (same file) | 2 entry types | yes |
| E | **Settings DTOs** | `settings.ts` | 72 | 7 (6 interfaces + `AutonomyLevel` union) | yes |
| F | **Auth DTO** | `auth.ts` | 35 | 1 (`AuthMeResponse`) | yes |
| G | **Session-start DTOs + runtime guard** | `session.ts` | 19 | 3 — 2 types **+ 1 runtime function** | **no** |

Cluster A detail (`core-api-port.ts:635-642`): `CoreApiPort` is a facade over six per-Service
families — `work` (11 methods, `:212-226`), `users` (2, `:232-235`), `conversation` (7, `:323-334`),
`org` (8, `:427-439`), `routine` (3, `:488-492`), `knowledge` (10, `:576-607`). Cluster C:
`AgentOrchestrationPort.sessions` (2 methods, `:54-71`).

There are **no zod schemas, no enums with runtime values, and no constants** anywhere in the package.
`ConversationMessageType` (`core-api-port.ts:276`) and `AutonomyLevel` (`settings.ts:15`) are string
*unions*, erased at compile time.

### 1.3 Does it carry runtime code? Yes — exactly one function, and it is dead

```
packages/api-contract/src/session.ts:15
export function isPendingSessionStart(value: unknown): value is PendingSessionStart {
```

Re-exported at `packages/api-contract/src/index.ts:73` (`export { isPendingSessionStart }` — the one
non-`export type` line in the barrel).

**It has zero consumers.** `rg -a -n 'isPendingSessionStart' --glob '!node_modules' .` returns exactly
two hits, both inside the package itself (its definition and its barrel re-export). Nothing in
`packages/**`, `scripts/**`, or anywhere else imports it.

So: 68 of 69 exports are pure type mirrors; the 69th is a runtime type-guard with no callers.
Practically the package is type-only; formally it is not, and its own documentation says otherwise in
three places:

| Location | Claim | Status |
|---|---|---|
| `index.ts:6` | "No runtime code — only TypeScript interfaces and type aliases." | **false** — contradicted 67 lines later at `:73` |
| `core-api-port.ts:5-6` | "TYPE-ONLY. `@hyperidle/api-contract` stays zero-runtime-deps (`package.json` declares no `dependencies`)" | true of *this file* and of package.json; not of the package |
| `agent-orchestration-port.ts:12-13` | "TYPE-ONLY, same as `core-api-port.ts` — `@hyperidle/api-contract` stays zero-runtime-deps." | same |

The "zero-runtime-**deps**" claim is accurate and load-bearing (it is why the seam DTOs are hand-mirrored
rather than imported from `shared` — see `core-api-port.ts:145-147`, `agent-orchestration-port.ts:33-42`).
The "no runtime **code**" claim is not.

**Collision worth naming:** `AutonomyLevel` is exported by *two* Foundation packages —
`api-contract/src/settings.ts:15` (`"manual" | "supervised" | "autonomous"`) and `shared/src/index.ts`
via `./knowledge.js`. Two Foundation packages own the same noun.

### 1.4 Who imports it today

**Exactly one package: `@hyperidle/core-api` (role: Layer). 3 files, 3 import statements, 51 distinct
symbols.** (C3; corroborated by `rg -a -n '@hyperidle/api-contract'` over the whole repo, whose only
other non-doc hits are `tsconfig.base.json:24`, the lockfiles, and `scripts/layer-boundary-scan.ts:94`.)

| Importer | Role | Layer | file:line | Clusters consumed |
|---|---|---|---|---|
| `@hyperidle/core-api` | Layer | core-api | `packages/core-api/src/services/agent-orchestration-port-composition.ts:19` | C + D (4 symbols) |
| `@hyperidle/core-api` | Layer | core-api | `packages/core-api/src/services/core-api-port-composition.ts:24` | A + B (44 symbols) |
| `@hyperidle/core-api` | Layer | core-api | `packages/core-api/src/services/tool-handlers-bindings.ts:26` | B (3 symbols: `CreateItemRequest`, `InsertRoutineRequest`, `UpdateRoutineRequest`) |

Manifest side: `packages/core-api/package.json:23` declares `"@hyperidle/api-contract": "*"`. It is the
only package in the repo that declares it. No undeclared importer exists.

Clusters **E (Settings), F (Auth), and G (Session-start)** — 11 of the 69 exports — have **zero
importers of any kind**, in any package. Only clusters A–D are live.

### 1.5 Importers that look wrong under the founder's rule

Under Ruling 3 ("not everything is allowed to import api contract… everything has a depends on the
layer"), the striking fact is not a bad importer — it is the **absence of importers**:

1. **All three importing files are composition-root files, not Layer-role code.** All three sit in
   `packages/core-api/src/services/*` — the bucket `requirements.md:235` classifies as
   "composition-root-shaped" and `requirements.md §6` establishes is Application-role code physically
   inside a Layer package (founder ruling `97b8728b`, quoted at `scripts/execution-boundary-guard.ts:62-83`).
   So today the *only* consumer of the cross-Layer contract package is the conflated composition root.

2. **The far side of the seam deliberately refuses to import it.** `agent-orchestration`'s
   `tool-handlers` — the Service the `CoreApiPort` DTOs exist to serve — hand-duplicates them instead:
   - `packages/agent-orchestration/tool-handlers/src/ports.ts:148` — "Structural mirror of
     `@hyperidle/api-contract`'s `TaskView` (Mechanism C: no import)."
   - `packages/agent-orchestration/tool-handlers/src/ports.ts:239` — same, for `ConversationThreadView`.

   So the DTOs are mirrored twice: once from the real routes into `api-contract`, then again from
   `api-contract` into `tool-handlers` — with `tsc` verifying neither hop
   (`core-api-port.ts:10-14`: "`tsc` cannot verify these mirrors against the real routes — fidelity is
   a TESTED obligation… never a compiler guarantee").

3. **`@hyperidle/core-ui` does not import it.** `web` gets its API types from a **Layer**, not from
   Foundation: `packages/web/src/api/client.ts:27`, `import type { AppType } from "@hyperidle/core-api/schemas"`.
   That is the 39th crossing of C1's scan and the one `requirements.md §7-D` flags as having no AC. The
   Foundation package that exists so `web` need not import a Layer is sitting unused while `web`
   imports the Layer.

---

## Part 2 — `@hyperidle/shared`: what is in it, and does it want splitting

### 2.1 Size and shape

45 non-test source modules across 6 subdirectories (`blocks/`, `format/`, `harness/`, `kinds/`,
`net/`, `observability/`, `types/`). **568 exported symbols: 339 type-only, 229 value.**

Unlike `api-contract`, it ships **real third-party runtime dependencies** (`packages/shared/package.json`):
`zod`, `@noble/hashes`, `github-slugger`, `remark-parse`, `remark-gfm`, `unified`. Two subpath exports:
`.` and `./net` (the latter because `net/ssrf.ts` uses `node:dns`/`node:net` and cannot load in a
browser — `index.ts` comment above the `ResolveResult` export).

### 2.2 Cluster × Layer evidence table

Symbol-occurrences (C3), attributed to the shared module the barrel re-exports each symbol from.
"nLayers" counts how many of the **four runtime Layers** import the cluster at all. Rows sorted by
nLayers ascending — the top of this table is the evidence for "it isn't shared".

| Cluster | nLayers | core-ui | core-api | agent-orch | agent-exec | App | Tooling | F:db | F:ds | TOTAL |
|---|---|---|---|---|---|---|---|---|---|---|
| `factory-roster` | **0** | 0 | 0 | 0 | 0 | 0 | 0 | **2** | 0 | 2 |
| `validate-env` | **0** | 0 | 0 | 0 | 0 | **1** | 0 | 0 | 0 | 1 |
| `part` | **1** | **40** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40 |
| `api-types` | **1** | 0 | **39** | 0 | 0 | 0 | 0 | 0 | 0 | 39 |
| `configuration` | **1** | 0 | 8 | 0 | 0 | 0 | 0 | 2 | 0 | 10 |
| `task-transition` | **1** | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| `harness-port` | **1** | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 6 |
| `agent-run-admission` | **1** | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 6 |
| `redact` | **1** | 0 | 3 | 0 | 0 | 0 | 0 | 2 | 0 | 5 |
| `auth` | **1** | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| `mention` | **1** | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 4 |
| `observability/` | **1** | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `kinds/` | **1** | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 3 |
| `trigger` | **1** | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `initials` | **1** | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `proposed-call` | **1** | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `toon-codec` | **1** | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `builtin-tool-catalog` | **1** | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `agent-work-intent-recorder` | 2 | 0 | 49 | 9 | 0 | 0 | 1 | 0 | 0 | 59 |
| `blocks/` | 2 | 18 | 1 | 0 | 0 | 0 | 0 | 0 | **22** | 41 |
| `logger` | 2 | 0 | 30 | 3 | 0 | 1 | 0 | 0 | 0 | 34 |
| `team` | 2 | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 4 | 26 |
| `format/` | 2 | 17 | 5 | 0 | 0 | 0 | 0 | 0 | 4 | 26 |
| `agent-behavior-config` | 2 | 4 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 18 |
| `session-request` | 2 | 0 | 3 | 14 | 0 | 0 | 0 | 0 | 0 | 17 |
| `filesystem` | 2 | 0 | 12 | 4 | 0 | 0 | 0 | 0 | 0 | 16 |
| `routine` | 2 | 8 | 7 | 0 | 0 | 0 | 0 | 0 | 1 | 16 |
| `agent-profile` | 2 | 3 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| `cron` | 2 | 0 | 5 | 3 | 0 | 0 | 0 | 0 | 0 | 8 |
| `notifications` | 2 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| `net/` | 2 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 |
| `artifact-preview` | 2 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 |
| `hint` | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `scope-labels` | 2 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| `thread` | 3 | 48 | 26 | 3 | 0 | 0 | 0 | 0 | **29** | 106 |
| `event-bus` | 3 | 0 | 50 | 11 | 1 | 0 | 7 | 0 | 0 | 69 |
| `tool` | 3 | 0 | 8 | 11 | **21** | 0 | 0 | 0 | 0 | 40 |
| `knowledge` | 3 | 19 | 4 | 4 | 0 | 0 | 0 | 0 | 4 | 31 |
| `agent-roles` | 3 | 9 | 5 | 1 | 0 | 0 | 1 | 2 | 0 | 18 |
| `connection` | 3 | 3 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 8 |
| `session-activity` | 3 | 4 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 6 |
| `harness/` | **4** | 9 | 6 | 19 | **71** | 8 | 0 | 0 | 0 | 113 |
| `types` | **4** | 27 | 21 | 12 | 1 | 0 | 7 | 1 | 9 | 78 |
| `events` | **4** | 2 | 53 | 6 | 2 | 0 | 0 | 0 | 1 | 64 |
| `model-gateway` | **4** | 2 | 16 | 5 | 3 | 0 | 5 | 0 | 0 | 31 |
| `types/` | **4** | 10 | 3 | 1 | 2 | 0 | 0 | 0 | 12 | 28 |
| `errors` | **4** | 1 | 7 | 11 | 2 | 0 | 0 | 0 | 0 | 21 |
| `credential` | **4** | 3 | 8 | 1 | 1 | 5 | 2 | 0 | 0 | 20 |

`F:db` = `@hyperidle/db` (Foundation), `F:ds` = `@hyperidle/design-system` (Foundation).
Layer columns roll up the Layer root package plus its nested Services.

**18 of 49 clusters are imported by exactly one runtime Layer. 2 more are imported by no runtime Layer
at all.** Only 7 clusters (`harness/`, `types`, `events`, `model-gateway`, `types/`, `errors`,
`credential`) are genuinely used by all four.

### 2.3 Clusters carrying real runtime behaviour or domain logic

`shared` is not a types-and-constants package. Measured by exported `function`/`class` declarations and
third-party imports (C4: `rg -a -n '^import .* from "(zod|unified|remark-parse|remark-gfm|github-slugger|@noble/hashes|node:)'`):

| Cluster | LOC | Exported fns/classes | Third-party runtime | What it actually does |
|---|---|---|---|---|
| `blocks/` | 836 (5 files) | 6 | `unified`, `remark-parse`, `remark-gfm`, `@noble/hashes`, `github-slugger` | a full markdown→AST→Block derivation pipeline + content hashing |
| `part` | 719 | 5 | — | derives UI "Parts" from messages/sessions, groups them, aggregates tool runs, derives composer pills |
| `thread` | 491 | 8 | — | thread configuration classification, verdict/status mapping, head-collapse predicate |
| `agent-work-intent-recorder` | 439 | 2 | — | **bakes** an agent run request (`bakeAgentRunnableConfig:222`, `toBakedContextKnowledgeItems:273`) + declares the cross-Layer `AgentWorkIntentRecorder`/`Reader` port pair (`:425`, `:433`) |
| `tool` | 391 | 10 | `zod`, `node:` | tool registry/spec conversion, reversibility classification, workflow allow-deny composition, identity hashing |
| `harness/harness-event-normalization` | 378 | 3 | — | normalizes per-harness event streams |
| `model-gateway` | 349 | 4 | — | model catalog + `resolveModel` resolution logic |
| `toon-codec` | 268 | 4 | — | encode/decode codec |
| `net/ssrf` | 235 | 7 | `node:dns`, `node:net` | SSRF URL sanitization — **cannot load in a browser** |
| `errors` | 173 | 11 | — | 11 domain error classes |
| `cron` | 166 | 3 | — | cron expression parser + next-run computation |
| `redact` | 158 | 3 | — | secret-pattern scrubbing |
| `event-bus` | 139 | 1 (`EventBus` class) | — | the in-process pub/sub implementation |
| `harness/mock-harness-adapter` | 87 | 1 (`MockHarnessAdapter`) | — | **a test double shipped from a production Foundation package** |

`zod` schemas are exported as runtime values from `artifact-preview`, `session-request`, `trigger`,
`tool`, and all 7 `kinds/*` modules.

### 2.4 Verdict: **grab-bag**

Three independent lines of evidence, all mechanical:

1. **Sharedness fails on its own terms.** 20 of 49 clusters (41%) are imported by ≤1 runtime Layer.
   The two largest single-Layer clusters — `part` (40 occurrences, core-ui only, 719 LOC) and
   `api-types` (39, core-api only) — are together the 3rd and 4th busiest clusters in the package and
   neither is shared by anything. A Layer importing `@hyperidle/shared` today pulls a package where the
   plurality of clusters have nothing to do with it.

2. **It is not a types package.** 229 of 568 exports are values. It ships a markdown toolchain
   (`unified`/`remark`), a cryptographic hash (`@noble/hashes`), a slugger, a zod dependency, node-only
   networking code, 11 error classes, a pub/sub implementation, a cron parser, and a mock adapter. Every
   Layer's dependency closure carries all of it.

3. **It hosts a cross-Layer DI seam with domain logic in it.** `agent-work-intent-recorder.ts`
   declares `AgentWorkIntentRecorder` (`:425`) and `AgentWorkIntentReader` (`:433`) — an injected-port
   pair whose provider and consumer are in *different* Layers (core-api 49 occurrences,
   agent-orchestration 9), plus the `bakeAgentRunnableConfig` domain function they exchange. Under
   Ruling 1 §1 ("an injected port crossing a Layer boundary is forbidden"), parking the interface in
   Foundation is precisely how such a port becomes invisible to import-based checks. This is the same
   shape as `api-contract`'s seam ports — but in the other Foundation package, and carrying runtime code.

### 2.5 Proposed split lines

Ordered by (value ÷ cost). Costs are real re-point counts from C3, not estimates.

| # | Candidate package | Clusters moved | Occurrences moved | Cost to re-point |
|---|---|---|---|---|
| **S1** | *(no new package)* — fold `api-types` into `@hyperidle/core-api` | `api-types` | 39 | **Near zero.** 39 occurrences, all inside `@hyperidle/core-api` already. Pure deletion of a Foundation round-trip. |
| **S2** | *(no new package)* — fold `part` into `@hyperidle/design-system` | `part` | 40 | **Near zero.** 40 occurrences, all in `@hyperidle/core-ui`; `design-system` is already core-ui's Foundation and already imports `shared` 48×. Removes 719 LOC of UI derivation from every Layer's closure. |
| **S3** | `@hyperidle/content` | `blocks/`, `kinds/`, `types/artifact`, `mention` | ~70 | **Low.** Consumers are `design-system` (22+1+12+2), `web` (18+10), `core-api` (1+2+3+2). Pulls `unified`/`remark-parse`/`remark-gfm`/`github-slugger`/`@noble/hashes` out of the Foundation every Layer imports — the single biggest dependency-closure win. |
| **S4** | `@hyperidle/harness-contract` | `harness/`, `harness-port`, `tool` | 159 | **Moderate.** Dominated by agent-execution (92) + agent-orchestration (30), but core-ui imports `harness/` 9× and core-api 6×+8× — so it is not cleanly one Layer. Worth it only if the capability-descriptor types stay reachable by `web`'s settings UI. |
| **S5** | *(relocate, no new package)* — misfiled singletons | `validate-env` → Application; `factory-roster` → `@hyperidle/db`; `builtin-tool-catalog`, `observability/`, `trigger`, `initials`, `auth`, `task-transition`, `configuration` → their one consuming Layer; `proposed-call` → core-ui | ~30 | **Low.** Each has 1–10 occurrences in exactly one Layer (or, for `factory-roster`, only in `db`). |
| **S6** | *(decide, don't relocate blindly)* — `agent-work-intent-recorder` | 59 occurrences, 2 Layers | 59 | **High, and it is a rule question not a packaging one.** It is a genuine cross-Layer seam. Either it belongs in `api-contract` (its type-mirror half) with the two baking functions relocated into core-api, or Ruling 1 §1 has to say explicitly that a Foundation-hosted port interface is legal. Do not move it before the rule is written. |

**What must stay in `shared` regardless:** `events` + `event-bus` (133 occurrences, 4 Layers) — these
*are* crossing kind #5, the domain-event mechanism; every Layer must reach them. Likewise `types`
(78, 4 Layers), `errors` (21, 4), `credential` (20, 4), `model-gateway` (31, 4), `logger` (34, 2 Layers
+ Application).

Executing S1+S2+S3+S5 would move ~180 of the ~940 shared symbol-occurrences and remove all six
third-party runtime dependencies except `zod` from the package every Layer imports. It touches no
cross-Layer boundary — every one of those moves is within a single Layer's own reach.

---

## Part 3 — `@hyperidle/db`: the table→owner ACL

### 3.1 The tables

`packages/db/src/schema.ts` declares **43 tables** (`grep -c 'export const \w* = pgTable'` reports 44;
one hit is a false positive — `schema.ts:979` is a doc comment containing the literal string
`export const X = pgTable(...)`, not a declaration).

`scripts/table-ownership-guard.ts` is the existing ownership source of truth and it is **complete**:
- `TABLE_OWNER` (`:66-278`) — **39 rows**
- `UNOWNED_SHARED_TABLES` (`:349-354`) — **4 tables**: `sessions`, `propagationLog`,
  `taskDispatchAttempts`, `userSkills`
- 39 + 4 = 43. **Zero tables in the schema lack a verdict** (C3 reconciliation).
- `assertDisjointOwnership` (`:362-374`) throws at load time if the two sets ever overlap.

### 3.2 Table → owning Service

| Owning Service | Layer | Tables |
|---|---|---|
| `packages/core-api/knowledge` | core-api | `knowledgeItems`, `knowledgeEditLog`, `knowledgeAccessLog`, `knowledgeConflicts`, `knowledgeAppProjection` |
| `packages/core-api/work` | core-api | `bets`, `tasks`, `items`, `artifacts`, `taskPlanningSignals` |
| `packages/core-api/org` | core-api | `teamMembers`, `orgEdges`, `teams` |
| `packages/core-api/users` | core-api | `users`, `loginSessions`, `inviteCodes`, `hintProgress` |
| `packages/core-api/conversation` | core-api | `threads`, `messages` |
| `packages/core-api/settings` | core-api | `serverConfig`, `plugins`, `pluginConfigurationDefaults`, `configurationOverrides` |
| `packages/core-api/notifications` | core-api | `notificationQueue` |
| `packages/core-api/connections` | core-api | `serverCredentials`, `serviceConnections` |
| `packages/core-api/routine` | core-api | `routines`, `routineRuns` |
| `packages/core-api/review` | core-api | `proposedCalls`, `operationOutcomes`, `tailoredGrants` |
| `packages/core-api/filesystems` | core-api | `filesystems`, `filesystemInjections`, `filesystemCaptures` |
| `packages/agent-orchestration/session-requests` | agent-orchestration | `triggerResolutionHistory`, `agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts`, `agentLifecycleInbox` |
| *(no owner — explicitly exempt)* | — | `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills` |

**All 39 owned tables belong to 12 Services in 2 Layers.** `core-ui` and `agent-execution` own zero
tables. Services owning zero tables (`policy`, `git-export`, `observability`, `realtime`, `dispatch`,
`run-orchestration`, `tool-handlers`, `harness-registry`) are documented as such in the guard's inline
`@lore` (`:225-265`).

### 3.3 Does the guard enforce at the *import* or only at the *query*? — **Both, with three holes**

The founder's rule is about the import. That check already exists. `checkAccess` (`:514-602`) fires on
three distinct node shapes:

| Detector | Lines | Grain |
|---|---|---|
| Drizzle query access — `.from/.insert/.update/.delete/.leftJoin/.innerJoin/.rightJoin/.fullJoin(bareTable)` | `:564-573` (methods at `:376-378`) | **query** |
| **Value import of a table symbol from `@hyperidle/db`** | `:574-587` | **import** |
| Namespace-import property access (`import * as db` → `db.bets`) | `:591-597` | import + use |

So `import { bets } from "@hyperidle/db"` in a non-owner file already fails today, with the message
`value import touches "bets" owned by packages/core-api/work — route through that Service (Table ACL)`
(`:555-559`). **Three holes remain:**

1. **Type-only imports are exempt by construction.** `:580` requires `!node.importClause.isTypeOnly` and
   `:585` requires `!el.isTypeOnly`. `import type { bets } from "@hyperidle/db"` passes the ACL. (Under
   `requirements.md §3.2`'s hard rule — type-only-ness is a sub-property of module import, not an
   exemption — this is a contract-level gap, not a bug in the script.)
2. **Scan scope excludes most of the repo.** `inspect()` (`:604-630`) walks only
   `nestedServiceRoots()` — `packages/<layer>/<service>/src/**`, i.e. packages with their own
   `package.json` one level under a top-level dir (`:421-436`) — plus `packages/core-api/src/**`
   (`:625-628`). **Never scanned:** `packages/web/**`, `packages/eval/**`, `packages/desktop/**`,
   `packages/remote-server/**`, `packages/remote-worker/**`, `packages/agent-orchestration/src/**`,
   `packages/agent-execution/src/**`, `packages/design-system/**`.
3. **Tests are exempt.** `collectSourceFiles` (`:399-418`) skips `__tests__/` and `*.test.ts(x)`.

The guard is **green today**: `npx tsx scripts/table-ownership-guard.ts` → `table-ownership-guard: PASS`,
exit 0 (C2).

### 3.4 The gap: who imports a table they do not own, today

C3 applies the founder's rule at its stated grain — **every package under `packages/**`, production
files, any import of a table symbol** — and checks it against `TABLE_OWNER`.

> **True total: 57 foreign-table imports, across 23 files, in 2 packages.**
> All 57 are **value** imports; **0** are type-only. All 57 sit **outside the guard's scan scope**,
> which is exactly why the guard passes.

| Importing package | Role | Layer | Violations |
|---|---|---|---|
| `@hyperidle/eval` | **Tooling** | — | **52** |
| `@hyperidle/core-ui` | **Layer** | core-ui | **5** |

Complete file list (not truncated — all 23 files; counts sum to 57):

| # | file:line | Foreign tables imported → owner |
|---|---|---|
| 13 | `packages/eval/src/seeding.ts:15` | `artifacts`,`bets`,`items`,`tasks`→`work`; `knowledgeAppProjection`,`knowledgeConflicts`,`knowledgeItems`→`knowledge`; `messages`,`threads`→`conversation`; `routines`→`routine`; `teamMembers`,`teams`→`org`; `users`→`users` |
| 8 | `packages/eval/src/judges.ts:15` | `artifacts`,`items`,`tasks`→`work`; `knowledgeAppProjection`,`knowledgeEditLog`,`knowledgeItems`→`knowledge`; `messages`→`conversation`; `routines`→`routine` |
| 4 | `packages/web/scripts/ah6-test-server.ts:47` | `serverCredentials`→`connections`; `teamMembers`,`teams`→`org`; `users`→`users` |
| 3 | `packages/eval/src/scenarios/delegation.ts:33` | `agentWorkIntents`→`session-requests`; `routineRuns`,`routines`→`routine` |
| 3 | `packages/eval/src/scenarios/tool-authorization.ts:13` | `knowledgeAppProjection`,`knowledgeItems`→`knowledge`; `messages`→`conversation` |
| 2 | `packages/eval/src/scenarios/builtin-routines.ts:18` | `items`→`work`; `routines`→`routine` |
| 2 | `packages/eval/src/scenarios/poc-session-notes.ts:10` | `knowledgeItems`→`knowledge`; `tasks`→`work` |
| 2 | `packages/eval/src/scenarios/promote-knowledge.ts:8` | `knowledgeEditLog`,`knowledgeItems`→`knowledge` |
| 2 | `packages/eval/src/scenarios/routine-sessions.ts:14` | `items`→`work`; `routines`→`routine` |
| 2 | `packages/eval/src/scenarios/send-message.ts:7` | `messages`,`threads`→`conversation` |
| 2 | `packages/eval/src/scenarios/skill-autonomy.ts:12` | `items`→`work`; `routines`→`routine` |
| 2 | `packages/eval/src/scenarios/submit-review.ts:8` | `messages`,`threads`→`conversation` |
| 2 | `packages/eval/src/scenarios/write-memory.ts:7` | `knowledgeAppProjection`,`knowledgeItems`→`knowledge` |
| 1 | `packages/eval/src/scenarios/create-artifact.ts:8` | `artifacts`→`work` |
| 1 | `packages/eval/src/scenarios/create-conflict-review.ts:8` | `knowledgeConflicts`→`knowledge` |
| 1 | `packages/eval/src/scenarios/create-item.ts:8` | `items`→`work` |
| 1 | `packages/eval/src/scenarios/create-task.ts:7` | `tasks`→`work` |
| 1 | `packages/eval/src/scenarios/handoff-to.ts:7` | `items`→`work` |
| 1 | `packages/eval/src/scenarios/knowledge-writeback.ts:8` | `knowledgeItems`→`knowledge` |
| 1 | `packages/eval/src/scenarios/log-task.ts:7` | `tasks`→`work` |
| 1 | `packages/eval/src/scenarios/read-inbox.ts:7` | `messages`→`conversation` |
| 1 | `packages/eval/src/scenarios/score-attention.ts:8` | `knowledgeAppProjection`→`knowledge` |
| 1 | `packages/web/scripts/ah5-test-server.ts:39` | `serverCredentials`→`connections` |

A 24th file, `packages/web/scripts/ah1-test-server.ts:29`, imports `{ schema }` from `@hyperidle/db`
and no named table — zero violations at the name grain, but see §3.5.

**Where they are not.** Zero violations in `packages/web/src/**` (all 5 `web` violations are in
`packages/web/scripts/*-test-server.ts`), zero in any Layer root `src/`, zero in any nested Service,
zero in `desktop`/`remote-server`/`remote-worker`. Every Service and Layer package in the runtime graph
is already clean at the import grain — the gap is entirely **Tooling** plus **one Layer's non-`src`
scripts directory**.

**Undeclared dependency.** `@hyperidle/core-ui` imports `@hyperidle/db` but does **not** declare it in
`packages/web/package.json` (declared: `connections`, `design-system`, `core-api`, `harness-registry`,
`shared`). It resolves only because the monorepo hoists. C3 found this to be the **only** undeclared
foundation dependency in the repo — every other foundation import is manifest-backed, and no package
declares a foundation dep it never imports.

### 3.5 Latent bypass no name-based ACL can see

`packages/db/src/index.ts:31` — `export * as schema from "./schema.js";` — hands **every table** through
a single symbol. Four files import it (C4):

- `packages/eval/src/runner.ts:14` — `import { type HyperIdleDb, schema } from "@hyperidle/db";`
- `packages/web/scripts/ah1-test-server.ts:29` — `import { schema } from "@hyperidle/db";`
- `packages/web/scripts/ah5-test-server.ts:39` — `import { schema, serverCredentials } from "@hyperidle/db";`
- `packages/web/scripts/ah6-test-server.ts:47` — `import { schema, serverCredentials, teamMembers, teams, users } from "@hyperidle/db";`

**Today none of the four dereferences a table through it.** `rg -a -on 'schema\.\w+'` across all four
returns zero hits; every use is the Drizzle constructor argument (`drizzle(client, { schema })` —
`eval/src/runner.ts:71`, `web/scripts/ah1-test-server.ts:52`). So this is a hole, not a current
violation — but it is a hole that the guard's namespace detector (`:591-597`, which only handles
`import * as db from "@hyperidle/db"`, and C4 confirms **zero** files use that form) does not cover, and
that an import-grain rule phrased over table names cannot see.

---

## Part 4 — the per-Layer foundation matrix, as-is

Import **statements** (C3), production files only. Layer columns roll up the Layer root package plus its
nested Services. Foundation→Foundation is broken out because it is unspecified today.

| Foundation pkg | core-ui (`web`) | core-api | agent-orchestration | agent-execution | Application | Tooling | Foundation→Foundation |
|---|---|---|---|---|---|---|---|
| **`@hyperidle/shared`** | **yes — 120** | **yes — 144** | yes — 19 | yes — 23 | yes — 5 | yes — 11 | `design-system` 48, `db` 6 |
| **`@hyperidle/db`** | yes — 6 *(all in `web/scripts/`; **0** in `web/src`)* | **yes — 132** | yes — 13 | **no — 0** | yes — 1 (`desktop`) | **yes — 30** (`eval`) | none |
| **`@hyperidle/api-contract`** | **no — 0** | yes — **3** | **no — 0** | **no — 0** | **no — 0** | **no — 0** | none |
| **`@hyperidle/design-system`** | yes — 67 | **no — 0** | **no — 0** | **no — 0** | **no — 0** | **no — 0** | none |

Totals: `shared` 376 statements across 8 consumer groups; `db` 182 across 5; `api-contract` 3 across 1;
`design-system` 67 across 1.

### What stands out

**Obviously wrong / structurally odd:**

1. **`api-contract` has one live cell out of six, and it is the wrong one.** The package whose stated
   job is the cross-Layer contract is imported by exactly one Layer (core-api, 3 statements) — and all
   3 statements are in that Layer's composition root (`src/services/*`), which `requirements.md §6`
   establishes is Application-role code. Meanwhile the Layer that should be its flagship consumer imports
   a **Layer** instead (`packages/web/src/api/client.ts:27` → `@hyperidle/core-api/schemas`), and the
   Services on the far side of the seam hand-mirror its DTOs rather than import them
   (`packages/agent-orchestration/tool-handlers/src/ports.ts:148`, `:239`). Any per-Layer importability
   matrix for `api-contract` is being written over a package that is currently near-unused.

2. **`Tooling → db` = 30 statements and 52 of the 57 ACL violations, from one package.** `@hyperidle/eval`
   declares `@hyperidle/db` legitimately (`packages/eval/package.json`) and then imports 52 foreign
   tables. It is outside every guard's scan scope. Whatever verdict the contract gives the Tooling row,
   this is where it lands.

3. **`core-ui → db` is a scripts-only artifact.** 6 statements, all in `packages/web/scripts/*-test-server.ts`;
   `packages/web/src/**` imports zero db symbols. Plus it is the repo's only undeclared foundation
   dependency (§3.4). A "Layers may not import db" rule costs `web` nothing in `src` — it costs three
   test-server scripts.

**Where a rule change would be expensive:**

4. **`core-api` is 279 of the 628 foundation import statements in the repo** (`shared` 144 + `db` 132 +
   `api-contract` 3; repo total = `shared` 376 + `db` 182 + `api-contract` 3 + `design-system` 67). Every cell in that column is the expensive one. Narrowing either
   `core-api → shared` or `core-api → db` is a several-hundred-site change, and `core-api → db` cannot
   narrow at all without first resolving §6's role conflation, since the Services that own the tables
   *are* core-api's own nested packages.

5. **`agent-execution → db` = 0, and `agent-execution` owns zero tables.** The strictest possible
   rule — "this Layer may not import `db`" — is **free** today. Same is nearly true for `core-ui`
   (6 statements, all non-`src`).

6. **`design-system` (Foundation) imports `shared` (Foundation) 48× and `db` imports `shared` 6×.**
   Foundation→Foundation is a real, live edge with 54 statements and no rule covering it. Note the
   direction is one-way: nothing imports `design-system` except `web`, and nothing imports
   `api-contract` except `core-api`. A per-Layer matrix that has rows only for Layers will not have a
   cell for these 54 statements.

7. **`design-system` is already per-Layer-scoped in practice** — 67 statements, 100% from `core-ui`,
   zero from anywhere else. Whatever the contract says about it, the code already obeys the strictest
   version.

---

## Undetermined

- **Whether the 4 `UNOWNED_SHARED_TABLES` (`sessions`, `propagationLog`, `taskDispatchAttempts`,
  `userSkills`) should get owners.** The guard's `@lore` (`:280-348`) argues each is genuinely
  multi-owner and that forcing an owner would be a false-ownership claim. Confirming or overturning that
  requires a per-table accessor census that is out of this inventory's scope. Tried: read every `@lore`
  block in `table-ownership-guard.ts:280-348`; they assert the claim but the underlying census predates
  AU19 Increment 5 and was not re-run here.
- **Whether `web/scripts/*-test-server.ts` counts as `core-ui` Layer code or as Tooling.** They live
  inside `packages/web` (a Layer package) but are test harnesses, not shipped UI. `scripts/layer-boundary-scan.ts`'s
  `discoverAllPackages` classifies by package, not by file, so it calls them `core-ui`. This is the same
  package-vs-file role question `requirements.md §3.3` raises for `core-api/src` — recorded, not decided.
  All 5 of `web`'s ACL violations and all 6 of its `db` imports hinge on it.
