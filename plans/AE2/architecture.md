# AE2 Architecture Plan -- Team Creation & Onboarding Journey

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `CreateTeamRequest` has a `functions` field | `CreateTeamRequest` has only `name` and `repoPath` (`packages/shared/src/team.ts:119-122`) | Task 1: Add `functions?: string[]` field |
| POST `/api/teams` calls `defaultRoster()` | POST `/api/teams` hardcodes builder + PM (`teams-routes.ts:329-368`) | Task 2: Rewrite agent creation to use `defaultRoster()` |
| `teams.functions` column stores selection | Column exists (`schema.ts:32`) but is never populated by POST `/api/teams` | Task 2: Populate from request body |
| SetupFlow has team function selector | SetupFlow has 3 fields only (`SetupFlow.tsx:63-278`) | Task 3: Add preset pills + custom chips |
| Assistant overlay auto-opens post-setup | No auto-open mechanism exists. AppShell has `?settings=open` pattern (line 241-253) | Task 4: Add `?onboarding=true` param handler |
| Welcome message seeded in assistant thread | No welcome message seeding exists. Thread starts empty (`assistant.ts:195-206`) | Task 5: Seed welcome message during team creation |
| AppShell imports `CocOverlay` (not `AssistantOverlay`) | `AppShell.tsx:28` imports `CocOverlay` from `shell/CocOverlay`. State var is `cocOverlayOpen` (line 211) | Work with existing names; no rename in this workpackage |
| `AgentAddDialog` already shows roles + templates | Confirmed. Lines 47, 89-109, 148, 186-196 of `AgentAddDialog.tsx` | AC-2 already satisfied. No changes needed. |
| Soul templates are seeded for 7 roles | `seed.ts:272-281` seeds templates for product_manager, facilitator, builder, growth, designer, qa_engineer, ops | Task 2: Use templates when creating agents |

---

## Acceptance criteria

### AC-1: Team creation with function-based roster

**Criterion:** Team creation offers a choice of team functions and creates agents matching the selected functions using `defaultRoster()` with appropriate soul templates.

**Verification:** Integration test (`teams-routes.AE2.integration.test.ts`):
- POST `/api/teams` with `{ name: "Test", functions: ["development", "marketing"] }` returns 201
- GET `/api/teams/:id` returns roster containing builder, qa_engineer, growth, product_manager (the `defaultRoster()` output for those functions)
- Each agent has `agentCategory: "team"` and a non-null `soulPrompt` (loaded from `factorySettings` template)
- The `teams.functions` column stores `["development", "marketing"]` as JSON

### AC-2: Agent add dialog with catalog roles

**Criterion:** Adding a new member to an existing team presents the predefined agent roles from the catalog with soul templates pre-loaded.

**Verification:** Already satisfied by `AgentAddDialog.tsx` (AB3). Existing test: `AB3-agent-add-dialog.test.tsx` (if it exists) or manual verification. No new code needed.

### AC-3: Assistant responds to human messages

**Criterion:** The Assistant can respond to human messages in the assistant thread.

**Verification:** Already implemented by AD8b. The assistant dispatcher (`app.ts:514`) listens for `thread_message_appended` events on user-hosted threads. No new code needed for this AC. Verified by existing AD8b tests.

### AC-4: First-time user guided to first action

**Criterion:** A first-time user is guided to a first meaningful action through conversation with the Assistant.

**Verification:** Integration test + E2E test:
- Integration test (`teams-routes.AE2.integration.test.ts`): After POST `/api/teams` with setup context, the assistant thread (`thr-ast-{userId}`) contains a welcome message with team composition info
- E2E test (`AE2-onboarding.spec.ts`): Navigate through setup flow, verify user lands on portfolio with assistant overlay open, verify welcome message is visible

### AC-5: Install to first agent working under 10 minutes

**Criterion:** The entire setup flow from launch to agents working takes under 10 minutes.

**Verification:** Manual verification + E2E timing. The setup form is 4 fields + 1 preset selection. Submitting creates agents immediately. Time is dominated by the user typing, not the system. The system portion (API calls, agent creation) should complete in under 5 seconds.

---

## Type signatures

### CreateTeamRequest (extend)

```typescript
// packages/shared/src/team.ts
export interface CreateTeamRequest {
  name: string;
  repoPath?: string;
  functions?: string[];       // NEW: team function strings from TEAM_FUNCTIONS
  buildingContext?: string;   // NEW: "What are you building?" text
}
```

### CreateTeamResponse (unchanged)

```typescript
export interface CreateTeamResponse {
  team: { id: string; name: string; phase: string };
  teamMembers: { id: string };
}
```

### Preset definitions (frontend only)

```typescript
// packages/web/src/pages/SetupFlow.tsx (inline, not exported)
interface FunctionPreset {
  readonly id: string;
  readonly label: string;
  readonly functions: readonly string[];
}

const FUNCTION_PRESETS: readonly FunctionPreset[] = [
  { id: "software", label: "Software", functions: ["development", "product"] },
  { id: "software-design", label: "Software + Design", functions: ["development", "product", "design"] },
  { id: "full-team", label: "Full team", functions: ["development", "product", "design", "marketing"] },
  { id: "marketing", label: "Marketing", functions: ["marketing", "product"] },
  { id: "custom", label: "Custom", functions: [] },
] as const;
```

---

## Ordered task list

### Task 1: Extend `CreateTeamRequest` type

**Files:**
- `packages/shared/src/team.ts` -- add `functions?: string[]` and `buildingContext?: string` to `CreateTeamRequest`

**Test:** Type check (`npm run check`). No runtime test needed -- this is a type extension.

**Dependencies:** None.

### Task 2: Wire `defaultRoster()` in POST `/api/teams`

**Files:**
- `packages/server/src/routes/teams-routes.ts` -- rewrite the POST `/` handler

**Changes:**
1. Parse `functions` from request body (default to `["development", "product"]` if not provided -- backward compat)
2. Call `defaultRoster(functions)` to get role strings
3. For each role, look up `AGENT_ROLE_CATALOG` entry for label and description
4. For each role, fetch soul template from `factorySettings` table (`soul_template:{role}`)
5. Insert agent rows with: `id: agent-{role}-{uuid}`, `kind: "ai"`, `name: "{teamName} {label}"`, `role`, `agentCategory: "team"`, `soulPrompt: template ?? null`, `maxConcurrentSessions: role === "product_manager" ? 1 : 3`, `teamId: teamMembersId`
6. Store `functions` on teams row: `functions: JSON.stringify(functions)`
7. Set lead agent to the first product_manager, or first builder if no PM

**Test:** Integration test `packages/server/src/__tests__/AE2-team-creation.integration.test.ts`:
- POST `/api/teams` with `functions: ["development", "marketing"]` -- assert roster = builder, growth, product_manager, qa_engineer
- POST `/api/teams` with `functions: ["design"]` -- assert roster = designer
- POST `/api/teams` with no `functions` -- assert default roster = builder, product_manager (backward compat)
- Assert each created agent has `soulPrompt` from factorySettings template (where template exists)
- Assert `teams.functions` column contains the JSON array

**Dependencies:** Task 1.

### Task 3: Add function selector to SetupFlow

**Files:**
- `packages/web/src/pages/SetupFlow.tsx` -- add "What are you building?" textarea + preset pills + custom chips + roster preview

**Changes:**
1. Add state: `buildingContext: string`, `selectedPreset: string` (default "software"), `customFunctions: Set<string>`
2. Add "What are you building?" textarea section between repo path and team focus
3. Add preset pills as radio group
4. Add conditional custom chips (visible when preset = "custom")
5. Add roster preview text derived from `defaultRoster()`
6. Update submit: include `functions` and `buildingContext` in POST `/api/teams` body
7. Update navigation: navigate to `/work/portfolio?onboarding=true`
8. Update validation: require at least one function (presets always have at least one; custom requires manual selection)

**Test:** Component test `packages/web/src/__tests__/AE2-SetupFlow.test.tsx`:
- Renders preset pills with "Software" pre-selected
- Clicking "Custom" reveals individual function chips
- Toggling chips updates roster preview text
- Submitting sends `functions` array in request body
- Navigates to `/work/portfolio?onboarding=true` on success

**Dependencies:** Task 1.

### Task 4: Auto-open Assistant overlay on first visit

**Files:**
- `packages/web/src/layouts/AppShell.tsx` -- add `?onboarding=true` param handler

**Changes:**
1. Add a `useEffect` that checks `searchParams.get("onboarding") === "true"`
2. When detected: `setCocOverlayOpen(true)` and remove the param via `setSearchParams`
3. Pattern matches existing `?settings=open` handler (lines 241-253)

**Test:** Component test `packages/web/src/__tests__/AE2-onboarding-autoopen.test.tsx`:
- AppShell with `?onboarding=true` query param opens the CoC overlay
- The query param is removed after opening

**Dependencies:** None (can run in parallel with Tasks 1-3).

### Task 5: Seed welcome message in assistant thread

**Files:**
- `packages/server/src/routes/teams-routes.ts` -- after creating agents, seed a welcome message in the assistant thread

**Changes:**
1. After agent creation in POST `/api/teams`, resolve the authenticated user ID
2. Find or create the assistant thread (`thr-ast-{userId}`)
3. Compose welcome message text:
   ```
   Welcome to HyperIdle, {userName}.
   
   Your team is set up with {N} agents: {Agent1, Agent2, ...}.
   [If repoPath:] I see you have connected {repoBasename} as your project folder.
   
   Here is what I suggest to get started:
   1. Create your first bet -- describe what you want built and the team picks it up.
   2. Ask me anything about how HyperIdle works.
   
   What would you like to do first?
   ```
4. Insert as a `plain` message: `senderId = ast-{userId}`, `type = "plain"`, `payload = { text }`
5. The `buildingContext` from the request can be woven into the message if present

**Implementation detail:** The POST `/api/teams` route currently does not have access to the authenticated user ID (it runs before auth middleware for setup). The user ID must be either:
- Option A: Passed in the request body (from SetupFlow, which just created the user)
- Option B: Resolved from the auth middleware (but setup POST is pre-auth)

**Decision:** Option A -- pass `userId` in the request body during setup. The SetupFlow already has the user ID from the POST `/api/users` response (line 98-101 of SetupFlow.tsx gets the response). This is a setup-only field; authenticated team creation (future) will use the auth middleware.

**Welcome message + thread creation flow:**
1. Derive `assistantAgentId = "ast-{userId}"`
2. Derive `threadId = "thr-ast-{userId}"`
3. Check if thread exists; if not, create it (same logic as `assistant.ts:192-206`)
4. Insert welcome message with `senderId = assistantAgentId`
5. Set thread `pinned = true` directly (avoid dependency on eventBus)

**Important:** The SetupFlow currently does NOT capture the user ID from the POST `/api/users` response. The response is checked for `ok` but the body is not parsed for the user ID. The SetupFlow must be updated to capture and forward the user ID.

**Test:** Integration test (extend `AE2-team-creation.integration.test.ts`):
- After POST `/api/teams` with `userId`, GET `/api/threads/assistant` returns a thread with 1 message
- The message `senderId` is `ast-{userId}`
- The message text contains the team agent names

**Dependencies:** Task 2 (agents must be created first to list them in the welcome message).

### Task 6: E2E test for onboarding flow

**Files:**
- `packages/web/e2e/AE2-onboarding.spec.ts`

**Test:**
- Navigate to `/setup`
- Fill name, API key
- Verify "Software" preset is pre-selected
- Click "Start HyperIdle"
- Verify redirect to `/work/portfolio`
- Verify assistant overlay opens (dialog with "Assistant" title visible)

**Dependencies:** Tasks 1-5.

---

## API endpoint changes

### POST `/api/teams` (modified)

**Request body (extended):**
```json
{
  "name": "My Team",
  "repoPath": "/path/to/repo",
  "functions": ["development", "product"],
  "buildingContext": "A SaaS app for subscriptions",
  "userId": "user-uuid"
}
```

**Response (unchanged):**
```json
{
  "team": { "id": "team-xxx", "name": "My Team", "phase": "build" },
  "teamMembers": { "id": "team-yyy" }
}
```

**Behavior changes:**
- `functions` defaults to `["development", "product"]` if omitted
- Agent creation uses `defaultRoster(functions)` instead of hardcoded builder + PM
- Each agent gets soul template from `factorySettings` if available
- `teams.functions` column populated with JSON stringified array
- Welcome message seeded in assistant thread if `userId` is provided

---

## Security & abuse cases

| Vector | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST /api/teams | Yes | Already rate-limited via global middleware (`app.ts:245`). No change needed. |
| Input-trust for `functions` array | Yes | Validate that `functions` is an array of strings, max length 20, each string max 100 chars. Unknown function strings are allowed (open vocabulary) but `defaultRoster()` only creates agents for known catalog entries, so unknown values are harmless no-ops. |
| Input-trust for `buildingContext` | Yes | Validate max length 2000 chars. The text is stored in a message payload, not executed. |
| Path traversal for `repoPath` | Existing | Already handled by the current implementation (stored as text, validated by the Electron bridge when accessed). No change. |
| Input-trust for `userId` during setup | Yes | The `userId` is used only for welcome message seeding (finding `thr-ast-{userId}`). If a fake userId is provided, the worst case is a welcome message in a nonexistent thread (INSERT into messages with a threadId that does not exist would fail FK constraint). Validate that `userId` matches a real user row. |
| SSRF | N/A | No outbound URLs in this workpackage. |
| Secret handling | N/A | API key handling is unchanged (already uses the Electron credential bridge). |

---

## Risks and ambiguities

### Risk 1: Pre-auth POST `/api/teams` accessing user context

The setup flow creates the user (POST `/api/users`) and then the team (POST `/api/teams`). Both are pre-auth routes. The team creation route does not have the user ID from the auth middleware.

**Mitigation:** Pass `userId` in the request body. Validate that the user exists. This is safe because: (a) the setup flow is only accessible when no human user exists (guard in POST `/api/users`), (b) the userId is validated against the users table before use.

### Risk 2: Soul template not available for all roles

Not all roles in the catalog have templates. `hasTemplate` is false for brand_voice, support, sales, content, data_analyst. Agents with these roles will have `soulPrompt: null`.

**Mitigation:** This is acceptable. The soul prompt starts empty; the user can fill it in via `AgentEditDialog`. The template is a convenience, not a requirement.

### Risk 3: Welcome message triggers assistant dispatcher

When the welcome message is inserted, the `thread_message_appended` event fires. The assistant dispatcher (`fabric/src/services/assistant-dispatcher.ts`) handles this:

1. Line 127: It detects `senderRow.kind === "ai"` on an assistant thread. It **pins the thread** (sets `pinned: true`) and returns. This is actually desirable -- the welcome message causes the thread to appear in the conversations sidebar.
2. Line 138: `shouldDispatchForAssistant()` requires `senderKind === "human"`, so NO assistant session is provisioned. Correct behavior.

**Net effect:** Welcome message pins the assistant thread. No unwanted assistant session. Both are correct.

**Verification:** Integration test asserts: after welcome message seed, thread `pinned = true`. No session created.

**Important:** The welcome message insertion must emit a `thread_message_appended` event on the eventBus for the dispatcher to pick it up. If the message is inserted directly via `db.insert(messages)` without emitting the event, the thread will NOT be pinned automatically. The team creation handler must either: (a) emit the event after insert, or (b) set `pinned: true` on the thread directly. Option (b) is simpler and avoids coupling the setup path to the event bus.

---

## Protected tests

```
protectedTests:
  - packages/server/src/__tests__/teams-routes.integration.test.ts
  - packages/web/src/__tests__/SetupFlow.test.tsx
```

Existing tests for team creation and setup flow must continue to pass. The backward-compatible default (no `functions` = hardcode `["development", "product"]`) ensures this.

---

## Shared files

```
sharedFiles:
  - packages/shared/src/team.ts           # CreateTeamRequest type
  - packages/server/src/routes/teams-routes.ts  # POST /api/teams handler
  - packages/web/src/pages/SetupFlow.tsx  # Setup form
  - packages/web/src/layouts/AppShell.tsx  # Onboarding auto-open
```

---

## Required reading for engineer

| File | Why |
|---|---|
| `packages/shared/src/agent-roles.ts` | `TEAM_FUNCTIONS`, `AGENT_ROLE_CATALOG`, `defaultRoster()` |
| `packages/shared/src/team.ts` | `CreateTeamRequest` type to extend |
| `packages/server/src/routes/teams-routes.ts:312-381` | POST `/api/teams` to rewrite |
| `packages/server/src/routes/users.ts:69-147` | User + assistant creation pattern |
| `packages/server/src/routes/assistant.ts` | Assistant thread creation pattern |
| `packages/web/src/pages/SetupFlow.tsx` | Setup form to extend |
| `packages/web/src/layouts/AppShell.tsx:210-253` | Overlay state + query param pattern |
| `packages/db/src/seed.ts:259-308` | Soul template seeding pattern |
| `plans/AE2/design/approved.md` | Visual spec for preset pills, custom chips, roster preview |
| `plans/AE2/concept.md` | Contracts to respect |

---

## Migration checklist

No renames, removals, or moves of existing symbols. All changes are additive:
- New field on `CreateTeamRequest` (additive, optional)
- New form sections in `SetupFlow.tsx` (additive)
- New `useEffect` in `AppShell.tsx` (additive)
- Modified POST `/api/teams` handler (backward compatible via defaults)

No database migration needed -- the `teams.functions` column already exists in the schema.
