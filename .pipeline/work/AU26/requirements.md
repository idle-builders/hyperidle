# AU26 — Requirements

DOC-CLASS: significant

Spec of record: `.pipeline/work/AU26/plan.md` (unchanged by this refine — see §7). Tier: **production**. Every `file:line` below re-traced with `rg -a` at `75d85687` + this branch's refine commit.

---

## 1. What this work package is

AU26 is a **cleanup work package**. It has two jobs.

**Job 1 — go through the agent-related things sitting in `core-api` and move the ones that don't belong there.** Four of them: connections, the folder-mounting engine, the agent-config columns on the `users` table, and the WebSocket hub.

**Job 2 — give `agent-orchestration` its own API**, so `core-api` stops serving agent web addresses on orchestration's behalf. The first case is session/harness streaming: the UI should dial orchestration directly.

The deliverable is **moved code**, not a document. Three of the four items need a verdict before they can move, and the verdict follows the evidence — "it stays" is a legitimate answer. But a verdict that says "relocate" gets executed here, in this WP. A verdict parked as a follow-up is a failed AU26.

**Why now.** AU21 shipped a real boundary (orchestration reads zero core state), but it had to bake the connection list onto every emitted request (Decision K1) purely because connections lived on the wrong side. That's a stale-copy hack paid for by a misplacement. The same shape sits unexamined in the other three items. And because orchestration has never owned an app, every agent-domain route has landed in `core-api` by default rather than by decision — so this keeps happening.

**Audience.** The maintainer or agent who adds the *next* agent capability. After this, they have a rule for which side it goes on and an obvious place to put a new route.

---

## 2. The rule we judge each item by

> **Does the core app ever actually use this itself, for its own purposes — or does it only let a human configure it and then hand it to an agent?**

If core never genuinely uses it, it doesn't belong in `core-api`. One real use and it stays.

How to answer it honestly:

- **Find every place it's really called.** `rg -a` at HEAD (plain `grep` silently skips files with control characters). Include the sites a thin local wrapper hides.
- **Look at each one.** A real use means core *does* something with the result — writes a core table, gates an operation, emits an event, enqueues work. Rendering it into a `core-api` response is not a use: every core route renders in core, so counting that would make everything stay by construction.
- **Never assert it from prose.** A doc, a prior WP's write-up, or a `@lore` comment is a lead. The call site is the evidence.
- **Name the unit precisely.** A record and the engine that acts on it are different things. A table and a few of its columns are different things. A route's hosting and its query logic are different things. Each gets its own answer; none inherits a sibling's.

Arguments that do **not** count as "core uses it": it's already there · the UI already calls core-api · it's infrastructure · the security code lives there · `core-api` is the layer with the HTTP surface. Those are engineering conveniences, and the whole point of AU26 is that they're what put this code in the wrong place.

Destination rules: relocations go to `agent-orchestration`, never `agent-execution` (that layer has no DB credentials and may run on another machine). Table *definitions* stay in `packages/db/src/schema.ts` — only the owning package changes. `AgentOrchestrationPort` stays strictly read-only (`packages/api-contract/src/agent-orchestration-port.ts:22`); a relocated thing that needs a mutation door gets an orchestration route, never a Port method. And a move deletes the hack it replaces rather than living next to it.

**One known weakness, for architecture to fix (§8 item 1).** For a unit that's only ever wired up in a composition root, the call sites tell you nothing — every site is just wiring. `session-activity-gateway.ts` and `work-state-push-gateway.ts` look identical under this rule (same `register…(eventBus, wsHub)` shape, one site each in `server-factory.ts:1181` / `:1122`), yet the first should move and the second obviously shouldn't. There are 11 such `export function register…` units in `packages/core-api/src/services/`.

---

## 3. Job 1 — the four items

### Item A · connections — verdict settled, build the move

AU21's Decision J already traced this and concluded a full move. **Do not re-derive it.** Its four increments (extract the AES-GCM primitive to `@hyperidle/shared`; rename the core package to `@hyperidle/credentials`, stripped to the LLM-key catalog; stand up a SQL-owning `agent-orchestration/connections` Service; re-host the management surface) are locked.

Done means: `serviceConnections` has exactly one Service importer, a guard fails the build if a `core-api` Service touches the table, and K1's bake is gone — `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` deleted along with its wiring, with a test proving a connection added after an intent is emitted but before it drains still gets provisioned at spawn.

Two things to resolve on the way:

- **A second consumer exists.** `packages/core-api/settings/src/plugin-configuration.ts:727` calls `deps.serviceConnections.listByAuthSource(db, "mcp")` (injected, declared at `:64`). It has to be resolved before "exactly one importer" is true.
- **Decision J6 is superseded.** J6 kept connections' web addresses in `core-api` because "core-api is the layer with the HTTP surface." That is exactly the reasoning this WP kills, and Job 2 removes the fact it rested on. So connections' routes — reads *and* mutations — go to orchestration's own API, and J6's planned `AgentOrchestrationPort.connections` read family is not built. J7's deletion of `CoreApiPort.connections` stands unchanged.
- **Consequence for ordering:** the orchestration app skeleton (§4) is built **first**, then connections' routes land on it. Hosting them in `core-api` "for now" would manufacture exactly the throwaway patch this WP exists to delete. Only Decision J's last increment (re-hosting) depends on the skeleton — J1–J3 touch no HTTP surface and can still lead.

### Item B · the folder-mounting engine (`RegistryFilesystemMounter`)

`core-api` holds the code but never runs it. Confirmed at HEAD: it's constructed once, at `packages/core-api/src/server-factory.ts:1006`, and the only non-test `.mount()` / `.captureBack()` calls are in `agent-orchestration`'s `run-orchestration/src/filesystem-provisioning.ts:78` and `provisioner.ts:527`. (`core-api`'s only other `.mount()` calls are in `filesystems`' own adapter tests.) Architecture re-runs the trace itself and writes the verdict; if it's relocate, the engine moves with Item A's rigor.

The filesystem **record** (team-registered repo/doc-set locations) and the reachability-probe UI get their **own** verdict, not an automatic follow. `plan.md` says both things here — `:30` says they stay core "regardless," `:46` says that's not foregone. `:46` governs: `:30`'s reason ("human-administered configuration data") is one of the disqualified arguments in §2.

AU21's Decision J8 stands where it applies — it decided *where the reachability probe's resolver call executes* (in-layer in `run-orchestration`), a direct consequence of moving the resolver, and `packages/core-api/src/routes/filesystems.ts:6` still type-imports `ServiceConnectionResolver` from `@hyperidle/connections` at HEAD. Its fallback clause about reading "via the J6 door" dies with J6.

### Item C · the agent-config columns on `users`

Harness, model and concurrency settings sit on the same row as human identity. At HEAD (`packages/db/src/schema.ts`): `kind:50`, `maxConcurrentSessions:62`, `harnessType:76`, `modelTierPreference:78`, `modelId:84`, `modelProvider:92`. **`modelTierPreference` is a sixth column of the same shape and is missing from `plan.md`'s list of five** — it's in scope. `systemPrompt:74`, `systemPromptPath:53`, `skills:60` and `status:61` are adjacent; architecture makes an explicit in-or-out call on each rather than skipping them silently.

Each column is its own unit. The verdict needs a real reader/writer trace and an explicit statement of whether a clean cut is possible without breaking `users` as the single human+agent identity record. User **identity** is core by this track's charter and is not under test.

If the verdict is relocate, the resulting schema change is costed explicitly — migration, backfill, every reader. "No data migration" means a relocation must not *quietly* become one, not that this item is pre-decided.

### Item D · the WebSocket hub (`WsConnectionHub`)

Decide whether it's genuinely core's own or leftover plumbing. Constructed at `server-factory.ts:1110`; used by `packages/core-api/src/routes/ws.ts`, `routes/threads.ts` and `services/work-state-push-gateway.ts`. `plan.md`'s guess ("probably stays, it pushes real conversation/work changes") is a hypothesis to test, not a default to confirm — and the verdict is taken **after** orchestration hosts its own streaming, because `session-activity-gateway.ts` broadcasts through this same hub today (`server-factory.ts:1181`) and that forwarding moves out with Job 2.

If it turns out to be pure plumbing with no domain of its own, it dissolves into a caller or `@hyperidle/shared` rather than staying a Service — the same outcome AU21 gave `model-gateway` (Decision L2).

---

## 4. Job 2 — orchestration's own API

Each layer owns and exports its own Hono app. Neither imports the other's routes.

- `core-api` keeps `createCoreApiApp()` — its own routes only, no knowledge of `agent-orchestration`.
- `agent-orchestration` gets `createAgentOrchestrationApp()` — new, hosting session/harness streaming directly, so `core-ui` dials it without a `core-api` hop. This surface is called **orchestration-api**.
- The Application tier (`remote-server`, `desktop`) mounts **both apps onto one Hono instance behind one listener**. Orchestration is always colocated with `core-api` in one process (`docs/architecture/runtime-simplification.md`). **Never a second server, never a second port.**
- Hosting a route is not permission to read across the boundary: orchestration's handlers inherit AU21's zero-read rule in full.

Done is observable: `packages/core-api/src/app.ts:42` no longer imports `./routes/agent-orchestration-sessions-routes.js` (mounted today at `:558`), and the live session-activity view renders identically.

**Orchestration is not starting from a blank slate.** `run-orchestration` already declares `hono` (`package.json:18`) and already writes a route handler — `registerWorkerWsRoute` calls `app.get(` at `worker-ingress.ts:259` to mount `/ws/worker` on a Hono app that `core-api` hands it. That inverted injection *is* the smell, and it's the conversion precedent. `plan.md`'s "orchestration hosts zero routes / has no hono dependency" is wrong on both counts; the accurate statement is that it writes handlers but doesn't own an app.

**`workspace-api` is dropped as a name.** `workspace` already means an agent run's working directory (`workspaceAdapter` at `server-factory.ts:762`, `HYPERIDLE_WORKSPACES_DIR`) — the opposite side of this exact boundary. Only orchestration gets a new name; the core side stays `createCoreApiApp()`. `plan.md`'s AC #4 phrase "workspace-api's own transport" reads as "the core-api app's own transport."

**What the split actually touches**, verified at HEAD (`plan.md:32` under-counts it):

| | Count | Detail |
|---|---|---|
| Non-test callers of `createServer(` | 5 | `remote-server/src/index.ts`, `desktop/src/boot-server.ts`, `web/scripts/{ah1,ah5,ah6}-test-server.ts` (`playwright.ah1.config.ts:23` is a comment) |
| Integration tests constructing `createApp()` | 11 | under `packages/core-api` — matches `plan.md` |
| Test files calling `createServer(` | 8 | absent from `plan.md` entirely |
| Shipped test helpers calling `createApp` | 2 | `core-api/src/test-utils.ts:13`, `test-fixtures.ts:49` — absent from `plan.md`, and they fan out to most core-api tests |
| `packages/eval` | 0 | **`plan.md:32` is wrong** — eval calls neither; it deep-imports `@hyperidle/core-api/session` (`provision-harness.ts:14`) and `/routines`. Unaffected **provided** those subpath exports survive; architecture says so explicitly |

Architecture decides whether `remote-server` and `desktop` share a small composition helper or each keeps its own slimmer bootstrap. Both satisfy the Applications rule; it's DRY vs. zero shared surface, not correctness. Composition never moves to a third "neutral" package.

---

## 5. Guide draft (developer-facing)

> For the human requirement review. `/write-docs` reconciles it into `docs/architecture/` against what ships. No user-facing UI change, so no user-guide page.

### Which side does a new agent capability belong on?

Ask: **does the core app ever use this itself, or does it only let a human configure it and then hand it to an agent?**

1. Name the thing precisely. A record and the engine acting on it are different. A table and a few of its columns are different. A route's hosting and its query logic are different. Decide each on its own.
2. `rg -a` every real call site — including the ones a thin wrapper hides. Not the docs, not a comment: the code.
3. Look at each site. Does core *do* something with the result — a write, an enqueue, an event, a gated operation? Or does the value just get rendered for a human, or handed to an agent's run, or wired up at boot?
4. One genuine use and it stays in `core-api`. Otherwise it belongs in `agent-orchestration` — or, if it's a stateless helper with no table, no lifecycle and no domain of its own, it dissolves into `@hyperidle/shared` instead of becoming a Service.

The trap: "a core route returns it" is not a use. Every core route returns in core; count that and nothing ever moves. "It's already here", "the UI calls core-api" and "it's infra" aren't uses either. Nothing ever moves to `agent-execution` — that layer has no database credentials.

### Where does a new route go?

Each layer owns its own Hono app; neither imports the other's routes.

- Work, conversation, knowledge, user identity, settings → `core-api`'s own app, `createCoreApiApp()`.
- An agent concern — session streaming, harness activity, run lifecycle, connections → `agent-orchestration`'s own app, `createAgentOrchestrationApp()` (**orchestration-api**).

Both are mounted by the Application (`remote-server`, `desktop`) onto **one** Hono instance behind **one** listener. There is never a second server or port. Mutating agent routes go on orchestration-api; `AgentOrchestrationPort` is read-only and stays that way. If you find yourself importing the other layer's route module to mount it, the route is in the wrong app.

---

## 6. Scope

**In:** the four items in §3 and the API split in §4. Nothing else.

**Out:**

1. **A blanket audit of every core-api Service.** `conversation`, `git-export`, `knowledge`, `notifications`, `org`, `policy`, `review`, `routine`, `settings`, `work`, `observability` are not individually challenged. If a genuine further candidate surfaces while doing this work, name it with its evidence — but the sweep is what's excluded, never the execution of a verdict already reached.
2. **The core domains.** `Work`, `Conversation`, `Knowledge`, `Users` (identity) and `Settings` are core by this track's charter. This WP challenges agent capabilities *embedded inside* those packages, never the packages.
3. **The LLM-key catalog.** `server_credentials` / `@hyperidle/credentials` stays core-owned. Not moved, not renamed, not re-litigated.
4. **`model-gateway`.** Closed by AU21 Decision L2. Not reopened.
5. **AU27's scope** — the assistant turn's output/execution de-specialization (Decision K2). Different axis.
6. **Any UI redesign** of the Settings connections / filesystems / agents pages or the session-activity view. Route and base-URL wiring may change; what the user sees and when does not.
7. **`core-ui`'s internal structure.** Open in the AU19 frame, not here.
8. **A third "neutral" composition package.** Composition goes to the Application tier or nowhere.

---

## 7. Acceptance criteria — how this requirement covers them

| # | AC (abridged) | Covered by | Proof |
|---|---|---|---|
| 1 | `service_connections` has one Service importer in agent-orchestration; guard-enforced; K1's bake deleted; live add-after-emit test | §3 Item A | Guard fails the build on a core-api Service importing `serviceConnections`; integration test adds a connection after emit / before drain and asserts it provisions at spawn; `resolve-injected-connections-for-agent.ts` gone; `plugin-configuration.ts:727` resolved |
| 2 | The rule is applied with real evidence to the mounting engine and the `users` columns; each gets a documented verdict | §2, §3 Items B + C | A written verdict per unit with `file:line` per site and, for any "core uses it," the named effect |
| 3 | The mounting engine relocates if core never exercises it; record + reachability UI resolved separately | §3 Item B | Traced classification of `server-factory.ts:1006`, `filesystem-provisioning.ts:78`, `provisioner.ts:527`; if relocated, same guard/ACL proof as AC #1 |
| 4 | Orchestration hosts its own route(s) for session/harness streaming; documented verdict on `WsConnectionHub` | §4, §3 Item D | `app.ts:42`'s import of `agent-orchestration-sessions-routes.js` is gone — a static property, so a lint/import guard, not a test; plus an integration test hitting the orchestration route through the mounted app |
| 5 | Every "relocate" verdict is actually moved here | §1, §3 | Per item: the move landed, its hack deleted, its guard added — increment by increment |
| 6 | Settings pages + live session activity behave identically; no frontend behavior change | §4, §6 out #6 | (a) route-level integration tests for those surfaces stay green, **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) a Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, read as painted output; (c) the only permitted `packages/web` diff is base-URL / route wiring — a `git diff` confined to the fetch/config layer, zero change to render logic or user-visible copy |

**Human gate.** The mounting-engine, `users`-columns and `WsConnectionHub` verdicts are consequential domain calls. Each "relocate" verdict is confirmed by the founder before that relocation is built — not accepted from an agent's audit, and not bundled into approval of this document. Architecture sequences a confirmation point between each verdict and its build increment.

---

## 8. For architecture to settle

Required outputs of `/architecture`, not optional considerations.

1. **Fix the composition-root blind spot (highest priority).** As §2 notes, a unit wired only at boot has no informative call sites — run the rule mechanically on `work-state-push-gateway.ts` (`:34`, `server-factory.ts:112` / `:1122` / `:1260`) and you get "relocate," a verdict against Work. State that when every site is just wiring, the sites carry no signal and the call rests on the unit's own domain — and give the evidence bar for *that* call: what it subscribes to, whose state the payload is, who consumes the broadcast. Then re-run it on `work-state-push-gateway.ts` and prove it returns "stays" for the right reason, not because the charter says so. Until this lands, no wiring-only verdict is safe to build on. The 11 units are in `packages/core-api/src/services/`.
2. **`session-activity-gateway.ts`.** Its only non-test site is the composition root (`server-factory.ts:109` / `:1181` / `:1257-1259`); it subscribes to `session_started`, `session_ended`, `tool_call_recorded`, holds subscription lifecycle, and pushes to `wsHub`, whose subscribers are core-ui clients. Under item 1's amended rule it should move as part of Job 2's streaming work. Architecture states where it lands — it may not be silently absorbed or deferred.
3. **Write down the core-api app's two rules**, symmetric to orchestration's: (1) it never imports an `agent-orchestration` route module — this is AC #4's observable proof; (2) it hosts no route whose data/query logic an `agent-orchestration` Service owns — this is the third leg of the J6 supersession. Both are already load-bearing; neither is written down.
4. **`harness-capability-read-model.ts` is a genuinely hard case.** Six stateless forwarders over an injected `AdapterPool` handle, no table, no lifecycle (`:55-124`). Its readers end up on **both** sides after this WP: `routes/connections.ts:204` follows connections to orchestration, while `agent-profile.ts:299,311`, `teams-routes.ts:273,771`, `agents.ts:135,165` and `users.ts:196` stay core. Decide where it lives. If the answer is `@hyperidle/shared`, note that `packages/shared/package.json` declares **zero** `@hyperidle/*` dependencies and `@hyperidle/harness-registry` already depends on it — so the handle type must be declared structurally, not as today's `Pick<AdapterPool, …>`, or the move creates a package cycle. Also rule on whether its synthesized `maxConcurrent: 1` (`:90-104`) and defaulted `returnEnforcement ?? "none"` (`:85`) count as core doing something with the value.
5. **Confirm `packages/eval`'s subpath imports survive the split** (`@hyperidle/core-api/session`, `@hyperidle/core-api/routines`) rather than assuming it.

---

## 9. Required reading (downstream: `/architecture`, `/pipeline`)

- `.pipeline/work/AU26/plan.md` — spec of record.
- `.pipeline/AU.md` — the AU26 row, dependency graph, the charter-fixed core domains.
- `.pipeline/work/AU21/architecture.md` — **Decision J**: J0–J5 and J7 are locked, build them; **J6 is superseded** (§3 Item A); **J8 stands, bounded**, with its "via the J6 door" clause superseded (§3 Item B). Also **K/K1** (the bake this WP deletes) and **L** (L2 model-gateway dissolved; L4 realtime → `WsConnectionHub`).
- `docs/architecture/runtime-simplification.md` — Applications / Layers / Services; the colocation rule; the Table ACL and layer-boundary mechanisms.
- `docs/architecture/connection-model.md` — held vs. inherited connections.
- `docs/architecture/credential-model.md` — why `server_credentials` stays core.
- `docs/architecture/as-implemented-domain-architecture.md` — the shipped domain map to diff against.
- `docs/architecture/run-unit-model.md` — what "workspace" already means (§4).
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` — the target graph AU reviews compare against.

---

## 10. Corrections to `plan.md`'s prose

`plan.md` is unchanged — none of these move its scope, ACs or intent.

1. **Orchestration already writes route handlers.** It declares `hono` (`run-orchestration/package.json:18`) and mounts `/ws/worker` (`worker-ingress.ts:259`) on an app core-api hands it. `plan.md`'s "zero routes, no hono dependency" is wrong; the smell is inverted injection, and it's the conversion precedent (§4).
2. **A sixth `users` column.** `modelTierPreference` (`schema.ts:78`) is missing from `plan.md`'s list of five. In scope (§3 Item C).
3. **The split's reach is bigger than `plan.md:32` says** — 8 further `createServer(` test files and 2 shipped test helpers missing; `packages/eval` claim is wrong (§4 table).
4. **A second connections consumer** — `plugin-configuration.ts:727` (§3 Item A).
5. **Line drift.** `new RegistryFilesystemMounter` is at `server-factory.ts:1006`, not `:1027`. `WsConnectionHub` at `:1110` is correct.
6. **`plan.md` contradicts itself on the filesystem record** (`:30` "stays regardless" vs `:46` "not foregone"). `:46` governs — `:30`'s reason is one of §2's disqualified arguments.
7. **Ordering inverted.** `plan.md:32` suggests connections first. The orchestration app skeleton lands first so connections' routes have a legal host; Decision J's J1–J3 are unaffected and may still lead (§3 Item A).
8. **`workspace-api` dropped as a name** (§4).

No contradiction found between `plan.md` and `docs/` ground truth. The one contradiction is `plan.md` against itself (item 6).
