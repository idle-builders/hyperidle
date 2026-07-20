# agent-selection — Service-as-Product (AU20 re-architecture, both lenses)

**Layer:** agent-orchestration
**Substrate:** `internal-logic` (owns ZERO tables; reads `users` + `org` through DI ports)
**Verdict:** coherent policy service. Floor = 4-op coherent set. Target = **4 methods / 7 types** (down from 12 / 19).

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

**Substrate is NOT owned-tables and NOT an external-API adapter.** agent-selection owns no table (`ownedTables: []`) and drives no external system (no CLI/LLM/git/ws). Its substrate is **pure internal logic**: the app-owned *agent-decision policy*. It answers one product question at decision time — *"which agent handles this occasion?"* — in two forms: pick an **existing** agent, or produce the spec for a **new** one. The owned algorithm is a set of deterministic policies:

- **WIP-blind team-candidate enumeration** (role-only projection, `orderBy users.id` — load-bearing for the round-robin).
- **Per-surface resolution:** bet_task round-robin `spreadIndex` spread + role-match short-circuit; bet_decomposer PM-first default; routine_delegate's verbatim `userSkills` delegate query.
- **The unattachable-session guard** (resolved id must be an active AI user, else `null`).
- **WIP-limit capacity gate** (`activeSessions >= maxConcurrentSessions`).
- **Creation-trigger → roster/persona composition** (team_scaffold / agent_added / user_assistant).

It reads `users` (identity) and `org` (membership) through injected ports, but owns neither — it owns *selection policy*, which is naturally homeless in either. This is the genuine boundary: a single table-free home for agent-formation policy that would otherwise smear across `work`, `session-requests`, and route handlers (exactly where it lived pre-AK7).

**The floor** (for a logic service = the coherent op set of the owned algorithm) is **4 operations**, one per genuine owned capability:

| # | Floor operation | Owned capability |
|---|---|---|
| 1 | **select an existing agent for an occasion** | per-surface resolution + enumeration + occasion-event + unattachable-session guard |
| 2 | **read the candidate population** | WIP-blind team-candidate enumeration (the raw list, consumed independently) |
| 3 | **capacity gate** | the WIP-limit predicate (consumed as a standalone gate + composed internally by routine_delegate) |
| 4 | **resolve the creation spec for a new agent** | creation-trigger → roster/persona composition |

There is nothing genuine below this and nothing genuine above it. These four are distinct owned policies, not four surfaces of one policy: (1) picks from a population, (2) *is* the population read, (3) is a boolean gate consumers apply before dispatching, (4) is the "answer by creating one" arm. No fifth capability is owned.

---

## 2. OUTSIDE-IN — real consumer demand

3 consumers, 6 distinct requests (from `service-data-23.json`):

| Consumer | Requests | Maps to floor op |
|---|---|---|
| `work` | `enumerateTeamCandidates` | **read candidates** |
| `work` | `selectOwner` | **select** (bet_task) |
| `work` | `resolveDecompositionPlan` | **select** (bet_decomposer — its `DecompositionPlan.tasks` is *always* `[]`; the plan is vestigial, it only picks the decomposer) |
| `dispatch` | `resolveScaffoldSpecs` | **resolve scaffold spec** |
| `session-requests` | `isAgentAtWipLimit` | **capacity gate** |
| `session-requests` | `selectAgentByAppDefaults` | **select** (routine_delegate) |

The demand is the same four capabilities. The sprawl is **method-per-surface**: three selection requests (`selectOwner` / `selectAgentByAppDefaults` / `resolveDecompositionPlan`) are three names for three surfaces of ONE question. That fragmentation is the defect, not a missing capability.

---

## 3. THE COHERENT PRODUCT API — one service, 4 methods

`createAgentSelectionService(deps: AgentSelectionDeps): AgentSelectionService` — one factory, deps (`users` + `org` ports) closed over once at the composition root.

| # | Interface | Shape | Lens | Source |
|---|---|---|---|---|
| 1 | **`selectAgent`** | `(occasion: SelectionOccasion) => Promise<{ agentId: string \| null }>` — `SelectionOccasion` is a discriminated union over `surface` (`bet_task` \| `bet_decomposer` \| `routine_delegate`, …). Internally: enumerate (teamId-driven) → emit occasion event → resolve per surface → validate id. | both | floor op 1; subsumes `selectOwner` + `selectAgentByAppDefaults` + `resolveDecompositionPlan`. New surface = new union arm + one `case`. |
| 2 | **`listCandidates`** | `(filter: CandidateFilter) => Promise<SelectionCandidate[]>`, `CandidateFilter = { db, teamId, category? }` | both | floor op 2; `work` requests the raw list directly. Parameterised read absorbs future "by skill / availability" narrowing without a new method. |
| 3 | **`isAtCapacity`** | `(db, agentId) => Promise<boolean>` | both | floor op 3; `session-requests` gate + composed internally by `routine_delegate`. |
| 4 | **`resolveScaffoldSpecs`** | `(request: ScaffoldRequest) => Promise<readonly AgentScaffoldSpec[]>`, parameterised by `trigger` (`team_scaffold` \| `agent_added` \| `user_assistant`) | both | floor op 4; `dispatch` demand. `user_assistant` already yields the assistant persona, so the degenerate `resolveAssistantFormation` stub folds in here. |

**Types (7):** `AgentSelectionService`, `AgentSelectionDeps`, `SelectionOccasion` (replaces 3 request types), `SelectionCandidate`, `CandidateFilter`, `ScaffoldRequest`, `AgentScaffoldSpec`.

### Completeness proof — every current user feature still deliverable
- Bet task assignment → `selectAgent({surface:"bet_task", …})` (round-robin spread preserved via `spreadIndex`).
- Bet decomposer assignment → `selectAgent({surface:"bet_decomposer", …})` (PM-first default preserved).
- Routine delegate resolution → `selectAgent({surface:"routine_delegate", skillId, excludeAgentId})` (verbatim userSkills query preserved).
- Candidate list for `work` → `listCandidates({teamId})`.
- WIP gate for `session-requests` → `isAtCapacity(db, agentId)`.
- Team scaffold / agent-added / user-assistant creation → `resolveScaffoldSpecs({trigger})`.
Nothing lost. Fragmentation removed, capability intact.

### Evolvability (inside-out MVP)
New selection surface (`review_assignment`, `incident_owner`) → one `SelectionOccasion` arm + one `case`; zero new methods. New candidate population (by skill/availability) → a `CandidateFilter` field. New creation trigger → a `ScaffoldRequest.trigger` variant + one `case` in `composeRoster`. Sub-linear by construction.

---

## 4. TARGET NUMBERS

- **targetMethods = 4** = floor (4) + 0 unjustified extras. Every method is a distinct owned policy capability; none is removable without losing a real feature.
- **targetTypes = 7** — only the types the 4 general interfaces genuinely need (1 service type, 1 DI aggregate, 1 selection union, 1 candidate shape, 1 candidate filter, 2 scaffold types).
- **From:** currentMethods 12, currentTypes 19.

### DELETED (removed, not internalised)
- `deriveInitials` → moved to `@hyperidle/shared` (display formatting, no selection semantics; web already duplicates it). **−1 method.**
- `resolveAssistantFormation` + `AssistantFormation` + `AssistantFormationRequest` → dissolved (constant-null stub; `user_assistant` scaffold trigger already produces the persona; `dispatch` reads the spec's `systemPrompt`). **−1 method, −2 types.**
- `DecompositionPlan` → deleted (vestigial `tasks:[]` shell; `resolveDecompositionPlan` was just `bet_decomposer` selection). **−1 type.**
- `SelectAgentOutcome` → inlined into `selectAgent`'s `{ agentId }` return. **−1 type.**
- `SelectAgentRequest` + `DecomposeBetRequest` + `AgentSelectionSelectOwnerOccasion` → collapsed into `SelectionOccasion`. **−3 types → +1.**
- `AgentSelectionTeamReader` + `AgentSelectionUserReader` → made internal; only the `AgentSelectionDeps` aggregate is exported. **−2 types.**
- `selectOwner` / `selectAgentByAppDefaults` / `resolveDecompositionPlan` / `enumerateTeamCandidates` / `isAgentAtWipLimit` / `resolveAgentScaffoldSpecs` bare functions → become the 4 methods on the single service object. **−N loose exports.**

The load-bearing win is behavioural, not a count: one parameterised selection interface that new occasions compose into, replacing a method-and-request-type per calling surface.
