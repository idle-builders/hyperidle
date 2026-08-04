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
| the guard enforces the ACL | **Partially — and *not* for the reason round 1 gave. Correction, verified.** `inspect()` (`:604-630`) already runs a second explicit pass over `packages/core-api/src` (the AU19 Increment 5 scan-widening, `@lore` `:612-624`). The 9 Layer `sessions` readers **are visited today**; they pass only because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered at `:543`). So deleting the Set alone fires immediately on all **12** already-scanned Layer pairs. The real hole is elsewhere: the scan surface is exactly `nestedServiceRoots()` **plus one hard-coded `core-api/src`** — `agent-orchestration/src`, `remote-server/src`, `agent-execution/src` and `eval/src` are never visited | **D2** replaces the two hand-written roots with a *derived* scan scope (§D-G). Not cosmetic: **B1a creates route files under `packages/agent-orchestration/src/routes/**` and B1b moves the single `propagationLog` importer into `packages/remote-server/src/`** — both land in roots the guard does not visit today, so without this change the WP would *create* the hole it claims to close |
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
5. **Path strings never change.** Both apps mount on the same `/api` router (§D-B, feasibility P1), so a
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
  with rule 5, **no `packages/web` file changes at all** in this WP (AC7(c) tightened from "exactly three
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
  core-api handler, no `AgentOrchestrationPort` hop. The URL string is unchanged (rule 5), which is a
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
| `sessions` | `packages/agent-orchestration/run-orchestration` | §D-H (15 core-api files) |
| `propagationLog` | `packages/core-api/policy` | `work/bet-kill-cascade.ts` → injected `PropagationLogWriter` port (Mechanism C, the AU12/13 precedent); `server-factory.ts`'s reaper → policy's exported `reapPropagationLog` |
| `taskDispatchAttempts` | `packages/core-api/work` | `policy/handoff-protocol.ts` → its existing `deps.work.*` port bag gains one method |
| `userSkills` | `packages/core-api/users` | `settings/plugin-configuration.ts` → injected reader port; `routes/users.ts` + `services/routine-scheduler-bindings.ts` (Layer) → call `users`' exported functions |

#### The scan scope — corrected, and derived rather than hand-written

**Round-1 correction.** Round 1 said the guard "scans only `packages/<layer>/<service>/`… **all Layer code is
invisible**" and concluded "without extending it, deleting `UNOWNED_SHARED_TABLES` is theatre." **That premise
is false.** `inspect()` (`scripts/table-ownership-guard.ts:604-630`) runs `nestedServiceRoots()` **and then** an
explicit second pass over `packages/core-api/src` — the AU19 Increment 5 scan-widening, documented in its own
`@lore` at `:612-624`. The nine Layer `sessions` readers are already visited every run; they pass solely
because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered at `:543`). **Deleting the Set alone fires on
all twelve already-scanned Layer pairs immediately** — it is not theatre, it is the whole of D1/D2's work.

The scan change is still required, for a **different and concrete** reason: the scan surface today is exactly
`nestedServiceRoots()` **plus one hard-coded path**. Everything else is unvisited — including the two
directories *this WP creates work in*:

- **B1a** puts route files under `packages/agent-orchestration/src/routes/**` — a Layer `src/` the guard has
  never visited.
- **B1b** moves the repo's single `propagationLog` Layer importer (`server-factory.ts`) into
  `packages/remote-server/src/create-server.ts` — and `remote-server` is an **Application**, not a Layer, so
  round 1's wording ("extend to Layer `src/` roots") would have missed exactly the file that moves.

**Decision: the scan scope is *derived*, not enumerated.** `inspect()` walks every nested Service package
`src/` (unchanged) **plus** the `src/` of every package in the **runtime dependency closure of the shipped
Applications** — `@hyperidle/remote-server`, `@hyperidle/desktop`, `@hyperidle/remote-worker` — computed from
`package.json` `dependencies`, transitively. Two properties matter:

1. It is **not a list**. No package name appears in the guard. A new Layer, a new Application, or a package
   that becomes a dependency of one is picked up automatically; nothing has to be remembered.
2. It replaces *both* hand-written roots. `core-api/src`, `agent-orchestration/src`, `agent-execution/src`,
   `remote-server/src`, `remote-worker/src`, `shared/src`, `api-contract/src` are all in the closure and all
   become scanned. Census at HEAD: **12 pairs, all inside `packages/core-api/src`, all on the four tables this
   WP is assigning owners to.** Zero new work.

#### `packages/eval` — stated as a principle, and put to the founder

`packages/eval` falls **outside** that closure: it is `private: true`, has **zero dependents anywhere in the
repo**, and is entered only through its own `npm run eval` CLI. It is not reachable from any shipped
Application.

This matters, and round 1 hid how much. Measured at HEAD, `packages/eval/src` non-test code holds **67
file×table pairs across 18 owned tables in 26 files** (`agentWorkIntents, artifacts, bets, items,
knowledgeAppProjection, knowledgeConflicts, knowledgeEditLog, knowledgeItems, messages, routineRuns, routines,
sessions, tasks, teamMembers, teams, threads, userSkills, users`) — concentrated in `seeding.ts` (15 tables)
and `judges.ts` (10). That is the single largest concentration of direct owned-table access in the repo, and
a one-entry package allowlist is exactly what would hide it. **Round 1's "exclude it by name with a stated
reason" was an allowlist wearing a reason, and AC8's "no allowlist of any kind" was false as written.**

**The principle this WP asserts instead:** *the table-ownership ACL governs code that runs inside a shipped
Application.* The guard already encodes that principle structurally in two places — it skips `__tests__`
directories (`:405`) and `*.test.ts` files. `packages/eval` is the same class one level up: a
fixture-seeding harness that stands the domain up rather than consuming it. Deriving the scan from the
Application closure expresses that principle **without naming eval**, so:

- **the zero-exceptions ruling holds in full** — no table carve-out anywhere, no `UNOWNED_SHARED_TABLES`, no
  `ALLOWLIST`, no package name in either guard;
- **the boundary is a scope rule, not an exemption** — and it self-maintains: the day anything shipped depends
  on `@hyperidle/eval`, eval enters the closure and all 67 pairs fire.

**There is a real architectural argument for the boundary, not only a scoping one.** Forcing eval's seeding
through owning Services would require those Services to export fixture-shaped writers they otherwise do not
need — growing exactly the service surface AU20 spent a work package shrinking — and would prevent evals from
constructing the deliberately-irregular world states they exist to construct. There is also a real argument
*against*: an eval that seeds a state no owning Service would accept is grading the system on fiction.

**This is put to the founder explicitly, as a confirmation point before D2** (§12), phrased as a yes/no:
*"does the zero-exceptions ruling govern scope, or only table carve-outs?"* If the answer is *scope*, the
fallback is named and costed here rather than discovered later: an additional increment **D3** that routes
`packages/eval/src`'s 26 files through the owning Services' exported writers/readers and adds `packages/eval`
to the scan unconditionally. **AU26 does not park the question and does not answer it in a parenthesis.**

`UNOWNED_SHARED_TABLES` and `assertDisjointOwnership` are **deleted** (the invariant they guarded stops
existing when one of the two sets does).

### D-H · The 15 core-api `sessions` touches (6 Service + 9 Layer)

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
(rule 5).**

| Registration | Tables touched | Host | What the builder does |
|---|---|---|---|
| `:321` `GET /` (list, `?task_id=&agent_id=&state=`) | `sessions` | **orchestration** | moves verbatim; in-layer read replaces the `@hyperidle/db` import |
| `:352` `POST /` | `tasks` + `users` + `server_config` + `explicit_session_starts` + `agent_work_intents` + `sessions` | **core-api — stays** | see below |
| `:512` `GET /starts/:startId` | `explicit_session_starts` + `sessions` | **orchestration** | moves with `projectExplicitStart`/`pendingStart`/`sendStartProjection` |
| `:529` `GET /:id/activity` | `sessions` + the agent-execution activity buffer | **orchestration** | moves, and **drops the `AgentOrchestrationPort` indirection** (`:536-539`) — the buffer is in-layer for orchestration, so the port hop is pure overhead once the route is on the right side |
| `:557` `PATCH /:id` (incl. the abort branch, `applyStateChangePatch` CAS `:259-263`) | `sessions` + `agent_session_requests` + `sessionRunRegistry` | **orchestration** | moves with `applyStateChangePatch`, `updateSessionSchema`, and the `transitionRun` call (which becomes in-layer, dropping `services/run-orchestration-composition.ts`) |

Four registrations land in `packages/agent-orchestration/src/routes/sessions.ts`. **`POST /api/sessions` stays
in `packages/core-api/src/routes/sessions-routes.ts`**, which shrinks to that one handler and **sheds its
`sessions` table import entirely**. It keeps only imports it is already entitled to: core Services
(`work`/`users`/`settings`) and the two sanctioned downward calls into orchestration Services
(`@hyperidle/session-requests`' `createSessionRequest`/`findSessionRequest`, already imported by core-api at
`app.ts:28`). Its two remaining raw-`sessions` touches are replaced:

- `projectExplicitStart`'s row read (`:63-68`) → `port.sessions.getById(start.sessionId)` (a read → the Port);
- the legacy bare-insert path (`:481-499`, fires only when `!durableStartEnabled` and no `Idempotency-Key`) →
  `createBareRun(db, eventBus, { agentId, taskId, modelTier })`, a new `run-orchestration` export owning the
  insert **and** the `session_started` emit (a command → a downward call).
  `@hyperidle/run-orchestration` is **already** a core-api dependency, so no package edge is added.

E3/F2 shrink this handler further: `resolveInjectedConnectionsForAgent` and
`resolveInjectedFilesystemsForAgent` are **deleted** from the bake (orchestration reads its own tables
in-layer at provisioning), leaving `requireRunnableAgent` + `readServerConfig` as the only Service deps
`resolveSessionStartRequest` still takes.

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

**The paths do not change** (§D-A rule 5): the routes stay at `/api/connections`, `/api/connections/:id`,
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

**Every path string is unchanged** (§D-A rule 5). What changes is which app serves it.

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

**Collision obligation (new, forced by rule 5):** with both apps mounted at `/api` and `/api/sessions/*` split
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
| **Route shadowing across the two apps** | YES — new class, created by §D-A rule 5 | `/api/sessions/*` is served by two apps at the same prefix. A duplicate `method + path` would be shadowed silently by registration order — including, in the worst case, a moved route landing behind a stale core-api registration that never got deleted. **AC12**: assert the merged route table has zero duplicate `method + path` pairs, and that `GET /api/sessions/:id/activity` resolves to orchestration's handler |
| **Input trust on agent-authored fields** | N/A | This WP moves code; it introduces no new agent-authored input field |
| **New credential surface** | N/A | No new credential type. `server_credentials` stays core (`@hyperidle/credentials`), explicitly not re-litigated |
| **Privilege change from the `sessions` ownership move** | YES | *Round-1 correction: there is no `POST /api/sessions/:id/abort` route — abort is a branch of `PATCH /api/sessions/:id` (`applyStateChangePatch`, CAS at `:259-263`).* `PATCH /api/sessions/:id` keeps its exact `requireBoundary({kind:"public-data"})` declaration and auth on the new host. **Tests: PATCH by an unauthenticated caller → 401; PATCH on an already-terminal session → 409 (`:181-190`, unchanged); PATCH on a live-runtime session → 202 (`:206-214`, unchanged)** |

---

## 7. Acceptance criteria

Mapped to `plan.md`'s seven ACs. Every one names its verification.

| # | Criterion | Verification |
|---|---|---|
| **AC1** | `serviceConnections` has exactly one Service importer (`packages/agent-orchestration/connections`); no core-api Service touches the table; K1's bake is gone | (a) `table-ownership-guard` `TABLE_OWNER.serviceConnections = "packages/agent-orchestration/connections"` and `npm run lint` fails on a fixture core-api Service importing it; (b) `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` and its 8 wiring sites do not exist — a `tsc` failure if any caller survives; (c) **integration test**: add a held connection AFTER an intent is emitted and BEFORE it drains → the connection is provisioned at spawn (proves the in-layer live read, and would FAIL against the bake) |
| **AC2** | All 15 core-api Services have an evidenced whole-service verdict; the reverse direction confirmed once | The three `service-verdicts/*.md` files + `git-export-rechallenge.md` + §D-N of this doc. Static artefact — no test. `/architecture-critique` checks completeness against the 15-name list in requirements §3 |
| **AC3** | Part-level verdicts for the mount engine, the `users` columns, and `WsConnectionHub` | §D-E, §D-K, §D-L. Static artefact |
| **AC4** | The mount engine relocates; record + probe resolved separately | (a) `packages/core-api/filesystems/src/mounter-registry.ts` gone, `packages/agent-orchestration/filesystem-mounting/` present; (b) `TABLE_OWNER.filesystemCaptures` points at it and the guard fails a core-api fixture importer; (c) `filesystems` still owns `filesystems` and the knowledge-scope gate test (`routes/knowledge.ts:565` 400-without-scopeId) stays green |
| **AC5** | Orchestration hosts its own session/harness-streaming routes; documented `WsConnectionHub` verdict | (a) **static** — an import guard (extend `scripts/composition-edge-anti-regrowth-guard.ts` with a `core-api → agent-orchestration route module` check) fails if any file under `packages/core-api/src` imports a module under `packages/agent-orchestration/**/routes/**`; `app.ts` no longer imports `agent-orchestration-sessions-routes.js`; (b) **integration tests** hitting the four routes that actually exist and actually move — `GET /api/sessions?task_id=&state=`, `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id` — plus `GET /api/agent-orchestration/sessions?...`, through the Application-mounted app, asserting status + body byte-shape unchanged against the pre-move baseline. *(Round 1 named `GET /api/sessions/:id`, which does not exist — a builder writing to it could not have made it pass honestly.)*; (c) 401 on each without auth |
| **AC6** | Every relocate verdict is executed here, none parked | The increment table in §12 covers connections, mount engine, captures, injections, `users`+`teams` columns, `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `observability`, `realtime`, `git-export`, `harness-capability-read-model`, `createGitRunner`. Verified by: `UNOWNED_SHARED_TABLES` does not exist; `packages/core-api/{observability,realtime,git-export}` do not exist; `npm run knip` reports no new dead exports |
| **AC7** | Settings + live session activity behave identically; no frontend behaviour change | (a) route-level integration tests **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, **read as painted output** (`npx playwright screenshot` + read the PNG); (c) **`git diff --stat packages/web` is EMPTY.** Tightened from round 1's "exactly three files may change" — which also missed a fourth (`pages/Conversations.tsx:118`, `/api/sessions?task_id=`). §D-A rule 5 holds every path string constant, so no web file has any reason to change. A non-empty web diff is a **failed** AC, not an allowance |
| **AC8** *(cross-cutting — the zero-exceptions bar)* | **Neither guard names a table or a package.** No table-level carve-out, no allowlist, no exemption set, no unowned-table set — in either guard. The scan **scope** is derived, not enumerated | (a) `scripts/table-ownership-guard.ts` contains no `UNOWNED_SHARED_TABLES`, no `assertDisjointOwnership`, and **no package-name literal anywhere in its scan logic** — a grep for `"packages/core-api/src"` and `"eval"` in that file returns zero; (b) its scan roots are computed from the runtime dependency closure of `@hyperidle/{remote-server,desktop,remote-worker}` (§D-G), and a fixture test proves a **new** package added to that closure is scanned without editing the guard; (c) `inspect()` returns zero findings on the real tree; (d) `scripts/composition-edge-anti-regrowth-guard.ts` keeps `ALLOWLIST`/`STATELESS_METHODS`/`isStatelessProvider` absent and `DEFERRED_FOLLOWUP` empty (verified at HEAD: `:417` `new Set([])`); (e) fixture tests prove each guard **fires** on a would-be violation of the class it used to exempt. **`packages/eval`'s 67 pairs are out of scope by the stated principle in §D-G, not by an exemption — and that principle is a named founder confirmation point before D2, with increment D3 costed as the fallback** |
| **AC9** *(new)* | `packages/eval`'s subpath imports survive | `npm run check` green with `packages/eval` importing `@hyperidle/core-api/session` and `@hyperidle/core-api/routines` unchanged; both subpaths still declared in `packages/core-api/package.json` |
| **AC10** *(new)* | Unknown `/api/*` still returns the canonical `ApiErrorResponse` JSON 404 | **Integration test**: `GET /api/definitely-not-a-route` → 404 with `{ error, code: NOT_FOUND }` and `content-type: application/json`. Guards feasibility P1's `notFound` trap |
| **AC12** *(new — forced by §D-A rule 5)* | The two mounted apps do not shadow each other | **Integration test**: enumerate the merged route table on the Application-composed instance and assert (a) zero duplicate `method + path` pairs across `coreApiApp` and `orchestrationApp`; (b) `GET /api/sessions/:id/activity` and `GET /api/sessions` resolve to orchestration's handlers while `POST /api/sessions` resolves to core's (assert via a handler-identifying header or a distinguishing body field the test sets up) |
| **AC13** *(new — closes validation scenario 4 honestly)* | Scenario 4's two halves are separately proven, and the WS narrowing is on the record | (a) **HTTP half, CLOSED**: an integration test proves `GET /api/sessions/:id/activity` is served by orchestration's app (AC12(b) covers the routing assertion) and returns a body byte-identical to the pre-move baseline; (b) **WS half, NARROWED**: this doc's §D-E states the narrowing and its reasoning explicitly, and the founder confirms or rejects it at the realtime confirmation point before C3 (§12). A silent pass is a **failed** AC |
| **AC11** | Whole-change correctness | `npm run verify` |

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
5. **`packages/eval` holds 67 file×table pairs across 18 owned tables in 26 files** (`seeding.ts` alone
   touches 15 tables; `judges.ts` 10; 12 scenario files touch `sessions`). It is **out of the guard's derived
   scan scope**, not exempted by name — the principle, the counter-argument, and the fallback increment D3
   are all written out in §D-G, and the question *"does zero-exceptions govern scope, or only table
   carve-outs?"* is a **founder confirmation point before D2**, not a note. This is the largest single
   open item in the WP and it is deliberately not decided by the builder.
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
| **B1a** | 1 · Job 2 | `createApp`→`createCoreApiApp` (drops the orchestration mount, worker-WS hook, `SessionActivityBuffer`); `createAgentOrchestrationApp()` + `packages/agent-orchestration/src/routes/{sessions,agent-orchestration-sessions}.ts`; `bootCoreApi`/`bootAgentOrchestration`; `session-activity-gateway` moves into orchestration's boot; **`sessions-routes.ts` splits 4-move/1-stays per §D-H #16 — `POST /api/sessions` stays core-hosted and sheds its `sessions` import**; **`server-factory` still mounts both** | L | A1 | `app.ts` no longer imports the orchestration routes (import guard); integration tests hit `GET /api/sessions`, `GET /api/sessions/starts/:id`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id`, `POST /api/sessions` and `/api/agent-orchestration/sessions` through the mounted app with identical bodies; 401 without auth; **AC12** (no duplicate `method + path` across the two apps) |
| **B1b** | 1 · Job 2 | `createServer` → `packages/remote-server/src/create-server.ts`; Application owns db/EventBus/wsHub/MCP-bridge, the middleware stack, and mounts both apps; re-point 5 non-test callers + 8 test files + 2 fixtures | L | B1a | `server-disposal.integration.test.ts` + `server-factory.resolver.test.ts` green; **AC10** (`/api/nope` → JSON 404); the 240 fixture-based tests unchanged |
| **C1** | 2 · dissolve | `git-export` exporter deletes; package removed; doc claims reconciled | M | A2 | `npm run knip` clean; `rg -a "api/git-export"` → zero; `npm run verify` |
| **C2** | 2 · dissolve | `observability` dissolves (translator+adapter → `shared`, config pair → `settings`, `TraceIdResolver` deleted, 4 routes deleted, package removed) | M | — | dispatcher unit tests move to `shared` and stay green; `rg -a "api/observability"` → zero |
| **D1** | 3 · sessions | `sessions` owner = `run-orchestration`; `AgentOrchestrationPort.sessions` read family (**incl. `getById`**); convert **all 15** core-api readers (9 Layer + 6 Service, incl. **`policy/lifecycle-propagation.ts`**, absent from round 1); `PolicyDeps.runOrchestration` bag added and wired; `PATCH /api/sessions/:id` (the abort branch's real home) moves with the sessions-routes split; **`GET /tasks/:id/sessions` STAYS core-hosted** (§D-A re-derivation) and reads through the port; `POST /tasks/:id/handoff` calls `buildHandoffRunContext` down; delete `review`'s redundant read; delete `work-service`'s subquery (recompose in `routes/bets.ts`); `bet-kill-cascade` → `requestRunStopForTasks`; **handoff's terminal write stays in policy's tx, delegated via `endRunForHandoff`** | L | B1a | guard fires on a fixture core-api Service importing `sessions`; bet-detail response byte-identical (existing bet route tests); bet-kill still stops runs (existing cascade test, re-wired); **handoff test asserts the run row is `done` at commit AND that no `session_ended` is emitted and no review item is created** (the round-1 design would fail exactly this test); `lifecycle-propagation` still blocks `in_progress → review` while a sibling run is active |
| **C3** | **4** · dissolve | `realtime` dissolves into `packages/core-api/src/`; `session:` authz decomposed via `getSessionSubscribeContext`; FK-redundant `work` check deleted; package removed. Its `realtime` importer reference is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:65`) | S–M | B1a, B1b, D1 | `ws-broadcaster.no-session-forwarding.test.ts` green; subscribe to `session:<nonexistent>` still denies; thread-participant authz unchanged |
| **D2** | **4** · sessions | `propagationLog`→policy, `taskDispatchAttempts`→work, `userSkills`→users; guard scan roots replaced by the **derived Application-closure scope** (§D-G — no package name in the guard); `UNOWNED_SHARED_TABLES` + `assertDisjointOwnership` deleted. The single `propagationLog` importer is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`) — **this is why D2 depends on B1b**, and why round 1's "extend to Layer `src/` roots" wording would have missed it (`remote-server` is an Application, not a Layer) | M | D1, **B1b** | `table-ownership-guard --fixtures` proves it now fires on each of the four former exemptions AND on a fixture violation inside `packages/agent-orchestration/src` and `packages/remote-server/src`; a fixture proves a newly-added closure package is scanned with no guard edit; `inspect()` returns zero findings on the real tree |
| **E1** | 4 · connections | J1 — AES-GCM primitive → `@hyperidle/shared` (re-discharge the no-DB proof first) | S | — | encrypt→decrypt round-trip matches pre-move output for a fixed key+plaintext; `credential-runtime-path` + `AN2` tests green |
| **E2** | 4 · connections | J2 — rename to `@hyperidle/credentials`, LLM-key catalog only | M | E1 | `server-factory.resolver.test.ts`'s `instanceof DbCredentialResolver` invariant; `/api/credentials` unchanged |
| **E3** | 4 · connections | J3 — SQL-owning `packages/agent-orchestration/connections`; provisioning in-layer; **delete K1's bake** (6 resolvers + 8 wiring sites); delete `CoreApiPort.connections` + `GET /connections/provisioning` | L | E2 | **AC1(c)** the add-after-emit test; `run-orchestration-connections-provisioning-edge-closed` still asserts zero `app.fetch`; per-user isolation |
| **E4** | 4 · connections | J4′ — connections routes onto orchestration-api **at their unchanged paths** (`/api/connections*`); `settings`' MCP projection port re-pointed via the Application; guard row added | M | E3, B1b | `AN1-connections.integration.test.ts` re-wired and green; **`git diff packages/web` empty** (AC7(c)); Playwright pass on Settings → Connections; AC12 collision assertion covers the second `/api/connections` host |
| **F1** | 5 · filesystems | mount engine + 4 adapters + `SANDBOX_SCAFFOLDING_PATHS` + `filesystemCaptures` → `packages/agent-orchestration/filesystem-mounting`; `listCaptures` deleted. Its construction site is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:1006`) — **hence the B1b dependency**, unstated in round 1 | M–L | A2, **B1b** | adapter tests move and stay green incl. `git-worktree-live-proof`; guard owns `filesystemCaptures`; a real session still mounts |
| **F2** | 5 · filesystems | `filesystemInjections` → `packages/agent-orchestration/agent-filesystems`; **delete the filesystems bake**; decompose the `injections ⋈ filesystems` join; injection write routes stay core-hosted, persist delegated down | L | F1 | add-a-filesystem-after-emit test (the twin of AC1(c)); `SettingsAgents.tsx` diff is **zero lines**; team-mismatch 400 still fires |
| **G1** | 6 · run config | `users` 6 + `teams` 3 run-config columns → `packages/agent-orchestration/agent-run-config`; `DROP COLUMN` × 11 incl. the 2 dead; migration + backfill honouring §D-L's written invariant (forward-only, no down-migration); every reader re-pointed; `validateAgentConfig` moves | L | **— (none)** ⟵ *round 1 listed `A1` with no stated reason; G1 keeps its route core-hosted (§D-A) and touches no route or middleware file A1 moves, so the dependency is dropped. G1 can start in wave 0.* | migration applies clean against a **populated** local DB (manual smoke, not only the suite); an agent with a per-agent model still resolves it at provisioning; `Settings → Agents` Playwright pass; `agent-profile` render unchanged |

**Critical path — round-1 correction.** Round 1 gave `A1 → B1a → B1b → E4` and omitted that E4 also sits behind
`E3 ← E2 ← E1`. Both chains are real and E4 is the join:

```
A1(M) → B1a(L) → B1b(L) ──┐
                          ├──→ E4(M)
E1(S) → E2(M) → E3(L) ────┘
A1 → B1a → D1(L) → { C3(S–M) needs B1b too ; D2(M) needs B1b too }
A2(S–M) → C1(M) ;  A2 + B1b → F1(M–L) → F2(L)
G1(L)  — no dependency, may start immediately
C2(M)  — no dependency
```

The two longest chains are `A1 → B1a → B1b → E4` and `E1 → E2 → E3 → E4`; **the connections chain is the one
round 1 dropped and it is at least as long.** `A2`, `C2` and `G1` are genuinely dependency-free and should
start in wave 0. **Wave labels are now consistent with the dependency column** — round 1 labelled C3 "wave 2"
while depending on wave-3 D1; C3 and D2 are wave 4.

**Founder confirmation points (requirements §8's human gate).** Each relocate verdict is confirmed before its
build increment, not bundled with approval of this doc:

| Before | Confirm |
|---|---|
| **C1** | `git-export` exporter deletion (~4,500 lines) |
| **C2** | `observability` dissolution |
| **C3** | `realtime` dissolution — **and, in the same conversation, the validation-scenario-4 WS narrowing** (§D-E). This one is not a verdict, it is a founder-written AC being narrowed; it is called out separately so it cannot pass silently |
| **D1** | `sessions` ownership. *Round-1 correction: "+ the handoff semantics change" is **removed** — there is no semantics change any more (§D-H #1, §11 risk 2)* |
| **D2** | **The eval question, as a yes/no: does the zero-exceptions ruling govern scan *scope*, or only table carve-outs?** If scope, increment **D3** (route `packages/eval/src`'s 26 files through owning Services, add eval to the scan unconditionally) enters the plan before D2 ships. §D-G |
| **G1** | `users`/`teams` columns incl. the two `DROP COLUMN`s, and the forward-only migration (no down-migration) |
| — | **connections** (already given — Decision J); **mount engine + captures + injections** (already given) |

"Stays" verdicts need no gate.

---

## 13. What changed in this revision (round 2)

Recorded so the reviewer can check the deltas rather than re-read the whole document.

| Finding | Disposition |
|---|---|
| **C1** `sessions-routes.ts` cannot move wholesale (imports 3 core-api Services) | **Fixed.** §D-H #16: split 4-move / 1-stays. `POST /api/sessions` stays core-hosted and sheds its `sessions` import; the two remaining raw touches become `port.sessions.getById` + `createBareRun`. No upward import anywhere |
| **C2** the guard census reasoning is false; the real hole is `packages/eval`'s 67 pairs | **Fixed, both halves.** §2 row 3 + §D-G record that `core-api/src` is already scanned (`:604-630`) and that deleting the Set alone fires on all 12 Layer pairs. The scan scope becomes *derived* (Application dependency closure) so no package name appears in the guard. Eval's 67/18/26 measured and stated; the principle is written, the counter-argument is written, the fallback (D3) is costed, and the question is a founder gate before D2. AC8 rewritten to claim only what is true |
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
| **S4** AC7's "three files" vs `Conversations.tsx` | Fixed — AC7(c) is now **zero** web files, via §D-A rule 5 |
