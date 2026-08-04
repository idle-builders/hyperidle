# AU26 — Architecture

Tier: **production**. Spec of record: `plan.md`. Binding requirement: `requirements.md`
(founder-approved, `progress.json → approvals.requirements`). Design phase: **skipped** — backend/infra,
zero required frontend behaviour change. Feasibility: `feasibility.md` (P1–P6 + **P5′**, all GO).

Every `file:line` below was re-traced with `rg -a` on branch `pipeline/AU26` (base `origin/main` @ `75d85687`).

> **Round 4 — the founder's scope ruling (2026-08-04).** Rounds 2 and 3 absorbed a repo-wide
> table-ownership programme (a census gate, a whole-workspace ACL scan scope, owners for four tables AU26
> does not move, `packages/eval`'s 69 violations, relocating `packages/db`'s seeders). The founder ruled it
> out of this work package: *"why are you doing db ownership checks that is the task of AU28? please go back
> to what is the task of this workpackage and only do that."* / *"you are doing AU26. focus only on what is
> the scope of au26."*
>
> That revision cut the work out. **The findings are not lost** — §14 hands the rule-writing to AU28 with
> its evidence.

> **Round 5 — the founder's correction (2026-08-04).** Round 4 drew the line in the wrong place. It used
> *"ownership work vs. relocations"* as the axis and, on that axis, swept four real **code moves** and one
> **package dissolution** out along with the governance programme. The founder restated the line:
>
> *"policy, review and work are not cut to AU28. the move is part of this package. what is not part of this
> package is writing package boundary definition or linters and such."*
>
> **The axis is moving code vs. writing rules.** This revision restores the moves (§D-M: `policy`'s handoff
> run-end write, `work`'s bet-kill run-stop write, `work`'s `latestSessionOutcome` subquery, `review`'s
> redundant session read) and re-confirms the `realtime` dissolution (increment C3) as a move. §14 now hands
> AU28 the rule-writing only. **AU26 still gives `sessions` no owner** and changes no guard behaviour — a
> move that incidentally removes a violation is still a move.

> **Size, stated honestly up front.** This is **not one PR.** It is **17 independently shippable PRs across
> 5 waves** — the number matches §13's table row for row. *(Round 4's heading said 13 against a 14-row table;
> the 14th was `D0`, cut in prose only and since reverted at `0317818a`. Round 5 adds H1/H2/H3.)* The wave boundaries in §13 are computed
> dependency depth, so each PR is green on `main` by itself and each wave is a genuine parallel band.

---

## 1. Required reading

- `.pipeline/work/AU26/plan.md` — spec of record.
- `.pipeline/work/AU26/requirements.md` — §2 the rule, §5 Job 2, §9 the seven items this doc closes.
- `.pipeline/work/AU26/service-verdicts/{group1,group2,group3}.md` + `git-export-rechallenge.md` — pass A.
- `.pipeline/work/AU21/architecture.md` — **Decision J** (J0–J5, J7 locked; **J6 superseded**, see §D-H),
  **K1** (the bake this WP deletes), **L2/L4/L(14e)**.
- `docs/architecture/runtime-simplification.md` — Applications / Layers / Services; Mechanisms 1–3.
- `docs/architecture/connection-model.md`, `credential-model.md` — held vs inherited; why `server_credentials` stays.
- `docs/architecture/run-unit-model.md` — what "workspace" already means.
- `.claude/rules/typescript.md`, `.claude/rules/testing.md` — binding.
- **§14 of this document** before touching `scripts/table-ownership-guard.ts` — it names exactly what AU26
  may change in that file and what it must leave alone for AU28.

---

## 2. Scope boundary — AU26 vs AU28

Stated first, because rounds 3 and 4 crossed it in opposite directions and getting it right is the point of
this revision.

**The founder's line, verbatim (2026-08-04):** *"policy, review and work are not cut to AU28. the move is
part of this package. what is not part of this package is writing package boundary definition or linters and
such."*

**The axis is moving code vs. writing rules** — not "relocation vs. ownership", which is what round 4 used
and which cut real work.

- **AU26 moves code.** Code in the wrong place is moved, deleted or dissolved here: a core-api Service
  performing a write that belongs to `agent-orchestration`, a query core does not need, a package that
  should not be a package. **A move that incidentally removes an ACL violation is still a move** — that is
  expected, not scope creep.
- **AU28 writes rules.** Package-boundary definitions, owners for tables nobody moves, guard scan scopes,
  exemption sets, linters, violation censuses and countdowns. `.pipeline/work/AU28/plan.md` is the
  interface-architecture work package: one canonical spec for how Layers and Services may communicate, plus
  a guard that warns on every existing violation and hard-fails on new ones. The repo's *general* ownership
  debt is that programme's, not this one's.

| Question | Owner |
|---|---|
| Does `serviceConnections`'s owner change because AU26 moves the Service? | **AU26** (AC1 names it) |
| Do `filesystemCaptures` / `filesystemInjections` get new owners because AU26 moves them? | **AU26** (AC4, AC12) |
| Do the two new `agent_run_config` / `team_run_config_defaults` tables get owners? | **AU26** (AC12) |
| `policy/handoff-protocol.ts` ends the run with a raw write inside policy's transaction | **AU26** — a misplaced write (§D-M.1) |
| `work/bet-kill-cascade.ts` stops runs with a raw CAS write | **AU26** — a misplaced write (§D-M.2) |
| `work/work-service.ts`'s `latestSessionOutcome` correlated subquery | **AU26** — a query core does not need (§D-M.3) |
| `review/session-review-creator.ts` re-reads what `SessionEndedEvent` already carries | **AU26** — a redundant read (§D-M.4) |
| Should `realtime` stop being a package? | **AU26** — a dissolution is a move (§D-E, increment C3) |
| Who **owns** `sessions`, and do the ten core-api Layer routes that read it convert to a port family? | **AU28** (§14 finding 1) |
| Does `policy/lifecycle-propagation.ts`'s active-run count convert to a downward call? | **AU28** (§14 finding 1) |
| Does `realtime`'s subscribe authorizer decompose its `sessions` read? | **AU28** (§14 finding 1) |
| Who owns `propagationLog` / `taskDispatchAttempts` / `userSkills`? | **AU28** (§14 finding 2) |
| Should `UNOWNED_SHARED_TABLES` exist at all? | **AU28** (§14 finding 3) |
| What source roots should the ownership guard scan? | **AU28** (§14 finding 4) |
| Should `packages/eval` route through owning Services? | **AU28** (§14 finding 5) |
| Should `packages/db`'s seeders live above the Services? | **AU28** (§14 finding 6) |

**The one-line test a builder applies when unsure:** *is this code in the wrong place, judged without
appealing to an ownership rule?* — core executing another Layer's write, or carrying a read it does not
need. If yes, AU26 moves it, and enforces the new home of any table it moved. If the only argument is *"the
ACL should govern X"*, or the fix is a new rule, a new guard, or a new read surface built to satisfy that
rule, it is AU28's.

---

## 3. Plan reconciliation (spec ⇆ reality)

Named symbols verified. Only disagreements and newly-found obligations are listed.

| Spec claim | Reality at HEAD | How the plan handles it |
|---|---|---|
| `app.ts:42` imports the orchestration routes module | **Confirmed** — `import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions-routes.js"`, mounted `:556-561` | Increment **B1a** deletes the import; the AC is a lint/import guard, not a test |
| 5 non-test `createServer(` callers | **Confirmed** — `remote-server/src/index.ts:36`, `desktop/src/boot-server.ts:30`, `web/scripts/{ah1:62,ah5:140,ah6:250}-test-server.ts` | **B1b** re-points all five to one relocated `createServer` |
| 8 test files call `createServer(` | **Confirmed** — incl. `packages/desktop/__tests__/boot-server.test.ts` and `agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts` (**outside `core-api`** — the spec's count did not say so) | **B1b** re-points; the `AN2` one is the connections live-proof, so E3 must keep it green |
| `test-utils.ts:13` / `test-fixtures.ts:49` fan out | **Confirmed and larger than stated** — **240** test files import a fixture module | **B1b**: the two fixtures become the *only* other composition site; 240 files change zero lines |
| `packages/eval` unaffected if subpaths survive | **Confirmed** — eval imports `@hyperidle/core-api/session` (`provision-harness.ts:14`) and `/routines` (`scenarios/{builtin-routines:16,delegation:32,routine-sessions:13,skill-autonomy:11}.ts`). Neither is a route module | **B1a/B1b keep both subpath exports verbatim.** Stated as **AC8** |
| `run-orchestration` already writes a route handler | **Confirmed** — declares `hono` (`package.json:18`) and `app.get("/ws/worker", …)` at `worker-ingress.ts:259`, on an app core-api hands it | **B1a** inverts it: orchestration owns the app, the Application hands it the WS upgrader |
| `plugin-configuration.ts:727` is a second connections consumer | **Confirmed**, port declared `:65` | **E4** re-points it (display-only projection — group3.md) |
| `RegistryFilesystemMounter` at `server-factory.ts:1006` | **Confirmed**; only non-test `.mount()`/`.captureBack()` are `run-orchestration/src/filesystem-provisioning.ts:78`, `provisioner.ts:527` | **F1** |
| `users` run-config columns | **Confirmed** at `schema.ts` `kind:50 systemPromptPath:53 skills:60 status:61 maxConcurrentSessions:62 systemPrompt:74 harnessType:76 modelTierPreference:78 modelId:84 modelProvider:92 agentCategory:98`; `teams` twin at `:42-44` | **G1** |
| `serviceConnections`'s owner is `packages/core-api/connections` | **Confirmed** — `table-ownership-guard.ts:144` | **E3** re-points the row to `packages/agent-orchestration/connections` |
| `filesystems` / `filesystemInjections` / `filesystemCaptures` all owned by `packages/core-api/filesystems` | **Confirmed** — `table-ownership-guard.ts:251-253` | **F1** re-points `filesystemCaptures`, **F2** re-points `filesystemInjections`; `filesystems` **stays** (§D-I) |

### Blast-radius surfaces the spec undercounted

1. **The two emit-time bakes are symmetric and each has ~14 sites.** `resolveInjectedConnectionsForAgent`
   and `resolveInjectedFilesystemsForAgent` are threaded through the same six emit resolvers
   (`work/task-run-resolver.ts`, `work/session-start-resolver.ts`, `conversation/assistant-turn-resolver.ts`,
   `review/proposed-call-workflow.ts`, `knowledge/knowledge-action-resolver.ts`, `routine/routine-service.ts`)
   plus the same wiring files (`services/{task-run-resolver,routine-scheduler}-bindings.ts`,
   `services/{agent-run-admission-reactions,assistant-turn-coherence-trigger}.ts`,
   `routes/{sessions-routes,threads,knowledge}.ts`, `review/session-review-creator.ts`). Deleting one is a
   template for deleting the other. **E3** and **F2**.
2. **`filesystem-registry.ts:42-44` is a cross-owned join.** `filesystemInjections ⋈ filesystems`. Once
   injections move to a different owner, the join spans two owners and must decompose. **F2**. This is ACL
   work AU26 *causes* — it is in scope precisely because AU26 moves the table.
3. **Job 2 has TWO blockers, not one.** `agent-orchestration-sessions-routes.ts:9-12` states the first
   outright: giving orchestration its own app "would force `agent-orchestration` to import
   `@hyperidle/core-api` for the auth/boundary/rate-limit stack." Absorbed by **A1** + the Application-owned
   stack (§D-B). **The second is larger:** `packages/core-api/src/routes/sessions-routes.ts:1-33` imports
   `@hyperidle/work`, `@hyperidle/users` and `@hyperidle/settings` — three **core-api Services** — and calls
   all of them inside `POST /`'s `db.transaction` (`:396-424`). The file therefore **cannot move**, and the
   anti-regrowth guard (zero exemptions at HEAD, `composition-edge-anti-regrowth-guard.ts:417`) would fire
   on any attempt. Absorbed by §D-A's per-route split.
4. **`git-export` is two things in one package** — a dead 1,205-line exporter and a live 509-line git runner
   whose two of three consumers are `filesystems`'. **A2** + **C1**.
5. **`@hyperidle/core-api` depends on four `agent-orchestration` Services** (`dispatch`, `run-orchestration`,
   `session-requests`, `tool-handlers`) and on `harness-registry`. Those dependencies move to the
   orchestration Layer package in **B1a/B1b**; core-api's `package.json` sheds them.

**What is deliberately absent from this list:** the `sessions` **read** surface (35 files repo-wide, 15 in
core-api). It was blast-radius item 1 in rounds 1–3. AU26 gives `sessions` no owner, so converting reads is
not AU26's blast radius — that is **§14 finding 1**, handed to AU28 with the full census.

**Round 5 adds a sixth, small, blast-radius item.** §D-M restores four core-api Service sites — two misplaced
writes and two deletions. Each is confined to one file plus its wiring line: `policy/handoff-protocol.ts` +
`policy/src/ports.ts` + `services/policy-bindings.ts:106`; `work/bet-kill-cascade.ts` +
`routes/bets.ts:667`; `work/work-service.ts` + `routes/bets.ts:376`; `review/session-review-creator.ts`
alone. Two new exports on `run-orchestration`'s existing barrel. No new package edge (`packages/core-api/`
`package.json:39` already declares `@hyperidle/run-orchestration`), no new Port method, no `packages/web`
change. Increments **H1**, **H2**, **H3**.

---

## 4. Decisions

### D-A · The placement rule — where a route lands (closes requirements §9.5, third leg of J6's supersession)

J6 kept connections' routes in core-api because "core-api is the layer with the HTTP surface." That is a
locality argument, and Job 2 removes the fact it rested on. But the naive replacement — *"anything
agent-shaped goes on orchestration-api"* — breaks on the first real case: `POST /api/filesystems/:id/injections`
writes an agent-run-config record, but it must first read `filesystems` and `teamMembers`
(`routes/filesystems.ts:337-364`), both core-owned. Orchestration may not read either.

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
   - core asking orchestration to **change** its own record → a direct downward function call. Never a Port
     method — `AgentOrchestrationPort` stays strictly read-only.
   *(AU26 exercises this rule for placement only. It adds **no** new `AgentOrchestrationPort` methods and
   **no** new downward-call surface for `sessions` — see the note at the end of this section.)*
4. **Authentication and authorization applied by the Application's middleware stack are never part of a
   route's table set.** `createAuthMiddleware` reads `@hyperidle/users`; if that counted, rule 3 would force
   *every* route onto core and orchestration-api could not exist. Stated, not assumed.
5. **An emitted event is not a table touch. A subscriber is placed by its own table set, on its own
   layer.** `PATCH /api/sessions/:id` emits `session_ended`, whose subscriber
   `review/session-review-creator.ts` writes core tables; after the move the emit happens on
   orchestration's side. Under a literal reading of rule 2 that route's table set would grow every table
   every subscriber touches, transitively — which would collapse rule 3 into "everything is core." The
   event bus is a boundary, exactly like the middleware stack in rule 4: what crosses it is a payload, not
   a query.
6. **A route's table set is evaluated at the moment the increment applying the rule lands — not at the end
   of the WP.** Every set in the table below is stated **at HEAD**, so an increment is decidable while it
   is being built. The one live case: `POST /api/sessions`'s handler transitively reaches `filesystems`,
   `filesystem_injections` and `service_connections` today, through `resolveSessionStartRequest`'s
   `resolveInjectedFilesystemsForAgent` / `resolveInjectedConnectionsForAgent` arguments, called in-tx at
   `sessions-routes.ts:412-421`; E3 and F2 delete both. **Verified: the verdict does not flip** — before
   *and* after, the set spans `tasks`/`users`/`server_config` (core) and
   `sessions`/`agent_work_intents`/`explicit_session_starts` (orchestration), so rule 3 says core-api at
   every point in the WP. **Standing consequence:** if a later increment ever *did* flip a verdict, the
   route does **not** move inside AU26 — rule 7 holds the path constant and the flip is recorded as a
   follow-on, so no increment can invalidate an already-shipped one.
7. **Path strings never change.** Both apps mount on the same `/api` router (§D-B, feasibility P1), so a
   route can change host app while keeping its URL byte-identical. This is what makes AC7's "zero
   `packages/web` diff" reachable. Its cost is that a duplicate `method + path` across the two apps would
   resolve silently by registration order — closed by AC10's route-table collision assertion.

Applied — **route by route, handler body open** (every row's table set traced at HEAD):

| Surface | Tables the handler touches | Lands on |
|---|---|---|
| `GET /api/sessions` (list, `?task_id=&state=`) | `sessions` | **orchestration-api** |
| `POST /api/sessions` | `tasks` (`work.get` 404 gate, `:363-366`) + `users`/`server_config` (the emit-time bake) + `explicit_session_starts`/`agent_work_intents`/`sessions` | **core-api**, composing down |
| `GET /api/sessions/starts/:startId` | `explicit_session_starts` + `sessions` | **orchestration-api** |
| `GET /api/sessions/:id/activity` | `sessions` + the agent-execution activity buffer | **orchestration-api** |
| `PATCH /api/sessions/:id` (incl. the abort branch) | `sessions` + `agent_session_requests` + `sessionRunRegistry` | **orchestration-api** |
| `GET /api/agent-orchestration/sessions`, `…/:id/activity` | orchestration only | **orchestration-api** |
| `GET /api/tasks/:id/sessions` | **`tasks`** (`work.get` 404 gate, `:187-191`) + `sessions` | **core-api** (unchanged host, unchanged handler) |
| `POST /api/tasks/:id/handoff` | `tasks` + `sessions` + policy's own | **core-api** (unchanged host, unchanged handler) |
| connections read + POST/DELETE/validate | `service_connections` only (traced: `routes/connections.ts` imports no `@hyperidle/users`, no `teamMembers`, no `work`); the inherited half reads the harness descriptor, a *downward* agent-execution edge orchestration owns | **orchestration-api** (J6 superseded, as founder-directed) — **path unchanged**, `/api/connections*` |
| `GET /api/filesystems?agentUserId=` | **`filesystems`** + `filesystem_injections` (post-F2, orchestration) | **core-api**, decomposed (§D-I) |
| `GET /api/filesystems?teamId=` | `filesystems` | **core-api** |
| filesystem injection write/eject | `filesystems` + `users`/`teamMembers` (team gate `:337-364`) + `filesystem_injections` | **core-api**, delegating the persist down |
| agent run-config write (`PATCH /api/agents/:id`, assistant PATCH) | `users` (exists, `kind:"ai"`, team) + `agent_run_config` | **core-api**, delegating the persist down |
| `/api/ws` (the one user socket) | `threads` + `users` + `team_members` + `sessions` | **core-api**, unchanged (§D-E) |

**Two consequences worth stating:**

- `GET /api/tasks/:id/sessions` and `POST /api/tasks/:id/handoff` **stay core-hosted with their handlers
  untouched**, so `useTaskSessions.ts` needs no URL change. Combined with rule 7, **no `packages/web` file
  changes at all** in this WP (AC7(c)).
- `group3.md`'s Item-C cost line 3 said the run-config UI "needs a legal host… That makes Item C **ordered
  after** the §5 app skeleton." Under the placement rule it does not — the config write stays core-hosted.
  **G1 has no dependency on B1.** (The *verdict* — the columns move — is unchanged.)

*Rejected alternative:* inject a `FilesystemInjectionValidator` port into an orchestration-hosted route,
wired by the Application to core's Services. Rejected: it is an `agent-orchestration → core-api` read by any
honest reading, the anti-regrowth guard would fire on the composition edge, and AU21's rule is absolute
("not through colocated DI, not at all"). The same rejection covers the symmetric idea of injecting a
`taskExists` reader so `POST /api/sessions` could move — that is why it stays core-hosted.

**Scope note — what this rule does NOT do in AU26.** The rule decides *which app hosts a route*. It does
**not** re-route core-api's existing direct `sessions` **reads** through a port. `sessions` is an unowned
table today (`table-ownership-guard.ts:360-365`) and AU26 does not give it an owner, so every core-api Layer
route that reads it keeps its direct read (ten of them after §D-M.3 adds `routes/bets.ts`), and
`AgentOrchestrationPort` gains **no** new read family. Rounds 1–3 planned that conversion
(`AgentOrchestrationPort.sessions`' four-to-five-method family); it is AU28's — §14 finding 1 carries the
full site list.

**Round 5 correction — what AU26 *does* do, and why it is not this.** §D-M restores four core-api **Service**
sites: two misplaced **writes** (`policy/handoff-protocol.ts`, `work/bet-kill-cascade.ts`) that become
downward calls under rule 3's third bullet — *"core asking orchestration to change its own record → a direct
downward function call, never a Port method"* — and two **deletions**
(`work/work-service.ts`'s decoration subquery, `review/session-review-creator.ts`'s redundant read). None of
them is a read conversion, none adds Port surface, and none needs an ownership rule to be seen as misplaced.
Of the six core-api Service `sessions` touchers at `origin/main`, two remain after AU26 —
`policy/lifecycle-propagation.ts` and (post-C3) the relocated WS subscribe authorizer — both reads core
genuinely consumes, both AU28's.

#### The `sessions-routes.ts` split — four registrations move, one stays

**The file cannot move wholesale.** Its import block (`:1-33`) is:

```ts
import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import { readServerConfig } from "@hyperidle/settings";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
```

`@hyperidle/work`, `@hyperidle/users` and `@hyperidle/settings` are **core-api Services**, and all five
symbols are called inside `POST /`'s `db.transaction` (`:396-424`). Moving the file would make
`agent-orchestration` import core-api Services — the exact violation this WP exists to delete — and
`scripts/composition-edge-anti-regrowth-guard.ts` (verified at HEAD: `DEFERRED_FOLLOWUP = new Set([])` at
`:417`, `ALLOWLIST`/`STATELESS_METHODS` absent) would fire on it.

**The split, per route, derived from rules 2–3 with the handler bodies open. Paths do not change (rule 7).**

| Registration | Tables touched | Host | What the builder does |
|---|---|---|---|
| `:321` `GET /` (list, `?task_id=&agent_id=&state=`) | `sessions` | **orchestration** | moves verbatim; the `@hyperidle/db` `sessions` import moves with it and becomes an in-layer read |
| `:352` `POST /` | `tasks` + `users` + `server_config` + `explicit_session_starts` + `agent_work_intents` + `sessions` | **core-api — stays** | see below |
| `:512` `GET /starts/:startId` | `explicit_session_starts` + `sessions` | **orchestration** | the *route* moves; the projection triple does **not** move with it — it is shared with `POST /`, see below |
| `:529` `GET /:id/activity` | `sessions` + the agent-execution activity buffer | **orchestration** | moves, and **drops the `AgentOrchestrationPort` indirection** (`:536-539`) — the buffer is in-layer for orchestration, so the port hop is pure overhead once the route is on the right side |
| `:557` `PATCH /:id` (incl. the abort branch, `applyStateChangePatch` CAS `:259-263`) | `sessions` + `agent_session_requests` + `sessionRunRegistry` | **orchestration** | moves with `applyStateChangePatch`, `updateSessionSchema`, and the `transitionRun` call (which becomes in-layer, dropping `services/run-orchestration-composition.ts`) |

Four registrations land in `packages/agent-orchestration/src/routes/sessions.ts`. **`POST /api/sessions`
stays in `packages/core-api/src/routes/sessions-routes.ts`**, which shrinks to that one handler. It keeps
its two remaining raw `sessions` touches unchanged — `projectExplicitStart`'s row read (`:63-68`) and the
legacy bare-insert path (`:481-499`, which fires only when `!durableStartEnabled` and no `Idempotency-Key`).
Neither needs to change: `sessions` is unowned, AU26 does not move it, and converting them is §14
finding 1's work, not this WP's.

> **Accepted as already built, not required (noted 2026-08-04).** B1a, in flight when the scope ruling
> landed, had already converted both — `packages/agent-orchestration/run-orchestration/src/create-bare-run.ts`
> owns the legacy insert plus the `session_started` emit, and `AgentOrchestrationSessionWireRow` +
> `getById` land the 202 row read on the port at full 18-column width. **This is not reverted.** It is a
> natural, small rider on the split the WP does perform (core's `POST /` no longer shares a file with the
> handlers that own the runtime), it is already green, and undoing it would be churn against a live
> increment. It is recorded here as an over-delivery against AC5, not as an AU26 requirement — if any part
> of it regresses, the fallback is the direct read/insert, not more port surface.

E3/F2 shrink this handler further: `resolveInjectedConnectionsForAgent` and
`resolveInjectedFilesystemsForAgent` are **deleted** from the bake (orchestration reads its own tables
in-layer at provisioning), leaving `requireRunnableAgent` + `readServerConfig` as the only Service deps
`resolveSessionStartRequest` still takes.

**The projection triple — one home, named, because both apps need it.** `GET /starts/:startId` moves but
`POST /` stays, and `POST /` calls `projectExplicitStart` at `:439`, `:460`, `:464` and `sendStartProjection`
at `:440`, `:482`, `:521`. Duplicating the triple would give one wire shape two implementations (the
202/422/429/500 projection AC5(b) asserts is byte-identical), and `tsc` catches an outright omission but
never silent divergence. The single home, split by what each piece actually needs:

| Piece | Home | Why |
|---|---|---|
| `pendingStart(start)` (`:48-58`) + the failure-code→status map (`:69-79`) | **`@hyperidle/shared/http`**, as one pure function `projectExplicitStartOutcome(start, session \| null) → { status, body }` | Zero table access — it is a pure transform over rows the caller already holds. `shared` is the only package both apps may import, and A1 is already creating `@hyperidle/shared/http` |
| `sendStartProjection(c, projection)` (`:84-100`) | **`@hyperidle/shared/http`**, beside it | Pure Hono; `Context<HyperIdleEnv>` lands in `shared/http` in A1 anyway |
| the `sessions` row read | **stays with each caller, direct** | orchestration's `GET /starts/:startId` reads in-layer; core's `POST /` keeps its existing direct read at `:63-68` |

Neither app imports the other's route module, so AC5(a)'s static guard is unaffected.

**Consequence for the split family.** `/api/sessions/*` is now served by **two** apps (core: `POST /`;
orchestration: the other four). Feasibility P1 and P5′ prove two sub-apps mounted at the same prefix both
route — but it makes a duplicate `method + path` across the apps resolve silently by registration order.
Closed by **AC10**'s route-table collision assertion.

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
that only the **root** `notFound` fires. P5′ proves the *interleaved* case (same path prefix, different
methods, two apps) routes correctly.

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

Weighed against the alternatives:

- **Each Application owns a duplicated bootstrap.** Post-B1a the residual per-Application bootstrap is
  small: open db, EventBus, wsHub, mcpBridge, call both boots, apply the middleware stack, mount both apps,
  the root `notFound` branch, `serve`, dispose. And 5 of the 7 "sites" are **not production Applications** —
  three are `web/scripts/*-test-server.ts` harnesses and two are core-api's own shipped fixtures, all of
  which may legitimately share a *test* helper (they already share `test-utils.ts`/`test-fixtures.ts`). The
  real duplication is **two Applications**, not seven. **The alternative is cheap, and it is still rejected
  — but on the reason below, not on cost.**
- **A third neutral composition package.** Forbidden outright (requirements §7 out #9).
- **`desktop` spawns `remote-server` as a child process.** Superficially attractive: `desktop` already
  speaks HTTP to the server over `127.0.0.1` on an OS-assigned port (`boot-server.ts:28-31`, `waitForHealth`
  at `:49`), so nothing in the Electron shell depends on being in-process. **Rejected on a shipped decision,
  not on taste:** the only in-process difference between the two Applications is the injected
  `adapterPool`/`workspaceAdapter` (`createLocalAdapterPool()` + `createSandboxAdapter("local")` for desktop
  vs an empty `AdapterPool` + `"disabled"` for remote-server), and selecting those by environment is
  precisely the `HYPERIDLE_PROFILE` runtime branch **AU19 Increment 5 deliberately deleted**
  (`boot-server.ts:7-14` `@lore`). Re-introducing it to avoid one import would undo a settled simplification
  and trade a compile-time-checked injection for an env-string branch.

**The decision stands on the import that already exists.** `desktop` imports
`@hyperidle/core-api/server-factory` **today** (`boot-server.ts:15-18`) and `remote-server/src/index.ts:22`
imports the same module; re-pointing `desktop` at `@hyperidle/remote-server/create-server` swaps one
Application→Layer-composition import for one Application→Application import. It invents no relationship class,
satisfies `runtime-simplification.md`'s Applications rule ("only wiring/bootstrap") at both ends, and the
requirement forbids the third package. **Still flagged as the most arguable call in this document.** If it is
rejected, the fallback is the duplicated bootstrap at its post-B1a cost — do not resolve it by inventing a
package, and do not resurrect `HYPERIDLE_PROFILE`.

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

**The subscribe authorizer moves verbatim.** It keeps its direct `sessions` read
(`ws-connection-hub.ts:1`, `:169`, `:204`), its `canSubscribeToTaskFreeSession` branch (`:167-184`) and all
four DI edges (`conversation`, `users`, `org`, `work`). *(Rounds 1–3 planned to decompose it — an
orchestration-exported `getSessionSubscribeContext` plus deleting the `deps.work` existence check as
FK-redundant. Both were driven by `sessions` ownership, which AU26 does not do; cut to §14 finding 1. The
FK-redundancy proof — `sessions.taskId` FK to `tasks.id`, `onDelete:"restrict"`, `schema.ts:229`,
feasibility P4 — is a real, verified finding and is handed on rather than acted on here.)* The dissolution
is therefore a package move: same file contents, new directory, one importer re-pointed.

**Who owns the surviving connection-registry behaviour:** the `core-api` **Layer** (not a Service, not
`shared`). It is HTTP/WS transport composed by the Layer, driven from the outside by whoever pushes.
Orchestration receives `{ broadcast }` as an injected port from the Application — the same one-method
structural interface `services/session-activity-gateway.ts:37` already declares — so there is exactly **one**
WS listener and **one** topic space, and `packages/web/src/hooks/useSessionActivity.ts`'s WS URL does not
change.

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
  itself (rules 2/3), not from convenience: the `/api/ws` endpoint's subscribe authorizer must touch
  `threads` (`senderInThread`), `users` + `team_members` (`senderInTeam`, reachable from
  `canSubscribeToTaskFreeSession` at `ws-connection-hub.ts:167-184`) **and** `sessions`. That is a two-sided
  table set, and rule 3 gives a two-sided route exactly one legal host: core-api. The only ways to close it
  fully are (a) let orchestration read `threads`/`users`/`team_members` — forbidden outright, or (b) open a
  **second** WS listener owned by orchestration for the `session:` topic alone — which re-splits one socket
  and one topic space into two, and still cannot authorize the task-free branch without (a).
  **This is a narrowing of a founder-written acceptance criterion and is put to the founder as such, at the
  realtime confirmation point (before C3).** If the founder rejects the narrowing, the only honest way to
  satisfy it is to move thread/team subscribe authorization out of the socket entirely (a signed subscribe
  token minted by core at snapshot time), which is a new design and a separate WP — not something to
  smuggle into AU26.

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

### D-G · `harness-capability-read-model` (requirements §9 item 6)

**→ `@hyperidle/shared` (`src/harness/harness-capability-read-model.ts`), main barrel.** Its readers land on
both sides of the boundary after this WP (`routes/connections.ts:204` follows connections to orchestration;
`agent-profile.ts:299,311`, `teams-routes.ts:273,771`, `agents.ts:135,165`, `users.ts:196` stay core), and
Mechanism B forbids the orchestration side importing a core-api module. It is six stateless forwarders over
an injected handle — no table, no lifecycle, no domain: the dissolve-into-`shared` case, identical to what
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
an optional field. Nothing branches on either. Under requirements §2 that is rendering, not a use — it does
not make the module core's, and it moves unchanged.

### D-H · Connections (Decision J, with J6 superseded)

Build J1–J5 and J7 as locked. J6 is replaced by §D-A: connections' routes — **reads and mutations** — go on
`createAgentOrchestrationApp()`. Traced at HEAD, `routes/connections.ts` imports no `@hyperidle/users`, no
`teamMembers` and no `work` — its table set is `service_connections` alone, so §D-A rule 2 (not rule 3)
decides it, single-sided. The planned `AgentOrchestrationPort.connections` read family is **not built**
(core-ui dials orchestration-api directly for connections, so there is nothing for a read door to serve);
J7's deletion of `CoreApiPort.connections` stands.

**Ownership.** `table-ownership-guard.ts:144`'s `serviceConnections: "packages/core-api/connections"` row
re-points to `"packages/agent-orchestration/connections"` in **E3**. This is the one guard edit AC1 requires
and the only one connections needs. `UNOWNED_SHARED_TABLES` is untouched — `serviceConnections` was never in
it.

**The paths do not change** (§D-A rule 7): the routes stay at `/api/connections`, `/api/connections/:id`,
`/api/connections/:id/validate`, served by the other app.

`settings`' second consumer (`plugin-configuration.ts:727`) is a **display-only boot-time projection**
(group3.md) with no operational dependence on connections data. Its `ServiceConnectionsReader` port
(declared `:65`, wired `server-factory.ts:985-987`) is **re-pointed** to the relocated Service via the
Application's downward wiring — the port stays, the implementation moves. It does not block "exactly one
Service importer of `serviceConnections`," because the port is a structural interface, not an import.

J8 stands, bounded: the reachability probe's `ServiceConnectionResolver` type-import
(`routes/filesystems.ts:6`) re-points to the relocated resolver, injected by the Application. J8's "reads via
the J6 door" clause dies with J6.

### D-I · Filesystems (§4 Item B, founder-approved split)

| Part | Verdict | Destination |
|---|---|---|
| mount engine — `mounter-registry.ts` (359 lines: `RegistryFilesystemMounter` + `LocalFolderAdapter:64`, `GitCloneAdapter:123`, `GitWorktreeAdapter:160`, `CloudNotBuiltAdapter:46`) + `scaffolding-paths.ts` (`SANDBOX_SCAFFOLDING_PATHS`, zero consumers outside the engine) | **moves** | new SQL-owning Service `packages/agent-orchestration/filesystem-mounting/` |
| `filesystemCaptures` — only non-test writer is the engine (`mounter-registry.ts:327`); `listCaptures` has **zero** non-test readers; FK `session_id → sessions` | **moves with the engine**, and `listCaptures` **deletes** (test-only reachable ⇒ dead surface) | same Service |
| `filesystemInjections` + `resolveInjectedFilesystemsForAgent` | **moves** | new SQL-owning Service `packages/agent-orchestration/agent-filesystems/`; the bake is deleted, orchestration reads its own table in-layer at provisioning |
| the record — `filesystem-registry.ts`'s `filesystems` half | **stays** | `packages/core-api/filesystems` — the one non-configuration core use is real: `routes/knowledge.ts:565` **gates** knowledge-item creation on the filesystem id (400 without a `scopeId`) and `:585` writes `knowledge_items.scopeId` |
| reachability probe — `filesystem-reachability.ts`, `inspect-local-path.ts` | **stays with the record** | writes `filesystems.state` (`routes/filesystems.ts:147` resolve → `:156` `updateFilesystemState`) |

**Ownership.** `table-ownership-guard.ts:252-253`'s two rows re-point: `filesystemCaptures` →
`"packages/agent-orchestration/filesystem-mounting"` (**F1**), `filesystemInjections` →
`"packages/agent-orchestration/agent-filesystems"` (**F2**). `filesystems: "packages/core-api/filesystems"`
(`:251`) is **unchanged** — the record stays core's.

**Two things the split forces, designed here rather than discovered at build time:**

1. **`filesystem-registry.ts:42-44`'s `filesystemInjections ⋈ filesystems` innerJoin decomposes.** This is
   ACL work AU26 *causes*: once `filesystemInjections` has a different owner, the join spans two owners.
   `listFilesystems(db,{agentId})` splits into orchestration's `listInjectedFilesystemIdsForAgent(db, agentId)`
   and core's existing `listFilesystemsByIds`. `GET /api/filesystems?agentUserId=` stays core-hosted **by
   §D-A rules 2/3** — its handler touches `filesystems` (core) and, post-F2, `filesystem_injections`
   (orchestration), so it is two-sided and has exactly one legal host. *(Not "because it renders core
   `filesystems` rows" — the rendering argument `requirements.md:42` outlaws. Stated here because a builder
   working the filesystems split reads this section, not §D-A.)* It composes the two at the route, and
   returns the **identical** `{ filesystems: [...] }` body.
   `packages/web/src/settings/SettingsAgents.tsx:194-198` changes **zero lines** (it only reads
   `.map(f => f.id)`).
2. **The injection write/eject routes stay core-hosted** (`routes/filesystems.ts:328` / `:408`) with their
   team-consistency gate intact (`:337-364`), delegating `saveInjection`/`deleteInjection` down to the
   orchestration Service. `SettingsAgents.tsx:282,290` changes zero lines.

`createGitRunner` — needed by the engine (now orchestration) **and** the probe (still core) — is why §D-F's
extraction to `@hyperidle/shared/git` is sequenced first.

### D-J · `users` / `teams` run-config columns (§4 Item C + group2.md's org finding)

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
`packages/agent-orchestration/agent-run-config/` Service, declared as two new `TABLE_OWNER` rows in **G1**.
Both are clean new-owner additions — neither table exists at HEAD, so neither touches
`UNOWNED_SHARED_TABLES` and no exemption is disturbed.

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
the pre-release smoke against a real populated local DB (§12 risk 3), not a reverse migration.

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
   `settings/src/plugin-configuration.ts:645-661`. *(The seed sites are in-place column edits — the seeders
   themselves do not relocate; that was cut with D2a. See §14 finding 6.)*
3. **The config write route stays core-hosted** and delegates the persist down (§D-A) — so **no dependency on
   the Job 2 skeleton**, and `Settings → Agents` needs no base-URL change at all.
4. `validateAgentConfig` (`routes/agents.ts:118`) validates against the `AdapterPool` + `MODEL_CATALOG` with no
   core dependency — it **moves with the columns**.
5. `agentCategory` and the `users`↔`teamMembers` FK are untouched.

### D-K · The 19 `services/` wiring units (requirements §9 items 2 + 3)

Per requirements §2's wiring rule, none gets an independent verdict; each takes its domain's.

| Unit | Domain it wires | Follows |
|---|---|---|
| `work-state-push-gateway.ts` | **Work's own record state** — the payload is `task_state_changed`/`bet_state_changed`'s `toState` | **stays.** Note the reason: the payload is Work's state, *not* "the charter says so" (requirements §9.2's explicit check) |
| `session-activity-gateway.ts` | **session lifecycle** — subscribes `session_started`/`session_ended`/`tool_call_recorded`, holds subscription lifecycle, pushes `session:<id>` | **moves into `bootAgentOrchestration`** (requirements §9.3 — stated, not deferred). It pushes through the injected `{broadcast}` port, so the one WS listener is unchanged |
| `dispatch-bindings.ts`, `run-orchestration-composition.ts`, `tool-handlers-bindings.ts`, `tool-provider-bindings.ts` | orchestration / execution Services | **move into `bootAgentOrchestration`** |
| `harness-capability-read-model.ts` | not wiring — a stateless read model | **→ `@hyperidle/shared`** (§D-G) |
| `agent-run-admission-reactions.ts`, `work-session-end-reactions.ts`, `work-session-started-reactions.ts` | Work — core reacting to an orchestration event and writing its own tables | stay (`bootCoreApi`) |
| `routine-run-session-end-reactions.ts`, `routine-scheduler-bindings.ts` | Routine | stay |
| `policy-bindings.ts` | Policy | stay |
| `assistant-turn-coherence-trigger.ts` | Conversation (AU27's axis, untouched here) | stays |
| `task-run-resolver-bindings.ts` | Work emit | stays |
| `durable-agent-queue.ts` | the core-side recorder port (core→orchestration, downward) | stays |
| `core-api-port-composition.ts`, `actor-transport-header.ts` | core's own seam | stay |
| `agent-orchestration-port-composition.ts` | core-ui/core-api's **client** of the read door | stays core-api |

### D-L · The reverse-direction check (requirements §3, one grep, one line)

`rg -a` over the non-test source of `agent-orchestration`'s four Service packages (`dispatch`,
`run-orchestration`, `session-requests`, `tool-handlers`) for value imports of a `@hyperidle/db` table
object returns **`sessions` only** (`run-orchestration/src/{concurrency,provisioner,runtime-reapers,runtime,start-runtime,transition-run,writeback-processor}.ts`,
`tool-handlers/src/tool-definitions.ts:23`) plus `session-requests`' own
`agentWorkIntents`/`agentSessionRequests`/`explicitSessionStarts`.
**No core-domain table.** **The reverse direction is clean and closed.** Not re-run per Service, not
re-opened. *(`sessions` is currently unowned; who should own it is §14 finding 1, not this check's business.)*

---

### D-M · Four core-api Service sites doing orchestration's work (restored — founder ruling, round 5)

Round 4 handed these to AU28 as part of "`sessions` ownership". That reading was wrong on both halves:
**none of them needs an ownership rule to be seen as wrong, and none of them is fixed by writing one.** Each
is either core-api **executing a write that belongs to `agent-orchestration`**, or core-api **carrying a read
it does not need**. The founder restored them by name — *"policy, review and work are not cut to AU28. the
move is part of this package."*

**Three properties hold across all four, and they are what makes them AU26's:**

1. **`sessions` still gets no owner.** It stays in `UNOWNED_SHARED_TABLES`
   (`scripts/table-ownership-guard.ts:360-365`); no `TABLE_OWNER` row is added for it; no guard scan scope,
   exemption set or lint rule changes. AC12's *"and nothing else in that file"* is untouched.
2. **No new `AgentOrchestrationPort` methods, and no new read surface.** Checked one by one: D-M.1 and D-M.2
   are **downward function calls** — `core-api → agent-orchestration` is the permitted direction and
   `@hyperidle/run-orchestration` is already a core-api dependency (`packages/core-api/package.json:39`), so
   no package edge is added either. D-M.3 and D-M.4 are **deletions**. §5's *"`AgentOrchestrationPort` gains
   no read family in this WP"* stands unchanged.
3. **Each is provable without the rule.** D-M.1/D-M.2 write another Layer's row and then have to *suppress
   that Layer's own event* to stay correct — a hand-rolled copy of a state transition, not a read. D-M.3/D-M.4
   are dead weight: one is decoration rendered at a route, the other re-reads three fields the event already
   carries and whose sibling handler already reads off the event.

**Net effect on the two Services the founder named by domain:** after H2 and H3, `packages/core-api/work`
and `packages/core-api/review` import the `sessions` table object **zero** times. `packages/core-api/policy`
goes from two to one — `lifecycle-propagation.ts:7,288-293` remains, and it stays because it is a read core
genuinely needs and consumes (see "What does not come back", below).

#### D-M.1 · `policy/handoff-protocol.ts` — the run-end write goes down (increment **H1**)

At HEAD, `handoff-protocol.ts:2` imports the `sessions` table object and `:120-124` writes it inside
policy's own transaction:

```ts
// 1. End current session (state + endedAt).
await tx
    .update(sessions)
    .set({ state: "done", endedAt: now })
    .where(eq(sessions.id, sessionContext.sessionId));
```

The **terminal state** is core's need — a handoff must leave no live run. The **write** is not: it is
`run-orchestration`'s state transition, hand-copied one Layer up, complete with a comment
(`handoff-protocol.ts:102-107`) explaining that `session_ended` must NOT be emitted here.

**The move.** `PolicyDeps` (`packages/core-api/policy/src/ports.ts:24`) gains a `runOrchestration` bag with
one method, in the same Mechanism-C shape its existing `work`/`conversation` bags already use:

```ts
readonly runOrchestration: {
  endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;
};
```

`packages/agent-orchestration/run-orchestration` exports the implementation and the barrel
(`run-orchestration/src/index.ts`) exports it beside `transitionRun` and `createBareRun`. It is wired into
`handoffDeps` at `packages/core-api/src/services/policy-bindings.ts:106` (`buildHandoff(handoffDeps)`) — a
core-api **Layer** wiring file, which may import `@hyperidle/run-orchestration` directly.

**Four properties the implementation must preserve, and they are the whole risk of this increment.**

- **Same transaction.** It is called **with the `tx` handle**, not `db`. The run row must be terminal at the
  same commit the task claim is, or a handoff can commit with a live run.
- **Same fields, same values.** `{ state: "done", endedAt }` — not `crashed`, not an outcome. `endedAt` is
  the caller's `now`, passed in, not re-derived inside orchestration.
- **Still no `session_ended`.** The suppression decision moves to the side that owns the table; it does not
  disappear. A handoff that emits `session_ended` creates a spurious review item on **every** handoff, via
  `review/session-review-creator.ts`.
- **Unconditional.** It writes the row whether or not a matching `agentSessionRequests` row exists.

**The three traps a previous design hit. Re-stated here so they are not re-hit; each verified at HEAD.**

- **(a) The existing `session_handoff_completed` subscriber does not end the session.**
  `run-orchestration/src/start-runtime.ts:320-336` subscribes and calls
  `ports.sessionLifecycle.requestAgentTermination(...)` **only if**
  `findSessionRequest({ by: "sessionId" })` returns a row. That transitions the *request*, never
  `sessions.state`. Routing the handoff's run-end through this subscriber would silently do nothing for any
  session with no request row, and would in any case be post-commit rather than in-tx. **Do not delete the
  write and lean on this subscriber.**
- **(b) The runtime path that does write the row emits `session_ended`.** `endSession` →
  `updateSessionRow` (`run-orchestration/src/transition-run.ts:363-376`) is the obvious-looking reuse and is
  wrong twice: it CASes on `state = "active"` (a handoff on a non-active run would silently no-op) and its
  caller emits `session_ended`. `endRunForHandoff` is therefore a **new, separate export**, not a call into
  `endSession`.
- **(c) The reaper does not cover the gap.** `run-orchestration/src/runtime-reapers.ts:178-184` selects
  `state = "active" AND ${sessions.routineId} is not null AND startedAt < cutoff` — **routine sessions
  only**. A handed-off session left `active` is never reaped. There is no safety net behind this write.

**Protected tests (also listed in §10), asserting exactly these semantics — re-wire, never weaken:**
`packages/core-api/src/__tests__/handoff-to.integration.test.ts` (run row terminal at commit **and** no
`session_ended` / no review item) and `af7-handoff-revokes-tools.test.ts` (the runtime-teardown half).

#### D-M.2 · `work/bet-kill-cascade.ts` — the run-stop write goes down (increment **H2**)

`bet-kill-cascade.ts:1` imports `sessions`; `:58-61` selects the active runs per task and `:66-70` stops each
with a CAS write, deliberately suppressing `session_ended` (`@lore` `:24-26`). Same shape as D-M.1: a genuine
core need — killing a bet must stop its runs — executed as another Layer's write.

**The move.** `run-orchestration` exports:

```ts
requestRunStopForTasks(
  exec: WriteExecutor,
  taskIds: readonly string[],
  opts: { reason: "bet_killed" },
): Promise<ReadonlyArray<{ taskId: string; sessionId: string }>>;
```

The select, the CAS on `state = "active"`, the `{ state: "stopped", outcome: "stopped", endedAt }` values and
the no-`session_ended` decision all move to orchestration's side. It returns the runs it actually stopped, so
`work` still writes its own `propagation_log` hop per stopped run — that row is core's (`policy` owns the
concept; `work` writes it today) and does **not** move. It is wired through the deps object
`routes/bets.ts:667` already passes to `cascadeBetKill`, from `@hyperidle/run-orchestration`.

**Preserve:** the 0-row-CAS branch (`bet-kill-cascade.ts:72-73`) must stay observable to `work` — an
already-stopped run must still write **no** phantom `propagation_log` row. That is why the export returns the
stopped set rather than a count. `cascadeBetKill`'s return shape
(`{ tasksKilled: string[]; sessionsStopped: string[] }`) is unchanged.

#### D-M.3 · `work/work-service.ts` — the `latestSessionOutcome` subquery is deleted (increment **H2**)

`work-service.ts:50` imports `sessions` for exactly one thing: the correlated subquery at `:382-386` behind
`list(exec, "task", { betId, include: "latestSessionOutcome" })`. Its sole caller is
`packages/core-api/src/routes/bets.ts:376`, and the value is rendered as a status chip
(`packages/web/src/shell/TaskSheet.tsx:422`, sorted at `WorkBet.tsx:105-106`).

**Rendering is not a use.** Delete the `include: "latestSessionOutcome"` overload
(`work-service.ts:296-301`), its branch (`:363-393`), the `BetTaskWithLatestSessionOutcome` type (`:154`),
and the `sessions` import. `routes/bets.ts` recomposes: `work.list(db, "task", { betId })` plus its own
lookup of the latest outcome per task, merged into the same response field.

**The response body must stay byte-identical** — same field name `latestSessionOutcome`, same `null` for a
task with no run, same ordering — so `packages/web` does not change (AC7(c)).

**Where the read lands, stated plainly rather than left implicit.** `routes/bets.ts` is a core-api **Layer**
route, and it reads `sessions` directly. That is legal today and after AU26 (`sessions` is unowned), and it
makes `bets.ts` the **tenth** core-api Layer route reading `sessions` — §14 finding 1's list grows from nine
to ten. That is the honest trade and it is the right one: the defect AU26 fixes is a **Service** reaching
into a foreign table inside its own query surface; whether a Layer route may read that table at all is the
rule AU28 writes, and it will convert all ten in one pass rather than nine plus a straggler.

Also delete `work-service.ts:29-38`'s *"foreign-import ceiling"* `@lore` — its last sentence (*"The one
remaining foreign read here … predates and is unaffected by this ruling"*) stops being true, and the
standing ruling is zero exceptions. `routes/bets.ts:369-371`'s comment citing the same ceiling goes with it.

#### D-M.4 · `review/session-review-creator.ts` — the redundant read is deleted (increment **H3**)

`session-review-creator.ts:1` imports `sessions`; `:50-54` re-reads the session row on `session_ended`. It
uses exactly three fields — `taskId` (`:58`, `:64`), `agentId` (`:78`, `:79`, `:87`, `:91`, `:102`) and
`outcome` (`:112`) — and **all three are already on the event**: `SessionEndedEvent.agentId`
(`packages/shared/src/events.ts:145`), `.taskId` (`:146`), `.outcome` (`:153`). The proof that this is free
is in the same file: the sibling handler at `:137-141` already reads them straight off the event, with the
comment *"SessionEndedEvent carries agentId and taskId directly — no DB lookup needed."*

**The move is a deletion.** Drop the query, drop the `sessions` import, read the three fields off `event`.
Two equivalences to hold:

- The `if (!session?.taskId) return;` guard becomes `if (!event.taskId) return;` — identical outcome. The row
  existence check it doubled as is redundant: the event fires only for a session that ended.
- `session.outcome ?? "completed"` becomes `event.outcome`, which is non-optional `SessionOutcome` on the
  event type, so the `??` fallback is unreachable and goes with it.

#### What does **not** come back, and why — stated so this is a line, not a preference

Round 5 restores the four sites above. It does **not** restore the rest of §14 finding 1, and each exclusion
is decided on the same test §2 states, not on where the round-4 cut happened to land.

- **The ten core-api Layer routes that read `sessions`** — `routes/{agent-profile,agents,recipients,`
  `sessions-routes,status,tasks,teams-routes,threads,users}.ts` plus `bets.ts` after D-M.3. **AU28.** Three
  reasons, any one sufficient. (i) Nothing is misplaced: each reads a foreign table to decorate its own
  response, and the read is correct where it stands. The only argument for touching them is *"core may not
  read `sessions`"* — the rule AU28 writes. (ii) Closing them requires a **five-method port family**
  (`listActive`, `listByAgentIds`, `listByTaskId`, `latestOutcomeByTaskIds`, plus the narrowed decoration
  row) built solely to serve that rule — new read surface, which §D-A rule 3 and the "no new port methods"
  bar both forbid here. (iii) There is a live, untested regression hazard in the narrowing: `sessions` has 18
  columns and no `packages/web` file consumes the 202 body, so a seven-field decoration row would silently
  drop 11 fields with nothing catching it (§14 finding 1).
- **`policy/lifecycle-propagation.ts:288-293`** — the active-run count gating `in_progress → review`.
  **AU28**, even though it sits in `policy`, which the founder named. It is not the same kind of thing as
  D-M.1: it is a **read core genuinely needs and consumes** (the count drives the transition, and its rows
  feed the `${n} other active session(s) still running` skip message at `:301`), it performs no foreign
  write, and it suppresses nothing. It is the Service-level twin of the ten Layer routes, and it converts
  with them, in one pass, under one rule. Recorded explicitly rather than silently, because "policy" was
  named: if the founder wants it in AU26 too, it is a small increment of the D-M.2 shape
  (`PolicyDeps.runOrchestration.countOtherActiveRunsForTask`, wired at the same `policy-bindings.ts:106`
  site H1 already edits) and lands beside H1 with no re-planning.
- **`realtime`'s subscribe authorizer decomposition** (`ws-connection-hub.ts:1,169,204`) — **AU28.** Same
  category: a read the authorizer needs, no foreign write. Note the distinction that matters here: **the
  `realtime` package dissolution IS restored** (increment C3, §D-E) because it is a move; the authorizer's
  `sessions` **read** moves with it verbatim and is not converted. The FK-redundancy free rider
  (`sessions.taskId → tasks.id`, `onDelete:"restrict"`, `packages/db/src/schema.ts:229`, feasibility P4) is
  a real proof and is handed on unused, not acted on.
- **`tool-handlers/src/tool-definitions.ts:519-522`** (`write_session_notes`) — **AU28.** It is inside
  `agent-orchestration` already; nothing crosses a Layer. Whether one orchestration Service may write
  another's table is exactly the interface definition AU28 writes.
- **`POST /api/sessions`'s two raw touches** — see §D-A's accepted-as-built note and §D-M.5.

#### D-M.5 · Ruling on B1a's `AgentOrchestrationPort.getById` — it **stands**

`AgentOrchestrationSessionWireRow` + `getById` were added by increment B1a (committed `a653df7f`) and a
revert was started and abandoned. Under §2's line, the ruling is **keep**, and the reason is not "it is
already built":

- **It is the read-back half of a move AU26 does perform.** B1a moved the legacy bare-insert **and** its
  `session_started` emit out of `packages/core-api/src/routes/sessions-routes.ts` into
  `packages/agent-orchestration/run-orchestration/src/create-bare-run.ts` — a D-M.1-shaped misplaced write,
  squarely AU26's. In the same act the file shed its `sessions` table import entirely. Reverting only the
  read would leave `sessions-routes.ts` **re-importing the table it just stopped writing** for one row read —
  a state worse than either end, and one no rule in this document asks for.
- **It creates none of the surface the exclusion above is about.** The five-method decoration family is what
  AU28 builds and what is forbidden here. `getById` is one method, serving one route AU26 itself
  restructured, and it returns the **full 18-column** wire row on purpose
  (`packages/api-contract/src/agent-orchestration-port.ts:49-59`), so the narrowing hazard that made the
  decoration family risky does not exist for it. AC5(d) is the standing regression guard.
- **The Port stays read-only.** `agent-orchestration-port-readonly.integration.test.ts` is unmodified.

Recorded as an **over-delivery against AC5**, not an AU26 requirement: if it ever regresses, the fallback is
the direct read, not more port surface.

---

## 5. Contracts

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
// UNCHANGED subpath exports (eval depends on both — AC8):
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
/** §D-A, the projection triple — pure, zero table access; both apps need it. */
export function projectExplicitStartOutcome(start: ExplicitStartRow, session: SessionRow | null):
  { status: number; body: unknown };
export function sendStartProjection(c: Context<HyperIdleEnv>, projection: { status: number; body: unknown }): Response;
```

```ts
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
```

```ts
// packages/agent-orchestration/run-orchestration/src/index.ts — §D-M's two downward calls.
// Both are plain exported functions on the existing barrel, NOT Port methods.

/** D-M.1 (H1). Ends the run a handoff just superseded. Called WITH the caller's transaction
 *  handle so the run row is terminal at the same commit as the task claim. Writes
 *  `{ state: "done", endedAt }`, unconditionally (no CAS on `active`), and emits NO
 *  `session_ended` — the suppression the handoff needs is owned here, not one Layer up. */
export function endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;

/** D-M.2 (H2). Stops every active run on the given tasks. CAS on `state = "active"` for
 *  idempotency, `{ state: "stopped", outcome: "stopped", endedAt }`, no `session_ended`.
 *  Returns only the runs it ACTUALLY stopped, so the caller writes no phantom
 *  `propagation_log` row for an already-stopped run. */
export function requestRunStopForTasks(
  exec: WriteExecutor,
  taskIds: readonly string[],
  opts: { reason: "bet_killed" },
): Promise<ReadonlyArray<{ taskId: string; sessionId: string }>>;
```

```ts
// packages/core-api/policy/src/ports.ts — PolicyDeps gains one Mechanism-C bag (H1)
readonly runOrchestration: {
  endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;
};
```

**`AgentOrchestrationPort` gains no read family in this WP.** The five-method `sessions.*` family rounds 1–3
planned (`listActive`, `listByAgentIds`, `listByTaskId`, `latestOutcomeByTaskIds`, and the decoration
narrowing) is cut to §14 finding 1. Its two existing methods (`listSessionHistoryBySource`,
`getRecentActivity`) keep working — their backing routes move to orchestration's own app at unchanged paths
(§D-A rule 7), so the port composition is unaffected. **One exception, already built and kept:**
`AgentOrchestrationSessionWireRow` + `getById`, added by B1a for `POST /api/sessions`'s 202 projection at
full 18-column width (§D-A's accepted-as-built note). Both are readonly; the Port stays read-only and
`agent-orchestration-port-readonly.integration.test.ts` stays green unmodified. §D-M.5 gives the ruling on
`getById` under the round-5 line, on its merits rather than on it being already built. **§D-M's two restored
writes add no Port surface at all** — they are downward function calls on `run-orchestration`'s own barrel,
and `@hyperidle/run-orchestration` is already a core-api dependency (`packages/core-api/package.json:39`), so
they add no package edge either.

**Barrel discipline (Mechanism A):** every new SQL-owning Service barrel exports typed functions only — never
`serviceConnections`, `filesystemCaptures`, `filesystemInjections`, `agentRunConfig`.

---

## 6. Route checklist

**Regenerated from the actual registrations, not from prose.** Verified at HEAD:
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
| `GET /api/tasks/:id/sessions` | **core-api (stays, handler unchanged)** | `routes/tasks.ts:186` | **none** — `useTaskSessions.ts` untouched |
| `POST /api/tasks/:id/handoff` | **core-api (stays, handler unchanged)** | `routes/tasks.ts:~285` | none |
| `GET/POST/DELETE /api/connections`, `POST /api/connections/:id/validate` | **orchestration** | `core-api/src/routes/connections.ts:195,230,330,364` | **none** — the path stays `/api/connections*`, so `SettingsConnections.tsx` is untouched |
| `GET/PATCH /api/observability*` (4) | **DELETED** | `routes/observability-routes.ts` | none (zero callers) |
| `GET/PATCH/POST /api/git-export*` (4) | **DELETED** | `routes/git-export-routes.ts` | none (zero callers) |
| `GET /api/filesystems`, `GET /api/filesystems/:id`, `POST /api/filesystems`, `DELETE /api/filesystems/:id`, `POST /:id/injections`, `DELETE /:id/injections/:agentUserId` | **core-api (stay)** | `routes/filesystems.ts:180,250,266,299,313,328,408` | **none**, decomposed internals only (§D-I) |
| `PATCH /api/agents/:id`, assistant PATCH | **core-api (stay)** | unchanged host, persist delegated down (§D-A) | **none** |
| `/api/ws` (user WS) | **core-api (stays)** — §D-E, validation scenario 4's WS half, explicitly narrowed | `app.ts` pre-auth hook | none |
| `/api/ws/worker`, MCP bridge | **orchestration** (Application registers pre-auth) | `app.ts` hooks | none |

**Net `packages/web` diff for this WP: zero files.** Holding every path string constant removes every reason
a web file would change. AC7(c) asserts it.

**Guard obligation:** every route file that moves to `packages/agent-orchestration/**/routes/**` must keep its
`requireBoundary({...})` declaration, and `eslint.config.ts:514-531`'s `files` glob must be extended from
`packages/core-api/src/routes/**/*.ts` to also cover `packages/agent-orchestration/**/routes/**/*.ts` —
otherwise the AF11 rules silently stop covering the moved routes.

**Collision obligation (forced by rule 7):** with both apps mounted at `/api` and `/api/sessions/*` split
across them, a duplicate `method + path` would resolve silently by registration order instead of erroring.
**AC10** asserts the merged route table has no duplicate `method + path` pair.

## 7. Security & abuse cases

| Case | Applicable? | Addressed |
|---|---|---|
| **Auth on relocated routes** | **YES — the highest-risk item in this WP.** A route that moves to a second app could land outside the auth middleware | The Application applies the stack on the shared `/api` router **before** mounting either app. Feasibility P1 proves it covers both. **Test: an unauthenticated request to each moved route returns 401** — a real integration test per moved route family, against the routes that exist: `GET /api/sessions`, `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id`, `GET /api/connections`, `POST /api/connections`, `DELETE /api/connections/:id`, `POST /api/connections/:id/validate`, `GET /api/agent-orchestration/sessions`. Not an assumption |
| **AF11 boundary declarations** | YES | Route checklist above + the eslint glob extension. `failClosedAssertion()` stays on the shared router, so an undeclared moved route throws in dev/test exactly as today |
| **Rate limit on state-changing endpoints** | YES | Applied on the shared `/api` router (`app.ts:346-356`), inherited by both apps. `POST /api/connections`, the abort write, and the injection writes all keep their bucket |
| **Secret handling — held connection tokens** | YES | AN1 hard-rule 1 unchanged: `encryptedToken` never leaves the resolver; `resolveInjectedConnectionsForAgent`'s byte-for-byte response shape is deleted **with** its bake, and the in-layer read replaces it. Per-user isolation (cross-user resolve → `null`, hard-rule 3) is a retained test |
| **Secret handling — crypto primitive move (J1)** | YES | Re-discharge AU21 J3's proof obligation at build time: confirm the key source (`HYPERIDLE_CREDENTIAL_KEY`/`HYPERIDLE_API_KEY` via HKDF) carries no DB read before moving; if it does, only the pure crypto moves and the secret is passed in. Round-trip test against a fixed key+plaintext must match pre-move output |
| **Path traversal** | YES — the mount engine moves | `SANDBOX_SCAFFOLDING_PATHS` and the four adapters move **unchanged**; the relocation is a package move, not a rewrite. Existing adapter tests move with them and must stay green |
| **SSRF** | YES — `lsRemote`/`clone` take a user-supplied URL | `createGitRunner`'s hardened env allow-list and 15-verb whitelist move **verbatim** to `@hyperidle/shared/git`. No behaviour change; its tests move with it |
| **WS subscribe authorization** | YES — the hub relocates | The authorizer moves **verbatim** (§D-E): same `sessions` read, same fail-closed semantics (unknown session → `false`), same four DI edges. A package move, not a rewrite. **Test: subscribing to `session:<nonexistent>` still denies** |
| **Route shadowing across the two apps** | YES — new class, created by §D-A rule 7 | `/api/sessions/*` is served by two apps at the same prefix. A duplicate `method + path` would be shadowed silently by registration order — including, in the worst case, a moved route landing behind a stale core-api registration that never got deleted. **AC10**: assert the merged route table has zero duplicate `method + path` pairs, and that `GET /api/sessions/:id/activity` resolves to orchestration's handler |
| **Input trust on agent-authored fields** | N/A | This WP moves code; it introduces no new agent-authored input field |
| **New credential surface** | N/A | No new credential type. `server_credentials` stays core (`@hyperidle/credentials`), explicitly not re-litigated |
| **Privilege change from the `PATCH /api/sessions/:id` move** | YES | *There is no `POST /api/sessions/:id/abort` route — abort is a branch of `PATCH /api/sessions/:id` (`applyStateChangePatch`, CAS at `:259-263`).* `PATCH /api/sessions/:id` keeps its exact `requireBoundary({kind:"public-data"})` declaration and auth on the new host. **Tests: PATCH by an unauthenticated caller → 401; PATCH on an already-terminal session → 409 (`:181-190`, unchanged); PATCH on a live-runtime session → 202 (`:206-214`, unchanged)** |

---

## 8. Acceptance criteria

AC1–AC7 map to `plan.md`'s seven acceptance criteria; AC8–AC13 and AC15 are this doc's own additions.
**Numeric order is reading order.** Every criterion names its verification. **AC14 is retired and its number
is not reused** — it was the 100→0 ownership-violation countdown, deleted with the round-4 cut and now
AU28's (§14 finding 7).

| # | Criterion | Verification |
|---|---|---|
| **AC1** | `serviceConnections` has exactly one Service importer (`packages/agent-orchestration/connections`); no core-api Service touches the table; K1's bake is gone | (a) `table-ownership-guard.ts:144`'s `TABLE_OWNER.serviceConnections` reads `"packages/agent-orchestration/connections"` and `npm run lint` fails on a fixture core-api Service importing it; (b) `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` and its 8 wiring sites do not exist — a `tsc` failure if any caller survives; (c) **integration test**: add a held connection AFTER an intent is emitted and BEFORE it drains → the connection is provisioned at spawn (proves the in-layer live read, and would FAIL against the bake) |
| **AC2** | All 15 core-api Services have an evidenced whole-service verdict; the reverse direction confirmed once | The three `service-verdicts/*.md` files + `git-export-rechallenge.md` + §D-L of this doc. Static artefact — no test. `/architecture-critique` checks completeness against the 15-name list in requirements §3 |
| **AC3** | Part-level verdicts for the mount engine, the `users` columns, and `WsConnectionHub` | §D-E, §D-I, §D-J. Static artefact |
| **AC4** | The mount engine relocates; record + probe resolved separately | (a) `packages/core-api/filesystems/src/mounter-registry.ts` gone, `packages/agent-orchestration/filesystem-mounting/` present; (b) `TABLE_OWNER.filesystemCaptures` points at it and the guard fails a core-api fixture importer; (c) `filesystems` still owns `filesystems` (`table-ownership-guard.ts:251` unchanged) and the knowledge-scope gate test (`routes/knowledge.ts:565` 400-without-scopeId) stays green |
| **AC5** | Orchestration hosts its own session/harness-streaming routes; documented `WsConnectionHub` verdict | (a) **static** — an import guard (extend `scripts/composition-edge-anti-regrowth-guard.ts` with a `core-api → agent-orchestration route module` check) fails if any file under `packages/core-api/src` imports a module under `packages/agent-orchestration/**/routes/**`; `app.ts` no longer imports `agent-orchestration-sessions-routes.js`; (b) **integration tests** hitting the four routes that actually move — `GET /api/sessions?task_id=&state=`, `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id` — plus `GET /api/agent-orchestration/sessions?...`, through the Application-mounted app, asserting status + body byte-shape unchanged against the pre-move baseline; (c) 401 on each without auth; (d) **`POST /api/sessions`'s 202 body is byte-identical to HEAD** — the explicit-start projection is split across two apps and must not diverge |
| **AC6** | Every relocate verdict is executed here, none parked | The increment table in §13 covers connections, mount engine, captures, injections, `users`+`teams` columns, `observability`, `realtime`, `git-export`, `harness-capability-read-model`, `createGitRunner`, and the orchestration app + route split. Verified by: `packages/core-api/{observability,realtime,git-export}` do not exist; `npm run knip` reports no new dead exports |
| **AC7** | Settings + live session activity behave identically; no frontend behaviour change | (a) route-level integration tests **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, **read as painted output** (`npx playwright screenshot` + read the PNG); (c) **`git diff --stat packages/web` is EMPTY.** §D-A rule 7 holds every path string constant, so no web file has any reason to change. A non-empty web diff is a **failed** AC, not an allowance |
| **AC8** | `packages/eval`'s subpath imports survive | `npm run check` green with `packages/eval` importing `@hyperidle/core-api/session` and `@hyperidle/core-api/routines` unchanged; both subpaths still declared in `packages/core-api/package.json` |
| **AC9** | Unknown `/api/*` still returns the canonical `ApiErrorResponse` JSON 404 | **Integration test**: `GET /api/definitely-not-a-route` → 404 with `{ error, code: NOT_FOUND }` and `content-type: application/json`. Guards feasibility P1's `notFound` trap |
| **AC10** | The two mounted apps do not shadow each other | **Integration test**: enumerate the merged route table on the Application-composed instance and assert (a) zero duplicate `method + path` pairs across `coreApiApp` and `orchestrationApp`; (b) `GET /api/sessions/:id/activity` and `GET /api/sessions` resolve to orchestration's handlers while `POST /api/sessions` resolves to core's (assert via a handler-identifying header or a distinguishing body field the test sets up) |
| **AC11** | Validation scenario 4's two halves are separately proven, and the WS narrowing is on the record | (a) **HTTP half, CLOSED**: an integration test proves `GET /api/sessions/:id/activity` is served by orchestration's app (AC10(b) covers the routing assertion) and returns a body byte-identical to the pre-move baseline; (b) **WS half, NARROWED**: §D-E states the narrowing and its reasoning explicitly, and the founder confirms or rejects it at the realtime confirmation point before C3 (§13). **A silent pass is a failed AC — but silence is not a block.** If no founder answer arrives, C3 proceeds **narrowed**, and the run records the narrowing as `accepted-pending-review` in `.pipeline/work/AU26/progress.json` and appends it to `.pipeline/AU.md` |
| **AC12** *(the relocation ACL — scoped to what AU26 moves)* | Every table AU26 relocates or creates has its owner declared, and the guard fires on a foreign importer | `scripts/table-ownership-guard.ts`'s `TABLE_OWNER` contains, after this WP: `serviceConnections → packages/agent-orchestration/connections` (E3), `filesystemCaptures → packages/agent-orchestration/filesystem-mounting` (F1), `filesystemInjections → packages/agent-orchestration/agent-filesystems` (F2), and new rows `agentRunConfig` + `teamRunConfigDefaults → packages/agent-orchestration/agent-run-config` (G1). `filesystems` (`:251`) is unchanged. `--fixtures` proves the guard fires on a core-api Service importing each of the five. **`UNOWNED_SHARED_TABLES` (`:360-365`) is NOT touched by this WP** — none of the five tables is in it, and the set's fate is AU28's (§14 finding 3) |
| **AC13** | Whole-change correctness | `npm run verify` |
| **AC15** *(round 5 — the four restored moves; §D-M)* | `work` and `review` hold **zero** `sessions` table touches; `policy` holds exactly one (the read AU28 converts); the two restored writes are downward calls, and neither adds a Port method | (a) **static**: `rg -a '\bsessions\b' packages/core-api/{work,review}/src --glob '!**/__tests__/**'` returns no `@hyperidle/db` value import, and `packages/core-api/policy/src` returns exactly one (`lifecycle-propagation.ts`) — a `tsc` failure if any deleted symbol survives; (b) **integration test, H1**: `handoff-to.integration.test.ts` unweakened — the run row is terminal **at commit**, no `session_ended` is emitted, no review item is created; plus a case where **no `agentSessionRequests` row exists** for the session, proving trap (a) is not re-hit; (c) **integration test, H2**: killing a bet stops its active runs, and a **second** kill of the same bet writes no additional `propagation_log` row (the 0-row-CAS branch survives the move); (d) **response-shape test, H2**: `GET /api/bets/:id`'s task rows carry `latestSessionOutcome` with byte-identical values incl. `null`, and `git diff --stat packages/web` stays empty; (e) **H3**: the review-item path still fires on `session_ended` for a medium/high-risk task with the DB read gone; (f) `packages/api-contract/src/agent-orchestration-port.ts` gains no method beyond B1a's `getById` (§D-M.5) |

---

## 9. Migrations (renames / removals / moves — every call-site family)

| Change | Sites | Step |
|---|---|---|
| `createApp` → `createCoreApiApp` | `app.ts:305,743`; `server-factory.ts:1124`; `test-fixtures.ts:49`; `test-utils.ts:13`; 11 `*.integration.test.ts` under `packages/core-api` | rename |
| `createServer` → `@hyperidle/remote-server/create-server` | `remote-server/src/index.ts:22,36`; `desktop/src/boot-server.ts:15-18,30`; `web/scripts/{ah1:27/62, ah5:37/140, ah6:45/250}-test-server.ts`; 8 test files (incl. `packages/desktop/__tests__/boot-server.test.ts` and `agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts`) | move + re-point |
| `requireBoundary` / `HyperIdleEnv` / `failClosedAssertion` / `constantTimeStringEqual` → `@hyperidle/shared/http` | every file under `packages/core-api/src/routes/**` + `middleware/**` + `routes/workers.ts:10` + `routes/users.ts:29` | re-point (mechanical) |
| `pendingStart` + failure-code map + `sendStartProjection` → `@hyperidle/shared/http` | `routes/sessions-routes.ts:48-58,69-79,84-100` (definitions), `:439,440,460,464,482,521` (core callers), plus orchestration's moved `GET /starts/:startId` | move + re-point |
| `harness-capability-read-model` → `@hyperidle/shared` | `routes/{connections:204, agent-profile:299,311, teams-routes:273,771, agents:135,165, users:196}.ts` + its test | re-point |
| `createGitRunner` → `@hyperidle/shared/git` | `server-factory.ts:38,1007`; `routes/filesystems.ts:153,260`; `git-export.ts` (deleted anyway) | re-point |
| `resolveInjectedConnectionsForAgent` **delete** | `services/{routine-scheduler-bindings:30,175, task-run-resolver-bindings:15,35, agent-run-admission-reactions:33,127, assistant-turn-coherence-trigger:48,86}.ts`; `routes/{sessions-routes:1,418, threads:14,1489,1726, knowledge:25,961}.ts`; the 6 resolvers' optional dep + `review/{ports:172, session-review-creator:158, proposed-call-workflow:234,263,383,785,822}.ts`; `shared/src/agent-work-intent-recorder.ts:119` (`BakedConnectionForProvisioning` field) | delete |
| `resolveInjectedFilesystemsForAgent` **delete** | the symmetric set (`filesystems/src/index.ts:37` + the same wiring + `shared/src/agent-work-intent-recorder.ts:105`) | delete |
| `CoreApiPort.connections` **delete** | `api-contract/src/core-api-port.ts:631-642` + `GET /connections/provisioning` | delete (J7) |
| `@hyperidle/connections` → `@hyperidle/credentials` | `app.ts:2-10,261-263,493`; `server-factory.ts:938-988,1060`; `routes/{credentials,connections,filesystems:6}.ts`; `packages/shared/src/credential.ts`; `core-api/package.json` | rename (J2) |
| `listCaptures` **delete** | `filesystem-registry.ts:99-110`, `filesystems/src/index.ts:19`, `filesystems-completeness-contract.integration.test.ts:172,178,181,211` | delete (test-only reachable) |
| `users.systemPromptPath` / `users.skills` **DROP COLUMN** | `db/src/factory-bootstrap.ts:110,111,140,141`, `db/src/demo-fixture.ts:108` | drop + strip seeds **in place** (the seeder files do not move — §14 finding 6) |
| `packages/core-api/{observability,realtime,git-export}` **delete package** | `core-api/package.json` deps; `vitest.config.ts:42`; `scripts/typecheck-gate.ts:365,476`; root `package-lock.json` | delete |
| the `/api/observability*` **surface inventory** | `routes/status.ts:41` (a doc comment naming `/api/observability/config`); `src/__tests__/api-availability.integration.test.ts:39` (`{ path: "/api/observability", description: "Observability" }` in the enumerated surface list); `src/__tests__/api-e2e.integration.test.ts:732,856,865,874` (three route tests + one comment) | delete with C2 |
| `sessions` write in `policy` **delete → downward call** (H1) | `policy/src/handoff-protocol.ts:2` (the table import), `:120-124` (the write); `policy/src/ports.ts:24` (`PolicyDeps` gains `runOrchestration`); `src/services/policy-bindings.ts:106` (wires it); `run-orchestration/src/index.ts` (new export) | move (§D-M.1) |
| `sessions` writes in `work` **delete → downward call** (H2) | `work/src/bet-kill-cascade.ts:1,58-61,66-70`; `src/routes/bets.ts:667` (deps object gains the port); `run-orchestration/src/index.ts` (new export) | move (§D-M.2) |
| `latestSessionOutcome` subquery **delete** (H2) | `work/src/work-service.ts:29-38` (the stale `@lore`), `:50` (the import), `:154`, `:215`, `:296-301`, `:363-393`; recomposed at `src/routes/bets.ts:369-376` | delete + recompose (§D-M.3) |
| `sessions` read in `review` **delete** (H3) | `review/src/session-review-creator.ts:1,50-55`; `session.taskId/agentId/outcome` → `event.*` at `:58,64,78,79,87,91,102,112` | delete (§D-M.4) |
| `TABLE_OWNER` rows re-pointed / added | `table-ownership-guard.ts:144` (E3), `:252` (F2), `:253` (F1), two new rows (G1) | edit — **and nothing else in that file** (AC12) |

---

## 10. Protected tests

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
  - packages/core-api/src/__tests__/handoff-to.integration.test.ts                  # H1 — run row terminal AT COMMIT, and NO session_ended / no review item
  - packages/core-api/src/__tests__/af7-handoff-revokes-tools.test.ts               # H1 — the runtime-teardown half of the same handoff
  - packages/core-api/src/__tests__/lifecycle-propagation.integration.test.ts       # NOT touched by AU26 (that site is AU28's) — protected so H1's PolicyDeps edit cannot regress it
```

The `git-export` test files are the **exception**: they are deleted with the feature (C1), by founder verdict.

---

## 11. Shared files (concurrent-WP overlap)

```
sharedFiles:
  - packages/db/src/schema.ts                                  # G1 adds 2 tables, drops 11 columns
  - packages/db/drizzle/                                       # G1 migration
  - packages/core-api/src/app.ts                               # B1a
  - packages/core-api/src/server-factory.ts                    # B1b (relocated)
  - packages/core-api/package.json                             # B1b, C1, C2, C3, E2
  - packages/shared/package.json + src/index.ts                # A1, A2, D-D, E1
  - packages/core-api/src/routes/sessions-routes.ts            # B1a (splits)
  - packages/agent-orchestration/src/routes/                   # B1a creates; E4 adds
  - packages/api-contract/src/core-api-port.ts                 # E3 (J7 deletion)
  - packages/shared/src/agent-work-intent-recorder.ts          # E3, F2, G1 (the bake shape)
  - scripts/table-ownership-guard.ts                           # E3, F1, F2, G1 — TABLE_OWNER rows ONLY (AC12)
  - packages/agent-orchestration/package.json                  # B1a — declares NO dependencies today; load-bearing for the build
  - packages/agent-orchestration/src/index.ts                  # B1a — `export {}` today
  - packages/remote-server/package.json                        # B1b — gains @hyperidle/agent-orchestration + db
  - packages/desktop/package.json + src/boot-server.ts         # B1b (createServer re-point)
  - packages/db/src/{factory-bootstrap,demo-fixture}.ts        # G1 strips the two dropped columns, in place
  - packages/eval/src/seeding.ts                               # G1 re-points the moved run-config columns
  - packages/core-api/policy/src/ports.ts                      # H1 — PolicyDeps gains `runOrchestration`
  - packages/core-api/src/services/policy-bindings.ts           # H1 — wires it
  - packages/core-api/src/routes/bets.ts                        # H2 — cascade deps + the latestSessionOutcome recompose (ONE increment on purpose)
  - packages/agent-orchestration/run-orchestration/src/index.ts # H1, H2 — two new exports
  - scripts/composition-edge-anti-regrowth-guard.ts            # B1a (route-import check), E4
  - eslint.config.ts                                           # A1 (authz glob)
  - vitest.config.ts, scripts/typecheck-gate.ts, package.json  # every package add/remove
```

**AU28 collision warning.** AU28 owns `scripts/table-ownership-guard.ts`'s scan scope, its exemption set and
the ownership of every table AU26 does not move. AU26 touches only `TABLE_OWNER` rows for the five tables it
relocates or creates (§9's last row, AC12). If AU26 and AU28 run concurrently, the merge conflict surface is
that one const — small and mechanical, but real. Sequencing AU26 first is cleaner: it settles four of the
five rows AU28 would otherwise re-derive.

**AU27 collision warning.** AU27 (K2, assistant-turn de-specialization) rewrites
`conversation/src/assistant-turn-resolver.ts` and `dispatch/src/service.ts` — both of which AU26's E3/F2/G1
edit for the bake deletions. **Do not run AU26 and AU27 in parallel.** AU26 first: it deletes the two bakes
AU27 would otherwise have to carry.

---

## 12. Risks and open questions

1. **D-C (`createServer` → `remote-server`) is the one arguable call.** `desktop` ends up importing another
   Application's wiring. Rationale and the rejected alternatives are in §D-C. Flagged for the reviewer; if
   rejected, take the duplication at its post-B1a cost — do **not** resolve it with a new package, and do
   **not** resurrect `HYPERIDLE_PROFILE`.
2. **B1b is the largest single PR** even after the B1a split. If it exceeds a builder session, split further
   at the `registerCoreDomainServices` / `registerAgentLayerServices` seam (each moves into its own Layer boot
   independently, with `server-factory` still calling both).
3. **G1's backfill.** Every existing agent row must get an `agent_run_config` row; agents with all-null
   run-config must still resolve defaults identically. The `desktop` upgrade path is the risk (v0.6.0's PGlite
   hang is precedent) — the migration must be smoke-tested against a real populated local DB, not only the
   test suite.
4. **AU27's `conversational` mode still bakes `modelId`/`modelProvider`** at `assistant-turn-resolver.ts:200-201`.
   G1 deletes that bake. Confirm AU27's plan absorbs the change rather than re-adding it.
5. **H1 is the sharpest single edit in this WP.** It moves a write that is load-bearing for correctness in
   three separate ways (in-transaction, event-suppressed, unconditional) and has **no safety net behind it** —
   §D-M.1 trap (c): the reaper is routine-only, so a handed-off run left `active` stays `active` forever.
   Build it against the protected handoff tests first, and add the "no `agentSessionRequests` row" case
   (AC15(b)) before touching the write — that is the exact case trap (a) makes silently wrong.
6. **H1/H2's wiring sites are files B1b relocates.** `policy-bindings.ts` and the `registerCoreDomainServices`
   block move verbatim in B1b. Whichever lands first, the other rebases — a one-line move, no redesign. H1/H2
   are deliberately **not** made to depend on B1b: making a two-line DI edit wait on the largest PR in the WP
   would buy nothing.
7. **`routes/bets.ts` becomes the tenth core-api Layer `sessions` reader** (§D-M.3). Deliberate and recorded
   in §14 finding 1 so AU28 converts ten, not nine plus a straggler. If AU28 lands first, H2 recomposes
   through whatever door AU28 built instead of a direct read — the response shape is the contract either way.
8. **AU26 creates route files in a directory the ownership guard does not scan.** B1a writes
   `packages/agent-orchestration/src/routes/sessions.ts`, which reads `sessions` directly; the guard's Tier-2
   scan roots are `nestedServiceRoots()` plus a hard-coded `packages/core-api/src` (`:646`, `:664`), so
   `packages/agent-orchestration/src` is never visited. **This is not a regression AU26 introduces** — the
   read is legal either way, because `sessions` is in `UNOWNED_SHARED_TABLES` (`:360-365`). It is, however, a
   real input to AU28's scan-scope work: **§14 finding 4** names it so AU28 sizes against the post-AU26 tree,
   not the pre-AU26 one.

---

## 13. Ordered increments — 17 PRs, 5 waves

Each row is an independently shippable PR to `main` (`npm run verify` green, no stacking). Sizes:
S ≈ ½–1 day, M ≈ 1–2 days, L ≈ 3–5 days. **Wave = computed dependency depth** (`1 + max(wave of
dependencies)`), so a wave is a genuine parallel band: everything in wave *n* can start the moment wave
*n−1* is merged.

| # | Wave | Increment | Size | Depends on | The test that proves it |
|---|---|---|---|---|---|
| **A1** | 0 | `HyperIdleEnv` + `requireBoundary` + `failClosedAssertion` + `constantTimeStringEqual` → `@hyperidle/shared/http`; **plus the pure explicit-start projection** `projectExplicitStartOutcome` + `sendStartProjection` (§D-A — both apps need them, neither may import the other's route module); re-point ~45 route/middleware files; extend the authz eslint glob | M | — | `npm run lint` (authz rules still fire on every route file); `AF11-authz.integration.test.ts` green unchanged |
| **A2** | 0 | `createGitRunner` → `@hyperidle/shared/git`; `harness-capability-read-model` → `@hyperidle/shared` with a structural `HarnessCapabilityReader` | S–M | — | git-runner verb tests move and stay green; `const reader: HarnessCapabilityReader = pool` still compiles; `packages/web` build has no `node:child_process` in its bundle |
| **C2** | 0 | `observability` dissolves (translator+adapter → `shared`, config pair → `settings`, `TraceIdResolver` deleted, 4 routes deleted, package removed) | M | — | dispatcher unit tests move to `shared` and stay green; `rg -a "api/observability"` → zero |
| **E1** | 0 | J1 — AES-GCM primitive → `@hyperidle/shared` (re-discharge the no-DB proof first) | S | — | encrypt→decrypt round-trip matches pre-move output for a fixed key+plaintext; `credential-runtime-path` + `AN2` tests green |
| **G1** | 0 | `users` 6 + `teams` 3 run-config columns → `packages/agent-orchestration/agent-run-config`; **two new `TABLE_OWNER` rows** (AC12); `DROP COLUMN` × 11 incl. the 2 dead; migration + backfill honouring §D-J's written invariant (forward-only, no down-migration); every reader re-pointed; `validateAgentConfig` moves; **strips the dropped columns from the two db seeders in place** (`factory-bootstrap.ts:110,111,140,141`, `demo-fixture.ts:108` — §9) | L | — | migration applies clean against a **populated** local DB (manual smoke, not only the suite); an agent with a per-agent model still resolves it at provisioning; `Settings → Agents` Playwright pass; `agent-profile` render unchanged |
| **H1** | 0 | §D-M.1 — `policy/handoff-protocol.ts`'s run-end write becomes `runOrchestration.endRunForHandoff(tx, sessionId, endedAt)` on `PolicyDeps`; new `run-orchestration` export; wired at `services/policy-bindings.ts:106`. **In-tx, unconditional, still no `session_ended`.** Traps (a)/(b)/(c) in §D-M.1 | S–M | — | `handoff-to.integration.test.ts` unweakened (terminal at commit, no `session_ended`, no review item) **plus a new case with no `agentSessionRequests` row** (trap a); `af7-handoff-revokes-tools.test.ts` green; `lifecycle-propagation.integration.test.ts` green (untouched site) |
| **H2** | 0 | §D-M.2 + §D-M.3 — `work`'s two `sessions` touches, one PR because both edit `routes/bets.ts`: `bet-kill-cascade`'s select+CAS-stop becomes `requestRunStopForTasks(db, taskIds, {reason:"bet_killed"})`; the `latestSessionOutcome` subquery + overload + type are deleted and recomposed at the route. **`packages/core-api/work` sheds its `sessions` import** | M | — | killing a bet still stops its active runs, and a **second** kill writes no extra `propagation_log` row (0-row-CAS branch survives); `GET /api/bets/:id`'s `latestSessionOutcome` values byte-identical incl. `null`; `git diff --stat packages/web` empty |
| **H3** | 0 | §D-M.4 — `review/session-review-creator.ts`'s session row read deleted; `taskId`/`agentId`/`outcome` read off `SessionEndedEvent`. **`packages/core-api/review` sheds its `sessions` import** | S | — | the review-item path still fires on `session_ended` for a medium/high-risk task with the DB read gone; the liveness-net sibling handler (`:137-141`) unchanged |
| **B1a** | 1 | `createApp`→`createCoreApiApp` (drops the orchestration mount, worker-WS hook, `SessionActivityBuffer`); `createAgentOrchestrationApp()` + `packages/agent-orchestration/src/routes/{sessions,agent-orchestration-sessions}.ts`; `bootCoreApi`/`bootAgentOrchestration`; `session-activity-gateway` moves into orchestration's boot; **`sessions-routes.ts` splits 4-move/1-stays per §D-A — `POST /api/sessions` stays core-hosted; as built it also relocated the legacy bare-insert to `run-orchestration`'s `createBareRun` and put its 202 row read on `AgentOrchestrationPort.getById` at full 18-column width. Both stand (§D-M.5)**; **`server-factory` still mounts both**. **Named deliverable: `packages/agent-orchestration/package.json` gains `dependencies` — it declares none today** (`hono`, `zod`, `drizzle-orm`, `@hyperidle/{db,shared,api-contract,session-requests,run-orchestration}`, matching the moved handlers' import block at `sessions-routes.ts:1-33`), **and its barrel stops being `export {}`** | L | A1 | `app.ts` no longer imports the orchestration routes (import guard); integration tests hit `GET /api/sessions`, `GET /api/sessions/starts/:id`, `GET /api/sessions/:id/activity`, `PATCH /api/sessions/:id`, `POST /api/sessions` and `/api/agent-orchestration/sessions` through the mounted app with identical bodies; 401 without auth; **AC10** (no duplicate `method + path` across the two apps); **AC5(d)** the 202 body is byte-identical; **feasibility P5′** is the checked-in probe for this exact interleaved shape |
| **C1** | 1 | `git-export` exporter deletes; package removed; doc claims reconciled | M | A2 | `npm run knip` clean; `rg -a "api/git-export"` → zero; `npm run verify` |
| **E2** | 1 | J2 — rename to `@hyperidle/credentials`, LLM-key catalog only | M | E1 | `server-factory.resolver.test.ts`'s `instanceof DbCredentialResolver` invariant; `/api/credentials` unchanged |
| **B1b** | 2 | `createServer` → `packages/remote-server/src/create-server.ts`; Application owns db/EventBus/wsHub/MCP-bridge, the middleware stack, and mounts both apps; re-point 5 non-test callers + 8 test files + 2 fixtures. **Named deliverable: `packages/remote-server/package.json` gains `@hyperidle/agent-orchestration` and `@hyperidle/db`** — it declares only `core-api`/`harness-registry`/`shared` today, and it cannot mount an app it does not depend on | L | B1a | `server-disposal.integration.test.ts` + `server-factory.resolver.test.ts` green; **AC9** (`/api/nope` → JSON 404); the 240 fixture-based tests unchanged |
| **E3** | 2 | J3 — SQL-owning `packages/agent-orchestration/connections`; **`TABLE_OWNER.serviceConnections` re-pointed** (AC1(a), AC12); provisioning in-layer; **delete K1's bake** (6 resolvers + 8 wiring sites); delete `CoreApiPort.connections` + `GET /connections/provisioning` | L | E2 | **AC1(c)** the add-after-emit test; `run-orchestration-connections-provisioning-edge-closed` still asserts zero `app.fetch`; per-user isolation; guard `--fixtures` fires on a core-api Service importing `serviceConnections` |
| **C3** | 3 | **(round 5: kept — a trim to verdict-only was proposed and is overruled; a dissolution is a move, §2)** `realtime` dissolves into `packages/core-api/src/` — the hub and the subscribe authorizer move **verbatim**, keeping their direct `sessions` read and all four DI edges (§D-E); package removed. Its `realtime` importer reference is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:65`) | S | B1a, B1b | `ws-broadcaster.no-session-forwarding.test.ts` green; subscribe to `session:<nonexistent>` still denies; thread-participant authz unchanged; **AC11(b)** — the WS narrowing is recorded, whether or not the founder answers |
| **E4** | 3 | J4′ — connections routes onto orchestration-api **at their unchanged paths** (`/api/connections*`); `settings`' MCP projection port re-pointed via the Application | M | E3, B1b | `AN1-connections.integration.test.ts` re-wired and green; **`git diff packages/web` empty** (AC7(c)); Playwright pass on Settings → Connections; AC10's collision assertion covers the second `/api/connections` host |
| **F1** | 3 | mount engine + 4 adapters + `SANDBOX_SCAFFOLDING_PATHS` + `filesystemCaptures` → `packages/agent-orchestration/filesystem-mounting`; **`TABLE_OWNER.filesystemCaptures` re-pointed** (AC4(b), AC12); `listCaptures` deleted. Its construction site is the **Application composition root** (post-B1b: `packages/remote-server/src/create-server.ts`, was `server-factory.ts:1006`) — **hence the B1b dependency** | M–L | A2, B1b | adapter tests move and stay green incl. `git-worktree-live-proof`; guard owns `filesystemCaptures`; a real session still mounts |
| **F2** | 4 | `filesystemInjections` → `packages/agent-orchestration/agent-filesystems`; **`TABLE_OWNER.filesystemInjections` re-pointed** (AC12); **delete the filesystems bake**; decompose the `injections ⋈ filesystems` join; injection write routes stay core-hosted, persist delegated down | L | F1 | add-a-filesystem-after-emit test (the twin of AC1(c)); `SettingsAgents.tsx` diff is **zero lines**; team-mismatch 400 still fires |

**Critical path.** Three chains:

```
A1 → B1a → B1b ──┐                          (Job 2)
                 ├──→ E4                    (connections join)
E1 → E2 → E3 ────┘
A1 → B1a → B1b → { C3, F1 → F2 }
A2 → C1
G1          — no dependency
H1, H2, H3  — no dependency                 (§D-M, the restored moves)
```

`A1`, `A2`, `C2`, `E1`, `G1`, `H1`, `H2` and `H3` are dependency-free and all start together.
H1/H2 edit wiring that B1b later relocates verbatim; whichever lands first, the other rebases one line.

**Founder confirmation points — each with the action the run takes if no answer arrives.**
`CLAUDE.md` ABSOLUTE RULE 1 says a pipeline run never pauses and never waits for feedback. A gate with no
default is therefore not a gate, it is a stall. Every row below stays a **confirmation point** — the
question is asked, and the answer changes the plan if it comes — but each names what happens regardless. The
run records the question, the default it took, and the timestamp in `.pipeline/work/AU26/progress.json` and
appends it to `.pipeline/AU.md`.

| Before | Confirm | **Default if unanswered** |
|---|---|---|
| **C1** | `git-export` exporter deletion (~4,500 lines) | **Proceed with the deletion.** The verdict is already founder-directed (§D-F); this is ratification, not a new decision |
| **C2** | `observability` dissolution | **Proceed.** Zero routes have callers repo-wide and `TraceIdResolver.seed()` has zero non-test callers — nothing observable changes |
| **C3** | `realtime` dissolution — **and, in the same conversation, the validation-scenario-4 WS narrowing** (§D-E). Not a verdict: a founder-written AC being narrowed | **Proceed narrowed**, and record the narrowing as `accepted-pending-review` in `progress.json` + `.pipeline/AU.md` (**AC11(b)**). The narrowing is *forced* — the four-table authorizer and both rejected alternatives hold — so blocking the build on it would buy nothing the record does not already give |
| **G1** | `users`/`teams` columns incl. the two `DROP COLUMN`s, and the forward-only migration (no down-migration) | **Proceed forward-only.** The migration is smoke-tested against a real populated local DB before the PR opens (§12 risk 3) |
| **H1** | Nothing to confirm — the founder restored this by name. Listed only so its risk is visible: the handoff write has no reaper safety net (§D-M.1 trap c) | **Proceed.** Build the trap-(a) test case before touching the write |
| — | **connections** (already given — Decision J); **mount engine + captures + injections** (already given); **H1/H2/H3** (founder-restored, round 5) | n/a |

"Stays" verdicts need no gate.

---

## 14. HANDOFF TO AU28 — the rule-writing AU26 does not do

Everything below was measured during AU26's pass-A sweep and its round-2/round-3 architecture passes. It is
real, it was expensive to discover, and **it is rule-writing, not moving.** Under §2's line, AU26 moves code;
AU28 writes the package-boundary definition, the ownership assignments and the guards. This section is the
evidence AU28 inherits so it does not re-derive it.

**Round 5 changed what is in here.** Four code moves round 4 filed under "`sessions` ownership" came back to
AU26 (§D-M): `policy/handoff-protocol.ts`'s run-end write, `work/bet-kill-cascade.ts`'s run-stop write,
`work/work-service.ts`'s `latestSessionOutcome` subquery, and `review/session-review-creator.ts`'s redundant
read. The `realtime` package dissolution came back too (increment C3). What stays here is what needs a rule
written before it can be closed. Each exclusion's reasoning is in §D-M's *"What does not come back"*.

All `file:line` references are against `origin/main` @ `75d85687` plus AU26's own merged increments; AU28
should re-confirm the counts after AU26 lands (finding 4 explains why, and §D-M changes several of them).

### Finding 1 — `sessions` has no owner; after AU26, thirteen files still touch it across two Layers

`sessions` sits in `UNOWNED_SHARED_TABLES` (`scripts/table-ownership-guard.ts:360-365`). The de-facto owner
is `packages/agent-orchestration/run-orchestration`: it inserts (`runtime.ts:67`, `provisioner.ts:965`,
and post-B1a `create-bare-run.ts`) and transitions (`transition-run.ts:371`, `start-runtime.ts:37`,
`runtime-reapers.ts:193`). The `@lore` at `table-ownership-guard.ts:300` already says to revisit when a real
owner exists. **AU26 does not create one** — it removes four misplaced writes/reads and leaves the table
unowned, exactly as it found it.

A full value-import census (`sessions` from `@hyperidle/db`, every `packages/**` non-test file) returned **35
files** at `origin/main`: 8 in `agent-orchestration` (its own), 12 in `packages/eval` (finding 5), and **15 in
core-api**. **AU26 removes four of the core-api 15 and adds one** (§D-M.3 recomposes `latestSessionOutcome` at
`routes/bets.ts`), so AU28 inherits **twelve** in core-api plus one in `agent-orchestration`.

**Two core-api Service files remain** — both are **reads core genuinely needs**, which is why they need the
rule before they can move (§D-M's exclusion reasoning):

| Site | What it does | Disposition AU26 designed (not built) |
|---|---|---|
| `policy/lifecycle-propagation.ts:7,288-293` | `select().from(sessions).where(taskId = ? AND state="active" AND id <> ?)`, gating the task `in_progress → review` transition at `:304` | A count is the whole need — the only consumer of the rows is `${n} other active session(s) still running` in the skip message (`:301`). `PolicyDeps` gains `runOrchestration.countOtherActiveRunsForTask(exec, taskId, excludeSessionId): Promise<number>`. **AU26's H1 already adds the `runOrchestration` bag to `PolicyDeps` and wires it at `services/policy-bindings.ts:106`, so this is one method and one wiring line on an edge that now exists.** No foreign write, no event suppression — it is a read, hence AU28's |
| `realtime`'s subscribe authorizer — post-C3 `packages/core-api/src/ws-connection-hub.ts:1,169,204` | topic authorization for `session:<id>` | Decompose: orchestration exports `getSessionSubscribeContext(db, sessionId) → { taskId, sourceKind, sourceCorrelationJson } \| null`; the core authorizer takes it as an injected reader and applies its **own** core-domain checks (thread participant via `conversation`; team via `users`+`org`). **AU26 dissolves the package (C3) but moves the authorizer verbatim** — the dissolution is a move, the read conversion is a rule. **Free rider AU26 proved and did not take:** the `deps.work.getTaskById` existence check is provably redundant — `sessions.taskId` is an FK to `tasks.id` with `onDelete:"restrict"` (`packages/db/src/schema.ts:229`), so `taskId !== null → true` is behaviour-identical. Feasibility P4 in `.pipeline/work/AU26/feasibility.md` |

**Four Service sites are gone from this list — they are AU26's, built in H1/H2/H3.**
`policy/handoff-protocol.ts` (the in-tx run-end write, with its three traps), `work/bet-kill-cascade.ts` (the
CAS run-stop write), `work/work-service.ts` (the `latestSessionOutcome` subquery) and
`review/session-review-creator.ts` (the redundant row read) are specified in **§D-M.1–§D-M.4**. AU28 must not
re-plan them. If AU28 runs after AU26, `packages/core-api/work` and `packages/core-api/review` hold **zero**
`sessions` touches and `packages/core-api/policy` holds **one**.

**Ten core-api Layer routes** — display decoration, all satisfiable by one read-only port family:
`routes/{agent-profile,agents,recipients,sessions-routes,status,tasks,teams-routes,threads,users}.ts`
**plus `routes/bets.ts`, which AU26's §D-M.3 adds** when it moves `latestSessionOutcome` out of the `work`
Service and recomposes it at the route. That was a deliberate trade, recorded here rather than hidden: AU26
fixes the Service-level defect, AU28 converts all ten Layer reads in one pass under one rule.

The shape AU26 designed: `AgentOrchestrationPort` (`packages/api-contract/src/agent-orchestration-port.ts`)
grows `listActive`, `listByAgentIds`, `listByTaskId`, `latestOutcomeByTaskIds` — all readonly, backed by GET
routes on orchestration's own app. **`getById` already exists** (added by B1a, kept — §D-M.5), so AU28 adds
four, not five. **One shape hazard AU26 found and AU28 must respect:** `projectExplicitStart`'s 202 branch
returns the **whole raw `sessions` row** — 18 columns (`schema.ts:221-270`). A narrowed 7-field port row would
silently drop 11 fields with no test catching it (no `packages/web` file consumes that response). This is why
`getById` is deliberately full-width (`agent-orchestration-port.ts:49-59`) and why the decoration family must
be a **separate, narrower** row type rather than a re-use.

**One agent-orchestration site** — `tool-handlers/src/tool-definitions.ts:23,519-522`: the
`write_session_notes` tool does `ctx.db.update(sessions).set({notes})`. `tool-handlers` is an
agent-orchestration Service but it is **not** `run-orchestration`, so an ACL binds it exactly as it binds a
core-api Service. The `@lore` at `:483` (*"`sessions` is `UNOWNED_SHARED_TABLES` — direct access is legal"*)
is the exemption. Fix: `run-orchestration` exports `recordSessionNotes(exec, sessionId, notes)`;
`tool-handlers` calls it as a lateral in-layer Service call. **Nothing crosses a Layer here** — whether one
orchestration Service may write another's table is precisely the interface definition AU28 writes.

**One raw touch AU26 does not require converting** — `packages/core-api/src/routes/sessions-routes.ts`, post-B1a
the `POST /` handler only. B1a converted **both** of the two that were there: the legacy bare-insert moved to
`run-orchestration`'s `createBareRun` (a §D-M-shaped misplaced write, squarely AU26's) and the 202 row read
went onto `AgentOrchestrationPort.getById` at full 18-column width. §D-M.5 rules that this **stands**. So the
file's remaining exposure is via the port, not the table.

**Protected tests for whoever builds the rest** — these assert semantics the propagation redesign must
preserve and must not be weakened: `packages/core-api/src/__tests__/lifecycle-propagation.integration.test.ts`
(a sibling active run must still block `in_progress → review`). The two handoff tests
(`handoff-to.integration.test.ts`, `af7-handoff-revokes-tools.test.ts`) are now **AU26's** protected tests —
§10.

### Finding 2 — three more tables have no owner

`UNOWNED_SHARED_TABLES` holds four rows, not one (`scripts/table-ownership-guard.ts:360-365`). Owners AU26
traced, with the foreign toucher and the closing mechanism for each:

| Table | Owner it should have | Foreign toucher → how it closes |
|---|---|---|
| `propagationLog` | `packages/core-api/policy` | `work/bet-kill-cascade.ts:1` → injected `PropagationLogWriter` port (Mechanism C, the AU12/13 precedent); `server-factory.ts`'s reaper (post-AU26: `packages/remote-server/src/create-server.ts`) → policy's exported `reapPropagationLog` |
| `taskDispatchAttempts` | `packages/core-api/work` | `policy/handoff-protocol.ts:2` → its existing `deps.work.*` port bag gains one method |
| `userSkills` | `packages/core-api/users` | `settings/plugin-configuration.ts` → injected reader port; `routes/users.ts` + `services/routine-scheduler-bindings.ts` (Layer) → call `users`' exported functions |

### Finding 3 — the exemption set and its disjointness invariant

Deleting `UNOWNED_SHARED_TABLES` (`:360-365`) also retires `assertDisjointOwnership` (`:373-385`, re-asserted
at `:860`) and its fixture (`:837-855`) — the invariant they guard stops existing when one of the two sets
does. Note the filter site: `:543` passes the Set as `exempt` into `checkAccess`, and the `@lore` at
`:330-333` explains the deliberate ordering (exempt is checked **before** the `TABLE_OWNER` lookup).
**Measured cost of deleting the Set alone:** it fires immediately on all 12 already-scanned pairs inside
`packages/core-api/src` — the nine Layer `sessions` readers plus `userSkills` ×2 and `propagationLog` ×1.

### Finding 4 — the guard's scan scope, and why AU28 must re-measure after AU26

The guard's Tier-2 scan surface is exactly `nestedServiceRoots()` (`:448`, called at `:646`) **plus one
hard-coded `packages/core-api/src`** (`:664`, the AU19 Increment 5 scan-widening, `@lore` `:652-657`).
Never visited: `packages/agent-orchestration/src`, `packages/remote-server/src`, `packages/agent-execution/src`,
`packages/eval/src`, `packages/db/src`, `packages/desktop/src`.

Two AU26 outputs land in unvisited roots and change the shape of AU28's problem:
- **B1a creates `packages/agent-orchestration/src/routes/sessions.ts`**, which reads `sessions` directly.
- **B1b relocates the composition root to `packages/remote-server/src/create-server.ts`**, which carries the
  single `propagationLog` access that finding 2's reaper row names.

A third, from round 5: **§D-M moves two `sessions` writes into
`packages/agent-orchestration/run-orchestration/src/`** — a nested Service root the guard *does* scan
(`nestedServiceRoots()`), and legal there either way while `sessions` is unowned. It matters for finding 1's
count, not for the scan scope.

**Do not size AU28's scan-scope work against the pre-AU26 tree.**

A derivation AU26 tried and found wrong, recorded so AU28 does not repeat it: scoping the scan to *"the
runtime dependency closure of the shipped Applications, computed from `package.json` `dependencies`,
transitively"* fails three ways at HEAD. (a) It misses `packages/agent-orchestration/src` — both umbrella
packages have **zero** dependents (`rg -a -l '"@hyperidle/agent-orchestration"' --glob package.json` returns
only its own), `packages/agent-orchestration/src/index.ts` is literally `export {}`, and its `package.json`
declares no `dependencies` field at all. (b) It reads a field `desktop` does not use — `packages/desktop/package.json`
declares `dependencies: {"@electric-sql/pglite": "^0.5.4"}` and puts `@hyperidle/core-api`, `db`, `shared`,
`harness-registry`, `remote-worker` under **`devDependencies`**, so read literally desktop's closure is one
third-party package. (c) It pulls in `packages/db/src` (finding 6) while claiming not to.

**Tier 1 (barrel re-export of a raw table) must not widen with Tier 2.** A *Service* barrel re-exporting a
raw table hands every other package a door around the ACL; `packages/db`'s barrel **is** the schema's public
surface — it re-exports 43 tables by design (`packages/db/src/index.ts:33-167`, one `export { … }` block).
Widening Tier 1 to top-level packages fires on the one file that must do this.

### Finding 5 — `packages/eval` is the largest single concentration

**69 file×table pairs across 27 files and 18 tables**, none scanned today. Largest: `judges.ts` (52
findings), `seeding.ts` (34); 25 further files carry the rest (24 scenario files + `runner.ts`).
`packages/eval` **can** comply in place — it already imports `@hyperidle/users`, `@hyperidle/settings`,
`@hyperidle/core-api/session` and `@hyperidle/core-api/routines`.

The two arguments AU26 weighed, for AU28 to re-decide rather than re-derive:
- *For excluding it:* forcing eval's seeding through owning Services grows the method surface AU20 shrank.
- *Against excluding it:* the circularity argument (the guard's `__tests__` skip) does not apply — an eval's
  system under test is the LLM, its tools, its prompts and the assembled context; the persistence Services
  are not being graded, so `judges.ts` reading `work.get(db,"task",id)` is no more circular than a route
  test. The `packages/db` seeders (finding 6) have the identical "stands the world up" shape, so a principle
  that excludes eval and includes them is a carve-out, not a principle.

**A real ceiling to state either way:** routing `seeding.ts` through owning Services means an eval can no
longer construct a world state no Service would accept. Checked at HEAD, all **19** writes in `seeding.ts`
are plain single-row inserts of ordinary domain rows (`teams`, `teamMembers`, `users` ×5, `bets`, `tasks`,
`knowledgeItems`, `knowledgeAppProjection`, `threads`, `messages`, `items`, `artifacts`,
`knowledgeConflicts`, `routines`, `userSkills`, `sessions`) — none constructs a deliberately-invalid state.
Not a live constraint today; a real ceiling for a future adversarial eval. If one is later blocked, the
answer is an explicit fixture-construction API on the owning Service, not a re-opened carve-out.

**Verification bar if AU28 does this:** evals are graded tuning, not tests — a changed *score* is a finding,
a changed *verdict* is a regression. Baseline every journey's verdict before touching anything.

### Finding 6 — `packages/db`'s two seeders cannot comply where they live

`packages/db/src` holds **9 file×table pairs across 2 files**: `factory-bootstrap.ts` (8 accesses —
`users` ×6, `knowledgeItems`, `knowledgeAppProjection`) and `demo-fixture.ts` (10 — `teams`, `teamMembers`,
`users` ×4, `bets`, `tasks`, `routines`). Importing from `./schema.js` does **not** evade the guard: the
direct-access branch (`table-ownership-guard.ts:563-573`) calls `consider()` on the *identifier name* of the
first argument to `.from/.insert/.update/.delete`; only the *value-import* branch is scoped to
`@hyperidle/db`. All of them fire the moment the scan reaches that directory.

**They cannot comply in place.** Measured at HEAD, every owning Service's transitive `dependencies` closure
is exactly `{@hyperidle/db, @hyperidle/shared}` — verified for all seven owners AU26 touched (`users`,
`knowledge`, `org`, `work`, `routine`, `policy`, `run-orchestration`). So `db → users` is a cycle. Every
other package in the repo **can** comply in place; `packages/db` and `packages/shared` cannot.
(`packages/shared/src` is already at zero owned-table accesses.)

**The disposition AU26 designed:** the code moves up, above the Services — `packages/core-api/src/bootstrap/`,
exported as a `@hyperidle/core-api/bootstrap` subpath, routing through the owners' exported writers
(`org.persistScaffoldedAgents` is the shipped precedent). The three CLIs that call them move with them
(`setup-cli.ts`, `seed-pg-cli.ts`, `bootstrap-pg.ts`, plus the deprecated `seed.ts` wrapper), the root
`setup` / `db:seed:pg` / `db:bootstrap:pg` scripts re-point, and `packages/desktop/src/main.ts:451-454`
re-points from `@hyperidle/db` to the new subpath. `packages/db` is left as schema + connection + migrate +
test-utils.

**The live risk, stated because it is the sharp edge here:** `applyFactoryBootstrap` is the **production
first-boot seeder** — `packages/desktop/src/main.ts:451-454` calls it on **every** Electron launch, and its
`@lore` at `:445-448` says it *"must run before the server starts so `system:propagation` and facilitator
agents are present when the first request arrives."* A relocation that changes its idempotency
(`onConflictDoNothing`) or its ordering breaks first boot for existing installs. Smoke-test against a real
populated local desktop DB, not only the suite — v0.6.0's PGlite hang is the precedent. Its five behavioural
tests move with it and must stay green unweakened:
`packages/db/src/__tests__/{AF17-factory-bootstrap.integration.test.ts, AF17-demo-fixture-guard.test.ts, AF17-factory-isolation.integration.test.ts, AK6-factory-roster.integration.test.ts, seed.integration.test.ts}`.

### Finding 7 — the measured total, and the census script

Measured at HEAD with the guard's own `checkAccess` logic, `UNOWNED_SHARED_TABLES` deleted and four new
`TABLE_OWNER` rows applied, over every package's `src/` minus test files:

**803 files scanned · 379 findings · 100 file×table pairs · 48 files · 20 tables.**

| Region | Pairs | Files | Scanned today? |
|---|---:|---:|---|
| `packages/core-api/src` (Layer) | 12 | 11 | **yes** (`inspect():604-630`) |
| nested core-api + agent-orchestration Services | 10 | 8 | **yes** (`nestedServiceRoots()`) |
| `packages/db/src` | 9 | 2 | no |
| `packages/eval/src` | 69 | 27 | no |
| `remote-server` / `remote-worker` / `desktop` / `web` / `shared` / `api-contract` / `design-system` `src` | **0** | 0 | no |

The reproduction lives in `.pipeline/work/AU26/probes/census/` and `feasibility.md` P6.

**The census script is gone from the branch — AU28 writes it.** `scripts/table-ownership-census.ts`, its
240-line test, the `census:tables` npm script and the refactor of `scripts/table-ownership-guard.ts` that
existed only so the census could share the checker were committed under AU26 (`af317a25`) and **reverted**
(`0317818a`). It was the goal metric of a programme the founder moved to AU28, and the guard refactor
breached AU26's own AC12 (*"`TABLE_OWNER` rows … and nothing else in that file"*).

Against `origin/main`, `scripts/table-ownership-guard.ts` now differs only by owner rows. **The measurement
above is the durable output** — AU28's AC3 asks for *"a tracked, exhaustive violation worklist… scoped from
data, not re-discovered by hand"*, and the table in this finding plus the reproduction in
`.pipeline/work/AU26/probes/census/` is that data. Rebuilding the script is a small job under AU28, where the
founder put it; the expensive part — knowing what it will print — is already done here. Note the numbers
predate §D-M: AU26 removes four core-api Service pairs and adds one Layer pair, so re-measure.

---

## 15. What changed in this revision

### Round 5 — the founder's correction to round 4's dividing line (this revision)

Round 4 cut on the wrong axis. It asked *"is this ownership work or a relocation?"*; the founder's actual
line is *"is this moving code or writing rules?"* — *"policy, review and work are not cut to AU28. the move
is part of this package. what is not part of this package is writing package boundary definition or linters
and such."* On the wrong axis, four genuine code moves and one package dissolution went out with the
governance programme.

**Restored to AU26:**

| Restored | Why it is a move, not a rule | Lands in |
|---|---|---|
| `policy/handoff-protocol.ts:120-124` — the in-tx run-end write | core-api executes `run-orchestration`'s state transition and suppresses that Layer's own event to stay correct. Becomes `PolicyDeps.runOrchestration.endRunForHandoff(tx,…)`, a **downward call** | §D-M.1, increment **H1** |
| `work/bet-kill-cascade.ts:58-70` — the select + CAS run-stop write | same shape: real core need, another Layer's write. Becomes `requestRunStopForTasks(taskIds)`, CAS + suppression owned on orchestration's side | §D-M.2, increment **H2** |
| `work/work-service.ts:382-386` — the `latestSessionOutcome` subquery | pure decoration inside a Service's query surface; **deleted** and recomposed at `routes/bets.ts` byte-identically | §D-M.3, increment **H2** |
| `review/session-review-creator.ts:50-55` — the row read | **deleted**; all three fields are already on `SessionEndedEvent` and the sibling handler at `:137-141` proves it | §D-M.4, increment **H3** |
| `realtime`'s dissolution | a trim to "verdict-only" was proposed on the grounds that *"this shouldn't be a package"* is AU28's taxonomy axis. **Overruled** — a dissolution is a move. Increment C3 stands as written | §D-E, increment **C3** |

**Guarantees carried through the restore, each checked rather than assumed:** `sessions` still gets **no
owner** and no `TABLE_OWNER` row; `UNOWNED_SHARED_TABLES`, the guard's scan scope and the exemption set are
untouched; **no new `AgentOrchestrationPort` methods** (two downward calls, two deletions); **no new package
edge** (`@hyperidle/run-orchestration` is already a core-api dependency, `packages/core-api/package.json:39`).
A move that incidentally removes an ACL violation is still a move — that is expected.

**Two calls made on the merits and stated so they can be overturned cheaply:**

- **The ten core-api Layer routes reading `sessions` stay with AU28.** They are correct where they stand;
  the only argument for touching them is the ownership rule itself; closing them needs a four-to-five-method
  port family built to serve that rule; and the narrowing carries an untested 18-column drop hazard. §D-M's
  *"What does not come back"*. `routes/bets.ts` joins them as the tenth, by §D-M.3's own doing — recorded in
  §14 finding 1 rather than hidden.
- **`AgentOrchestrationPort.getById` (B1a, `a653df7f`) stands; the interrupted revert is abandoned.** It is
  the read-back half of a move AU26 does perform — B1a relocated the legacy bare-insert *and* its
  `session_started` emit into `run-orchestration`'s `createBareRun`, and the file shed its `sessions` import
  in the same act. Reverting only the read would leave `sessions-routes.ts` re-importing the table it just
  stopped writing. It is one full-width method for one route AU26 restructured, not the decoration family.
  §D-M.5.

**Also restated as AU28's, unchanged:** `policy/lifecycle-propagation.ts:288-293` (a read core needs and
consumes — the Service-level twin of the ten Layer routes; recorded explicitly because "policy" was named,
and it lands beside H1 for free if the founder wants it here); the `realtime` authorizer's `sessions` read
(the package dissolves in AU26, the read converts in AU28); `tool-handlers`' `write_session_notes` (entirely
inside `agent-orchestration`).

**Renumbered / renamed:** new decision **§D-M** (existing D-A…D-L unchanged); new acceptance criterion
**AC15** (AC14 stays retired and its number is not reused); increments **14 → 17 PRs**, waves unchanged (5,
0–4) — round 4's heading said 13 against a 14-row table, an off-by-one now corrected — H1/H2/H3 are all dependency-free wave 0. §14's title changes from *"the ownership findings AU26 cut"*
to *"the rule-writing AU26 does not do"*, and finding 7 is corrected: the census was **reverted**
(`0317818a`), not left in place.

**`plan.md` corrected:** a round-5 amendment records the founder's line verbatim and states that the
round-4 amendment's *"General ownership debt belongs to AU28"* never meant these four moves. Its seven
acceptance criteria are untouched.

### Round 4 — the founder's scope cut

| Cut | Where it went |
|---|---|
| **D0** — the census script as an AU26 increment, and **AC14** (the 100 → 0 countdown gated per increment) | §14 finding 7. The script is already committed; recommendation is to leave it for AU28 |
| **D1** — `sessions` ownership + converting all 17 foreign readers, `AgentOrchestrationPort.sessions`, `PolicyDeps.runOrchestration`, six new `run-orchestration` exports | §14 finding 1, with every site, every designed mechanism and the three handoff traps preserved. **Round 5 pulled four of those sites back into AU26** (§D-M) — the two misplaced writes and the two redundant reads. What stays in finding 1 is the read conversions and the ownership assignment |
| **D2** — owners for `propagationLog` / `taskDispatchAttempts` / `userSkills`, deleting `UNOWNED_SHARED_TABLES` + `assertDisjointOwnership`, and widening the guard's scan roots to the whole workspace | §14 findings 2, 3, 4 |
| **D2a** — relocating `packages/db`'s two seeders above the Services | §14 finding 6 |
| **D2b** — routing `packages/eval` through the owning Services | §14 finding 5 |
| **AC8 (old)** — "neither guard contains a table carve-out, allowlist, exemption set, unowned-table set, or scope carve-out; `inspect()` returns zero findings on the real tree" | AU28's own ACs. AU26 keeps a scoped replacement: **AC12**, which asserts only the five tables AU26 relocates or creates |
| **AC15 (old)** — `packages/db/src` and `packages/shared/src` hold zero owned-table accesses | §14 finding 6 |
| **§D-E's authorizer decomposition** (`getSessionSubscribeContext`) and the FK-redundant `deps.work` check deletion | §14 finding 1's last row. `realtime` now dissolves as a verbatim package move |
| **§D-H #16's port conversions** (`port.sessions.getById`, `createBareRun`) | §14 finding 1's "two remaining raw touches". **Round 5 ruled both stand** — `createBareRun` is a misplaced write AU26 owns, `getById` its read-back half (§D-M.5) |

**Built anyway, and kept:** B1a was in flight when the ruling landed and had already converted
`POST /api/sessions`'s two raw `sessions` touches (`create-bare-run.ts`, `AgentOrchestrationSessionWireRow`
+ `getById`). Not reverted — see §D-A's accepted-as-built note, and **§D-M.5, which re-decides it on the
merits under round 5's line rather than on it being already built**: a revert was started and is abandoned.
Everything else in the cut list was unstarted.

**Renumbered:** decisions `D-I…D-N` → `D-G…D-L` (old `D-G` and `D-H` are gone); acceptance criteria
`AC9,AC10,AC12,AC13,AC16` → `AC8,AC9,AC10,AC11,AC13`, with a new scoped `AC12`. Sections 2–13 shifted by one
to make room for §2's scope boundary. Increments: **19 → 13 PRs**, waves recomputed (still 5, 0–4).
*(Round 5: 17 — the round-4 table actually held 14 rows, and H1/H2/H3 are added at wave 0.)*

**`plan.md` reverted:** the *"Amendment (2026-08-04, architecture round 3 — the ACL's scope)"* block and the
acceptance criterion it added (the zero-carve-out / census bar) are removed. They were architecture-round
additions to the founder-written spec, and they described the work this ruling cuts. The seven original
acceptance criteria are untouched.

**Not touched:** the four `service-verdicts/*.md` files — pass A is AU26's own AC2/AC3 work and stands.
`feasibility.md` P4 (the FK-redundancy proof) is now unused by AU26 and is carried into §14 finding 1
instead of being deleted.

### Round 3 (superseded in part)

Entries below concerning **D0, D1, D2, D2a, D2b, the scan scope, `packages/eval` and `packages/db`** are
superseded by the round-4 cut above; they are kept because their *findings* are real and now live in §14.
Entries concerning the placement rule, the route split, the projection triple and the wave computation
stand.

| Finding | Disposition |
|---|---|
| **CRITICAL 1** — the derived-closure census is false (`packages/db/src` holds 18 accesses the plan says do not exist), and the principle does not decide its own hardest case | *Superseded by round 4* — the measurement stands (§14 findings 6, 7); the programme it justified is AU28's |
| **CRITICAL 2** — `agent-orchestration/src` and `agent-execution/src` are not in the closure at HEAD | *Superseded by round 4* — recorded as §14 finding 4. The two `package.json` edits remain **build** deliverables of B1a and B1b |
| **W5** — two residual seams in the placement rule: events uncovered, table sets stated as of end-of-WP | **Stands.** §D-A rules 5 and 6 |
| **W6** — founder gates with no autonomous default | **Stands.** §13's "Default if unanswered" column (the D2a/D2b/D2 row is gone with the work) |
| **W1** — the explicit-start projection triple is used by both sides of the split | **Stands.** §D-A names one home in `@hyperidle/shared/http`. The 18-column wire-shape hazard it surfaced is carried to §14 finding 1, since the port narrowing that would have triggered it is cut; **AC5(d)** stays as the cheap regression guard |
| **W2** — the withdrawn rendering argument survived verbatim in the filesystems section | **Stands.** §D-I re-derived from rules 2/3, withdrawal noted inline |
| **W3** — wave labels contradict dependencies | **Stands.** Wave is computed dependency depth; recomputed for 13 increments |
| **W4** — "13 PRs" vs a 16-row table | **Reopened by round 5.** Round 4 claimed 13 against a table that held **14** (the extra row was `D0`, cut in prose but not reverted until `0317818a`). The count is now **17**, matching §13 row for row |
| **S1** — the invented routing shape is not in the probes | **Stands.** `probes/two-app-mount/poc4.ts` checked in and run; feasibility **P5′** |
| **S2** — `agent-orchestration/package.json` declares zero dependencies | **Stands** — a named B1a deliverable |
| **S3** — AC ordering reads as if an AC is missing | **Stands** — numeric order is reading order |
| *(round-3 census find)* a 17th `sessions` toucher in `tool-handlers` | *Superseded by round 4* — §14 finding 1, last row of the agent-orchestration entry |

### Round 2

| Finding | Disposition |
|---|---|
| **C1** `sessions-routes.ts` cannot move wholesale (imports 3 core-api Services) | **Stands.** §D-A: split 4-move / 1-stays. `POST /api/sessions` stays core-hosted |
| **C2** the guard census reasoning is false | *Superseded by rounds 3 and 4* — §14 findings 4, 7 |
| **C3** the placement rule was never run against its own inputs | **Stands.** §D-A restated as a mechanical table-set rule covering reads and writes, with auth explicitly excluded; §6 regenerated from the actual registrations |
| **C4** the handoff change fails on all three legs | **Stands as a warning, not as a change** — AU26 no longer touches handoff at all; the three traps are recorded in §14 finding 1 for whoever does |
| **C5** validation scenario 4 is not closed and the narrowing is silent | **Stands.** §D-E splits it: HTTP half closed, WS half deliberately narrowed with the rule-derived reason and both rejected alternatives. **AC11** |
| **C4 (critique)** the 15th `sessions` reader is unassigned | *Superseded by round 4* — `policy/lifecycle-propagation.ts:288-293` is §14 finding 1, row 5 |
| **W3** `createServer` cost straw-manned | **Stands** — §D-C restated at post-B1a cost, child-process option named and rejected on AU19's deleted `HYPERIDLE_PROFILE` branch |
| **W5** later increments address files B1b moved | **Stands** — C3/F1 re-expressed against "the Application composition root (post-B1b: `packages/remote-server/src/create-server.ts`)" |
| **W7** rule undefined for reads, silently exempts auth | **Stands** — §D-A rules 2 and 4 |
| **W8** "two of four DI edges leave" is one | *Moot under round 4* — the authorizer moves verbatim, so no DI edge leaves |
| **S1** observability call-site list omits 3 sites | **Stands** — §9 |
| **S2** feasibility cites `hono@4.12.27` | **Stands** — `feasibility.md` P1, verified `4.12.30` installed |
| **S3** backfill rule only a risk; no rollback note | **Stands** — §D-J: written invariant with the real nullability/defaults, forward-only stated |
| **S4** AC7's "three files" vs `Conversations.tsx` | **Stands** — AC7(c) is zero web files, via §D-A rule 7 |
