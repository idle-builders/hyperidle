# AB3 — Agent Setup Wizard: Architecture Plan

## Required reading

- `plans/AB3/design/approved.md` — the locked visual contract (do not re-litigate)
- `packages/web/src/pages/WorkTeam.tsx` — the host page
- `packages/web/src/pages/work/BetCreateDialog.tsx` — reference dialog pattern
- `packages/server/src/routes/agents.ts` — existing agent CRUD API
- `packages/server/src/routes/workers.ts` — GET /api/workers (adapter list)
- `packages/server/src/routes/model-gateway.ts` — GET /api/model-gateway (tier config)
- `packages/server/src/harness/adapter-pool.ts` — AdapterInfo type shape
- `packages/shared/src/team.ts` — TeamDetail type (includes teamMembers.id)
- `packages/web/src/settings/SettingsAgents.tsx` — existing agent creation UI (for context, not reuse)
- `packages/web/src/settings/settings-types.ts` — AgentConfig type
- `packages/shared/src/types.ts` — USER_ROLES, MODEL_TIERS constants

## Phase 0 — Interrogation

### Q1: teamId mapping — teams.id vs team_members.id

**Issue:** The WorkTeam page URL uses `teams.id` (e.g., `team-abc123`). But `users.teamId` references `team_members.id` (a separate UUID). The `POST /api/agents` endpoint's `teamId` field is wired to `users.teamId`, which goes to `team_members`.

**Resolution:** The `TeamDetail` response from `GET /api/teams/:teamId` already includes `teamMembers: { id: string }`. The WorkTeam page already has this via `data.teamMembers.id`. The wizard passes `data.teamMembers.id` as the `teamId` in the `POST /api/agents` call. No API changes needed.

### Q2: Name uniqueness scope

**Issue:** AC says "agent name must be unique within the team." The existing `GET /api/agents` returns all agents across all teams. Client-side filtering is needed.

**Resolution:** The wizard already has the `TeamDetail.roster` array which contains all agents on this team. Name uniqueness can be checked client-side against this roster, plus any newly fetched agents list. Since the roster is a small list (typical <20 agents), client-side check is sufficient. No server-side unique constraint is added (names are not database-unique today and changing that would affect existing data).

### Q3: Workers endpoint auth

**Issue:** `GET /api/workers` requires `X-API-Key` header. The `apiFetch` wrapper injects this header automatically for all `/api/*` requests. Confirmed from `api-fetch.ts`.

**Resolution:** No issue. `apiFetch("/api/workers")` will work.

### Q4: What "harness must be available" means

**Issue:** AC says "selected harness must be available." The `GET /api/workers` response includes `paused: boolean` per adapter. A paused adapter is technically registered but not usable.

**Resolution:** Filter the workers list to exclude paused adapters. Only show non-paused adapters in the harness select. If all adapters are paused or none exist, show the amber warning.

### Q5: What "model tier must have a configured provider" means

**Issue:** `GET /api/model-gateway` returns `{ reasoning: { provider, model, hasApiKey }, workhorse: {...}, fast: {...} }`. A tier is "configured" if it has a provider set (not "none") and hasApiKey is true for providers that need a key.

**Resolution:** For `anthropic` and `openrouter` providers, check `hasApiKey`. For `openai-compatible`, check `hasApiKey` AND `baseUrl` is non-empty. For the default/empty state, the tier is considered unconfigured. The wizard shows an amber warning if the selected tier fails these checks.

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `POST /api/agents` accepts `teamId` | Yes -- `createAgentSchema` has `teamId: z.string().nullable().optional()` | Use as-is. Pass `teamMembers.id`. |
| `GET /api/agents/templates/:role` exists | Yes -- returns `{ role, content }` | Use as-is. |
| `GET /api/workers` returns adapter list | Yes -- returns `AdapterInfo[]` with `id, name, kind, type, currentLoad, maxConcurrent, paused` | Use as-is. Filter out paused adapters. |
| `GET /api/model-gateway` returns tier config | Yes -- returns `Record<ModelTier, { provider, model, baseUrl?, hasApiKey }>` | Use as-is. |
| `users.teamId` references `team_members.id` | Yes -- FK constraint confirmed in schema.ts | Wizard receives `teamMembers.id` from TeamDetail, passes to POST /api/agents. |
| `USER_ROLES` and `MODEL_TIERS` constants exist | Yes -- `packages/shared/src/types.ts` | Import directly. |
| Only 3 roles have templates: `product_manager`, `practice_facilitator`, `chief_of_staff` | Yes -- confirmed in seed.ts soul template list | Role cards match: 3 presets + custom. |
| Roster section in WorkTeam has testid `team-roster` | Yes -- confirmed in WorkTeam.tsx | |
| EmptyState has `action` prop | Yes -- confirmed in EmptyState.tsx | Use for zero-agent CTA. |
| BetCreateDialog uses native `<dialog>` + showModal | Yes -- confirmed pattern | Follow same pattern. |

No spec/reality gaps found. All referenced symbols exist with expected shapes.

## Acceptance criteria + verification

### AC-1: Wizard dialog opens from team page

**Criterion:** A team lead can click "+ Add agent" in the WorkTeam roster section to open the agent setup dialog.

**Verification:** Vitest component test: render WorkTeam with overrideData containing a roster with 1+ agents. Assert a button with text "+ Add agent" is present. Click it. Assert a dialog element with aria-label "Create new agent" is in the DOM.

### AC-2: Empty state CTA opens wizard

**Criterion:** When the team has zero agents, the roster section shows an EmptyState with "Add first agent" button that opens the wizard.

**Verification:** Vitest component test: render WorkTeam with overrideData where `roster: []`. Assert EmptyState title "No agents on this team" is visible. Click "Add first agent" button. Assert dialog opens.

### AC-3: Step 1 shows role cards with descriptions

**Criterion:** The wizard Step 1 shows 3 preset role cards (Product Manager, Practice Facilitator, Chief of Staff) and 1 Custom card. Each card has a name and description. Selecting a card enables the "Next" button.

**Verification:** Vitest component test: open wizard dialog. Assert 4 role cards are rendered with expected names. Assert "Next" button is disabled initially. Click "Product Manager" card. Assert it gets selected state (aria-pressed or data-selected). Assert "Next" is enabled.

### AC-4: Role selection pre-fills soul prompt template

**Criterion:** Selecting a role in Step 1 fetches the soul prompt template from `GET /api/agents/templates/:role` and pre-fills the textarea in Step 2.

**Verification:** Vitest component test: mock `apiFetch` to return template content for product_manager. Select Product Manager, click Next. Assert textarea value contains the template text. Test the Custom role: select Custom, click Next. Assert textarea is empty.

### AC-5: Step 2 validates agent name

**Criterion:** Step 2 requires a non-empty name. If the name matches an existing agent on the team, an error message is shown. "Next" is disabled until name is valid.

**Verification:** Vitest component test: open wizard to Step 2. Assert "Next" is disabled when name input is empty. Type "Nova" (not in roster). Assert "Next" is enabled. Clear input and type the name of an existing roster member. Assert error text "already exists" is visible and "Next" is disabled.

### AC-6: Step 3 shows harness select populated from workers

**Criterion:** Step 3 shows a select dropdown populated from `GET /api/workers` response. Only non-paused adapters are shown.

**Verification:** Vitest component test: mock `apiFetch` for /api/workers returning 2 adapters (one paused, one not). Open wizard to Step 3. Assert select has 1 option (the non-paused one). Mock with 0 non-paused adapters: assert amber warning text and "Create agent" disabled.

### AC-7: Step 3 shows model tier select with validation

**Criterion:** Step 3 shows a model tier select with three options. Default is "workhorse". If the selected tier has no configured provider, an amber validation warning is shown.

**Verification:** Vitest component test: mock `GET /api/model-gateway` where reasoning tier has `hasApiKey: false`. Open wizard to Step 3. Assert workhorse is default selected. Change to reasoning. Assert amber warning about unconfigured provider.

### AC-8: Validation before creation

**Criterion:** "Create agent" is enabled only when: a harness is available, name is non-empty, name is unique within team.

**Verification:** Vitest component test: walk through all steps with valid data. Assert "Create agent" is enabled. Clear the name (go back to Step 2, clear name, return). Assert "Create agent" is disabled.

### AC-9: Successful creation calls POST /api/agents

**Criterion:** Clicking "Create agent" sends `POST /api/agents` with `{ name, role, soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions: 1, teamId }` and shows success state on 201 response.

**Verification:** Vitest component test: mock `POST /api/agents` returning 201 with AgentConfig response. Walk through wizard and click "Create agent". Assert fetch was called with expected body. Assert success state is rendered with "Agent created" text.

### AC-10: Success state shows next steps

**Criterion:** After creation, the dialog shows "Agent created" with next-step links: "Assign to a bet" and "View in settings". "Done" button closes dialog.

**Verification:** Vitest component test: after successful creation, assert "Agent created" title visible. Assert "Done" button exists. Click "Done". Assert dialog is closed.

### AC-11: First-time users see prominent CTA

**Criterion:** First-time users with no agents see a prominent call-to-action on the team page guiding them to create their first agent.

**Verification:** Same as AC-2 -- the EmptyState with action prop IS the prominent CTA. Verified by the same test.

## Ordered task list

### Task 1: Create AgentSetupDialog component

**Files:**
- `packages/web/src/pages/work/AgentSetupDialog.tsx` (new)
- `packages/web/src/pages/work/AgentSetupDialog.stories.tsx` (new)

**What:** A new local component following the BetCreateDialog pattern. Native `<dialog>` with `showModal()`. Three-step wizard with stepper dots, step body content, and fixed footer.

**Props:**
```typescript
export interface AgentSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** team_members.id — passed to POST /api/agents as teamId */
  teamMembersId: string;
  /** Existing agent names on this team — for uniqueness validation */
  existingAgentNames: string[];
}
```

**Internal state:**
```typescript
type WizardStep = 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
  // Step 1
  selectedRole: string | null;  // role id or "custom"
  // Step 2
  name: string;
  soulPrompt: string;
  // Step 3
  harnessType: string;
  modelTierPreference: string;
  // Fetched data
  templateContent: string | null;
  templateLoading: boolean;
  workers: AdapterInfo[];
  workersLoading: boolean;
  gatewayConfig: GatewayValidation | null;
  gatewayLoading: boolean;
  // Submission
  creating: boolean;
  created: boolean;
  error: string | null;
}
```

**Data fetching on dialog open (parallel):**
1. `GET /api/workers` -> filter paused, extract harness options
2. `GET /api/model-gateway` -> extract tier validation info

**Template fetch on role select:**
3. `GET /api/agents/templates/:role` -> pre-fill soul prompt

**Dependencies:** None. Can be built first.

### Task 2: Integrate AgentSetupDialog into WorkTeam

**Files:**
- `packages/web/src/pages/WorkTeam.tsx` (modify)

**What:**
1. Add `const [wizardOpen, setWizardOpen] = useState(false)` state.
2. In the roster section empty state (currently "Roster not configured"), replace with EmptyState using `action` prop:
   ```tsx
   <EmptyState
     title="No agents on this team"
     description="Add your first agent to start building with AI. The wizard walks you through setup in under a minute."
     action={
       <button className="btn btn-sm btn-primary min-h-[44px]" style={{ borderRadius: 'var(--r-pill)' }} onClick={() => setWizardOpen(true)}>
         Add first agent
       </button>
     }
   />
   ```
3. Below the roster rows (when roster is non-empty), add the "+ Add agent" button:
   ```tsx
   <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setWizardOpen(true)}>
     + Add agent
   </button>
   ```
4. Render the dialog:
   ```tsx
   <AgentSetupDialog
     open={wizardOpen}
     onClose={() => setWizardOpen(false)}
     onCreated={() => { setWizardOpen(false); /* trigger team data refetch */ }}
     teamMembersId={data.teamMembers.id}
     existingAgentNames={roster.map(m => m.name)}
   />
   ```

**Refetch strategy:** After creation, call `window.location.reload()` as a simple approach (matching the pattern used elsewhere). Alternatively, if useTeam exposes a refetch method, use that. The simplest approach is to pass a callback that triggers the useTeam hook to re-fetch.

**Dependencies:** Task 1.

### Task 3: Write unit tests

**Files:**
- `packages/web/src/pages/work/__tests__/AgentSetupDialog.test.tsx` (new)

**What:** Tests for AC-1 through AC-10. Each test:
1. Mocks `apiFetch` for the relevant endpoints
2. Renders the dialog (or WorkTeam with overrideData)
3. Interacts via `userEvent`
4. Asserts the expected behavior

**Test structure:**
```
describe("AgentSetupDialog", () => {
  it("AC-1: opens from WorkTeam + Add agent button")
  it("AC-2: empty state CTA opens wizard")
  it("AC-3: Step 1 shows role cards, Next disabled until selection")
  it("AC-4: role selection pre-fills soul prompt template")
  it("AC-4b: Custom role leaves soul prompt empty")
  it("AC-5: validates agent name non-empty and unique")
  it("AC-6: Step 3 harness select from workers, excludes paused")
  it("AC-6b: no available harness shows warning")
  it("AC-7: model tier default workhorse, amber warning on unconfigured tier")
  it("AC-8: Create button disabled when validation fails")
  it("AC-9: successful creation calls POST /api/agents with correct body")
  it("AC-10: success state shows next steps, Done closes dialog")
  it("Escape closes dialog")
  it("Cancel closes dialog")
})
```

**Dependencies:** Task 1, Task 2.

### Task 4: Write stories

**Files:**
- `packages/web/src/pages/work/AgentSetupDialog.stories.tsx` (new)

**What:** Stories showing key states:
- Step 1 (role selection)
- Step 2 (identity, template pre-filled)
- Step 3 (review, all valid)
- Step 3 (review, validation warning)
- Success state

**Dependencies:** Task 1.

## Type signatures

### New types (in AgentSetupDialog.tsx, local to the component)

```typescript
/** Harness option derived from GET /api/workers AdapterInfo */
interface HarnessOption {
  type: string;      // adapter type (e.g., "builtin", "claude-code")
  name: string;      // adapter display name
}

/** Tier validation info derived from GET /api/model-gateway */
interface TierValidation {
  tier: string;
  configured: boolean;  // has provider + credentials
}

/** Role preset for Step 1 */
interface RolePreset {
  id: string;                // USER_ROLES value or "custom"
  name: string;              // display name
  description: string;       // one-line description
  initials: string;          // 2-char for avatar
  hasTemplate: boolean;      // true for preset roles, false for custom
}

const ROLE_PRESETS: readonly RolePreset[] = [
  { id: "product_manager", name: "Product Manager", description: "Shapes bets, writes pitches, defines done conditions", initials: "PM", hasTemplate: true },
  { id: "practice_facilitator", name: "Practice Facilitator", description: "Curates knowledge, coaches skills, maintains standards", initials: "PF", hasTemplate: true },
  { id: "chief_of_staff", name: "Chief of Staff", description: "Cross-team patterns, obstacle reports, principle stewardship", initials: "CS", hasTemplate: true },
  { id: "custom", name: "Custom", description: "Write your own soul prompt for a specialized agent", initials: "?", hasTemplate: false },
] as const;
```

### Existing API contracts used (no changes)

```
POST /api/agents
  Body: { name: string, role: UserRole, soulPrompt?: string | null, harnessType?: string | null, modelTierPreference?: ModelTier | null, maxConcurrentSessions: number, teamId?: string | null }
  Response 201: AgentConfig

GET /api/agents/templates/:role
  Response 200: { role: string, content: string }
  Response 404: { error: string, code: "NOT_FOUND" }

GET /api/workers
  Response 200: AdapterInfo[]

GET /api/model-gateway
  Response 200: Record<ModelTier, { provider: ModelProvider, model: string, baseUrl?: string, hasApiKey: boolean }>
```

## Risks and ambiguities

### Risk 1: Workers endpoint returns empty list on fresh install

If no worker processes are running, `GET /api/workers` returns `[]`. The wizard must handle this gracefully -- the harness select shows no options and the create button is disabled with an explanation.

**Mitigation:** The wizard always registers the builtin adapter. From `adapter-pool.ts`: `createDefaultAdapterPool()` always registers `builtin` and `claude-code`. So in practice, the list is never empty when the server is running. But the UI handles the empty case defensively.

### Risk 2: Template fetch fails silently

If `GET /api/agents/templates/:role` returns 404 (role has no template) or fails with a network error, the soul prompt textarea should be empty with a hint. The user can still proceed -- an empty soul prompt is valid.

**Mitigation:** The existing SettingsAgents already handles this pattern (line 121-134 of SettingsAgents.tsx). Follow the same approach: catch errors, leave textarea empty.

### Risk 3: Race condition on rapid role changes

If the user rapidly switches between roles in Step 1, template fetches may return out of order.

**Mitigation:** Use an AbortController (same pattern as SettingsAgents.tsx line 107-135). Abort the previous template fetch when a new role is selected.

## Security & abuse cases

| Vector | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST | N/A -- uses existing `POST /api/agents` which is behind the global rate limiter (60 req/min) | Existing control. |
| Input-trust boundary (agent-authored) | N/A -- this is human-authored input (team lead fills the form) | No agent-authored fields. |
| Secret handling | N/A -- no new credential surfaces. Model gateway credentials are managed separately. | N/A. |
| Path traversal | N/A -- no path inputs. | N/A. |
| SSRF | N/A -- no outbound URL inputs. | N/A. |
| XSS via soul prompt | Low risk -- soul prompt is stored as text and rendered in a `<textarea>` (not as HTML). | Existing sanitization in the textarea element. |
| Denial via large soul prompt | Low risk -- `createAgentSchema` has `z.string().max(50_000)` on soulPrompt. | Existing validation. |

## Protected tests

```
protectedTests: [
  "packages/web/src/__tests__/WorkProduct.test.tsx"
]
```

The existing WorkProduct (WorkTeam) tests assert roster rendering behavior. The AC-2 change to the empty state must not break existing roster tests. The test file asserts `team-roster-row` testids which should remain unchanged.

## Migrations

### EmptyState change in WorkTeam roster section

**Current:** When `roster.length === 0`, renders `<EmptyState title="Roster not configured" description="No agents are assigned to this team." />`

**New:** Same EmptyState with different copy and an `action` prop.

**Affected files:**
- `packages/web/src/pages/WorkTeam.tsx` -- modify the `roster.length === 0` branch (line 301-304)
- `packages/web/src/__tests__/WorkProduct.test.tsx` -- may need to update assertions if they check for "Roster not configured" text

### No database migrations

No schema changes. All API endpoints already exist. No new tables, columns, or indexes.

### No route changes

No new routes. The wizard is a dialog component, not a page.

## Design-it-twice: Dialog lifecycle

### Option A: Dialog manages its own data fetching

The dialog component fetches workers + gateway config on mount (when `open` becomes true). Self-contained. No parent involvement.

**Trade-off:** The dialog re-fetches every time it opens. For workers/gateway data that rarely changes, this is wasteful but correct. 
**Reject reason:** None -- this is the right approach. It matches BetCreateDialog which fetches teams data internally.

### Option B: Parent pre-fetches, passes as props

WorkTeam pre-fetches workers and gateway config and passes them as props to the dialog.

**Trade-off:** Avoids re-fetching but couples the parent to the dialog's data needs. WorkTeam shouldn't know about workers or model gateway.
**Reject reason:** Violates separation of concerns. WorkTeam is a team view, not an agent configuration surface.

**Decision:** Option A. The dialog manages its own data fetching. This is self-contained, matches existing patterns, and the cost of re-fetching two small endpoints on dialog open is negligible.

## Implementation notes for the builder

1. **Follow BetCreateDialog pattern exactly** for dialog lifecycle: `showModal()` in useEffect when `open` changes, JSDOM fallback with `setAttribute("open", "")`, cleanup on close.

2. **The `teamMembersId` prop** is `data.teamMembers.id` from TeamDetail, NOT `data.team.id`. This is the FK target for `users.teamId`. Getting this wrong creates orphaned agents.

3. **Role for API call:** When the user selects "Custom", the role sent to `POST /api/agents` should default to `"builder"` (or let the user pick from the full USER_ROLES list). The spec says "custom" is not a real role -- it's a UX concept meaning "write your own soul prompt." The actual `role` field must be one of the 6 valid USER_ROLES values. The Custom card should include a role sub-select (builder | growth | brand_voice) that appears when Custom is chosen.

4. **No new custom components.** Everything uses DaisyUI primitives + Tailwind + Hearth tokens. The only new files are `AgentSetupDialog.tsx`, its stories, and its tests.

5. **Stories must be loadable at `/designsystem`.** Follow the naming convention in `packages/web/src/pages/work/BetCreateDialog.stories.tsx`.
