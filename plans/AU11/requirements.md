# AU11 — Runtime Ownership Hard Cut — Requirements (refine)

**Workpackage:** AU11 (Track AU, Runtime Simplification). Type: framework. Complexity: L (~4d).
**Baseline:** `origin/main` = `6dd27dfd` (AU9 merged #425, AU10 merged #426). Both dependencies landed.
**Pre-build gates:** Refinement REQUIRED (this doc). Design NOT required (no UI surface). Human concept review: No.
**DOC-CLASS:** moderate (developer architecture docs only — `docs/architecture/runtime-simplification.md`, `docs/architecture/as-implemented-domain-architecture.md` — need real edits to describe two runtime owners instead of three; no user-facing concept changes, no user-guide rewrite). **DESIGN-CLASS:** n/a.

---

## 1. The thing being reshaped (concept)

AU7 retired the Strategy/Fabric *packages*, but relocated the former Fabric service bundle wholesale into `packages/server/src/app-runtime/` — a 65-file, ~16k-line directory with its own barrel (`app-runtime/index.ts`), its own grab-bag boot shell (`bootstrapAppRuntime`), and its own package export (`@hyperidle/server/app-runtime`). That directory is the **transitional shell**: a third runtime owner sitting between Core app and Agent layer, exactly the gap the as-is-vs-should audit registers as open item 6 ("the app-runtime layer is still a third runtime owner… as-should has two owners, as-is has three").

AU11 is the destructive closure: **dissolve `app-runtime/` as an ownership boundary.** Every responsibility inside it must land in its final should-graph home — Core app domain, Agent layer, or editable configuration — or be deleted as dead behavior. Nothing may remain that groups former Fabric services under the "app-runtime" name (no barrel, no boot shell, no package export, no directory-as-layer, no alias).

This is **not** a rename and **not** a new feature. It is classification → move/delete → prove-by-existing-tests.

### What AU11 IS
- A reclassification pass: each `app-runtime` module gets a final owner (Core / Agent / Config / Delete).
- A physical dissolution: the `app-runtime/` directory, its `index.ts` barrel, the `bootstrapAppRuntime` grab-bag, and the `./app-runtime` package export cease to exist.
- A dependency-direction cut: core routes/services stop importing harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution, or agent lifecycle implementation details.
- A guard: a static `au11-runtime-ownership-guard.ts` (wired into `npm run lint`, same pattern as au6/au7/au9/au10) that fails if the `app-runtime` grouping returns or if a core route imports an execution internal.

### What AU11 is NOT (rejection list)
- NOT AU9's job (already merged): core no longer *creates/consumes/executes* agent requests — it records `agent_work_intents`. AU11 must not reopen that; it removes the *shell and the residual dependency reach*, not the handoff contract.
- NOT AU10's job (already merged): plugin/default config no longer imports runtime registries. AU11 finishes the one edge AU10 explicitly deferred: `agent-defaults/resolvers.ts` importing `app-runtime/roster` + `app-runtime/services/agent-selection`.
- NOT AU8's job (blocked on AU11): AU8 builds the *complete mechanical* should-graph guard. AU11 adds only the one guard for the boundary it cuts; it does not attempt the full graph.
- NOT a behavior change. Every Work/Conversation/Knowledge/Settings/Routine/notification/session/tool/MCP/harness behavior stays observable. Behavior is deleted only where refinement below explicitly marks it dead. In particular, `routine-scheduler`'s fire-time agent selection is **not** relocated to drain-time (that would be a behavior change — see §3).
- NOT a new package split. Owners are realized as directory homes inside `packages/server/src` (`knowledge/`, `notifications/`, agent-owned files in `services/`, `config/`), consistent with how AU9 realized the agent-owned boundary as a file set within `services/` — not as a new workspace package. (One new *public package export subpath*, `@hyperidle/server/routines`, is added for the cross-package `packages/eval` consumer — a curated seam, not a new package — see §3.)
- NOT the Prompt Catalog / 8th-config-kind question (as-is-vs-should gap 7) — a separate product decision, out of scope.

---

## 2. Responsibility classification (the core refine deliverable)

Every `app-runtime` module classified as **Core app**, **Agent layer**, **Editable config**, or **Delete**. Grouped by responsibility (files listed are code anchors, all under `packages/server/src/app-runtime/`). The architecture doc turns this into the file-by-file move plan.

### → CORE APP

| Responsibility | Files | Target home | Rationale |
|---|---|---|---|
| Knowledge CRUD / search | `knowledge-repository.ts`, `fts.ts` | `server/src/knowledge/` | should-graph: "Knowledge CRUD, search, scoring, projections: core app Knowledge services." |
| Knowledge domain model | `types.ts`, `layers.ts`, `errors.ts`, `events.ts`, `role-community-map.ts` | `server/src/knowledge/` | Core Knowledge vocabulary + events. |
| Knowledge scoring / relevance / attention / promotion | `relevance-engine.ts`, `relevance-scoring.ts`, `relevance-service.ts`, `relevance-listener.ts`, `attention-classifier.ts`, `attention-scoring.ts`, `services/attention-service.ts`, `services/relevance-service.ts`, `services/relevance-listener.ts`, `scoring-config.ts`, `token-budget.ts`, `promotion-pipeline.ts`, `conflict-resolution.ts` | `server/src/knowledge/` | Scoring/projections are core Knowledge, not a runtime layer. |
| Notifications (queue/delivery/preferences/digest) | `services/notifications/*` (12 files), `services/daily-digest.ts`, `services/silence-policy.ts` | `server/src/notifications/` | should-graph Notification Service: queue, delivery state, preferences. |
| Trust / approval policy | `services/policy-engine.ts`, `services/approval-rate.ts` | `server/src/services/` (core) | Policy is a core Settings/trust concern, not agent execution. |
| Review routing | `services/org-routing.ts`, `services/founder-router.ts`, `services/item-router.ts`, `services/review-item-factory.ts`, `services/session-review-creator.ts` | `server/src/services/` (core) | Work/review record routing. |
| Bet/task lifecycle cascade | `services/lifecycle-propagation.ts` | `server/src/services/` (core) | Core Work process automation (imports only db + `PropagationLevel`). |
| Data retention | `services/retention-reaper.ts` | `server/src/services/` (core) | Core durable-data hygiene. |
| Practice-meeting domain | `services/practice-meeting.ts` | `server/src/services/` (core) | Knowledge/collaboration domain feature (db + `KnowledgeKind` only). |
| Git export of core records | `services/git-export.ts`, `services/git-export-runner.ts` | `server/src/services/` (core, or `filesystem/`) | Operates on `knowledgeItems`/`knowledgeAppProjection` — core-record export, not LLM execution. |
| Agent-run lifecycle projection into domain read models | `services/agent-lifecycle-projectors.ts` | `server/src/services/` (core) | Already core-owned (AU9): per-family projectors mutate core read models, no agent-runtime import. |
| Routine cron / due-evaluation | `services/routine-scheduler.ts` (incl. `checkAndFireRoutine`) | `server/src/services/` (core) | Core Routine: cron/due-eval + `recordAgentWorkIntent`. Fire-time agent-selection call stays (option b, §3). |

### → AGENT LAYER (joins the AU9 agent-owned file set in `server/src/services/`)

| Responsibility | Files | Target home | Rationale |
|---|---|---|---|
| Context assembly | `context-assembly.ts`, `context-assembly-prompt.ts`, `session-context.ts` | `server/src/services/` (agent-owned) | should-graph: context providers are Agent layer, backed by core Knowledge. |
| Capture / writeback | `writeback.ts`, `file-watcher.ts`, `polling-watcher.ts` | `server/src/services/` (agent-owned) | should-graph: capture/writeback is the Agent-layer pipeline. |
| Agent scaffolding / roster | `roster.ts`, `contracts.ts` (`ScaffoldRequest`/`SelectAgentRequest`/`DecomposeBetRequest`/`AssistantFormation`) | `server/src/services/` (agent-owned) | Agent creation + selection contracts; consumed *type-only* by `agent-defaults/resolvers.ts` — resolves the AU10-deferred edge. |
| Agent selection | `services/agent-selection.ts` | `server/src/services/` (agent-owned) | Runtime "which agent" decision = Agent layer. |
| Task dispatch (fire → provisioning) | `services/task-dispatcher.ts` | `server/src/services/` (agent-owned) | Dispatch → session provisioning is Agent-layer execution. |
| Assistant dispatch | `services/assistant-dispatcher.ts` | `server/src/services/` (agent-owned) | Assistant-turn provisioning is Agent layer. |
| Cost / limits | `services/cost-cap.ts`, `services/cost-sentinel.ts` | `server/src/services/` (agent-owned) | should-graph Cost and Limit Service = Agent layer. |
| Session hygiene reapers | `services/routine-session-reaper.ts`, `services/sandbox-reaper.ts` | `server/src/services/` (agent-owned) | Reap agent sessions/sandboxes = Agent-layer lifecycle. |
| Provisioning injection seam | `services/provision-registry.ts` | `server/src/services/` (agent-owned) | The `provisionSession`/request-create injection point is Agent-layer. |

### → EDITABLE CONFIGURATION (built-in plugin defaults, AU2/AU10 path)

| Responsibility | Files | Target home | Rationale |
|---|---|---|---|
| Built-in routine defaults + handlers | `services/builtin-routines.ts` | Split: default *records* → `server/src/config/` (built-in plugin defaults); *handlers* (`provisionTeamRoutines`, `runBuiltinRoutine`, handler registration) → agent-owned `services/` | Component-inventory: "first-party plugin routines." Data-vs-handler split mirrors AU10's catalog-vs-registry cut. |
| Git-export config | `services/git-export-config.ts` | `server/src/config/` | Editable export policy (defaults/overrides). |
| Scoring/relevance default constants | (constants within `scoring-config.ts`) | Stay with Core Knowledge scoring | Tunable defaults; not a plugin catalog. Keep with Knowledge. |

### → DELETE (dead ownership artifacts + dead dependency reach)

| Item | Why |
|---|---|
| `app-runtime/index.ts` (the barrel) | The grouping-under-a-new-name. No barrel replaces it — consumers import from owner homes. |
| `bootstrapAppRuntime` (`app-runtime/bootstrap.ts` grab-bag) | The Fabric-bootstrap-shaped shell. Split into per-owner registration invoked from the composition root (`server-factory.ts`). |
| `./app-runtime` export in `packages/server/package.json` | The "app-runtime is a layer" package seam. Removed. Same-package server tests repoint to owner-module deep imports; the cross-package `packages/eval` consumer repoints to the new curated `@hyperidle/server/routines` public export (§3). |
| The `app-runtime/` directory itself | The directory-as-layer. Empty after moves → removed. |
| `app-runtime/__tests__/runtime-contracts.test.ts` | Tests the shell contract; relocate assertions to the owner homes or delete if redundant. |
| Residual execution-internal deps in core routes | See §3 — dead `AdapterPool`/`SandboxAdapter`/`McpBridgeRegistry` type threading in routes that post-AU9 only record intent → delete the import + the unused dep. Genuinely-still-direct routes → move the direct call to an agent-owned module. Classified per-route at build. |

**Counts:** ~35 module-groups → **Core app**; ~13 → **Agent layer**; ~3 → **Editable config** (1 split); 5+ ownership-shell artifacts → **Delete**. No responsibility is left unassigned — the validation scenario "a former transitional service has no final owner → delete or reject" is satisfied by this table being exhaustive over `app-runtime/`.

---

## 3. Core routes / domain services must stop importing execution internals

AC-2 forbids core routes and core domain services from importing harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution, or agent lifecycle internals. Current concrete sites (production only):

- **Value imports from the shell** (behavior reach): `routes/agent-profile.ts` (`computeApprovalRate`), `routes/routines-routes.ts` (`builtin-routines`, `routine-scheduler`), `routes/teams-routes.ts` (`provisionTeamRoutines`, `enqueueNotification`), `routes/artifacts.ts`, `routes/dispatch-queue-routes.ts`, `routes/git-export-routes.ts`, `routes/notifications-routes.ts`, `routes/status.ts`. These repoint to the new **core** homes (notifications, approval-rate-as-core, routine records) — most are core→core after the move and are fine; only genuinely agent-layer reach (e.g. a route importing `task-dispatcher`/provisioning) is a violation.
- **`import type { AdapterPool }` / `SandboxAdapter` / `McpBridgeRegistry`** in `routes/{agent-profile,agents,assistant,connections,harnesses,routines-routes,sessions-routes,teams-routes,users,worker-ws,workers}.ts` and `tasks.ts` (`SessionContext` from `session-lifecycle`). **Refinement classification of each:**
  - *Dead threading* (route receives the pool only to forward it into a deps object that, post-AU9, is unused because the route now records intent) → **delete** the import and the dead parameter.
  - *Composition-root wiring* (route is only assembling a deps object that the composition root already owns) → move that assembly to `server-factory.ts` (the composition root legitimately knows execution internals; a *route* should not).
  - *Genuinely-still-direct execution* (e.g. explicit synchronous session-start in `sessions-routes.ts`, remote harness in `worker-ws.ts`) → move the direct call behind an agent-owned module; the route records intent / calls the agent-run boundary read model.
  - **`harnesses.ts` / `mcp-route.ts` / `connections.ts`** read harness/MCP **descriptors/capabilities** (Settings/config surfaces), not execution. Distinguish descriptor-read (allowed — config) from adapter-execution (forbidden). The guard must encode this distinction so it does not false-positive on config surfaces.
  - **Type-only imports** (`import type { ... }`) of the now-agent-owned `contracts.ts` are **allowed** — a compile-time contract dependency, not an execution dependency. The guard treats `import type`/type-only specifiers as an allowed edge so `agent-defaults/resolvers.ts` (and any core consumer of agent-contract *types*) does not trip AC-2 after `contracts.ts` moves.
- **`agent-defaults/resolvers.ts`** imports `app-runtime/roster` + `app-runtime/services/agent-selection` (value) + `app-runtime/contracts` (type-only) (AU10-confirmed AU11 edge) → repoint to the agent-owned homes after the move; the resolver stays a config resolver reading agent-selection as an agent-layer contract, not a runtime registry.

**`services/routine-scheduler.ts` — DECIDED: option (b) (behavior-preserving).** The scheduler imports `selectAgentByAppDefaults` + `isAgentAtWipLimit` (agent-selection) directly and calls them at **fire-time** (`routine-scheduler.ts:379-386`). It is Core Routine (cron/due-eval + `recordAgentWorkIntent`), but that agent-selection call is an agent-layer decision executed in core. The two options were: (a) push selection into the agent-layer intent resolver (`services/agent-work-intent-worker.ts`) so the scheduler only records intent and the agent layer selects on drain; or (b) keep the fire-time call and repoint the import to agent-selection's agent-owned home. **AU11 takes (b).** Verified in source: the resolver's `routine_run` branch does **NOT** select an agent today (~lines 198-227) — it uses `routine.ownerAgentId` directly as `defaultAgentId`; WIP-limit + delegate selection runs only at fire-time in the scheduler. Option (a) would therefore **relocate fire-time selection into drain-time** — a real behavior change (WIP state can differ between fire and drain → a different agent chosen), requiring new worker-branch logic and test changes, which **violates §5's import-path-only invariant**. Option (b) is a pure import-path move (the call is byte-identical) and is the only option that preserves behavior. The residual core→agent-selection dependency direction is recorded as a `@lore` note + AU8 boundary item; a deeper worker-side rearchitecture (moving "which agent" fully to drain-time) is **out of scope for AU11** (future AU8-class work). This edge is not an AC-2 violation — `agent-selection` is a "which agent" contract, not a harness adapter / MCP bridge / provisioning / context-assembly / tool-execution / agent-lifecycle internal.

**Cross-package export (`packages/eval`) — DECIDED.** `packages/db` is **not** a consumer of `@hyperidle/server/app-runtime` — its `factory-bootstrap.ts:14-15` and `seed-fixtures.ts:29-30` references are **comments** (they warn against db importing server); db needs only a comment refresh. The genuine cross-package consumers are **4 `packages/eval` scenarios** importing `checkAndFireRoutine` (`scenarios/{delegation,routine-sessions,skill-autonomy}.ts`), `provisionTeamRoutines` + `runBuiltinRoutine` (`scenarios/builtin-routines.ts`, static + dynamic). eval consumes `@hyperidle/server` only via declared package exports and cannot deep-import `packages/server/src/...`. So the `./app-runtime` deletion needs a **replacement public export**: add `@hyperidle/server/routines` → `./src/routines.ts`, a thin curated file re-exporting exactly those three routine functions from their new owner homes. Architecture §3 + task 9 own the concrete wiring.

---

## 4. Acceptance criteria → verification method

| # | AC | Verification |
|---|---|---|
| 1 | No transitional app-runtime/Fabric-shaped ownership boundary in boot, wiring, or imports | `au11-runtime-ownership-guard.ts` (lint): `app-runtime/` path absent; no `bootstrapAppRuntime`; no `./app-runtime` export; `--fixtures` proves it catches a reintroduced grouping. The curated `@hyperidle/server/routines` (`src/routines.ts`) public export is allowlisted (not an app-runtime alias). `npm run check` (moved files compile). |
| 2 | Core routes/domain services do not import harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution, or agent lifecycle internals | Guard: static import-reachability from the core route/domain file set to the forbidden execution-internal module set. Separates core vs agent by a **pinned agent-owned allowlist constant** (both owners share `server/src/services/`); encodes descriptor-read vs adapter-execution **and** allows type-only `contracts.ts` imports. 0 findings on real tree; `--fixtures` catches a direct + transitive value leak. |
| 3 | Agent-layer code does not own Work/Conversation/Knowledge/Users/Settings/Routine/notification CRUD except via core contracts | Guard + review audit: agent-owned files do not write core domain tables directly (they call core services). Existing integration tests over each domain stay green. |
| 4 | Former transitional services moved to should-graph owner or deleted; none remain as pass-through wrappers | Owner table §2 exhaustive; review confirms each move lands in the target home and no file re-exports the old shell path. Guard fails if a re-export alias appears at the old `app-runtime` path. |
| 5 | Existing Work/Conversation/Knowledge/Settings/Routine/notification/session/tool/MCP/harness behavior observable | `npm run test` + `npm run test:integration:service` all green **with import-path-only edits** (no assertion rewrites). One live builtin-harness run re-verifies the assistant/dispatch path end-to-end (per AU9 precedent). |
| 6 | Review includes a should-graph audit proving every moved/deleted responsibility lands in the target owner | Phase-4 reviewer independently re-derives the owner table against `as-should-dependency-graph.md` §Boundary Checks + Removed Components, re-runs the guard, and fails the package if any forbidden edge remains. |

---

## 5. Behavior-preservation contract (proof-by-existing-tests)

The ~70 files importing `@hyperidle/server/app-runtime` and the ~40 importing `app-runtime/*` relatively (mostly tests) are the behavior net. AU11's move must be **import-path-only** at every one of those call sites — no test assertion may change to accommodate a move. If a test needs an assertion change to pass, that signals a behavior change and must be rejected (memory: "tests must not drive behavior"). This is the mechanical proof that AU11 preserved behavior: the same tests, repointed, stay green.

This invariant is load-bearing for the `routine-scheduler` decision (§3): option (a) was rejected precisely because moving fire-time selection to drain-time would force worker-branch + test changes — a behavior change. Option (b) keeps the fire-time call byte-identical (import-path-only), honoring this contract.

Durable schema/table names containing `strategy`/`fabric` (historical records) are **not** renamed — compatibility data, per AU7's completion check. AU11 touches code ownership, not durable vocabulary.

---

## 6. Self-critique

- **Over-engineering risk:** creating new `knowledge/`/`notifications/` directories is a large churn. Mitigation: churn is import-path mechanical, gated by existing tests; owner homes match the should-graph's named services, so this is the *minimum* move that dissolves the shell — leaving files in `app-runtime/` with only the barrel removed would still "group former Fabric services under a name" (fails AC-4).
- **Scope-creep risk:** the route `AdapterPool`-threading cleanup could balloon into re-architecting provisioning. Mitigation: §3 fixes the classification rule (dead→delete, composition→server-factory, direct→agent module) but does not change provisioning itself; anything requiring a provisioning redesign is out of scope and deferred.
- **Rebase risk:** 65 moves + ~110 importer edits + package export removal is high-conflict against a moving main. Mitigation: architecture sequences moves by owner bucket in separate commits, each leaving `npm run check` + affected tests green, so a mid-flight rebase re-lands cleanly.
- **Ambiguous owners — now resolved:** `routine-scheduler` (core Routine, fire-time selection kept — option b, §3), `git-export`, `lifecycle-propagation`, `practice-meeting` all resolved with rationale. The previously-open `routine-scheduler` selection question is decided in this doc (option b), not deferred to the builder — a behavioral relocation (option a) is explicitly rejected as a §5 violation.
- **Cross-package export correction:** the earlier assumption that `packages/db` imports the `./app-runtime` export was wrong (those references are comments). The real cross-package consumer is `packages/eval` (routine functions); the replacement seam is the new `@hyperidle/server/routines` export (§3). This is decided in-plan, not discovered at build.

**Refine self-score (post-revision): 8.5/10.** Owner table is exhaustive and source-grounded; the two round-1 warnings (routine-scheduler decision, eval cross-package export) are now closed with source-verified decisions. Remaining soft spot: per-route `AdapterPool` classification needs per-file confirmation at build (rule stated, sites enumerated).
