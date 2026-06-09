# AD8b Architecture Plan -- Assistant Agent + Overlay

## 0. Scope

AD8b builds a per-user personal assistant agent with an overlay UI. Nine deliverables: assistant agent creation, overlay rebuild, response loop wiring, tool surface, guardrails, conditional pinning, context attachment, portfolio-retro routine adoption, and soul template.

**Fixed inputs (not re-litigated):**
- Concept: AD8 three-type taxonomy (team/strategy/individual) from AD8a
- Design: `plans/AD8b/design/approved.md` -- overlay shape, settings section, message rendering

**Required reading for the builder:**
- `plans/AD8b/design/approved.md`
- `packages/server/src/routes/coach.ts` (current assistant thread route)
- `packages/server/src/skill-tools/tool-registry.ts` (tool definition pattern)
- `packages/server/src/services/session-provisioning.ts` (session provisioning)
- `packages/fabric/src/services/task-dispatcher.ts` (event-driven dispatch)
- `packages/shared/src/thread.ts` (message types, PlainPayload)
- `packages/shared/src/events.ts` (ThreadMessageAppendedEvent)
- `packages/web/src/shell/CocOverlay.tsx` (current overlay)
- `packages/web/src/contexts/CocContext.tsx` (context attachment)
- `packages/web/src/hooks/useCocThread.ts` (thread fetch hook)
- `packages/web/src/settings/SettingsAgents.tsx` (soul prompt editing pattern)

---

## 1. Plan Reconciliation: spec vs reality

| Spec assumption | Actual codebase state | Resolution |
|---|---|---|
| `soulPrompt` column on users table | EXISTS -- `users.soulPrompt` text column (X3) | Reuse. No migration needed. |
| `PlainPayload` has no `toolCalls` field | CONFIRMED -- `{ text, refs? }` only | Extend PlainPayload with optional `toolCalls` field. |
| `thread_message_appended` event exists | EXISTS in events.ts line 187 | Subscribe to this event for assistant dispatch. |
| `provisionSession` exists | EXISTS in session-provisioning.ts | Reuse with assistant-specific parameters. |
| `UserRole` is open string | CONFIRMED -- `type UserRole = string` | No type change for "assistant" role. |
| `seed-agent-cos` exists | EXISTS in seed.ts | Replace with per-user assistant agents. Retire seed-agent-cos. |
| `GET /api/threads/coach` route exists | EXISTS in coach.ts | Rename to `/api/threads/assistant`. Update to use per-user assistant agent. |
| `AGENT_ROLE_CATALOG` has `chief_of_staff` entry | EXISTS in agent-roles.ts line 185 | Replace with `assistant` entry. |
| `classifyThreadConfiguration` has `"coach"` | EXISTS in thread.ts line 233 | Rename to `"assistant"`. |
| `ThreadConfiguration` type has `"coach"` | EXISTS in thread.ts line 225 | Replace `"coach"` with `"assistant"`. |
| Settings page has no "Assistant" section | CONFIRMED -- SettingsPage.tsx has Profile/OrgChart/Models/Appearance/Credentials/Notifications/Backend | Add new section. |
| SettingsAgents handles soul prompt editing | EXISTS -- uses textarea + inline edit pattern | Different approach: dedicated assistant section, not agent table row. |
| `CocOverlay.tsx` exists | EXISTS at packages/web/src/shell/ | Rename to AssistantOverlay.tsx. |
| `CocContext.tsx` exists | EXISTS at packages/web/src/contexts/ | Rename to AssistantContext.tsx. |
| `useCocThread.ts` exists | EXISTS at packages/web/src/hooks/ | Rename to useAssistantThread.ts. |
| `CocAttachButton.tsx` exists | EXISTS at packages/web/src/components/ | Rename to AssistantAttachButton.tsx. |
| Tool definitions for `create_bet`, `edit_block`, `edit_bet` | DO NOT EXIST | Create new tool files. |
| `update_task_status` tool | DOES NOT EXIST (only `log_task` and `create_task`) | Create new tool file. |
| `docs/souls/assistant.md` | DOES NOT EXIST | Create from template pattern. |
| Factory settings `soul_template:assistant` | DOES NOT EXIST | Add to seed. |
| No `message_created` event | CONFIRMED -- only `thread_message_appended` | Use `thread_message_appended` with senderId filter. |

---

## 2. Design-it-twice: assistant dispatch mechanism

### Option A: Dedicated assistant dispatcher (event-driven)

A new `assistant-dispatcher.ts` in `packages/fabric/src/services/` subscribes to `thread_message_appended` events. When the sender is a human and the thread is an assistant thread (hostKind="user", has the user's assistant as participant), it provisions a session for the assistant agent.

**Trade-off:** Clean event-driven architecture. Follows the task-dispatcher pattern exactly. Slight delay (event propagation) before assistant responds.
**Reject reason:** None -- this is the right approach.

### Option B: Synchronous inline dispatch in the message POST handler

The `POST /api/threads/:id/messages` route detects when a message is posted to an assistant thread and directly calls `provisionSession` inline.

**Trade-off:** Simpler, no new event subscriber. But couples the HTTP handler to the session-provisioning lifecycle, violates the layer boundary (route handler doing strategy-layer work), and blocks the HTTP response on session creation.
**Reject reason:** Violates the three-layer boundary. The route handler is Human Interface layer; session provisioning is Agent Runtime layer.

**Decision: Option A.** Event-driven assistant dispatcher.

---

## 3. Design-it-twice: tool-call metadata on messages

### Option A: Extend PlainPayload with optional `toolCalls` array

```typescript
export interface ToolCallSummary {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly output: string;
  readonly status: "ok" | "error";
}

export interface PlainPayload {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
  readonly toolCalls?: ReadonlyArray<ToolCallSummary>;
}
```

**Trade-off:** Minimal schema impact. The payload is already JSON. Consumers that don't care about tool calls ignore the field. Downside: payload size grows.
**Reject reason:** None.

### Option B: Separate `tool_call_log` table joined by messageId

A new table `tool_call_logs(id, messageId, name, input, output, status, createdAt)`.

**Trade-off:** Normalized storage. Querying tool calls independently is easier. Downside: extra join on every message fetch, migration needed, separate API endpoint or expanded thread response.
**Reject reason:** Over-engineering. Tool calls are only rendered in the context of a message. They never need independent querying. The join cost is wasted.

**Decision: Option A.** Extend PlainPayload.

---

## 4. Acceptance Criteria

| AC | Description | Verification |
|---|---|---|
| AC-1 | Each human user has exactly one assistant agent (kind=ai, agentCategory=individual, role=assistant). Created automatically at user registration. | Integration test: insert human user, query for assistant agent, assert exactly one exists with correct fields. |
| AC-2 | The assistant's soul prompt is editable by the user in Settings. | Integration test: PATCH `/api/users/:userId/assistant` with new soulPrompt, GET back, assert updated. Component test: SettingsAssistant renders textarea, save button, handles dirty/clean states. |
| AC-3 | When a human posts a message to the assistant thread, the assistant responds with tool calls and information. | Integration test: post message to assistant thread, assert assistant session is provisioned (session row created). Unit test: assistant dispatcher subscribes to thread_message_appended, filters to assistant threads, calls provisionSession. |
| AC-4 | High-risk actions (create_bet, edit_bet, submit_review, handoff_to) surface as review messages. User approves before execution. | Unit test: assistant tool surface classifies these 4 tools as high-risk. Integration test: when assistant calls create_bet, a review message is posted (not a direct bet creation). |
| AC-5 | Low/medium-risk actions execute and report results in the thread. | Unit test: tools not in the high-risk set execute directly and return results. Integration test: assistant calls read_inbox, result appears in plain message toolCalls. |
| AC-6 | The assistant thread is not pinned until the assistant posts at least one real response. | Integration test: create assistant thread via GET /api/threads/assistant, assert pinned=false. Post assistant response, assert pinned=true. |
| AC-7 | The overlay renders tool calls, artifacts, and review messages (not just plain text). | Component test: render ThreadShell with a plain message containing toolCalls array, assert tool-call tinted rows render. Existing RichMessageCard tests cover review rendering. |
| AC-8 | The sidebar trigger is labeled "Assistant". | Existing Sidebar test asserts aria-label="Assistant" (already passes after AD8a). |
| AC-9 | Context can be attached from: bet cards, task cards, knowledge items, blocks, thread messages. | Existing CocAttachButton tests cover this. Rename tests to AssistantAttachButton. |
| AC-10 | Rename: all Coc* files/symbols renamed to Assistant*. Zero references to "Coc" (as HyperIdle concept) remain. | grep verification: `grep -r "CocOverlay\|CocContext\|CocAttachButton\|useCocThread\|CocContextRef" packages/` returns zero hits. |
| AC-11 | AGENT_ROLE_CATALOG entry updated: role="assistant", label="Assistant", hasTemplate=true. | Unit test: findRoleCatalogEntry("assistant") returns entry with correct fields. findRoleCatalogEntry("chief_of_staff") returns undefined. |
| AC-12 | `docs/souls/assistant.md` exists with soul template. | File existence check. |
| AC-13 | `npm run check` passes. | CLI. |
| AC-14 | `npm run lint` passes. | CLI. |
| AC-15 | `npm run test` passes. | CLI. |

---

## 5. Type signatures and schemas

### 5.1 PlainPayload extension (packages/shared/src/thread.ts)

```typescript
export interface ToolCallSummary {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly output: string;
  readonly status: "ok" | "error";
}

export interface PlainPayload {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
  readonly toolCalls?: ReadonlyArray<ToolCallSummary>;
}
```

### 5.2 ThreadConfiguration update (packages/shared/src/thread.ts)

```typescript
export type ThreadConfiguration = "dm" | "assistant" | "feed" | "attached";

export function classifyThreadConfiguration(thread: Thread): ThreadConfiguration {
  if (thread.hostKind === "user" && thread.pinned) return "assistant";
  // ... rest unchanged
}
```

Note: the classifier uses `pinned` as a signal. Before the first response the thread is unpinned, so it classifies as "dm". After pinning it classifies as "assistant". This is correct -- before the assistant has responded, the thread is functionally a DM.

### 5.3 AGENT_ROLE_CATALOG update (packages/shared/src/agent-roles.ts)

Replace the `chief_of_staff` entry:

```typescript
{
  role: "assistant",
  label: "Assistant",
  category: "individual",
  description: "Per-user personal assistant. Acts on the user's behalf with guardrails.",
  community: "ops",
  teamFunctions: [],
  hasTemplate: true,
},
```

### 5.4 Assistant tool risk classification (packages/server/src/skill-tools/assistant-tools.ts)

```typescript
export type ToolRiskLevel = "low" | "medium" | "high";

export interface AssistantToolDef {
  readonly name: string;
  readonly riskLevel: ToolRiskLevel;
}

export const ASSISTANT_TOOLS: ReadonlyArray<AssistantToolDef> = [
  { name: "read_inbox", riskLevel: "low" },
  { name: "send_message", riskLevel: "medium" },
  { name: "query_practice", riskLevel: "low" },
  { name: "create_task", riskLevel: "medium" },
  { name: "create_item", riskLevel: "medium" },
  { name: "create_artifact", riskLevel: "medium" },
  { name: "update_task_status", riskLevel: "medium" },
  { name: "promote_knowledge", riskLevel: "medium" },
  { name: "create_bet", riskLevel: "high" },
  { name: "edit_bet", riskLevel: "high" },
  { name: "edit_block", riskLevel: "medium" },
  { name: "submit_review", riskLevel: "high" },
  { name: "handoff_to", riskLevel: "high" },
];

export const HIGH_RISK_TOOLS = ASSISTANT_TOOLS
  .filter(t => t.riskLevel === "high")
  .map(t => t.name);
```

### 5.5 API endpoints

**Existing (renamed):**
- `GET /api/threads/assistant` -- resolve-or-create assistant thread for authenticated user (was `/api/threads/coach`)

**New:**
- `GET /api/users/:userId/assistant` -- returns the user's assistant agent config (id, name, soulPrompt)
- `PATCH /api/users/:userId/assistant` -- updates assistant's soulPrompt

**Request/response shapes:**

```typescript
// GET /api/users/:userId/assistant
interface GetAssistantResponse {
  id: string;
  name: string;
  soulPrompt: string | null;
}

// PATCH /api/users/:userId/assistant
interface PatchAssistantRequest {
  soulPrompt: string;  // max 50_000 chars
}
// Returns 200 with updated GetAssistantResponse
```

### 5.6 ToolCallSummary rendering in CommentRow

The design specifies tool-call rendering through CommentRow's `afterBody` slot (same pattern as ref embeds in T4). When a plain message has `toolCalls`, the overlay renders a section after the message text:

```typescript
// In AssistantOverlay / ThreadShell consumer:
const afterBody = message.type === "plain" 
  && !isRedactedPayload(message.payload)
  && message.payload.toolCalls?.length
  ? renderToolCallSummaries(message.payload.toolCalls)
  : undefined;
```

The `renderToolCallSummaries` function renders tinted rows per AQ-016 (action blocks):
- Background: `rgba(22, 118, 79, 0.03)`
- Radius: `--r-subtle`
- Padding: 9px 12px
- Tool name: 11px mono uppercase `--text-tertiary`
- Output: 13px `--text-secondary`

---

## 6. File paths and changes

### 6.1 New files

| File | Purpose |
|---|---|
| `docs/souls/assistant.md` | Soul template for the assistant agent |
| `packages/server/src/skill-tools/create-bet.ts` | `create_bet` tool |
| `packages/server/src/skill-tools/edit-bet.ts` | `edit_bet` tool |
| `packages/server/src/skill-tools/edit-block.ts` | `edit_block` tool |
| `packages/server/src/skill-tools/update-task-status.ts` | `update_task_status` tool |
| `packages/server/src/skill-tools/assistant-tools.ts` | Risk classification + assistant tool surface |
| `packages/fabric/src/services/assistant-dispatcher.ts` | Event-driven assistant session dispatcher |
| `packages/web/src/settings/SettingsAssistant.tsx` | Soul prompt editor section |
| `packages/web/src/settings/SettingsAssistant.stories.tsx` | Stories for soul prompt editor |

### 6.2 Renamed files (Coc -> Assistant)

| Old path | New path |
|---|---|
| `packages/web/src/shell/CocOverlay.tsx` | `packages/web/src/shell/AssistantOverlay.tsx` |
| `packages/web/src/shell/CocOverlay.stories.tsx` | `packages/web/src/shell/AssistantOverlay.stories.tsx` |
| `packages/web/src/contexts/CocContext.tsx` | `packages/web/src/contexts/AssistantContext.tsx` |
| `packages/web/src/hooks/useCocThread.ts` | `packages/web/src/hooks/useAssistantThread.ts` |
| `packages/web/src/components/CocAttachButton.tsx` | `packages/web/src/components/AssistantAttachButton.tsx` |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | `packages/web/src/__tests__/AssistantOverlay.test.tsx` |
| `packages/web/src/__tests__/CocAttachButton.test.tsx` | `packages/web/src/__tests__/AssistantAttachButton.test.tsx` |
| `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx` | `packages/web/src/__tests__/AssistantOverlay.block-ref.test.tsx` |
| `packages/server/src/routes/coach.ts` | `packages/server/src/routes/assistant.ts` |

### 6.3 Modified files

| File | Change |
|---|---|
| `packages/shared/src/thread.ts` | Add ToolCallSummary, extend PlainPayload, rename ThreadConfiguration "coach" -> "assistant" |
| `packages/shared/src/agent-roles.ts` | Replace chief_of_staff catalog entry with assistant |
| `packages/shared/src/index.ts` | Export ToolCallSummary |
| `packages/db/src/seed.ts` | Update seed-agent-cos to role=assistant, add soul template to factorySettings |
| `packages/server/src/skill-tools/tool-registry.ts` | Add new tools to ALL_TOOL_DEFINITIONS |
| `packages/server/src/app.ts` | Mount renamed assistant route, register assistant dispatcher |
| `packages/server/src/routes/threads-schema.ts` | Update plainPayloadSchema to include optional toolCalls |
| `packages/web/src/pages/SettingsPage.tsx` | Add SettingsAssistant section |
| `packages/web/src/shell/Sidebar.tsx` | Update imports (CocOverlay -> AssistantOverlay) |

### 6.4 Migration of test files

All test files referencing Coc* symbols need updating:

| Test file | Migration |
|---|---|
| `packages/web/src/__tests__/CocOverlay.test.tsx` | Rename file + update all CocOverlay imports to AssistantOverlay |
| `packages/web/src/__tests__/CocAttachButton.test.tsx` | Rename file + update all CocAttachButton imports to AssistantAttachButton |
| `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx` | Rename file + update imports |
| `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx` | Update CocOverlay import to AssistantOverlay |
| Any test importing from CocContext | Update import path to AssistantContext |

### 6.5 Migration of symbols in non-test files

| File | Symbol change |
|---|---|
| All files importing `CocContext` | Import from `../contexts/AssistantContext` instead |
| All files importing `CocContextRef` | Rename to `AssistantContextRef` |
| All files importing `CocAttachButton` | Rename to `AssistantAttachButton` |
| All files importing `useCocThread` | Rename to `useAssistantThread` |
| All files referencing `CocOverlayProps` | Rename to `AssistantOverlayProps` |
| Sidebar.tsx | Props: `onCocClick` -> `onAssistantClick`, `cocOverlayOpen` -> `assistantOverlayOpen` |

**Note on Sidebar prop rename:** `onCocClick` and `cocOverlayOpen` are in SidebarProps. This change propagates to every consumer of Sidebar (AppShell.tsx and all Sidebar tests). The rename must be atomic -- update SidebarProps, then update all consumers in the same commit.

---

## 7. Ordered task list

### Task 1: Rename Coc* to Assistant* (foundation)
**Files:** All files in section 6.2, 6.4, 6.5
**Dependencies:** None
**Test:** grep verification -- zero "Coc" references remain (excluding git history). `npm run check` passes.
**Estimated effort:** 2h (mechanical rename, many files)

### Task 2: Update shared types and role catalog
**Files:** `packages/shared/src/thread.ts`, `packages/shared/src/agent-roles.ts`, `packages/shared/src/index.ts`
**Dependencies:** None (parallel with Task 1)
**Changes:**
- Add `ToolCallSummary` interface to thread.ts
- Extend `PlainPayload` with optional `toolCalls`
- Replace `chief_of_staff` with `assistant` in AGENT_ROLE_CATALOG
- Rename ThreadConfiguration `"coach"` to `"assistant"`
- Update `classifyThreadConfiguration` accordingly
**Test:** Unit test: `findRoleCatalogEntry("assistant")` returns correct entry. `findRoleCatalogEntry("chief_of_staff")` returns undefined. `ToolCallSummary` type is exportable. `npm run check`.

### Task 3: Create assistant soul template
**Files:** `docs/souls/assistant.md`
**Dependencies:** None (parallel)
**Test:** File exists with valid frontmatter.

### Task 4: Rename coach route to assistant + conditional pinning
**Files:** `packages/server/src/routes/assistant.ts` (renamed from coach.ts), `packages/server/src/app.ts`
**Dependencies:** Task 1 (renamed overlay expects `/api/threads/assistant`)
**Changes:**
- Rename file
- Replace `COC_AGENT_ID` with per-user assistant lookup
- Create assistant agent if one doesn't exist for the user (resolve-or-create pattern)
- Thread starts `pinned: false` (was `pinned: true`)
- Update route mount in app.ts from `/api/threads/coach` to `/api/threads/assistant`
**Test:** Integration test: GET `/api/threads/assistant` creates thread with `pinned=false`. After assistant posts message, thread has `pinned=true`.

### Task 5: Assistant agent creation at user registration
**Files:** `packages/server/src/routes/users.ts` (or wherever user creation happens), `packages/db/src/seed.ts`
**Dependencies:** Task 2 (role catalog has "assistant")
**Changes:**
- When a human user is created (POST /api/users or seed), create a corresponding assistant agent (kind=ai, agentCategory=individual, role=assistant, soulPrompt from template)
- Update seed.ts: replace seed-agent-cos with per-founder-user assistant creation
- Add `soul_template:assistant` to factorySettings seed
**Test:** Integration test: create human user, query for assistant with role=assistant + agentCategory=individual, assert one exists.

### Task 6: Create new tools (create_bet, edit_bet, edit_block, update_task_status)
**Files:** 4 new tool files in `packages/server/src/skill-tools/`
**Dependencies:** None (parallel)
**Changes:**
- `create_bet` -- inserts into bets table, returns bet id
- `edit_bet` -- updates bet fields (description, doneCondition, hypothesis, status)
- `edit_block` -- updates block content via block API
- `update_task_status` -- transitions task state via state machine
- Each tool follows the existing ToolDefinition pattern (Zod schema + handler)
**Test:** Integration test per tool: call handler with valid input, assert DB changes. Call with invalid input, assert error result.

### Task 7: Assistant tool surface + risk classification
**Files:** `packages/server/src/skill-tools/assistant-tools.ts`, update `tool-registry.ts`
**Dependencies:** Task 6 (new tools exist)
**Changes:**
- Define ASSISTANT_TOOLS with risk levels
- Add new tools to ALL_TOOL_DEFINITIONS in tool-registry.ts
- Create `toolsForAssistant()` function that returns all assistant-accessible tools
- HIGH_RISK_TOOLS constant for the 4 gated tools
**Test:** Unit test: `toolsForAssistant()` returns exactly the 13 tools listed. `HIGH_RISK_TOOLS` contains exactly `["create_bet", "edit_bet", "submit_review", "handoff_to"]`.

### Task 8: Assistant API endpoints (soul prompt CRUD)
**Files:** New route handlers in `packages/server/src/routes/assistant.ts` (add to same file)
**Dependencies:** Task 4 (route file exists)
**Changes:**
- `GET /api/users/:userId/assistant` -- returns assistant agent config
- `PATCH /api/users/:userId/assistant` -- updates soul prompt (max 50k chars, rate-limited)
- Authorization: user can only edit their own assistant
**Test:** Integration test: PATCH soul prompt, GET back, assert match. PATCH with >50k chars, assert 400. PATCH other user's assistant, assert 403.

### Task 9: Assistant dispatcher (event-driven response loop)
**Files:** `packages/fabric/src/services/assistant-dispatcher.ts`, register in `packages/server/src/app.ts`
**Dependencies:** Task 4, Task 5, Task 7
**Changes:**
- Subscribe to `thread_message_appended` events
- Filter: senderId is a human user AND thread is an assistant thread (hostKind="user")
- On match: find the assistant agent for that user, provision a session
- The session reads thread history, uses the assistant tool set, responds
- After first response: update thread.pinned = true
- Session posts response as a plain message with toolCalls metadata
- For high-risk tool calls: instead of executing, post a review message with the proposed action
**Test:** Integration test: post human message to assistant thread, assert session row created. Unit test: dispatcher filters non-assistant threads correctly.

### Task 10: Settings -- soul prompt editor
**Files:** `packages/web/src/settings/SettingsAssistant.tsx`, `packages/web/src/pages/SettingsPage.tsx`
**Dependencies:** Task 8 (API endpoints exist)
**Changes:**
- New SettingsAssistant component with textarea + save button
- Fetches from `GET /api/users/:userId/assistant`
- Saves via `PATCH /api/users/:userId/assistant`
- States: loading, clean, dirty, saving, saved, error
- Add section between Models and Appearance in SettingsPage
**Test:** Component test: renders textarea with soul prompt, shows save button disabled when clean, enabled when dirty, handles save success/error.

### Task 11: Tool-call rendering in overlay
**Files:** `packages/web/src/shell/AssistantOverlay.tsx`
**Dependencies:** Task 1 (renamed overlay), Task 2 (ToolCallSummary type)
**Changes:**
- Add `renderToolCallSummaries` function that renders tinted rows from ToolCallSummary[]
- Pass through ThreadShell's message rendering via `renderRefEmbeds` or a new `renderToolCalls` prop
- Actually: tool calls render as `afterBody` content on plain messages, not through renderRefEmbeds. Add logic in the AssistantOverlay's ThreadShell consumption to detect toolCalls on plain messages and render them.
**Test:** Component test: render AssistantOverlay with messages containing toolCalls, assert tinted rows appear with tool names and outputs.

### Task 12: Update plainPayload Zod schema
**Files:** `packages/server/src/routes/threads-schema.ts`
**Dependencies:** Task 2 (ToolCallSummary type)
**Changes:**
- Extend the plain payload schema to accept optional `toolCalls` array
- The schema must validate ToolCallSummary shape on both inbound (message creation) and outbound (message retrieval)
**Test:** Unit test: parse payload with toolCalls, assert accepted. Parse payload without toolCalls, assert accepted.

---

## 8. Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | YES | PATCH `/api/users/:id/assistant` rate-limited (10/min per user). POST messages to assistant thread already rate-limited by thread message endpoint. |
| Input-trust boundary for agent-authored fields | YES | Tool-call outputs in ToolCallSummary.output are agent-authored. They are stored as JSON and rendered as text (not HTML). No XSS vector. |
| Secret-handling for new credential surface | NO | No new credentials. |
| Path-traversal for path input | NO | Soul prompts are inline text, not file paths (X3 eliminated this). |
| SSRF for outbound URL | NO | No outbound URLs. |
| Soul prompt injection | YES | The soul prompt is user-edited text that becomes part of the LLM system prompt. This is intentional -- the user controls their own assistant's behavior. The guardrails (review messages for high-risk actions) are structural, not prompt-based, so prompt injection cannot bypass them. Max length 50k chars prevents payload abuse. |
| Assistant impersonation | YES | The assistant can only post messages as itself (its own agentId). The senderId on messages is server-controlled, not client-supplied. |
| Cross-user assistant access | YES | `GET/PATCH /api/users/:userId/assistant` must verify userId matches the authenticated user. 403 otherwise. |
| High-risk action bypass | YES | The guardrail is server-side in the assistant dispatcher: if a tool call targets a HIGH_RISK_TOOLS tool, the dispatcher posts a review message instead of executing. The LLM cannot bypass this -- the dispatcher controls execution, not the LLM. |

---

## 9. Protected tests

Tests whose assertions must not change (they verify existing contracts):

```
protectedTests:
  - packages/shared/src/__tests__/message-types.test.ts
  - packages/design-system/src/__tests__/status-mapping.test.ts
  - packages/server/src/skill-tools/__tests__/tool-registry.integration.test.ts
  - packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts
```

Note: the tool-registry integration tests test the existing tool set. Adding new tools is additive -- existing tests should still pass. But the tests must not be modified to accommodate the new tools.

---

## 10. Risks and ambiguities

1. **Sidebar prop rename blast radius.** Renaming `onCocClick`/`cocOverlayOpen` propagates through AppShell, all Sidebar tests, and any E2E specs that reference these. The rename must be a single atomic commit. Risk: missed reference causes type error. Mitigation: `npm run check` catches all.

2. **Assistant session provisioning latency.** The event-driven dispatch adds latency between the user's message and the assistant's response (event propagation + session creation + LLM call). For v1 this is acceptable -- the user sees their message immediately and the assistant response arrives asynchronously. Future: WebSocket push for real-time streaming.

3. **Thread pinning race condition.** If the user sends a second message before the assistant responds to the first, two sessions could be provisioned. The dispatcher should check if a session is already active for this thread before provisioning. The task-dispatcher already has concurrency-limit logic -- reuse it.

4. **seed-agent-cos retirement.** The shared seed agent is referenced by 3 builtin routines (cost-sentinel, portfolio-retro, knowledge-decay). AD8c handles routine reassignment. For AD8b, the seed-agent-cos row stays in the DB but its role changes to "assistant" and it becomes the founder's assistant. New users get their own assistant agent.

5. **PlainPayload backward compatibility.** Adding optional `toolCalls` to PlainPayload is additive. Existing messages without the field continue to work. The Zod schema must make it optional.
