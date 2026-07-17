# agent-selection — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration (infrastructure / platform service)
**Owned tables:** none
**Current public exports:** 19 (5 runtime, 14 types) — all re-exports through the barrel
**Consumers:** 4 services / 7 distinct requests
**Verdict: STANDALONE — but collapse 19 → ~9. Dissolve `deriveInitials` out; fold three per-surface selection methods + three per-surface request types into one `selectAgent(occasion)`; dissolve the `resolveAssistantFormation` stub.**

---

## 1. Existence / Consolidation Verdict — STANDALONE

**Product purpose:** agent-selection is the app-owned **agent decision authority** for the agent-orchestration layer. It answers one coherent product question at decision time — *"which agent handles this occasion?"* — in two forms: pick an **existing** agent (selection) or produce the spec for a **new** agent (scaffold). It owns the *policy*, not a table: WIP-blind team-candidate enumeration, the round-robin `spreadIndex` spread, the PM-first decomposer default, the WIP-limit capacity gate, and the creation-trigger → roster/persona composition. Four orchestration services depend on it at decision time:

- `work` → `enumerateTeamCandidates`, `selectOwner`, `resolveDecompositionPlan` (bet task + decomposer assignment)
- `session-requests` → `isAgentAtWipLimit`, `selectAgentByAppDefaults` (intent-worker resolution)
- `dispatch` → `resolveAssistantFormation` (assistant persona)
- `tool-handlers` → `resolveAgentScaffoldSpecs` (agent creation from a tool)

This is a genuine **platform capability**: a single, table-free home for agent-formation policy that would otherwise be smeared across `work`, `session-requests`, and route handlers (which is exactly where it lived pre-AK7/AU19). It reads `users` + `org` through DI ports but is not naturally part of either — org owns membership, users owns identity; neither owns *selection policy*. The candidate-cluster steer (`neighbors: []`, "one of the few genuinely healthy infra services") agrees.

**Challenge to AU19's "why separate" claim:** AU19 justifies the boundary as "selection logic isn't naturally part of org/users." True but shallow — the real earned boundary is that it is the **single policy authority** consumed by 4 orchestration services, not merely a read-aggregator over org+users. That reframing matters because it also exposes what does *not* belong: `deriveInitials` (display-name formatting — web already re-implements it in `utils/initials.ts`) is bundled here purely because AA1 happened to extract it into a nearby file. It is not agent-selection policy and must dissolve to `@hyperidle/shared`.

**Cluster hypothesis:** N/A — no consolidation cluster proposed, and none is warranted. The core is a real multi-consumer decision service. The steer's own note ("trim selection-type re-exports but the core is a real multi-consumer platform capability") is precisely the finding: the boundary is right; the *surface* is over-fragmented (a method + a request-type per calling surface).

---

## 2. The Deliberate Target Public API

The sprawl is **method-per-surface**: `selectOwner` (bet_task/bet_decomposer, with enumeration+event+validation), `selectAgentByAppDefaults` (the pure resolver over pre-built candidates), and `resolveDecompositionPlan` (bet_decomposer — and `DecompositionPlan.tasks` is *always* `[]`, so it only picks the decomposer) are **three methods for three surfaces of the same question**, each with its own request type. Collapse to a small composable set behind one service factory.

| # | Target interface | Shape | Subsumes (current exports) | Why a meaningful shared capability |
|---|---|---|---|---|
| 1 | **`selectAgent(occasion)`** | `(occasion: SelectionOccasion) => Promise<{ agentId: string \| null }>` where `SelectionOccasion` is a discriminated union over `surface` (`bet_task` \| `bet_decomposer` \| `routine_delegate` \| …). Internally: enumerate (when teamId-driven) → emit occasion event → resolve per surface → validate id. | `selectOwner`, `selectAgentByAppDefaults`, `resolveDecompositionPlan` (3 methods) | The one selection authority. New work surface = new union arm, not a new method. `resolveDecompositionPlan` is just `bet_decomposer` selection (its `tasks:[]` is vestigial). |
| 2 | **`listCandidates(filter)`** | `(filter: CandidateFilter) => Promise<SelectionCandidate[]>` (filter = `{ teamId, category? }`) | `enumerateTeamCandidates` | `work` requests the raw candidate list directly (not only via selection); a parameterized read serves that + future "candidates by skill/availability" without new methods. |
| 3 | **`isAtCapacity(agentId)`** | `(agentId: string) => Promise<boolean>` | `isAgentAtWipLimit` | The WIP capacity gate. A named predicate `session-requests` and the internal `routine_delegate` branch both compose; capacity gates selection. |
| 4 | **`resolveScaffoldSpecs(request)`** | `(request: ScaffoldRequest) => Promise<AgentScaffoldSpec[]>`, parameterized by `trigger` (`team_scaffold` \| `agent_added` \| `user_assistant`) | `resolveAgentScaffoldSpecs` **+** `resolveAssistantFormation` | Creation-spec resolution (roster + persona). The `user_assistant` trigger already yields the assistant persona, so the degenerate `resolveAssistantFormation` stub (returns constant `{persona:null,…}`) folds in — dispatch reads the spec's `systemPrompt`. |

All four are methods on a single **`createAgentSelectionService(deps)`** factory (renamed from `createAgentSelectionOps`), giving one coherent product object instead of a mix of bound-ops + loose pure functions.

**Retained types (each carries its own justification):**
- `SelectionOccasion` (union) — **replaces** `SelectAgentRequest`, `DecomposeBetRequest`, `AgentSelectionSelectOwnerOccasion` (3 → 1).
- `SelectionCandidate` — the candidate shape; used by `listCandidates` + `work`.
- `CandidateFilter` — parameterizes the candidate read.
- `AgentScaffoldSpec`, `ScaffoldRequest` — the creation-spec interface.
- `AgentSelectionService` (was `AgentSelectionOps`) — the service-object type.
- `AgentSelectionDeps` — the one exported DI-port aggregate.

**Dropped entirely:** `deriveInitials` (→ `@hyperidle/shared`), `resolveAssistantFormation` + `AssistantFormation` + `AssistantFormationRequest` (stub, folded), `DecompositionPlan` (vestigial `tasks:[]` shell), `SelectAgentOutcome` (inlined into the `{agentId}` return of `selectAgent`), `AgentSelectionTeamReader` + `AgentSelectionUserReader` (made internal — only the `AgentSelectionDeps` aggregate is exported; the composition root builds it).

**Target export count: ~9** (1 factory + 8 types), down from 19.

---

## 3. INSIDE Lens — clean & evolvable

- **One dispatcher, one switch.** `selectAgent` is a single `switch (occasion.surface)` over pure per-surface resolvers; behavior change to any surface edits exactly one case. Adding a surface = add a union arm + a case.
- **Deps injected once** via `createAgentSelectionService(deps)` closing over the `users`/`org` ports at the composition root — no service imports another service; table-free by construction (owns zero tables, reads only through ports + `UNOWNED_SHARED_TABLES` `sessions`/`userSkills`).
- **Policy centralized:** roster/persona data lives in `roster.ts`; the WIP-blind invariant, round-robin spread, and PM-decomposer default are documented in one place. No leakage of selection policy back into `work`/`session-requests`.
- **Degenerate seams removed:** the always-`[]` `DecompositionPlan.tasks` and constant-null `resolveAssistantFormation` stop masquerading as capabilities, so the surface reflects real behavior.

---

## 4. Scaling Argument — sub-linear

Apply the scaling test: add dozens more services and hundreds more calls.

- **New work surface** (`review_assignment`, `incident_owner`, `escalation_owner`, …) → add one arm to `SelectionOccasion` + one `case` in `selectAgent`. **Zero new public methods.** Contrast today: each surface tempted its own method (`selectOwner` / `selectAgentByAppDefaults` / `resolveDecompositionPlan` are literally 3 methods for 3 surfaces of the *same* decision) — that path grows one method + one request type per surface (linear).
- **New candidate population** (by skill, by availability, by tenure) → a field on `CandidateFilter`, not `listCandidatesBySkill` / `listCandidatesByAvailability`. Parameterized-by-filter absorbs the demand.
- **New creation trigger** → a `trigger` variant on `ScaffoldRequest` + one `case` in `composeRoster`. No `resolveXFormation` per formation kind (which is exactly the trap `resolveAssistantFormation` fell into).

The parameterized `selectAgent(occasion)` / `listCandidates(filter)` / `resolveScaffoldSpecs(request-by-trigger)` triad absorbs new use-cases by composition; the method-per-intent shape it replaces (`selectOwner`, `selectAgentByAppDefaults`, `resolveDecompositionPlan`, `resolveAssistantFormation`) would keep growing a method per new occasion. Sub-linear. ✔

---

## 5. Key Collapses

1. **`selectOwner` + `selectAgentByAppDefaults` + `resolveDecompositionPlan` → `selectAgent(occasion)`** (3 → 1). All are one question — pick an agent for a surface. `resolveDecompositionPlan` is `bet_decomposer` selection; its `DecompositionPlan.tasks` is *always* `[]` (confirmed against `work/bet-decomposition.ts`), i.e. pure vestigial future-proofing.
2. **`SelectAgentRequest` + `DecomposeBetRequest` + `AgentSelectionSelectOwnerOccasion` → `SelectionOccasion`** (3 request types → 1 union).
3. **`resolveAssistantFormation` + `AssistantFormation` + `AssistantFormationRequest` → dissolved** (constant-null stub; the `user_assistant` scaffold trigger already produces the persona). 3 exports → 0.
4. **`deriveInitials` → `@hyperidle/shared`** — display-name formatting, no selection semantics, not even listed as a consumer request here; web already duplicates it in `utils/initials.ts`. Wrong home. −1.
5. **`AgentSelectionTeamReader` + `AgentSelectionUserReader` → internal**; export only the `AgentSelectionDeps` aggregate the composition root wires. −2. Plus `SelectAgentOutcome` inlined into the `{agentId}` return. −1.

Net: **19 → ~9 exports**, and the load-bearing win is behavioral, not just count: one parameterized selection interface that new occasions compose into, replacing a method-and-request-type per calling surface.
