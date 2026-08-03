# AU26 — Requirements

DOC-CLASS: significant

Spec of record: `.pipeline/work/AU26/plan.md` (unchanged by this refine — see §9). Track frame: `.pipeline/AU.md`, `docs/architecture/runtime-simplification.md`. Engineering tier: **production** (fixed input, not re-opened).

Verified against `origin/main` @ `75d85687` (AU21 PR #457). Every claim below was traced in source with `rg -a`; drift from `plan.md`'s prose is recorded in §9. Revision round 2 — per-finding disposition in §10.

---

## 1. Sharpened goal

**Value, and to whom.** The audience is the HyperIdle maintainer/agent who adds the *next* agent-domain capability. Today there is no rule that tells them which Layer it belongs in, so agent-domain code lands in `core-api` by default — by omission, not decision. AU21 proved the boundary can be held (zero orchestration→core reads) but had to bake connections onto every emitted request (Decision K1) precisely because the domain sat in the wrong Layer: a real staleness cost paid for a misplacement. AU26 delivers **one re-applicable test that decides Layer ownership from evidence**, applies it to the candidates already found, and *acts* on every verdict — so the next capability is placed by rule, and the placement is checkable.

**Success — observable after this ships.**

1. A maintainer can take any agent/agent-environment capability sitting in `core-api` and reach a defensible verdict by following §2 mechanically, without re-deriving the reasoning. The test is written down, has explicit disqualifying rationalizations, states its evidence bar, classifies *every* site it meets, and has been re-run against candidates it was not derived from (§2.1).
2. `agent-orchestration` hosts at least one HTTP/WS route through **its own** app, mounted by the Application tier — `core-api`'s app no longer imports an agent-orchestration route module. Adding an agent-domain route has an obvious, correct home for the first time.
3. A connection added or removed *after* an intent is emitted but *before* it drains is provisioned correctly at spawn — because `connections` is read live, in-layer, not from an emit-time bake. K1's bake mechanism is gone from the tree.
4. Every one of the five candidates in §4 carries a written verdict with `file:line` evidence (C1's verdict is already settled — it needs the *move*, not a verdict), and every "relocate" verdict has actually been executed in this WP, after the founder confirmed it (§4 gate).
5. Nothing a user sees changes. Settings connections/filesystems/agents pages and the live session-activity view behave identically end to end, proven the way §7 AC #6 states.

**Non-goals — deliberately out.** See §6; they are load-bearing, not decoration.

**Failure shape (the thing to guard against).** This WP fails if it produces *verdicts without moves* (deferral dressed as analysis), *moves without evidence* (the connections precedent applied by analogy), *a test that goes indecisive on the first candidate it did not come from*, or *scope creep into a blanket per-Service audit*. Any one of the four is a failed AU26 even with green verify.

---

## 2. The "administers vs. works with" test

The primary durable artifact. Stated so a future WP re-applies it without re-derivation. Re-run against two out-of-list candidates in §2.1 — that re-run is part of this WP's proof that the test is finished, not decoration.

### Question

> Does `core-api` ever **operationally consume** this capability for its own purpose — or does it only (a) let a human administer or view it, and/or (b) hold an implementation exercised exclusively on behalf of an agent's session or environment?

Only the first answer earns core ownership.

### Procedure

**Step 0 — Check the test applies at all.** The test decides Layer ownership for a unit that is **about an agent or an agent's execution environment** and currently sits in `core-api`. It is not a general-purpose relocation engine. `Work`, `Conversation`, `Knowledge`, `Users` (identity), `Settings` are fixed as core domains by this track's charter (`.pipeline/AU.md`; `plan.md:36`) — the test may **never** return a verdict against one of them. If the unit is one of those domains rather than an agent capability embedded inside one, stop: there is no verdict to reach.

**Step 1 — Name the unit precisely.** The verdict is per *unit*, never per package. These are always separate units, each with its own verdict:

| Separate units | Example here |
|---|---|
| a record vs. the engine that acts on it | `filesystem-registry.ts` vs. `RegistryFilesystemMounter` |
| a table vs. a subset of its columns | `users` identity vs. `users.harnessType`/`modelId`/… |
| a route's HTTP hosting vs. its data/query logic | `app.ts` mounting `/agent-orchestration` vs. `@hyperidle/session-requests` owning the query |
| a capability vs. the UI that administers it | mounting engine vs. the reachability-probe page |

A unit inheriting a sibling's verdict by analogy is not a verdict.

**Step 2 — Seam check (unit-level, decisive).** Some units are not domain units at all: they exist *only* to let one Layer read another Layer's state through a narrowed handle. A unit is a **cross-Layer read seam** if **both** hold, traced in source:

- it owns **no table** (no `@hyperidle/db` import, no state of its own beyond the handle it wraps), and
- it contains **no logic beyond narrowing, forwarding, or reshaping** another Layer's already-owned state — no decision, no persistence, no side effect, no subscription, no lifecycle.

If both hold → **verdict: the seam follows its readers.** It lives on the reading side of the boundary and is deleted when the reads are. Do not classify its sites; a seam is consumed across a boundary *by construction*, so site classification cannot decide it, and relocating a seam to the far side of the boundary it exists to span is incoherent. A seam **never** becomes an `agent-orchestration` Service.

**When the readers straddle the boundary.** "Follows its readers" assumes one reading side. If a seam's readers end up on **both** sides — which this WP guarantees for at least one seam (§2.1 re-run 1) — the seam does not pick a side: it **sinks to the Layer-neutral package both sides may import** (`@hyperidle/shared`), and each side injects its own handle to the state the seam narrows. The other two options are closed, not merely disfavoured. *Duplicating* it makes two copies of one contract that drift apart independently. *Leaving it on the majority side to be reached across the boundary* is banned outright: that import **is** the cross-Layer read AU21's zero-read boundary and `orchestration-api` hard rule 2 (§3) forbid, and a seam is the one unit whose entire purpose is to not be that read. Sinking is always available to a genuine seam — Step 2 has already established it owns no table, holds no lifecycle, and does nothing but narrow an injected handle. If a unit cannot be sunk (it needs state that will not travel, or a Layer-owned import `@hyperidle/shared` may not take), that is evidence it was never a seam: re-run Step 2 and classify its sites.

*This gate is deliberately tight, and it must stay tight.* Verified against the units in §4: `RegistryFilesystemMounter` fails it (real `fs.symlinkSync`/`fs.cpSync`/git-worktree side effects); `service_connections` fails it (owns a table); `session-activity-gateway.ts` fails it (subscribes to three EventBus topics, holds subscription lifecycle, actively pushes). If a unit with real logic is ever called a seam to avoid a verdict, that is the rationalization the disqualifier list below bans.

**Step 3 — Enumerate every real site from source at HEAD.** `rg -a` (never plain `grep`: it misreports control-character files as binary). List non-test and test sites separately, and list *transitive* sites where a thin local wrapper forwards the read (name the wrapper and its callers). A claim from a doc, a prior WP's prose, or a `@lore` comment is a lead, never evidence.

**Step 4 — Classify every site into exactly one class.**

| Class | Meaning |
|---|---|
| **A — core operationally consumes** | a core domain uses the result to **do** something: write a core-owned table, gate an operation that changes state, emit an event, enqueue work, or derive a value core persists. |
| **B — human-facing read (administration *or* display)** | the result's only consumer is a human looking at it. Covers both editing (CRUD route, settings form, validation message) **and** view-only rendering (a status badge, a health signal, a roster column, a capability list). |
| **C — on an agent's behalf** | the result only ever feeds a run's admission, provisioning, execution, or capture. |
| **D — composition/wiring only** | a composition root constructs, injects, or disposes it; a type-only pass-through parameter threads it to a real site. Composition is an Application/Layer-tier act, never consumption. |

**A is not "it appears in a core-api response."** Every route in `core-api` renders in `core-api`; treating that as consumption makes A circular and makes every unit stay by construction. A requires a *traced effect*.

**Tie-break — a site that reads as both A and B.** Ask one question: **apart from what is serialized into the response body, does anything consume the result?**

- No → **B**. This includes a branch that only selects *which* thing to render, and a value passed through a pure projection function (a health signal, an availability flag, a formatted label) on its way into the response.
- Yes → **A**, and name the effect: the write, the enqueue, the emitted event, or the state-changing operation it gates. An A asserted without naming its effect is not an A.

**Residual rule — no ad-hoc classes.** If, after Step 0, the Step 2 seam check, and the tie-break, a site still fits no class, the test is **defective for that unit**. Record the site verbatim, do not invent a class, and escalate the gap as a named test defect. A verdict reached by inventing a class to make the answer come out is not a verdict.

**Step 5 — Verdict.**

- Any genuine **A** → **stays** core-api-owned. One A is enough. When sites disagree, precedence is **A > C > B > D**.
- Only B / C / D → **relocates** to `agent-orchestration`.
- Only B / C / D **and** the unit is pure, stateless, owns no table, holds no lifecycle and carries no domain of its own → **dissolves** (into `@hyperidle/shared` or its single caller) rather than becoming a Service. Precedent: AU21 Decision L2 (`model-gateway`).
- Unit is a seam (Step 2) → **follows its readers**.

Four verdicts, not three. "Follows its readers" and "dissolves" are each a real outcome, not a variant of "relocates."

**Step 6 — Rule out A actively.** "Does core itself call this" must be *traced* — find the call, read it, or demonstrate there is none by enumeration. Absence of an A in a narrative is not evidence of absence.

**Step 7 — Record evidence.** `file:line` for every site, its class, one line of reason; for any A, the named effect. A reader who trusts nothing must be able to reconstruct the verdict.

### Disqualifying rationalizations — never admit as class A

Security locality · UI locality ("the frontend already calls core-api") · **"it is rendered inside a core-domain response"** (the same UI-locality argument one level in — see the tie-break) · convenience · "it's infra, so it's core" · historical placement · "the sibling case moved, so this moves too" · "core-api is the Layer with the HTTP surface" · "it's basically a seam" applied to a unit that fails Step 2. Each of these is an *engineering* argument; per Decision J's governing rule, **domain is the only accepted reason for the cut — everything else has to be engineered around.**

### Destination rules

- `agent-execution` is **never** a destination. Structurally disqualified: zero DB credentials, may run on a separate machine (`docs/architecture/runtime-simplification.md`).
- A relocated table-owning unit becomes a SQL-owning `agent-orchestration` Service: sole importer of the table object, barrel exports typed functions only, ACL enforced by a real guard.
- Table *definitions* never move out of `packages/db/src/schema.ts`. Only the ACL-holder changes. If a verdict genuinely requires a new table, that is a schema change and must be costed explicitly, never assumed free.
- **`AgentOrchestrationPort` stays strictly read-only** — its shipped contract says so verbatim (`packages/api-contract/src/agent-orchestration-port.ts:22-23`, "STRICTLY READ-ONLY (§12)"). No mutation ever rides a read seam. A relocated unit that needs a core-ui-facing *mutation* door gets an `orchestration-api` route, never a Port method. If a relocation makes part of the Port redundant, architecture says which part, explicitly.
- A relocation must delete its own throwaway boundary-patch precedent, not coexist with it. Corollary: a relocation may not be staged through an interim host it will later leave — that *creates* the patch this rule bans (see §4 C1's sequencing consequence).

---

## 2.1 Test re-run log — two candidates the test was not derived from

The test in §2 was reverse-engineered from §4's candidates, so it was re-run against two out-of-list units before this document was considered finished. Both classify every site and reach a decisive verdict.

### Re-run 1 — `packages/core-api/src/services/harness-capability-read-model.ts`

*(The unit the previous round of this test could not classify. Chosen precisely because it broke the earlier taxonomy.)*

**Step 0.** Harness/adapter capabilities are agent-execution runtime state; the unit sits in `core-api`. In scope.

**Step 1.** Unit = the `HarnessCapabilityReader` `Pick` type + the six exported forwarders in that one file. *Not* the same unit: `AdapterPool` itself (agent-execution, `@hyperidle/harness-registry`), or the routes that consume it.

**Step 2 — seam check: PASSES.**
- Owns no table: the file's only imports are `type { AdapterInfo, AdapterMeta, AdapterPool } from "@hyperidle/harness-registry"` and `type { HarnessCapabilities, HarnessCapabilityDescriptor } from "@hyperidle/shared"` — zero `@hyperidle/db`. (Its own AU19 `@lore` records the same verification independently; the import list is the evidence.)
- No logic beyond narrowing/reshaping: `registeredHarnessCount` → `reader.size`; `workerConnections` → `reader.list()`; `harnessCapabilitiesForType` / `harnessRegistrationMeta` / `harnessCapabilityDescriptors` → `reader.describe(...)` plus a pure shape map; `refreshHarnessDiscoveries` → `reader.refresh()`. No decision, no persistence, no subscription, no lifecycle.

**Verdict: seam → follows its readers — and its readers straddle, so it sinks.** It never becomes an `agent-orchestration` Service and is never independently relocated. **Decisive, and independent of how its sites classify** — which is exactly the property that was missing before. Applying Step 2's straddle rule with this document's own decisions: `routes/connections.ts:204` moves to `orchestration-api` (§4 C1), while `agent-profile.ts:299, 311`, `teams-routes.ts:273, 771`, `agents.ts:135, 165` and `users.ts:196` serve charter-fixed core domains and stay on `createCoreApiApp()`. Readers on both sides → **the seam sinks to `@hyperidle/shared`**, each side injecting its own `HarnessCapabilityReader` handle. It is deleted only when *all* its reads are. The unit is already shaped for this: six stateless functions over an injected `reader` parameter, zero module state (`harness-capability-read-model.ts:55-124`). One constraint architecture must respect: `@hyperidle/shared` declares **zero** `@hyperidle/*` dependencies at HEAD (`packages/shared/package.json`), and `@hyperidle/harness-registry` already depends on it — so the sunk handle type must be declared **structurally** in `shared`, not as today's `Pick<AdapterPool, …>` (`:55`), or the sink inverts into a package cycle.

**Site classification (run anyway, to prove the widened taxonomy leaves no residual):**

| Site | Class | Reason |
|---|---|---|
| `routes/harnesses.ts:86, 100, 102, 114, 161` | B | `/api/harnesses` list/refresh — a human administering harness config |
| `routes/connections.ts:204` | B | inherited-connection projection rendered into the Settings response |
| `routes/workers.ts:34` | B | `GET /api/workers` — worker list displayed |
| `routes/agents.ts:135, 165` | B | registration metadata rendered into the agents response |
| `routes/agent-profile.ts:311` | B | `harnessCapabilitiesForType` → `mapCapabilities` → response body only |
| `routes/agent-profile.ts:383, 386` (inside `resolveHarnessAvailable`, `:376-387`) | B | thin local wrapper; see its callers below |
| `routes/agent-profile.ts:299` (calls `resolveHarnessAvailable`) | B | **tie-break applied** |
| `routes/teams-routes.ts:273, 771` (call `resolveHarnessAvailable`) | B | **tie-break applied** |
| type-only pass-throughs: `agent-profile.ts:215, 378`, `harnesses.ts:74`, `workers.ts:23`, `agents.ts:194`, `connections.ts:178`, `teams-routes.ts:169`, `users.ts:196`, `assistant.ts:272` | D | parameter threading / composition |
| `services/__tests__/harness-capability-read-model.test.ts` | (test) | listed separately per Step 3 |

**Tie-break worked example** — `agent-profile.ts:299` and `teams-routes.ts:273,771` are the three sites that previously fit no class. `harnessAvailable` feeds `computeHealthSignals(...)`, whose output is serialized into `AgentProfileResponse` (`agent-profile.ts:299-310`) and `TeamListItem` / the roster row (`teams-routes.ts:273-285`, `:771-780`). Apart from the response body, nothing consumes it: no write, no enqueue, no emitted event, no gated operation. → **B**, not A. **12 direct call sites + 3 transitive + 9 type-only params: every site classifies. Zero residual.**

### Re-run 2 — `packages/core-api/src/services/session-activity-gateway.ts`

**Step 0.** Session/harness activity streaming is agent domain, sitting in `core-api`. In scope.

**Step 1.** Unit = `registerSessionActivityGateway` + the `SessionActivityBroadcastTarget` interface. *Not* the same unit: `WsConnectionHub` (that is C4, the sink) or `SessionActivityBuffer` (already relocated to agent-execution).

**Step 2 — seam check: FAILS.** It subscribes to three EventBus topics (`session_started`, `session_ended`, `tool_call_recorded`), holds subscription lifecycle (returns an unregister closure), and actively pushes to a broadcast sink. Not a passive read handle. Continue to Step 3.

**Step 3 — sites (`rg -a`, HEAD).** Non-test: `packages/core-api/src/server-factory.ts:109` (import), `:1181` (`registerSessionActivityGateway(eventBus, wsHub)`), `:1098` + `:1257-1259` (dispose lifecycle) — one composition root, no other non-test consumer anywhere in `packages/`. Test: `services/__tests__/session-activity-gateway.integration.test.ts:36, 62, 85, 111`.

**Step 4.** `server-factory.ts:1181` and `:1257-1259` → **D**. No A, no B, no C.

**Step 5 — verdict: D-only → relocates.** Dissolve check fails: it holds subscription lifecycle and it carries a real domain — session/harness activity streaming, which is `orchestration-api`'s named concern in C5. → **relocates to `agent-orchestration`.**

**Step 6 — A ruled out actively.** The only non-test importer is the composition root. The broadcast sink is `wsHub`, whose subscribers are core-ui WS clients. No core domain reads the forwarded payload. (The file's own AU21 header saying it "represent[s] agent-orchestration's own gateway/router role" is a *lead* that corroborates this, not the evidence for it.)

**Recorded as a found candidate, per §4's cross-cutting rule.** It is not a sixth build item and does not widen §6's fence. It is the natural cargo of C5 — the streaming concern C5 relocates. It reached a **relocate** verdict, so AC #5 binds it: **it rides C5 and is moved in this WP.** Architecture states explicitly where in C5's increments it lands. It may not be silently absorbed, and it may not be deferred — a relocate verdict parked as a follow-up is exactly §1's failure shape.

---

## 3. New nouns

### `orchestration-api` — the one new noun

**Is:** the HTTP/WS surface the **`agent-orchestration` Layer hosts itself**, for agent-domain concerns — exported as `createAgentOrchestrationApp()`, mounted by an Application. Immediate concrete case: session/harness streaming, which `core-ui` dials directly.

**Is not:**
- **Not a second server, port, or process.** `agent-orchestration` is always colocated with `core-api` in one process (`runtime-simplification.md`). Two Hono apps mounted on **one** listener. Anything that implies a second base host is out.
- Not `agent-execution`'s surface. Execution has no DB and hosts nothing. The existing `/ws/worker` ingress (`run-orchestration/src/worker-ingress.ts`) is orchestration's *inbound* door for remote workers, not execution's own API.
- Not `AgentOrchestrationPort`. That is a type-only, **strictly read-only** seam in `@hyperidle/api-contract` used by `core-ui`; `orchestration-api` is the actual HTTP hosting. Where `orchestration-api` hosts a route directly, that Port's gateway for it becomes redundant — architecture states which, explicitly.
- Not a third "neutral" composition package.

**Hard rules:**
1. `orchestration-api` never imports a `core-api` route module.
2. Its handlers inherit AU21's zero-read boundary in full — an `orchestration-api` handler may not read core domain state, not via a seam, not via colocated DI. Hosting a route is not a licence to read.
3. Only the Application tier (`remote-server`, `desktop`) mounts it. A Layer never mounts another Layer's app.
4. Mutating agent-domain routes are hosted here, not on a read seam. `AgentOrchestrationPort` stays read-only (§2 destination rules).

### The `core-api` app — named by the symbol it already has

The other half of the split is `core-api`'s own Hono app: the HTTP/WS surface `core-api` hosts for its own domains — work, conversation, knowledge, users (identity), settings, notifications, org, review/policy, routine, git-export — exported as `createCoreApiApp()` and mounted by an Application.

**It gets no new noun.** Prose calls it "the core-api app"; code calls it `createCoreApiApp()`.

*Why — `workspace-api` was considered and rejected.* An earlier draft of this document minted `workspace-api` for it, kept "conceptual only," with the code identifier staying `createCoreApiApp()`. That is the worst of the options: **`workspace` already means the opposite side of this exact boundary** — `HYPERIDLE_WORKSPACES_DIR` (`docs/architecture/run-unit-model.md`) and `workspaceAdapter` (`server-factory.ts:762`, `desktop/src/boot-server.ts:30`) mean *an agent run's working directory / sandbox*, an agent-execution concept — so the noun pays a real collision cost, needs a disambiguation gloss at every use, and buys nothing that "the core-api app" does not already carry. A conceptual-only noun with zero code presence also cannot be found by grep, cannot be enforced by a guard, and will not be adopted. Committing it to code instead would eat the collision for no gain. **Rejected: keep the symbol that already exists and already reads correctly.**

*The asymmetry is intentional and justified:* `orchestration-api` is net-new — the Layer has no app today, so the artifact needs a name and gets a committed symbol, `createAgentOrchestrationApp()`. `core-api`'s app is not net-new in concept, only slimmed, and it already has a settled symbol. One new noun, because exactly one thing is new.

### Relation to existing names

| Existing tier | Names | Change |
|---|---|---|
| Application | `desktop`, `remote-server`, `ui`, `remote-worker` | none — but each gains the composition work moving out of `server-factory.ts` |
| Layer | `core-ui`, `core-api`, `agent-orchestration`, `agent-execution` | none |
| Service | `work`, `knowledge`, `run-orchestration`, … | none — plus whatever this WP relocates |
| **Layer app (new tier)** | `createCoreApiApp()` (the core-api app), `orchestration-api` / `createAgentOrchestrationApp()` | new: exactly one per Layer that hosts HTTP; named one tier below Layer, orthogonal to Service |

---

## 4. Per-candidate success — stated so the verdict is not presumed

Five candidates, C1–C5. **C1's verdict is already settled** (relocate, by AU21 Decision J) and needs the *move*; C2–C5 each need a verdict *and* the move their verdict implies. That is the reconciliation of "four" vs. "five": four open verdicts, five build items.

**Human gate on the verdicts (`plan.md:28`, carried forward as a hard sequencing constraint).** The `filesystems`-engine, `users`-columns, and orchestration-api verdicts are consequential domain calls. **Each "relocate" verdict is confirmed by the founder before that relocation is built** — not accepted from an agent's audit alone, and not bundled into approval of this document. `DOC-CLASS: significant` gates *this* requirement; it does not gate the architecture-time verdicts. Architecture must sequence a verdict-confirmation point between each verdict and its build increment.

**C1 · `connections` — verdict already settled (relocate), build it.**
Settled by AU21 Decision J; do not re-derive. Success: `serviceConnections` has exactly one Service importer (a new SQL-owning `agent-orchestration` `connections` Service); no core-api Service reaches the table; a real guard fails the build on violation; `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts` and every wiring of it are deleted; a test proves the add-after-emit/before-drain case now provisions correctly.

**J6 is superseded by this requirement — the question is closed, not open.** Reasoning, stated so architecture does not re-open it:
1. J6's *sole* rationale (`AU21/architecture.md:844`) is "core-api is the Layer with the HTTP surface; agent-orchestration has none of its own." That is not a domain argument — it is a statement of the wiring at the time — and §2's disqualifier list bans it by name.
2. C5 exists precisely to falsify J6's premise. A decision whose only support is a fact this WP deliberately changes cannot survive the change.
3. J6's outcome — a core-api-hosted route whose data/query logic is owned by an `agent-orchestration` Service — is forbidden by the core-api app's own rule (§3, and §2's boundary): a Layer app hosts no route whose query logic another Layer owns.

**Therefore: connections' HTTP surface — reads *and* mutations — is hosted by `orchestration-api`.** Architecture designs the move; it does not re-choose. Consequences, stated so they are not re-derived:
- J6's "extend `AgentOrchestrationPort` with a `connections` read family" is **not built**. `core-ui` dials `orchestration-api`'s connections routes directly, the same way it will dial session streaming. If architecture finds a reason the Port family is still needed, that requires a new argument on new evidence.
- J7's deletion of `CoreApiPort.connections` **stands** unchanged. What is dropped is J6's *addition* to `AgentOrchestrationPort`.
- The read-only Port constraint is preserved *more* cleanly than under J6: mutations are ordinary `orchestration-api` routes, so nothing mutating ever rides the read seam.
- **Sequencing.** C1's route re-hosting cannot land before C5's app skeleton exists. Hosting connections on core-api "for now" and moving it later would manufacture exactly the throwaway boundary patch this WP exists to delete (§2 destination rules, last bullet). So C5's `createAgentOrchestrationApp()` skeleton is the **first** increment, and C1's J3/J4 land onto it. This inverts `plan.md:32`'s "connections first" sequencing hint — recorded in §9; `plan.md`'s ACs and scope are unaffected.
- J1/J2/J3 (crypto primitive → `@hyperidle/shared`, package rename to `@hyperidle/credentials`, the new SQL-owning Service) are untouched. Only J4's hosting target changes.

**C2 · `filesystems`' mounting engine (`RegistryFilesystemMounter`).**
Success = a written verdict for the **engine**, plus an independently-written verdict for the **record + reachability-probe UI**, each with per-site classification under §2. If the engine's verdict is relocate, it is moved with C1's rigor. If the engine's verdict were "stays," success is the evidenced verdict itself — the AC is not unmet.
Sites already enumerated at HEAD (a floor for architecture's own trace, deliberately *unclassified* here): `new RegistryFilesystemMounter` appears once, `packages/core-api/src/server-factory.ts:1006`. `.mount()` / `.captureBack()` are called from `packages/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts:78` and `provisioner.ts:527`, and nowhere else non-test. Architecture classifies each site itself and runs Step 6 rather than adopting a pre-written conclusion.

**J8's status — stands, precisely bounded, one clause superseded.** J8 (`AU21/architecture.md:850`) decided *where the reachability probe's resolver call executes*: in-layer in `run-orchestration`, a direct consequence of J moving `ServiceConnectionResolver` (which `packages/core-api/src/routes/filesystems.ts:6` still type-imports from `@hyperidle/connections` at HEAD). J8 explicitly left "`filesystems` records + `/api/filesystems` routes + `SettingsFilesystems` … otherwise untouched." So **J8 does not pre-decide C2** — the record's ownership and the probe route/UI's Layer are exactly what J8 declined to touch, and C2's independent verdict is not a re-derivation of a locked decision. Superseded clause: J8's fallback "any residual core-api-route reachability check reads via the J6 door" — with J6 gone, such a check reads `orchestration-api`. If C2's verdict on the record contradicts J8's bounded co-move, J8's boundary is re-derived on that evidence, not assumed.

**C3 · `users`' agent-execution columns.**
Success = a **per-column** verdict (each column is its own unit per §2 Step 1), backed by a real reader/writer trace, plus an explicit statement of whether a clean cut is possible without breaking `users` as the single human+agent identity record. If the verdict is relocate, the resulting schema change is costed explicitly (migration, backfill, every reader) — the "no data migration" constraint does **not** pre-decide this candidate; it means a relocation must not *silently* become a migration.
Candidate columns present at HEAD (`packages/db/src/schema.ts:47-92`): `kind:50`, `maxConcurrentSessions:62`, `harnessType:76`, **`modelTierPreference:78`**, `modelId:84`, `modelProvider:92`. `modelTierPreference` is a sixth column of exactly the same shape and is missing from `plan.md`'s five-name list — it is in scope. `systemPrompt:74` / `systemPromptPath:53` / `skills:60` / `status:61` are adjacent and must get an explicit in-or-out call rather than being silently skipped.
Step 0 applies with force here: `users` *identity* is charter-fixed core. The unit under test is each agent-execution column, never the table.

**C4 · `WsConnectionHub`.**
Success = a verdict among **stays / relocates / dissolves / follows its readers** (all four live), evidenced by what the hub actually pushes at HEAD, decided *after* orchestration hosts its own streaming. The plan's "plausible verdict is stays" is a hypothesis, not a default to confirm.
Sites already enumerated at HEAD (deliberately *unclassified* here): constructed once at `server-factory.ts:1110`; consumed by `packages/core-api/src/routes/ws.ts`, `packages/core-api/src/routes/threads.ts`, and `packages/core-api/src/services/work-state-push-gateway.ts`. Architecture classifies each site itself. Note the interaction with §2.1's found candidate: `session-activity-gateway.ts` broadcasts *through* this hub today (`server-factory.ts:1181`), so C4's verdict must be taken after that forwarding is resolved, not before.

**C5 · the Layer-app split (`createCoreApiApp()` / `orchestration-api`).**
Success = `agent-orchestration` exports and owns its own Hono app hosting at least session/harness streaming; `core-api/src/app.ts` no longer imports `./routes/agent-orchestration-sessions-routes.js` (that import is at `app.ts:42` at HEAD, mounted `app.ts:556-561` — its removal is the observable proof); both apps are mounted by the Application tier onto one Hono instance under one listener; `core-ui` reaches orchestration's route directly and the live activity view renders identically.

**Blast radius, verified at HEAD with `rg -a` (`plan.md:32` enumerated this; architecture may not under-size it).**

| Kind | Files | Note |
|---|---|---|
| Non-test composition roots calling `createServer(` | `packages/remote-server/src/index.ts`, `packages/desktop/src/boot-server.ts`, `packages/web/scripts/ah1-test-server.ts`, `ah5-test-server.ts`, `ah6-test-server.ts` | 5 — `packages/web/playwright.ah1.config.ts:23` references it in a comment only |
| Non-test `createApp(` callers | `packages/core-api/src/server-factory.ts`, plus the two shipped test-helper sources `packages/core-api/src/test-utils.ts:13` and `packages/core-api/src/test-fixtures.ts:49` | the two helpers are **not** in `plan.md`'s list and fan out to most core-api tests |
| `*.integration.test.ts` under `packages/core-api` constructing `createApp()` | 11 files | exactly matches `plan.md:32`; confirmed by enumeration |
| Test files calling `createServer(` | 8: `core-api/src/__tests__/{AU9-assistant-handoff-realbinary, app-runtime-route-boot, bet-decomposition-removal, configuration-projection-boot, server-disposal}.integration.test.ts`, `core-api/src/__tests__/server-factory.resolver.test.ts`, `packages/desktop/__tests__/boot-server.test.ts`, `packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts` | **absent from `plan.md` entirely** — nearly doubles the test-side reach |
| `packages/eval` | **`plan.md` is wrong here** — `provision-harness.ts` and the scenario files call **no** `createApp`/`createServer`. They deep-subpath-import `@hyperidle/core-api/session` (`provision-harness.ts:14`) and `@hyperidle/core-api/routines` (`scenarios/{builtin-routines,skill-autonomy,routine-sessions,delegation}.ts`) | unaffected by the split **provided** `core-api` keeps those subpath exports; architecture states that explicitly rather than assuming it |

Net: ~7 non-test composition/helper sites and ~19 test files touch the boot surface. Architecture sizes C5 against these numbers, not against `plan.md`'s prose.

Architecture decides (do not pre-empt here): whether `remote-server` and `desktop` share a composition helper or each duplicates a slimmer bootstrap — the Applications rule is satisfied either way, so this is DRY vs. zero-shared-surface, not layering correctness.
Also in scope for architecture, surfaced by this refine: `agent-orchestration` is not starting from a blank slate — `run-orchestration` already declares `hono` (`package.json:18`) and already owns a route handler: `registerWorkerWsRoute` (`worker-ingress.ts:239-279`) calls `app.get(` at `:259` to mount `/ws/worker` on a Hono app handed in from core-api (`start-runtime.ts:355` → `server-factory.ts:1189` → `app.ts:415`). That inverted-injection pattern is the precedent to convert, and the reason the "zero routes" framing in `plan.md` needs the correction in §9.

**Cross-cutting.** If a further genuine candidate surfaces while applying the test, name it and its evidence explicitly as a *found candidate* — do not silently fold it into this WP's build, and do not suppress it. §2.1's `session-activity-gateway.ts` is the first such find and is handled under that rule.

---

## 5. Guide draft (developer-facing)

> *Drafted for the human requirement review; `/write-docs` reconciles it into `docs/architecture/` against what ships. No user-facing UI changes, so there is no user-guide page.*

### Which Layer does a new agent capability belong in?

Ask one question: **does the core app ever use this for its own purpose, or does it only let a human configure or look at it and then hand it to an agent?**

Run the test in `docs/architecture/` (§"administers vs. works with"):

1. Check it applies. The test is for agent / agent-environment capabilities sitting in `core-api`. Work, Conversation, Knowledge, user identity and Settings are core by charter — the test never returns a verdict against them.
2. Name the unit precisely. A record and the engine that acts on it are different things. A table and a few of its columns are different things. A route's hosting and its query logic are different things. Decide each separately.
3. **Seam check.** If the unit owns no table and does nothing but narrow or reshape another Layer's state — no decision, no writes, no subscriptions — it is a read seam. A seam follows its readers: it lives wherever the code that reads it lives, and disappears when those reads do. It never becomes a Service. Keep this gate tight: anything with real logic is not a seam.
4. `rg -a` every real call site, including the ones a thin local wrapper hides. Not the docs, not a comment — the code.
5. Label each site: **A** core uses the result to *do* something — a write, an enqueue, an event, a gated operation · **B** a human is administering or viewing it · **C** it only ever feeds an agent's run · **D** a composition root is just wiring it up.
6. One genuine **A** and it stays in `core-api`. Only **B**/**C**/**D** and it moves to `agent-orchestration` — or, if it's a pure stateless function with no table, no lifecycle and no domain, it dissolves into `@hyperidle/shared` instead of becoming a Service.

**The trap to avoid:** "a core route renders it" is *not* class A. Every core route renders in core — treat that as consumption and everything stays by construction. If the result goes nowhere but into the response body, it's **B**. Class A means you can name the effect.

"It's already in core-api", "the UI calls core-api", and "it's infra" are not class A either. Nothing ever moves to `agent-execution` — that Layer has no database credentials at all.

### Where does a new HTTP route go?

Each Layer owns its own Hono app. Neither imports the other's routes.

- The route serves **work, conversation, knowledge, user identity, or settings** → add it to `core-api`'s own app, `createCoreApiApp()`.
- The route serves **an agent concern** — session streaming, harness activity, run lifecycle, connections → add it to `agent-orchestration`'s own app, `createAgentOrchestrationApp()`, the surface we call **orchestration-api**. Its handlers inherit the AU21 boundary: hosting a route is not permission to read core state.

Both apps get mounted by the Application (`remote-server`, `desktop`) onto **one** Hono instance behind **one** listener — orchestration is always colocated with core-api in the same process. There is never a second server or a second port.

Mutating agent-domain routes belong on `orchestration-api`. `AgentOrchestrationPort` is strictly read-only and stays that way — never route a write through it.

If you find yourself importing the other Layer's route module to mount it, stop: the route is in the wrong app.

---

## 6. Scope boundaries

**In:** the five candidates in §4 (C1–C5), and only those.

**Out — tight, so architecture cannot drift in:**

1. **A blanket per-Service audit of core-api.** `conversation`, `git-export`, `knowledge`, `notifications`, `org`, `policy`, `review`, `routine`, `settings`, `work`, `observability` are **not** individually challenged. A real find under §2 is named and evidenced as a *further candidate* rather than triggering an audit of its neighbours; if that find reaches a **relocate** verdict it is still moved here, under AC #5 (see §2.1's `session-activity-gateway.ts`, which rides C5). What is out of scope is the sweep, never the execution of a verdict already reached.
2. **The charter-fixed core domains.** `Work`, `Conversation`, `Knowledge`, `Users` (identity), `Settings` are fixed as core by this track's charter (`.pipeline/AU.md`; `plan.md:36`). §2 Step 0 makes this a property of the test itself, so the test cannot mechanically produce a verdict against one of them. This WP challenges agent capabilities *embedded inside* those packages, never the packages.
3. **The LLM-key catalog.** `server_credentials` / `@hyperidle/credentials` stays core-api-owned (Decision J2, consumer-locus argument). Not moved, not renamed, not re-litigated without new evidence.
4. **`model-gateway`.** Closed by AU21 Decision L2 (dissolved into `@hyperidle/shared`). Not a candidate, not reopened. Note J2's own caveat — its ruling leaned on `model-gateway` being a core-api Service, and that Service no longer exists; that is a flag for a *future* WP, explicitly not reopened here.
5. **AU27's scope** — the assistant turn's output/execution de-specialization (Decision K2). Different axis entirely.
6. **Any UI redesign** of the Settings connections / filesystems / agents pages, or the session-activity view. Behavior identical; route/base-URL wiring may change, what the user sees and when does not.
7. **`core-ui`'s internal structure** (whether `packages/web` reorganizes into Service-named folders) — an open question in the AU19 frame, not this WP's.
8. **A third "neutral" composition package.** Composition moves to the Application tier or nowhere.
9. **Data migration as a free move.** Table definitions stay in `packages/db/src/schema.ts`; only ACL-holders change. C3 is the one candidate that may force a genuine schema change, and only with explicit cost stated.

---

## 7. AC alignment

| # | Acceptance criterion (abridged) | How this requirement covers it | Proof shape |
|---|---|---|---|
| 1 | `service_connections` has exactly one Service importer in agent-orchestration; guard-enforced; K1's bake deleted; live add-after-emit test passes | §4 C1 (success stated, bake file named, J6 superseded, sequencing fixed); §2 destination rules (ACL, guard, delete-the-patch); §1 success #3 | A real guard (lint/build) failing on a core-api Service importing `serviceConnections`; an integration test adding a connection after emit / before drain and asserting it provisions at spawn; `resolve-injected-connections-for-agent.ts` absent from the tree |
| 2 | The test is applied with real evidence to `filesystems`' engine and `users`' columns; each gets a documented verdict | §2 (procedure + seam check + widened classes + tie-break + residual rule); §2.1 (re-run proof); §4 C2, C3 | A written verdict per unit with `file:line` + class per site + named effect for any A; §2.1's two out-of-list re-runs are the proof the test is re-applicable |
| 3 | `RegistryFilesystemMounter` relocates if core never operationally exercises it; record/reachability-UI resolved separately | §4 C2 (two independent verdicts; unclassified site floor; J8 bounded, not pre-deciding) | Traced classification of `server-factory.ts:1006`, `filesystem-provisioning.ts:78`, `provisioner.ts:527`; if relocated, the same guard/ACL proof as AC #1 |
| 4 | `agent-orchestration` hosts its own route(s) for session/harness streaming; documented verdict on `WsConnectionHub` | §3 `orchestration-api` (definition + 4 hard rules); §4 C4 (four live verdicts), C5 | `packages/core-api/src/app.ts` no longer imports `./routes/agent-orchestration-sessions-routes.js` (the `app.ts:42` import is gone — a static property, so a lint rule / import guard, not a test); an integration test hitting the orchestration route through the mounted app |
| 5 | Every "relocate" verdict is actually moved in this WP, same rigor as connections | §1 failure shape (verdict-without-move = failure); §2 destination rules; §4 human gate + cross-cutting | Per-verdict: the move landed, its throwaway precedent deleted, its ACL guard added — checked increment by increment, with the founder's confirmation recorded before each build |
| 6 | Settings connections/filesystems/agents pages + session live-activity work identically; zero required frontend behavior changes | §1 success #5; §6 out-of-scope #6; §4 C5 | Three-part, all required: (a) the route-level integration tests for those surfaces stay green against the re-pointed hosting, **re-wired, never weakened or deleted** — anchor: `packages/core-api/src/__tests__/AN1-connections.integration.test.ts`; (b) a Playwright pass over Settings → Connections / Filesystems / Agents **and** the live session-activity view after the split, read as painted output (`plan.md`'s validation scenario 4); (c) the only permitted `packages/web` diff is base-URL / route wiring — provable by a `git diff` confined to the fetch/config layer with zero change to component render logic or user-visible copy. If a component's behavior must change, AC #6 is unmet. |

---

## 8. Required reading (downstream: `/architecture`, `/pipeline`)

- `.pipeline/work/AU26/plan.md` — the spec of record.
- `.pipeline/AU.md` — the AU26 row, the dependency graph, the charter-fixed core domains, and the corrective closure rule (compare against the should-graph, fail on a surviving forbidden edge).
- `.pipeline/work/AU21/architecture.md` — **Decision J**, with this document's status ruling: **J0–J5 and J7 are locked — build them, don't re-derive. J6 is SUPERSEDED (§4 C1). J8 stands, bounded, with its "via the J6 door" clause superseded (§4 C2).** Also **Decision K/K1** (the bake-at-emit patch this WP deletes) and **Decision L** (L2 model-gateway dissolved; L4 realtime → `WsConnectionHub`).
- `docs/architecture/runtime-simplification.md` — the Applications / Layers / Services frame; the colocation rule; Mechanisms 1–3 (Table ACL, Layer boundary, Services-never-import-Services).
- `docs/architecture/connection-model.md` — what a Connection is (held vs. inherited); the definitional basis of J1.
- `docs/architecture/credential-model.md` — "Credentials ≠ Connections"; why `server_credentials` stays core.
- `docs/architecture/as-implemented-domain-architecture.md` — the shipped domain map to diff against.
- `docs/architecture/run-unit-model.md` — the run-unit "workspace" meaning; read before naming anything `Workspace*` (and see §3 for why this document does not).
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` — the target graph every AU review compares against.

### 8.1 Open for architecture — close these, do not inherit them

Five findings from round 2 of the requirement critique are deliberately left at architecture altitude. Each is a **required output of `/architecture`**, not an optional consideration. Inheriting one silently is a review failure.

1. **The class-D-only hole — the test's real remaining weakness (highest priority).** For a unit wired only by a composition root, the site evidence is *inert*: every site is class D, so Step 5 mechanically yields "D-only → relocates" for any such unit, and only Step 0's unaided characterization ("is this about an agent?") stops it. `work-state-push-gateway.ts` proves this is a class, not an edge — it is structurally identical to §2.1's `session-activity-gateway.ts`: same `register…(eventBus, target)` shape returning an unregister closure (`work-state-push-gateway.ts:34-36`), same single non-test site (`server-factory.ts:112` import, `:1122` call, `:1260` dispose), same test-only remainder — and running Steps 3–5 on it produces **relocates**, a verdict against `Work`, which the charter fixes as core. There are ~11 such `export function register…` units in `packages/core-api/src/services/` (`agent-run-admission-reactions`, `work-session-started-reactions`, `work-session-end-reactions`, `routine-run-session-end-reactions`, `assistant-turn-coherence-trigger`, `routine-scheduler-bindings`, the two Port compositions, and the two gateways). **Architecture must amend §2 Step 5** to state that when every site of a unit is class D, site classification yields **no signal** and the verdict rests on the unit's own domain — and must give the evidence bar for that call so it is a traced argument and not a label: *what it subscribes to, whose state the payload is, and who consumes the broadcast*. §2.1 re-run 2's Step 6 already does this informally; promote it into the procedure and re-run the amended Step 5 against `work-state-push-gateway.ts` to prove it now returns "stays" for the right reason. Until this lands, no D-only verdict in this WP is safe to build on.
2. **Narrow §4 C1's sequencing claim.** `§4 C1` says C5's skeleton is the first increment "and C1's J3/J4 land onto it," while its next bullet says J1/J2/J3 are untouched. Both cannot hold: J3 (stand up the SQL-owning Service, rewire `connection-provisioning.ts` in-layer, delete `CoreApiPort.connections`) touches no HTTP surface (`AU21/architecture.md:857`) and has zero dependency on the app skeleton. Only **J4** re-hosts the management surface. `plan.md:30` locks J's four-increment breakdown as build-not-re-derive, so architecture reads this as: **J4 requires the skeleton; J1–J3 are unaffected and may still lead**, preserving `plan.md:32`'s "connections first, largest" intent for the bulk of the work while the no-interim-host rule binds only where it actually applies.
3. **Give the core-api app its two hard rules.** `§3`'s `createCoreApiApp()` subsection states none, yet `§4 C1`'s J6 supersession cites one of them ("a Layer app hosts no route whose query logic another Layer owns") as its third leg, and `orchestration-api` hard rule 1 covers one direction only. Architecture states the symmetric pair explicitly: (1) the core-api app never imports an `agent-orchestration` route module — already AC #4's observable proof, the `app.ts:42` import going away; (2) it hosts no route whose data/query logic an `agent-orchestration` Service owns — the third leg of the J6 supersession. Both are load-bearing already; they are just not written down.
4. **Re-ground J8's status on `plan.md:46`, not on a reading of J8's silence.** `§4 C2` says J8 "declined to touch" the `filesystems` record. `AU21/architecture.md:850` actually ends "…otherwise untouched **(F2 stands for filesystems)**" — a parenthetical that *affirms* F2's stays-ruling rather than declining to decide. The outcome is unchanged and still right (C2 opens the record's verdict), but on the ground §9 item 6 already establishes: `plan.md:46` is the later spec of record and explicitly re-opens it, and `:46` governs. Architecture uses that ground. A mischaracterised lock status is exactly what makes a later pass re-derive the wrong thing.
5. **Operationalize "no logic beyond narrowing, forwarding, or reshaping" against defaulted and synthesized fields.** The flagship seam sits on the line: `harnessRegistrationMeta` (`harness-capability-read-model.ts:90-104`) synthesizes `maxConcurrent: 1`, a constant invented core-side and present in no source descriptor, and `harnessCapabilitiesForType:85` supplies a default (`returnEnforcement ?? "none"`). Read strictly, either could be called a "decision" and fail the Step 2 gate — which would flip re-run 1 from "seam" to B-only → relocates and drag `/api/harnesses`, `/api/workers`, agent-profile and the team roster across the boundary. Architecture states plainly whether a defaulted or synthesized field breaks the seam gate, and re-confirms §2.1 re-run 1's verdict under that ruling.

---

## 9. Drift and contradictions found (verified at `75d85687`)

Recorded here, not patched into `plan.md` — none of these changes the plan's scope, ACs, or intent. `plan.md` is **unchanged**.

1. **"`agent-orchestration` hosts ZERO of its own HTTP/WS routes… and no `hono` dependency in its `package.json` yet" — partly wrong.** `packages/agent-orchestration/run-orchestration/package.json:18` already declares `"hono": "^4.12.27"`, and `run-orchestration/src/worker-ingress.ts` already *owns a route handler*: `registerWorkerWsRoute` (`:239-279`) calls `app.get(` at `:259` to mount `/ws/worker`, wired via `start-runtime.ts:355` → `server-factory.ts:1189` → `app.ts:415`. The literal checks in the plan hold (no `*route*`-named file, no `new Hono()` in the Layer), but the accurate statement is: **orchestration already writes route handlers; it just doesn't own an app — core-api hands it one.** This strengthens the WP's premise (inverted injection is the smell) and gives architecture a conversion precedent instead of a blank slate.
2. **`users` agent-execution columns — one missing.** `modelTierPreference` (`schema.ts:78`) is a sixth column of identical shape, absent from `plan.md`'s five-name enumeration. In scope per §4 C3. `systemPrompt`/`systemPromptPath`/`skills`/`status` are adjacent and need an explicit in-or-out call.
3. **API-split blast radius — `plan.md:32`'s enumeration is both incomplete and partly wrong.** Verified counts in §4 C5. The 11 `createApp()` integration tests are exact. **Missing from the plan:** 8 further test files calling `createServer(`, and the two shipped test-helper sources `core-api/src/test-utils.ts` / `test-fixtures.ts`. **Wrong in the plan:** `packages/eval` calls neither `createApp` nor `createServer` — it deep-subpath-imports `@hyperidle/core-api/session` and `/routines`, so it is unaffected by the split provided those subpath exports survive.
4. **Line drift (cosmetic).** `new RegistryFilesystemMounter` is at `server-factory.ts:1006`, not `:1027`. `WsConnectionHub` at `:1110` is correct. `remote-server/src/index.ts` is 51 lines, `desktop/src/boot-server.ts` 70 (plan said 52/71).
5. **Confirmed unchanged, load-bearing:** core-api never calls `.mount()`/`.captureBack()` — only `filesystem-provisioning.ts:78` and `provisioner.ts:527` do. `app.ts:42` still imports `createAgentOrchestrationSessionsRoutes` and mounts it at `/agent-orchestration` (`app.ts:556-561`). K1's bake lives at `packages/core-api/connections/src/resolve-injected-connections-for-agent.ts`, wired from `routine-scheduler-bindings.ts:175` and `task-run-resolver-bindings.ts:35`. `packages/core-api/settings/src/plugin-configuration.ts:727` is a **second** non-test consumer of connections data (`listByAuthSource(db, "mcp")`, injected) — architecture must classify it under §2 before claiming "exactly one Service importer." `routes/filesystems.ts:6` still type-imports `ServiceConnectionResolver` from `@hyperidle/connections` (J8's premise, intact).
6. **`plan.md` contradicts itself on the filesystem record — named, and one reading chosen.** `plan.md:30` says the record + reachability-probe UI "stay core **regardless**, since those are human-administered configuration data"; `plan.md:46` says the record's status is "not a foregone 'stays' conclusion either way." **`:46` governs.** `:30`'s rationale is a disqualified rationalization under §2 (it is the "human-administered → therefore core" argument, which the widened class B explicitly does *not* support), and the WP's whole point is evidence over narrative. §4 C2 therefore opens the record's verdict. This is a deviation from one sentence of the plan, taken deliberately and recorded here.
7. **Decision J6 — superseded, not deferred.** Full reasoning and consequences in §4 C1. Consequence for the plan's prose: `plan.md:32`'s "connections first (locked, largest), then … the API split" sequencing hint is **inverted** — C5's app skeleton lands first so C1's routes have a legal host. `plan.md`'s ACs, scope, and constraints are unaffected; only its ordering suggestion is superseded.
8. **Decision J8 — stands, bounded, one clause superseded.** See §4 C2.
9. **`workspace-api` rejected as a noun.** An earlier draft minted it. §3 records the rejection and its reasoning; the artifact is named by the symbol it already has, `createCoreApiApp()`. Consequence for `plan.md`: its AC #4 phrase "stays as `workspace-api`'s own transport" reads as "stays as the core-api app's own transport." Same meaning, one fewer colliding noun. `orchestration-api` is kept — it is net-new and collides with nothing.

No contradiction found between `plan.md` and `docs/` ground truth. The one contradiction found is `plan.md` against itself (item 6), and the reading that governs is stated.

---

## 10. Revision log — round 2 disposition

| Finding | Disposition |
|---|---|
| **C-1** test not re-applicable | **Fixed and re-proven.** §2 gains Step 0 (applicability), Step 2 (unit-level seam check, decisive), a sharpened class A (requires a *named effect*, not appearance in a response), a widened class B (administration **or** display), an explicit tie-break, and a residual rule banning ad-hoc classes. §2.1 records the test **re-run against `harness-capability-read-model.ts`** (the exact unit that broke it — now decisive via the seam check, and all 24 sites classify with zero residual) **and a second out-of-list candidate, `session-activity-gateway.ts`** (decisive: D-only → relocates, recorded as a found candidate). |
| **C-2** J6 contradiction | **Resolved by supersession.** §4 C1 declares J6 superseded, with three-part reasoning, and states the consequences (no `AgentOrchestrationPort` connections family; J7 stands; sequencing inverted so C5 lands first). §8 restates the lock status. **J8** ruled in §4 C2: stands, precisely bounded to the resolver's execution locus, one clause superseded; it does not pre-decide C2. |
| **W-1** `workspace-api` | **Accepted — noun dropped.** §3 rejects it with reasoning and keeps the rules attached to `createCoreApiApp()`. `orchestration-api` kept; the asymmetry is justified in §3. Guide draft (§5) de-glossed; the disambiguation note is gone. |
| **W-2** blast radius | **Fixed.** §4 C5 carries a verified table; §9 item 3 records that `plan.md` was both incomplete (8 `createServer` test files + 2 helper sources) and wrong (eval). |
| **W-3** Port read-only | **Fixed.** Added to §2 destination rules (with the shipped `agent-orchestration-port.ts:22-23` citation), §3 `orchestration-api` hard rule 4, and §4 C1's consequences. |
| **W-4** human gate on verdicts | **Fixed.** §4 opens with the gate as a hard sequencing constraint, distinguishing it from `DOC-CLASS`'s gate on this document. Echoed in §1 success #4 and §7 AC #5. |
| **W-5** AC #6 proof | **Fixed.** §7 AC #6 now names a three-part proof (re-wired route integration tests with a verified anchor, a Playwright painted-output pass, a bounded `packages/web` diff). |
| **W-6** J8 + overstated no-contradiction claim | **Fixed.** J8 ruled in §4 C2. §9 item 6 names `plan.md`'s self-contradiction (`:30` vs `:46`) and states which reading governs and why. §9's closing claim corrected. |
| **W-7** pre-supplied conclusions | **Fixed.** §4 C2 and C4 now list sites without classes and say architecture classifies them. |
| **N-1** candidate count | **Fixed.** §4 opens with "five candidates, four open verdicts" and says why. |
| **N-2** line cite | **Fixed.** `worker-ingress.ts:239-279`, `app.get(` at `:259` (§4 C5, §9 item 1). |
| **N-3** charter constraint | **Fixed.** Promoted into the test itself as §2 Step 0, and restated as §6 out-of-scope #2, so the test cannot mechanically rule against a charter-fixed domain. |

---

## 11. Revision log — round 3 disposition (round-2 critique, 85/100 PASS)

Surgical pass. Everything round 2 confirmed as fixed is unchanged.

| Finding | Disposition |
|---|---|
| **W-1** "follows its readers" undefined when readers straddle | **Fixed in §2 Step 2.** Added the straddle rule: the seam **sinks to `@hyperidle/shared`**, each side injecting its own handle. Duplication is rejected (two copies of one contract drift); stay-on-the-majority-side-and-reach-across is banned outright, because that import *is* the cross-Layer read `orchestration-api` hard rule 2 and AU21's zero-read boundary forbid. Sinking is always available to a genuine seam by Step 2's own criteria; a unit that cannot sink was never a seam. Applied in §2.1 re-run 1 to the flagship case (`connections.ts:204` moves, `agent-profile`/`teams-routes`/`agents`/`users` stay → sinks), with the `@hyperidle/shared`-has-no-`@hyperidle`-deps cycle constraint named. |
| **W-4** deferral clause contradicts AC #5 | **Fixed.** §2.1's "or is deferred as a named follow-up" deleted — `session-activity-gateway.ts` reached **relocate**, so AC #5 binds and it rides C5 in this WP. §6 out-of-scope #1's parenthetical re-cut to match: what is out of scope is the *sweep*, never the execution of a verdict already reached. |
| **W-2** class-D-only site evidence is inert | **Carried to `/architecture` as required output — §8.1 item 1**, with the `work-state-push-gateway.ts` counter-example traced at HEAD (`:34-36`, `server-factory.ts:112/1122/1260`) and the ~11-unit class enumerated. Architecture must amend Step 5 and re-run it to prove the amended rule returns "stays" for the right reason. |
| **W-3** C1's sequencing over-reaches into J1–J3 | **Carried — §8.1 item 2.** J4 requires the skeleton; J1–J3 are unaffected and may lead. |
| **W-5** core-api app carries zero hard rules | **Carried — §8.1 item 3.** The symmetric pair to be stated by architecture; both already load-bearing (AC #4's proof; the J6 supersession's third leg). |
| **N-1** J8 "declined to touch" is self-serving | **Carried — §8.1 item 4.** Outcome unchanged; re-grounded on `plan.md:46` (per §9 item 6) rather than on a reading of J8's silence. |
| **N-2** seam gate vs. defaulted / synthesized fields | **Carried — §8.1 item 5.** Architecture rules explicitly whether `maxConcurrent: 1` and `returnEnforcement ?? "none"` break the gate, and re-confirms re-run 1 under that ruling. |

