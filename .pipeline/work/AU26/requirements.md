# AU26 — Requirements

DOC-CLASS: significant

Spec of record: `.pipeline/work/AU26/plan.md` — **amended by this refine** (see §10). Tier: **production**. Every `file:line` below re-traced with `rg -a` at `75d85687` + this branch.

---

## 1. What this work package is

AU26 is a **cleanup work package**. It has two jobs.

**Job 1 — go through `core-api` service by service and move what doesn't belong there.** Two passes: first ask of each whole service *does this belong in core at all*, then, for the services that stay, ask the same of the agent-shaped parts inside them.

**Job 2 — give `agent-orchestration` its own API**, so `core-api` stops serving agent web addresses on orchestration's behalf. The first case is session/harness streaming: the UI should dial orchestration directly.

The deliverable is **moved code**, not a document. Verdicts are the cheap part; a verdict that says "relocate" gets executed here, in this WP. A verdict parked as a follow-up is a failed AU26.

**Why whole services first.** The earlier framing picked four parts out of `core-api` and challenged those. That works only if you already know where to look — and it can't tell two identically-wired units apart (§2). Starting at the service asks the question that actually decides the answer: *whose domain is this?* Everything below it inherits that. The four known items don't disappear; they become findings that fall out of the pass instead of being its whole content.

**Why now.** AU21 shipped a real boundary (orchestration reads zero core state), but it had to bake the connection list onto every emitted request (Decision K1) purely because connections lived on the wrong side. That's a stale-copy hack paid for by a misplacement. And because orchestration has never owned an app, every agent-domain route has landed in `core-api` by default rather than by decision — so this keeps happening.

**Audience.** The maintainer or agent who adds the *next* agent capability. After this, they have a rule for which side it goes on and an obvious place to put a new route.

---

## 2. The rule, at two altitudes

The question is the same at both; only the unit changes.

> **Does the core app ever actually use this itself, for its own purposes — or does it only let a human configure it and then hand it to an agent?**

If core never genuinely uses it, it doesn't belong in `core-api`. One real use and it stays.

**Whole service (pass A).** Read as: *whose domain is this service?* A service stays if core works in that domain itself — it owns a core table core writes for its own reasons, it gates a core operation, it backs a core-ui surface a human uses to run the company rather than to configure an agent.

**Parts (pass B, only inside services that stay).** Same question, smaller unit: a table's columns, an engine, a route's query logic, a record versus the thing that acts on it. Each gets its own answer; none inherits a sibling's.

How to answer honestly, at either altitude:

- **Find every place it's really called.** `rg -a` at HEAD (plain `grep` silently skips files with control characters). Include the sites a thin local wrapper hides.
- **Look at each one.** A real use means core *does* something with the result — writes a core table, gates an operation, emits an event, enqueues work. Rendering it into a `core-api` response is not a use: every core route renders in core, so counting that would make everything stay by construction.
- **Never assert it from prose.** A doc, a prior WP's write-up, or a `@lore` comment is a lead. The call site is the evidence.

Arguments that do **not** count as "core uses it": it's already there · the UI already calls core-api · it's infrastructure · the security code lives there · `core-api` is the layer with the HTTP surface. Those are engineering conveniences, and the whole point of AU26 is that they're what put this code in the wrong place.

**Starting at the service dissolves the composition-root blind spot.** A unit that's only ever wired up at boot has no informative call sites — every site is wiring. `session-activity-gateway.ts` and `work-state-push-gateway.ts` are indistinguishable that way: same `register…(eventBus, wsHub)` shape, one real site each (`server-factory.ts:1181` / `:1122`), yet one should move and one shouldn't. Judged service-first, they separate immediately: one forwards **session lifecycle** events, the other pushes **work record** changes, and each follows its domain's verdict. So the rule for a wiring-only unit is: **don't read its call sites — name the domain it wires and take that domain's answer.** The 19 units in `packages/core-api/src/services/` (11 of them `export function register…`) are all resolved this way; they are wiring, not services, and none gets an independent verdict.

**Destination rules.** Relocations go to `agent-orchestration`, never `agent-execution` (that layer has no DB credentials and may run on another machine). Table *definitions* stay in `packages/db/src/schema.ts` — only the owning package changes. `AgentOrchestrationPort` stays strictly read-only (`packages/api-contract/src/agent-orchestration-port.ts:22`); a relocated thing that needs a mutation door gets an orchestration route, never a Port method. A stateless helper with no table, no lifecycle and no domain of its own dissolves into `@hyperidle/shared` instead of becoming a Service — the outcome AU21 gave `model-gateway` (Decision L2). And a move deletes the hack it replaces rather than living next to it.

---

## 3. Job 1, pass A — a verdict for every service

**The real list, from the filesystem at HEAD** (not from prose): `packages/core-api/*/` holds **15 Service packages**, each with its own `package.json` —

`connections` · `conversation` · `filesystems` · `git-export` · `knowledge` · `notifications` · `observability` · `org` · `policy` · `realtime` · `review` · `routine` · `settings` · `users` · `work`

(`src/` and `node_modules/` are the only other entries. `src/services/` holds 19 wiring units, resolved per §2, not counted as services.)

Every one of the 15 gets a whole-service verdict. `connections` is already settled (moves — §4 Item A); the other 14 are open.

### How the pass stays bounded

A verdict is a **line**, not a report: the domain the service owns, one named real core-side use (the write, the gate, the event, the enqueue — with `file:line`), verdict. For most of the 14 that line writes itself and the cost is minutes. Depth is spent only where one of three things happens:

1. the one-liner can't be written — no core-side use is findable;
2. the verdict is **moves**;
3. the verdict is **stays, but it contains something that moves** — which opens pass B for that service only.

Everything else is closed at the line. A verdict is not a design; only cases 1–3 earn a trace.

**Verdicts are for all 15; moves are only for what fails.** Keep the two words apart — "we produced 15 verdicts" is the pass; "we performed N moves" is the work. A relocate verdict is executed in this WP, never parked.

**A lead, not a finding.** Four core-api services import the `sessions` table object in non-test code — `policy`, `review`, `work`, and `realtime` (`realtime`'s only table import). `sessions` is the agent-run record. That's where pass B is most likely to bite; it is a place to look, not a verdict.

### The charter is a strong prior, not an exemption

`.pipeline/AU.md:3` fixes `Work`, `Conversation`, `Knowledge`, `Users` (identity) and `Settings` as core app domains. Those services are challenged **like everything else** — the expected outcome is a fast, evidenced "stays," but it has to be *reached*, not assumed. The prior is strong: it should take one line and one call site each.

This does **not** reopen the charter as a strategic question. If a charter-fixed service's whole-service verdict came back "moves," that is a track-level finding to raise with its evidence — not something AU26 executes. Part-level findings inside those services (like `users`' agent-config columns) are squarely this WP's business and do get executed.

### The reverse direction — one bounded check, not a second sweep

Is anything core-domain sitting inside `agent-orchestration`? It has **4 Service packages** (`dispatch`, `run-orchestration`, `session-requests`, `tool-handlers`). One grep over their non-test source for `@hyperidle/db` table objects answers it: at HEAD they import only `sessions` (plus `resolveAgentScaffoldSpecs`, a helper) — no core-domain table. Architecture re-runs that one grep, records one line, and stops. If it comes back clean, the reverse direction is closed. It never becomes a per-service pass of its own.

---

## 4. Job 1, pass B — the parts, including the four already in hand

Pass B runs only inside services pass A keeps. Four findings are already traced and named; the pass may add more, each with its evidence.

### Item A · connections — verdict settled, build the move

AU21's Decision J already traced this and concluded a full move. **Do not re-derive it.** Its four increments (extract the AES-GCM primitive to `@hyperidle/shared`; rename the core package to `@hyperidle/credentials`, stripped to the LLM-key catalog; stand up a SQL-owning `agent-orchestration/connections` Service; re-host the management surface) are locked. This is a whole-service move — pass A records it as settled and moves on.

Done means: `serviceConnections` has exactly one Service importer, a guard fails the build if a `core-api` Service touches the table, and K1's bake is gone — `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` deleted along with its wiring, with a test proving a connection added after an intent is emitted but before it drains still gets provisioned at spawn.

Two things to resolve on the way:

- **A second consumer exists.** `packages/core-api/settings/src/plugin-configuration.ts:727` calls `deps.serviceConnections.listByAuthSource(db, "mcp")` (injected, declared at `:65`). It has to be resolved before "exactly one importer" is true.
- **Decision J6 is superseded.** J6 kept connections' web addresses in `core-api` because "core-api is the layer with the HTTP surface." That is exactly the reasoning this WP kills, and Job 2 removes the fact it rested on. So connections' routes — reads *and* mutations — go to orchestration's own API, and J6's planned `AgentOrchestrationPort.connections` read family is not built. J7's deletion of `CoreApiPort.connections` stands unchanged.
- **Consequence for ordering:** the orchestration app skeleton (§5) is built **first**, then connections' routes land on it. Hosting them in `core-api` "for now" would manufacture exactly the throwaway patch this WP exists to delete. Only Decision J's last increment (re-hosting) depends on the skeleton — J1–J3 touch no HTTP surface and can still lead.

### Item B · the folder-mounting engine (`RegistryFilesystemMounter`)

`filesystems` gets a pass-A verdict first — it owns `filesystemCaptures` and backs a real Settings surface, so the expected answer is "stays, and contains something that moves."

`core-api` holds the mounting engine but never runs it. Confirmed at HEAD: constructed once at `packages/core-api/src/server-factory.ts:1006`, and the only non-test `.mount()` / `.captureBack()` calls are in `agent-orchestration`'s `run-orchestration/src/filesystem-provisioning.ts:78` and `provisioner.ts:527`. (`core-api`'s only other `.mount()` calls are in `filesystems`' own adapter tests.) Architecture re-runs the trace itself and writes the verdict; if it's relocate, the engine moves with Item A's rigor.

The filesystem **record** (team-registered repo/doc-set locations) and the reachability-probe UI get their **own** verdict, not an automatic follow. `plan.md` says both things here — `:30` says they stay core "regardless," `:46` says that's not foregone. `:46` governs: `:30`'s reason ("human-administered configuration data") is one of the disqualified arguments in §2.

AU21's Decision J8 stands where it applies — it decided *where the reachability probe's resolver call executes* (in-layer in `run-orchestration`), a direct consequence of moving the resolver, and `packages/core-api/src/routes/filesystems.ts:6` still type-imports `ServiceConnectionResolver` from `@hyperidle/connections` at HEAD. Its fallback clause about reading "via the J6 door" dies with J6.

### Item C · the agent-config columns on `users`

`users` is charter-fixed and will pass A as "stays" — human identity, `users`/`loginSessions`/`inviteCodes`/`hintProgress`, core writes them constantly. Pass B is where it bites.

Harness, model and concurrency settings sit on the same row as human identity. At HEAD (`packages/db/src/schema.ts`): `kind:50`, `maxConcurrentSessions:62`, `harnessType:76`, `modelTierPreference:78`, `modelId:84`, `modelProvider:92`. **`modelTierPreference` is a sixth column of the same shape and is missing from `plan.md`'s list of five** — it's in scope. `systemPrompt:74`, `systemPromptPath:53`, `skills:60` and `status:61` are adjacent; architecture makes an explicit in-or-out call on each rather than skipping them silently.

Each column is its own unit. The verdict needs a real reader/writer trace and an explicit statement of whether a clean cut is possible without breaking `users` as the single human+agent identity record. If the verdict is relocate, the resulting schema change is costed explicitly — migration, backfill, every reader. "No data migration" means a relocation must not *quietly* become one, not that this item is pre-decided.

### Item D · the WebSocket hub (`WsConnectionHub`)

`realtime` is a 3-file service whose only table import is `sessions`. Its pass-A verdict is a genuine open question, not a part-level one: is this a service with a domain, or leftover plumbing?

Constructed at `server-factory.ts:1110`; used by `packages/core-api/src/routes/ws.ts`, `routes/threads.ts` and `services/work-state-push-gateway.ts`. `plan.md`'s guess ("probably stays, it pushes real conversation/work changes") is a hypothesis to test, not a default to confirm — and the verdict is taken **after** orchestration hosts its own streaming, because `session-activity-gateway.ts` broadcasts through this same hub today (`server-factory.ts:1181`) and that forwarding moves out with Job 2.

If it turns out to be pure plumbing with no domain of its own, it dissolves into a caller or `@hyperidle/shared` rather than staying a Service.

---

## 5. Job 2 — orchestration's own API

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
| Non-test callers of `createServer(` | 5 | `remote-server/src/index.ts:36`, `desktop/src/boot-server.ts:30`, `web/scripts/{ah1,ah5,ah6}-test-server.ts` (`playwright.ah1.config.ts:23` is a comment) |
| Integration tests constructing `createApp()` | 11 | under `packages/core-api` — matches `plan.md` |
| Test files calling `createServer(` | 8 | absent from `plan.md` entirely |
| Shipped test helpers calling `createApp` | 2 | `core-api/src/test-utils.ts:13`, `test-fixtures.ts:49` — absent from `plan.md`, and they fan out to most core-api tests |
| `packages/eval` | 0 | **`plan.md:32` is wrong** — eval calls neither; it deep-imports `@hyperidle/core-api/session` (`provision-harness.ts:14`) and `/routines`. Unaffected **provided** those subpath exports survive; architecture says so explicitly |

Architecture decides whether `remote-server` and `desktop` share a small composition helper or each keeps its own slimmer bootstrap. Both satisfy the Applications rule; it's DRY vs. zero shared surface, not correctness. Composition never moves to a third "neutral" package.

---

## 6. Guide draft (developer-facing)

> For the human requirement review. `/write-docs` reconciles it into `docs/architecture/` against what ships. No user-facing UI change, so no user-guide page.

### Does this service belong in core?

Ask of the whole service first: **whose domain is this?** Core works in a domain when it writes that domain's tables for its own reasons, gates its own operations on them, or backs a surface a human uses to run the company. Core does *not* work in a domain when the service only lets a human configure something an agent then uses.

Then, for a service that stays, ask the same of the agent-shaped parts inside it — a few columns on a table, an engine the service holds but never runs, a route's query logic. Name each part precisely: a record and the engine that acts on it are different things, and neither inherits the other's answer.

### How to answer it

1. `rg -a` every real call site — including the ones a thin wrapper hides. Not the docs, not a comment: the code.
2. Look at each site. Does core *do* something with the result — a write, an enqueue, an event, a gated operation? Or does the value just get rendered for a human, or handed to an agent's run, or wired up at boot?
3. One genuine use and it stays in `core-api`. Otherwise it belongs in `agent-orchestration` — or, if it's a stateless helper with no table, no lifecycle and no domain of its own, it dissolves into `@hyperidle/shared` instead of becoming a Service.
4. **If every call site is just wiring, the sites tell you nothing.** Don't read them. Name the domain the unit wires — what it subscribes to, whose state its payload is, who consumes the result — and take that domain's answer.

The trap: "a core route returns it" is not a use. Every core route returns in core; count that and nothing ever moves. "It's already here", "the UI calls core-api" and "it's infra" aren't uses either. Nothing ever moves to `agent-execution` — that layer has no database credentials.

### Where does a new route go?

Each layer owns its own Hono app; neither imports the other's routes.

- Work, conversation, knowledge, user identity, settings → `core-api`'s own app, `createCoreApiApp()`.
- An agent concern — session streaming, harness activity, run lifecycle, connections → `agent-orchestration`'s own app, `createAgentOrchestrationApp()` (**orchestration-api**).

Both are mounted by the Application (`remote-server`, `desktop`) onto **one** Hono instance behind **one** listener. There is never a second server or port. Mutating agent routes go on orchestration-api; `AgentOrchestrationPort` is read-only and stays that way. If you find yourself importing the other layer's route module to mount it, the route is in the wrong app.

---

## 7. Scope

**In:** a whole-service verdict for each of the 15 `core-api` Service packages (§3); the part-level pass inside the ones that stay, covering at minimum the four items in §4; the one-grep reverse check; and the API split in §5. Every "relocate" verdict, from either pass, executed here.

**Out:**

1. **Turning a verdict into an audit.** The pass produces one evidenced line per service. Depth is spent only on the three cases in §3. A service that obviously stays is closed at the line — no inventory, no method-surface review (that's AU20's axis), no doc.
2. **Reopening the charter.** `Work`, `Conversation`, `Knowledge`, `Users` (identity) and `Settings` are challenged like everything else, but as a strong prior. A "moves" verdict on one of those services is escalated as a track-level finding, not executed here.
3. **A second sweep in the reverse direction.** One grep over `agent-orchestration`'s 4 Service packages, one recorded line. Nothing more.
4. **The LLM-key catalog.** `server_credentials` / `@hyperidle/credentials` stays core-owned. Not moved, not renamed, not re-litigated.
5. **`model-gateway`.** Closed by AU21 Decision L2. Not reopened.
6. **AU27's scope** — the assistant turn's output/execution de-specialization (Decision K2). Different axis.
7. **Any UI redesign** of the Settings connections / filesystems / agents pages or the session-activity view. Route and base-URL wiring may change; what the user sees and when does not.
8. **`core-ui`'s internal structure.** Open in the AU19 frame, not here.
9. **A third "neutral" composition package.** Composition goes to the Application tier or nowhere.

---

## 8. Acceptance criteria — how this requirement covers them

Against `plan.md`'s ACs as amended by §10.

| # | AC (abridged) | Covered by | Proof |
|---|---|---|---|
| 1 | `service_connections` has one Service importer in agent-orchestration; guard-enforced; K1's bake deleted; live add-after-emit test | §4 Item A | Guard fails the build on a core-api Service importing `serviceConnections`; integration test adds a connection after emit / before drain and asserts it provisions at spawn; `resolve-injected-connections-for-agent.ts` gone; `plugin-configuration.ts:727` resolved |
| 2 | **(new)** Every one of the 15 `core-api` Service packages gets a whole-service verdict with evidence; no charter exemption; reverse direction confirmed once | §3 | A 15-row verdict table — service, domain, one real core-side use with `file:line` (or "none found"), verdict — no row blank, none justified by the charter alone; plus one recorded line for the `agent-orchestration` grep |
| 3 | The rule is applied at part granularity inside services that stay; the mounting engine, the `users` columns and `WsConnectionHub` each get a documented verdict | §2, §4 Items B–D | A written verdict per unit with `file:line` per site and, for any "core uses it," the named effect |
| 4 | The mounting engine relocates if core never exercises it; record + reachability UI resolved separately | §4 Item B | Traced classification of `server-factory.ts:1006`, `filesystem-provisioning.ts:78`, `provisioner.ts:527`; if relocated, same guard/ACL proof as AC #1 |
| 5 | Orchestration hosts its own route(s) for session/harness streaming; documented verdict on `WsConnectionHub` | §5, §4 Item D | `app.ts:42`'s import of `agent-orchestration-sessions-routes.js` is gone — a static property, so a lint/import guard, not a test; plus an integration test hitting the orchestration route through the mounted app |
| 6 | Every "relocate" verdict, from either pass, is actually moved here | §1, §3, §4 | Per item: the move landed, its hack deleted, its guard added — increment by increment. Zero relocate verdicts deferred |
| 7 | Settings pages + live session activity behave identically; no frontend behavior change | §5, §7 out #7 | (a) route-level integration tests for those surfaces stay green, **re-wired, never weakened or deleted** — anchor `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) a Playwright pass over Settings → Connections / Filesystems / Agents and the live session-activity view, read as painted output; (c) the only permitted `packages/web` diff is base-URL / route wiring — a `git diff` confined to the fetch/config layer, zero change to render logic or user-visible copy |

**Human gate.** A whole-service "moves" verdict, and each part-level "relocate" verdict, are consequential domain calls. Each is confirmed by the founder before that relocation is built — not accepted from an agent's audit, and not bundled into approval of this document. "Stays" verdicts do not need a gate; they need evidence. Architecture sequences a confirmation point between each relocate verdict and its build increment.

---

## 9. For architecture to settle

Required outputs of `/architecture`, not optional considerations.

1. **Run pass A and publish the 15-row verdict table** before any part-level work. State the evidence bar for a one-line "stays" (the named core-side effect) and for a "moves" (no core-side effect found across all traced sites). Record which of the three depth triggers fired for each service that got more than a line.
2. **Apply §2's wiring rule to the 19 units in `packages/core-api/src/services/`.** Each maps to a domain and follows that domain's verdict; none gets an independent one. Run it explicitly on `work-state-push-gateway.ts` (`:34`; `server-factory.ts:112` / `:1122` / `:1260`) and show it lands "stays" because the payload is Work's own state — not because the charter says so.
3. **`session-activity-gateway.ts`** (`server-factory.ts:109` / `:1098` / `:1181` / `:1257-1258`) subscribes to `session_started`, `session_ended`, `tool_call_recorded`, holds subscription lifecycle, and pushes to `wsHub`. Under rule 2 it follows the session-lifecycle domain and should move as part of Job 2's streaming work. Architecture states where it lands — it may not be silently absorbed or deferred.
4. **Chase the `sessions` lead.** `policy`, `review`, `work` and `realtime` import the `sessions` table object in non-test code. For each, state in one line whether that's a legitimate core read of the agent-run record or a part-level finding, and if the latter, give it a pass-B verdict.
5. **Write down the core-api app's two rules**, symmetric to orchestration's: (1) it never imports an `agent-orchestration` route module — this is AC #5's observable proof; (2) it hosts no route whose data/query logic an `agent-orchestration` Service owns — this is the third leg of the J6 supersession. Both are already load-bearing; neither is written down.
6. **`harness-capability-read-model.ts` is a genuinely hard case.** Six stateless forwarders over an injected `AdapterPool` handle, no table, no lifecycle (`:55-124`). Its readers end up on **both** sides after this WP: `routes/connections.ts:204` follows connections to orchestration, while `agent-profile.ts:299,311`, `teams-routes.ts:273,771`, `agents.ts:135,165` and `users.ts:196` stay core. Decide where it lives. If the answer is `@hyperidle/shared`, note that `packages/shared/package.json` declares **zero** `@hyperidle/*` dependencies and `@hyperidle/harness-registry` already depends on it — so the handle type must be declared structurally, not as today's `Pick<AdapterPool, …>`, or the move creates a package cycle. Also rule on whether its synthesized `maxConcurrent: 1` (`:90-104`) and defaulted `returnEnforcement ?? "none"` (`:85`) count as core doing something with the value.
7. **Confirm `packages/eval`'s subpath imports survive the split** (`@hyperidle/core-api/session`, `@hyperidle/core-api/routines`) rather than assuming it.

---

## 10. What this refine changed in `plan.md`

`plan.md` **is amended** by this refine — the founder changed the unit of challenge, which is a genuine change to the plan of record.

1. **Amendment note added** to `## Work package`: the sweep starts at the whole service (all 15 in `packages/core-api/*/`), then descends to parts inside the ones that stay. The four named items become findings of that pass, not its content.
2. **Out-of-scope #1 reversed.** It excluded "a blanket audit of every core-api Service package" and named 11 services as not individually challenged. Those services are now **in scope** — each gets a whole-service verdict. What's excluded instead is letting a verdict become an audit: one evidenced line per service, depth only on the three triggers in §3.
3. **The charter constraint amended** (`plan.md:36`). It said this WP "does not re-open whether these belong in core… not the packages themselves." Now: charter-fixed services are challenged like everything else, as a strong prior that must survive the evidence; a "moves" verdict on one is escalated as a track-level finding rather than executed here.
4. **ACs extended.** A new AC covers pass A (a verdict for all 15 + the bounded reverse check); the old "test applied to filesystems + users" AC is rewritten as the pass-B AC with the four items as its minimum; the "every relocate is moved here" AC now says "from either pass." Six ACs became seven. Every other AC, validation scenario and constraint is unchanged.

Other corrections to `plan.md`'s prose, none of which move its scope:

5. **Orchestration already writes route handlers.** It declares `hono` (`run-orchestration/package.json:18`) and mounts `/ws/worker` (`worker-ingress.ts:259`) on an app core-api hands it. `plan.md`'s "zero routes, no hono dependency" is wrong; the smell is inverted injection, and it's the conversion precedent (§5).
6. **A sixth `users` column.** `modelTierPreference` (`schema.ts:78`) is missing from `plan.md`'s list of five. In scope (§4 Item C).
7. **The split's reach is bigger than `plan.md:32` says** — 8 further `createServer(` test files and 2 shipped test helpers missing; the `packages/eval` claim is wrong (§5 table).
8. **A second connections consumer** — `plugin-configuration.ts:727`, injected at `:65` (§4 Item A).
9. **Line drift.** `new RegistryFilesystemMounter` is at `server-factory.ts:1006`, not `:1027`. `WsConnectionHub` at `:1110` is correct.
10. **`plan.md` contradicts itself on the filesystem record** (`:30` "stays regardless" vs `:46` "not foregone"). `:46` governs — `:30`'s reason is one of §2's disqualified arguments.
11. **Ordering inverted.** `plan.md:32` suggests connections first. The orchestration app skeleton lands first so connections' routes have a legal host; Decision J's J1–J3 are unaffected and may still lead (§4 Item A).
12. **`workspace-api` dropped as a name** (§5).

No contradiction found between `plan.md` and `docs/` ground truth. The one contradiction was `plan.md` against itself (item 10).

---

## 11. Required reading (downstream: `/architecture`, `/pipeline`)

- `.pipeline/work/AU26/plan.md` — spec of record, as amended (§10).
- `.pipeline/AU.md` — the AU26 row, dependency graph, the charter-fixed core domains (`:3`).
- `.pipeline/work/AU21/architecture.md` — **Decision J**: J0–J5 and J7 are locked, build them; **J6 is superseded** (§4 Item A); **J8 stands, bounded**, with its "via the J6 door" clause superseded (§4 Item B). Also **K/K1** (the bake this WP deletes) and **L** (L2 model-gateway dissolved; L4 realtime → `WsConnectionHub`).
- `docs/architecture/runtime-simplification.md` — Applications / Layers / Services; the colocation rule; the Table ACL and layer-boundary mechanisms.
- `docs/architecture/connection-model.md` — held vs. inherited connections.
- `docs/architecture/credential-model.md` — why `server_credentials` stays core.
- `docs/architecture/as-implemented-domain-architecture.md` — the shipped domain map to diff against.
- `docs/architecture/run-unit-model.md` — what "workspace" already means (§5).
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` — the target graph AU reviews compare against.
