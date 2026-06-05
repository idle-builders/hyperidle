# AB3 Architecture Critique

ARCHITECTURE-CRITIQUE: score=8/10  rounds=1  axes: C:8 T:8 D:8 V:7 O:8 S:8 R:8 E:8 P:7

**Verdict:** PASS. Average 7.78, above the 7.0 threshold. The plan is well-structured with correct reconciliation of spec assumptions against codebase reality. Findings below are for the builder to address during implementation.

---

## AC Coverage Audit

| AC | Covered? | Verification method | Sound? |
|----|----------|-------------------|--------|
| AC-1: Default agents with descriptions | YES | Vitest component test: render with overrideData, assert agent-card contains name + description + category tag | YES |
| AC-2: Soul edit guided flow | YES | Vitest component test: click card, assert dialog opens with guidance text + pre-filled soul textarea | YES |
| AC-3: Category-aware editing | YES | Vitest component test: strategy agent shows note + disabled config; team agent has no note + enabled config | YES, but personal agent path not explicitly tested |
| AC-4: Harness and model tier | YES | Vitest component test (change tier, save, assert PATCH) + server integration test (PATCH returns updated value) | YES |
| AC-5: Add custom agent | YES | Vitest component test (fill form, assert POST with teamMembersId) + server integration test (POST returns 201) | YES |
| AC-6: First-time hint | YES | Vitest component test (assert hint-review-agents visible, click dismiss) + hint catalog test (review-agents in HINT_CATALOG) | YES |

**All 6 ACs have verification methods. All verification methods are sound (component tests for UI behavior, integration tests for API behavior, existing catalog tests for type additions).**

---

## CRITICAL

### CRITICAL-1: Task ordering violates TDD

CLAUDE.md states: "Write the failing tests for runtime behavior criteria (red phase). Only then begin implementation." The architecture plan places Task 8 (Tests) last, after all implementation tasks (Tasks 1-7). This violates the project's first principle.

The builder must reorder: write tests for each AC before implementing the task that satisfies it. Specifically:
- Hint catalog test update (AC-6) should come before Task 1
- Team routes test (AC-1 endpoint side) should come before Task 2
- WorkTeam component tests (AC-1 through AC-6) should come before Tasks 4-7

This is a process finding, not a structural defect in the plan. The tasks themselves are correct; their ordering needs adjustment.

### CRITICAL-2: AgentConfig type extension has no task owner

The plan identifies that `AgentConfig` in `packages/web/src/settings/settings-types.ts` needs `agentCategory: string | null` added (noted in the Type Signatures section and the Migrations table). But no task is explicitly assigned to make this change. Task 3 (useTeamAgents hook) depends on `AgentConfig` having this field. Task 5 (edit dialog) reads `agentCategory` from the agent config to determine strategy/team behavior.

**Recommendation:** Add the `AgentConfig` extension to Task 1 (shared types) or Task 3 (useTeamAgents hook). Task 1 is cleaner since it already handles type extensions.

---

## WARNING

### WARNING-1: useTeamAgents array identity will cause re-fetch loops

Task 7 wires the hook as: `useTeamAgents(roster.map(m => m.agentId))`. This creates a new array reference on every render. If the hook uses this array as a `useEffect` dependency (which it must, to know when to fetch), it will re-fetch on every render -- an infinite loop.

**Recommendation:** The caller must memoize the ID list:
```ts
const rosterAgentIds = useMemo(() => roster.map(m => m.agentId), [roster]);
const { agents } = useTeamAgents(rosterAgentIds);
```
The architecture should note this explicitly, or the hook should perform its own internal memoization (e.g., JSON.stringify comparison).

### WARNING-2: GET /api/agents fetches all agents system-wide

The `useTeamAgents` hook fetches from `GET /api/agents` (which returns ALL non-system, non-retired agents) and filters client-side. For a single-team/small deployment this is fine. For a deployment with 10 teams and 50+ agents, this fetches the entire agent table (including soulPrompt text up to 50KB each) just to display 3-6 agents.

The plan's "Design-it-twice" section chose Option B over Option A with sound reasoning (don't bloat the team endpoint). But there is an Option C not considered: add an optional `teamId` query parameter to `GET /api/agents` for server-side filtering. This would be a minor change to the existing endpoint.

**Recommendation for V1:** Proceed with client-side filtering as planned. Note this as a known scaling concern. If agent count grows beyond ~20, add server-side filtering.

### WARNING-3: Personal agent behavior not explicitly specified

AC-3 lists three categories: team (fully customizable), strategy (soul editable, config managed), personal (fully user-controlled). The plan describes strategy and team agent behavior in detail but never explicitly states how personal agents behave. From the code and design, personal agents should behave identically to team agents (all fields enabled, no strategy note). This should be stated explicitly so the builder does not add unnecessary special-casing.

### WARNING-4: AbortController missing from edit dialog template fetch

Task 5 (edit dialog) includes a template button that fetches `GET /api/agents/templates/:role`. Task 6 (add dialog) explicitly mentions the "AbortController pattern from SettingsAgents" for its template fetch on role change. Task 5 should also use AbortController -- a user could click "Load template," then quickly close and reopen the dialog for a different agent, causing a stale template to fill the wrong agent's textarea.

### WARNING-5: AgentAddDialog role filter may be too restrictive

Task 6 specifies the role select is "populated from AGENT_ROLE_CATALOG filtered to `category === "team"` entries." But AC-5 says the user can "add a fully custom agent." If the user wants an agent with a custom role not in the catalog, the select-only UI prevents this. The existing SettingsAgents add form shows ALL catalog roles (not filtered by category).

**Question:** Should the create dialog also allow free-text role entry for truly custom agents? Or is selecting from the team-category catalog sufficient for V1? The spec says "picking a domain, writing a soul prompt" which implies selection, not free-text. V1 is likely fine, but the builder should add a comment noting this limitation.

---

## SUGGESTION

### SUGGESTION-1: Consider lazy fetch instead of eager

The plan's "Timing decision" says fetch agent configs eagerly on team page mount. For the 90% case where the user just views the team page and does not open any edit dialog, this is a wasted fetch. Lazy fetch (on first dialog open) with the useTeamAgents hook returning a skeleton in the dialog body would reduce unnecessary network traffic.

The trade-off: eager fetch means instant dialog open; lazy fetch means ~100ms delay on first open. Given that agent configs are small (except soulPrompt), eager is defensible. But the plan should acknowledge this trade-off explicitly.

### SUGGESTION-2: Toast pattern consistency

The plan specifies toast messages: "Agent saved", "Failed to save agent", "Agent created", "Failed to create agent." These match the existing SettingsAgents patterns ("Agent saved", "Failed to save agent", "Agent created", "Failed to create agent"). Good consistency. No action needed.

### SUGGESTION-3: Dialog close on backdrop click

Task 5 states "Escape / backdrop click: native dialog behavior closes it." Native `<dialog>` does NOT close on backdrop click by default -- it only closes on Escape. Backdrop click requires explicit event handling (listen for click on the dialog element, check if the click target is the dialog itself via `e.target === dialogRef.current`). The builder must implement this manually.

### SUGGESTION-4: Story files for dialog components

Frontend rules state "Every custom component must have a `.stories.tsx` file." AgentEditDialog and AgentAddDialog are page-level components in `packages/web/src/pages/`, not design system components. The convention for page-level components is less clear. The builder should add stories if the dialogs are complex enough to benefit from isolated testing in the design system viewer, or skip them if they are page-specific compositions.

---

## Dimension Breakdown

| # | Dimension | Score | Key Observation |
|---|-----------|-------|-----------------|
| 1 | Completeness | 8 | All 6 ACs covered with verification methods. AgentConfig type extension missing from task list. Personal agent behavior implicit. |
| 2 | Type Safety | 8 | Correct type extensions. Proper nullable handling. AgentConfig gap identified in plan but not assigned to a task. |
| 3 | Data Architecture | 8 | Sound two-fetch strategy (team detail + agent configs). Client-side filter is O(n) but acceptable for V1. Eager vs lazy trade-off acknowledged. |
| 4 | Verification | 7 | All ACs have test strategies. Task ordering puts tests last (violates TDD). Personal agent test case not specified. |
| 5 | Ordering | 8 | Dependency chain is correct (1->2->4, 3->5, 5+6->7). Tests should be interleaved, not at the end. |
| 6 | Security | 8 | No new endpoints. Existing Zod validation, rate limiting, founder-only auth cover all mutation paths. soulPrompt XSS mitigated by textarea display. |
| 7 | Reconciliation | 8 | Excellent spec-vs-reality table. Tag amber variant, Avatar 24px, HintId extension, RosterMember extension, users.teamId FK -- all identified and resolved. |
| 8 | Economy | 8 | No database migrations. No new API endpoints. Minimal type extensions. Two new components (edit + add dialogs) are justified by different header structures. |
| 9 | Plan Hygiene | 7 | Required reading list, protected tests, design-it-twice, risks section all present. Task ordering violates TDD. AgentConfig type extension orphaned. |

---

## What's Working Well

- **Spec-vs-reality reconciliation table.** The plan systematically identifies every assumption the design made that does not match the codebase, and documents the resolution. The Tag amber variant, Avatar 24px size, HintId extension, RosterMember extension, and users.teamId FK relationship are all caught and resolved. This is exactly the kind of bridge document that prevents build-time surprises.

- **Design-it-twice on data fetch strategy.** The plan evaluates two options (extend team endpoint vs separate fetch) with explicit trade-offs and a clear winner. The reasoning (don't bloat team response with soulPrompt) is sound.

- **Separate edit and add dialogs.** The plan correctly identifies that merging create/edit into one component would add conditional complexity (editable name + role select vs static display) without benefit. Two small components are cleaner than one conditional component.

- **Security analysis is thorough.** Every STRIDE vector is considered. The plan correctly identifies that existing Zod schemas, rate limiting, and auth middleware cover all mutation paths. No new attack surface is introduced.

- **Correct FK relationship handling.** The plan explicitly calls out `users.teamId` referencing `team_members.id` (not `teams.id`) and names the prop `teamMembersId` to prevent confusion. This catches a subtle bug that would manifest as a FK constraint violation at runtime.
