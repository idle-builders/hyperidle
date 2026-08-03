# AU26 — Architecture

Tier: **production**. Spec of record: `plan.md` (amended). Binding requirement: `requirements.md`
(founder-approved, `progress.json → approvals.requirements`). Design phase: **skipped** — backend/infra,
zero required frontend behaviour change. Feasibility: `feasibility.md` (P1–P6, all GO).

Every `file:line` below was re-traced with `rg -a` on branch `pipeline/AU26` (base `origin/main` @ `75d85687`).

> **Size, stated honestly up front.** This is **not one PR.** It is **13 independently shippable PRs**
> across 7 waves, ~3.5–5 weeks. See §12. Anyone who tries to land it as one change will produce an
> unreviewable diff touching ~250 files, three packages' public surfaces, a schema migration, and both
> guards. The wave boundaries below are chosen so each PR is green on `main` by itself.

---

## 1. Required reading

- `.pipeline/work/AU26/plan.md` — spec of record, as amended.
- `.pipeline/work/AU26/requirements.md` — §2 the rule, §5 Job 2, §9 the seven items this doc closes.
- `.pipeline/work/AU26/service-verdicts/{group1,group2,group3}.md` + `git-export-rechallenge.md` — pass A.
- `.pipeline/work/AU21/architecture.md` — **Decision J** (J0–J5, J7 locked; **J6 superseded**, see §3),
  **K1** (the bake this WP deletes), **L2/L4/L(14e)** (the guard now has zero exceptions; keep it there).
- `docs/architecture/runtime-simplification.md` — Applications / Layers / Services; Mechanisms 1–3.
- `docs/architecture/connection-model.md`, `credential-model.md` — held vs inherited; why `server_credentials` stays.
- `docs/architecture/run-unit-model.md` — what "workspace" already means.
- `.claude/rules/typescript.md`, `.claude/rules/testing.md` — binding.

---

## 2. Plan reconciliation (spec ⇆ reality)

Named symbols verified. Only disagreements and newly-found obligations are listed.

| Spec claim | Reality at HEAD | How the plan handles it |
|---|---|---|
| `app.ts:42` imports the orchestration routes module | **Confirmed** — `import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions-routes.js"`, mounted `:556-561` | Increment **B1a** deletes the import; the AC is a lint/import guard, not a test |
| `UNOWNED_SHARED_TABLES` exempts `sessions` | **Confirmed and worse** — the Set is `{sessions, propagationLog, taskDispatchAttempts, userSkills}` — **four** tables, not one (`scripts/table-ownership-guard.ts:349-354`) | **D1 + D2** assign all four owners and delete the Set |
| the guard enforces the ACL | **Partially** — `nestedServiceRoots()` (`:421-436`) scans only `packages/<layer>/<service>/`. **All Layer code is invisible**, including 9 more `sessions` readers | **D2** extends the scan to Layer `src/` roots. Feasibility P6 proves the cost is zero beyond the four owners |
| 5 non-test `createServer(` callers | **Confirmed** — `remote-server/src/index.ts:36`, `desktop/src/boot-server.ts:30`, `web/scripts/{ah1:62,ah5:140,ah6:250}-test-server.ts` | **B1b** re-points all five to one relocated `createServer` |
| 8 test files call `createServer(` | **Confirmed** — incl. `packages/desktop/__tests__/boot-server.test.ts` and `agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts` (**outside `core-api`** — the spec's count did not say so) | **B1b** re-points; the `AN2` one is the connections live-proof, so E3 must keep it green |
| `test-utils.ts:13` / `test-fixtures.ts:49` fan out | **Confirmed and larger than stated** — **240** test files import a fixture module | **B1b**: the two fixtures become the *only* other composition site; 240 files change zero lines |
| `packages/eval` unaffected if subpaths survive | **Confirmed** — eval imports `@hyperidle/core-api/session` (`provision-harness.ts:14`) and `/routines` (`scenarios/{builtin-routines:16,delegation:32,routine-sessions:13,skill-autonomy:11}.ts`). Neither is a route module | **B1a/B1b 
 keep both subpath exports verbatim.** Stated as an AC |
| `run-orchestration` already writes a route handler | **Confirmed** — declares `hono` (`package.json:18`) and `app.get("/ws/worker", …)` at `worker-ingress.ts:259`, on an app core-api hands it | **B1a** inverts it: orchestration owns the app, the Application hands it the WS upgrader |
| `plugin-configuration.ts:727` is a second connections consumer | **Confirmed**, port declared `:65` | **E4** re-points it (display-only projection — group3.md) |
| `RegistryFilesystemMounter` at `server-factory.ts:1006` | **Confirmed**; only non-test `.mount()`/`.captureBack()` are `run-orchestration/src/filesystem-provisioning.ts:78`, `provisioner.ts:527` | **F1** |
| `users` run-config columns | **Confirmed** at `schema.ts` `kind:50 systemPromptPath:53 skills:60 status:61 maxConcurrentSessions:62 systemPrompt:74 harnessType:76 modelTierPreference:78 modelId:84 modelProvider:92 agentCategory:98`; `teams` twin at `:42-44` | **G1** |
| `sessions.taskId` needs an existence check | **False** — FK to `tasks.id`, `onDelete:"restrict"` (`schema.ts:229`). The check is provably redundant | **C3** deletes it (feasibility P4) |

### Blast-radius surfaces the spec undercounted

1. **The `sessions` read surface is 13 non-test files, not 4.** The verdicts named the four Service-package
   importers. There are **nine more in core-api Layer code**: `routes/{agent-profile,agents,recipients,
   sessions-routes,status,tasks,teams-routes,threads,users}.ts`. They are invisible to the guard today.
   Absorbed by **D1**.
2. **The two emit-time bakes are symmetric and each has ~14 sites.** `resolveInjectedConnectionsForAgent`
   and `resolveInjectedFilesystemsForAgent` are threaded through the same six emit resolvers
   (`work/task-run-resolver.ts`, `work/session-start-resolver.ts`, `conversation/assistant-turn-resolver.ts`,
   `review/proposed-call-workflow.ts`, `knowledge/knowledge-action-resolver.ts`, `routine/routine-service.ts`)
   plus the same wiring files (`services/{task-run-resolver,routine-scheduler}-bindings.ts`,
   `services/{agent-run-admission-reactions,assistant-turn-coherence-trigger}.ts`,
   `routes/{sessions-routes,threads,knowledge}.ts`, `review/session-review-creator.ts`). Deleting one is a
   template for deleting the other. **E3** and **F2**.
3. **`filesystem-registry.ts:42-44` is a cross-owned join.** `filesystemInjections ⋈ filesystems`. Once
   injections move, the zero-exceptions ruling forbids it. **F2** decomposes it.
4. **The middleware stack blocks Job 2.** `agent-orchestration-sessions-routes.ts:9-12` states it outright:
   giving orchestration its own app "would force `agent-orchestration` to import `@hyperidle/core-api` for
   the auth/boundary/rate-limit stack." Absorbed by **A1** + the Application-owned stack (§4).
5. **`git-export` is two things in one package** — a dead 1,205-line exporter and a live 509-line git runner
   whose two of three consumers are `filesystems`'. **A2** + **C1**.
6. **`@hyperidle/core-api` depends on four `agent-orchestration` Services** (`dispatch`, `run-orchestration`,
   `session-requests`, `tool-handlers`) and on `harness-registry`. Those dependencies move to the
   orchestration Layer package in **B1a/B1b**; core-api's `package.json` sheds them.

---

## 3. Decisions

### D-A · The gate rule — where a route lands (closes requirements §9.5, third leg of J6's supersession)

J6 kept connections' routes in core-api because "core-api is the layer with the HTTP surface." That is a
locality argument, and Job 2 removes the fact it rested on. But the naive replacement — *"anything
agent-shaped goes on orchestration-api"* — breaks on the first real case: `POST /api/filesystems/:id/injections`
writes an agent-run-config record, but it is **gated on two core-domain facts** (`filesystems` exists,
`agent.teamId → teamMembers.teamId === filesystem.teamId` — `routes/filesystems.ts:337-364`). Orchestration
may not read either. So the rule has to be sharper than "agent-shaped."

**The three rules `core-api`'s app now lives by (written down, per requirements §9.5):**

1. **`core-api` never imports an `agent-orchestration` route module.** This is AC #5's observable proof.
2. **A route lands on the layer that owns its *gate*.** The gate is what the handler must *read* to decide
   whether the mutation is legal. A route whose gate is core-domain stays on `createCoreApiApp()` even if its
   record lives on the other side.
3. **A route persists through the layer that owns its *record*** — by a downward call
   (`core-api → agent-orchestration`, the permitted direction, already used everywhere:
   `app.ts:28` imports `enqueueWorkIntent` from `@hyperidle/session-requests`). Never upward, never a Port
   method (`AgentOrchestrationPort` stays strictly read-only).

Applied:

| Surface | Gate | Record | Lands on |
|---|---|---|---|
| session history / activity / abort / `GET /tasks/:id/sessions` | orchestration's own | orchestration | **orchestration-api** |
| connections read + POST/DELETE/validate | none core-side (per-user, self-contained; the inherited half reads the harness descriptor — a *downward* agent-execution edge orchestration owns) | orchestration | **orchestration-api** (J6 superseded, as founder-directed) |
| filesystem injection write/eject | **core** (`filesystems` record + `users.teamId`/`teamMembers`) | orchestration | **core-api**, delegating the persist down |
| `GET /api/filesystems?agentUserId=` | core (renders core `filesystems` rows) | both | **core-api**, decomposed (§D-F) |
| agent run-config write (`PATCH /api/agents/:id`, assistant PATCH) | **core** (agent exists, is `kind:"ai"`, team) | orchestration | **core-api**, delegating the persist down |

**Consequence that changes a settled sub-claim:** `group3.md`'s Item-C cost line 3 said the run-config UI
"needs a legal host… That makes Item C **ordered after** the §5 app skeleton." Under the gate rule it does
not — the config write stays core-hosted. **G1 has no dependency on B1.** (The *verdict* — the columns move —
is unchanged.)

*Rejected alternative:* inject a `FilesystemInjectionValidator` port into an orchestration-hosted route,
wired by the Application to core's Services. Rejected: it is an `agent-orchestration → core-api` read by any
honest reading, the anti-regrowth guard would fire on the composition edge, and AU21's rule is absolute
("not through colocated DI, not at all").

### D-B · Job 2's shape — two apps, one instance, Application-owned middleware

```
Application (remote-server / desktop / a test fixture)
  ├── db, EventBus, adapterPool, workspaceAdapter, wsHub, mcpBridgeRegistry
  ├── root = new Hono();  root.route("/", health)
  ├── api  = new Hono();  api.use(cors, rateLimit, bodyLimit, auth, failClosed); api.onError(errorHandler)
  │     ├── pre-auth hooks: user WS (core), worker WS (orchestration), MCP bridge (orchestration)
  │     ├── api.route("/", coreApiApp)          ← bootCoreApi().app
  │     └── api.route("/", orchestrationApp)    ← bootAgentOrchestration().app
  ├── root.route("/api", api)
  ├── root.notFound(path.startsWith("/api") ? JSON ApiErrorResponse : text)   ← feasibility P1 trap
  └── serve({ fetch, port, websocket: { server: wss } })
```

Feasibility P1 proves parent middleware, context vars, and `onError` all apply to both mounted sub-apps, and
that only the **root** `notFound` fires.

**The middleware stack is Application-applied, not Layer-owned.** It is exported from `@hyperidle/core-api`
(`createAuthMiddleware` legitimately reads `@hyperidle/users`, a core-api Service), and the **Application**
chooses to put orchestration's routes behind it — "only an Application may choose this"
(`runtime-simplification.md:159-164`). Orchestration never imports it.

**What orchestration's route files *do* need** — `HyperIdleEnv` (the auth context type) and
`requireBoundary`/`failClosedAssertion` (the AF11 declaration) — moves to a new node-safe subpath
`@hyperidle/shared/http`, so an orchestration route can declare a boundary without importing core-api
(Increment A1).

*Rejected alternative:* move the whole stack (auth/cors/rate-limit/body-limit/error-handler, ~880 lines) to
`shared` with `findUser`/`validateBearerToken` injected. Rejected as over-building: it buys nothing the
Application-applies model doesn't, and it drags identity semantics into a leaf package.

### D-C · Where the composition root lives (closes requirements §5's open call)

`packages/core-api/src/server-factory.ts`'s `createServer` (388 lines, `:897-1284`) is the real Application:
it opens the DB, builds the `EventBus`, wires every reactor for **both** layers, builds `WsConnectionHub` and
the MCP bridge, calls `createApp()`, and `serve()`s. It must leave `packages/core-api` — otherwise a core-api
file mounts orchestration's app, which is the same smell one level up.

**Decision: `createServer` moves to `packages/remote-server/src/create-server.ts`.** `remote-server` becomes
*the server Application*; `src/index.ts` shrinks to the headless process entry (env validation, port, signals).
`desktop` (the Electron shell Application), the three `packages/web/scripts/*-test-server.ts` harnesses, the 8
`createServer(` test files, and `core-api`'s two shipped fixtures re-point their import — a one-line change
each, 13 sites.

Weighed against the two alternatives requirements §5 named:

- **Each Application owns a duplicated bootstrap.** Rejected on arithmetic: there are **five** non-test
  composition sites plus two shipped test fixtures, not two. ~90 lines × 7 = ~630 lines of near-identical
  wiring that drifts the first time a reactor is added.
- **A third neutral composition package.** Forbidden outright (requirements §7 out #9).

The residual cost, stated: `desktop` imports `@hyperidle/remote-server/create-server`, i.e. one Application
importing another's wiring. That is exactly what `desktop` does **today** with
`@hyperidle/core-api/server-factory` (`boot-server.ts:18`) — the change re-points it to an honest home rather
than introducing a new relationship. **This is the one genuinely arguable call in this document; flagged for
the reviewer.** If it is rejected, the fallback is the duplicated bootstrap with the 630-line cost taken
knowingly — do not resolve it by inventing a package.

### D-D · `observability` dissolves (requirements §9 item 4, half 1)

Verdict: **moves — dissolves.** No table, zero DB queries (all three `@hyperidle/db` imports are
`import type`; `createDbTraceIdResolver` literally does `void db;` at `dispatcher.ts:139-145`), four routes
with **zero** callers repo-wide, and `TraceIdResolver.seed()` has zero non-test callers — so in production
every `traceId` is the fallback and the resolver is dead machinery kept alive by its own tests.

**Where it goes, concretely:**

| Piece | Disposition |
|---|---|
| `ObservabilityEvent` union | **already** in `@hyperidle/shared` (`src/observability/events.ts`); `types.ts:1` imports it back — no move |
| `dispatcher.ts`'s DomainEvent→ObservabilityEvent translator + the enqueue/flush ring | → `@hyperidle/shared/src/observability/` beside `event-bus.ts`. It is a pure bus-adjacent transform; precedent `summarizeToolArgs` → `shared/src/redact.ts:101` |
| `console-adapter.ts` + the `ObservabilityAdapter` type | → same place |
| `config.ts` (`readObservabilityConfig`/`updateObservabilityConfig`) | → `@hyperidle/settings`. It is a two-line pass-through over `settings`' own `server_config.observability` section (`settings/src/server-config.ts:48-55`) |
| `runtime.ts`'s `startObservability` | → the Application's `bootCoreApi` wiring (it is composition: adapter + subscription + disposer) |
| `TraceIdResolver` + `createDbTraceIdResolver` + `seed()` | **DELETE.** Zero non-test callers; the `HyperIdleDb` handle exists only for it |
| the 4 routes + `routes/observability-routes.ts` + the `/observability` mount (`app.ts:604-613`) | **DELETE.** Zero requesters repo-wide |
| `packages/core-api/observability/` | **DELETE the package** |

**Not `agent-orchestration`:** three of the six event kinds it translates are pure core-domain
(`task_state_changed` `:364`, `bet_state_changed` `:385`, `knowledge_updated` `:401`); relocating it would make
orchestration subscribe to core-domain events — the inverse of AU21's boundary.

**One rule survives the deletion:** `.claude/rules/typescript.md` says "No `console.log` in production code.
Use the observability adapter." The console adapter still exists (in `shared`); the rule is unaffected.

### D-E · `realtime` dissolves (requirements §9 item 4, half 2 + §4 Item D)

Verdict: **moves — dissolves into `packages/core-api/src/`, as a transport primitive, not a Service.**
Zero tables owned; zero event routing since AU21 L4; its own header calls it "a dumb pub/sub socket
transport" (`ws-connection-hub.ts:7`); exactly two real importers (`routes/ws.ts:1-2`,
`server-factory.ts:65`) and its other three callers each declare a local `{broadcast(topic,data):void}`
interface *specifically to avoid depending on it*.

It **cannot** move to orchestration: three of its four production topics are core-domain
(`thread:<id>`, `conversations` from `routes/threads.ts`; `work` from `services/work-state-push-gateway.ts`).

**Concretely:** `ws-connection-hub.ts` + `ports.ts` → `packages/core-api/src/ws-connection-hub.ts` +
`ws-subscribe-authorizer.ts`; delete `packages/core-api/realtime/`. The three local `{broadcast}` structural
interfaces stay exactly as they are — they are already the right shape.

**Who owns the surviving connection-registry behaviour:** the `core-api` **Layer** (not a Service, not
`shared`). It is HTTP/WS transport composed by the Layer, driven from the outside by whoever pushes.
Orchestration receives `{ broadcast }` as an injected port from the Application — the same one-method
structural interface `services/session-activity-gateway.ts:37` already declares — so there is exactly **one**
WS listener and **one** topic space, and `packages/web/src/hooks/useSessionActivity.ts`'s WS URL does not
change.

**What the `session:` topic's departure removes** (all verified in group2.md, re-confirmed):
`realtime`'s only table import (`sessions`), `canSubscribeToTaskFreeSession` (`:167-184`), and three of its
four DI edges — `deps.users` (`:162`) and `deps.org` (`:164`) are reachable only through `senderInTeam`
(`:161`), called only from `canSubscribeToTaskFreeSession` (`:181`); `deps.work` (`:211`) is used only in the
`session:` branch. Only `deps.conversation` survives.

**But the `session:` topic itself does not disappear** — core-ui still subscribes to it on the one socket.
So the subscribe authorizer still has to answer "does this session exist, and may this principal watch it."
That resolves as a decomposition, not a carve-out:

- orchestration exports `getSessionSubscribeContext(db, sessionId) → { taskId, sourceKind, sourceCorrelationJson } | null`
  from its own Service (its own table, in-layer);
- the core-api authorizer takes it as an injected reader (downward, in-process — no HTTP hop) and applies its
  **own** core-domain checks (thread participant via `conversation`; team via `users`+`org`);
- the `deps.work.getTaskById` existence check is **deleted** — feasibility P4 proves the FK makes it
  redundant. `taskId !== null → true` (host-scope), unchanged behaviour.

`deps.users`/`deps.org` therefore survive after all, for the task-free branch only. Recorded as a correction
to group2.md's "three of four DI edges leave" — **two** leave (`work` by FK-redundancy, and nothing else);
`users`/`org` stay because the task-free authorization is genuinely core's.

### D-F · `git-export` splits (founder-directed)

**The runner survives, the exporter deletes.** Both halves execute in AU26 (`git-export-rechallenge.md` §5).

- `git-export-runner.ts` (`createGitRunner`, `GitRunner`, `GitConfigInjection`) → **`@hyperidle/shared/git`**,
  a new node-only subpath export, never in the main barrel — the shipped `@hyperidle/shared/net` idiom
  (feasibility P2). Both the relocated mount engine (`agent-orchestration`) and the reachability/branch probe
  (`core-api`) import it from `shared`. Zero package cycle, zero cross-layer edge, and
  `filesystems/src/ports.ts:6-32` already declares the interface structurally so the re-point is one factory
  argument.
- Everything else deletes: `git-export.ts` (570), `git-export-config.ts` (442), `ports.ts` (99),
  `testing.ts` (37), `index.ts` (57), `src/routes/git-export-routes.ts`, the `app.ts:573` mount, the
  `server-factory.ts:553-559` handler registration, `settings`' `GitExportSchema` section
  (`server-config.ts:57-70`), and ~2,144 lines of tests. `packages/core-api/git-export/` is removed.
- **Doc consequence, raised as a finding not a blocker:** `docs/requirements/system-requirements.md:17`
  (S-2.2), `docs/knowledge-architecture/the-canonical-store.md:67` and
  `docs/knowledge-architecture/facilitators.md:79-92` claim a git-backed knowledge store and cite paths that
  have not existed since AU19. `/write-docs` reconciles them to "not implemented." The product question
  *"should knowledge live in git?"* belongs to a future `knowledge` WP and is explicitly **not** AU26's.

### D-G · `sessions` ownership (requirements §9 item 1) — and the other three unowned tables

`sessions` → **`packages/agent-orchestration/run-orchestration`**. It inserts (`runtime.ts:67`,
`provisioner.ts:965`) and transitions (`transition-run.ts:371`, `start-runtime.ts:37`,
`runtime-reapers.ts:193`); post-AU21 it is the de-facto owner and the `@lore` at
`table-ownership-guard.ts:300` says to revisit when a real owner exists.

The other three are not optional — the ruling is zero exceptions, and the Set has four rows:

| Table | Owner | Foreign toucher → how it is closed |
|---|---|---|
| `sessions` | `packages/agent-orchestration/run-orchestration` | §D-H (13 files) |
| `propagationLog` | `packages/core-api/policy` | `work/bet-kill-cascade.ts` → injected `PropagationLogWriter` port (Mechanism C, the AU12/13 precedent); `server-factory.ts`'s reaper → policy's exported `reapPropagationLog` |
| `taskDispatchAttempts` | `packages/core-api/work` | `policy/handoff-protocol.ts` → its existing `deps.work.*` port bag gains one method |
| `userSkills` | `packages/core-api/users` | `settings/plugin-configuration.ts` → injected reader port; `routes/users.ts` + `services/routine-scheduler-bindings.ts` (Layer) → call `users`' exported functions |

**And the guard's scan root extends to Layer `src/` dirs.** Without that, deleting `UNOWNED_SHARED_TABLES`
is theatre: nine of `sessions`' readers are Layer files the guard never visits. Feasibility P6 proves the
extension is free — every Layer-level table touch outside `packages/eval` is on one of these four tables.
`packages/eval` is excluded **by package name with a stated reason** (a fixture-seeding eval harness, the same
class as `__tests__` which the guard already skips) — never by re-introducing a table-level carve-out.

`UNOWNED_SHARED_TABLES` and `assertDisjointOwnership` are **deleted** (the invariant they guarded stops
existing when one of the two sets does).

### D-H · The four `sessions` touches, plus the nine the verdicts didn't count

**The read door already exists.** `AgentOrchestrationPort` (`packages/api-contract/src/agent-orchestration-port.ts`)
is agent-orchestration's read-only door, shipped, with an in-process transport and a tested fidelity
obligation. It grows one read family; it gains **no** mutation (§D-A).

```ts
// packages/api-contract/src/agent-orchestration-port.ts — additions, all readonly
export interface AgentOrchestrationSessionRow {
  readonly id: string;
  readonly agentId: string;
  readonly taskId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly state: string;
  readonly outcome: string | null;
}
export interface AgentOrchestrationSessionsPort {
  listSessionHistoryBySource(sourceKind: string, sourceId: string): Promise<ReadonlyArray<AgentOrchestrationSessionHistoryEntry>>;
  getRecentActivity(sessionId: string): Promise<ReadonlyArray<AgentOrchestrationSessionActivityEntry>>;
  // AU26 additions
  listActive(): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  listByAgentIds(agentIds: readonly string[]): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  listByTaskId(taskId: string): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  latestOutcomeByTaskIds(taskIds: readonly string[]): Promise<Readonly<Record<string, string | null>>>;
}
```

Backed by GET routes on **orchestration's own app**, not core-api's.

| # | Site | Verdict | Design |
|---|---|---|---|
| 1 | `policy/handoff-protocol.ts:120-124` — `tx.update(sessions).set({state:"done", endedAt})` inside policy's transaction | **the write does not belong in core** | The handoff already emits `session_handoff_completed` (`:356`), which `run-orchestration/start-runtime.ts:321` **already consumes**. The channel exists: policy stops writing `sessions`; the orchestration subscriber ends the run. Everything else in the transaction (task state `:135-142`, review thread `:157-166`, review item `:168-176`) is core's and stays in-tx. **Consequence stated honestly:** ending the session becomes eventually-consistent w.r.t. the handoff commit instead of same-transaction. That is correct under AU21 — the run record is orchestration's, and a handoff is a *request* to stop, not a core write. `routes/tasks.ts:296-326`'s hand-built `SessionContext` (whose `ingestion` is a documented no-op `:317-321` and whose `traceId` is hard-coded `""` `:325`) loses its direct `sessions` read: it reads through the port |
| 2 | `work/bet-kill-cascade.ts:58-70` — selects active sessions per task, writes `state:"stopped"`, CAS-guarded, deliberately suppressing `session_ended` (`@lore` `:24`) | **need is core's, mechanism is not** | `work` calls a new orchestration operation `requestRunStopForTasks(db, taskIds, {reason:"bet_killed"})` — a downward call (§D-A rule 3), in-layer for orchestration, which owns the table and keeps the CAS + the `session_ended` suppression decision **on its own side**. It returns the stopped session ids so `work` still writes its `propagation_log` hop (through policy's port, §D-G). This is core sending a request, which is exactly AU21 §12's blind-executor contract — not orchestration reacting to core state |
| 3 | `work/work-service.ts:384` — `latestSessionOutcome` correlated subquery, sole caller `routes/bets.ts:378`, rendered as a status chip in `TaskSheet.tsx:422`/`WorkBet.tsx:105` | **rendering is not a use** | Delete the `include:"latestSessionOutcome"` branch and the `sessions` import from `work-service.ts`. `routes/bets.ts` composes at the route: `work.list(db,"task",{betId})` + `agentOrchestrationPort.sessions.latestOutcomeByTaskIds(ids)`, merged into the same response field. Route-level composition of two owned queries is the sanctioned decompose pattern (`runtime-simplification.md:167-172`). **The response shape is byte-identical → zero `packages/web` change.** Delete `work-service.ts:30-38`'s "foreign-import ceiling" `@lore` — the standing ruling is zero exceptions |
| 4 | `review/session-review-creator.ts:50-54` | **redundant, not legitimate** | Delete the read. All three fields it uses are already on `SessionEndedEvent` (`shared/src/events.ts:145,146,153`), and the sibling handler at `:137-141` already reads them straight off the event. Removes `review`'s only `sessions` import. Free |
| 5 | `realtime/ws-connection-hub.ts:204` | **topic authorization, not a core read** | §D-E — decomposed into orchestration's `getSessionSubscribeContext` + core's own participant/team checks; the `work` existence check deleted as FK-redundant |
| 6–14 | the nine core-api **Layer** readers | **display decoration** | `routes/{status,users,recipients}.ts` → `port.sessions.listActive()`; `routes/{agent-profile,teams-routes,threads}.ts` → `listByAgentIds()`; `routes/agents.ts` → `listActive()` for the per-agent count and the delete/deactivate gate; `routes/tasks.ts`'s `GET /:id/sessions` **moves wholesale to orchestration-api** (gate and record both orchestration's — §D-A); `routes/sessions-routes.ts` **moves wholesale to orchestration-api**, including the abort write at `:260` (a mutation on orchestration's record — an orchestration route, never a Port method) |

### D-I · `harness-capability-read-model` (requirements §9 item 6)

**→ `@hyperidle/shared` (`src/harness/harness-capability-read-model.ts`), main barrel.** Its readers land on
both sides of the boundary after this WP (`routes/connections.ts:204` follows connections to orchestration;
`agent-profile.ts:299,311`, `teams-routes.ts:273,771`, `agents.ts:135,165`, `users.ts:196` stay core), and
Mechanism B forbids the orchestration side importing a core-api module. It is six stateless forwarders over
an injected handle — no table, no lifecycle, no domain: §2's dissolve-into-`shared` case, identical to what
L2 did to `resolveModel`.

`HarnessCapabilityReader` is **re-declared structurally** (not `Pick<AdapterPool, …>`) to avoid the cycle
requirements §9.6 flagged. Feasibility P3 shows every type in the signature already lives in `shared`, and
that the anti-drift guarantee survives — it moves from the `Pick` to the existing
`const reader: HarnessCapabilityReader = pool` assertion (`harness-capability-read-model.test.ts:145`),
which must be **kept and re-pointed, not deleted**.

```ts
// @hyperidle/shared — src/harness/harness-capability-read-model.ts
export interface HarnessCapabilityFilter {
  readonly type?: string;
  readonly kind?: "local" | "remote";
  readonly includeKnownMissing?: boolean;
}
export interface HarnessCapabilityReader {
  readonly size: number;
  list(): AdapterInfo[];
  describe(options?: HarnessCapabilityFilter): HarnessCapabilityDescriptor[];
  refresh(): Promise<void>;
}
```

**Ruling on the two synthesized values requirements §9.6 asked about — neither is core "doing something":**
`harnessRegistrationMeta`'s hard-coded `maxConcurrent: 1` (`:101`) and
`harnessCapabilitiesForType`'s `returnEnforcement ?? "none"` (`:85`) are **shape adaptation**, not domain
decisions: the first is a constant filling a field the descriptor does not carry, the second is a default for
an optional field. Nothing branches on either. Under §2 that is rendering, not a use — it does not make the
module core's, and it moves unchanged.

### D-J · Connections (Decision J, with J6 superseded)

Build J1–J5 and J7 as locked. J6 is replaced by §D-A: connections' routes — **reads and mutations** — go on
`createAgentOrchestrationApp()`; the planned `AgentOrchestrationPort.connections` read family is **not built**
(core-ui dials orchestration-api directly for connections, so there is nothing for a read door to serve);
J7's deletion of `CoreApiPort.connections` stands.

`settings`' second consumer (`plugin-configuration.ts:727`) is a **display-only boot-time projection**
(group3.md) with no operational dependence on connections data. Its `ServiceConnectionsReader` port
(declared `:65`, wired `server-factory.ts:985-987`) is **re-pointed** to the relocated Service via the
Application's downward wiring — the port stays, the implementation moves. It does not block "exactly one
Service importer of `serviceConnections`," because the port is a structural interface, not an import.

J8 stands, bounded: the reachability probe's `ServiceConnectionResolver` type-import
(`routes/filesystems.ts:6`) re-points to the relocated resolver, injected by the Application. J8's "reads via
the J6 door" clause dies with J6.

### D-K · Filesystems (§4 Item B, founder-approved split)

| Part | Verdict | Destination |
|---|---|---|
| mount engine — `mounter-registry.ts` (359 lines: `RegistryFilesystemMounter` + `LocalFolderAdapter:64`, `GitCloneAdapter:123`, `GitWorktreeAdapter:160`, `CloudNotBuiltAdapter:46`) + `scaffolding-paths.ts` (`SANDBOX_SCAFFOLDING_PATHS`, zero consumers outside the engine) | **moves** | new SQL-owning Service `packages/agent-orchestration/filesystem-mounting/` |
| `filesystemCaptures` — only non-test writer is the engine (`mounter-registry.ts:327`); `listCaptures` has **zero** non-test readers; FK `session_id → sessions` | **moves with the engine**, and `listCaptures` **deletes** (test-only reachable ⇒ dead surface) | same Service |
| `filesystemInjections` + `resolveInjectedFilesystemsForAgent` | **moves** | new SQL-owning Service `packages/agent-orchestration/agent-filesystems/`; the bake is deleted, orchestration reads its own table in-layer at provisioning |
| the record — `filesystem-registry.ts`'s `filesystems` half | **stays** | `packages/core-api/filesystems` — the one non-configuration core use is real: `routes/knowledge.ts:565` **gates** knowledge-item creation on the filesystem id (400 without a `scopeId`) and `:585` writes `knowledge_items.scopeId` |
| reachability probe — `filesystem-reachability.ts`, `inspect-local-path.ts` | **stays with the record** | writes `filesystems.state` (`routes/filesystems.ts:147` resolve → `:156` `updateFilesystemState`) |

**Two things the split forces, designed here rather than discovered at build time:**

1. **`filesystem-registry.ts:42-44`'s `filesystemInjections ⋈ filesystems` innerJoin decomposes.**
   `listFilesystems(db,{agentId})` splits into orchestration's `listInjectedFilesystemIdsForAgent(db, agentId)`
   and core's existing `listFilesystemsByIds`. `GET /api/filesystems?agentUserId=` stays core-hosted (§D-A —
   it renders core `filesystems` rows), composes the two at the route, and returns the **identical**
   `{ filesystems: [...] }` body. `packages/web/src/settings/SettingsAgents.tsx:194-198` changes **zero
   lines** (it only reads `.map(f => f.id)`).
2. **The injection write/eject routes stay core-hosted** (`routes/filesystems.ts:328` / `:408`) with their
   team-consistency gate intact (`:337-364`), delegating `saveInjection`/`deleteInjection` down to the
   orchestration Service. `SettingsAgents.tsx:282,290` changes zero lines.

`createGitRunner` — needed by the engine (now orchestration) **and** the probe (still core) — is why §D-F's
extraction to `@hyperidle/shared/git` is sequenced first.

### D-L · `users` / `teams` run-config columns (§4 Item C + group2.md's org finding)

**Moves (6 on `users`):** `maxConcurrentSessions:62`, `harnessType:76`, `modelTierPreference:78`,
`modelId:84`, `modelProvider:92`, `systemPrompt:74`.
**Stays:** `kind:50`, `status:61`, `agentCategory:98`, plus `id/name/role/teamId/email/avatarUrl/createdAt`.
**Dropped, not moved:** `systemPromptPath:53` and `skills:60` — zero production readers repo-wide (seed
fixtures only). `DROP COLUMN` in the same migration; do not carry them across.
**Moves (3 on `teams`, group2.md's unnamed finding):** `defaultHarnessType:42`, `defaultModelId:43`,
`defaultModelProvider:44` — written only at team creation (`teams-routes.ts:361-363`), read in exactly one
place (`org/src/team-default-harness.ts:42-47` ← `org/src/scaffold-agents.ts:168`) to stamp a newly scaffolded
**agent**. Same `PrimaryHarnessConfig` shape as the `users` six; costed together because
`scaffold-agents.ts:168` is the join point.

```sql
-- new, agent-orchestration-owned
CREATE TABLE agent_run_config (
  agent_user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  system_prompt text,
  harness_type text,
  model_tier_preference text,
  model_id text,
  model_provider text,
  max_concurrent_sessions integer NOT NULL DEFAULT 1
);
CREATE TABLE team_run_config_defaults (
  team_id text PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  default_harness_type text,
  default_model_id text,
  default_model_provider text
);
```
Definitions live in `packages/db/src/schema.ts` (unchanged rule); owner is the new
`packages/agent-orchestration/agent-run-config/` Service.

**The clean cut already exists in shipped code.** AU21 forced all six through one whitelist:
`requireRunnableAgent` (`users/src/runnable-agent.ts:34`) loads the row, then `bakeAgentRunnableConfig`
(`shared/src/agent-work-intent-recorder.ts:222`) picks
`{kind,status,role,teamId,systemPrompt,modelTierPreference,harnessType,modelProvider,maxConcurrentSessions}`
onto the emitted request. The relocation is exactly: **the six run-config fields leave the bake** (orchestration
reads its own table at drain — an in-layer read); `kind`/`status`/`role`/`teamId` stay on it, because core
genuinely uses them (`middleware/auth.ts:167`, `assistant-thread-pin-reaction.ts:45`, `recipients.ts:48-50`,
`runnable-agent.ts:36`, `policy-bindings.ts:73`). `users` survives intact as the single human+agent identity
record. `modelId`/`modelProvider` ride a parallel bake (`assistant-turn-resolver.ts:200-201` → `dispatch/src/service.ts:217`)
which is deleted the same way.

**Costed, not waved (requirements §4 Item C's explicit demand):**
1. **A real forward migration + backfill** of every existing agent row, plus `DROP COLUMN` × 8 on `users`
   (6 moved + 2 dead) and × 3 on `teams`. `plan.md`'s "no data migration" constraint is read as *this must not
   become one silently* — here it is explicit and unavoidable.
2. **Every reader re-pointed.** Config write: `routes/agents.ts:87-91,320-341,406,474-515`,
   `routes/assistant.ts:392-476`. Render: `routes/agent-profile.ts:299-341`,
   `routes/teams-routes.ts:274,361-362,498-509,771-778`, `routes/agents.ts:250-255`. Bake: the four resolvers
   + `bakeAgentRunnableConfig`'s shape. Consume: `provisioner.ts:839,842,857-859,866,890-892`,
   `concurrency.ts:57`, `dispatch/src/service.ts:217,253`. Seed: `db/src/factory-bootstrap.ts`,
   `db/src/demo-fixture.ts`, `org/src/scaffold-agents.ts:183`, `eval/src/seeding.ts`. Projection:
   `settings/src/plugin-configuration.ts:645-661`.
3. **The config write route stays core-hosted** and delegates the persist down (§D-A) — so **no dependency on
   the Job 2 skeleton**, and `Settings → Agents` needs no base-URL change at all.
4. `validateAgentConfig` (`routes/agents.ts:118`) validates against the `AdapterPool` + `MODEL_CATALOG` with no
   core dependency — it **moves with the columns**.
5. `agentCategory` and the `users`↔`teamMembers` FK are untouched.

### D-M · The 19 `services/` wiring units (requirements §9 items 2 + 3)

Per §2's wiring rule, none gets an independent verdict; each takes its domain's.

| Unit | Domain it wires | Follows |
|---|---|---|
| `work-state-push-gateway.ts` | **Work's own record state** — the payload is `task_state_changed`/`bet_state_changed`'s `toState` | **stays.** Note the reason: the payload is Work's state, *not* "the charter says so" (requirements §9.2's explicit check) |
| `session-activity-gateway.ts` | **session lifecycle** — subscribes `session_started`/`session_ended`/`tool_call_recorded`, holds subscription lifecycle, pushes `session:<id>` | **moves into `bootAgentOrchestration`** (requirements §9.3 — stated, not deferred). It pushes through the injected `{broadcast}` port, so the one WS listener is unchanged |
| `dispatch-bindings.ts`, `run-orchestration-composition.ts`, `tool-handlers-bindings.ts`, `tool-provider-bindings.ts` | orchestration / execution Services | **move into `bootAgentOrchestration`** |
| `harness-capability-read-model.ts` | not wiring — a stateless read model | **→ `@hyperidle/shared`** (§D-I) |
| `agent-run-admission-reactions.ts`, `work-session-end-reactions.ts`, `work-session-started-reactions.ts` | Work — core reacting to an orchestration event and writing its own tables | stay (`bootCoreApi`) |
| `routine-run-session-end-reactions.ts`, `routine-scheduler-bindings.ts` | Routine | stay |
| `policy-bindings.ts` | Policy | stay |
| `assistant-turn-coherence-trigger.ts` | Conversation (AU27's axis, untouched here) | stays |
| `task-run-resolver-bindings.ts` | Work emit | stays |
| `durable-agent-queue.ts` | the core-side recorder port (core→orchestration, downward) | stays |
| `core-api-port-composition.ts`, `actor-transport-header.ts` | core's own seam | stay |
| `agent-orchestration-port-composition.ts` | core-ui/core-api's **client** of the read door | stays core-api |

### D-N · The reverse-direction check (requirements §3, one grep, one line)

`rg -a` over the non-test source of `agent-orchestration`'s four Service packages (`dispatch`,
`run-orchestration`, `session-requests`, `tool-handlers`) for value imports of a `@hyperidle/db` table
object returns **`sessions` only** (`run-orchestration/src/{concurrency,provisioner,runtime-reapers,runtime,start-runtime,transition-run,writeback-processor}.ts`,
`tool-handlers/src/tool-definitions.ts`) plus `session-requests`' own `agentWorkIntents`/`agentSessionRequests`/`explicitSessionStarts`.
**No core-domain table.** After §D-G, `sessions` is orchestration's own. **The reverse direction is clean and
closed.** Not re-run per Service, not re-opened.

---

## 4. Contracts

```ts
// packages/agent-orchestration/src/index.ts — the Layer barrel gains a real surface
export function createAgentOrchestrationApp(deps: AgentOrchestrationAppDeps): Hono<HyperIdleEnv>;
export function bootAgentOrchestration(deps: AgentOrchestrationBootDeps): Promise<AgentOrchestrationHandle>;

export interface AgentOrchestrationBootDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly adapterPool: AdapterPool;
  readonly workspaceAdapter: SandboxAdapter;
  readonly sandboxBasePath: string;
  readonly mcpBridgeRegistry: McpToolBridge;
  readonly mcpBaseUrl: string;
  readonly credentialResolver: CredentialResolver;
  /** The Application's single WS transport. Same one-method structural shape the three
   *  existing local `{broadcast}` interfaces already declare. */
  readonly broadcast: (topic: string, data: unknown) => void;
  /** Core-owned readers this Layer is ALLOWED to hold: none. Present only so the
   *  Application can wire core's own downward calls INTO orchestration, never out. */
}
export interface AgentOrchestrationHandle {
  readonly app: Hono<HyperIdleEnv>;
  /** Routes that must mount BEFORE the auth middleware (worker WS, MCP bridge). */
  registerPreAuthRoutes(api: Hono, upgradeWebSocket: UpgradeWebSocket): void;
  dispose(): Promise<void>;
}
```

```ts
// packages/core-api/src/index.ts
export function createCoreApiApp(options?: CoreApiAppOptions): Promise<Hono<HyperIdleEnv>>; // renamed from createApp
export function bootCoreApi(deps: CoreApiBootDeps): Promise<CoreApiHandle>;
export function createApiMiddlewareStack(deps: { db: HyperIdleDb; sharedMode: boolean }): MiddlewareHandler[];
// UNCHANGED subpath exports (eval depends on both — AC):
//   "./session"  → src/session.ts
//   "./routines" → src/routines.ts
```

```ts
// @hyperidle/shared/http — new node-safe subpath (A1)
export type HyperIdleEnv = { Variables: { userId?: string; /* … as today */ } };
export type BoundaryKind = "enforced" | "principal-self" | "public-data";
export interface BoundaryDeclaration { readonly kind: BoundaryKind; /* … */ }
export function requireBoundary(decl: BoundaryDeclaration): MiddlewareHandler<HyperIdleEnv>;
export function failClosedAssertion(): MiddlewareHandler<HyperIdleEnv>;
export function constantTimeStringEqual(actual: string, expected: string): boolean;

// @hyperidle/shared/git — new node-only subpath (A2), never in the main barrel
export interface GitConfigInjection { readonly key: string; readonly value: string }
export interface GitRunner { /* the 15 verbs, unchanged from git-export-runner.ts */ }
export function createGitRunner(cwd: string, options?: CreateGitRunnerOptions): GitRunner;
```

```ts
// packages/agent-orchestration/agent-filesystems/src/index.ts (F2)
export function listInjectedFilesystemIdsForAgent(exec: WriteExecutor, agentUserId: string): Promise<string[]>;
export function saveInjection(exec: WriteExecutor, v: { agentUserId: string; filesystemId: string; createdAt: string }): Promise<void>;
export function deleteInjection(exec: WriteExecutor, agentUserId: string, filesystemId: string): Promise<boolean>;

// packages/agent-orchestration/agent-run-config/src/index.ts (G1)
export function getAgentRunConfig(exec: WriteExecutor, agentUserId: string): Promise<AgentRunConfig | null>;
export function upsertAgentRunConfig(exec: WriteExecutor, agentUserId: string, patch: Partial<AgentRunConfig>): Promise<void>;
export function getTeamRunConfigDefaults(exec: WriteExecutor, teamId: string): Promise<TeamRunConfigDefaults | null>;

// packages/agent-orchestration/run-orchestration — sessions ownership (D1/D2)
export function getSessionSubscribeContext(exec: WriteExecutor, sessionId: string):
  Promise<{ taskId: string | null; sourceKind: string | null; sourceCorrelationJson: string | null } | null>;
export function requestRunStopForTasks(exec: WriteExecutor, taskIds: readonly string[],
  opts: { reason: "bet_killed" }): Promise<{ stoppedSessionIds: string[] }>;
```

**Barrel discipline (Mechanism A):** every new SQL-owning Service barrel exports typed functions only — never
`serviceConnections`, `filesystemCaptures`, `filesystemInjections`, `sessions`, `agentRunConfig`.

---

## 5. Route checklist

Routes whose **host app** changes. `/api` prefix and every path string stay identical unless noted.

| Route | From | To | Web change |
|---|---|---|---|
| `GET /api/agent-orchestration/sessions` | `core-api/src/routes/agent-orchestration-sessions-routes.ts` | orchestration app | none (port-internal) |
| `GET /api/agent-orchestration/sessions/:id/activity` | same | orchestration app | none |
| `GET /api/sessions/:id`, `GET /api/sessions/starts/:id`, `POST /api/sessions/:id/abort`, `GET /api/sessions/:id/activity`, `POST /api/sessions` | `core-api/src/routes/sessions-routes.ts` | orchestration app | none — same paths |
| `GET /api/tasks/:id/sessions` | `core-api/src/routes/tasks.ts:185` | orchestration app, `GET /api/agent-orchestration/tasks/:id/sessions` | `useTaskSessions.ts` — **URL only** |
| `GET/POST/DELETE /api/connections`, `POST /api/connections/:id/validate` | `core-api/src/routes/connections.ts` | orchestration app, `/api/agent-orchestration/connections*` | `SettingsConnections.tsx:106,370,392` — **URL only** |
| `GET/PATCH /api/observability*` (4) | `core-api/src/routes/observability-routes.ts` | **DELETED** | none (zero callers) |
| `GET/PATCH/POST /api/git-export*` (4) | `core-api/src/routes/git-export-routes.ts` | **DELETED** | none (zero callers) |
| `GET /api/filesystems?agentUserId=`, `POST /api/filesystems/:id/injections`, `DELETE /api/filesystems/:id/injections/:agentUserId` | stay in `core-api` | unchanged host, decomposed internals (§D-K) | **none** |
| `PATCH /api/agents/:id`, assistant PATCH | stay in `core-api` | unchanged host, persist delegated down (§D-A) | **none** |
| `/api/ws` (user WS), `/api/ws/worker`, MCP bridge | `app.ts` hooks | Application registers pre-auth; user WS = core's hook, worker WS + MCP = orchestration's | none |

**Guard obligation:** every route file that moves to `packages/agent-orchestration/**/routes/**` must keep its
`requireBoundary({...})` declaration, and `eslint.config.ts:514-531`'s `files` glob must be extended from
`packages/core-api/src/routes/**/*.ts` to also cover `packages/agent-orchestration/**/routes/**/*.ts` —
otherwise the AF11 rules silently stop covering the moved routes.

---

## 6. Security & abuse cases

| Case | Applicable? | Addressed |
|---|---|---|
| **Auth on relocated routes** | **YES — the highest-risk item in this WP.** A route that moves to a second app could land outside the auth middleware | The Application applies the stack on the shared `/api` router **before** mounting either app. Feasibility P1 proves it covers both. **Test: an unauthenticated request to a moved route (`/api/sessions/:id`, `/api/agent-orchestration/connections`) returns 401** — a real integration test per moved route family, not an assumption |
| **AF11 boundary declarations** | YES | Route checklist above + the eslint glob extension. `failClosedAssertion()` stays on the shared router, so an undeclared moved route throws in dev/test exactly as today |
| **Rate limit on state-changing endpoints** | YES | Applied on the shared `/api` router (`app.ts:346-356`), inherited by both apps. `POST /api/connections`, the abort write, and the injection writes all keep their bucket |
| **Secret handling — held connection tokens** | YES | AN1 hard-rule 1 unchanged: `encryptedToken` never leaves the resolver; `resolveInjectedConnectionsForAgent`'s byte-for-byte response shape is deleted **with** its bake, and the in-layer read replaces it. Per-user isolation (cross-user resolve → `null`, hard-rule 3) is a retained test |
| **Secret handling — crypto primitive move (J1)** | YES | Re-discharge AU21 J3's proof obligation at build time: confirm the key source (`HYPERIDLE_CREDENTIAL_KEY`/`HYPERIDLE_API_KEY` via HKDF) carries no DB read before moving; if it does, only the pure crypto moves and the secret is passed in. Round-trip test against a fixed key+plaintext must match pre-move output |
| **Path traversal** | YES — the mount engine moves | `SANDBOX_SCAFFOLDING_PATHS` and the four adapters move **unchanged**; the relocation is a package move, not a rewrite. Existing adapter tests move with them and must stay green |
| **SSRF** | YES — `lsRemote`/`clone` take a user-supplied URL | `createGitRunner`'s hardened env allow-list and 15-verb whitelist move **verbatim** to `@hyperidle/shared/git`. No behaviour change; its tests move with it |
| **WS subscribe authorization** | YES — the authorizer is rewired | The `session:` branch keeps fail-closed semantics: unknown session → `false`. The only deletion is the FK-redundant task existence check (feasibility P4). **Test: subscribing to `session:<nonexistent>` still denies** |
| **Input trust on agent-authored fields** | N/A | This WP moves code; it introduces no new agent-authored input field |
| **New credential surface** | N/A | No new credential type. `server_credentials` stays core (`@hyperidle/credentials`), explicitly not re-litigated |
| **Privilege change from the `sessions` ownership move** | YES | `POST /api/sessions/:id/abort` keeps its exact boundary declaration and auth on the new host. **Test: abort by an unauthenticated caller → 401; abort of a non-active session → same status code as today** |

---

## 7. Acceptance criteria

Mapped to `plan.md`'s seven ACs. Every one names its verification.

| # | Criterion | Verification |
|---|---|---|
| **AC1** | `serviceConnections` has exactly one Service importer (`packages/agent-orchestration/connections`); no core-api Service touches the table; K1's bake is gone | (a) `table-ownership-guard` `TABLE_OWNER.serviceConnections = "packages/agent-orchestration/connections"` and `npm run lint` fails on a fixture core-api Service importing it; (b) `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` and its 8 wiring sites do not exist — a `tsc` failure if any caller survives; (c) **integration test**: add a held connection AFTER an intent is emitted and BEFORE it drains → the connection is provisioned at spawn (proves the in-layer live read, and would FAIL against the bake) |
| **AC2** | All 15 core-api Services have an evidenced whole-service verdict; the reverse direction confirmed once | The three `service-verdicts/*.md` files + `git-export-rechallenge.md` + §D-N of this doc. Static artefact — no test. `/architecture-critique` checks completeness against the 15-name list in requirements §3 |
| **AC3** | Part-level verdicts for the mount engine, the `users` columns, and `WsConnectionHub` | §D-E, §D-K, §D-L. Static artefact |
| **AC4** | The mount engine relocates; record + probe resolved separately | (a) `packages/core-api/filesystems/src/mounter-registry.ts` gone, `packages/agent-orchestration/filesystem-mounting/` present; (b) `TABLE_OWNER.filesystemCaptures` points at it and the guard fails a core-api fixture importer; (c) `filesystems` still owns `filesystems` and the knowledge-scope gate test (`routes/knowledge.ts:565` 400-without-scopeId) stays green |
| **AC5** | Orchestration hosts its own session/harness-streaming routes; documented `WsConnectionHub` verdict | (a) **static** — an import guard (extend `scripts/composition-edge-anti-regrowth-guard.ts` with a `core-api → agent-orchestration route module` check) fails if any file under `packages/core-api/src` imports a module under `packages/agent-orchestration/**/routes/**`; `app.ts` no longer imports `agent-orchestration-sessions-routes.js`; (b) **integration test** hitting `GET /api/sessions/:id` and `GET /api/agent-orchestration/sessions?...` through the Application-mounted app, asserting status + body shape unchanged; (c) 401 on both without auth |
| **AC6** | Every relocate verdict is executed here, none parked | The increment table in §12 covers connections, mount engine, captures, injections, `users`+`teams` columns, `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `observability`, `realtime`, `git-export`, `harness-capability-read-model`, `createGitRunner`. Verified by: `UNOWNED_SHARED_TABLES` does not exist; `packages/core-api/{observability,realtime,git-export}` do not exist; `npm run knip` reports no new dead exports |
| **AC7** | Settings + live session activity behave identically; no frontend behaviour change | (a) route-level integration tests **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, **read as painted output** (`npx playwright screenshot` + read the PNG); (c) `git diff --stat packages/web` confined to fetch/base-URL lines — **exactly three files may change and only their URL strings**: `useTaskSessions.ts`, `SettingsConnections.tsx`, and (only if a URL moves) `useSessionActivity.ts`. Zero change to render logic or user-visible copy |
| **AC8** *(cross-cutting, new — the zero-exceptions bar)* | Both guards end with no allowlist of any kind | `scripts/table-ownership-guard.ts` has no `UNOWNED_SHARED_TABLES`, its scan covers Layer `src/` roots, and `inspect()` returns zero findings; `scripts/composition-edge-anti-regrowth-guard.ts` keeps `ALLOWLIST`/`STATELESS_METHODS`/`isStatelessProvider` absent and `DEFERRED_FOLLOWUP` empty. Fixture tests prove each guard **fires** on a would-be violation of the class it used to exempt |
| **AC9** *(new)* | `packages/eval`'s subpath imports survive | `npm run check` green with `packages/eval` importing `@hyperidle/core-api/session` and `@hyperidle/core-api/routines` unchanged; both subpaths still declared in `packages/core-api/package.json` |
| **AC10** *(new)* | Unknown `/api/*` still returns the canonical `ApiErrorResponse` JSON 404 | **Integration test**: `GET /api/definitely-not-a-route` → 404 with `{ error, code: NOT_FOUND }` and `content-type: application/json`. Guards feasibility P1's `notFound` trap |
| **AC11** | Whole-change correctness | `npm run verify` |

---

## 8. Migrations (renames / removals / moves — every call-site family)

| Change | Sites | Step |
|---|---|---|
| `createApp` → `createCoreApiApp` | `app.ts:305,743`; `server-factory.ts:1124`; `test-fixtures.ts:49`; `test-utils.ts:13`; 11 `*.integration.test.ts` under `packages/core-api` | rename |
| `createServer` → `@hyperidle/remote-server/create-server` | `remote-server/src/index.ts:36`; `desktop/src/boot-server.ts:18,30`; `web/scripts/{ah1:27/62, ah5:37/140, ah6:45/250}-test-server.ts`; 8 test files (incl. `packages/desktop/__tests__/boot-server.test.ts` and `agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts`) | move + re-point |
| `requireBoundary` / `HyperIdleEnv` / `failClosedAssertion` / `constantTimeStringEqual` → `@hyperidle/shared/http` | every file under `packages/core-api/src/routes/**` + `middleware/**` + `routes/workers.ts:10` + `routes/users.ts:29` | re-point (mechanical) |
| `harness-capability-read-model` → `@hyperidle/shared` | `routes/{connections:204, agent-profile:299,311, teams-routes:273,771, agents:135,165, users:196}.ts` + its test | re-point |
| `createGitRunner` → `@hyperidle/shared/git` | `server-factory.ts:38,1007`; `routes/filesystems.ts:153,260`; `git-export.ts` (deleted anyway) | re-point |
| `resolveInjectedConnectionsForAgent` **delete** | `services/{routine-scheduler-bindings:30,175, task-run-resolver-bindings:15,35, agent-run-admission-reactions:33,127, assistant-turn-coherence-trigger:48,86}.ts`; `routes/{sessions-routes:1,418, threads:14,1489,1726, knowledge:25,961}.ts`; the 6 resolvers' optional dep + `review/{ports:172, session-review-creator:158, proposed-call-workflow:234,263,383,785,822}.ts`; `shared/src/agent-work-intent-recorder.ts:119` (`BakedConnectionForProvisioning` field) | delete |
| `resolveInjectedFilesystemsForAgent` **delete** | the symmetric set (`filesystems/src/index.ts:37` + the same wiring + `shared/src/agent-work-intent-recorder.ts:105`) | delete |
| `CoreApiPort.connections` **delete** | `api-contract/src/core-api-port.ts:631-642` + `GET /connections/provisioning` | delete (J7) |
| `@hyperidle/connections` → `@hyperidle/credentials` | `app.ts:2-10,261-263,493`; `server-factory.ts:938-988,1060`; `routes/{credentials,connections,filesystems:6}.ts`; `packages/shared/src/credential.ts`; `core-api/package.json` | rename (J2) |
| `work.list(..., include:"latestSessionOutcome")` **delete** | `work-service.ts:50,382-386`; `routes/bets.ts:378` (recomposed); `schemas/bet.schema.ts:43` (**shape unchanged**) | delete + recompose |
| `listCaptures` **delete** | `filesystem-registry.ts:99-110`, `filesystems/src/index.ts:19`, `filesystems-completeness-contract.integration.test.ts:172,178,181,211` | delete (test-only reachable) |
| `users.systemPromptPath` / `users.skills` **DROP COLUMN** | `db/src/factory-bootstrap.ts:110,111,140,141`, `db/src/demo-fixture.ts:108` | drop + strip seeds |
| `packages/core-api/{observability,realtime,git-export}` **delete package** | `core-api/package.json` deps; `vitest.config.ts:42`; `scripts/typecheck-gate.ts:365,476`; root `package-lock.json` | delete |
| `UNOWNED_SHARED_TABLES` **delete** | `table-ownership-guard.ts:349-354,545,362-374,641-711,798-821` (incl. the disjointness fixture) | delete |

---

## 9. Protected tests

Assertions in these files must **not** be weakened or deleted — re-wire imports/URLs only.

```
protectedTests:
  - packages/core-api/src/__tests__/AN1-connections.integration.test.ts
  - packages/core-api/connections/src/__tests__/resolve-injected-connections-for-agent.integration.test.ts   # deleted WITH the bake in E3; until then, protected
  - packages/core-api/src/__tests__/connections-provisioning-e2e.integration.test.ts
  - packages/core-api/src/__tests__/AF11-authz.integration.test.ts
  - packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts
  - packages/core-api/src/__tests__/agent-orchestration-port.integration.test.ts
  - packages/core-api/src/__tests__/agent-orchestration-port-readonly.integration.test.ts
  - packages/core-api/src/__tests__/run-orchestration-connections-provisioning-edge-closed.integration.test.ts
  - packages/core-api/src/__tests__/connections-wiring-completeness.integration.test.ts
  - packages/core-api/src/services/__tests__/harness-capability-read-model.test.ts   # esp. the `const reader: HarnessCapabilityReader = pool` assertion
  - packages/core-api/realtime/src/__tests__/ws-broadcaster.no-session-forwarding.test.ts
  - packages/core-api/filesystems/src/__tests__/git-worktree-live-proof.integration.test.ts
  - packages/core-api/src/__tests__/server-disposal.integration.test.ts
  - packages/core-api/src/__tests__/server-factory.resolver.test.ts
```

The `git-export` test files are the **exception**: they are deleted with the feature (C1), by founder verdict.

---

## 10. Shared files (concurrent-WP overlap)

```
sharedFiles:
  - packages/db/src/schema.ts                                  # G1 adds 2 tables, drops 11 columns
  - packages/db/drizzle/                                       # G1 migration
  - packages/core-api/src/app.ts                               # B1a
  - packages/core-api/src/server-factory.ts                    # B1b (relocated)
  - packages/core-api/package.json                             # B1b, C1, C2, C3, E2
  - packages/shared/package.json + src/index.ts                # A1, A2, D-D, E1
  - packages/api-contract/src/agent-orchestration-port.ts      # D1
  - packages/api-contract/src/core-api-port.ts                 # E3 (J7 deletion)
  - packages/shared/src/agent-work-intent-recorder.ts          # E3, F2, G1 (the bake shape)
  - scripts/table-ownership-guard.ts                           # D1, D2, E4, F1, F2, G1
  - scripts/composition-edge-anti-regrowth-guard.ts            # B1a (route-import check), E4
  - eslint.config.ts                                           # A1 (authz glob)
  - vitest.config.ts, scripts/typecheck-gate.ts, package.json  # every package add/remove
```

**AU27 collision warning.** AU27 (K2, assistant-turn de-specialization) rewrites
`conversation/src/assistant-turn-resolver.ts` and `dispatch/src/service.ts` — both of which AU26's E3/F2/G1
edit for the bake deletions. **Do not run AU26 and AU27 in parallel.** AU26 first: it deletes the two bakes
AU27 would otherwise have to carry.

---

## 11. Risks and open questions

1. **D-C (`createServer` → `remote-server`) is the one arguable call.** `desktop` ends up importing another
   Application's wiring. Rationale and the rejected 630-line alternative are in §D-C. Flagged for the
   reviewer; if rejected, take the duplication knowingly — do **not** resolve it with a new package.
2. **D1's handoff change is a real semantics change.** Ending the session moves from same-transaction to
   event-driven (`session_handoff_completed`, a channel that already exists and orchestration already
   consumes). If a handoff commits and the process dies before the subscriber runs, the run row is briefly
   stale-`active`. Mitigation: `runtime-reapers.ts` already reaps stale-active runs. Recorded as accepted,
   not hidden.
3. **B1b is the largest single PR** even after the B1a split. If it exceeds a builder session, split further
   at the `registerCoreDomainServices` / `registerAgentLayerServices` seam (each moves into its own Layer boot
   independently, with `server-factory` still calling both).
4. **G1's backfill.** Every existing agent row must get an `agent_run_config` row; agents with all-null
   run-config must still resolve defaults identically. The `desktop` upgrade path is the risk (v0.6.0's PGlite
   hang is precedent) — the migration must be smoke-tested against a real populated local DB, not only the
   test suite.
5. **`packages/eval` seeds `sessions` directly** (`seeding.ts`, 12 scenario files). It stays excluded from the
   guard by package name. If a future WP makes eval a first-class consumer, it needs a real door — flagged,
   not solved here.
6. **AU27's `conversational` mode still bakes `modelId`/`modelProvider`** at `assistant-turn-resolver.ts:200-201`.
   G1 deletes that bake. Confirm AU27's plan absorbs the change rather than re-adding it.

---

## 12. Ordered increments — 13 PRs, 7 waves

Each row is an independently shippable PR to `main` (`npm run verify` green, no stacking). Sizes:
S ≈ ½–1 day, M ≈ 1–2 days, L ≈ 3–5 days.

| # | Wave | Increment | Size | Depends on | The test that proves it |
|---|---|---|---|---|---|
| **A1** | 0 · enabling | `HyperIdleEnv` + `requireBoundary` + `failClosedAssertion` + `constantTimeStringEqual` → `@hyperidle/shared/http`; re-point ~45 route/middleware files; extend the authz eslint glob | M | — | `npm run lint` (authz rules still fire on every route file); `AF11-authz.integration.test.ts` green unchanged |
| **A2** | 0 · enabling | `createGitRunner` → `@hyperidle/shared/git`; `harness-capability-read-model` → `@hyperidle/shared` with a structural `HarnessCapabilityReader` | S–M | — | git-runner verb tests move and stay green; `const reader: HarnessCapabilityReader = pool` still compiles; `packages/web` build has no `node:child_process` in its bundle |
| **B1a** | 1 · Job 2 | `createApp`→`createCoreApiApp` (drops the orchestration mount, worker-WS hook, `SessionActivityBuffer`); `createAgentOrchestrationApp()` + `packages/agent-orchestration/src/routes/{sessions,agent-orchestration-sessions}.ts`; `bootCoreApi`/`bootAgentOrchestration`; `session-activity-gateway` moves into orchestration's boot; **`server-factory` still mounts both** | L | A1 | `app.ts` no longer imports the orchestration routes (import guard); integration test hits `/api/sessions/:id` + `/api/agent-orchestration/sessions` through the mounted app with identical bodies; 401 without auth |
| **B1b** | 1 · Job 2 | `createServer` → `packages/remote-server/src/create-server.ts`; Application owns db/EventBus/wsHub/MCP-bridge, the middleware stack, and mounts both apps; re-point 5 non-test callers + 8 test files + 2 fixtures | L | B1a | `server-disposal.integration.test.ts` + `server-factory.resolver.test.ts` green; **AC10** (`/api/nope` → JSON 404); the 240 fixture-based tests unchanged |
| **C1** | 2 · dissolve | `git-export` exporter deletes; package removed; doc claims reconciled | M | A2 | `npm run knip` clean; `rg -a "api/git-export"` → zero; `npm run verify` |
| **C2** | 2 · dissolve | `observability` dissolves (translator+adapter → `shared`, config pair → `settings`, `TraceIdResolver` deleted, 4 routes deleted, package removed) | M | — | dispatcher unit tests move to `shared` and stay green; `rg -a "api/observability"` → zero |
| **D1** | 3 · sessions | `sessions` owner = `run-orchestration`; `AgentOrchestrationPort.sessions` read family; convert the 13 readers; abort + `GET /tasks/:id/sessions` move to orchestration-api; delete `review`'s redundant read; delete `work-service`'s subquery (recompose in `routes/bets.ts`); `bet-kill-cascade` → `requestRunStopForTasks`; handoff's session-end write → the existing event channel | L | B1a | guard fires on a fixture core-api Service importing `sessions`; bet-detail response byte-identical (existing bet route tests); bet-kill still stops runs (existing cascade test, re-wired); handoff test asserts the run reaches `done` via the subscriber |
| **C3** | 2 · dissolve | `realtime` dissolves into `packages/core-api/src/`; `session:` authz decomposed via `getSessionSubscribeContext`; FK-redundant `work` check deleted; package removed | S–M | B1a, D1 | `ws-broadcaster.no-session-forwarding.test.ts` green; subscribe to `session:<nonexistent>` still denies; thread-participant authz unchanged |
| **D2** | 3 · sessions | `propagationLog`→policy, `taskDispatchAttempts`→work, `userSkills`→users; guard scan extended to Layer `src/` roots (eval excluded by name); `UNOWNED_SHARED_TABLES` + `assertDisjointOwnership` deleted | M | D1 | `table-ownership-guard --fixtures` proves it now fires on each of the four former exemptions; `inspect()` returns zero findings on the real tree |
| **E1** | 4 · connections | J1 — AES-GCM primitive → `@hyperidle/shared` (re-discharge the no-DB proof first) | S | — | encrypt→decrypt round-trip matches pre-move output for a fixed key+plaintext; `credential-runtime-path` + `AN2` tests green |
| **E2** | 4 · connections | J2 — rename to `@hyperidle/credentials`, LLM-key catalog only | M | E1 | `server-factory.resolver.test.ts`'s `instanceof DbCredentialResolver` invariant; `/api/credentials` unchanged |
| **E3** | 4 · connections | J3 — SQL-owning `packages/agent-orchestration/connections`; provisioning in-layer; **delete K1's bake** (6 resolvers + 8 wiring sites); delete `CoreApiPort.connections` + `GET /connections/provisioning` | L | E2 | **AC1(c)** the add-after-emit test; `run-orchestration-connections-provisioning-edge-closed` still asserts zero `app.fetch`; per-user isolation |
| **E4** | 4 · connections | J4′ — connections routes onto orchestration-api; `settings`' MCP projection port re-pointed; guard row added | M | E3, B1b | `AN1-connections.integration.test.ts` re-wired and green; Playwright pass on Settings → Connections |
| **F1** | 5 · filesystems | mount engine + 4 adapters + `SANDBOX_SCAFFOLDING_PATHS` + `filesystemCaptures` → `packages/agent-orchestration/filesystem-mounting`; `listCaptures` deleted | M–L | A2 | adapter tests move and stay green incl. `git-worktree-live-proof`; guard owns `filesystemCaptures`; a real session still mounts |
| **F2** | 5 · filesystems | `filesystemInjections` → `packages/agent-orchestration/agent-filesystems`; **delete the filesystems bake**; decompose the `injections ⋈ filesystems` join; injection write routes stay core-hosted, persist delegated down | L | F1 | add-a-filesystem-after-emit test (the twin of AC1(c)); `SettingsAgents.tsx` diff is **zero lines**; team-mismatch 400 still fires |
| **G1** | 6 · run config | `users` 6 + `teams` 3 run-config columns → `packages/agent-orchestration/agent-run-config`; `DROP COLUMN` × 11 incl. the 2 dead; migration + backfill; every reader re-pointed; `validateAgentConfig` moves | L | A1 | migration applies clean against a **populated** local DB (manual smoke, not only the suite); an agent with a per-agent model still resolves it at provisioning; `Settings → Agents` Playwright pass; `agent-profile` render unchanged |

**Critical path:** A1 → B1a → B1b → E4 (and D1 → C3 / D2). A2, C2, E1, G1 can run in parallel with wave 1.

**Founder confirmation points (requirements §8's human gate).** Each relocate verdict is confirmed before its
build increment, not bundled with approval of this doc: **git-export deletion** (before C1), **observability
dissolution** (before C2), **realtime dissolution** (before C3), **`sessions` ownership + the handoff
semantics change** (before D1), **connections** (already given — Decision J), **mount engine + captures +
injections** (already given), **`users`/`teams` columns incl. the two `DROP COLUMN`s** (before G1).
"Stays" verdicts need no gate.
