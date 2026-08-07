# Kernel ↔ Strategy split

> **ARCHIVED.** This describes an architecture that no longer exists — there is no Kernel/Strategy boundary, no Strategy port, and neither `@hyperidle/fabric` nor `@hyperidle/strategy-minimal` is in the tree. Kept for history only. The enforced account of what may cross which boundary is [`governance/README.md`](../../governance/README.md).

**Status (historical):** Authoritative (founder-aligned 2026-06-14; boundary **refined** 2026-06-15 — see §2a "Agents are knowledge"). This document is the ground truth for the kernel/strategy boundary and the harness-engineering vocabulary. Where another doc disagrees with this one on the boundary or the nouns, this one wins.

Originating research: `plans/AK/kernel-strategy-usp-analysis.md`, `plans/AK/concept.md` (both tracked under `plans/AK/`). Build track: `.pipeline/work-packages/TRACK-AK.md`.

---

## 1. The boundary (functional, not stability)

The cut is by **function**, not by how often a part changes (the stable/volatile criterion is rejected).

- **Kernel = the application itself, including the agent-running runtime contract.** Conversations, work planning & review, knowledge **editing**, **user management — humans and agents alike are users** (every agent has a Kernel user-id that a session attaches to), and everything required to *govern* agent execution: the **harness contract/registry** (incl. tools, Skills, hooks), the **sandbox**, the **session**, **cost**, admission, and teardown. Concrete harness implementations are **harness extensions** registered with the Kernel, not Kernel-core provider logic; HyperIdle's own `builtin` runtime is a first-party bundled API-gateway/direct-key extension for OpenRouter and similar model gateways. The Kernel also owns the **interaction-surface events** — `bet committed`, `message appended`, `work to decompose` — actions triggered by a human or by an agent sandbox; it *emits* them, and a Strategy may subscribe. The Kernel holds **no agent definitions, no roster, and no knowledge**: it spawns an empty sandbox and runs whatever agent the Strategy handed it on an admitted harness. A Kernel with a no-op Strategy plus at least one registered harness extension is a complete, usable application.
- **Strategy = the knowledge/context layer.** It owns **what an agent knows** and **how knowledge compounds over time** — nothing else. Crucially, *who an agent is* is part of *what it knows*: the **AGENTS.md is a knowledge file**, so the agent **roster** (which agents exist), which agents are **scaffolded into a team**, **which agent fills a given session** (selection/assignment), and how each AGENTS.md **evolves** are all Strategy. This is not a widening of the layer — it is recognizing that personas *are* knowledge. This is the genuinely fast-moving part of the agentic space (it changes monthly), which is why it is swappable.

**Test** for "is X Kernel or Strategy?": *Is X about running the company / running agents (Kernel), or about what agents know and how that knowledge improves itself (Strategy)?*

Consequence: **knowledge *editing* is Kernel** (a person editing a doc is an app feature); **knowledge *management* is Strategy** (the automated organizing / scoring / propagation / improvement).

---

## 2. Strategy — three responsibilities and the port

Strategy is the full knowledge-management loop:

1. **Context assembly (in).** At session start, decide what knowledge + memory to assemble into the agent's context window. (Industry: *context assembly* under *context engineering*. Today: `assembleContext` + `assemblePrompt`.)
2. **Learning ingestion (out).** After a session, capture/score what was produced and write it back into the knowledge base.
3. **Autonomous knowledge work (background).** Routines and Strategy-spawned agents that run *across the whole knowledge base* to improve it over time — the "improvement" class the industry is circling (Claude's *dreaming*, Hermes' *automatic skill generation*). In HyperIdle this is realised by the **Fabric's deeply-researched knowledge-management design (out of scope to change).** These run on the Kernel's agent-running runtime but are *directed by* the Strategy.

The **Strategy Port** is the surface the Kernel exposes for (1) and (2); responsibility (3) is the Strategy operating autonomously (subscribing to events, scheduling routines, spawning its own agents) — the Kernel does not call it; it runs alongside.

- **Minimal (reference) Strategy** = all three inert: context assembly returns passthrough/empty (the agent runs on its AGENTS.md + task only), ingestion is a no-op, no routines, no spawned agents, no improvement. It proves the Kernel works in isolation and is the template a contributor copies. Not a recommended end-user experience.
- **Fabric** = the current rich Strategy (all of `packages/fabric/src/services/*`). **One** implementation of the Strategy role — not *the* role. Its knowledge-management design is settled; the only requirement on it through this split is **preservation**: it must keep working exactly as intended behind the boundary. *A Strategy Port the Fabric cannot fully satisfy is the wrong port.*

**Hard rules:** exactly one active Strategy at a time; the Kernel calls the port, never a concrete Strategy; the port must be satisfiable by a no-op (Minimal) implementation; **cost enforcement stays Kernel-side**, not in the port.

---

## 2a. Refinement — agents are knowledge (founder-aligned 2026-06-15)

The original boundary put "running a PM agent" and agent selection on the Kernel side and treated decomposition as "never a kernel-vs-strategy question" (§4 below, as-built AK3). **That is corrected here.** The sharpening: *who an agent is* is knowledge, so the parts of work-organization that decide **which agent** and **with what knowledge** belong to the **Strategy**, while the **Kernel** keeps the mechanism and the trigger.

**The clean three-way cut of any "spawn an agent to do work" flow:**

| Piece | Owner | Why |
|---|---|---|
| **Trigger** — an interaction surface fires ("work to decompose", "message arrived") | **Kernel** | It's app lifecycle — a human or a sandbox acted. The Kernel *emits the event*; it does not decide the response. |
| **Selection** — which agent (which AGENTS.md), scaffolded into which team, with what context | **Strategy** | The AGENTS.md is a knowledge file; "who knows what" is the Strategy's whole job. The Minimal Strategy returns a single plain agent; the Fabric returns a knowledge-matched one. |
| **Execution** — spawn the sandbox, attach the session to the agent's user-id, run it, meter cost | **Kernel** | Pure mechanism. The Kernel never inspects the AGENTS.md; it runs whatever the Strategy handed it. |

**The user-id seam (how selection and execution meet).** Agents are Kernel users (§1). When the Kernel emits "decompose for team T", the active Strategy answers with *which agent*; that answer must **resolve to a Kernel user-id** so the Kernel can attach the session to the right user. The port carries the selection request out and the chosen agent (→ user-id) back; the Kernel owns the user-id table, the Strategy owns the choice.

**Consequences:**
- **The Strategy owns the agent roster and team-scaffolding**, not the Kernel. The Kernel retains the *user identity* (id/account) for every agent; the Strategy owns *who that agent is* (AGENTS.md, persona, skills) and *which agents populate a team*.
- **Decomposition is a Strategy response to a Kernel event**, not a Kernel-hardcoded PM. The Kernel emits `work to decompose`; the active Strategy handles it. The Fabric decomposes richly (a PM agent + knowledge-matched assignment); the Minimal Strategy does the trivial thing (a single plain agent / 1:1).
- **AK3-as-built (kernel-side default PM, round-robin assignment) becomes the Minimal Strategy's default fallback** — the simplest possible response, not the Kernel's permanent decomposition path.
- This matches the doc's own event pattern for Strategy responsibility 3 (§2: the Strategy "subscribes to events… the Kernel does not call it; it runs alongside"). Decomposition and selection join that pattern.

**This is a class of surfaces, not just decomposition.** A codebase sweep (`plans/AK/agent-decision-surfaces.md`, 2026-06-15) found the same "Kernel triggers / Strategy decides the agent + knowledge" shape across: **team scaffolding** (creating a team's default agents), **adding an agent** to a team, **Assistant creation** at user registration, **factory bootstrap** (system + facilitator/strategy agents), **bet decomposition** (AK3), **task→session dispatch**, the **Assistant turn**, and **routine delegation**. Two structural facts made the seam absent at the time of the sweep:

- **Entity creation emitted no events.** Team / agent / user creation happened *inline in routes* — there was no `team_created` / `agent_added` / `user_created` event — so there was no place for a Strategy to attach and own "what agent gets created." The "what" (roster, personas, the assistant's system prompt) was hard-coded Kernel-side.
- **Selection was knowledge-blind.** Which agent took a unit of work was role-eligibility + round-robin + pre-set owner, with zero Strategy/knowledge input. The only skill-aware selection anywhere was routine delegation (`findDelegate`).

So AK6's first job was to **emit the creation triggers as events / a creation seam** (without it there is nothing to own), and AK7's to **make selection consult the Strategy** (generalizing the lone `findDelegate` precedent).

> **Status:** All three structural gaps are closed. AK6 (§3a) — `team_created` / `agent_added` / `user_created` events + `scaffoldAgents`. AK7 (§3b) — all bet-side selection through `selectAgent` via `selectOwner`; routine delegation through `selectAgentFabric`. AK8 (§3c, shipped 2026-06-22) — `runBetDecomposition` calls `getActiveStrategy().decomposeBet(...)`; Kernel-side PM turn is the Minimal Strategy's default fallback.

---

## 3. As-built — AK2 (shipped 2026-06-15)

The seam described in §2 is now real in code. Pre-AK2, `session-provisioning.ts` and `session-lifecycle.ts` hard-imported `assembleContext` and `startWatcher` directly from `@hyperidle/fabric`. AK2 closed that gap.

### The Strategy Port contract

Defined in `packages/shared/src/strategy-port.ts` (exported from `@hyperidle/shared`). AK2 shipped the first two methods; later work packages grew the port to **six**:

```ts
interface Strategy<TDb> {
  assembleContext(req: ContextAssemblyRequest<TDb>): Promise<ContextAssemblyOutcome>;
  beginLearningIngestion(req: IngestionRequest<TDb>): IngestionHandle;
  scaffoldAgents(req: ScaffoldRequest<TDb>): Promise<readonly AgentScaffoldSpec[]>;   // AK6 — §3a
  selectAgent(req: SelectAgentRequest<TDb>): Promise<SelectAgentOutcome>;            // AK7 — §3b
  decomposeBet(req: DecomposeBetRequest<TDb>): Promise<DecompositionPlan>;           // AK8 — §3c
  formAssistant(req: AssistantFormationRequest<TDb>): Promise<AssistantFormation>;   // AR4b — §3d
}
```

`TDb` is a type parameter, not a concrete import — `@hyperidle/shared` stays db-agnostic (importing `HyperIdleDb` into shared would invert the `db → shared` dependency direction). The Kernel binds `TDb = HyperIdleDb` at the registry boundary.

**`assembleContext`** — called at P6 (session admission). The Strategy populates the sandbox's `context/`, `knowledge/`, `work/` directories and writes `.fabric/manifest.json`. The Kernel does not read assembled content — the agent reads it from disk.

**`beginLearningIngestion`** — called at P7 (immediately after context assembly). Returns an `IngestionHandle`. The Kernel disposes the handle on every teardown path (complete / crash / budget_exhausted). `dispose()` must not throw — best-effort flush.

**Responsibility 3 (background knowledge work) is NOT in the port.** The Strategy operates this autonomously via `bootstrapFabric` at boot. The Kernel does not call it.

**Cost enforcement stays Kernel-side.** `checkCostCap`, `recordCostAndCheck`, `scaleForCurrency` are direct Kernel imports and never cross the port.

### Strategy registry

`packages/server/src/services/strategy-registry.ts` — a lean module-scope variable, same idiom as `provision-registry.ts`. Four exports: `setActiveStrategy`, `getActiveStrategy`, `getActiveStrategyOrNull` (test fixtures), `clearActiveStrategy` (test teardown only).

`getActiveStrategy()` throws immediately if no Strategy is registered — a missing registration is a boot bug, not a recoverable state. Boot always calls `setActiveStrategy` exactly once.

### Boot wiring (composition root)

`packages/server/src/server-factory.ts` registers the Fabric as the default:

```ts
setActiveStrategy(fabricStrategy);  // default; swap this line to select a different Strategy
```

This is the only place in Kernel code that may import a concrete Strategy. The ESLint guard (below) enforces this.

### Fabric adapter (no behaviour change)

`packages/fabric/src/fabric-strategy.ts` — a thin adapter that delegates to the existing `assembleContext` and `startWatcher` functions unchanged. The only translation: `req.teamId → productId` in the Fabric's config (a field-rename from the AK1 vocabulary rollout). The underlying Fabric functions and all Fabric-internal tests are untouched.

### Minimal reference Strategy

`packages/strategy-minimal` — a real workspace package (`@hyperidle/strategy-minimal`) that ships with a documented README and serves as the contributor template.

`assembleContext`: creates empty `context/`, `knowledge/`, `work/`, `.fabric/` scaffold dirs + writes an empty-items `manifest.json`. Returns `{ itemCount: 0, durationMs: 0 }`. No knowledge injection.

`beginLearningIngestion`: returns a no-op `IngestionHandle`. `dispose()` does nothing and never throws.

Background responsibility: absent. No bootstrap, no routines, no spawned agents.

The scaffold and empty manifest are written even though no context is assembled — the harness and crash post-mortems require them to exist.

### ESLint static guard (AC4)

`eslint.config.ts` scopes a `no-restricted-imports` rule to `packages/server/src/**`, excluding the composition root (`server-factory.ts`) and test files. The guard bans:

- All of `@hyperidle/strategy-minimal` (full package ban from Kernel source)
- `assembleContext`, `startWatcher`, `FileWatcher`, `FileWatcherConfig` from `@hyperidle/fabric`

This enforces "the Kernel imports no concrete Strategy" statically. Both `session-provisioning.ts` and `session-lifecycle.ts` (the two independent provisioning paths) are clean against this guard.

### What AK2 does NOT move (deferred to AK9)

Cost enforcement, context-assembly, and session-context DB reads (`cost-cap.ts`, `context-assembly-prompt.ts`, `session-context.ts`) are conceptually Kernel but **physically still live in `packages/fabric`**. The Kernel imports them directly — this is not banned by the AK2 guard (those symbols are not behind the port). Moving them out of `packages/fabric` into `packages/server` or a new `packages/kernel` is the scope of **AK9** (Kernel package extraction, registered in `.pipeline/work-packages/TRACK-AK.md`; AK9's audit found the mislocated Kernel set is larger than these three files). The runtime seam is real; physical packaging is pending.

---

## 3a. As-built — AK6 (shipped 2026-06-16): the creation seam

§2a identified "entity creation emits no events" as the structural gap that kept roster/persona ownership Kernel-side. AK6 closes that gap for all agent-bearing creation surfaces.

### What changed

Before AK6, every creation surface — `POST /api/teams`, `create_team` tool, `add_agent` tool, `POST /api/users` (assistant), and factory bootstrap — hard-coded which agents to create and what persona each carried. The Kernel owned both composition (who exists) and content (what they know). §2a declared that wrong; AK6 makes the split real.

After AK6:
- **Roster composition and persona content are Strategy-owned.** The Kernel holds only the stable `users.id` (agent user-id) every session attaches to. It emits a creation trigger; the active Strategy decides which agents to create and what each agent's AGENTS.md / system prompt carries.
- **Three server-side creation surfaces route through the port.** Team scaffold, add-agent, and user-assistant creation all call `getActiveStrategy().scaffoldAgents(req)` and then persist the returned specs via one Kernel writer (`persistScaffoldedAgents`).
- **Factory bootstrap uses a value injection seam, not the port.** Factory bootstrap (`applyFactoryBootstrap`) runs at the leaf/desktop layer with no server or Strategy registry — on four paths (desktop, and three `@hyperidle/db` leaf CLIs). It cannot call the port. Instead, the *roster content* is injected as a `FactoryRosterSpec` value, defaulting to the Fabric's roster. The four boot paths call `applyFactoryBootstrap(db)` unchanged; a server choosing Minimal passes `minimalFactoryRoster` explicitly. This is the **bootstrap-swap bound** — a bounded exception to the port-only pattern, documented in code via `@lore AK6`.

### The Strategy Port: third method

`scaffoldAgents` is added to the `Strategy<TDb>` interface in `packages/shared/src/strategy-port.ts`:

```ts
scaffoldAgents(req: ScaffoldRequest<TDb>): Promise<readonly AgentScaffoldSpec[]>;
```

`ScaffoldRequest` carries trigger context (which creation surface fired, team id, team name, functions, role, name, owner user id/name). It never carries an agent definition — the Kernel knows the *occasion*, the Strategy decides the *response*.

`AgentScaffoldSpec` carries `{ role, name, agentCategory, systemPrompt, idHint? }`. These are the knowledge fields — the Strategy's "who." The Kernel attaches all mechanism fields (`kind:"ai"`, `status`, `teamId`, `harnessType`, `modelId`, `modelProvider`, `maxConcurrentSessions`) inside `persistScaffoldedAgents`. The spec carries **no harness, model, or cost field** — the closure contract.

**Trigger set is closed:** `"team_scaffold" | "agent_added" | "user_assistant"`. Adding a new creation surface requires adding to this union (and to the `KernelEvent` union).

### The Kernel persist helper: single writer

`packages/server/src/services/scaffold-agents.ts` exports `persistScaffoldedAgents(db, teamMembersId, specs)`. It is the only place in Kernel code that inserts `users` rows for agents. It:
- Assigns the final `users.id` — honoring an `idHint` when the id is free and the prefix is not in the deny-set (`system:` namespace is never assignable); collision or deny-prefix → fresh UUID.
- The `ast-${userId}` (per-user Assistant) and `seed-agent-*` (factory) prefixes are legitimate Strategy hints and are honored.
- Attaches Kernel-owned fields (`kind`, `status`, `harnessType`, `modelId`, `modelProvider`, `maxConcurrentSessions`).
- Returns `{ agentIds, leadAgentId }`.

### Creation events

Three events are added to the `KernelEvent` union in `packages/shared/src/events.ts`:

| Event | Emitted after |
|---|---|
| `team_created` | Team scaffold — all agent rows persisted |
| `agent_added` | Add-agent — the new agent row persisted |
| `user_created` | Human user + their Assistant both persisted |

Events are emitted **post-persist** (the agent ids in the payload are real). They are for async subscribers (AK7/AK8/audit) and do NOT drive persistence — persistence is the synchronous `scaffoldAgents` → `persistScaffoldedAgents` call inside the route. All four creation surfaces (three HTTP routes + the `create_team` / `add_agent` tools) emit their event.

### Factory-roster injection (`@hyperidle/shared`)

`packages/shared/src/factory-roster.ts` exports:

```ts
interface FactoryRosterSpec { facilitators: readonly {...}[]; systemAssistant: {...} | null; }
const defaultFactoryRoster: FactoryRosterSpec;   // Fabric's roster — full facilitator set
const minimalFactoryRoster: FactoryRosterSpec;   // { facilitators: [], systemAssistant: null }
```

`applyFactoryBootstrap(db, roster: FactoryRosterSpec = defaultFactoryRoster)` reads `roster.facilitators` and `roster.systemAssistant` to decide which `seed-agent-*` rows to write. Infrastructure rows (`system:propagation`, `factorySettings`, `system_template:*`, `seed-ki-1`) are db-owned infra and written unconditionally.

### Strategy behavior: Minimal vs Fabric

| Surface | Minimal | Fabric |
|---|---|---|
| Team scaffold | 1 plain builder agent, `systemPrompt: null` | Today's full role roster, template-sourced `systemPrompt` — unchanged |
| Add agent | 1 plain agent for the given role, `systemPrompt: null` | 1 template-sourced agent |
| User assistant | 1 plain assistant, `systemPrompt: null`, `idHint: ast-${userId}` | 1 assistant with the Fabric persona, same `ast-` id hint |
| Factory bootstrap (value seam) | `minimalFactoryRoster` — no facilitators, no system-assistant | `defaultFactoryRoster` — all `seed-agent-*` rows unchanged |

### Static guard (T10)

Two ESLint mechanisms in `eslint.config.ts` enforce that no Kernel creation surface re-acquires persona/roster ownership:
1. `no-restricted-imports` — bans `defaultRoster` import in Kernel creation routes and tools. `defaultRoster` may only be imported by the Fabric Strategy.
2. `no-restricted-syntax` — bans a reintroduced inline persona/system-prompt constant or roster literal in Kernel creation source files. Message: "Kernel hard-codes no persona — persona/system-prompt content is Strategy-owned (AK6 hard-rule #1)."

### What AK6 does NOT move (deferred to AK7/AK8)

Selection — which *existing* agent takes a unit of work — is moved by AK7 (below). AK8 moves bet decomposition's *trigger* from the Kernel-side PM path to an event the active Strategy handles. AK6 covers creation only.

---

## 3b. As-built — AK7 (shipped 2026-06-22): the selection seam

§2a identified "selection is knowledge-blind" as the second structural gap — which agent takes a unit of work was determined by Kernel-side role eligibility + round-robin with zero Strategy input. AK7 closes that gap: every selection surface now routes through a fourth Strategy Port method, and the Kernel emits an observable occasion event before delegating the choice.

### What changed

Before AK7, `bet-decomposition.ts` computed `ownerAgentId` inline (exact role-match then `eligible[i % eligible.length]`), and the routine scheduler called `findDelegate` (the only knowledge-aware selector) directly. Neither consulted the Strategy for *who* takes the work.

After AK7:
- **The selection decision is Strategy-owned.** The Kernel enumerates eligible candidates (mechanism: a roster query) and asks the active Strategy to pick. The Strategy returns a `users.id`; the Kernel resolves and validates it; the existing dispatch path continues unchanged.
- **`work_selection_requested` is emitted at every bet-side selection point.** Observable occasion for audit and future async subscribers. The selection answer arrives via the synchronous port call, not a subscriber reply — event + port call is the settled hybrid (concept §1, architecture §1).
- **Routine delegation routes through the seam method.** `findDelegate`'s body moves to the Fabric's `selectAgentFabric` under the `routine_delegate` surface; the call site in `routine-scheduler.ts` swaps to `selectAgentFabric({ surface: "routine_delegate", … })`. Behaviour is byte-identical; no `work_selection_requested` event for this surface (routine delegation is Fabric-internal, out of the Kernel AC1 scope).

### The Strategy Port: fourth method

`selectAgent` is added to the `Strategy<TDb>` interface in `packages/shared/src/strategy-port.ts`:

```ts
selectAgent(req: SelectAgentRequest<TDb>): Promise<SelectAgentOutcome>;
```

`SelectAgentRequest` carries the **occasion** (which surface, which team, which candidates the Kernel enumerated, a role hint, the loop spread index, and for `routine_delegate`: `excludeAgentId` / `skillId`). It never carries an agent identity — choosing the agent is exactly what it delegates. `SelectAgentOutcome` is `{ agentId: string | null }`.

**Surface set is closed:** `"bet_task" | "bet_decomposer" | "routine_delegate"`. Adding a surface adds to this union.

**Key design choices:**
- **Option A (Kernel enumerates `bet_*` candidates).** For `bet_task` and `bet_decomposer`, the Kernel computes the eligible team roster (mechanism: active, AI, `category='team'`, ordered by `users.id` for deterministic spread) and passes it as `candidates`. The Strategy picks. This keeps the §2a cut exact: Kernel enumerates (mechanism), Strategy decides (knowledge). Candidates carry `role` only — no `systemPrompt`, no WIP count — the Kernel never reads a persona.
- **`routine_delegate` carved out.** The routine call site has no `teamId`; `findDelegate`'s population is system-wide-by-skill in `userSkills` insertion order — a different set and a different order than the `bet_*` team roster. Routing it through the `bet_*` enumeration would drop delegates and reorder selection silently. The Fabric's `selectAgent` ignores `candidates` for this surface and runs the verbatim `userSkills`-scoped query itself. The seam (one method) is shared; the candidate source is surface-specific by design.
- **`spreadIndex` on `bet_task`.** The loop index `i` is passed in so the Fabric's `bet_task` branch can reproduce the exact `candidates[i % len]` round-robin spread on the role-mismatch branch. Without it, all null-role tasks collapse to `candidates[0]` — a silent regression.

### The Kernel selection helper: `selectOwner`

`packages/server/src/services/select-agent.ts` exports `selectOwner(deps, occasion)` — the **single Kernel caller** of `getActiveStrategy().selectAgent`. Every `bet_*` Kernel surface calls it; `routine_delegate` does not (it is Fabric-internal and calls `selectAgentFabric` directly).

Steps inside `selectOwner`:
1. `enumerateTeamCandidates(db, teamId)` — the `bet_*` team roster query (`role` only, `orderBy(users.id)`, no WIP join).
2. Emit `work_selection_requested` (pre-decision, observable).
3. `getActiveStrategy().selectAgent(req)` — the decision.
4. Load-and-validate the returned `agentId`: if null, missing row, `kind !== "ai"`, or `status !== "active"` → return null. Off-team-but-valid → returned as-is. **This is the unattachable-session guard** (concept §3): selection can never produce an unattachable session; failure surfaces as "no agent available," identical to the pre-AK7 empty-eligible-list behaviour.

### Selection surfaces wired (as-built AK7)

| Surface | Before AK7 | After AK7 |
|---|---|---|
| `bet_task` per-task owner (`insertProposedBetTasks`) | `eligible[i % eligible.length]` inline | `selectOwner({ surface: 'bet_task', spreadIndex: i })` |
| `bet_decomposer` PM pick (`runBetDecomposition`) | `eligible.find(role==='product_manager') ?? eligible[0]` inline | `selectOwner({ surface: 'bet_decomposer', roleHint: 'product_manager' })` — **superseded by AK8**: this call site was removed; `bet_decomposer` has no production caller (see §3c) |
| `routine_delegate` (`routine-scheduler.ts`) | `findDelegate(db, skillId, ownerAgentId)` directly | `selectAgentFabric({ surface: 'routine_delegate', … })` — same query, byte-identical |

### Strategy behaviour: Minimal vs Fabric

| Surface | Minimal | Fabric |
|---|---|---|
| `bet_task` | `candidates[0]` (honors `roleHint` if a candidate matches) | Exact role-match if `roleHint` set; else `candidates[spreadIndex % len]` — byte-identical to AK3 round-robin |
| `bet_decomposer` | First PM candidate, else `candidates[0]` | Role-match `'product_manager'`, else `candidates[0]` |
| `routine_delegate` | `null` (candidates empty; no delegation knowledge in Minimal) | `findDelegate`'s `userSkills`-scoped query verbatim (relocated into `agent-selection.ts`) |

### Static guards

`eslint.config.ts` adds two rules:
1. **AC1 absence guard** — bans `% <expr>.length` (round-robin pattern) across `packages/server/src/services/**`, allowlisting only `select-agent.ts`. Proven non-vacuous: fires on `arr[i%len]` in `bet-decomposition.ts` if reintroduced.
2. **AC2 persona guard** — bans `systemPrompt` / `AGENTS.md` literal reads inside `select-agent.ts`. The Kernel's selection helper must never inspect a persona.

### What AK7 does NOT move (done by AK8)

**AK8** rewires the *decomposition trigger* — moving `runBetDecomposition`'s subscriber from the Kernel-side `registerBetDecomposition` handler to "a Strategy response to a Kernel event." That is the event-driven trigger (concept §1 AK8 scope). AK7 leaves `runBetDecomposition` Kernel-driven; only its per-task selection sub-steps route through the seam.

---

## 3c. As-built — AK8 (shipped 2026-06-22)

**Decomposition is now a Strategy response to a Kernel event.** The Kernel emits `work_decompose_requested` and asks the active Strategy's `decomposeBet` method for a `DecompositionPlan`. The mechanism (sandbox, cost, CAS, crash-sweep, insert, dispatch) stays Kernel-side per §2a row 3. Changing the active Strategy changes decomposition behaviour without touching `bet-decomposition.ts` (AC4 runtime proof).

### New shared contracts

| Symbol | Package | Description |
|---|---|---|
| `WorkDecomposeRequestedEvent` | `@hyperidle/shared` | Sibling of `WorkSelectionRequestedEvent` — audit-only occasion event. Emitted post-CAS, post-eligible-check. |
| `DecomposeBetRequest<TDb>` | `@hyperidle/shared` | Occasion handed to Strategy: db, teamId, betId, betDescription, betDoneCondition, candidates (Kernel-enumerated). |
| `DecompositionPlan` | `@hyperidle/shared` | Strategy's answer: decomposerAgentId (null = no agent → Kernel blocks) + tasks ([] = run Kernel's PM turn). |
| `Strategy.decomposeBet` | `@hyperidle/shared` | 5th method on the Strategy port. |

### Rewired `runBetDecomposition` flow (AK8)

```
bet_state_changed(active) → registerBetDecomposition subscriber
  CAS bets.decompositionStatus NULL→'running'  [idempotency — unchanged]
  findEligibleTeamAgents                        [unchanged]
  → emits work_decompose_requested              [NEW — post-CAS, post-eligible]
  enumerateTeamCandidates                       [AK7 helper, NEW call site]
  → getActiveStrategy().decomposeBet({ candidates, betId, ... })  [NEW]
    try/catch: throw → blocked/failed           [no false promise]
  plan.decomposerAgentId null → blocked/no_eligible_agent
  inline validation: candidates.some(c => c.agentId === plan.decomposerAgentId)
    → false → blocked/no_eligible_agent         [WARNING 1 guard]
  checkCostCap(validated decomposer)            [unchanged — Kernel-side]
  3-way turn-source precedence:
    1. plan.tasks.length > 0  → persist tasks; skip turn (future Fabric path)
    2. deps.runDecompositionTurn present → call with plan.decomposerAgentId
       (protected-test seam — all AK3 tests + all v1 Strategies land here)
    3. else → assembleContext + runRealPmTurn    [AK3/Minimal default fallback]
  taskList empty → blocked/empty
  insertProposedBetTasks → task_state_changed(accepted) → dispatcher  [unchanged]
  markTerminal('done')
  finally: rm scratch sandbox                   [unchanged]
```

### Strategy implementations

**Minimal** (`packages/strategy-minimal/src/minimal-strategy.ts`):
Role-match PM else first candidate, `tasks: []`. Kernel runs its PM turn → byte-identical to AK3-as-built. AK3 is the Minimal fallback, not a Kernel-permanent route.

**Fabric** (`packages/fabric/src/fabric-strategy.ts`):
Same PM role-match, `tasks: []`. The Fabric's knowledge edge enters at `assembleContext` (branch 3) — the PM turn runs in a knowledge-assembled context. A richer knowledge-derived task list is deferred; the `tasks` field is the seam for a future Fabric to return a pre-computed breakdown with zero Kernel change.

### Key design decisions (AK8)

- **`bet_decomposer` surface now dead at production.** The `selectOwner({ surface: 'bet_decomposer' })` call was removed from `runBetDecomposition`. The `bet_decomposer` value remains in the `SelectAgentRequest.surface` union (AK7 tests reference it) but has no production caller. Intentional — no churn of AK7 protected tests.
- **Inline decomposerAgentId validation** replaces `selectOwner`'s internal guard. `candidates.some(c => c.agentId === plan.decomposerAgentId)` proves team-membership + active-AI in one check (same predicate `enumerateTeamCandidates` already applied). A third-party Strategy returning an off-team/inactive id → `blocked/no_eligible_agent` before any session.
- **Turn-source precedence.** `plan.tasks` beats the override (test seam), which beats the real turn. The override never beats `plan.tasks` — that would let a test mask a Strategy decision.
- **Empty-list asymmetry.** `plan.tasks === []` means "Strategy authored no breakdown → fall through to override/turn." An empty `taskList` produced by the turn means `blocked/empty`. Same `[]` value, opposite meaning depending on origin. `@lore AK8` comments at both sites.

### `runRealPmTurn` — Branch 3 production path (AR5 as-built)

Branch 3 runs `runRealPmTurn` (`bet-decomposition.ts:546`). Four things are true of this path that are not obvious from the flow diagram:

**Does NOT go through `provisionSession`.** `runRealPmTurn` calls `deps.adapterPool.select()` directly — it is a scratch-sandbox PM turn, not a task session. Driving `provisionSession` here would prove "a real agent ran a session," not "a real agent decomposed a bet." They are different seams and must not be unified.

**CLI harnesses receive bet context via AGENTS.md and CLAUDE.md.** Before spawning the adapter, `runRealPmTurn` writes the **bet context only** — bet goal + done condition + the JSON-output instruction — to both `<scratchSandboxPath>/AGENTS.md` and `<scratchSandboxPath>/CLAUDE.md`. The persona/base prompt is **explicitly excluded** from these files: agent identity belongs to the Strategy, and copying the Kernel's default PM string into the sandbox filesystem would widen the persona-leak violation (`@lore AR5 / AK6`, `bet-decomposition.ts:575-590`). The adapter spawns all CLI harnesses (codex, claude, opencode) with `cwd: config.sandboxPath` pointing at the scratch sandbox, so each harness reads its own project-context file on startup. All three harnesses receive identical bet context by this mechanism — there is no harness-specific truncation or fallback.

**`drainForCompletion` returns the LAST non-empty completion.** CLI adapters emit multiple completion events during a session: init/system events map to empty strings, intermediate blocks carry partial text, and the final event carries the full response. `drainForCompletion` collects the last non-empty completion text across the full stream. Returning on the first completion would capture an empty init event and cause `blocked/empty` on every real CLI run.

**JSON code fences are stripped before `JSON.parse`.** Models often wrap their response in ` ```json … ``` ` fences even when instructed not to. `runRealPmTurn` strips leading ` ``` ` or ` ```json ` and trailing ` ``` ` before parsing. Malformed JSON after stripping → empty list → `blocked/empty` (fail-closed; no partial parse).

**Known live contract violation.** The Kernel's SessionConfig path still carries a default `"You are a product manager…"` literal — a single-location pre-existing default that violates "Kernel hard-codes no persona." Its removal (de-roling `runRealPmTurn`/`pmAgentId`, moving the decomposer instruction to the Strategy) is registered as **AK10** in `.pipeline/work-packages/TRACK-AK.md`.

---

## 3d. As-built — AR4b: the formation seam (sixth port method)

The Assistant turn is the last agent surface where the Kernel used to hard-code persona + tool surface (`BUILTIN_SYSTEM_PROMPT` constant, direct `buildAssistantDraftRegistry` call). AR4b routes both through the port.

### The Strategy Port: sixth method

```ts
formAssistant(req: AssistantFormationRequest<TDb>): Promise<AssistantFormation>;
```

- **Turn-time consultation, not creation-time.** The agent-layer assistant adapter resolves formation after claiming the durable assistant intent and before provisioning (`agent-work-assistant.ts`). No formation value is persisted to the user row.
- **`AssistantFormation` = `{ persona: string | null, assistantDraftSurface: "standard" }`.** `persona: null` means "use the agent row's `systemPrompt` as-is"; a non-null value overrides it for this turn's assembled prompt only (carried via `systemPromptOverride` to `provisionSession` — never persisted to the users row).
- **`assistantDraftSurface` is a server-interpretable marker, not a `ToolRegistry`** — `@hyperidle/shared` stays db-agnostic (a `ToolRegistry` is a server type; carrying it would invert the dependency direction). The Kernel maps `"standard"` to `buildAssistantDraftRegistry` — the canonical 2-tool surface (`create_bet` + `edit_bet`).
- **Boundary rule (founder-locked):** the formation answer MUST NOT set `harnessType` or `modelId` — those are Kernel/Settings. Formation carries only persona + tool surface (the WHO), never the HOW.
- **MUST NOT throw** — a formation failure leaves the turn without a persona/surface.

### Strategy behaviour: Minimal vs Fabric

Both v1 implementations return `{ persona: null, assistantDraftSurface: "standard" }` — preserving pre-AR4b behavior. `persona: null` is the Minimal pattern mirroring `systemPrompt: null` on `AgentScaffoldSpec` ("no formation knowledge, use Kernel defaults"); the Fabric's enrichment (persona shaped from team/user context) is a future concern awaiting real eval data — the seam is in place.

---

## 4. As-built — AK3 (shipped 2026-06-15, superseded by §3c AK8)

> **Superseded by §3c (AK8, shipped 2026-06-22).** AK3 shipped under the original "decomposition is Kernel" framing. AK8 rewired the trigger — `runBetDecomposition` now calls `getActiveStrategy().decomposeBet(...)` and the Minimal Strategy's PM turn is the *default fallback*, not the Kernel's permanent path. The description below is retained as historical record; see §3c for the current live behavior.

**Decomposition (pre-AK8 historical).** When a bet was committed (`draft→active`), the Kernel ran a PM agent turn that produced a task breakdown. The Strategy fed the PM context via the port. Per §2a this kernel-side path became the Minimal Strategy's fallback once AK8 rewired the trigger as an event the active Strategy handles.

### The decomposition seam

```
POST /bets/:id/commit
  → transitionBet(draft→active)  [unchanged]
  → emits bet_state_changed(toState=active)
  → registerBetDecomposition subscriber  [NEW, kernel-side, server-factory.ts]
      CAS bets.decompositionStatus NULL→'running'  [idempotency gate]
      → runBetDecomposition(betId)  [NEW, packages/server/src/services/bet-decomposition.ts]
          1. findEligibleTeamAgents(bet.teamId)
          2. pick PM agent (product_manager role preferred)
          3. checkCostCap(db, eventBus, { agentId, teamId })  [direct Kernel import]
          4. mkdir scratch sandbox + getActiveStrategy().assembleContext(synthetic req)
          5. run PM turn (tools:[]) → structured task list
          6. insertProposedBetTasks → task_state_changed(accepted) → existing dispatcher
          7. markTerminal('done' | 'blocked')
          8. finally: rm scratch sandbox (best-effort)
```

**Key design decisions:**

- **Strategy port called with a synthetic request.** `assembleContext` is called with `isRoutine: true` and synthetic `sessionId`/`taskId` strings (no real session or task row exists at decomposition time). The scratch sandbox is a real directory created and removed by the decomposition service. Under the Minimal Strategy this produces an empty scaffold. Under the Fabric it provides practice context.
- **v1 inserts tasks server-side (no tool call).** The PM turn runs `tools: []` and returns a JSON array. The server inserts via `insertProposedBetTasks` directly — no session-less tool call is needed. A future `propose_bet_tasks` harness tool would call `insertProposedBetTasks` as its body unchanged.
- **Idempotency via CAS.** The `NULL → 'running'` CAS on `bets.decompositionStatus` is the dedup guard. A duplicate `bet_state_changed(active)` whose CAS affects 0 rows returns immediately.
- **Crash recovery at boot.** `resolveOrphanedDecompositions(db)` runs at startup before the subscriber is registered. It flips any `'running'` bet to `blocked/failed` — an in-process turn that died with the previous process can never resume.
- **Owner assignment.** Each produced task gets `ownerAgentId` via the active Strategy's `selectAgent` port method (AK7). The Kernel enumerates eligible team candidates (active AI, `category='team'`, ordered by `users.id`) and asks the Strategy which agent to assign; the Fabric strategy does exact role-match first, then round-robin spread (`candidates[i % len]`) on the mismatch branch. `betId` is bound from the bet, not from agent output (cross-bet injection prevention). Pre-AK7 the selection was computed inline with the same role-match + round-robin logic; AK7 moves the decision to the Strategy while preserving byte-identical behaviour.
- **Decomposition status on `bets`.** Two new columns: `decompositionStatus` (`null | 'running' | 'done' | 'blocked'`) and `decompositionBlockerReason` (`null | 'no_eligible_agent' | 'empty' | 'failed'`). GET `/bets/:id` returns both. `WorkBet.tsx` renders a four-state tasks section: tasks present, draft, blocked (reason-specific copy + "Add an agent" link), decomposing.
- **Cost stays Kernel-side.** `checkCostCap` is imported directly from `@hyperidle/fabric` by the decomposition service — it is not behind the Strategy port. This is consistent with §2 and §3 ("cost enforcement stays Kernel-side").

### New files (server package)

| File | Role |
|---|---|
| `packages/server/src/services/bet-decomposition.ts` | `runBetDecomposition`, `findEligibleTeamAgents`, `insertProposedBetTasks`, `resolveOrphanedDecompositions` |
| `packages/server/src/services/bet-decomposition-subscriber.ts` | `registerBetDecomposition` — event bus wiring, registered at boot in `server-factory.ts` |

### Boot wiring addition (`server-factory.ts`)

```ts
// AK3: crash-recovery sweep BEFORE the subscriber starts.
await resolveOrphanedDecompositions(db);
// AK3: kernel-side decomposition subscriber.
const disposeBetDecomp = registerBetDecomposition({ db, eventBus, adapterPool, sandbox: workspaceAdapter, sandboxBasePath, resolveModel, credentialResolver });
```

`disposeBetDecomp()` is added to the shutdown chain alongside other disposers.

---

## 5. Prior gap (closed by AK2)

Pre-AK2: `provision-registry.ts` (`setProvisionSessionFn`/`getProvisionSessionFn`) was a genuine seam the dispatcher called through, but the production `provisionSession` hard-imported the Fabric (`assembleContext`, `startWatcher`, `checkCostCap`) — violating the boundary. O2 had moved Strategy *fields* into extension tables (`knowledgeStrategyFabric`, `taskStrategyFabric`); the *package/runtime* split was not yet real. AK2 closed this gap.

---

## 6. Vocabulary (locked, industry-aligned)

Adopt current agent-harness nouns; drop homegrown terms. The rollout is **TRACK-AK / AK1**, sequenced before the split.

| Concept | Canonical term | Drop |
|---|---|---|
| Structure around the model | **harness** (harness adapter) | — |
| Agent behaviour instruction | **system prompt** | Deprecated homegrown term removed |
| Project/agent instruction file | **AGENTS.md** (Linux-Foundation cross-vendor standard) | — |
| Host working directory where an agent runs | **sandbox** (sandbox adapter), cwd = per-session dir under `HYPERIDLE_WORKSPACES_DIR` | ~~workspace~~ as the unit |
| One run of agent work | **session** | — |
| Capability the agent calls | **tool** (+ **MCP** for external) | part of ~~tools~~ |
| Packaged procedural know-how | **Skill** (Agent Skill) | part of ~~tools~~ |
| Lifecycle interceptor | **hook** | — |
| Delegated isolated worker | **subagent** | — |
| Assembling knowledge into context | **context assembly** (under **context engineering**) | Deprecated context-loading terms removed |
| The knowledge/context layer | **Strategy** (kept); current impl = **Fabric** (one impl) | — |
| Agent memory | **short-term / long-term**, episodic/semantic/procedural | — |

`tools` splits into **Skills** + **tools** (+ **MCP**) — three distinct concepts.

Note: "Strategy" the *layer* is distinct from "strategy agent" the *agent type* (team/strategy/individual) — same word, different axis; context disambiguates.

---

## 7. Rationale

The founder's USP is "nail the Kernel first." That only works if the Kernel is a complete application that runs agents *without* the knowledge magic, with the knowledge magic (the fast-moving part) as a swappable Strategy. The Minimal Strategy is the proof and the contributor template; the Fabric is the rich default, preserved unchanged behind the boundary. The nouns must be industry-standard so the seam and the contributor story are legible to anyone in the 2025–2026 agent-infra space — homegrown terms can't carry that.

## 8. Out of scope here
- The Fabric's internal knowledge-management design (deeply researched; preserved, not redefined).
- **Unified human-attention scoring** (who/what pulls the human in) — a separate concept; AK3's human-gate depends on it.
