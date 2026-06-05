# AB3 Architecture Plan

**Workpackage:** AB3 -- Agent Configuration & Customization
**Design input:** `plans/AB3/design/approved.md` (locked -- do not re-litigate)
**Concept input:** `docs/agent-layer/agent-structure.md` (from AB0, locked)

---

## Required reading for downstream skills

These files must be read by `/write-tests`, `/write-code`, and `/review`:

- `plans/AB3/design/approved.md` -- the locked visual contract
- `docs/agent-layer/agent-structure.md` -- agent category taxonomy
- `docs/agent-layer/agent-identity.md` -- soul, harness, model tier fields
- `packages/shared/src/agent-roles.ts` -- AGENT_ROLE_CATALOG, findRoleCatalogEntry
- `packages/shared/src/hint.ts` -- HintId type, HINT_CATALOG, isHintId
- `packages/shared/src/team.ts` -- RosterMember, TeamDetail
- `packages/web/src/pages/WorkTeam.tsx` -- the team page being enhanced
- `packages/web/src/settings/SettingsAgents.tsx` -- existing agent CRUD (pattern reference)
- `packages/web/src/hooks/useHints.tsx` -- useHint hook pattern
- `packages/server/src/routes/agents.ts` -- agent CRUD routes
- `packages/server/src/routes/teams-routes.ts` -- team detail endpoint (roster assembly)
- `packages/db/src/schema.ts` -- users table shape (teamId, agentCategory, soulPrompt, etc.)

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| Tag has amber variant for strategy agents | `Tag` component only supports `kind?: "pattern" \| "decision" \| "failure"`. No amber variant. Without a `kind`, renders neutral gray chip. | Use the neutral Tag (no kind) for both strategy and personal categories. Differentiate by text: "Strategy" vs "Personal". The neutral chip is distinct enough since team agents show no tag at all. Adding an amber Tag kind would require extending TagKind and tag-kinds.tsx -- not justified for one use case. |
| Avatar size "sm" is 24px | Avatar "sm" is 28px (h-[28px] w-[28px]). | Use size="sm" (28px). Close enough to design spec. The design said 24px but the component only offers 28/36/48. Do not create a new size. |
| HintId includes "review-agents" | HintId is a closed union of 5 values. "review-agents" is not in it. | Add "review-agents" to the HintId union and HINT_CATALOG. This is a trivial extension of the existing pattern. |
| RosterMember includes agentCategory | RosterMember is `{ agentId, name, role, isLead }`. No agentCategory. | Extend RosterMember with `agentCategory: string \| null` and update the team detail endpoint to include it. |
| `users.teamId` references `teams.id` | `users.teamId` references `team_members.id` (the membership group, not the team). | When creating a new agent, pass `teamMembers.id` (from `TeamDetail.teamMembers.id`), NOT `team.id`. The existing POST /api/agents already accepts `teamId` which maps to team_members.id. |
| Dialog needs agent detail data (soulPrompt, etc.) | The team detail endpoint returns only `RosterMember` shape (no soulPrompt, harnessType, etc.). GET /api/agents returns full config for ALL agents, not filtered by team. | Add a `useTeamAgents` hook that fetches from GET /api/agents and filters client-side by the agent IDs in the roster. Alternatively, fetch once and cache. This avoids modifying the team endpoint to carry soul prompts (which would bloat the team response for non-AB3 consumers). |
| GET /api/agents returns agentCategory | The GET /api/agents response includes `agentCategory` (confirmed in agents.ts line 129). | No change needed. |

---

## Acceptance Criteria + Verification

### AC-1: Team page surfaces strategy-shipped default agents with clear descriptions

**What:** Each agent card in the roster section shows: avatar, name, role description (from AGENT_ROLE_CATALOG), and category tag for non-team agents.

**Verification:** Vitest component test renders WorkTeam with overrideData containing roster members. Asserts:
- Each `[data-testid="agent-card"]` contains the agent name text.
- Each card contains role description text from the catalog (e.g., "Engineer. Implements features, writes code, tests, deploys." for a builder).
- Non-team agents show a category tag element with text matching their category.
- Team agents do NOT show a category tag.

### AC-2: Edit flow for soul through guided flow

**What:** Clicking an agent card opens a native `<dialog>` with the agent's identity context (name, role, description) and a soul textarea pre-filled with the current soulPrompt. Guidance text explains what the user controls vs what the system handles.

**Verification:** Vitest component test:
- Renders the roster, clicks an agent card.
- Asserts dialog opens (dialog element has `open` attribute or is visible).
- Asserts dialog contains guidance text "Personality, style, and values."
- Asserts soul textarea is pre-filled with the agent's soulPrompt.
- Asserts dialog header shows agent name, role label, and description.

### AC-3: Edit flow respects categories

**What:** Strategy agents show an amber-tinted note about strategy management. Their configuration fields are disabled. Team agents have no note and all fields enabled.

**Verification:** Vitest component test:
- For a strategy agent: asserts the strategy note text is present. Asserts config fields (when shown) are disabled.
- For a team agent: asserts no strategy note. Asserts config fields (when shown) are enabled.

### AC-4: Harness and model tier adjustable

**What:** The configuration section (toggled open) shows harness type input, model tier select, and max sessions input. Save persists changes via PATCH /api/agents/:id.

**Verification:**
- Vitest component test: open dialog, toggle config open, change model tier, click save. Assert PATCH was called with the new modelTierPreference value.
- Server integration test: PATCH /api/agents/:id with `{ modelTierPreference: "reasoning" }` returns 200 and the updated value.

### AC-5: Add fully custom agent (10% flow)

**What:** A "+ Add agent" button below the roster opens a create dialog. User enters name, selects role, writes soul, sets config. Create calls POST /api/agents with teamId.

**Verification:**
- Vitest component test: clicks "+ Add agent", fills name and selects role, clicks "Create". Asserts POST /api/agents was called with the entered data and the correct teamId (teamMembers.id).
- Server integration test: POST /api/agents with valid data returns 201 with the created agent.

### AC-6: First-time hint with "Review & customize" affordance

**What:** On first visit, a green-tinted hint banner appears above the roster with copy about reviewing agents. Dismissing it persists via the hint-progress API.

**Verification:**
- Vitest component test: renders WorkTeam with hint not dismissed. Asserts `[data-testid="hint-review-agents"]` is visible. Clicks "Got it". Asserts dismiss was called.
- The "review-agents" HintId exists in HINT_CATALOG (verified by existing hint.test.ts after we add the entry).

---

## Ordered Task List

### Task 1: Extend shared types

**Files:**
- `packages/shared/src/team.ts` -- add `agentCategory` to `RosterMember`
- `packages/shared/src/hint.ts` -- add `"review-agents"` to `HintId` union and `HINT_CATALOG`

**Details:**

1a. Extend `RosterMember`:
```ts
export interface RosterMember {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
  agentCategory: string | null;  // NEW: "team" | "strategy" | "personal" | null
}
```

1b. Add hint entry:
```ts
// In HintId union:
export type HintId =
  | "create-bet"
  | "add-credential"
  | "knowledge-empty"
  | "review-verdict"
  | "rail-indicators"
  | "review-agents";  // NEW

// In HINT_CATALOG:
{
  id: "review-agents",
  copy: "Your team's agents are ready. Click any agent to review and personalize their style.",
  testId: "hint-review-agents",
},
```

**Tests that need updating:**
- `packages/shared/src/__tests__/hint.test.ts` -- the test asserts specific hint IDs and `HINT_CATALOG.length >= 5`. Adding a 6th entry does not break the >= 5 assertion. The ordered ID list assertion will need the new entry added.

**Depends on:** Nothing.

### Task 2: Update team detail endpoint

**Files:**
- `packages/server/src/routes/teams-routes.ts` -- include `agentCategory` in roster assembly

**Details:**

In the GET /:id handler, the roster assembly currently maps `agentRows` to `RosterMember` without `agentCategory`. Add it:

```ts
const roster: RosterMember[] = agentRows.map((agent) => ({
  agentId: agent.id,
  name: agent.name,
  role: agent.role,
  isLead: agent.id === memberGroup.leadAgentId,
  agentCategory: agent.agentCategory ?? null,  // NEW
}));
```

**Tests:** Existing team route tests may assert on roster shape. If so, add `agentCategory` to expected objects.

**Depends on:** Task 1 (RosterMember type).

### Task 3: Add useTeamAgents hook

**Files:**
- `packages/web/src/hooks/useTeamAgents.ts` -- NEW file

**Details:**

A hook that fetches full agent config data for agents on a specific team. Used by the edit dialog to get soulPrompt, harnessType, etc.

```ts
import type { AgentConfig } from "../settings/settings-types.js";

interface UseTeamAgentsResult {
  agents: Map<string, AgentConfig>;  // keyed by agent id
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTeamAgents(
  rosterAgentIds: readonly string[]
): UseTeamAgentsResult
```

Implementation:
- Fetch from `GET /api/agents` (existing endpoint).
- Filter response to only agents whose `id` is in `rosterAgentIds`.
- Return as a Map keyed by agent id for O(1) lookup.
- Provide `refetch` for post-save refresh.
- Lazy fetch: only fetches when the map is empty and rosterAgentIds is non-empty. The dialog open triggers the fetch (or it is fetched eagerly when the team page loads -- either is acceptable).

**Why not extend the team endpoint:** The team endpoint is used by WorkTeam, portfolio, and potentially other consumers. Including soulPrompt (which can be up to 50KB) in every team response would bloat the payload for consumers that do not need it.

**Depends on:** Nothing (uses existing API).

### Task 4: Enhance roster section (R3) in WorkTeam

**Files:**
- `packages/web/src/pages/WorkTeam.tsx` -- modify the R3 section in `WorkTeamLoaded`

**Details:**

Replace the current flat roster rows with enhanced agent cards per the approved design:

- Each agent rendered as a clickable `<button>` card with `bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px]`.
- Row 1: `Avatar` (sm, agent=true) + name + category Tag (non-team only) + lead indicator + "Customize" Button (ghost xs).
- Row 2: Role description from `findRoleCatalogEntry(member.role)?.description ?? member.role`.
- Import `Avatar`, `Tag` from `@hyperidle/design-system`.
- Import `findRoleCatalogEntry` from `@hyperidle/shared`.

The "Customize" button opens the edit dialog (Task 5). For now, wire it to set an `editingAgentId` state.

Add the first-time hint (using `useHint("review-agents")`) above the roster cards, following the `hintCreateBet` pattern already in WorkTeam.

**data-testid attributes:**
- `data-testid="agent-card"` on each card button
- `data-testid="agent-card-name"` on the name span
- `data-testid="agent-card-description"` on the description span
- `data-testid="agent-card-category"` on the category Tag (when present)
- `data-testid="hint-review-agents"` on the hint banner

**Depends on:** Task 1 (RosterMember.agentCategory), Task 2 (endpoint returns it).

### Task 5: Build the edit dialog

**Files:**
- `packages/web/src/pages/AgentEditDialog.tsx` -- NEW file (page-level component, not a design-system component)

**Details:**

A React component that renders a native `<dialog>` for editing an agent's soul and configuration.

```ts
interface AgentEditDialogProps {
  agent: AgentConfig | null;      // null = dialog closed
  rosterMember: RosterMember | null;  // for name/role context from roster
  onClose: () => void;
  onSaved: () => void;            // triggers refetch
}
```

Implementation:
- Uses a `ref` to the `<dialog>` element. When `agent` transitions from null to non-null, call `dialogRef.current.showModal()`. When agent becomes null, call `dialogRef.current.close()`.
- Header: agent name (17px semibold), role label (from catalog), category Tag for strategy agents, role description (from catalog).
- Soul section: section header "SOUL" (12px uppercase tertiary), guidance text, strategy note (if strategy category), textarea pre-filled from agent.soulPrompt.
- Template button: visible when soulPrompt is empty and `findRoleCatalogEntry(role)?.hasTemplate` is true. Fetches from `GET /api/agents/templates/:role`.
- Config section: hidden by default behind a "Show configuration" toggle (React state boolean). When shown: harness input, model tier select, max sessions input. Strategy agents: fields disabled.
- Footer: Cancel (closes dialog) + Save (PATCH /api/agents/:id).
- On save success: call `onSaved()`, close dialog, show toast.
- On save error: show toast.
- Escape / backdrop click: native dialog behavior closes it.

**State management:**
- `editFormValues` state mirroring the SettingsAgents pattern (`{ soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions }`).
- `configVisible` boolean state for the toggle.
- `saving` boolean state.
- `templateLoading` boolean state.

**Depends on:** Task 3 (useTeamAgents provides AgentConfig data).

### Task 6: Build the add dialog

**Files:**
- `packages/web/src/pages/AgentAddDialog.tsx` -- NEW file

**Details:**

A create-mode dialog reusing the visual structure of the edit dialog. This is a separate component because the header is fundamentally different (editable name + role select vs static display) and merging create/edit into one component would add conditional complexity without benefit.

```ts
interface AgentAddDialogProps {
  open: boolean;
  teamMembersId: string;          // users.teamId references team_members.id
  onClose: () => void;
  onCreated: () => void;          // triggers refetch
}
```

Implementation:
- Header: Name input + Role select (from AGENT_ROLE_CATALOG, filtered to `category === "team"` entries). Description updates dynamically from catalog.
- Soul section: same as edit, but template auto-loads on role change (AbortController pattern from SettingsAgents).
- Config section: starts expanded.
- Footer: Cancel + Create (POST /api/agents with `{ name, role, soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions, teamId: teamMembersId }`).
- On success: call `onCreated()`, close, toast.

**Depends on:** Nothing directly, but wired into WorkTeam in Task 7.

### Task 7: Wire dialogs into WorkTeam

**Files:**
- `packages/web/src/pages/WorkTeam.tsx` -- add dialog state management and rendering

**Details:**

In `WorkTeamLoaded`:
1. Add state: `editingAgentId: string | null`, `addDialogOpen: boolean`.
2. Call `useTeamAgents(roster.map(m => m.agentId))` to get full agent configs.
3. Render `AgentEditDialog` with the selected agent's config when `editingAgentId` is set.
4. Render `AgentAddDialog` when `addDialogOpen` is true. Pass `teamMembers.id` as `teamMembersId`.
5. Wire the "Customize" button click to set `editingAgentId`.
6. Wire the "+ Add agent" button to set `addDialogOpen = true`.
7. On `onSaved` / `onCreated`: trigger refetch of both team data (useTeam) and agent configs (useTeamAgents).

The `+ Add agent` ghost button is placed below the roster cards, inside the roster section.

**Depends on:** Tasks 3, 4, 5, 6.

### Task 8: Tests

**Files:**
- `packages/shared/src/__tests__/hint.test.ts` -- update to include "review-agents"
- `packages/web/src/pages/__tests__/WorkTeam.test.tsx` -- add AB3 tests (or create if doesn't exist)
- `packages/server/src/routes/__tests__/teams-routes.test.ts` -- verify agentCategory in roster response

**Details:**

8a. **Hint catalog test update:** Add "review-agents" to the expected ordered ID list in the existing hint test.

8b. **WorkTeam component tests (new test block):**
- Render with overrideData containing agents with various categories.
- Assert agent cards show name, description, and category tags.
- Assert hint banner visible when hint is not dismissed.
- Click "Customize" -> assert dialog opens with agent name and soul textarea.
- Modify soul -> click Save -> assert PATCH called.
- Click "+ Add agent" -> assert create dialog opens.
- Fill name/role -> click "Create" -> assert POST called with teamMembersId.

8c. **Team routes integration test (verify agentCategory):**
- Existing test suite for GET /api/teams/:id. Add assertion that roster members include `agentCategory` field.

**Depends on:** Tasks 1-7.

---

## Type Signatures

### RosterMember (extended)
```ts
// packages/shared/src/team.ts
export interface RosterMember {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
  agentCategory: string | null;
}
```

### HintId (extended)
```ts
// packages/shared/src/hint.ts
export type HintId =
  | "create-bet"
  | "add-credential"
  | "knowledge-empty"
  | "review-verdict"
  | "rail-indicators"
  | "review-agents";
```

### useTeamAgents hook
```ts
// packages/web/src/hooks/useTeamAgents.ts
import type { AgentConfig } from "../settings/settings-types.js";

export interface UseTeamAgentsResult {
  agents: Map<string, AgentConfig>;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTeamAgents(rosterAgentIds: readonly string[]): UseTeamAgentsResult;
```

### AgentEditDialog props
```ts
// packages/web/src/pages/AgentEditDialog.tsx
import type { AgentConfig } from "../settings/settings-types.js";
import type { RosterMember } from "@hyperidle/shared";

export interface AgentEditDialogProps {
  agent: AgentConfig | null;
  rosterMember: RosterMember | null;
  onClose: () => void;
  onSaved: () => void;
}
```

### AgentAddDialog props
```ts
// packages/web/src/pages/AgentAddDialog.tsx
export interface AgentAddDialogProps {
  open: boolean;
  teamMembersId: string;
  onClose: () => void;
  onCreated: () => void;
}
```

### AgentConfig (existing, no changes)
```ts
// packages/web/src/settings/settings-types.ts
export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  soulPrompt: string | null;
  harnessType: string | null;
  modelTierPreference: string | null;
  maxConcurrentSessions: number;
  status: string;
  activeSessions: number;
}
```

Note: `AgentConfig` does NOT include `agentCategory`. The GET /api/agents response DOES include it (line 129 of agents.ts), but the `AgentConfig` interface in settings-types.ts omits it. **This needs to be fixed:** add `agentCategory: string | null` to `AgentConfig` so the edit dialog can read it.

---

## Design-it-twice: Agent data fetch strategy

### Option A: Extend team endpoint with agent config
Add soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions to RosterMember in the team endpoint response.

- **Shape:** One fetch per page load. All data available immediately.
- **Trade-off:** Bloats TeamDetail for all consumers. soulPrompt can be up to 50KB per agent. A team with 6 agents could add 300KB to the team response.
- **Reject because:** Violates separation of concerns. The team endpoint serves the team overview page (bets, burn, roster names). Agent config is a different data domain fetched on demand.

### Option B: Separate fetch from GET /api/agents (chosen)
Use the existing GET /api/agents endpoint. Filter client-side to team agents. Fetch lazily (on page load or on dialog open).

- **Shape:** Two fetches: one for team detail, one for agent configs. Dialog opens fast if pre-fetched, or shows skeleton if lazy.
- **Trade-off:** Extra HTTP request. Slight latency for first dialog open if lazy.
- **Chosen because:** Clean separation. Team endpoint stays lean. Agent config is only needed when the user interacts with the edit flow. The existing endpoint already returns everything needed.

**Timing decision:** Fetch eagerly on team page mount (alongside the team detail fetch). The agent list is small (typically 3-6 agents) and the response is lightweight (excluding soulPrompt text, which is just a string column). Pre-fetching means the dialog opens instantly.

---

## Risks and Ambiguities

1. **AgentConfig type drift.** The `AgentConfig` interface in `settings-types.ts` was written for X3 and does not include `agentCategory`. It must be extended. This is a Type 1 (easy fix) risk.

2. **Tag component limitation.** The approved design specified amber Tags for strategy agents, but the Tag component only has three kinds (pattern/decision/failure) and neutral. Using neutral Tags for both strategy and personal agents means they look the same visually. The text content ("Strategy" vs "Personal") is the only differentiator. This is acceptable for V1 but may need revisiting if the category distinction needs to be more visually prominent.

3. **users.teamId references team_members.id, not teams.id.** The create flow must pass `teamMembers.id` from `TeamDetail.teamMembers.id`. If a caller accidentally passes `team.id`, the FK constraint will reject it. The `AgentAddDialog` prop is explicitly named `teamMembersId` to prevent this confusion.

4. **Template fetch for custom roles.** If a user creates an agent with a role not in the catalog, GET /api/agents/templates/:role will return 404. The create dialog should handle this gracefully (leave soul textarea empty, no error toast).

5. **Refetch coordination.** After saving or creating an agent, both the team data (useTeam) and agent configs (useTeamAgents) need to refresh. The team data refresh updates the roster display; the agent config refresh updates the dialog data. Both hooks expose a refetch mechanism. The `onSaved`/`onCreated` callbacks trigger both.

---

## Security & Abuse Cases

| Vector | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST /PATCH | Yes | Existing rate limiting on the agent routes (X3 established these). No new endpoints added. |
| Input trust: soulPrompt | Yes | soulPrompt is user-authored text stored as-is. Max 50,000 chars enforced by Zod schema in agents.ts (line 35). No HTML rendering -- displayed in a textarea. XSS not applicable. |
| Input trust: agent name | Yes | Max 200 chars enforced by Zod (line 32). Displayed as text content, not innerHTML. |
| Input trust: role string | Yes | Max 100 chars enforced by Zod (line 33). Open vocabulary -- any string accepted. |
| Secret handling | N/A | No new credential surfaces. |
| Path traversal | N/A | No file path inputs. |
| SSRF | N/A | No outbound URL inputs. |
| Authorization | Partially | Agent routes use founder-only auth (X3). AB3 does not change auth. Team leads who are not founders cannot edit agents. This is a known limitation documented in X3 -- not in scope for AB3. |

---

## Protected Tests

```
protectedTests:
  - packages/shared/src/__tests__/hint.test.ts
  - packages/server/src/routes/__tests__/hints.test.ts
```

These tests validate the hint system. We add to them (new hint ID) but must not remove or weaken existing assertions.

---

## Migrations

| Symbol | Change | Affected files |
|---|---|---|
| `RosterMember` interface | Add `agentCategory` field | `packages/shared/src/team.ts`, `packages/server/src/routes/teams-routes.ts` (roster assembly), any test that asserts on RosterMember shape |
| `HintId` type | Add `"review-agents"` value | `packages/shared/src/hint.ts`, `packages/shared/src/__tests__/hint.test.ts` (expected IDs list) |
| `AgentConfig` interface | Add `agentCategory` field | `packages/web/src/settings/settings-types.ts` |
| WorkTeam R3 section | Replace flat rows with enhanced cards | `packages/web/src/pages/WorkTeam.tsx`, any WorkTeam tests that assert on roster DOM structure |

No database migrations. No route renames. No breaking API changes (adding a field to a response is additive).
