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

---

## Stage 2 planner adjudication — census-correct factory target (supersedes conflicting claims above)

### Decision

Keep the Stage 1 factory/object contract and all four object operations. Correct the
implementation-site census target to **1 method / 7 types = 8**.

`surface-census.ts` counts exported implementation declarations. It does not count methods on an
exported interface or functions stored on the object returned by a factory. The one exported value
declaration is therefore `createAgentSelectionService`; `selectAgent`, `listCandidates`,
`isAtCapacity`, and `resolveScaffoldSpecs` are four cohesive object operations but add zero method
declarations to the census. Retaining loose wrappers solely to manufacture `targetMethods = 4`
would preserve the fragmentation this rearchitecture exists to remove and is forbidden.

The Stage 1 completeness contract at `b5981865` pins all four operations, including the raw,
WIP-blind candidate read. `listCandidates` is therefore irreducible for this work package even
though the current work decomposition path also consumes the same population before PM selection.
Stage 2 must migrate decomposer selection to `selectAgent({ surface: "bet_decomposer", ... })`
without deleting the independently specified `listCandidates` capability.

### Exact exported contract

```ts
createAgentSelectionService(deps: AgentSelectionDeps): AgentSelectionService

interface AgentSelectionService {
  selectAgent(occasion: SelectionOccasion): Promise<{ agentId: string | null }>;
  listCandidates(filter: CandidateFilter): Promise<SelectionCandidate[]>;
  isAtCapacity(db: HyperIdleDb, agentId: string): Promise<boolean>;
  resolveScaffoldSpecs(request: ScaffoldRequest): Promise<readonly AgentScaffoldSpec[]>;
}
```

**Exported method declarations (1):** `createAgentSelectionService`.

**Exported type declarations (7):** `AgentSelectionService`, `AgentSelectionDeps`,
`SelectionOccasion`, `SelectionCandidate`, `CandidateFilter`, `ScaffoldRequest`,
`AgentScaffoldSpec`.

`AgentSelectionUserReader` and `AgentSelectionTeamReader` are structural details nested in the
single `AgentSelectionDeps` contract, not separately exported declarations. Selection result,
legacy per-surface requests, decomposition plan, assistant-formation, and resolver-alias types are
deleted rather than retained behind the barrel.

### Pinned policy semantics

#### Candidate population and ordering

- `listCandidates({ db, teamId })` resolves the team's membership group, reads active AI users in
  that group, filters to role-catalog category `team`, projects `{ agentId, role }`, and returns
  stable ascending user-id order. It is WIP-blind.
- The `users` dependency contract must guarantee that stable order; selection must not depend on an
  undocumented database scan order.
- `CandidateFilter` is exactly `{ db: HyperIdleDb; teamId: string }`. Delete the currently ignored
  `category` field; future narrowing is added only when a real consumer demands defined semantics.

#### Bet selection

- `bet_task`: exact role match wins; otherwise choose `spreadIndex % candidates.length`; empty
  population returns `null`. A role-match short circuit does not alter the spread index used by
  later calls.
- `bet_decomposer`: product-manager match wins; otherwise first candidate; empty population returns
  `null`. Work must call this unified occasion rather than rebuilding PM-first selection at the
  composition root.
- For both bet surfaces, emit `work_selection_requested` before resolution. After resolution,
  validate that the id still resolves to an active AI user; missing, human, or inactive resolves to
  `null`. Team membership is deliberately checked when enumerating, not rechecked after resolution.

#### Routine delegation

`routine_delegate` preserves the legacy demanded policy exactly: scan `userSkills` in insertion
order, skip `excludeAgentId`, and return the first candidate not at WIP capacity. It is intentionally
system-wide and does **not** add team, kind, or active-status filtering in AU20. The earlier blanket
claim that every selected id passes the active-AI unattachable-session guard is therefore narrowed:
that guard belongs to the bet-selection path. Adding active-AI validation to routine delegation is
a behavior change not required by demand or Stage 1 and needs its own refined work package.

#### Capacity and concurrency

`isAtCapacity` returns true for a missing agent and otherwise compares active-session count with
`maxConcurrentSessions` using `activeCount >= limit`. It is a read-only advisory predicate, not a
capacity reservation or atomic admission claim. No reservation, lease, or new concurrency API is
added without demonstrated demand; the session-admission owner remains responsible for any future
atomic claim semantics.

#### Scaffold composition

- `team_scaffold` preserves default-roster order, names, categories, and docs-backed role prompts.
- `agent_added` requires a role, preserves an explicit name, and otherwise synthesizes the existing
  fallback name and prompt.
- `user_assistant` preserves the assistant persona, individual category, owner-derived name, and
  `ast-<ownerUserId>` id hint.

### Physical deletion and migration obligations

1. Consolidate live implementation behind `createAgentSelectionService` so helper functions do not
   require cross-file exports. Moving names off `index.ts` is insufficient. Colocate the live
   selection, capacity, candidate, and roster helpers with their sole consumer, then delete obsolete
   modules where empty.
2. Delete `agent-utils.ts`; all non-agent-selection callers use the canonical shared
   `deriveInitials`.
3. Delete `agent-defaults/resolvers.ts` and its four alias types/functions. Delete legacy
   `SelectAgentRequest`, `SelectAgentOutcome`, `DecomposeBetRequest`, `DecompositionPlan`,
   `AssistantFormationRequest`, and `AssistantFormation` declarations.
4. Internalize the assistant prompt constant and dependency reader shapes. The only exported value
   declaration anywhere in this Service is the factory; no compatibility wrapper or alias survives.
5. Migrate work's `enumerateTeamCandidates` / `selectOwner` / inlined
   `resolveDecompositionPlan` adapter to `listCandidates` and unified `selectAgent`; specifically,
   remove PM-first policy from `server-factory.ts` so agent-selection is its single owner.
6. Migrate session-requests' `isAgentAtWipLimit` / `selectAgentByAppDefaults` adapter to
   `isAtCapacity` / the `routine_delegate` occasion. Migrate dispatch, tool-handlers, assistant, and
   route scaffold callers to `resolveScaffoldSpecs`. Use the composition-root service binding;
   remove duplicate local factory instances where one bound instance already exists.
7. Preserve the Stage 1 completeness contract unchanged. Acceptance is exact census
   **agent-selection = 1 method / 7 types**, the Stage 1 contract green, all caller ports migrated,
   and no production wrapper, reservation API, guard, or census-script change.
