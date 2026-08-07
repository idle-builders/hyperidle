# AU31 — Requirements

DOC-CLASS: update — the two nouns settled here (session-requests' identity, a layer's public face) land in `docs/architecture/` ground truth at `/write-docs`; the enforced rule text itself lives only in `governance/` per `governance/README.md:5-7`. No user-facing surface.

Spec of record: `.pipeline/work/AU31/plan.md`, unamended — no new outcome was discovered; §6 records factual corrections to its prose. Tier: **production**. Every `file:line` below re-traced on the live tree at base `bbe82e9a` (branch `backend/AU31-layer-composition-boundary`).

---

## 1. What this work package is, and why

Cross-layer conversation happens exclusively through the API, MCP or the bus; applications compose layers by their public faces; no layer names another layer's insides. AU21 closed `agent-orchestration → core-api` to genuinely zero (Decision L, Increment 14). The forward direction was never checked: `core-api` still reaches directly into six of the agent layers' services by import, injects functions across the same boundary, and declares the dependencies in its manifest; the applications compose by naming individual services; the MCP router is dialled from an application because `agent-execution` hosts no app.

The maintainer's payoff: every architectural claim about this boundary becomes machine-checked instead of half-guarded (AU21's guard reported zero findings for months while this direction sat open — `plan.md:7`). This WP owns the single largest violation block: **93 production sites across 15 baseline groups** (§5.1, re-derived from `governance/baseline.json` at base — matches `progress.json.baselineScope` exactly).

The rules themselves are already decided and enforced-at-warn: every one of the 15 groups exists in `governance/decided-rules.json` with verdict `forbidden` (e.g. `layer → service (other layer) [import]`, `application → service [import|manifest|di]`, `service → MCP router [mcp]`). AU31 does not invent the rules; it clears their baseline entries, which per the shrink-only mechanism promotes each rule to error in the same commit (`governance/README.md:69-89`). The one place AU31 adds governance vocabulary is the public-face distinction (§3), which is why the human gate is load-bearing.

Refine was required on two nouns. Both are settled below, with the rejected reading recorded.

---

## 2. Noun 1 — `session-requests`

### 2.1 What it is

**`session-requests` is agent-orchestration's durable request intake — the concrete artifact behind AU21's sentence "orchestration only ever acts on requests core already sent."** It is in the right layer. What is illegal at the 14 core-api import sites is the *mechanism* (direct function import and cross-layer DI), never the direction of the conversation or the location of the service.

Evidence of what the service is, from its own code and the registries:

- It owns three tables — `agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts` (`governance/table-owners.json`) — and additionally writes `agentLifecycleInbox` and `triggerResolutionHistory` (`layers/agent-orchestration/session-requests/src/service.ts:10-15`).
- Its machinery is the run-request lifecycle end to end: enqueue → drain → admission → claim/lease/renew/release → transition → lifecycle projection → reap (`service.ts` exports, `src/index.ts:1-24`), plus `sessionRunRegistry` — an **in-process** registry of live run control handles used to abort running harness sessions (`src/session-run-registry.ts`).
- Every operational stage is exercised by orchestration's own runtime: `claimSessionRequest`/`drainIntents`/`renewClaim`/`releaseClaim`/`reapExpired` are wired into `run-orchestration`'s poller ports (`layers/core-api/src/services/run-orchestration-composition.ts:234-246` — composition code, see §5.3) and executed inside the agent layer's run loop.

### 2.2 AU26's domain test, applied

AU26's test (`.pipeline/work/AU26/requirements.md:31`): *"Does the core app ever actually use this itself, for its own purposes — or does it only let a human configure it and then hand it to an agent?"* — with its evidence bar (`:40-45`: a real use writes a core table, gates an operation, emits, enqueues; **rendering a value into a core route's response is not a use**) and its wiring rule (`:47`: a unit only ever touched at boot is judged by the domain it wires, not by its call sites).

Core-api's touches, exhaustively classified (14 production import sites, `rg` at base):

| Core's act | Sites | Classification |
|---|---|---|
| Enqueue a work intent / create an explicit session request | `routes/bets.ts:11`, `tasks.ts:3`, `threads.ts:40`, `knowledge.ts:47`, `sessions-routes.ts:3`, `app.ts:11,51`, and the reactors `work-session-started-reactions.ts:49`, `agent-run-admission-reactions.ts:41`, `assistant-turn-coherence-trigger.ts:50`, `routine-scheduler-bindings.ts:40`, `policy-bindings.ts:39` | **Sending a request** — the paradigm cross-layer conversation |
| Read a request's status | `findSessionRequest` in `app.ts:11`, `sessions-routes.ts:3` | Rendering for a human — not a use under AU26 §2 |
| Supersede / terminate / re-enqueue | `policy-bindings.ts:39` (`sessionRunRegistry` abort + `endRunForHandoff`), `agent-run-admission-reactions.ts:41` (`transitionSessionRequest`) | A request about a request — still conversation |
| Composition wiring | `run-orchestration-composition.ts:32`, `durable-agent-queue.ts:83`, `service-bootstrap.ts:37` (drain start) | Wiring; the domain wired is session lifecycle — orchestration's (AU26 §2 wiring rule) |

Core never claims, drains, leases, admits, projects or reaps. Core is the channel's **client** at every site, never its operator. Under AU26's test that is exactly clause-(b)-shaped: an implementation exercised on behalf of an agent's session.

### 2.3 The rejected reading

**Reading (b) — "session-requests is core's intake queue in the wrong layer; the fix is relocation" — is rejected**, on four grounds:

1. **Ownership follows the operator of the machinery, not the writer of the first row.** Every lifecycle stage after the enqueue is orchestration's (§2.2).
2. **Relocation reopens AU21's closed direction.** If the queue were core's, orchestration's poller would continuously read and write core-owned state (claim, lease, transition) — precisely the zero-read end state Decision L closed to genuinely zero, with the exemption apparatus deleted.
3. **It doubles the component instead of removing the conversation.** The in-process bus is not durable; orchestration would still need a durable inbox of its own, leaving core's outbox *plus* orchestration's inbox where one queue exists today.
4. **`sessionRunRegistry` cannot relocate.** In-process control handles to live harness runs are meaningless outside the layer that runs sessions (`session-run-registry.ts`).

### 2.4 "Emit", clarified — a constraint on architecture, not a mechanism choice

In AU21's doctrine ("core bakes what a run needs and emits"), the emit was never a fire-and-forget bus event — **it has always been the durable write into this intake**. The intent queue *is* the durability; the standard durable-intent pattern is settled project law (bypassing it was a founder-flagged wrong trajectory). Therefore verdict (a) does **not** pre-decide "replace `enqueueWorkIntent` with an `EventBus.emit`". It states the requirement: the intake becomes reachable from core only through a legal cross-layer mechanism (API, MCP or the bus — AU28 Ruling 1), and the chosen spelling per call-site must preserve the durability the queue provides today. Which spelling per service and per site is `/architecture`'s job (`plan.md:27` demands per-service verdicts, no blanket answer).

**One hard, newly surfaced constraint on that choice:** at least one enqueue is transactional with core's own domain write — `routes/knowledge.ts:934` calls `enqueueWorkIntent(tx as HyperIdleDb, …)` **inside** the knowledge-edit transaction, atomically coupling the edit and the intent. An HTTP call or a bus event cannot participate in that transaction. Architecture must audit every write site for this pattern and either preserve the atomicity in the chosen mechanism or explicitly decide to relinquish it, naming the failure window. Silently downgrading it is not acceptable.

### 2.5 The cross-layer surface this settles

The rows' internal lifecycle (pending → drained/admitted → claimed → running → terminal → reaped) is wholly orchestration-internal. The cross-layer surface — what the legal mechanism must carry, no more — is exactly:

1. submit a work intent (baked request attached, idempotency key, optional transaction coupling per §2.4);
2. create an explicit session start;
3. request termination / supersede a request;
4. read a request's status.

Anything beyond these four appearing in a mechanism design is scope creep against this verdict.

---

## 3. Noun 2 — a layer's public face

### 3.1 Definition

**A layer's public face is the export surface of the layer package itself — the package the role registry classifies `layer` (`governance/architecture.json:6-14`, pattern `layers/*`). Everything in a nested service package (`layers/*/*`, role `service`) is the layer's insides.**

Three clauses give the concept teeth, and each is mechanically checkable:

1. **Reach — composition roots only.** Only the roles in `architecture.json` `containment.compositionRootRoles` (application, tooling, deployment, plus the repo root) may import a layer package. A layer never imports another layer's face: cross-layer conversation goes through API/MCP/bus only (AU28 Ruling 1), and the face is *not* a fourth conversation mechanism — it is the in-process composition contract. Checkable from the existing role registry; the census already classifies `application → layer` vs `application → service`.
2. **Provenance — no laundering.** Every symbol on the face is declared in the layer package's own `src/`. The face never re-exports a service's symbol and never declares a manifest export entry that resolves into a service package. Without this clause AC #3 is satisfiable vacuously — a layer barrel re-exporting every service function lets an application "name no service" while seeing everything, which is today's exact state (`layers/core-api/src/index.ts:9-12` documents re-exporting service surfaces as the AU19-era intent). Checkable by the census AST: an `export … from "@hyperidle/<service>"` in a face module, or a manifest `exports` path resolving inside a service directory, is a violation.
3. **Content — a composition contract, nothing else.** The face carries what a composition root needs to boot, mount, operate and dispose the layer: the boot/dispose call, the app/mount handles, the runtime adapters the application supplies or receives, and their types. The existence proof is already in the tree: `bootAgentOrchestration` (`layers/agent-orchestration/src/boot.ts:95-134`) takes `{db, eventBus, sessionStream?, registerWorkerWebSocket?, adapterPool?}` and returns `{app, registerPreAuthRoutes, sessionStreamHub, dispose}` — an application composes the whole layer through it without naming one service. Per plan contract, nothing on the face may exist only for tests.

### 3.2 How you tell by looking

By the import specifier, with no per-case judgement: an import of `@hyperidle/<layer>` (any export entry the layer package declares, all of which satisfy clause 2) is the face; an import naming a service package of that layer, or resolving to a module inside one, is the insides. Manifest grain is identical: an application's manifest may name layer and framework packages, never a service package. This is decidable from the role registry plus one AST predicate — no allowlist, no path list, no human adjudication per case, which is the plan's own bar for "done".

### 3.3 Rejected interpretations

- **"The face is whatever the layer barrel exports."** Vacuous (see clause 2). This was AU19's deliberate rule and it is superseded here — record it as a deliberate change, not drift.
- **"The face is the layer's HTTP API."** No. The HTTP API is the *cross-layer* conversation door with audience `everyone` (`architecture.json:106-110`); the face is the *in-process composition* contract with audience composition-roots-only. Conflating them would license a layer to import another layer's face.
- **"An enumerated list of face modules per layer."** A file-grained map is exactly what rotted `au6-agent-boundary-guard.ts`; the definition rests on package grain (role registry) plus the provenance predicate, so nothing enumerable can go stale.

### 3.4 Consequence for the governance model — founder-gated

Today `application → layer [import]` is decided **allowed** with 12 production instances (`decided-rules.json`) — and those instances are precisely `create-server.ts`'s deep imports into core-api's composition modules (`@hyperidle/core-api/service-bootstrap`, `/services/run-orchestration-composition`, `/ws-connection-hub`, …). The face definition splits this target: face = allowed, insides = forbidden. That is a vocabulary/verdict change to `decided-rules.json` and the model clauses, which only a founder ruling may make (`governance/README.md:29-33,138-141`), and every new rule needs an attack case or the build fails (`governance/README.md:110-124`). AU31's mandatory human review gate (`plan.md:25`) is where this ratification happens; architecture drafts the clause and its attack cases for that gate.

### 3.5 What the definition implies for the existing surfaces (findings, not designs)

- `layers/core-api/package.json` declares 16 export entries including `./service-bootstrap`, `./services/*`, `./routes/*`, `./ws-connection-hub` and `./test-utils`. The end state: every surviving entry satisfies clauses 2-3; `./test-utils` is development content advertised on a production face (the same breach shape Ruling step 1 named for `db`'s `./test-fixtures`) and cannot survive there.
- `layers/agent-execution/src/index.ts:16-21` re-exports `harness-registry` symbols (`AdapterPool`, `createHarnessAdapter`, `createLocalAdapterPool`, `createSandboxAdapter`) — a clause-2 violation on the face the applications use today (`applications/desktop/src/boot-server.ts:5`, `applications/remote-server/src/index.ts:23` currently bypass even that and import the service directly). agent-execution needs a genuine composition contract of its own.
- `layers/agent-orchestration/src/boot.ts:29` imports `SessionActivityBuffer` from `@hyperidle/agent-execution` — the tree's single `layer → layer (other) [import]` violation. Under clause 1 a layer may not import another layer's face; the verdict on where the buffer's construction belongs (application-supplied vs relocated) is architecture's.

---

## 4. The MCP router — already decided, restated as requirement

No unsettled noun here; the registries decided it and AU31 executes it. `architecture.json:111-115`: host = `agent-execution`, `alsoDialledBy: ["harness"]`, *"It is mounted in the wrong place today."* Ruling 12.3 lists "give `agent-execution` its own app so it hosts the MCP router" as a migration that must happen. Decided rows: `harness-registry → MCP router` and `agent-execution → MCP router` allowed; `service|layer|application → MCP router` forbidden.

Live state, verified: `agent-execution` hosts no app (no Hono construction anywhere in the layer; its whole `src/` is the barrel + `SessionActivityBuffer`). The bridge is created by the **application** (`applications/remote-server/src/create-server.ts:566-567`, `createMcpToolBridge` imported at `:86` from `@hyperidle/harness-registry/mcp`, base URL `http://localhost:${port}`), and the **provisioner** — a `run-orchestration` service — opens the router session and builds the `/api/mcp/<token>` URL inline (`layers/agent-orchestration/run-orchestration/src/provisioner.ts:1327,1349`).

End state per AC #4: the layer serving the router hosts the API being dialled (`agent-execution` gets an app the applications mount), and it is dialled only by that layer and the harness. Consistency check that holds: `agent-execution` has no DB credentials and may run on another machine (AU26 destination rule) — the router needs no DB, so hosting it there is coherent. Mount mechanics, `remote-worker`'s role, and how the URL/token legally reach the provisioner and the harness are architecture's.

---

## 5. Current behavior and the genuine delta

### 5.1 The authoritative inventory — 93 production sites, 15 groups

Re-derived from `governance/baseline.json` at base (matches `progress.json.baselineScope` exactly):

| Group | Sites |
|---|---|
| layer → service (other layer) [import] | 36 (24 core-api files) |
| application → service [import] | 15 (`create-server.ts` 13, `desktop/boot-server.ts` 1, `remote-server/index.ts` 1) |
| application → service [manifest] | 12 (`remote-server/package.json`) |
| service → service (other layer) [di] | 9 (`app.ts:494`, `bets.ts:684`, `tasks.ts:254`, `threads.ts:1678`, `org.ts`, `service-bootstrap.ts:470`, `agent-run-admission-reactions.ts:115`, `create-server.ts`) |
| layer → service (other layer) [manifest] | 7 (`core-api/package.json` 6, `core-ui/package.json` 1) |
| application → application [import] | 2 (`desktop/boot-server.ts` → remote-server, `desktop/main.ts:20` → remote-worker) |
| layer → layer (other) [manifest] | 2 (`core-api` → agent-orchestration, `agent-orchestration` → agent-execution) |
| application → service [di] | 2 · service → layer (other) [di] | 2 |
| 1 each | layer → layer (other) [import] (`boot.ts:29`) · application → MCP router [mcp] · application → db:util [import] · service → MCP router [mcp] · service → agent-execution [api] · framework → layer [di] |

### 5.2 Corrections to `plan.md`'s prose (facts, not amendments — no scope moves)

1. **`layers/core-api/connections` does not exist** at base. `plan.md:27` says both connections packages "exist today" and need explaining; the live tree has `connections` only in `agent-orchestration`, `core-api` has `credentials` (the split half, Ruling 12.1), and K1's bake is confirmed deleted (`run-orchestration-composition.ts:103-121` records the deletion). AU26 completed; nothing remains to explain and nothing is built on a phantom.
2. **Six reached-into services, not five.** `plan.md:7` lists session-requests / agent-run-config / run-orchestration / harness-registry / tool-handlers; the live tree adds **`filesystems`** — `layers/core-api/src/routes/filesystems.ts:34` imports `getFilesystem`/`saveInjection`, and `core-api/package.json` declares it. The per-service verdict pass in architecture covers **six** services.
3. **Counts drifted.** Live production import sites per service in core-api: session-requests 14 files, agent-run-config 8, run-orchestration 6, harness-registry 4 files (5 statements — `tool-provider-bindings.ts` imports both the root and `/mcp` subpath), tool-handlers 1 file (2 statements), filesystems 1. The binding inventory is §5.1's baseline, not the plan's prose.
4. The MCP dial sites are as the plan says, at slightly moved lines (`provisioner.ts:1327,1349`; bridge creation `create-server.ts:566`).

### 5.3 What the delta genuinely is

- `core-api/src` contains a body of **composition code living inside a layer**: `service-bootstrap.ts` (627 lines), `run-orchestration-composition.ts` (331), `durable-agent-queue.ts`, the `*-bindings.ts` files. These files are where most of the 36 imports and the DI sites concentrate. The face definition (§3) implies the split: wiring of *orchestration's own services into orchestration's runtime* belongs behind orchestration's face (the `bootAgentOrchestration` precedent); only what an application must genuinely supply (adapter pool, sandbox adapter, ports/tokens) crosses the face. Which file lands where is architecture's per-file call.
- The applications: `create-server.ts` composes by naming 13 service packages plus deep core-api subpaths; `desktop` imports `remote-server` (`boot-server.ts`) and `remote-worker` (`main.ts:20`) instead of composing faces; `remote-server/index.ts` constructs harness-registry objects directly.
- Core's conversation with the intake (§2) is spelled as direct import + injected `{record: enqueueWorkIntent}` at 7 DI sites.

---

## 6. Success — every plan AC, mapped

| # | AC (`plan.md:47-53`) | What it means, concretely | Proof |
|---|---|---|---|
| 1 | No layer names another layer / another layer's service in imports or manifest | Clears: layer→layer import 1 + manifest 2, layer→service import 36 + manifest 7 | Baseline entries gone; rules at error; validation scenario 2 (`plan.md:59`) fails the build on reintroduction |
| 2 | No cross-layer DI; conversation via API/MCP/bus only | Clears the 4 DI groups (14 sites); each of the six services has a chosen, named mechanism per §2.4/§2.5 | Baseline entries gone; validation scenario 3 (`plan.md:61`) |
| 3 | Applications compose faces only; name no service, no other application | Clears app→service import 15 + manifest 12 + di 2, app→app import 2; faces satisfy §3.1's three clauses | Baseline entries gone; the face rule (with attack case) at error |
| 4 | MCP router dialled only by the harness-owning layer + harness; serving layer hosts the API | §4: agent-execution hosts the router app; provisioner + application dial sites gone | `service → MCP router`, `application → MCP router`, `service → agent-execution [api]` entries gone |
| 5 | Every composition-root / cross-layer-import / DI / MCP / API entry gone from baseline, rules fail on reappearance | The 15 groups of §5.1 (the `application → db:util` group subject to Open question 1) | `governance/baseline.json` diff; shrink-only mechanism promotes automatically |
| 6 | If the baseline empties, delete the file + `--adopt` in the same commit | Conditional — whichever of AU29-AU32 clears last owns it | Only if triggered here |
| 7 | `npm run verify` green + one real agent run completes end to end | Executed, not read — a task-backed dispatch whose intent reaches session-requests, harness executes, result lands (validation scenario 4, `plan.md:63`) | Live run output + verify attestation |

---

## 7. Scope and non-goals

**In scope.** The 93 baseline sites of §5.1; per-service mechanism verdicts for the six reached-into services (emit-into-intake / API / MCP / relocate — architecture, multi-version per `plan.md:27`); the public-face rule drafted, founder-ratified, break-tested; agent-execution's router hosting; the applications' composition rewritten against faces.

**Out of scope** (`plan.md:38-41`, restated):

1. Whether `connections`, `filesystems` or any domain sits in the right layer — AU26's axis. If this WP's evidence forces reopening (e.g. §8.7), it is raised as a **finding**, never a silent fix.
2. Table ownership — AU30. The `db:*` baseline groups other than the one flagged in §8.1 are not this WP's.
3. The development world — AU32. Development-world crossings (e.g. core-api's devDependencies on `connections`/`filesystem-mounting`, core-ui's `__scripts__`) stay untouched except where a production manifest row serves them (§8.9).
4. The `shared` split — AU34. Facilitator/strategy purges — AU35/AU36.

---

## 8. Open questions handed to `/architecture`

1. **`application → db:util [import]` ownership overlap (flagged, not resolved — per plan direction).** One site: `create-server.ts:77,418` imports `resolveProfile` from `@hyperidle/db`. AU29's plan names `db:util` as its own ANOMALY (Ruling 12.3 moves the util functions out of `db`). Architecture must rule which WP clears this group — explicitly, in writing, coordinated with AU29's planner — neither silently claiming nor silently dropping it. If AU29 lands first the site may dissolve.
2. **Transactional enqueue (§2.4).** Audit all §2.2 write sites for in-transaction coupling (`knowledge.ts:934` proven); the chosen mechanism preserves atomicity or the relinquishment is an explicit decision with the failure window named.
3. **Where composition code lives, per file.** `service-bootstrap.ts`, `run-orchestration-composition.ts`, `durable-agent-queue.ts`, `*-bindings.ts`: behind which layer's face vs in the applications. AU26 §5/§7-9 rules out a third neutral composition package; AC #3 now also forbids `desktop` importing `remote-server`. Those two constraints together most plausibly mean each application owns its (thin) composition — architecture confirms or, if it concludes a shared composition package is genuinely unavoidable, escalates as a plan amendment rather than building one.
4. **The face clause + attack cases (§3.4).** Draft the model clause splitting face/insides, its `decided-rules.json` edits, and the mandatory attack + control-twin cases; present at the human gate for founder ratification.
5. **`SessionActivityBuffer` (§3.5).** The single layer→layer import: application-supplied vs relocated — a per-service verdict, judged by AU26's wiring rule.
6. **MCP mount mechanics (§4).** The agent-execution app's shape, which applications mount it, `remote-worker`'s role, and how URL/token reach provisioner and harness legally.
7. **Core routes that may be sitting on the wrong app.** `sessions-routes.ts` (status reads, explicit session start) and the `agent-run-config` admin writes (`org.ts:19`, `users.ts:1`, plus reads in `assistant.ts`/`agents.ts`/`teams-routes.ts`/`agent-profile.ts` — a human-administers-agent-config surface) may belong on orchestration-api rather than being re-mechanized in place. That is AU26's axis: if the evidence says so, raise it as a finding with the per-service verdict; do not silently move routes.
8. **Per-service verdicts for all six services** — session-requests (§2 settles the noun; mechanism per site remains), agent-run-config, run-orchestration, harness-registry, tool-handlers, filesystems. A blanket answer is the named failure mode (`plan.md:27`). `/architecture` may split the WP; expected, not a plan failure.
9. **Face hygiene details.** core-ui's production manifest row on `harness-registry` serves only `__scripts__` development files (spelling of the fix — devDependency vs relocation — is the builder's); core-api's `./test-utils` export entry cannot survive on a production face (§3.5) — architecture states where its consumers land.

---

## 9. Hard constraints, restated unsoftened (`plan.md:29-36`)

- **Zero exceptions.** No allowlist, no stateless-provider carve-out, no named-method exemption. Decision L already overturned that apparatus once; it does not come back.
- **The end state is the end state.** No transitional facade, no "temporary" cross-layer import.
- A layer's package manifest names no other layer or another layer's service.
- Composition roots reach a layer's public face only — never a service, never another application.
- No production export added that only tests consume.
- Baseline is shrink-only; clearing a group's last site deletes the entry and the rule is at error from that commit. No separate promotion step exists or is deferred.
- Every cleared entry is deleted, never re-tagged.
- Human review gate is mandatory: architecture → independent critique → founder review before code moves (`plan.md:25`), and the §3.4 vocabulary change rides that gate.

---

## 10. Required reading for downstream phases

- `.pipeline/work/AU31/plan.md` — spec of record.
- `.pipeline/AU.md` — AU31 row, dependency graph (AU31 → AU28; independent of AU29/AU30; AU32 separate).
- `.pipeline/work/AU28/founder-rulings.md` — Rulings 1 (the isolation rule), 2/12 (end-state governance), 5 (roles from registry), 9-11 (structure), 14/15 (one door; harness noun).
- `governance/README.md`, `governance/architecture.json`, `governance/decided-rules.json`, `governance/baseline.json` — the enforced model this WP clears its groups from.
- `.pipeline/work/AU26/requirements.md` §2 — the domain test applied in §2.2; §5 — the two-apps-one-listener composition shape.
- `.pipeline/work/AU21/architecture.md` — Decisions H/L (zero-read doctrine, exemption teardown) the session-requests verdict rests on.
- `layers/agent-orchestration/src/boot.ts` — the face-shaped precedent (§3.1 clause 3).
