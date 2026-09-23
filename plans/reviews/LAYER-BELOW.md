# The layer below the contract

The contract is settled: 17 actions, 9 events (`ACTIONS.md`). This answers: what should sit
between that contract and the database, and what is the simplest setup that makes the
contract real for both the UI and the MCP surface?

Evidence: `census/layer-below.md` (the code, 2026-09-11) and two research reports,
`research/interface-technology.md` and `research/service-shape.md` (web, tiered, cited).
Decision points are marked **?**. One at a time.

---

## 1. What the code says today

- **Routes are the fattest layer and own the wrong things.** 9,584 lines of routes against
  15,822 of services. Routes own authz, actor read, id generation, transaction opening, most
  event emission, response shaping, WS push. The thread service says it in its own
  header: "owns the ROW WRITE ONLY — no event emission, no transaction orchestration". The
  message-post handler is ~350 lines in one function.
- **Nothing is derived; everything is mirrored by hand.** `CoreApiPort` is 43 hand-typed
  methods; Hono RPC inference is cast away at both call sites because it collapses under
  `app.route`; the UI has one hand-copied wire type and 95 raw `apiFetch` calls, 64 in pages.
  Fidelity between tool and route is a test obligation, never a type.
- **The agent seam is an HTTP client to the same process.** The tool layer builds a fresh
  `hc` client per tool call to dial routes on the app it runs inside. The network transport
  it exists for has no production call site. Every shipped shape is one process.
- **Identity is a header.** An API-key holder acts as anyone by setting
  `x-hyperidle-actor-id`. That is how tools become the agent. The MCP token authorises the
  session; the actor is baked into a closure.
- **The bus is in-memory and synchronous; nothing is stored.** A crash between commit and
  emit loses the event. The routine scheduler subscribes to all 29 event types and queries the
  DB on each. Live updates are hand-pushed at two sites, not mirrored from the bus; the `work`
  topic has zero listeners.

## 2. What the evidence says

From `research/service-shape.md`:
- **Organise by object, not by verb, not by layer.** The shipped systems closest to "few
  nouns, few verbs" (Phoenix contexts, 37signals' Basecamp, Convex) put the verbs on the noun,
  keep public functions thin with a validator on every one, and have **no application-service
  layer above**. The warned failure is a shared orchestration layer above the modules, not a
  shared invariant inside them.
- **"Validate the resulting state" is a named pattern** (always-valid model; Ecto). The
  practical line is Ecto's: *validations* (pure, on the value — shareable with the UI) vs
  *constraints* (need the DB — server only). Nobody runs invariants on the client for
  affordances; LiveView runs them on the server per keystroke. A pure TypeScript invariant
  shared across a monorepo is well-trodden; the DB- and permission-dependent half stays server.
- **Whole-object edit with lifecycle as a field is how Linear and Notion expose writes.**
  Both take *partial* input. What is lost is intent; it is recovered with a change event that
  carries a diff plus who/why, written in the same transaction.
- **Events: one post-commit emit is "good in most cases"; a table is the 100% answer.**
  Small-team sources converge on a Postgres table as source of truth (outbox / SKIP LOCKED),
  NOTIFY only as a wake-up, at-least-once with idempotent consumers, and a broker only when
  a nameable limit is hit. Plane runs one outbox feeding webhooks, automations, and live UI —
  exactly "humans and agents from one stream". LISTEN/NOTIFY takes a global lock at commit
  (Recall.ai) and is unverified on PGlite; a polled table is plain SQL and works everywhere.
- **search + open per object is the shape Linear and Notion expose.** Notion documents why
  one cross-object search does not replace a per-object structured list: they ship both.
  List views that need joins get a read model per view, not a resolver per field.

From `research/interface-technology.md`:
- **No shipped product runs MCP as its own UI's API.** Every one (Linear, Notion, Sentry,
  GitHub, Stripe, Cloudflare, Atlassian, Supabase) runs MCP as a second, curated surface over
  an internal action layer; tool counts sit at 8–25; 1:1 endpoint mirroring is the one stated
  regret (GitHub, Notion). The agent authenticates as the user and inherits their permissions.
- **One declaration (name + zod schema + handler) already projects to HTTP and to a tool**
  in first-party tooling: MCP SDK `registerTool`, oRPC → AI-SDK tool, Notion's OpenAPI → Zod
  pipeline. Zod 4 emits JSON Schema 2020-12, which is the MCP default. **No source shows the
  same declaration driving a UI action** — that wiring is always by hand.
- **MCP is a closed push channel after the 2026-07-28 spec**: no server-initiated requests,
  no domain events, no resume. Events to humans and agents need their own channel.
- **RPC-per-action fits named actions; REST resources fight them.** tRPC v11 is stable with
  SSE subscriptions but alpha OpenAPI and community-only MCP. oRPC has native OpenAPI and
  AI-SDK tools but no MCP adapter and is young. Hono RPC has open inference-collapse issues
  around `app.route` — the exact reason this codebase gave up on it. GraphQL adds a codegen
  step. What tRPC/oRPC buy is type inference across hundreds of procedures. We have 17.

## 3. The shape: one module per object, one list of actions

**A layer below the contract that is the contract.** Each object is a module. Each module
exports its actions in one shape — the shape `tool-definitions.ts` already uses:

```
name         "task.edit"              the sentence, dotted
description  what the agent reads
input        zod schema               → JSON Schema 2020-12 for MCP, TS type for the UI
invariants   (next: Task) => Problem[]   pure; the UI imports this
run          (ctx, input) => result   ctx = { actor, db, changes }
```

- **Reads.** `search`: one structured filter list per object, backed by one read model per
  list view (the join done once). `open`: one get, with what the view needs.
- **Write.** `edit`: load → apply the partial → `invariants(next)` → write in one transaction
  → append one row to `changes` (object, id, actor, before/after diff, at) → commit → wake.
  The change row *is* the event. `thread.message` is the same path on a message.
- **Actor.** `ctx.actor` is a user id resolved once by whatever transport delivered the call
  (login session, API key, MCP session token). No impersonation header. Human or agent is
  just `kind` on the row.
- **Authorisation** is an invariant like any other: "this actor may not set this field" is
  a `Problem`. The UI shows the reason, not just a grey button.

The layer split stays. Core's four objects are core's modules; `session` is orchestration's;
`platform` is settings'. The **application composition root joins each layer's action list
into one list** — exactly how `compose-api-application` joins each layer's routers today.
Core never imports orchestration and vice versa.

## 4. The projections — what reads the list

| Surface | Today | Under the list |
|---|---|---|
| HTTP | 126 hand-written routes, 9,584 lines | one mount loop: `POST /api/<object>/<action>` per entry, parse with `input`, call `run`, return. Plus the 16 plumbing routes by hand. |
| MCP | 20 tools re-implemented over an HTTP client seam (2,316 + 1,083 + ~900 lines) | `registerTool(name, {description, inputSchema}, run)` per entry, filtered by what the actor may do. In-process. The seam, `CoreApiPort`, `tool-handlers`: gone. |
| UI | 95 raw fetches, 1 wire type, 32 hooks | one typed client derived from the list's types: `call("task.edit", input)`; `invariants` imported for affordances; the server answers the DB-dependent half. |
| Events | in-memory bus + 2 hand-pushed WS sites | `changes` table is the log; one stream (SSE or the existing WS) of the 9 events, filtered per user; subscriptions (agent → run a document, human → notification) read the same rows. |
| Lint | 15 governance rules, none about the surface | one rule: every entry is mounted, registered, and referenced; every route is an entry or plumbing; every tool is an entry; every emitted event is one of 9 + 8 platform. |

## 5. Interface technology — the call

**Stay on Hono + zod. Do not adopt tRPC, oRPC, GraphQL, or MCP-as-API.**

- tRPC/oRPC exist to infer types across hundreds of procedures without a contract. A
  17-entry action map *is* the contract; its TypeScript type is the client type for free.
  Adding a framework buys nothing at this size and adds a second way to declare an action.
- Hono's own RPC inference is what already failed here (`census` §3). Not going back to it.
- GraphQL adds a schema language and a codegen step to reach a shape (named mutations,
  one get, one filtered list) the action map already has.
- MCP as the UI's API has no precedent in any shipped product, and the current spec closes
  the push channel the UI needs.
- The MCP SDK already takes zod and emits 2020-12. `@hono/mcp` already mounts it. Both are
  in the tree today.

What changes is not the technology; it is that the routes stop being the place where things
are declared. They become one loop.

## 6. Simplest setup, and what it deletes

| Builds | Lines, rough |
|---|---|
| 6 action modules (4 objects + session + platform), each with search/open/edit + invariants | the services, re-cut; most is moved, not new |
| `changes` table + one migration + one append helper | small |
| HTTP mount loop, MCP register loop, UI client type + `call` | ~200 |
| one event stream, per-user filter | ~150 |
| subscriptions on user (replaces routines + notification queue) | ~300 |
| one governance rule | ~100 |

| Deletes | Lines |
|---|---|
| `layers/core-api/src/routes/` (28 files) minus plumbing | ~9,000 |
| `framework/api-contract` | 1,083 |
| `tool-handlers` + `core-api-port-composition` + `tool-handlers-bindings` | ~3,300 |
| `routine/` + `notifications/` as separate systems | ~3,300 |
| UI hooks that wrap fetches; `types/task.ts` | ~3,000 |
| hand-pushed WS sites, `work-state-push-gateway` | small |
| attention engine, stale events fork, 22 routes, 8 events (step 1 of `EVOLUTION-PATH.md`) | ~1,800 |

Net: the layer below shrinks by roughly half, and every line that remains is either an
action, an invariant, a read model, or a loop.

## 7. Decisions

Founder, 2026-09-11: "I don't care specifically about the technology. I want something that
produces a robust and simple solution. If we can delete and simplify all the way down to the
services I would call that a success."

Settled by that:
1. **Technology** is not a founder decision. Hono + zod + the MCP SDK already in the tree;
   no new framework. The action list is the declaration; everything else is a loop.
2. **The services are replaced, not wrapped.** The ten service packages become six action
   modules. `work` → `task`; `conversation` → `thread`; `knowledge` → `document`;
   `users` + `org` + `routine` + `notifications` + `credentials` → `user` (subscriptions,
   team attribute, connections); `settings` → `platform`; `policy` dissolves into invariants
   on task and thread. Orchestration keeps `session`.
3. **Tools call the modules in-process.** The HTTP seam, `CoreApiPort`, `tool-handlers` go.
   The layer split stays; the composition root joins each layer's list.
4. **`changes` table is the event log.** Written in the edit's transaction; carries object,
   id, actor, diff, time. Subscriptions and the UI stream read it. The in-memory bus becomes
   a wake-up, never the source of truth. Robust > clever.
5. **Routes are a loop** over the list plus the 16 plumbing routes by hand.

Build-time calls, default stated, no founder question needed:
- **Edit input is partial; the invariant always sees the whole resulting object.** A caller
  may pass the version it read; if passed and stale, the edit is refused. If not passed,
  last write wins. (Linear and Notion both take partial input; no shipped API does a
  literal replace.)
- **Search**: one structured list per object. A cross-object text search is added only if a
  screen needs it (Notion ships both; the list is what agents use).
- **UI push**: one stream of the 9 events, per-user filtered. SSE or the existing WS —
  whichever is fewer lines once the `changes` table exists.
- **Invariant split** (pure vs needs-DB) decided per object when built.

## 8. Layers — what crosses them, and how

The layer split stays. What changes is what crosses it.

| Layer | Today | Under the list |
|---|---|---|
| `framework` | `api-contract`: 43 + 13 hand-mirrored port methods | **The declarations live here**: name, sentence, input shape and the pure invariants of all 17 actions. The UI and the layers both import them — `core-ui` cannot import `core-api`, so this is the only place a button can read an invariant from. Replaces `api-contract`. |
| `core-api` | 10 services, 126 routes, 14 reaction files, the seam client | Four modules (task, thread, document, user) implementing `run`; own their tables. Declares one port: *run this work*. |
| `agent-orchestration` | run-orchestration, session-requests, tool-handlers, connections, filesystems, session routes + WS | The `session` module (see what's running · watch · stop) over the same queue and provisioner. Loses tool-handlers and the seam client. **Corrected by BC5:** connections and folders stay here, behind two new `AgentOrchestrationPort` methods the user module calls — not moved into `core-api`. Moving them would make the executor read core, the one thing this split forbids; `runConfig` already lives behind the same port for the same reason. Declares one port: *record what happened on this task*. |
| `agent-execution` | harness adapters, sandbox, MCP bridge, remote workers | Unchanged in role. The MCP bridge receives the composed list as a value and registers it. Identity from the session, as today. |
| `applications` | composes routers on one Hono root | Composes modules: binds the two ports, joins the lists, mounts the HTTP loop, hands the list to the MCP bridge, runs the one event stream. |

**Core ↔ orchestration.** Orchestration is a blind, request-driven executor: it never reads core,
core never pushes it state. Two ports, both bound at the root:
- *Run this work* (core → orchestration): `task.edit` accepts an owned task, commits, then calls the
  port with the baked bundle. Today the work-intent seam over HTTP in the same process; tomorrow a
  bound function. Same direction, same content.
- *Record what happened* (orchestration → core): a session ends; the port is bound to `task.edit`.
  Today `session_ended` + a reaction file in core. Tomorrow the same edit a person would make, so
  the lint sees it. This is how session start/end fold into `task.changed`.

Agents no longer pass through orchestration to reach core: the MCP bridge calls the modules
directly. `api-contract` shrinks from 56 mirrored methods to two ports.

**Between modules.** A module reaches another only through that module's actions: `open`/`search`
to read, `edit`/`send a message` to write — after its own commit, as the same actor, in-process.
Never the other's tables, never its internals, never a shared transaction. Ids stay ids; storing a
thread's id needs no thread code. The lint enforces it: a module imports the declarations and
nothing else of another module. Consequence for the track: while a neighbour is still a legacy
service, the link calls the legacy service and whoever lands second swaps it — so BC3, BC4 and BC6
run in sequence, not in parallel.
