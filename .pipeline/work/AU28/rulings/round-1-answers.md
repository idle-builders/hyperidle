# AU28 — round 1 answers, from the code

Answers to the open questions attached to the round-1 production verdicts
(`.pipeline/work/AU28/rulings/round-1-production.json`). Every claim below is read off the real
files in `layers/`, `framework/`, `applications/` on branch `pipeline/AU28`. The census
(`scratchpad/census2.json`) was used only to *find* instances; each was then opened.

Read-only investigation. Nothing was modified.

---

## 1. Can dependency injection work without importing the provider's type?

**Short answer: yes, and it provably already does. No service imports a sibling service, in
production or in its manifest. Your "forbidden import + allowed DI" is not self-contradictory.**

The port interface is declared in the **consumer**, structurally, in terms of `@hyperidle/db` row
types and `@hyperidle/shared` types only. It never names the provider.

`layers/core-api/review/src/ports.ts:22-36` — the whole import list of the port file:

```
import type { Bet, HyperIdleDb, NewItem, NewThread, Task, Team, Thread, User, WriteExecutor } from "@hyperidle/db";
import type { AgentWorkIntentRecorderInput, SessionKnowledgeItemLike, AgentWorkIntentRecorder } from "@hyperidle/shared";
```

`ReviewPorts` (`ports.ts:86-164`) then declares `work`, `conversation`, `users`, `org`,
`intentRecorder`, `requireRunnableAgent`, `assembleSessionKnowledge`, `readServerConfig`,
`resolveOrCreateCallingThread` as **method shapes**, e.g. `ports.ts:96-100`:

```
readonly conversation: {
    insertThread(db: HyperIdleDb, values: NewThread): Promise<void>;
    updateThread(db: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;
    getThreadById(db: HyperIdleDb, id: string): Promise<Thread | undefined>;
};
```

`review` does not know `@hyperidle/conversation` exists. The **Layer root** knows both and wires
them: `layers/core-api/src/service-bootstrap.ts:450-482` calls `registerReviewSubscriptions(db,
eventBus, { work: {...}, conversation: { insertThread, ... }, users: {...}, org: {...} })`,
importing the real functions from each sibling.

Mechanically confirmed at the manifest level — every service package in the repo, all 19:

```
@hyperidle/review           :: @hyperidle/db @hyperidle/shared
@hyperidle/conversation     :: @hyperidle/db @hyperidle/shared
@hyperidle/work             :: @hyperidle/db @hyperidle/shared
@hyperidle/users            :: @hyperidle/db @hyperidle/shared
… (all 18 others identical; @hyperidle/harness-registry has shared only)
```

Zero sibling-service dependencies anywhere. And `layers/core-api/review/package.json:13-17`
declares exactly `@hyperidle/db`, `@hyperidle/shared`, `drizzle-orm`.

Census agrees: `service → service (same layer) [import]` = **0 production instances** (24
development). `service → service (same layer) [di]` = 27 production, every one of them wired at a
composition site (`service-bootstrap.ts:452`, `routes/threads.ts:1666`, `routes/knowledge.ts:296`,
`applications/remote-server/src/create-server.ts:487`).

**This means the rule should be: `service → service (same layer) [import]` = FORBIDDEN, as you
ruled. It is coherent, and it costs nothing — there is not one production instance to clean up.**
Keep `[di]` allowed. The one thing the rule must also say: the port interface must live in the
**consumer**, not the provider, or the import comes back through the type door.

---

## 2. Why does a service import / DI / emit to its own layer? Is it a cycle?

**Short answer: no cycle. Two of the three rows are real and benign; the `[event]` row is an
attribution artefact — nothing is "sent to the layer".**

### 2a. `service → own layer [import+manifest]` — 0 production instances

Nothing to rule on. No service imports its own layer root, and no service manifest declares it.
The dependency arrow in imports runs one way only: layer root → service.

### 2b. `service → own layer [di]` — 9 production instances, all legitimate

Two symbols account for all nine, and both are **layer-root binding modules** injected downward
into services:

| symbol | provider file | injected into |
|---|---|---|
| `resolveOrCreateCallingThread` | `layers/core-api/src/services/calling-thread-bindings.ts` | `review`, `knowledge` |
| `taskRunResolverDeps` | `layers/core-api/src/services/task-run-resolver-bindings.ts` | `work` |

Wire sites: `layers/core-api/src/app.ts:493`, `routes/bets.ts:683`, `routes/knowledge.ts:919`,
`routes/sessions-routes.ts:184`, `routes/tasks.ts:253`, `routes/threads.ts:1666`,
`service-bootstrap.ts:452`, `services/agent-run-admission-reactions.ts:113`,
`services/policy-bindings.ts:98`.

Why they exist is stated in the code — `calling-thread-bindings.ts:11-16`:

> `@hyperidle/work`/`@hyperidle/review`/`@hyperidle/knowledge` cannot import
> `@hyperidle/conversation` directly — every per-kind resolver that needs a calling thread takes
> this as an injected `resolveOrCreateCallingThread` dep. **This file is core-api Layer code (not a
> nested Service), so it may legitimately import both.**

That file imports `findThread`/`insertThread` from `@hyperidle/conversation` and `findUser` from
`@hyperidle/users` (`calling-thread-bindings.ts:35-38`). It is the composition root doing exactly
its job. No import cycle exists: layer root imports the service; the service receives a value.

**This means the rule should be: `service → own layer [di]` = ALLOWED.** It is the same mechanism
as sibling DI, only the provider happens to be layer-root glue rather than another service package.

### 2c. `service → own layer [event]` — 15 production instances, artefact

Nobody emits "to the layer". `EventBus` is anonymous pub/sub: an emitter names an event **type**;
the census attributes the crossing to whichever package holds a **subscriber**. Because most
subscribers sit in the layer root, every emit shows up as `service → own layer`.

Proof — `task_state_changed` is emitted by `layers/core-api/work/src/task-state-machine.ts:157-158`
and subscribed in layer-root code at `layers/core-api/src/services/work-state-push-gateway.ts:39`
(the websocket push gateway) and `layers/core-api/src/app.ts:491` (dependency watcher). Same shape
for the other 14: `policy/src/lifecycle-propagation.ts:89,166,517`,
`routine/src/routine-scheduler.ts:643,660`, `work/src/bet-state-machine.ts:232,308`,
`run-orchestration/src/provisioner.ts:1080,1526`, `run-orchestration/src/transition-run.ts:201,274`.

**This means the rule should be: `service → own layer [event]` is not a distinct rule at all — it
is `service → EventBus`, already covered.** Either collapse the row into the EventBus rows or mark
it ALLOWED and note it is a subscriber-attribution shadow. Ruling anything else here would forbid
ordinary in-layer event use by accident.

---

## 3. `application → layer [api]` — 0 instances. What would it be for?

**Short answer: the cell is not nonsense and it is not empty. The census's 0 is a detector blind
spot — `applications/remote-worker` really does dial both layers over HTTP.**

The census counts an `api` crossing only for `apiFetch()`, `ws*.subscribe()`, and injected-transport
seam-port method calls. It says so itself (`scratchpad/census2.ts:2416`): *"A raw fetch()/WebSocket
dial through none of those is not counted."* `remote-worker` uses a raw `fetch`.

`applications/remote-worker/src/remote-worker-client.ts:118`:

```
const tokenRes = await fetch(`${serverUrl}/api/auth/worker-token`, { method: "POST", headers: { "X-API-Key": authKey } });
```

That route is core-api's: `layers/core-api/src/routes/auth.ts:114` (`router.post("/worker-token",
…)`).

`remote-worker-client.ts:136-139` then opens `…/api/ws/worker?token=…`, served by
agent-orchestration: `layers/agent-orchestration/run-orchestration/src/worker-ingress.ts:245,259`.

`remote-worker` is a **separate process** — it is the one application that cannot compose layers
in-process. The in-process case is different and already handled: `remote-server` mounts the layer
apps directly (`applications/remote-server/src/create-server.ts:800-801`, `api.route("/",
coreApi.app)` / `api.route("/", agentOrchestration.app)`) and registers in-process fetch transports
(`create-server.ts:819,827`), so it never dials itself.

**This means the rule should be: `application → layer [api]` = ALLOWED, not forbidden.** It is the
only legal way a detached application process can reach a layer. Separately, the governance lint
must count raw `fetch`/`WebSocket` to a `/api/...` path as an `api` crossing, or this rule will be
enforced against an empty set while two real crossings sail past.

---

## 4. What is `db:util`?

**Short answer: three functions, none of which touch the database. They do not belong in `db`.**

The surface is exactly:

| symbol | file | what it does | any DB dependency? |
|---|---|---|---|
| `escapeLikePattern` | `framework/db/src/like-escape.ts:20` | escapes `%`, `_`, `\` in a user string before it goes into a SQL `LIKE` | **none** — pure string, zero imports in the file |
| `resolveAgentScaffoldSpecs` | `framework/db/src/agent-scaffold.ts:48` | maps a scaffold trigger to a list of agent specs | **none** — imports `@hyperidle/shared` + `./system-prompt-templates.js`; the file's own doc says *"Pure — no DB access, no injected deps"* (`agent-scaffold.ts:44`) |
| `resolveProfile` (+ `PROFILE_DEFAULTS`) | `framework/db/src/profiles.ts:62` | picks laptop/vps/cloud deployment defaults from `HYPERIDLE_PROFILE` | **none** — pure config, zero imports |

10 production instances, all of them:

- `escapeLikePattern` — `layers/core-api/src/routes/search.ts:25`, `routes/threads.ts:27`,
  `routes/users.ts:2`, `layers/core-api/knowledge/src/knowledge-repository.ts:19`,
  `layers/core-api/users/src/user-store.ts:30`, `layers/core-api/work/src/work-service.ts:42`
- `resolveAgentScaffoldSpecs` — `layers/core-api/src/routes/assistant.ts:25`,
  `routes/teams-routes.ts:28`, `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:22`
- `resolveProfile` — `applications/remote-server/src/create-server.ts:72` (that is also the whole
  of question 16)

Why they are in `db` at all: `agent-scaffold.ts:8-14` records the reason explicitly — it folded
into `@hyperidle/db` *"which already owns `system-prompt-templates.ts` and already depends on
`@hyperidle/shared`"*. That is a convenience argument about an existing accident (question 5), not
a data-ownership one.

**The sensible solution: move all three to `@hyperidle/shared`.** `shared` is already a dependency
of `db` (`framework/db/package.json:20`), so the direction is clean and nothing inverts.
`escapeLikePattern` and `resolveProfile` move as-is. `resolveAgentScaffoldSpecs` moves with, or
after, the system-prompt templates it calls — see question 5. Once they are gone, `db:util` ceases
to exist as a surface and the rule row deletes itself, which is the outcome that needs no policing.

---

## 5. What is `db:unknown`?

**Short answer: your premise is half right. Only ONE of the three production `db:unknown`
instances is a prompt-template symbol; the other two are dynamic imports the classifier could not
attribute. And the templates are in `db` only because a 2026 refactor put them next to
`factory-bootstrap.ts`, which lives there.**

### The three production instances

| # | site | symbol | what it really is |
|---|---|---|---|
| 1 | `layers/core-api/src/routes/agents.ts:32` | `readSystemPromptTemplateForRole` | genuine — the `GET /api/agents/templates/:role` route (`agents.ts:157`) |
| 2 | `applications/desktop/src/main.ts:450` | *(unresolvable)* | `const { createPgliteDb } = await import("@hyperidle/db")` — that is `db:client` |
| 3 | `applications/desktop/src/main.ts:451` | *(unresolvable)* | `const { applyFactoryBootstrap } = await import("@hyperidle/db")` — that is `db:bootstrap` |

Instances 2 and 3 are a **detector limitation on `await import()`**, not an unclassified surface.
Both symbols have well-defined surfaces; the AST pass cannot read a destructured dynamic import.

### The templates themselves

`framework/db/src/system-prompt-templates.ts` exports three symbols:

- `SYSTEM_PROMPT_TEMPLATE_FILES` (`:25`) — a 7-entry `role → filename` map
  (`product_manager → product-manager.md`, `facilitator`, `builder`, `growth`, `designer`,
  `qa_engineer`, `ops`). This map *is* the path-traversal allowlist.
- `readSystemPromptTemplate(docsRoot, filename)` (`:56`) — `fs.readFileSync` +
  strip YAML frontmatter.
- `readSystemPromptTemplateForRole(role)` (`:80`) — map lookup, then reads
  `path.resolve(process.cwd(), "docs") / system-prompts / <filename>`.

**Where they read from:** the repository's own `docs/system-prompts/*.md`, resolved relative to
`process.cwd()` at runtime.

**Why they are in the database package:** they were extracted verbatim out of
`framework/db/src/factory-bootstrap.ts` by AU18 when the `factorySettings` table (which used to
cache templates as `system_template:<role>` rows) was retired — stated at
`system-prompt-templates.ts:5-8`. `factory-bootstrap.ts` genuinely belongs in `db` (it seeds rows),
and it is still a consumer (`factory-bootstrap.ts:198-199`). So the templates ended up in `db` by
adjacency to their old caller, not because they are data-layer code.

**Consumers, complete:**

- inside `db`: `factory-bootstrap.ts:198-199` (seeds `users.systemPrompt`), `demo-fixture.ts:203`,
  `agent-scaffold.ts:60,73`
- outside `db`, production: exactly one — `layers/core-api/src/routes/agents.ts:32,157`
- tests: `framework/db/src/__tests__/{system-prompt-template-resolution,X3-agent-config,AF17-factory-bootstrap,factory-and-demo}`

**Where they should live:** not in `db`. They are a filesystem read of a docs directory — no SQL, no
schema, no connection. `framework/shared` is the natural home (it has no `db` dependency, so
`factory-bootstrap.ts` can keep importing them), and `resolveAgentScaffoldSpecs` (question 4) moves
with them since it is their only non-bootstrap caller inside `db`.

**This means the rule should be: `layer → db:unknown [import]` = FORBIDDEN, as you ruled — the
surface should not exist.** But note the verdict alone does not close it: the fix is a relocation
of `system-prompt-templates.ts`, and the census's `db:unknown` count will still show 2 phantom
desktop instances until the detector handles `await import()`.

---

## 6. `db:zod-schemas` — should everyone import it, or should the owning service re-export?

**Short answer: it is one global module covering 22 tables, exposed on its own subpath, with
exactly ONE production consumer today. It is per-table by construction, so ownership does apply —
but the current consumer is a wire schema in the layer root, not the owning service.**

**What is in it:** `framework/db/src/zod-schemas.ts` — `drizzle-zod`-generated `createSelectSchema`
/ `createInsertSchema` for 22 tables (`teams`, `users`, `teamMembers`, `bets`, `tasks`, `sessions`,
`routines`, `threads`, `messages`, `items`, `userSkills`, `knowledgeItems`, `knowledgeEditLog`,
`knowledgeAccessLog`, `knowledgeConflicts`, `notificationQueue`, `propagationLog`, `artifacts` …).
No runtime logic; each export is one line, e.g. `zod-schemas.ts:48` `export const selectBetSchema =
createSelectSchema(bets, { sourceKnowledgeItemId: (s) => s.optional() })`.

**Is it global or per-table?** Global as a *module*, per-table as a *symbol*. Every export is
derived from exactly one table object. `selectBetSchema` is `bets`; `selectUserSchema` is `users`.
The table ACL applies symbol-by-symbol with no ambiguity.

**Who uses it:** one production import — `layers/core-api/src/schemas/bet.schema.ts:15`,
`import { selectBetSchema } from "@hyperidle/db/zod-schemas"`. Nothing else in production. It is a
declared subpath: `framework/db/package.json:8`, `"./zod-schemas": "./src/zod-schemas.ts"`.

The wrinkle: `bets` is owned by `work` (recovered registry: `bets → packages/core-api/work`), but
the importer is the **core-api layer root**, building an API response schema — not `work`.

**This means the rule should be: the owning service re-exports, not everyone imports.** Under your
own Ruling 3.2 (only the owning service may import its table), a schema *generated from* that table
is the same access wearing a different hat — allowing the barrel import while forbidding the table
import is a hole. Practically: `@hyperidle/work` re-exports `selectBetSchema`, `bet.schema.ts`
imports it from there, and the `@hyperidle/db/zod-schemas` subpath becomes internal to `db`. With
one production call site this is a one-line change, so there is no cost argument for the looser
rule. Your recorded verdict for this row is `allowed` — the evidence says tighten it.

---

## 7. What is the difference between `import` and `manifest`?

**Short answer: `import` is a line of TypeScript that actually pulls code in. `manifest` is a line
in `package.json` that says "I am allowed to". They are tracked separately because they drift in
both directions, and each drift is a different defect.**

- **`import`** — resolved from the TypeScript AST. `scratchpad/census2.ts:484` records one edge per
  `import` statement that resolves into the tracked file set. This is what the code *does*.
- **`manifest`** — read from each `package.json`'s `dependencies` / `devDependencies` /
  `peerDependencies`, filtered to `@hyperidle/*`. `scratchpad/census2.ts:503-518`. This is what the
  package *declares*.

Why both matter:

- **Declared but not imported** = a phantom dependency. It grants a right nobody exercises, and it
  is invisible to any import-based lint. A governance rule that only reads imports cannot see it.
- **Imported but not declared** = the build works only by monorepo hoisting accident. The census
  counts these too (`census2.ts:520-523`, `undeclaredButImported`).

A manifest row also **cannot express a surface**. Declaring `@hyperidle/db` declares the whole
package — it cannot say "only the client, not the tables". That is precisely why the table ACL has
to be enforced at the import, not the manifest.

### `layer → framework/db [manifest]` — what it means, and who does it

2 production instances:

- `layers/agent-orchestration/package.json:17` — `"@hyperidle/db": "*"` in `dependencies`
- `layers/core-api/package.json:37` — `"@hyperidle/db": "*"` in `dependencies`

Neither is a phantom. Both layers **also import `db` heavily**: `layer → db:client [import]` is 56
production instances, `layer → db:row-type` 6, plus the table rows. So the declaration is honest —
the layer roots hold the `HyperIdleDb` handle and pass it into services.

**This means the rule should be: `layer → framework/db [manifest]` = ALLOWED.** Your question was
*"does a layer need a db at all?"* — yes, these two do: they are the composition roots that
construct and thread the handle. What must be constrained is the *surface* they import (client and
row types, never another service's table), and that is an import-level rule, not a manifest one.

---

## 8. `service → framework/db [manifest]` vs `db:manifest`

**Short answer: they are the same thing under two labels. There is no difference.**

`scratchpad/census2.ts:510-512` — when a manifest row's target package is `db`, the census renames
the target token to `db:manifest`:

```
add({ kind: "manifest", source: p.short,
      target: t?.short === "db" ? "db:manifest" : (t?.short ?? …), … });
```

The rename exists only so a manifest row does not collide with the seven *surface* tokens
(`db:client`, `db:table`, `db:util`, …) that the import decomposition produces. The row label
`framework/db [manifest]` and the target token `db:manifest` name the same edges.

Arithmetic proof from the census summary. `db:manifest` totals `prod 22, dev 1`. The four
`framework/db [manifest]` rows:

| row | prod | dev |
|---|---|---|
| `layer → framework/db [manifest]` | 2 | 0 |
| `service → framework/db [manifest]` | 18 | 0 |
| `application → framework/db [manifest]` | 2 | 0 |
| `tooling → framework/db [manifest]` | 0 | 1 |
| **total** | **22** | **1** |

Exact match. **This means: one rule, not two. Delete the duplicate label from the worksheet.** The
18 service declarations are all legitimate — every one of the 19 service packages except
`harness-registry` declares `@hyperidle/db` and every one of them imports it.

---

## 9. `layer → framework/api-contract` — is this what makes the APIs typed?

**Partly. Correcting it: api-contract types the LAYER-TO-LAYER SEAM, not the browser-facing API.**

**What is in it** — `framework/api-contract/src/`, 1003 lines, **type-only, no runtime code** except
one type guard (`isPendingSessionStart`). Its own header (`index.ts:1-7`): *"type-only API contract
definitions … No runtime code — only TypeScript interfaces and type aliases."*

| file | lines | content |
|---|---|---|
| `core-api-port.ts` | 668 | `CoreApiPort` + its 7 sub-ports (`CoreApiWorkPort`, `CoreApiConversationPort`, `CoreApiKnowledgePort`, `CoreApiOrgPort`, `CoreApiRoutinePort`, `CoreApiUsersPort`) + ~45 request/response/view shapes (`CreateBetRequest`, `TaskView`, `HandoffTaskResponse`, …) + `CoreApiTransport` |
| `agent-orchestration-port.ts` | 126 | `AgentOrchestrationPort`, `AgentOrchestrationSessionsPort`, `AgentOrchestrationSessionWireRow`, `AgentOrchestrationTransport` |
| `settings.ts` | 72 | `SettingsResponse` and friends |
| `auth.ts` | 35 | `AuthMeResponse` |
| `session.ts` | 19 | `PendingSessionStart`, `isPendingSessionStart` |

**How a layer uses it** — 4 production imports, all at seam composition points:

- `layers/core-api/src/services/core-api-port-composition.ts:24` — builds `CoreApiPort` over an
  `hc<AppType>` client; `registerCoreApiTransport` at `:803`
- `layers/core-api/src/services/agent-orchestration-port-composition.ts:19` — the mirror door;
  `registerAgentOrchestrationTransport` at `:186`
- `layers/core-api/src/services/tool-handlers-bindings.ts:26` — tool handlers reaching core through
  the seam
- `layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:24` — the *serving* side
  typing its own responses

The transport is pluggable: the application registers an in-process `app.fetch` adapter
(`applications/remote-server/src/create-server.ts:819,827`), and a split topology would register a
network one at the same call sites.

**The correction that matters:** api-contract does **not** type the API the web app consumes. Per
your own Ruling 4, every response shape in the web package is an unchecked cast
(`res.json() as Promise<T>`), and the Hono RPC client that would have typed it is dead. So
`api-contract` types the *seam between layers*, and the *browser* boundary is still untyped. Do not
let the "APIs are typed" reading make the browser side sound covered.

**This means the rule should be: `layer → framework/api-contract [import]` = ALLOWED**, and — per
your Ruling 3.1 that foundation importability is per-layer — narrowed to *"allowed iff the layer is
a party (host or caller) to a port family declared there."* Today both layers are, on both ports,
so the narrow rule is green on all 4 instances.

---

## 10. `layer → framework [di]` and `service → framework [di]` — why injected rather than imported?

**Short answer: half of them are not DI at all — they are false positives. The other half are real
but unnecessary, left over from a package that no longer exists.**

### `layer → framework [di]` — 4 production instances, all false positives

Every one is a **constant imported from `shared` and passed as a call argument**, which the detector
scores as "wired-in":

- `layers/core-api/src/routes/bets.ts:133` and `:142` — `z.enum(enumValues(BET_OUTCOME_VERDICTS))`
- `layers/core-api/src/routes/tasks.ts:45` — `z.enum(enumValues(TASK_OUTCOME_VERDICTS))`
- `layers/core-api/src/schemas/bet.schema.ts:74` — `BET_STATUSES`

These are ordinary imports of a frozen array, used inline in a Zod schema. No port, no injection, no
inversion. Nothing to rule on.

### `service → framework [di]` — 4 production instances, 2 distinct, both real

- `settings ← shared`: `encryptCredentialValue` / `decryptCredentialValue` injected at
  `applications/remote-server/src/create-server.ts:450`
- `filesystems ← shared`: `createGitRunner` injected at
  `layers/agent-orchestration/src/routes/filesystems.ts:160` and `:272`

The git-runner case carries its own explanation —
`layers/agent-orchestration/src/routes/filesystems.ts:162-165`:

> `createGitRunner` comes from `@hyperidle/shared/git`; the `git-export` package it used to live in
> is deleted. Closes `filesystems`' Increment 2b `FilesystemsGitRunnerFactory` forward-reference.

So the port (`layers/agent-orchestration/filesystems/src/ports.ts:32`
`FilesystemsGitRunnerFactory`; twin at `filesystem-mounting/src/ports.ts:45`) was created to avoid
importing a **sibling service** that has since been dissolved into `shared`. The provider now lives
at `framework/shared/src/git/git-runner.ts:317`, and `@hyperidle/filesystems` already depends on
`@hyperidle/shared`. The indirection buys nothing today.

**This means the rule should be: both rows = ALLOWED (harmless).** Injecting from `framework` never
crosses a layer boundary, so Ruling 1(1) does not reach it, and the alternative — a direct import —
is itself allowed. Two follow-ups worth noting, neither a rule: (a) the detector should stop
scoring an imported constant as DI, or this row will always carry noise; (b) the two surviving
ports are dead indirection a later cleanup round can collapse into plain imports.

---

## 11. `service → framework [event]` — event definitions, or actual handlers?

**Short answer: `framework/shared` contains NO domain event handler logic. It contains the event
type definitions, the bus, and exactly one subscriber — the observability dispatcher. Your instinct
that "handlers in shared would be weird" is right; it just is not what is happening.**

There is one, and only one, `.on` in `framework/shared`:

**`framework/shared/src/observability/dispatcher.ts:473`** — `const unsub = bus.on("*", (event:
DomainEvent) => { translateDomainEvent(event); });`

`translateDomainEvent` is a single `switch` over the ~35 `DomainEvent` kinds that either maps the
event to an `ObservabilityEvent` and enqueues it, or returns `false` to drop it. It has an
exhaustiveness check (`dispatcher.ts:463-467`) so a new event kind is a compile error rather than a
silent drop. It performs no domain work: no DB access, no state transition, no downstream emit. It
is telemetry.

The event **types** also live in shared — `framework/shared/src/events.ts` is the source the census
parses for the event-name set (`scratchpad/census2.ts:529`).

**Why the row is 20 production instances:** because that one wildcard subscription makes `shared` a
subscriber to *everything*, every production emit in the repo resolves `shared` as a target. The 20
are just the emit sites: `run-orchestration/src/provisioner.ts:1080,1526,1627`,
`transition-run.ts:110,201,274`, `runtime-reapers.ts:199`, `file-watcher.ts:74`,
`tool-handlers/src/tool-definitions.ts:1083,1157`, `policy/src/lifecycle-propagation.ts:89,166,517`,
`policy/src/handoff-protocol.ts:359`, `routine/src/routine-scheduler.ts:643,660`,
`work/src/bet-state-machine.ts:232,308`, `work/src/task-state-machine.ts:157`,
`work/src/dependency-watcher.ts:104`. The row is a **volume counter for total emits**, not a
population of framework handlers.

**This means the rule should be: reframe the row before ruling it.** As written
(`service → framework [event]`) it can never go green while the dispatcher exists, and forbidding it
would forbid all event emission. See question 12 for the actual decision.

---

## 12. `framework → EventBus [event]` — why does the framework touch the bus?

**Short answer: one subscriber, the same one from question 11. It is a sound design decision and a
real architectural breach at the same time — which is why it needs a decision, not a verdict.**

`framework/shared/src/observability/dispatcher.ts:473`, `bus.on("*", …)`. Sole production instance.

Its own rationale (`dispatcher.ts:12-19`):

> We subscribe to the EventBus exactly once (wildcard). Per H3 plan §3.9, this replaces the
> alternative of wiring 30+ call sites. New DomainEvent kinds added to `shared/events.ts` pass
> through the wildcard handler and fall into the `default` branch (dropped explicitly, not
> silently).

Design-wise it is good: one subscription instead of thirty, and the exhaustiveness check turns a new
event into a compile error. The dispatcher is also carefully non-blocking — O(1) enqueue, background
flush, adapter failures are telemetry-only (`dispatcher.ts:2-24`).

**But structurally it makes `framework/shared` an EventBus endpoint**, and `shared` is supposed to
be the leaf everybody imports, not a participant with behaviour. That is the whole reason questions
11 and 12 exist and the reason every emit in the repo attributes to `shared`.

**This means the rule should be: `framework → EventBus [event]` = ALLOWED for a bus-owning module,
but only after the dispatcher moves out of `shared`.** Keep the wildcard subscriber — the design is
right — and relocate it to a module that is *allowed* to be an endpoint (its own observability
package, or a layer-root service). If it stays in `shared`, the rule is unenforceable: you would
either forbid all event emission or carve out a permanent exception for the one file. Note this is
the *only* thing in `shared` that behaves, so the move is small and it makes the rule mechanical.

---

## 13. The MCP seam

**Short answer: the seam is split across all four layers plus the application, and the split does
not follow any one principle. Below is the map, then what is structurally wrong.**

### End-to-end map

| step | who | where |
|---|---|---|
| **1. Tool contract types** | `framework/shared` | `framework/shared/src/tool.ts:138` — `ToolRegistry`, `RegisteredTool`, `ToolContext`, `ProposedCallWorkflowPort` |
| **2. Tool bodies defined** | `tool-handlers` service (**agent-orchestration**) | `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`, exposed as `buildToolDefinitions(ports)` (`tool-handlers/src/index.ts:25`) |
| **3. Tool bodies wired to domain services** | **core-api layer root** | `layers/core-api/src/services/tool-handlers-bindings.ts:200` — `export const allToolDefinitions = buildToolDefinitions(toolHandlersPorts)`; each port routes through `CoreApiPort` (`:38-52`) |
| **4. Registry assembled + role-filtered + dispatch** | `harness-registry` (**agent-execution**) | `layers/agent-execution/harness-registry/src/tool-registry.ts:62` `buildToolRegistry(...)`; production entry point re-wired at `layers/core-api/src/services/tool-provider-bindings.ts:56` |
| **5. MCP router + bridge defined** | `harness-registry` (**agent-execution**) | `layers/agent-execution/harness-registry/src/mcp/index.ts:18` `createMcpToolBridge`; `mcp/mcp-route.ts:66` `createMcpRouter`; `mcp/mcp-bridge.ts:119` `createMcpSession` |
| **6. MCP SDK dependency** | `harness-registry` only | `mcp/mcp-bridge.ts:8-11` — `@modelcontextprotocol/sdk/{server/mcp,server/webStandardStreamableHttp,server/zod-compat,types}` |
| **7. Bridge constructed** | **remote-server application** | `applications/remote-server/src/create-server.ts:551` `createMcpToolBridge({ enforcement: enforcementRegistry })` |
| **8. Router hosted (HTTP)** | **remote-server application** | `create-server.ts:788` `api.route("/", mcpBridgeRegistry.router)` — mounted **before** the auth middleware (`:792`) |
| **9. Token issued** | `harness-registry` | `mcp/mcp-bridge.ts:125` `crypto.randomBytes(32).toString("hex")` — 64 hex chars, per session, `{ token }` returned from `bridge.open()` |
| **10. Session opened** | `run-orchestration` service (**agent-orchestration**) | `layers/agent-orchestration/run-orchestration/src/provisioner.ts:1327` `mcpBridgeRegistry.open({ sessionId, registry, onToolCall })`; URL baked at `:1350` as `${mcpBaseUrl}/api/mcp/${bridge.token}` and written into the sandbox's `.mcp.json` |
| **11. Called** | the **harness CLI**, out of process | `ALL /api/mcp/:token` (JSON-RPC) and `POST /api/mcp/:token/return-status` (hook adjudication), both declared at `mcp/mcp-route.ts:36-51` |

Auth is the path token: unknown token → 401 (`mcp/index.ts:44`,
`instance.transport.handleRequest` vs `new Response("Unauthorized", { status: 401 })`).

### What is structurally wrong

1. **The router is defined in agent-execution but hosted by the application.** `harness-registry`
   builds a `Hono` router (`mcp/index.ts:9`, `router: Hono`) and hands it out as a value;
   `remote-server` mounts it (`create-server.ts:788`). No layer owns the HTTP surface. This is the
   one route family in the repo with no layer host — core-api hosts its own routes
   (`layers/core-api/src/app.ts`), agent-orchestration hosts its own
   (`layers/agent-orchestration/src/app.ts:55-63`), MCP hosts nowhere.

2. **AU26's locked design was never built.** The census row `agent-execution → MCP router` is
   0 instances, with the note: *"AU26's locked design: agent-execution exports its own Hono app
   carrying the MCP router and the Application mounts it."* Reality:
   `layers/agent-execution/src/index.ts` exports four adapter symbols and
   `SessionActivityBuffer` — no app, no router (`layers/agent-execution/package.json:14-17` depends
   on `harness-registry` + `shared` only). The layer barrel's own comment still says *"Nothing
   consumes this Layer barrel yet."* Everything goes around the layer, straight to
   `harness-registry`.

3. **The tool definitions cross two layer boundaries before they reach the router.** Bodies are
   defined in agent-orchestration (`tool-handlers`), wired in core-api
   (`tool-handlers-bindings.ts:200`), assembled in agent-execution
   (`harness-registry/src/tool-registry.ts:62`), then handed back through the application to a
   router that agent-execution also owns. `layers/core-api/src/services/tool-provider-bindings.ts`
   imports from **three layers at once** — `@hyperidle/harness-registry` (`:20`),
   `@hyperidle/harness-registry/mcp` (`:21`), `@hyperidle/review` (`:22`) — which is exactly the
   `layer → service (other layer)` crossing you ruled forbidden (36 production instances repo-wide).

4. **The two application-side instances you were asked to rule are the symptom, not the cause.**
   `create-server.ts:551` and `:788` only exist because no layer will host the router.

**This means the rules should be:**
- `application → MCP router [mcp]` = **FORBIDDEN as an end state, unavoidable today.** The
  application should mount an app, not construct a bridge. Rule it forbidden and let the ratchet
  carry the 2 instances until the router gets a host.
- `service → MCP router [mcp]` (the 1 instance at `provisioner.ts:1327`) = **ALLOWED.** Opening a
  per-session bridge is the provisioner's job — it is the only thing that knows a session started.
  It should reach the bridge through an injected port, which it already does (`mcpBridgeRegistry`
  is a dep, not an import).
- `harness-registry → MCP router [mcp]` = **ALLOWED**, unchanged. Defining the router next to the
  MCP SDK, in the package that provisions the harness, is right.
- The structural fix, for the later relocation round: **agent-execution exports an app carrying the
  MCP router; the application mounts it, the way it already mounts the other two layer apps.** That
  closes points 1, 2 and 4 in one move.

---

## 14. `db:table (owner moved)` — "either it is owned by this service or not"

**Short answer: agreed — and in all 5 cases there IS a clear owner. The category means only that
the recovered registry records the owner at a `packages/...` path AU19/AU26 relocated. It is a
stale-path problem, not an ownership problem.**

The ownership map was recovered out of git from the deleted `scripts/table-ownership-guard.ts`; it
records owners as paths like `packages/core-api/connections`, from before the role-folder
restructure. When the package at that path no longer exists there, the census cannot mechanically
decide whether the successor inherited the table — so it parks the row rather than guessing.

### The 5 tables

| table | recorded owner (old path) | today's sole production accessor | new home | verdict |
|---|---|---|---|---|
| `filesystems` | `packages/core-api/filesystems` | `filesystems` | `layers/agent-orchestration/filesystems` | **same package, moved layer** — real owner |
| `filesystemInjections` | `packages/core-api/filesystems` | `filesystems` | `layers/agent-orchestration/filesystems` | **same package, moved layer** — real owner |
| `serviceConnections` | `packages/core-api/connections` | `connections` | `layers/agent-orchestration/connections` | **same package, moved layer** — real owner |
| `filesystemCaptures` | `packages/core-api/filesystems` | `filesystem-mounting` | `layers/agent-orchestration/filesystem-mounting` | **split-off package** — real owner |
| `serverCredentials` | `packages/core-api/connections` | `credentials` | `layers/core-api/credentials` | **renamed remainder** — real owner |

### Evidence per case

**`filesystems` / `filesystemInjections`.** `git ls-files` shows the only tracked source is
`layers/agent-orchestration/filesystems/src/**`; `layers/core-api/filesystems` holds a stale `dist/`
and nothing tracked. Sole accessor `layers/agent-orchestration/filesystems/src/filesystem-registry.ts`
(imports at `:1`; reads/writes at `:22,29,40,41,47,50,52,60,64,71,80`).

**`serviceConnections`.** Same shape. `layers/agent-orchestration/connections/src/index.ts:11-18`
states it: *"this package is the destination half of the connections relocation …
`service_connections` is agent-session-provisioning domain, not core domain."* Accessors:
`service-connection-store.ts:22,52,56,70,93,108`, `service-connection-resolver.ts:20,43`,
`held-connections-for-provisioning.ts:52,87`. The barrel explicitly refuses to re-export the raw
table (`index.ts:4-9`).

**`filesystemCaptures` — a split, not a move.** Its writer left `filesystems` for a new package.
`layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:3-9`: *"relocated VERBATIM
from `layers/core-api/filesystems/src/mounter-registry.ts` … `filesystem_captures` is now owned
HERE — this class is its only writer."* Sole accessor: `mounter-registry.ts:17` (import), `:339`
(insert).

**`serverCredentials` — a rename of the remainder.** `layers/core-api/credentials/src/index.ts:12-20`:
*"this package used to be `layers/core-api/connections` / `@hyperidle/connections` and held BOTH
catalogs. `service_connections` … left for `layers/agent-orchestration/connections` …
`server_credentials` stayed … The package is now named for what it actually holds."* Sole accessor:
`credential-store.ts:21,54,59,92,110` and `credential-resolver.ts:15,52`.

### The decisive fact

Across all 33 production accesses in this category, **every table has exactly one production
accessor**, and it is in every case the documented successor. There is no contention, no second
claimant, no ambiguity to adjudicate.

**This means the rule should be: RATIFY the successor as owner for all 5 tables, and the rows
become `db:table (own)` = ALLOWED.** Your recorded verdict is `forbidden` for both the `[import]`
and `[table]` rows — that verdict, applied literally, would make `filesystems` unable to read the
`filesystems` table. The right action is not a verdict at all; it is updating the ownership registry
to the new paths:

```
filesystems           → layers/agent-orchestration/filesystems
filesystemInjections  → layers/agent-orchestration/filesystems
serviceConnections    → layers/agent-orchestration/connections
filesystemCaptures    → layers/agent-orchestration/filesystem-mounting
serverCredentials     → layers/core-api/credentials
```

Then the category is empty and the rule row deletes itself.

---

## 15. `layer → agent-orchestration [api]` — is it correct?

**Short answer: yes, it is correct and it is the pattern you want. 2 production call sites, both
core-api reading a session row through agent-orchestration's own door instead of touching the
table.**

**What exists.** AU26 gave agent-orchestration its own app and routes:
`layers/agent-orchestration/src/app.ts:55-63` mounts `/sessions`, `/agent-orchestration`,
`/connections`, `/filesystems`; the route modules are
`layers/agent-orchestration/src/routes/{sessions,agent-orchestration-sessions,connections,filesystems,session-stream-ws}.ts`.
The read door is `agent-orchestration-sessions.ts`, mounted at `/agent-orchestration`
(`app.ts:56`).

The port is typed in `framework/api-contract/src/agent-orchestration-port.ts` and composed in
`layers/core-api/src/services/agent-orchestration-port-composition.ts` (`buildAgentOrchestrationPort`,
transport registered by the application at
`applications/remote-server/src/create-server.ts:819`).

**Who calls it** — 2 production instances, both `sessions.getById`:

- `layers/core-api/src/routes/sessions-routes.ts:62-63` — projecting an admitted explicit start
- `layers/core-api/src/routes/tasks.ts:287-289` — resolving the session before a handoff

Both carry the rationale inline. `sessions-routes.ts:53-56`:

> this side's legal way is `AgentOrchestrationPort.sessions.getById` — a Layer route reading the
> other Layer's data goes through the read door (§D-A rule 3), never a raw
> `db.select().from(sessions)`.

**One stale comment worth flagging, not a defect in the rule.**
`agent-orchestration-port-composition.ts:6-8` still says the route is *"mounted at
`/api/agent-orchestration` in `app.ts` … the HTTP hosting lives in core-api even though the
data/query logic is agent-orchestration's own."* That was true before AU26; today
`layers/agent-orchestration/src/app.ts:56` mounts it. The comment is out of date.

**This means the rule should be: `layer → agent-orchestration [api]` = ALLOWED.** It is the direct
application of your own Ruling 1(3), it replaces raw cross-layer table reads, and it is the model
the rest of the repo should converge on — the 36 `layer → service (other layer)` imports are the
crossings this pattern is meant to retire.

---

## 16. `application → db:util` — who, and why?

**Short answer: one instance, `remote-server` calling `resolveProfile`, and it has nothing to do
with the database.**

`applications/remote-server/src/create-server.ts:72` imports `resolveProfile` from `@hyperidle/db`.
The function is `framework/db/src/profiles.ts:62`: it reads `options.profile ?? env.HYPERIDLE_PROFILE
?? "laptop"` and returns a `ProfileDefaults` record — driver (`pglite` | `postgres`), default DB
URL, sandbox adapter (`local` | `docker` | `e2b`), whether Docker Compose is required, and default
ports (`profiles.ts:18-41`). Pure; the file imports nothing.

The application needs it at boot to decide how to construct the server. That is a legitimate need.
It is only a `db` import because the profile record happens to carry a `dbDriver` and
`dbUrlDefault` field — deployment configuration filed under the database package.

**This means the rule should be: rule the row moot rather than adjudicate it.** Move `profiles.ts`
to `@hyperidle/shared` (or a small config module) alongside the other two `db:util` symbols from
question 4, and `application → db:util` stops existing. Ruling it `allowed` freezes a
misfiling; ruling it `forbidden` breaks boot. The relocation is the answer.

---

## Verdicts in round 1 that the evidence contradicts

| rule | your verdict | what the code shows |
|---|---|---|
| `application → layer [api]` | *unsettled — "not actively done, what is the purpose?"* | It **is** actively done. `applications/remote-worker/src/remote-worker-client.ts:118,136-139` dials core-api's `/api/auth/worker-token` and agent-orchestration's `/api/ws/worker`. The census shows 0 because it does not count raw `fetch`. Should be **ALLOWED**, and the detector fixed. |
| `service → db:table (owner moved) [import]` and `[table]` | **forbidden** | Applied literally this stops `filesystems` from reading the `filesystems` table. All 5 tables have exactly one production accessor and it is the documented successor in every case. Should be **ratify the successor → ALLOWED**, plus a registry path update. |
| `layer → db:zod-schemas [import]` | **allowed** | Every symbol is generated from exactly one table, so the table ACL applies symbol-by-symbol. Allowing the barrel while forbidding the table import is a hole. One production call site (`layers/core-api/src/schemas/bet.schema.ts:15`), so tightening costs one line. Should be **owning service re-exports**. |
| `service → framework [event]` | *unsettled — "handlers in shared would be wrong"* | There are no handlers in shared. One wildcard subscriber (`framework/shared/src/observability/dispatcher.ts:473`) makes every emit in the repo attribute to `shared`. The row is a total-emit counter, not a rule. Reframe before ruling — see Q11/Q12. |
| `service → own layer [event]` | *unsettled — "why send events to the layer?"* | Nothing is sent to a layer. Anonymous pub/sub; the census attributes the subscriber's package, and subscribers sit in the layer root (`work-state-push-gateway.ts:39`, `app.ts:491`). Collapse into the EventBus rows. |
| `service → framework/db [manifest]` vs `db:manifest` | *"what is the difference?"* | None. Same 22 production edges under two labels (`scratchpad/census2.ts:510-512`; arithmetic in Q8). Delete one row. |
| `layer → db:unknown [import]` | **forbidden** — "db:unknown should not exist" | Correct as a verdict, but only 1 of the 3 production instances is a real unclassified symbol (`routes/agents.ts:32`). The other 2 (`applications/desktop/src/main.ts:450,451`) are `await import()` calls the detector cannot resolve — they are `db:client` and `db:bootstrap`. The verdict will not go green on a detector fix alone. |
| `layer → framework [di]` | *"questionable — why DI into the layer?"* | All 4 production instances are false positives: `shared` constants (`BET_OUTCOME_VERDICTS`, `TASK_OUTCOME_VERDICTS`, `BET_STATUSES`) passed inline to `z.enum`. No DI exists here. |
