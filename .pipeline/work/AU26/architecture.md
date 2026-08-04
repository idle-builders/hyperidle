# AU26 — Architecture

Tier: **production**. Spec of record: `plan.md` (amended). Binding requirement: `requirements.md`
(founder-approved, `progress.json → approvals.requirements`). Design phase: **skipped** — backend/infra,
zero required frontend behaviour change. Feasibility: `feasibility.md` (P1–P6 + **P5′**, all GO).

Every `file:line` below was re-traced with `rg -a` on branch `pipeline/AU26` (base `origin/main` @ `75d85687`).

> **Size, stated honestly up front.** This is **not one PR.** It is **19 independently shippable PRs
> across 5 waves** — the number matches §12's table row for row, which round 2's "13" did not (its own
> table had 16 rows). Anyone who tries to land it as one change will produce an unreviewable diff touching
> ~280 files, four packages' public surfaces, a schema migration, both guards, and the eval harness. The
> wave boundaries in §12 are computed dependency depth, so each PR is green on `main` by itself and each
> wave is a genuine parallel band.

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
| the guard enforces the ACL | **Partially — and *not* for the reason round 1 gave. Correction, verified.** `inspect()` (`:604-630`) already runs a second explicit pass over `packages/core-api/src` (the AU19 Increment 5 scan-widening, `@lore` `:612-624`). The 9 Layer `sessions` readers **are visited today**; they pass only because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered at `:543`). So deleting the Set alone fires immediately on all **12** already-scanned Layer pairs. The real hole is elsewhere: the scan surface is exactly `nestedServiceRoots()` **plus one hard-coded `core-api/src`** — `agent-orchestration/src`, `remote-server/src`, `agent-execution/src` and `eval/src` are never visited | **D2** replaces the two hand-written roots with **the whole workspace** (§D-G — round 3 withdrew round 2's derived-closure scope, which both pulled in `packages/db/src`'s 18 accesses and missed `packages/agent-orchestration/src`). Not cosmetic: **B1a creates route files under `packages/agent-orchestration/src/routes/**` and B1b moves the single `propagationLog` importer into `packages/remote-server/src/`** — both land in roots the guard does not visit today, so without this change the WP would *create* the hole it claims to close. The honest census over the real scope is **100 file×table pairs in 48 files**, not 12 |
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

1. **The `sessions` read surface is 15 non-test core-api files, not 4 — and not 13 (round-1 undercount).**
   A full value-import census (`sessions` from `@hyperidle/db`, every `packages/**` non-test file) returns 35
   files: 8 in `agent-orchestration` (its own, post-§D-G), 12 in `packages/eval` (§D-G), and **15 in core-api**:
   - **9 Layer routes** — `routes/{agent-profile,agents,recipients,sessions-routes,status,tasks,teams-routes,threads,users}.ts`
     (visited by the guard today, exempt only via `UNOWNED_SHARED_TABLES`);
   - **6 Service files** — `policy/handoff-protocol.ts`, **`policy/lifecycle-propagation.ts`**,
     `realtime/ws-connection-hub.ts`, `review/session-review-creator.ts`, `work/bet-kill-cascade.ts`,
     `work/work-service.ts`.

   `policy/lifecycle-propagation.ts` carried **no verdict at all** in round 1 (`group2.md:81` saw it and parked
   it as "a later AU-track axis" — but §D-G *makes it this WP's axis*). It is now §D-H site **15**. Absorbed by **D1**.
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
4. **Job 2 has TWO blockers, not one.** `agent-orchestration-sessions-routes.ts:9-12` states the first
   outright: giving orchestration its own app "would force `agent-orchestration` to import
   `@hyperidle/core-api` for the auth/boundary/rate-limit stack." Absorbed by **A1** + the Application-owned
   stack (§4). **The second is larger and round 1 missed it entirely:**
   `packages/core-api/src/routes/sessions-routes.ts:1-33` imports `@hyperidle/work`, `@hyperidle/users` and
   `@hyperidle/settings` — three **core-api Services** — and calls all of them inside `POST /`'s
   `db.transaction` (`:396-424`). The file therefore **cannot move**, and the anti-regrowth guard (zero
   exemptions at HEAD, `composition-edge-anti-regrowth-guard.ts:417`) would fire on any attempt. Absorbed
   by **§D-H #16**'s per-route split.
5. **`git-export` is two things in one package** — a dead 1,205-line exporter and a live 509-line git runner
   whose two of three consumers are `filesystems`'. **A2** + **C1**.
6. **`@hyperidle/core-api` depends on four `agent-orchestration` Services** (`dispatch`, `run-orchestration`,
   `session-requests`, `tool-handlers`) and on `harness-registry`. Those dependencies move to the
   orchestration Layer package in **B1a/B1b**; core-api's `package.json` sheds them.

---

## 3. Decisions

### D-A · The placement rule — where a route lands (closes requirements §9.5, third leg of J6's supersession)

J6 kept connections' routes in core-api because "core-api is the layer with the HTTP surface." That is a
locality argument, and Job 2 removes the fact it rested on. But the naive replacement — *"anything
agent-shaped goes on orchestration-api"* — breaks on the first real case: `POST /api/filesystems/:id/injections`
writes an agent-run-config record, but it must first read `filesystems` and `teamMembers`
(`routes/filesystems.ts:337-364`), both core-owned. Orchestration may not read either.

**Round-1 correction.** The round-1 rule was phrased as *"a route lands on the layer that owns its **gate**,"*
where "gate" meant *what the handler must read to decide whether the **mutation** is legal*. That phrasing had
three defects the critique is right about: it is **undefined for read routes** (its one worked read example was
decided by a *rendering* argument that `requirements.md:42` explicitly outlaws), it **silently exempted
authentication**, and — decisively — **it was never run against its own inputs**: `GET /api/tasks/:id/sessions`
(`tasks.ts:185-190`) and `POST /api/sessions` (`sessions-routes.ts:363-366`) both gate on a core
`work.get(db,"task",…)` 404, so the rule as written says *core-hosted* while the round-1 table said
*orchestration*. The rule below is restated so it decides reads and writes by the same mechanical test, and
§5's table is **re-derived from it**, not written beside it.

**The rules `core-api`'s app now lives by (written down, per requirements §9.5):**

1. **`core-api` never imports an `agent-orchestration` route module.** This is AC5's observable proof.
2. **A route lands on the layer that owns *every table its handler touches*.** Enumerate the tables the
   handler reads or writes — reads and writes both, no rendering/use distinction, because ownership covers
   both. All on one layer → that layer hosts it.
3. **A route that touches tables on *both* sides lands on `core-api`, and composes the other side through a
   downward call.** Not because core is special, but because `core-api → agent-orchestration` is the only
   permitted direction (`app.ts:28` already imports `enqueueWorkIntent` from `@hyperidle/session-requests`).
   Orchestration cannot compose upward at all, so a two-sided route has exactly one legal host.
   Composition mechanism, by caller:
   - core **Layer route** reading orchestration data → `AgentOrchestrationPort.sessions.*` (the shipped
     read door, in-process transport, tested fidelity obligation);
   - core **Service** reading orchestration data → its existing Mechanism-C DI ports bag (the AU12/13
     precedent), never the Layer's port composition;
   - core asking orchestration to **change** its own record → a direct downward function call
     (`requestRunStopForTasks`, `transitionRun` shape). Never a Port method —
     `AgentOrchestrationPort` stays strictly read-only.
4. **Authentication and authorization applied by the Application's middleware stack are never part of a
   route's table set.** `createAuthMiddleware` reads `@hyperidle/users`; if that counted, rule 3 would force
   *every* route onto core and orchestration-api could not exist. Stated, not assumed.
5. **An emitted event is not a table touch. A subscriber is placed by its own table set, on its own
   layer.** `PATCH /api/sessions/:id` emits `session_ended`, whose subscriber
   `review/session-review-creator.ts` writes core tables; after the move the emit happens on
   orchestration's side. Under a literal reading of rule 2 that route's table set would grow every table
   every subscriber touches, transitively — which would collapse rule 3 into "everything is core." The
   event bus is a boundary, exactly like the middleware stack in rule 4: what crosses it is a payload, not
   a query. Stated, not assumed (round-2 W5).
6. **A route's table set is evaluated at the moment the increment applying the rule lands — not at the end
   of the WP.** Every set in the table below is stated **at HEAD**, so an increment is decidable while it
   is being built. Where a later increment changes a set, it is named in the row. The one live case:
   `POST /api/sessions`'s handler transitively reaches `filesystems`, `filesystem_injections` and
   `service_connections` today, through `resolveSessionStartRequest`'s `resolveInjectedFilesystemsForAgent`
   / `resolveInjectedConnectionsForAgent` arguments, called in-tx at `sessions-routes.ts:412-421`; E3 and F2
   delete both. **Verified: the verdict does not flip** — before *and* after, the set spans `tasks`/`users`/
   `server_config` (core) and `sessions`/`agent_work_intents`/`explicit_session_starts` (orchestration), so
   rule 3 says core-api at every point in the WP. **Standing consequence:** if a later increment ever *did*
   flip a verdict, the route does **not** move inside AU26 — rule 7 holds the path constant and the flip is
   recorded as a follow-on, so no increment can invalidate an already-shipped one.
7. **Path strings never change.** Both apps mount on the same `/api` router (§D-B, feasibility P1), so a
   route can change host app while keeping its URL byte-identical. This is what makes AC7's "zero
   `packages/web` diff" reachable. Its cost is that a duplicate `method + path` across the two apps would
   resolve silently by registration order — closed by AC12's route-table collision assertion.

Applied — **re-derived route by route, handler body open** (every row's table set traced at HEAD):

| Surface | Tables the handler touches | Lands on |
|---|---|---|
| `GET /api/sessions` (list, `?task_id=&state=`) | `sessions` | **orchestration-api** |
| `POST /api/sessions` | `tasks` (`work.get` 404 gate, `:363-366`) + `users`/`server_config` (the emit-time bake) + `explicit_session_starts`/`agent_work_intents`/`sessions` | **core-api**, composing down (§D-H #16) |
| `GET /api/sessions/starts/:startId` | `explicit_session_starts` + `sessions` | **orchestration-api** |
| `GET /api/sessions/:id/activity` | `sessions` + the agent-execution activity buffer | **orchestration-api** |
| `PATCH /api/sessions/:id` (incl. the abort branch) | `sessions` + `agent_session_requests` + `sessionRunRegistry` | **orchestration-api** |
| `GET /api/agent-orchestration/sessions`, `…/:id/activity` | orchestration only | **orchestration-api** |
| `GET /api/tasks/:id/sessions` | **`tasks`** (`work.get` 404 gate, `:187-191`) + `sessions` | **core-api** ⟵ *reversed from round 1*, reads `sessions` through the port |
| `POST /api/tasks/:id/handoff` | `tasks` + `sessions` + policy's own | **core-api** ⟵ *newly listed*, session read + terminal write delegated down |
| connections read + POST/DELETE/validate | `service_connections` only (traced: `routes/connections.ts` imports no `@hyperidle/users`, no `teamMembers`, no `work`); the inherited half reads the harness descriptor, a *downward* agent-execution edge orchestration owns | **orchestration-api** (J6 superseded, as founder-directed) — **path unchanged**, `/api/connections*` |
| `GET /api/filesystems?agentUserId=` | **`filesystems`** + `filesystem_injections` (post-F2, orchestration) | **core-api**, decomposed (§D-K). Derived from rule 2/3, **not** from "it renders core rows" — that argument is outlawed by `requirements.md:42` and is withdrawn |
| `GET /api/filesystems?teamId=` | `filesystems` | **core-api** |
| filesystem injection write/eject | `filesystems` + `users`/`teamMembers` (team gate `:337-364`) + `filesystem_injections` | **core-api**, delegating the persist down |
| agent run-config write (`PATCH /api/agents/:id`, assistant PATCH) | `users` (exists, `kind:"ai"`, team) + `agent_run_config` | **core-api**, delegating the persist down |
| `/api/ws` (the one user socket) | `threads` + `users` + `team_members` + `sessions` | **core-api**, composing down (§D-E). This is the rule — not a special pleading — and it is why validation scenario 4's WS half is **explicitly narrowed**; see §D-E |

**Two consequences of the re-derivation, stated because they change round-1 claims:**

- `GET /api/tasks/:id/sessions` **stays core-hosted**, so `useTaskSessions.ts` needs no URL change. Combined
  with rule 7, **no `packages/web` file changes at all** in this WP (AC7(c) tightened from "exactly three
  files" to "zero").
- `POST /api/sessions` **stays core-hosted**, which is what makes §D-H #16 buildable — see there.

**Consequence that changes a settled sub-claim:** `group3.md`'s Item-C cost line 3 said the run-config UI
"needs a legal host… That makes Item C **ordered after** the §5 app skeleton." Under the placement rule it does
not — the config write stays core-hosted. **G1 has no dependency on B1.** (The *verdict* — the columns move —
is unchanged.)

*Rejected alternative:* inject a `FilesystemInjectionValidator` port into an orchestration-hosted route,
wired by the Application to core's Services. Rejected: it is an `agent-orchestration → core-api` read by any
honest reading, the anti-regrowth guard would fire on the composition edge, and AU21's rule is absolute
("not through colocated DI, not at all"). The same rejection covers the symmetric idea of injecting a
`taskExists` reader so `POST /api/sessions` could move — that is why it stays core-hosted.

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

Weighed against the alternatives — **with the round-1 arithmetic corrected. The round-1 justification priced
the duplication at "~90 lines × 7 = ~630 lines" and that figure was inflated roughly tenfold. Restated
honestly, because a rejected alternative priced at pre-refactor scale is design-it-twice theatre:**

- **Each Application owns a duplicated bootstrap.** The 630-line figure was measured against **today's**
  388-line `createServer` monolith — i.e. *before* B1a moves every reactor into `bootCoreApi()` /
  `bootAgentOrchestration()`. Post-B1a the residual per-Application bootstrap is: open db, EventBus, wsHub,
  mcpBridge, call both boots, apply the middleware stack, mount both apps, the root `notFound` branch,
  `serve`, dispose. And 5 of the 7 "sites" are **not production Applications** — three are
  `web/scripts/*-test-server.ts` harnesses and two are core-api's own shipped fixtures, all of which may
  legitimately share a *test* helper (they already share `test-utils.ts`/`test-fixtures.ts`). The real
  duplication is **two Applications**, not seven, of a much smaller residual each. **The alternative is far
  cheaper than round 1 claimed, and it is still rejected — but on the reason below, not on cost.**
- **A third neutral composition package.** Forbidden outright (requirements §7 out #9).
- **`desktop` spawns `remote-server` as a child process** (the option round 1 missed). It is superficially
  attractive: `desktop` already speaks HTTP to the server over `127.0.0.1` on an OS-assigned port
  (`boot-server.ts:28-31`, `waitForHealth` at `:49`), so nothing in the Electron shell depends on being
  in-process. **Rejected on a shipped decision, not on taste:** the only in-process difference between the two
  Applications is the injected `adapterPool`/`workspaceAdapter` (`createLocalAdapterPool()` +
  `createSandboxAdapter("local")` for desktop vs an empty `AdapterPool` + `"disabled"` for remote-server), and
  selecting those by environment is precisely the `HYPERIDLE_PROFILE` runtime branch **AU19 Increment 5
  deliberately deleted** (`boot-server.ts:7-14` `@lore`). Re-introducing it to avoid one import would undo a
  settled simplification and trade a compile-time-checked injection for an env-string branch.

**The decision stands on the import that already exists, not on an inflated cost.** `desktop` imports
`@hyperidle/core-api/server-factory` **today** (`boot-server.ts:15-18`) and `remote-server/src/index.ts:22`
imports the same module; re-pointing `desktop` at `@hyperidle/remote-server/create-server` swaps one
Application→Layer-composition import for one Application→Application import. It invents no relationship class,
satisfies `runtime-simplification.md`'s Applications rule ("only wiring/bootstrap") at both ends, and the
requirement forbids the third package. **Still flagged as the most arguable call in this document.** If it is
rejected, the fallback is the duplicated bootstrap at its *true* post-B1a cost — do not resolve it by
inventing a package, and do not resurrect `HYPERIDLE_PROFILE`.

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
to group2.md's "three of four DI edges leave": of the four edges (`conversation`, `users`, `org`, `work`),
**exactly one leaves** — `work`, by FK-redundancy (feasibility P4). `conversation`, `users` and `org` all stay,
because thread-participant and team authorization for the task-free branch is genuinely core's. (Round 1 said
"two leave (`work` … and nothing else)", which contradicted its own parenthesis. One.)

**Validation scenario 4 is HALF-CLOSED, and this document says so rather than reading as closed.**
`plan.md` scenario 4 reads: *"when the UI connects for streaming updates, then it reaches agent-orchestration's
own route directly."* Traced at HEAD, `useSessionActivity.ts` does two things: an HTTP snapshot
`GET /api/sessions/:id/activity` (`:150`) and a WS subscribe to `session:${sessionId}` over the single shared
socket from `getWsClient()` (`:223-230`).

- **HTTP half — CLOSED.** `GET /api/sessions/:id/activity` moves to `createAgentOrchestrationApp()` and is
  served entirely by orchestration's own handler reading its own tables and its own activity buffer. No
  core-api handler, no `AgentOrchestrationPort` hop. The URL string is unchanged (rule 7), which is a
  *transport* fact, not a routing one — the request is handled by orchestration's route.
- **WS half — DELIBERATELY NOT CLOSED. This narrows a founder-written AC.** The socket stays on core-api's
  hub and orchestration broadcasts through the injected `{broadcast}` port. Reason, from the placement rule
  itself (rule 2/3), not from convenience: the `/api/ws` endpoint's subscribe authorizer must touch
  `threads` (`senderInThread`), `users` + `team_members` (`senderInTeam`, reachable from
  `canSubscribeToTaskFreeSession` at `ws-connection-hub.ts:167-184`) **and** `sessions`. That is a two-sided
  table set, and rule 3 gives a two-sided route exactly one legal host: core-api. The only ways to close it
  fully are (a) let orchestration read `threads`/`users`/`team_members` — forbidden outright, or (b) open a
  **second** WS listener owned by orchestration for the `session:` topic alone — which re-splits one socket
  and one topic space into two, and still cannot authorize the task-free branch without (a).
  **This is a narrowing of a founder-written acceptance criterion and is put to the founder as such, at the
  realtime confirmation point (before C3), alongside the `realtime` dissolution verdict.** If the founder
  rejects the narrowing, the only honest way to satisfy it is to move thread/team subscribe authorization
  out of the socket entirely (a signed subscribe token minted by core at snapshot time), which is a new
  design and a separate WP — not something to smuggle into AU26.

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
| `sessions` | `packages/agent-orchestration/run-orchestration` | §D-H — **16** foreign readers: 15 core-api files + `agent-orchestration/tool-handlers` (site 17, found by round 3's census) |
| `propagationLog` | `packages/core-api/policy` | `work/bet-kill-cascade.ts` → injected `PropagationLogWriter` port (Mechanism C, the AU12/13 precedent); `server-factory.ts`'s reaper → policy's exported `reapPropagationLog` |
| `taskDispatchAttempts` | `packages/core-api/work` | `policy/handoff-protocol.ts` → its existing `deps.work.*` port bag gains one method |
| `userSkills` | `packages/core-api/users` | `settings/plugin-configuration.ts` → injected reader port; `routes/users.ts` + `services/routine-scheduler-bindings.ts` (Layer) → call `users`' exported functions |

#### The scan scope — re-derived in round 3, and the census re-run honestly

**Round-2 correction, in both directions.** Round 2 derived the scan scope from *"the runtime dependency
closure of the shipped Applications, computed from `package.json` `dependencies`, transitively."* Computed
at HEAD (`94cc2dfe`), that derivation is wrong three times over:

- **It pulls in `packages/db/src`, where 2 files make 18 owned-table accesses** — `demo-fixture.ts` (10)
  and `factory-bootstrap.ts` (8). Importing from `./schema.js` does **not** evade the guard: the
  direct-access branch (`table-ownership-guard.ts:563-573`) calls `consider()` on the *identifier name*
  of the first argument to `.from/.insert/.update/.delete`; only the *value-import* branch is scoped to
  `@hyperidle/db`. All 18 fire. Round 2's *"**12 pairs, all inside `packages/core-api/src`** … **zero new
  work**"* was the `core-api/src` sub-count mistaken for the whole, and D2's proof obligation (AC8(c),
  `inspect()` returns zero findings) was unreachable as written.
- **It misses `packages/agent-orchestration/src` — the directory B1a creates route files in.** Both
  umbrella packages have **zero dependents** at HEAD (`rg -a -l '"@hyperidle/agent-orchestration"'
  --glob package.json` → only its own; same for `agent-execution`). `packages/agent-orchestration/src/index.ts`
  is literally `export {}` and its `package.json` declares no `dependencies` field at all. What core-api
  depends on is the *nested* Services, which `nestedServiceRoots()` already walks. So the closure would
  only have covered B1a's new routes **after** B1b added `"@hyperidle/agent-orchestration"` to
  `remote-server`'s deps — making the guard's correctness ride on an unnamed build step.
- **It reads a field `desktop` does not use.** `packages/desktop/package.json` declares
  `dependencies: {"@electric-sql/pglite": "^0.5.4"}` and puts `@hyperidle/core-api`, `db`, `shared`,
  `harness-registry`, `remote-worker` under **`devDependencies`**. Read literally, `desktop`'s closure is
  one third-party package; the scan only survived because `remote-server` independently pulled `core-api` in.

**And the principle was broken, not only the census.** Round 2 justified excluding `packages/eval` as
*"the ACL governs code that runs inside a shipped Application,"* characterising eval as *"a fixture-seeding
harness that stands the domain up rather than consuming it."* `factory-bootstrap.ts` is the **production
first-boot seeder**: `packages/desktop/src/main.ts:451-454` calls `applyFactoryBootstrap(handle.db)` on
**every** Electron launch, and its `@lore` at `:445-448` says it *"must run before the server starts so
`system:propagation` and facilitator agents are present when the first request arrives."* Same shape as
eval, **inside** a shipped Application. A principle that cannot decide its own hardest case is not a
principle — it is the exclusion it was written to produce.

**The principle, restated in round 3 so it decides all three cases by the same test:**

> **The table-ownership ACL governs every non-test file in the workspace.** The only ungoverned code is
> test code — `__tests__/` directories and `*.test.ts(x)` files, which the guard already skips
> structurally (`collectSourceFiles`, `:405` and `:410-412`) — and only because a test of a Service cannot be required to read
> the state it asserts on *through the Service it is testing*. That circularity is the one thing the ACL
> cannot ask for. **Nothing else is out of scope: not by package, not by runtime reachability, not by
> role.**

Mechanically this is *smaller* than round 2's rule, not larger: scan roots become `src/` of **every**
package under `packages/` that has a `package.json`. No dependency graph is read, no closure is computed,
no `dependencies`-vs-`devDependencies` question arises, no package name appears anywhere in the guard, and
a package added tomorrow is scanned **by default** rather than needing to earn its way in. It reaches
`packages/agent-orchestration/src` and `packages/remote-server/src` **at HEAD** — verified, not asserted:
both directories exist with a `package.json` today, so B1a's route files and B1b's relocated
`create-server.ts` are scanned the moment they are written, with or without the `package.json` edits.

**Tier 1 (barrel re-export of a raw table) does not widen.** It stays on `nestedServiceRoots()`, exactly
as today. A *Service* barrel re-exporting a raw table hands every other package a door around the ACL;
`packages/db`'s barrel **is** the schema's public surface — it re-exports 43 tables by design
(`packages/db/src/index.ts:33-167`, one `export { … }` block) and every owning Service imports them from there. Widening Tier 1 to
top-level packages would fire on the one file that must do this. Only Tier 2 (ownership + completeness)
widens.

##### Reachability — the corollary, and why it is a defect report rather than an exemption

A file can only be *required* to route through `owner(T)` if its package may **import** `owner(T)`.
Measured at HEAD, every owning Service's transitive `dependencies` closure is exactly
`{@hyperidle/db, @hyperidle/shared}` — verified for all seven owners this WP touches (`users`, `knowledge`,
`org`, `work`, `routine`, `policy`, `run-orchestration`). Therefore:

- **every package in the repo except `packages/db` and `packages/shared` can comply in place**, including
  `packages/eval` (which already imports `@hyperidle/users`, `@hyperidle/settings`,
  `@hyperidle/core-api/session` and `@hyperidle/core-api/routines`), `packages/agent-orchestration/*`,
  `packages/core-api/*`, `packages/remote-server` and `packages/desktop`;
- **`packages/db` and `packages/shared` cannot** — `users → db` means `db → users` is a cycle.

**This is not an exemption; it is where the ACL is being evaded by layering.** A governed file sitting in
an unreachable package is a *finding about the file's location*, and the disposition is that **the code
moves up, never that the rule bends down.** `packages/shared/src` is already clean (zero owned-table
accesses at HEAD). `packages/db/src` is not: its two seeders are domain content living in the schema leaf,
and they relocate (increment **D2a**). After AU26 both packages hold zero owned-table accesses and the
guard proves it by scanning them like everything else — there is no special case in the guard, so there is
nothing for a future WP to widen.

##### The census, re-run over the real scope

Measured at HEAD with the guard's own `checkAccess` logic, `UNOWNED_SHARED_TABLES` deleted and this WP's
four new `TABLE_OWNER` rows applied, over every package's `src/` minus test files
(`.pipeline/work/AU26/probes/census/` reproduces it):

**803 files scanned · 379 findings · 100 file×table pairs · 48 files · 20 tables.**

| Region | Pairs | Files | Scanned today? | Disposition |
|---|---:|---:|---|---|
| `packages/core-api/src` (Layer) | 12 | 11 | **yes** (`inspect():604-630`) | `sessions` ×9 → §D-H sites 7–16, **D1**; `userSkills` ×2 (`routes/users.ts`, `services/routine-scheduler-bindings.ts`) + `propagationLog` ×1 (`server-factory.ts`) → **D2** |
| nested core-api + agent-orchestration Services | 10 | 8 | **yes** (`nestedServiceRoots()`) | `sessions` ×7 → §D-H sites 1–6 **plus the newly-found site 17 (`tool-handlers`)**, **D1**; `taskDispatchAttempts` ×1 (`policy/handoff-protocol.ts`) + `propagationLog` ×1 (`work/bet-kill-cascade.ts`) + `userSkills` ×1 (`settings/plugin-configuration.ts`) → **D2** |
| `packages/db/src` | 9 | 2 | no | **D2a** — seeders relocate above the Services |
| `packages/eval/src` | 69 | 27 | no | **D2b** — route through owning Services |
| `remote-server` / `remote-worker` / `desktop` / `web` / `shared` / `api-contract` / `design-system` `src` | **0** | 0 | no | nothing to do — and **now scanned**, so B1b's relocated `create-server.ts` is covered |

Round 2's "12 pairs / zero new work" was the first row only. The true figure is **100 pairs across 48
files**, of which **79 pairs in 30 files are work round 2 did not name** — the 21 it did name are the `core-api/src` 12 plus 9 of the 10 nested-Service pairs (§D-H sites 1–6 and the `settings`/`work` rows); `tool-handlers` is the tenth and was missed.

##### `packages/eval` — the exclusion is withdrawn

Round 2 excluded eval by the Application-closure principle and put the question to the founder as *"does
zero-exceptions govern scope, or only table carve-outs?"*. Round 3 answers it in the plan rather than
deferring it, because the two arguments round 2 rested on do not survive being written down next to
`factory-bootstrap.ts`:

- *"Forcing eval's seeding through owning Services would grow the surface AU20 shrank."* True, and it is
  the **same** cost `factory-bootstrap.ts` and `demo-fixture.ts` impose — which the WP is paying anyway
  under D2a. Paying it in one place and refusing it in the other is the carve-out, not the principle.
  D2a and D2b converge: eval's `seeding.ts` and the relocated `demo-fixture.ts` are the same act (stand a
  world up) and land on the same writers.
- *"An eval judge reading through a Service grades the system through the code under test."* This is the
  circularity argument the guard's `__tests__` skip encodes — **and it does not apply here.** An eval's
  system under test is the LLM, its tools, its prompts and the assembled context; the persistence Services
  are not being graded. `judges.ts` reading `work.get(db,"task",id)` is no more circular than any route
  test. (Contrast a *unit test of `work`*, where it genuinely would be — which is exactly why the guard
  skips test files and why eval, which is not a test file, gets no such pass.)

**Verdict: `packages/eval/src` is governed. Its 69 pairs across 27 files and 18 tables are real work,
scoped as increment D2b.** The largest concentrations are `judges.ts` (52 findings) and `seeding.ts` (34);
25 further files carry the rest (24 scenario files + `runner.ts`). `UNOWNED_SHARED_TABLES` and `assertDisjointOwnership` are **deleted**
(the invariant they guarded stops existing when one of the two sets does).

**Founder confirmation point, with its default stated (§12).** The founder is asked to *narrow* this, not
to widen it: *"zero exceptions is a standing ruling — AU26 reads it as governing scan scope, so
`packages/db`'s seeders relocate (D2a) and `packages/eval` routes through owning Services (D2b). Confirm,
or name the narrowing."* **Default if unanswered: proceed as written — D2a and D2b are in the plan.** A
standing founder ruling is not suspended by silence, and round 2's shape (default to excluding eval, ask
permission to include) inverted the burden.

### D-H · The `sessions` touches — 15 in core-api (6 Service + 9 Layer), plus one in agent-orchestration

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
  // AU26 additions — all readonly, all served by orchestration's own app
  getById(sessionId: string): Promise<AgentOrchestrationSessionRow | null>;
  listActive(): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  listByAgentIds(agentIds: readonly string[]): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  listByTaskId(taskId: string): Promise<ReadonlyArray<AgentOrchestrationSessionRow>>;
  latestOutcomeByTaskIds(taskIds: readonly string[]): Promise<Readonly<Record<string, string | null>>>;
}
```

Backed by GET routes on **orchestration's own app**, not core-api's.

**Two doors, deliberately, per §D-A rule 3.** `AgentOrchestrationPort` is the door for core **Layer** reads.
Core **Services** (`policy`, `work`, `review`) never touch it — they take Mechanism-C DI ports on their own
existing deps bag, wired by the Application. And **commands** (core asking orchestration to change its own
record) are direct downward function calls, never Port methods; the Port stays read-only, and
`agent-orchestration-port-readonly.integration.test.ts` stays green unmodified.

| # | Site | Verdict | Design |
|---|---|---|---|
| 1 | `policy/handoff-protocol.ts:120-124` — `tx.update(sessions).set({state:"done", endedAt})` inside policy's transaction | **the write does not belong in core; the *terminal state* does** | **Round-1 design WITHDRAWN — it was wrong on all three of its legs (traced at HEAD):** (a) the existing subscriber does **not** end the session — `start-runtime.ts:320-336` calls `ports.sessionLifecycle.requestAgentTermination`, and only if `findSessionRequest({by:"sessionId"})` returns a row; that transitions the *request*, never `sessions.state` (`transition-run.ts:39-51`). (b) The runtime path that *does* write the row (`endSession` → `updateSessionRow`, `transition-run.ts:365-380`) **emits `session_ended`** — which `handoff-protocol.ts:104-107` explicitly suppresses today (*"subscribers like `session-review-creator` must not fire on handoff"*), so round 1 would have created a spurious review item on **every handoff**. (c) The stated mitigation is false: `runtime-reapers.ts:180-183` reaps `state="active" AND routineId is not null` — **routine sessions only**; a handed-off task/agent session left `active` is never reaped. **Replacement design — core keeps the terminal state, orchestration keeps the write.** `PolicyDeps` gains `runOrchestration.endRunForHandoff(exec, sessionId, endedAt)`, exported by `run-orchestration`, wired by the Application (Mechanism C — §D-A rule 3's command form). Policy calls it **with the transaction handle** (`WriteExecutor`), so it is still same-transaction, still `{state:"done", endedAt}`, still **no `session_ended` emit** — the suppression decision now lives on the side that owns the suppression. The existing `session_handoff_completed` subscriber is **left exactly as it is**; it still tears down the live runtime loop, and the runtime's own `endSession` CAS (`state="active"`) finds zero rows and stays silent, exactly as today. **Net semantic change: none.** No eventual consistency, no reaper dependency, no review regression. `policy`'s `sessions` import is deleted |
| 2 | `work/bet-kill-cascade.ts:58-70` — selects active sessions per task, writes `state:"stopped"`, CAS-guarded, deliberately suppressing `session_ended` (`@lore` `:24`) | **need is core's, mechanism is not** | `work` calls a new orchestration operation `requestRunStopForTasks(db, taskIds, {reason:"bet_killed"})` — a downward call (§D-A rule 3), in-layer for orchestration, which owns the table and keeps the CAS + the `session_ended` suppression decision **on its own side**. It returns the stopped session ids so `work` still writes its `propagation_log` hop (through policy's port, §D-G). This is core sending a request, which is exactly AU21 §12's blind-executor contract — not orchestration reacting to core state |
| 3 | `work/work-service.ts:384` — `latestSessionOutcome` correlated subquery, sole caller `routes/bets.ts:378`, rendered as a status chip in `TaskSheet.tsx:422`/`WorkBet.tsx:105` | **rendering is not a use** | Delete the `include:"latestSessionOutcome"` branch and the `sessions` import from `work-service.ts`. `routes/bets.ts` composes at the route: `work.list(db,"task",{betId})` + `agentOrchestrationPort.sessions.latestOutcomeByTaskIds(ids)`, merged into the same response field. Route-level composition of two owned queries is the sanctioned decompose pattern (`runtime-simplification.md:167-172`). **The response shape is byte-identical → zero `packages/web` change.** Delete `work-service.ts:30-38`'s "foreign-import ceiling" `@lore` — the standing ruling is zero exceptions |
| 4 | `review/session-review-creator.ts:50-54` | **redundant, not legitimate** | Delete the read. All three fields it uses are already on `SessionEndedEvent` (`shared/src/events.ts:145,146,153`), and the sibling handler at `:137-141` already reads them straight off the event. Removes `review`'s only `sessions` import. Free |
| 5 | `realtime/ws-connection-hub.ts:204` | **topic authorization, not a core read** | §D-E — decomposed into orchestration's `getSessionSubscribeContext` + core's own participant/team checks; the `work` existence check deleted as FK-redundant |
| 6 | `policy/lifecycle-propagation.ts:288-293` — `select().from(sessions).where(taskId = ? AND state="active" AND id <> ?)`, gating the task `in_progress → review` transition at `:304` | **the read is core's need, the table is not** — **this site carried no verdict in round 1** | `PolicyDeps` gains `runOrchestration.countOtherActiveRunsForTask(exec, taskId, excludeSessionId): Promise<number>`, exported by `run-orchestration`, wired by the Application. A count is the whole need — the only consumer of the rows is `${n} other active session(s) still running` in the skip message (`:301`). Purpose-shaped, one method, no row shape crossing the boundary. Same DI bag as site 1, so both land in one edit |
| 7–15 | the nine core-api **Layer** readers | **display decoration, except two** | `routes/{status,users,recipients}.ts` → `port.sessions.listActive()`; `routes/{agent-profile,teams-routes,threads}.ts` → `port.sessions.listByAgentIds()`; `routes/agents.ts` → `listActive()` for the per-agent count and the delete/deactivate gate. The two that are **not** decoration: **`routes/tasks.ts`** keeps *both* its uses core-hosted (§D-A re-derivation) — `GET /:id/sessions` reads through `port.sessions.listByTaskId()` behind its unchanged `work.get` 404 gate (`:187-191`), and `POST /:id/handoff` (`:296-326`) stops hand-building a `SessionContext` from a raw row: it calls `buildHandoffRunContext(db, sessionId)` downward, which moves the `sandboxSnapshot` fallback sentinel (`:310-311`), the no-op `ingestion` handle (`:317-321`) and the hard-coded `traceId: ""` (`:325`) onto the side that owns `SessionContext`; and **`routes/sessions-routes.ts`** is **split, not moved** — see #16 |
| 16 | `routes/sessions-routes.ts` — 5 registrations (`:321 GET /`, `:352 POST /`, `:512 GET /starts/:startId`, `:529 GET /:id/activity`, `:557 PATCH /:id`) | **four move, one stays** | See the split below |
| 17 | `packages/agent-orchestration/tool-handlers/src/tool-definitions.ts:23,519-522` — the `write_session_notes` tool does `ctx.db.update(sessions).set({notes}).where(eq(sessions.id, ctx.sessionId))` | **a 16th toucher, in agent-orchestration, absent from rounds 1 and 2** | Surfaced by round 3's honest census (§D-G). `tool-handlers` is an agent-orchestration Service but it is **not** `run-orchestration`, so the ACL binds it exactly as it binds a core-api Service — the `@lore` at `:483` (*"`sessions` is `UNOWNED_SHARED_TABLES` — direct access is legal"*) is the exemption D2 deletes. `run-orchestration` exports `recordSessionNotes(exec, sessionId, notes)`; `tool-handlers` calls it as a lateral in-layer Service call (the sanctioned within-layer mechanism — no Port, no upward edge). Delete the `sessions` value import and the `@lore`. **Lands in D1**, with the other 15 |

#### #16 in full — why `sessions-routes.ts` **cannot** move wholesale, and how it splits

**Round-1 design WITHDRAWN.** Round 1 said this file "moves wholesale to orchestration-api." It cannot. Its
import block (`:1-33`) is:

```ts
import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import { readServerConfig } from "@hyperidle/settings";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
```

`@hyperidle/work`, `@hyperidle/users` and `@hyperidle/settings` are **core-api Services**, and all five symbols
are called inside `POST /`'s `db.transaction` (`:396-424`). Moving the file would make `agent-orchestration`
import core-api Services — the exact violation this WP exists to delete — and
`scripts/composition-edge-anti-regrowth-guard.ts` (verified at HEAD: `DEFERRED_FOLLOWUP = new Set([])` at
`:417`, `ALLOWLIST`/`STATELESS_METHODS` absent) would fire on it. Round 1's §2 blast-radius item 4 named only
the *middleware* stack as Job 2's blocker; the real blocker is this.

**The split, per route, derived from §D-A rules 2–3 with the handler bodies open. Paths do not change
(rule 7).**

| Registration | Tables touched | Host | What the builder does |
|---|---|---|---|
| `:321` `GET /` (list, `?task_id=&agent_id=&state=`) | `sessions` | **orchestration** | moves verbatim; in-layer read replaces the `@hyperidle/db` import |
| `:352` `POST /` | `tasks` + `users` + `server_config` + `explicit_session_starts` + `agent_work_intents` + `sessions` | **core-api — stays** | see below |
| `:512` `GET /starts/:startId` | `explicit_session_starts` + `sessions` | **orchestration** | the *route* moves; the projection triple does **not** move with it — it is shared with `POST /`, see "the projection triple" below |
| `:529` `GET /:id/activity` | `sessions` + the agent-execution activity buffer | **orchestration** | moves, and **drops the `AgentOrchestrationPort` indirection** (`:536-539`) — the buffer is in-layer for orchestration, so the port hop is pure overhead once the route is on the right side |
| `:557` `PATCH /:id` (incl. the abort branch, `applyStateChangePatch` CAS `:259-263`) | `sessions` + `agent_session_requests` + `sessionRunRegistry` | **orchestration** | moves with `applyStateChangePatch`, `updateSessionSchema`, and the `transitionRun` call (which becomes in-layer, dropping `services/run-orchestration-composition.ts`) |

Four registrations land in `packages/agent-orchestration/src/routes/sessions.ts`. **`POST /api/sessions` stays
in `packages/core-api/src/routes/sessions-routes.ts`**, which shrinks to that one handler and **sheds its
`sessions` table import entirely**. It keeps only imports it is already entitled to: core Services
(`work`/`users`/`settings`) and the two sanctioned downward calls into orchestration Services
(`@hyperidle/session-requests`' `createSessionRequest`/`findSessionRequest`, already imported by core-api at
`app.ts:28`). Its two remaining raw-`sessions` touches are replaced:

- `projectExplicitStart`'s row read (`:63-68`) → `port.sessions.getById(start.sessionId)` (a read → the Port);
  **the returned shape must be the full session wire row, not a narrowing** — see below;
- the legacy bare-insert path (`:481-499`, fires only when `!durableStartEnabled` and no `Idempotency-Key`) →
  `createBareRun(db, eventBus, { agentId, taskId, modelTier })`, a new `run-orchestration` export owning the
  insert **and** the `session_started` emit (a command → a downward call).
  `@hyperidle/run-orchestration` is **already** a core-api dependency, so no package edge is added.

E3/F2 shrink this handler further: `resolveInjectedConnectionsForAgent` and
`resolveInjectedFilesystemsForAgent` are **deleted** from the bake (orchestration reads its own tables
in-layer at provisioning), leaving `requireRunnableAgent` + `readServerConfig` as the only Service deps
`resolveSessionStartRequest` still takes.

**The projection triple — one home, named, because both apps need it (round-2 W1).** Round 2's table said
`GET /starts/:startId` *"moves with `projectExplicitStart`/`pendingStart`/`sendStartProjection`."* It cannot:
`POST /` — which stays core-hosted — calls `projectExplicitStart` at `:439`, `:460`, `:464` and
`sendStartProjection` at `:440`, `:482`, `:521`. Duplicating the triple would give one wire shape two
implementations (the 202/422/429/500 projection AC5(b) asserts is byte-identical), and `tsc` catches an
outright omission but never silent divergence. The single home, split by what each piece actually needs:

| Piece | Home | Why |
|---|---|---|
| `pendingStart(start)` (`:48-58`) + the failure-code→status map (`:69-79`) | **`@hyperidle/shared/http`**, as one pure function `projectExplicitStartOutcome(start, session \| null) → { status, body }` | Zero table access — it is a pure transform over rows the caller already holds. `shared` is the only package both apps may import, and A1 is already creating `@hyperidle/shared/http` |
| `sendStartProjection(c, projection)` (`:84-100`) | **`@hyperidle/shared/http`**, beside it | Pure Hono; `Context<HyperIdleEnv>` lands in `shared/http` in A1 anyway |
| the `sessions` row read | **stays with each caller** | orchestration's `GET /starts/:startId` reads in-layer; core's `POST /` reads through `port.sessions.getById` |

Neither app imports the other's route module, so AC5(a)'s static guard is unaffected.

**A shape hazard this exposes, stated because it would silently break AC5(b).** `projectExplicitStart`'s
202 branch returns the **whole raw `sessions` row** (`:65`, `return { status: 202, body: session }`), which
has 18 columns (`schema.ts:221-270`). §D-H's draft `AgentOrchestrationSessionRow` has **seven**. If
`port.sessions.getById` returns the narrowing, `POST /api/sessions`'s 202 body loses 11 fields — a wire
regression no route test in the checklist would catch, since no `packages/web` file consumes this response
(verified: `rg -a 'api/sessions' packages/web/src` returns only the `?task_id=` list and the `/activity`
hook). **Decision: `getById` returns the session's full public wire shape, declared once in
`api-contract` as `AgentOrchestrationSessionWireRow` and reused by orchestration's own `GET /` list
handler** (which returns raw rows today and keeps doing so, in-layer). The narrowed 7-field row stays for
`listByAgentIds`/`listByTaskId`/`listActive`, whose consumers are decoration. **AC5(d)** asserts the
`POST /api/sessions` 202 body is byte-identical to HEAD.

**Why not move `POST /` too, with a `taskExists` reader injected?** Because that is an
`agent-orchestration → core-api` read by any honest reading — the identical construction §D-A rejects for
`FilesystemInjectionValidator`. Applying the rule to one and not the other is exactly the post-hoc
rationalization this revision exists to remove.

**Consequence for the split family.** `/api/sessions/*` is now served by **two** apps (core: `POST /`;
orchestration: the other four). Feasibility P1 proves two sub-apps mounted at the same prefix both route, so
this works — but it makes a duplicate `method + path` across the apps resolve silently by registration order.
Closed by **AC12**'s route-table collision assertion, which is cheap and mechanical.

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
`createAgentOrchestrationApp()`. Traced at HEAD, `routes/connections.ts` imports no `@hyperidle/users`, no
`teamMembers` and no `work` — its table set is `service_connections` alone, so §D-A rule 2 (not rule 3)
decides it, single-sided. The planned `AgentOrchestrationPort.connections` read family is **not built**
(core-ui dials orchestration-api directly for connections, so there is nothing for a read door to serve);
J7's deletion of `CoreApiPort.connections` stands.

**The paths do not change** (§D-A rule 7): the routes stay at `/api/connections`, `/api/connections/:id`,
`/api/connections/:id/validate`, served by the other app. Round 1 re-prefixed them to
`/api/agent-orchestration/connections*` and paid for it with a `SettingsConnections.tsx` diff — an
unnecessary wire-contract change, now withdrawn.

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
   and core's existing `listFilesystemsByIds`. `GET /api/filesystems?agentUserId=` stays core-hosted **by §D-A rules 2/3**
   — its handler touches `filesystems` (core) and, post-F2, `filesystem_injections` (orchestration), so it is
   two-sided and has exactly one legal host. *(Round-2 W2: this sentence used to read "it renders core
   `filesystems` rows" — the rendering argument `requirements.md:42` outlaws, withdrawn by name in §D-A but
   left standing here. A builder working the filesystems split reads this section, not §D-A.)* It composes
   the two at the route, and returns the **identical**
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

**Backfill invariant (written, not left as a risk).** `users.max_concurrent_sessions` is
`integer NOT NULL DEFAULT 1` at HEAD (`schema.ts:62`); the other five moved `users` columns and all three
`teams` columns are **nullable with no default**. The new tables mirror that exactly
(`max_concurrent_sessions integer NOT NULL DEFAULT 1`, everything else nullable). The invariant the migration
must satisfy:

> For every existing `users` row with `kind='ai'`, the migration inserts exactly one `agent_run_config` row
> carrying the current column values verbatim — including `max_concurrent_sessions` (never re-defaulted).
> For every existing `teams` row, exactly one `team_run_config_defaults` row, same rule. An agent whose
> run-config columns are **all null** must, after the migration, resolve the *identical* effective config it
> resolved before (harness eligibility, model tier, concurrency) — the defaults live in the resolvers, not in
> the columns, and none of them move.

**Rollback: forward-only, deliberately.** The migration drops 11 columns; there is no down-migration and none
is written. This is stated rather than implied because `desktop` ships as versioned releases against a local
PGlite directory — a user on the new release cannot roll the app back onto the old schema. The mitigation is
the pre-release smoke against a real populated local DB (§11 risk 4), not a reverse migration.

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

// packages/agent-orchestration/run-orchestration — sessions ownership (D1)
// Every one of these is a DOWNWARD call from core-api. None is an AgentOrchestrationPort method.
export function getSessionSubscribeContext(exec: WriteExecutor, sessionId: string):
  Promise<{ taskId: string | null; sourceKind: string | null; sourceCorrelationJson: string | null } | null>;
export function requestRunStopForTasks(exec: WriteExecutor, taskIds: readonly string[],
  opts: { reason: "bet_killed" }): Promise<{ stoppedSessionIds: string[] }>;
/** §D-H #1. Takes the caller's tx handle: the write stays in policy's handoff transaction.
 *  Writes {state:"done", endedAt} and deliberately emits NO session_ended — the suppression
 *  decision (handoff-protocol.ts:104-107) moves to the side that owns the table. */
export function endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;
/** §D-H #6. A count is the whole need — the rows are never read. */
export function countOtherActiveRunsForTask(exec: WriteExecutor, taskId: string,
  excludeSessionId: string): Promise<number>;
/** §D-H #7-15. Owns the sandboxSnapshot fallback sentinel, the no-op ingestion handle and traceId. */
export function buildHandoffRunContext(exec: WriteExecutor, sessionId: string):
  Promise<SessionContext | null>;
/** §D-H #16. The legacy no-adapters path of POST /api/sessions: owns the insert AND the
 *  session_started emit. */
export function createBareRun(exec: WriteExecutor, eventBus: EventBus,
  v: { agentId: string; taskId: string; modelTier: ModelTier }): Promise<SessionRow>;

// packages/core-api/policy/src/ports.ts — PolicyDeps gains ONE bag (Mechanism C, wired by the Application)
export interface PolicyDeps {
  // … existing work / conversation / … bags unchanged
  readonly runOrchestration: {
    endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;
    countOtherActiveRunsForTask(exec: WriteExecutor, taskId: string, excludeSessionId: string): Promise<number>;
  };
}
```

**Barrel discipline (Mechanism A):** every new SQL-owning Service barrel exports typed functions only — never
`serviceConnections`, `filesystemCaptures`, `filesystemInjections`, `sessions`, `agentRunConfig`.

---

## 5. Route checklist

**Regenerated from the actual registrations, not from prose.** Round 1's table was wrong on 3 of 5 rows for
the sessions family — it listed `GET /api/sessions/:id` and `POST /api/sessions/:id/abort`, **neither of
which exists**, and omitted `PATCH /api/sessions/:id` (the file's only real mutation) and
`GET /api/sessions` (live caller: `packages/web/src/pages/Conversations.tsx:118`). Verified at HEAD:
`rg -an 'router\.(get|post|patch|delete|put)\(' packages/core-api/src/routes/sessions-routes.ts` returns
exactly `:321 GET /`, `:352 POST /`, `:512 GET /starts/:startId`, `:529 GET /:id/activity`, `:557 PATCH /:id`.
(The string `GET /api/sessions/:id` does appear in the repo — in `applyStateChangePatch`'s 202 message at
`:211`, telling the caller to poll a route that does not exist. Out of scope here; noted so nobody "restores"
it.)

**Every path string is unchanged** (§D-A rule 7). What changes is which app serves it.

| Route | Serving app after AU26 | From | Web change |
|---|---|---|---|
| `GET /api/sessions` | **orchestration** | `core-api/src/routes/sessions-routes.ts:321` | **none** — same URL (`Conversations.tsx:118`) |
| `POST /api/sessions` | **core-api (stays)** | `:352` | none |
| `GET /api/sessions/starts/:startId` | **orchestration** | `:512` | none (no web caller) |
| `GET /api/sessions/:id/activity` | **orchestration** | `:529` | **none** — same URL (`useSessionActivity.ts:150`). This is validation scenario 4's HTTP half, closed |
| `PATCH /api/sessions/:id` | **orchestration** | `:557` (incl. the abort branch via `applyStateChangePatch`) | none (no web caller) |
| `GET /api/agent-orchestration/sessions` | **orchestration** | `core-api/src/routes/agent-orchestration-sessions-routes.ts:71` | none (port-internal) |
| `GET /api/agent-orchestration/sessions/:sessionId/activity` | **orchestration** | same file, `:100` | none |
| `GET /api/tasks/:id/sessions` | **core-api (stays)** ⟵ *reversed from round 1* | `routes/tasks.ts:186` | **none** — `useTaskSessions.ts` untouched |
| `POST /api/tasks/:id/handoff` | **core-api (stays)** | `routes/tasks.ts:~285` | none |
| `GET/POST/DELETE /api/connections`, `POST /api/connections/:id/validate` | **orchestration** | `core-api/src/routes/connections.ts:195,230,330,364` | **none** ⟵ *changed from round 1*: the path stays `/api/connections*`, so `SettingsConnections.tsx` is untouched |
| `GET/PATCH /api/observability*` (4) | **DELETED** | `routes/observability-routes.ts` | none (zero callers) |
| `GET/PATCH/POST /api/git-export*` (4) | **DELETED** | `routes/git-export-routes.ts` | none (zero callers) |
| `GET /api/filesystems`, `GET /api/filesystems/:id`, `POST /api/filesystems`, `DELETE /api/filesystems/:id`, `POST /:id/injections`, `DELETE /:id/injections/:agentUserId` | **core-api (stay)** | `routes/filesystems.ts:180,250,266,299,313,328,408` | **none**, decomposed internals only (§D-K) |
| `PATCH /api/agents/:id`, assistant PATCH | **core-api (stay)** | unchanged host, persist delegated down (§D-A) | **none** |
| `/api/ws` (user WS) | **core-api (stays)** — §D-E, validation scenario 4's WS half, explicitly narrowed | `app.ts` pre-auth hook | none |
| `/api/ws/worker`, MCP bridge | **orchestration** (Application registers pre-auth) | `app.ts` hooks | none |

**Net `packages/web` diff for this WP: zero files.** Round 1 allowed three (`useTaskSessions.ts`,
`SettingsConnections.tsx`, `useSessionActivity.ts`) and missed a fourth (`Conversations.tsx:118`). Holding
every path string constant removes all four. AC7(c) is tightened accordingly.

**Guard obligation:** every route file that moves to `packages/agent-orchestration/**/routes/**` must keep its
`requireBoundary({...})` declaration, and `eslint.config.ts:514-531`'s `files` glob must be extended from
`packages/core-api/src/routes/**/*.ts` to also cover `packages/agent-orchestration/**/routes/**/*.ts` —
otherwise the AF11 rules silently stop covering the moved routes.

**Collision obligation (new, forced by rule 7):** with both apps mounted at `/api` and `/api/sessions/*` split
across them, a duplicate `method + path` would resolve silently by registration order instead of erroring.
**AC12** asserts the merged route table has no duplicate `method + path` pair.

## 6. Security & abuse cases

| Case | Applicable? | Addressed |
|---|---|---|
| **Auth on relocated routes** | **YES — the highest-risk item in this WP.** A route that moves to a second app could land outside the auth middleware | The Application applies the stack on the shared `/api` router **before** mounting either app. Feasibility P1 proves it covers both. **Test: an unauthenticated request to each moved route returns 401** — a real integration test per moved route family, against the routes that exist: `GET /api/sessions`, `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id`, `GET /api/connections`, `POST /api/connections`, `DELETE /api/connections/:id`, `POST /api/connections/:id/validate`, `GET /api/agent-orchestration/sessions`. *(Round 1 named `/api/sessions/:id` and `/api/agent-orchestration/connections` — neither exists.)* Not an assumption |
| **AF11 boundary declarations** | YES | Route checklist above + the eslint glob extension. `failClosedAssertion()` stays on the shared router, so an undeclared moved route throws in dev/test exactly as today |
| **Rate limit on state-changing endpoints** | YES | Applied on the shared `/api` router (`app.ts:346-356`), inherited by both apps. `POST /api/connections`, the abort write, and the injection writes all keep their bucket |
| **Secret handling — held connection tokens** | YES | AN1 hard-rule 1 unchanged: `encryptedToken` never leaves the resolver; `resolveInjectedConnectionsForAgent`'s byte-for-byte response shape is deleted **with** its bake, and the in-layer read replaces it. Per-user isolation (cross-user resolve → `null`, hard-rule 3) is a retained test |
| **Secret handling — crypto primitive move (J1)** | YES | Re-discharge AU21 J3's proof obligation at build time: confirm the key source (`HYPERIDLE_CREDENTIAL_KEY`/`HYPERIDLE_API_KEY` via HKDF) carries no DB read before moving; if it does, only the pure crypto moves and the secret is passed in. Round-trip test against a fixed key+plaintext must match pre-move output |
| **Path traversal** | YES — the mount engine moves | `SANDBOX_SCAFFOLDING_PATHS` and the four adapters move **unchanged**; the relocation is a package move, not a rewrite. Existing adapter tests move with them and must stay green |
| **SSRF** | YES — `lsRemote`/`clone` take a user-supplied URL | `createGitRunner`'s hardened env allow-list and 15-verb whitelist move **verbatim** to `@hyperidle/shared/git`. No behaviour change; its tests move with it |
| **WS subscribe authorization** | YES — the authorizer is rewired | The `session:` branch keeps fail-closed semantics: unknown session → `false`. The only deletion is the FK-redundant task existence check (feasibility P4). **Test: subscribing to `session:<nonexistent>` still denies** |
| **Route shadowing across the two apps** | YES — new class, created by §D-A rule 7 | `/api/sessions/*` is served by two apps at the same prefix. A duplicate `method + path` would be shadowed silently by registration order — including, in the worst case, a moved route landing behind a stale core-api registration that never got deleted. **AC12**: assert the merged route table has zero duplicate `method + path` pairs, and that `GET /api/sessions/:id/activity` resolves to orchestration's handler |
| **Input trust on agent-authored fields** | N/A | This WP moves code; it introduces no new agent-authored input field |
| **New credential surface** | N/A | No new credential type. `server_credentials` stays core (`@hyperidle/credentials`), explicitly not re-litigated |
| **Privilege change from the `sessions` ownership move** | YES | *Round-1 correction: there is no `POST /api/sessions/:id/abort` route — abort is a branch of `PATCH /api/sessions/:id` (`applyStateChangePatch`, CAS at `:259-263`).* `PATCH /api/sessions/:id` keeps its exact `requireBoundary({kind:"public-data"})` declaration and auth on the new host. **Tests: PATCH by an unauthenticated caller → 401; PATCH on an already-terminal session → 409 (`:181-190`, unchanged); PATCH on a live-runtime session → 202 (`:206-214`, unchanged)** |

---

## 7. Acceptance criteria

Mapped to `plan.md`'s seven ACs (AC1–AC7); AC8–AC16 are this doc's own additions. **Numeric order is reading order** — round 2 listed AC11 between AC13 and the end, which read like a missing AC; it is now AC16 and lands last. Every criterion names its verification.

| # | Criterion | Verification |
|---|---|---|
| **AC1** | `serviceConnections` has exactly one Service importer (`packages/agent-orchestration/connections`); no core-api Service touches the table; K1's bake is gone | (a) `table-ownership-guard` `TABLE_OWNER.serviceConnections = "packages/agent-orchestration/connections"` and `npm run lint` fails on a fixture core-api Service importing it; (b) `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` and its 8 wiring sites do not exist — a `tsc` failure if any caller survives; (c) **integration test**: add a held connection AFTER an intent is emitted and BEFORE it drains → the connection is provisioned at spawn (proves the in-layer live read, and would FAIL against the bake) |
| **AC2** | All 15 core-api Services have an evidenced whole-service verdict; the reverse direction confirmed once | The three `service-verdicts/*.md` files + `git-export-rechallenge.md` + §D-N of this doc. Static artefact — no test. `/architecture-critique` checks completeness against the 15-name list in requirements §3 |
| **AC3** | Part-level verdicts for the mount engine, the `users` columns, and `WsConnectionHub` | §D-E, §D-K, §D-L. Static artefact |
| **AC4** | The mount engine relocates; record + probe resolved separately | (a) `packages/core-api/filesystems/src/mounter-registry.ts` gone, `packages/agent-orchestration/filesystem-mounting/` present; (b) `TABLE_OWNER.filesystemCaptures` points at it and the guard fails a core-api fixture importer; (c) `filesystems` still owns `filesystems` and the knowledge-scope gate test (`routes/knowledge.ts:565` 400-without-scopeId) stays green |
| **AC5** | Orchestration hosts its own session/harness-streaming routes; documented `WsConnectionHub` verdict | (a) **static** — an import guard (extend `scripts/composition-edge-anti-regrowth-guard.ts` with a `core-api → agent-orchestration route module` check) fails if any file under `packages/core-api/src` imports a module under `packages/agent-orchestration/**/routes/**`; `app.ts` no longer imports `agent-orchestration-sessions-routes.js`; (b) **integration tests** hitting the four routes that actually exist and actually move — `GET /api/sessions?task_id=&state=`, `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id` — plus `GET /api/agent-orchestration/sessions?...`, through the Application-mounted app, asserting status + body byte-shape unchanged against the pre-move baseline. *(Round 1 named `GET /api/sessions/:id`, which does not exist — a builder writing to it could not have made it pass honestly.)*; (c) 401 on each without auth; (d) **`POST /api/sessions`'s 202 body is byte-identical to HEAD** — the explicit-start projection returns the full session wire row, not `AgentOrchestrationSessionRow`'s 7-field narrowing (§D-H #16, "a shape hazard") |
| **AC6** | Every relocate verdict is executed here, none parked | The increment table in §12 covers connections, mount engine, captures, injections, `users`+`teams` columns, `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `observability`, `realtime`, `git-export`, `harness-capability-read-model`, `createGitRunner`. Verified by: `UNOWNED_SHARED_TABLES` does not exist; `packages/core-api/{observability,realtime,git-export}` do not exist; `npm run knip` reports no new dead exports |
| **AC7** | Settings + live session activity behave identically; no frontend behaviour change | (a) route-level integration tests **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, **read as painted output** (`npx playwright screenshot` + read the PNG); (c) **`git diff --stat packages/web` is EMPTY.** Tightened from round 1's "exactly three files may change" — which also missed a fourth (`pages/Conversations.tsx:118`, `/api/sessions?task_id=`). §D-A rule 7 holds every path string constant, so no web file has any reason to change. A non-empty web diff is a **failed** AC, not an allowance |
| **AC8** *(cross-cutting — the zero-exceptions bar)* | **Neither guard names a table or a package.** No table-level carve-out, no allowlist, no exemption set, no unowned-table set, **no scope carve-out** — in either guard. The scan scope is *the whole workspace* | (a) `scripts/table-ownership-guard.ts` contains no `UNOWNED_SHARED_TABLES`, no `assertDisjointOwnership`, and **no package-name literal anywhere in its scan logic** — `rg -a '"packages/core-api/src"|"eval"|dependencies' scripts/table-ownership-guard.ts` returns zero; (b) its Tier-2 scan roots are `src/` of **every** package under `packages/` carrying a `package.json`, and a fixture test proves a newly-created package is scanned with **no** guard edit and **no** `package.json` dependency edit (§D-G); Tier 1 stays on `nestedServiceRoots()` — asserted, with the reason (`packages/db`'s barrel legitimately re-exports 43 raw tables); (c) **`inspect()` returns zero findings on the real tree** — reachable only because D2a and D2b close the `packages/db` (9 pairs) and `packages/eval` (69 pairs) regions first; (d) `scripts/composition-edge-anti-regrowth-guard.ts` keeps `ALLOWLIST`/`STATELESS_METHODS`/`isStatelessProvider` absent and `DEFERRED_FOLLOWUP` empty (verified at HEAD: `:417` `new Set([])`); (e) fixture tests prove each guard **fires** on a would-be violation of the class it used to exempt, including one inside `packages/agent-orchestration/src` and one inside `packages/remote-server/src` |
| **AC9** *(new)* | `packages/eval`'s subpath imports survive | `npm run check` green with `packages/eval` importing `@hyperidle/core-api/session` and `@hyperidle/core-api/routines` unchanged; both subpaths still declared in `packages/core-api/package.json` |
| **AC10** *(new)* | Unknown `/api/*` still returns the canonical `ApiErrorResponse` JSON 404 | **Integration test**: `GET /api/definitely-not-a-route` → 404 with `{ error, code: NOT_FOUND }` and `content-type: application/json`. Guards feasibility P1's `notFound` trap |
| **AC12** *(new — forced by §D-A rule 7)* | The two mounted apps do not shadow each other | **Integration test**: enumerate the merged route table on the Application-composed instance and assert (a) zero duplicate `method + path` pairs across `coreApiApp` and `orchestrationApp`; (b) `GET /api/sessions/:id/activity` and `GET /api/sessions` resolve to orchestration's handlers while `POST /api/sessions` resolves to core's (assert via a handler-identifying header or a distinguishing body field the test sets up) |
| **AC13** *(new — closes validation scenario 4 honestly)* | Scenario 4's two halves are separately proven, and the WS narrowing is on the record | (a) **HTTP half, CLOSED**: an integration test proves `GET /api/sessions/:id/activity` is served by orchestration's app (AC12(b) covers the routing assertion) and returns a body byte-identical to the pre-move baseline; (b) **WS half, NARROWED**: this doc's §D-E states the narrowing and its reasoning explicitly, and the founder confirms or rejects it at the realtime confirmation point before C3 (§12). **A silent pass is a failed AC — but silence is not a block.** If no founder answer arrives, C3 proceeds **narrowed**, and the run must record the narrowing as `accepted-pending-review` in `.pipeline/work/AU26/progress.json` and append it to `.pipeline/AU.md`. The AC is satisfied by the narrowing being *recorded and visible*, never by it being unmentioned |
| **AC14** *(new — the goal metric, gated per increment)* | The ACL-violation count reaches **zero** by measurement, not by scope | `scripts/table-ownership-census.ts` (checked in by **D0**, wave 0) prints file×table pairs under the **target** scope — whole workspace, `UNOWNED_SHARED_TABLES` deleted, all four new owners applied — **without failing the build**. Baseline at HEAD: **100 pairs / 48 files / 20 tables**. Every increment from D0 on reports the number in its PR body and it must **strictly decrease**. The full countdown, which sums to exactly 100: D2a −9 (`packages/db/src`), D1 −16 (all `sessions` pairs outside eval), D2b −69 (`packages/eval/src`), D2 −6 (`propagationLog` ×2, `taskDispatchAttempts` ×1, `userSkills` ×3) → **0**, at which point D2 flips the guard's default scope. *(This exists because the round-2 census was wrong by 88 pairs and nothing measured it — the AU20 lesson: gate on the goal metric, not on green.)* |
| **AC15** *(new — the reachability corollary has teeth)* | `packages/db/src` and `packages/shared/src` hold **zero** owned-table accesses | They are scanned like every other package (no special case in the guard), so `inspect()` covering them **is** the assertion. `packages/shared/src` is already at zero; D2a brings `packages/db/src` there by relocating `factory-bootstrap.ts` + `demo-fixture.ts` above the Services. **Behavioural guard, not just static:** `packages/db/src/__tests__/AF17-factory-bootstrap.integration.test.ts`, `AF17-demo-fixture-guard.test.ts`, `AF17-factory-isolation.integration.test.ts`, `AK6-factory-roster.integration.test.ts` and `seed.integration.test.ts` move with the code and stay green **unweakened**, and the desktop first-boot path is smoke-tested against a real populated local DB (same bar as G1's migration — v0.6.0's PGlite hang is the precedent) |
| **AC16** | Whole-change correctness | `npm run verify` |

---

## 8. Migrations (renames / removals / moves — every call-site family)

| Change | Sites | Step |
|---|---|---|
| `createApp` → `createCoreApiApp` | `app.ts:305,743`; `server-factory.ts:1124`; `test-fixtures.ts:49`; `test-utils.ts:13`; 11 `*.integration.test.ts` under `packages/core-api` | rename |
| `createServer` → `@hyperidle/remote-server/create-server` | `remote-server/src/index.ts:22,36`; `desktop/src/boot-server.ts:15-18,30`; `web/scripts/{ah1:27/62, ah5:37/140, ah6:45/250}-test-server.ts`; 8 test files (incl. `packages/desktop/__tests__/boot-server.test.ts` and `agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts`) | move + re-point |
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
| the `/api/observability*` **surface inventory** (S1 — round 1 omitted these three and C2 would have failed verify on them) | `routes/status.ts:41` (a doc comment naming `/api/observability/config`); `src/__tests__/api-availability.integration.test.ts:39` (`{ path: "/api/observability", description: "Observability" }` in the enumerated surface list); `src/__tests__/api-e2e.integration.test.ts:732,856,865,874` (three route tests + one comment) | delete with C2 |
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
  - packages/core-api/src/__tests__/handoff-to.integration.test.ts          # §D-H #1: the run row must be terminal at
                                                                            # commit, and NO session_ended / review item
  - packages/core-api/src/__tests__/af7-handoff-revokes-tools.test.ts        # §D-H #1: the runtime-teardown half
  - packages/core-api/src/__tests__/lifecycle-propagation.integration.test.ts # §D-H #6: a sibling active run must still
                                                                            # block in_progress → review
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
  - packages/core-api/policy/src/ports.ts                      # D1 (PolicyDeps.runOrchestration bag)
  - packages/core-api/src/routes/sessions-routes.ts            # B1a (splits), D1
  - packages/agent-orchestration/src/routes/                    # B1a creates; D1, E4 add
  - packages/api-contract/src/agent-orchestration-port.ts      # D1
  - packages/api-contract/src/core-api-port.ts                 # E3 (J7 deletion)
  - packages/shared/src/agent-work-intent-recorder.ts          # E3, F2, G1 (the bake shape)
  - scripts/table-ownership-guard.ts                           # D1, D2, E4, F1, F2, G1
  - scripts/table-ownership-census.ts                          # D0 creates; every later increment reports it
  - packages/agent-orchestration/package.json                  # B1a — declares NO dependencies today; load-bearing for the build
  - packages/agent-orchestration/src/index.ts                  # B1a — `export {}` today
  - packages/remote-server/package.json                        # B1b — gains @hyperidle/agent-orchestration + db
  - packages/desktop/package.json + src/main.ts                # B1b (createServer re-point), D2a (bootstrap re-point at main.ts:451-454)
  - packages/db/src/{factory-bootstrap,demo-fixture,seed,setup-cli,seed-pg-cli,bootstrap-pg,index}.ts  # G1 strips columns, D2a relocates
  - packages/eval/src/{seeding,judges}.ts + scenarios/         # D2b
  - packages/eval/package.json                                 # D2b — gains the owning-Service deps
  - package.json (root scripts: setup, db:seed:pg, db:bootstrap:pg)  # D2a re-points the three CLI entry paths
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
   Application's wiring. Rationale — and the **corrected** cost of the rejected alternative, plus the
   child-process option round 1 missed — are in §D-C. Flagged for the reviewer; if rejected, take the
   duplication at its true post-B1a cost — do **not** resolve it with a new package, and do **not**
   resurrect `HYPERIDLE_PROFILE`.
2. **~~D1's handoff change is a real semantics change.~~ WITHDRAWN — there is no semantics change.**
   Round 1 planned to delete policy's terminal write and let the existing `session_handoff_completed`
   subscriber end the run. That was wrong on all three legs (traced in §D-H #1): the subscriber only
   requests *request* termination and only when a request row exists; the runtime path that does write the
   row emits `session_ended`, which handoff deliberately suppresses so `session-review-creator` does not
   fire — round 1 would have created a spurious review item on **every handoff**; and
   `runtime-reapers.ts:180-183` reaps `routineId is not null` only, so the "already reaps stale-active runs"
   mitigation did not exist. **The replacement keeps the write in policy's transaction and moves only its
   ownership**, via `PolicyDeps.runOrchestration.endRunForHandoff(tx, …)`. Same transaction, same terminal
   state, same event suppression, no reaper dependency. **Nothing is accepted as a risk here any more**, and
   the founder confirmation point for D1 drops "the handoff semantics change" (§12).
3. **B1b is the largest single PR** even after the B1a split. If it exceeds a builder session, split further
   at the `registerCoreDomainServices` / `registerAgentLayerServices` seam (each moves into its own Layer boot
   independently, with `server-factory` still calling both).
4. **G1's backfill.** Every existing agent row must get an `agent_run_config` row; agents with all-null
   run-config must still resolve defaults identically. The `desktop` upgrade path is the risk (v0.6.0's PGlite
   hang is precedent) — the migration must be smoke-tested against a real populated local DB, not only the
   test suite.
5. **~~`packages/eval` is out of the guard's derived scan scope.~~ WITHDRAWN in round 3 — there is no
   derived scope and no exclusion.** The scan is the whole workspace (§D-G). Measured honestly, the ACL
   region is **100 file×table pairs across 48 files and 20 tables**, of which **78 pairs in 29 files were
   unnamed by round 2**: `packages/eval/src` (69 pairs / 27 files → **D2b**), `packages/db/src`'s two
   seeders (9 pairs / 2 files → **D2a**), and `tool-handlers/tool-definitions.ts`'s `sessions` write
   (§D-H site 17 → D1). **What remains a real risk is not the scope but D2a**: `applyFactoryBootstrap`
   runs on **every** desktop launch before the server starts (`packages/desktop/src/main.ts:451-454`), so a
   relocation that changes its idempotency or its ordering breaks first boot for existing installs. Same
   bar as G1: smoke-test against a real populated local DB, not only the suite (v0.6.0's PGlite hang is
   the precedent).
6. **D2b changes what eval *can* seed.** Routing `seeding.ts` through owning Services means an eval can no
   longer construct a world state no Service would accept. Checked at HEAD: all **19** writes in
   `seeding.ts` are plain single-row inserts of ordinary domain rows (`teams`, `teamMembers`, `users` ×5,
   `bets`, `tasks`, `knowledgeItems`, `knowledgeAppProjection`, `threads`, `messages`, `items`,
   `artifacts`, `knowledgeConflicts`, `routines`, `userSkills`, `sessions`) — none constructs a
   deliberately-invalid state, and the first six are the *same rows* `demo-fixture.ts` writes, which is why
   D2a and D2b share writers rather than each inventing their own. So it is not a live constraint today,
   but it is a real ceiling for a future adversarial eval. If one is later blocked by it, the answer is an explicit
   fixture-construction API on the owning Service — **not** a re-opened carve-out.
7. **AU27's `conversational` mode still bakes `modelId`/`modelProvider`** at `assistant-turn-resolver.ts:200-201`.
   G1 deletes that bake. Confirm AU27's plan absorbs the change rather than re-adding it.

---

## 12. Ordered increments — 19 PRs, 5 waves

Each row is an independently shippable PR to `main` (`npm run verify` green, no stacking). Sizes:
S ≈ ½–1 day, M ≈ 1–2 days, L ≈ 3–5 days.

**Round-3 corrections to this table.** (a) The count is **19**, not 13 — round 2's headline said 13 while
its own table had 16 rows, and round 3 adds three (D0, D2a, D2b). (b) **Wave = dependency depth, computed,
not asserted.** Round 2 put E1–E4 all in "wave 4" while E2←E1←, E3←E2, E4←E3 — a four-deep serial chain
inside one wave, the exact defect round 1's W4 raised. Every wave number below is `1 + max(wave of
dependencies)`, so a wave is now a genuine parallel band: everything in wave *n* can start the moment wave
*n−1* is merged.

| # | Wave | Increment | Size | Depends on | The test that proves it |
|---|---|---|---|---|---|
| **D0** | 0 | **`scripts/table-ownership-census.ts`** — prints file×table pairs under the **target** scope (whole workspace, `UNOWNED_SHARED_TABLES` deleted, all four new owners applied) and **exits 0 regardless**. Reporting only; the guard's enforced scope is untouched | S | — | run at HEAD it prints **100 pairs / 48 files / 20 tables**, matching §D-G's table region-for-region. **AC14**: every later increment reports the number and it must strictly decrease |
| **A1** | 0 | `HyperIdleEnv` + `requireBoundary` + `failClosedAssertion` + `constantTimeStringEqual` → `@hyperidle/shared/http`; **plus the pure explicit-start projection** `projectExplicitStartOutcome` + `sendStartProjection` (§D-H #16 — both apps need them, neither may import the other's route module); re-point ~45 route/middleware files; extend the authz eslint glob | M | — | `npm run lint` (authz rules still fire on every route file); `AF11-authz.integration.test.ts` green unchanged |
| **A2** | 0 | `createGitRunner` → `@hyperidle/shared/git`; `harness-capability-read-model` → `@hyperidle/shared` with a structural `HarnessCapabilityReader` | S–M | — | git-runner verb tests move and stay green; `const reader: HarnessCapabilityReader = pool` still compiles; `packages/web` build has no `node:child_process` in its bundle |
| **C2** | 0 | `observability` dissolves (translator+adapter → `shared`, config pair → `settings`, `TraceIdResolver` deleted, 4 routes deleted, package removed) | M | — | dispatcher unit tests move to `shared` and stay green; `rg -a "api/observability"` → zero |
| **E1** | 0 | J1 — AES-GCM primitive → `@hyperidle/shared` (re-discharge the no-DB proof first) | S | — | encrypt→decrypt round-trip matches pre-move output for a fixed key+plaintext; `credential-runtime-path` + `AN2` tests green |
| **G1** | 0 | `users` 6 + `teams` 3 run-config columns → `packages/agent-orchestration/agent-run-config`; `DROP COLUMN` × 11 incl. the 2 dead; migration + backfill honouring §D-L's written invariant (forward-only, no down-migration); every reader re-pointed; `validateAgentConfig` moves; **strips the dropped columns from the two db seeders in place** (`factory-bootstrap.ts:110,111,140,141`, `demo-fixture.ts:108` — §8) | L | — | migration applies clean against a **populated** local DB (manual smoke, not only the suite); an agent with a per-agent model still resolves it at provisioning; `Settings → Agents` Playwright pass; `agent-profile` render unchanged |
| **B1a** | 1 | `createApp`→`createCoreApiApp` (drops the orchestration mount, worker-WS hook, `SessionActivityBuffer`); `createAgentOrchestrationApp()` + `packages/agent-orchestration/src/routes/{sessions,agent-orchestration-sessions}.ts`; `bootCoreApi`/`bootAgentOrchestration`; `session-activity-gateway` moves into orchestration's boot; **`sessions-routes.ts` splits 4-move/1-stays per §D-H #16 — `POST /api/sessions` stays core-hosted and sheds its `sessions` import**; **`server-factory` still mounts both**. **Named deliverable: `packages/agent-orchestration/package.json` gains `dependencies` — it declares none today** (`hono`, `zod`, `drizzle-orm`, `@hyperidle/{db,shared,api-contract,session-requests,run-orchestration}`, matching the moved handlers' import block at `sessions-routes.ts:1-33`), **and its barrel stops being `export {}`** | L | A1 | `app.ts` no longer imports the orchestration routes (import guard); integration tests hit `GET /api/sessions`, `GET /api/sessions/starts/:id`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id`, `POST /api/sessions` and `/api/agent-orchestration/sessions` through the mounted app with identical bodies; 401 without auth; **AC12** (no duplicate `method + path` across the two apps); **AC5(d)** the 202 body is byte-identical; **feasibility P5** is the checked-in probe for this exact interleaved shape |
| **C1** | 1 | `git-export` exporter deletes; package removed; doc claims reconciled | M | A2 | `npm run knip` clean; `rg -a "api/git-export"` → zero; `npm run verify` |
| **E2** | 1 | J2 — rename to `@hyperidle/credentials`, LLM-key catalog only | M | E1 | `server-factory.resolver.test.ts`'s `instanceof DbCredentialResolver` invariant; `/api/credentials` unchanged |
| **D2a** | 1 | **The `packages/db` seeders relocate above the owning Services** (§D-G reachability corollary). `factory-bootstrap.ts` (8 accesses: `users` ×6, `knowledgeItems`, `knowledgeAppProjection`) and `demo-fixture.ts` (10: `teams`, `teamMembers`, `users` ×4, `bets`, `tasks`, `routines`) move to `packages/core-api/src/bootstrap/`, exported as a `@hyperidle/core-api/bootstrap` subpath, and route through the owners' exported writers (`org.persistScaffoldedAgents` is the shipped precedent). The three CLIs that call them move with them (`setup-cli.ts`, `seed-pg-cli.ts`, `bootstrap-pg.ts`, plus the deprecated `seed.ts` wrapper) and the root `setup` / `db:seed:pg` / `db:bootstrap:pg` scripts re-point; **`packages/desktop/src/main.ts:451-454` re-points from `@hyperidle/db` to `@hyperidle/core-api/bootstrap`**. `packages/db` is left as schema + connection + migrate + test-utils. **Why it cannot stay:** every owning Service's dependency closure is `{db, shared}`, so `db → users` is a cycle — the code must move or the ACL can never reach it | L | G1 | **AC15.** The five AF17/AK6/seed tests move and stay green **unweakened**; `applyFactoryBootstrap` stays idempotent (`onConflictDoNothing`) and is smoke-tested against a **real populated local desktop DB**, not only the suite; census drops 100 → 91 |
| **B1b** | 2 | `createServer` → `packages/remote-server/src/create-server.ts`; Application owns db/EventBus/wsHub/MCP-bridge, the middleware stack, and mounts both apps; re-point 5 non-test callers + 8 test files + 2 fixtures. **Named deliverable: `packages/remote-server/package.json` gains `@hyperidle/agent-orchestration` and `@hyperidle/db`** — it declares only `core-api`/`harness-registry`/`shared` today, and it cannot mount an app it does not depend on. *(Hygiene note, deliberately **not** actioned: `packages/desktop` declares its real deps under `devDependencies`. Under round 3's scope rule this is no longer load-bearing for the guard — the whole workspace is scanned either way — so re-classifying it is churn this WP does not take. B1b adds `@hyperidle/remote-server` in the same field the others already use.)* | L | B1a | `server-disposal.integration.test.ts` + `server-factory.resolver.test.ts` green; **AC10** (`/api/nope` → JSON 404); the 240 fixture-based tests unchanged |
| **D1** | 2 | `sessions` owner = `run-orchestration`; `AgentOrchestrationPort.sessions` read family (**incl. `getById`, returning the full wire row — §D-H #16**); convert **all 16** foreign readers — 9 core-api Layer + 6 core-api Service (incl. `policy/lifecycle-propagation.ts`) + **1 in agent-orchestration (`tool-handlers/tool-definitions.ts` — §D-H site 17, found by round 3's census)**; `PolicyDeps.runOrchestration` bag added and wired; `PATCH /api/sessions/:id` moves with the sessions-routes split; **`GET /tasks/:id/sessions` STAYS core-hosted** (§D-A) and reads through the port; `POST /tasks/:id/handoff` calls `buildHandoffRunContext` down; delete `review`'s redundant read; delete `work-service`'s subquery (recompose in `routes/bets.ts`); `bet-kill-cascade` → `requestRunStopForTasks`; **handoff's terminal write stays in policy's tx, delegated via `endRunForHandoff`** | L | B1a | guard fires on a fixture core-api Service importing `sessions`; bet-detail response byte-identical (existing bet route tests); bet-kill still stops runs (existing cascade test, re-wired); **handoff test asserts the run row is `done` at commit AND that no `session_ended` is emitted and no review item is created**; `lifecycle-propagation` still blocks `in_progress → review` while a sibling run is active; **`write_session_notes` still persists notes** (existing tool test, re-wired through `recordSessionNotes`); census drops 91 → 75 (the 16 `sessions` pairs) |
| **E3** | 2 | J3 — SQL-owning `packages/agent-orchestration/connections`; provisioning in-layer; **delete K1's bake** (6 resolvers + 8 wiring sites); delete `CoreApiPort.connections` + `GET /connections/provisioning` | L | E2 | **AC1(c)** the add-after-emit test; `run-orchestration-connections-provisioning-edge-closed` still asserts zero `app.fetch`; per-user isolation |
| **D2b** | 2 | **`packages/eval/src` routes through the owning Services** (§D-G — the round-2 exclusion is withdrawn). 69 file×table pairs across 27 files and 18 tables: `judges.ts` (52 findings), `seeding.ts` (34), 24 scenario files + `runner.ts`. Seeding reuses the same writers D2a introduces; judging reads through the owners' existing read functions. **Not circular:** an eval's system under test is the LLM + tools + prompts + assembled context, never the persistence Services, so a judge reading `work.get(db,"task",id)` is no more circular than a route test. `packages/eval/package.json` gains the Service deps it does not already declare | L | D2a, E3 | **every eval scenario still grades identically** — the pass/fail verdict per journey is unchanged against a recorded pre-move baseline run (evals are graded tuning, not tests: a changed *score* is a finding, a changed *verdict* is a regression); `@hyperidle/core-api/session` + `/routines` subpath imports unchanged (**AC9**); census drops 75 → 6 |
| **C3** | 3 | `realtime` dissolves into `packages/core-api/src/`; `session:` authz decomposed via `getSessionSubscribeContext`; FK-redundant `work` check deleted; package removed. Its `realtime` importer reference is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:65`) | S–M | B1a, B1b, D1 | `ws-broadcaster.no-session-forwarding.test.ts` green; subscribe to `session:<nonexistent>` still denies; thread-participant authz unchanged; **AC13(b)** — the WS narrowing is recorded, whether or not the founder answers |
| **D2** | 3 | `propagationLog`→policy, `taskDispatchAttempts`→work, `userSkills`→users; **the guard's Tier-2 scan roots become `src/` of every package under `packages/`** (§D-G — no package name, no dependency graph, no closure); `UNOWNED_SHARED_TABLES` + `assertDisjointOwnership` deleted; Tier 1 stays on `nestedServiceRoots()`. The single `propagationLog` importer is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`) — **hence the B1b dependency** | M | D1, B1b, **D2a**, **D2b** | `table-ownership-guard --fixtures` fires on each of the four former exemptions AND on fixture violations inside `packages/agent-orchestration/src`, `packages/remote-server/src` and `packages/db/src`; a fixture proves a **newly created** package is scanned with no guard edit and no `package.json` edit; **`inspect()` returns zero findings on the real tree** (**AC8(c)**); **census 6 → 0** (**AC14**) — the last 6 are `propagationLog` ×2, `taskDispatchAttempts` ×1, `userSkills` ×3, closed by this increment's three owner assignments |
| **E4** | 3 | J4′ — connections routes onto orchestration-api **at their unchanged paths** (`/api/connections*`); `settings`' MCP projection port re-pointed via the Application; guard row added | M | E3, B1b | `AN1-connections.integration.test.ts` re-wired and green; **`git diff packages/web` empty** (AC7(c)); Playwright pass on Settings → Connections; AC12 collision assertion covers the second `/api/connections` host |
| **F1** | 3 | mount engine + 4 adapters + `SANDBOX_SCAFFOLDING_PATHS` + `filesystemCaptures` → `packages/agent-orchestration/filesystem-mounting`; `listCaptures` deleted. Its construction site is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:1006`) — **hence the B1b dependency** | M–L | A2, B1b | adapter tests move and stay green incl. `git-worktree-live-proof`; guard owns `filesystemCaptures`; a real session still mounts |
| **F2** | 4 | `filesystemInjections` → `packages/agent-orchestration/agent-filesystems`; **delete the filesystems bake**; decompose the `injections ⋈ filesystems` join; injection write routes stay core-hosted, persist delegated down | L | F1 | add-a-filesystem-after-emit test (the twin of AC1(c)); `SettingsAgents.tsx` diff is **zero lines**; team-mismatch 400 still fires |

**Critical path.** Three chains, and the census chain is now the longest:

```
A1 → B1a → B1b ──┐                          (Job 2)
                 ├──→ E4                    (connections join)
E1 → E2 → E3 ────┘
G1 → D2a ─┐
          ├──→ D2b ──┐
E3 ───────┘          ├──→ D2                (the guard flip — 5 deep)
A1 → B1a → { B1b, D1 } ──┘
A1 → B1a → B1b → { C3, F1 → F2 }
A2 → C1
C2, D0  — no dependency
```

`D0`, `A1`, `A2`, `C2`, `E1` and `G1` are dependency-free and all start together. **`G1 → D2a → D2b → D2`
is the chain round 2 did not have**, and it is what makes D2 a wave-3 increment rather than the wave-4 it
was labelled.

**Founder confirmation points — each with the action the run takes if no answer arrives.**
`CLAUDE.md` ABSOLUTE RULE 1 says a pipeline run never pauses and never waits for feedback. A gate with no
default is therefore not a gate, it is a stall. Every row below stays a **confirmation point** — the
question is asked, and the answer changes the plan if it comes — but each now names what happens
regardless. The run records the question, the default it took, and the timestamp in
`.pipeline/work/AU26/progress.json` and appends it to `.pipeline/AU.md`, so a late answer is a cheap
correction rather than an archaeology exercise.

| Before | Confirm | **Default if unanswered** |
|---|---|---|
| **C1** | `git-export` exporter deletion (~4,500 lines) | **Proceed with the deletion.** The verdict is already founder-directed (§D-F); this is ratification, not a new decision |
| **C2** | `observability` dissolution | **Proceed.** Zero routes have callers repo-wide and `TraceIdResolver.seed()` has zero non-test callers — nothing observable changes |
| **C3** | `realtime` dissolution — **and, in the same conversation, the validation-scenario-4 WS narrowing** (§D-E). Not a verdict: a founder-written AC being narrowed | **Proceed narrowed**, and record the narrowing as `accepted-pending-review` in `progress.json` + `.pipeline/AU.md` (**AC13(b)**). The reviewer verified the narrowing is *forced* — the four-table authorizer and both rejected alternatives hold — so blocking the build on it would buy nothing the record does not already give |
| **D1** | `sessions` ownership | **Proceed.** Round 2 removed the "handoff semantics change" clause — there is none (§D-H #1, §11 risk 2) |
| **D2a / D2b / D2** | **The scope question, put the honest way round:** *zero exceptions is a standing founder ruling, so AU26 reads it as governing scan **scope** — `packages/db`'s seeders relocate (D2a) and `packages/eval` routes through the owning Services (D2b). Confirm, or name the narrowing you want.* | **Proceed as written — D2a and D2b are in the plan.** A standing ruling is not suspended by silence, and round 2 had this backwards: it defaulted to *excluding* eval and asked permission to include it, which makes silence widen the carve-out. If the founder later narrows it, the fallback is symmetric and already scoped — drop D2b, keep `packages/eval` out of the scanned set by an explicitly-recorded founder narrowing (**never** by a package name in the guard: the guard would keep scanning everything and eval's findings would be waived in the record, so the exception stays visible and costly) |
| **G1** | `users`/`teams` columns incl. the two `DROP COLUMN`s, and the forward-only migration (no down-migration) | **Proceed forward-only.** The migration is smoke-tested against a real populated local DB before the PR opens (§11 risk 4) |
| — | **connections** (already given — Decision J); **mount engine + captures + injections** (already given) | n/a |

"Stays" verdicts need no gate.

---

## 13. What changed in this revision

Recorded so the reviewer can check the deltas rather than re-read the whole document.

### Round 3 (targeted — waves 0–3 passed round 2 as written and are untouched)

Round 2 scored 7/10, PASS conditional: buildable, but D2 blocked on two CRITICALs. Both are closed below.
**C1, C2, C4 and C5 from round 2 were confirmed and are deliberately not re-opened** — the per-route split,
the placement rule, the handoff delegation and the WS narrowing all stand, as do the `createServer` →
`remote-server` call, the Hono `notFound` AC and AC2's 15-service coverage.

| Finding | Disposition |
|---|---|
| **CRITICAL 1** — the derived-closure census is false (`packages/db/src` holds 18 accesses the plan says do not exist), and the principle does not decide its own hardest case (`factory-bootstrap.ts` is the production first-boot seeder, the exact shape used to justify excluding eval) | **Fixed by re-deriving the principle, then re-running the census.** §D-G: the ACL governs **every non-test file in the workspace** — test code is the only ungoverned code, and only because a test of a Service cannot read through the Service it tests. No closure, no dependency graph, no package name. The **reachability corollary** (every owning Service's dependency closure is exactly `{db, shared}`, verified for all seven) explains why `packages/db` cannot comply *in place* — and makes that a **defect report, not an exemption**: the seeders relocate (**D2a**). The eval exclusion is **withdrawn** (**D2b**) — its two supporting arguments are answered by name in §D-G. Honest census published: **100 pairs / 48 files / 20 tables**, against round 2's "12 pairs, zero new work". A checked-in census script (**D0**) makes the number the gate (**AC14**) |
| **CRITICAL 2** — `agent-orchestration/src` and `agent-execution/src` are not in the closure at HEAD (zero dependents, barrel is `export {}`), so the derivation misses the directory B1a creates routes in; and it reads a `dependencies` field `desktop` does not use | **Fixed at the root, not patched.** Scanning the whole workspace reaches `packages/agent-orchestration/src` and `packages/remote-server/src` **at HEAD** — verified by computation, not asserted — so the guard's correctness no longer rides on any `package.json` edit. The two edits are still required for the **build** and are now named deliverables: **B1a** adds `packages/agent-orchestration/package.json`'s missing `dependencies` (it declares none) and un-empties its barrel; **B1b** adds `@hyperidle/agent-orchestration` + `@hyperidle/db` to `packages/remote-server/package.json`. `desktop`'s `devDependencies` classification is recorded as hygiene and **deliberately not churned** — it stopped being load-bearing when the scope stopped reading dependencies |
| **W5** — two residual seams in the placement rule: events uncovered, table sets stated as of end-of-WP | **Fixed.** §D-A gains **rule 5** (an emitted event is not a table touch; a subscriber is placed by its own table set) and **rule 6** (sets are evaluated at the increment that applies the rule, stated at HEAD; the one live case — `POST /api/sessions` reaching `filesystems`/`filesystem_injections`/`service_connections` in-tx at `sessions-routes.ts:412-421` until E3/F2 — is named and **verified not to flip the verdict**). Old rule 5 → **rule 7**, all 10 cross-references renumbered |
| **W6** — three founder gates with no autonomous default, against `CLAUDE.md` ABSOLUTE RULE 1 | **Fixed for all six gates.** §12's table gains a **"Default if unanswered"** column; the run records question + default + timestamp in `progress.json` and `.pipeline/AU.md`. The two that matter: the scope question **defaults to proceeding with D2a + D2b** (round 2 had the burden backwards — it defaulted to *excluding* eval, so silence widened the carve-out), and C3 **proceeds narrowed** with AC13(b) satisfied by the narrowing being recorded, never by it being unmentioned |
| **W1** — the explicit-start projection triple is used by both sides of the split | **Fixed, and it surfaced a wire regression.** §D-H #16 names one home: `pendingStart` + the failure-code map + `sendStartProjection` become pure functions in `@hyperidle/shared/http` (**A1**), and each side reads its own `sessions` row. **New finding:** the 202 branch returns the whole 18-column row, so `port.sessions.getById` must return the full wire shape — the 7-field narrowing would have dropped 11 fields with no test catching it. **AC5(d)** added |
| **W2** — the withdrawn rendering argument survives verbatim in §D-K | **Fixed.** Re-derived from rules 2/3, with the withdrawal noted inline so the builder who reads §D-K and not §D-A sees it |
| **W3** — wave labels contradict dependencies for E1–E4 | **Fixed properly.** Wave is now computed dependency depth (`1 + max(deps)`), so E1/E2/E3/E4 span waves 0/1/2/3 and every wave is a genuine parallel band. 5 waves, not 7 |
| **W4** — "13 PRs" vs a 16-row table | **Fixed.** **19 PRs**, matching §12 row for row (16 + D0 + D2a + D2b). The unverifiable "~3.5–5 weeks" is dropped rather than re-guessed |
| **S1** — the invented routing shape is not in the probes | **Fixed.** `probes/two-app-mount/poc4.ts` checked in and run: `POST /api/sessions` → core, `GET /api/sessions`, `GET /api/sessions/starts/:id`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id` → orchestration, `DELETE` and `GET /api/sessions/:id` → the root JSON 404, 7/7 middleware hits. Feasibility **P5′** |
| **S2** — `agent-orchestration/package.json` declares zero dependencies | **Fixed** — a named B1a deliverable with the import block it must satisfy (§12, §10) |
| **S3** — AC ordering reads as if an AC is missing | **Fixed.** `AC11` → **`AC16`**, so numeric order is reading order |
| *(new, found by round 3's census)* | **A 16th `sessions` toucher**: `agent-orchestration/tool-handlers/src/tool-definitions.ts:519-522` writes `sessions.notes` from the `write_session_notes` tool, exempted by an `@lore` at `:483` citing `UNOWNED_SHARED_TABLES`. Assigned as **§D-H site 17**, closed in **D1** via `run-orchestration.recordSessionNotes` |

### Round 2

| Finding | Disposition |
|---|---|
| **C1** `sessions-routes.ts` cannot move wholesale (imports 3 core-api Services) | **Fixed.** §D-H #16: split 4-move / 1-stays. `POST /api/sessions` stays core-hosted and sheds its `sessions` import; the two remaining raw touches become `port.sessions.getById` + `createBareRun`. No upward import anywhere |
| **C2** the guard census reasoning is false; the real hole is `packages/eval`'s 67 pairs *(round-2 disposition — **superseded by round 3**: the derived scope and the eval exclusion are both withdrawn; see the round-3 table above)* | **Fixed, both halves.** §2 row 3 + §D-G record that `core-api/src` is already scanned (`:604-630`) and that deleting the Set alone fires on all 12 Layer pairs. The scan scope becomes *derived* (Application dependency closure) so no package name appears in the guard. Eval's 67/18/26 measured and stated; the principle is written, the counter-argument is written, the fallback (D3) is costed, and the question is a founder gate before D2. AC8 rewritten to claim only what is true |
| **C3** the placement rule was never run against its own inputs | **Fixed.** §D-A restated as a mechanical table-set rule covering reads and writes, with auth explicitly excluded; §5 regenerated from the actual registrations. Rows changed: `GET /api/tasks/:id/sessions` → **core-api** (was orchestration); `POST /api/sessions` → **core-api** (was orchestration); `POST /api/tasks/:id/handoff` → **core-api** (newly listed); `GET /api/filesystems` → core-api but **re-derived** without the outlawed rendering argument; connections → orchestration but **path unchanged**; `/api/ws` → core-api, and the rule is what decides it. Round 1's `GET /api/sessions/:id` and `POST /api/sessions/:id/abort` deleted — they do not exist; `PATCH /api/sessions/:id` and `GET /api/sessions` added |
| **C4** the handoff change fails on all three legs | **Fixed by withdrawal.** §D-H #1 replaced: the terminal write stays in policy's transaction, delegated down via `PolicyDeps.runOrchestration.endRunForHandoff(tx, …)`. No event re-emission, no review regression, no reaper dependency, no eventual consistency. §11 risk 2 withdrawn; D1's founder gate loses the "semantics change" clause |
| **C5** validation scenario 4 is not closed and the narrowing is silent | **Stated, prominently.** §D-E now splits it: HTTP half closed (orchestration serves `GET /api/sessions/:id/activity` directly), WS half **deliberately narrowed** with the rule-derived reason, the two rejected ways to close it, and the design a rejection would require. AC13 added; the narrowing is a named founder confirmation point before C3 |
| **C4 (critique)** the 15th `sessions` reader is unassigned | **Fixed.** `policy/lifecycle-propagation.ts:288-293` is §D-H site 6, closed by `countOtherActiveRunsForTask`; §2's count corrected 13 → 15, with the full 35-file census |
| **W1** guard scan-root premise false | Fixed — §2 row 3, §D-G |
| **W2** AC8's "no allowlist of any kind" untrue | Fixed — AC8 rewritten, §D-G |
| **W3** `createServer` cost straw-manned | Fixed — §D-C: 630 restated as post-B1a two-Application cost, 5 of 7 sites identified as test harnesses, child-process option named and rejected on AU19's deleted `HYPERIDLE_PROFILE` branch. Decision unchanged, resting on the `desktop` import that already exists |
| **W4** wave labels contradict dependencies | Fixed — C3/D2 → wave 4, G1's phantom `A1` dependency dropped, both critical-path chains drawn |
| **W5** later increments address files B1b moved | Fixed — D2/F1/C3 re-expressed against "the Application composition root (post-B1b: `packages/remote-server/src/create-server.ts`)" and given their B1b dependency; the scan-scope wording no longer says "Layer roots" |
| **W6** scenario 4 half-closed | Fixed — see C5 above |
| **W7** rule undefined for reads, silently exempts auth | Fixed — §D-A rules 2 and 4 |
| **W8** "two of four DI edges leave" is one | Fixed — §D-E |
| **S1** observability call-site list omits 3 sites | Fixed — §8 |
| **S2** feasibility cites `hono@4.12.27` | Fixed — `feasibility.md` P1, verified `4.12.30` installed |
| **S3** backfill rule only a risk; no rollback note | Fixed — §D-L: written invariant with the real nullability/defaults, forward-only stated |
| **S4** AC7's "three files" vs `Conversations.tsx` | Fixed — AC7(c) is now **zero** web files, via §D-A rule 7 |
