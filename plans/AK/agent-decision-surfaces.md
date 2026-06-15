# Agent-decision surfaces — inventory (2026-06-15)

Research feeding TRACK-AK / AK6–AK8 and `docs/architecture/kernel-strategy-split.md` §2a. Maps every place the system **creates** or **selects** an agent, to see where the "Kernel triggers / Strategy decides the agent + knowledge" boundary applies. Three read-only codebase sweeps over clean `origin/main`.

## Headline

The "Kernel triggers, Strategy decides which agent + what knowledge" pattern is **pervasive, not specific to decomposition** — it recurs across team scaffolding, adding an agent, assistant creation, factory bootstrap, decomposition, task dispatch, the assistant turn, and routine delegation. Two structural facts block a clean seam today:

1. **Entity creation emits no events.** Team creation, agent creation, and user registration happen **inline in routes** with **no `team_created` / `agent_added` / `user_created` event** — so there is *no seam at all* for a Strategy to own "what agent gets created." The assistant turn is also inline (`threads.ts:1349` fire-and-forget), not event-driven.
2. **Selection is knowledge-blind Kernel mechanics.** Which agent takes a unit of work is decided by role-eligibility + round-robin + pre-set `ownerAgentId`, with **zero** Strategy/knowledge input. The *only* skill-aware selection anywhere is routine delegation (`findDelegate`, `routine-scheduler.ts:245-263`).

## A. Agent CREATION surfaces (→ AK6)

| Surface | file:line | Trigger | "What" today | Owner of "what" |
|---|---|---|---|---|
| User registration → Assistant | `routes/users.ts:144-167` | human POST /api/users | `BUILTIN_ASSISTANT_SYSTEM_PROMPT` + model defaults, hard-coded | **Kernel (hard-coded)** |
| Assistant lazy-create | `routes/assistant.ts:300-319, 394-416` | first GET/PATCH assistant | same hard-coded defaults (duplicated) | **Kernel (hard-coded)** |
| Team creation (route) | `routes/teams-routes.ts:353-509` | human POST /api/teams | `defaultRoster()` roles; systemPrompt from `factorySettings` template | **Mixed** (roster Kernel; prompt configurable) |
| Team creation (tool) | `tools/create-team.ts:41-173` | `create_team` tool | same as route | **Mixed** |
| Add agent to team | `tools/add-agent.ts:34-97` | `add_agent` tool | role + identity hard-coded; systemPrompt optional | **Mixed** |
| Factory bootstrap | `db/factory-bootstrap.ts:63-210` | boot | system:propagation, System Agent, facilitators (strategy agents) — role/category/community hard-coded | **Kernel (hard-coded)** |
| Onboarding welcome | `routes/teams-routes.ts:511-590` | POST /api/teams w/ userId | assistant upsert + welcome text template | **Kernel (hard-coded)** |
| Demo fixture | `db/demo-fixture.ts:32-190` | seed/--demo | demo team + agents | test-only (not prod) |

**No creation events exist** — every row above is inline. To let a Strategy own "what," the Kernel must emit `team_created` / `agent_added` / `user_created` (or call a Strategy creation seam) at these points.

## B. Interaction-surface EVENTS (the seam)

Event bus union: 17 kernel event types (`events.ts:300-317`). Interaction surfaces that already exist and carry agent decisions:

| Event | emitted | agent decision today |
|---|---|---|
| `task_state_changed` | `task-state-machine.ts:108` | task-dispatcher provisions a session for `ownerAgentId` |
| `bet_state_changed` | `bet-state-machine.ts:228` | AK3 decomposition subscriber (kernel-side) |
| `session_started` / `session_ended` | `session-lifecycle.ts:221,288` | review-creator, cost-cap, dispatcher cleanup |
| `thread_message_appended` | `threads.ts:933…` | **NOT subscribed — assistant runs via inline fire-and-forget `threads.ts:1349`** |
| `item_created`, `knowledge_accessed` | various | policy-engine / relevance (knowledge work, not agent choice) |

**Missing events (no emit site):** `team_created`, `agent_added`, `user_created` (entity creation is inline-only); `thread_archived`, `dependency_met` (defined, never emitted).

## C. Agent SELECTION surfaces (→ AK7)

| Surface | file:line | How chosen | Knowledge-aware? |
|---|---|---|---|
| Task → session | `session-provisioning.ts:279-282` | loads pre-set `ownerAgentId` | No |
| Bet decomposition assignment | `bet-decomposition.ts:91-115` | `findEligibleTeamAgents` (category='team') + round-robin | No |
| PM-for-decomposition | `bet-decomposition.ts:293-298` | `product_manager` preferred, else `eligible[0]` | No |
| Assistant turn | `assistant-dispatcher.ts:93-151` | deterministic `ast-${userId}` | No |
| Routine owner | `builtin-routines.ts:282-304` | `ownerByRole[role] ?? leadAgentId` (set at seed time) | No |
| **Routine delegate** | `routine-scheduler.ts:245-263` | **skill match from `userSkills`** (WIP-limit fallback) | **Yes — the only one** |

`getActiveStrategy()` is called only for `assembleContext` (P6) + `beginLearningIngestion` (P7). The port has no `selectAgent`/`chooseOwner` seam. Best slot for a selection seam: generalize the `findDelegate` skill-match into a Strategy call so every selection point can consult it.

## Implication for the track

- **AK6** must cover *all* creation surfaces (team scaffold, add-agent, assistant, factory bootstrap). Emitting the creation events (`team_created` / `agent_added` / `user_created`) is **in scope for AK6** — the events *are* the seam the Strategy attaches to, so they are designed and emitted as part of AK6's separation work, not split into a separate WP.
- **AK7** must cover *all* selection surfaces and make selection knowledge-aware via one Strategy seam; `findDelegate` is the existing precedent. The "work needing an agent" event is likewise **in scope for AK7** — same principle: the event is the seam.
- **AK8** (decomposition) is one *application* of AK6+AK7, not the whole story.
- **Decided (founder, 2026-06-15):** events are not a separate foundational WP — each WP creates the events it needs as part of building its half of the separation. The event is the surface; building the surface is the work.
