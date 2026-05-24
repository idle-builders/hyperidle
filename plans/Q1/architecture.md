# Q1 Architecture Plan: Human-Initiated Conversations & Session Dial-In

**Design decision:** Variant C (Companion Rail) approved. Inline Submenu replacement for recipient picker. Companion split for session activity.

---

## 1. Scope Summary

Q1 delivers three capabilities:
1. **New DM thread creation** -- recipient picker in the Submenu, thread creation via existing API.
2. **Dial-in view** -- companion pane showing live session activity alongside thread messages.
3. **Interjection** -- posting a message into the task's thread while dialed in.

No new database tables. No new message types. No new host kinds. The system grows at the edges: new WebSocket topic subscriptions, new frontend components, and a thin API surface for session activity.

---

## 2. Data Model Changes

### 2.1 No schema changes required

The `findOrCreateDirectThread` service (`packages/server/src/services/direct-thread.ts`) already creates DM threads with the correct shape:
- `hostKind: "agent"` (when DM to agent) or `hostKind: "user"` (when DM to user)
- `participants: [senderId, recipientId]`
- `initiatorId: senderId`

**Current limitation:** `findOrCreateDirectThread` always uses `hostKind: "agent"` and `hostId: recipientId`. For human-to-human DMs, we need to support `hostKind: "user"`.

**Change:** Extend `findOrCreateDirectThread` to accept a `recipientKind: "agent" | "user"` parameter that determines the `hostKind` on the created thread. Default to current behavior (`"agent"`) for backward compatibility.

### 2.2 Session activity -- no persistence

Session activity displayed in the dial-in view is ephemeral. It comes from:
- Live WebSocket events (`session_started`, `session_ended`, `tool_call_recorded`)
- A one-time REST fetch for recent session actions (GET /api/sessions/:id with extended response)

No new tables. Session activity is read from existing `sessions` + event-bus subscriptions.

---

## 3. API Changes

### 3.1 Extend `findOrCreateDirectThread`

**File:** `packages/server/src/services/direct-thread.ts`

```typescript
export function findOrCreateDirectThread(
  db: HyperIdleDb,
  senderId: string,
  recipientId: string,
  now: string,
  recipientKind?: "agent" | "user",  // NEW -- defaults to "agent"
): string
```

The lookup logic changes to search for threads with `hostKind = recipientKind` AND `hostId = recipientId` with the two-participant match. Creation uses the specified `recipientKind`.

### 3.2 New endpoint: `GET /api/sessions/:id/activity`

**File:** `packages/server/src/routes/sessions-routes.ts`

Returns recent session activity for the dial-in view. This is a projection of the session's tool-call events (from an in-memory ring buffer or from the observability store if one exists).

```typescript
// Response shape
interface SessionActivityResponse {
  session: {
    id: string;
    agentId: string;
    taskId: string;
    state: SessionState;
    startedAt: string;
    modelTier: ModelTier;
  };
  // Recent activity entries (most recent first, capped at 50)
  activity: Array<{
    type: "tool_call" | "reasoning" | "cost_tick";
    timestamp: number;
    // Discriminated payload:
    // tool_call: { toolName: string; argsSummary: string }
    // reasoning: { excerpt: string }
    // cost_tick: { deltaMinor: number; totalMinor: number; currency: string }
    data: Record<string, unknown>;
  }>;
}
```

**Implementation note:** For the initial implementation, activity comes from the `tool_call_recorded` events. The server maintains a per-session ring buffer (max 100 entries) in memory, populated by subscribing to EventBus events. This ring buffer is lost on server restart -- acceptable for a desktop app.

### 3.3 New endpoint: `GET /api/recipients`

**File:** `packages/server/src/routes/recipients.ts` (new file)

Aggregates users + agents into a single list for the recipient picker. Returns identity, name, role, status, and whether they have an active session.

```typescript
// Response shape
interface RecipientsResponse {
  recipients: Array<{
    id: string;
    kind: "agent" | "user";
    name: string;
    role: string;
    status: "active" | "paused" | "retired" | "idle";
    hasActiveSession: boolean;
    avatarUrl: string | null;
  }>;
}
```

Query params:
- `?q=<search>` -- filter by name (case-insensitive substring match)
- `?kind=agent|user` -- filter by recipient kind

This is a read-only projection. No write semantics.

### 3.4 WebSocket topic: `session:<sessionId>`

**File:** `packages/server/src/services/ws-broadcaster.ts`

Add forwarding for session events to per-session topics:

```typescript
// New subscriptions in WsBroadcaster.start()
this.eventBus.on("session_started", (event) => {
  this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
});
this.eventBus.on("session_ended", (event) => {
  this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
});
this.eventBus.on("tool_call_recorded", (event) => {
  this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
});
```

**Authorization:** Any authenticated identity can subscribe to `session:<id>` topics. Session observation is not gated -- the spec says "observe mode is read-only -- the agent's session is not interrupted or notified by observation alone." No participant check needed (unlike thread topics).

### 3.5 Existing endpoint reuse

- `POST /api/threads` -- create DM thread with initial message (already exists, no changes)
- `POST /api/threads/:id/messages` -- interjection (already exists, no changes)
- `GET /api/threads/:id` -- fetch thread + messages for dial-in (already exists)
- `GET /api/sessions?task_id=<id>&state=active` -- check if a task has an active session (already exists)

---

## 4. Frontend Architecture

### 4.1 Component Hierarchy (Conversations View, Q1 additions)

```
AppShell
  Submenu (conversations mode)
    [existing] SearchField
    [existing] Filter chips
    [NEW] RecipientPicker (replaces thread list when active)
    [existing] ThreadSections
  Main Pane
    Conversations
      ConversationsDetail
        [existing] ThreadShell (left pane in companion mode)
        [NEW] SessionActivityPanel (right pane, companion mode)
          ActivityHeader (agent name, session info, cost)
          ActivityFilterTabs (All | Tools | Reasoning | Cost)
          ActivityStream (auto-scrolling list of entries)
          ActivitySummary (shown when session ends)
```

### 4.2 New Files

| File | Purpose |
|------|---------|
| `packages/web/src/components/RecipientPicker.tsx` | Inline recipient picker for Submenu |
| `packages/web/src/components/RecipientPicker.stories.tsx` | Storybook states |
| `packages/web/src/components/SessionActivityPanel.tsx` | Companion pane for dial-in |
| `packages/web/src/components/SessionActivityPanel.stories.tsx` | Storybook states |
| `packages/web/src/hooks/useRecipients.ts` | Fetch hook for GET /api/recipients |
| `packages/web/src/hooks/useSessionActivity.ts` | WebSocket subscription + REST fetch for session activity |
| `packages/server/src/routes/recipients.ts` | Recipients API route |
| `packages/server/src/services/session-activity-buffer.ts` | In-memory ring buffer for session activity |

### 4.3 Modified Files

| File | Change |
|------|--------|
| `packages/server/src/services/direct-thread.ts` | Add `recipientKind` parameter |
| `packages/server/src/services/ws-broadcaster.ts` | Add session event forwarding |
| `packages/server/src/routes/sessions-routes.ts` | Add GET /:id/activity endpoint |
| `packages/server/src/index.ts` (or app factory) | Mount recipients route |
| `packages/web/src/layouts/AppShell.tsx` | Add RecipientPicker state management to Submenu |
| `packages/web/src/pages/Conversations.tsx` | Add companion pane (SessionActivityPanel) when dialed in |
| `packages/web/src/hooks/useConversationsThreads.ts` | Trigger refetch on thread_created WS event |

### 4.4 Component: RecipientPicker

**Location:** `packages/web/src/components/RecipientPicker.tsx`

**Props:**
```typescript
interface RecipientPickerProps {
  onSelect: (recipient: { id: string; kind: "agent" | "user"; name: string }) => void;
  onCancel: () => void;
}
```

**States:**
- `browsing` -- search field focused, list visible, no selection
- `selected` -- recipient chosen, message input visible
- `sending` -- message is being submitted, inputs disabled

**Behavior:**
- Mounts with SearchField auto-focused.
- Fetches `GET /api/recipients` on mount, filters client-side as user types.
- Each row: Avatar (initials chip for agents) + Name + role Tag + StatusChip (active/idle/paused).
- Agents with `hasActiveSession: true` show a small "Live" indicator.
- Click a row: transitions to `selected` state. Shows the recipient name + a textarea.
- Enter in textarea (or click Send): creates thread via `POST /api/threads` with `hostKind: recipientKind`, `hostId: recipient.id`, `participants: [currentUser, recipient.id]`, initial message payload.
- On success: calls `onSelect` which navigates to the new thread's route.
- Escape at any point: calls `onCancel`.
- Keyboard: arrow keys for list navigation (roving tabindex), Enter to select.

**Not a new custom component in the budget.** RecipientPicker is a page-level composition (like PitchSelector), not a design-system primitive. It assembles SearchField, ThreadRow (repurposed as recipient rows), and DaisyUI primitives.

### 4.5 Component: SessionActivityPanel

**Location:** `packages/web/src/components/SessionActivityPanel.tsx`

**Props:**
```typescript
interface SessionActivityPanelProps {
  sessionId: string;
  agentName: string;
  taskTitle: string;
  onClose: () => void;
}
```

**States:**
- `streaming` -- session is active, activity entries arrive in real-time
- `summary` -- session ended, shows final stats
- `error` -- WebSocket connection failed, shows retry

**Internal data flow:**
1. On mount: fetch `GET /api/sessions/:id/activity` for initial activity entries.
2. Subscribe to WebSocket topic `session:<sessionId>`.
3. Append new events to a local array (capped at 200 client-side).
4. On `session_ended` event: transition to `summary` state.

**Rendering:**
- **Header:** Agent name, session duration (live timer), StatusChip, cost burn (KeyValue: "$2.34 / $50").
- **Filter tabs:** DaisyUI `tabs tabs-bordered tabs-xs`. Four tabs: All, Tools, Reasoning, Cost. Filters the activity list.
- **Activity list:** Scrollable `overflow-y-auto` container. Each entry is a single-line row:
  - Tool call: monospace `toolName(argsSummary)` + timestamp
  - Reasoning: italic excerpt (truncated to 120 chars) + timestamp
  - Cost: `+$0.12` in muted text + timestamp
- **Summary card (when session ends):** KeyValue grid: Duration, Total Cost, Actions Count, Outcome.

**Density:** 4px vertical gap between rows. 8px padding. Monospace `text-xs` for activity entries. This is an observation surface -- maximum density.

### 4.6 Dial-In Detection & Activation (in Conversations.tsx)

The Conversations page already fetches thread detail. Q1 adds:

1. When the thread's `hostKind === "task"`, fetch `GET /api/sessions?task_id=<hostId>&state=active`.
2. If an active session exists, render a "Live" StatusChip + "Dial In" button in the thread header area.
3. Clicking "Dial In" sets local state `dialInSessionId` which triggers the companion split.
4. The companion layout is a simple flexbox split: `flex flex-row` with left (thread) at `flex-[3]` and right (activity) at `flex-[2]`.

```typescript
// In ConversationsDetail
const [dialInSessionId, setDialInSessionId] = useState<string | null>(null);
const { activeSession } = useActiveSessionForTask(threadDetail?.thread.hostId);

// Render
<div className="flex flex-row h-full gap-0">
  <div className={dialInSessionId ? "flex-[3] border-r border-base-300" : "flex-1"}>
    <ThreadShell ... />
  </div>
  {dialInSessionId && (
    <div className="flex-[2]">
      <SessionActivityPanel
        sessionId={dialInSessionId}
        agentName={activeSession.agentName}
        taskTitle={threadDetail.thread.hostId}
        onClose={() => setDialInSessionId(null)}
      />
    </div>
  )}
</div>
```

### 4.7 Hook: useSessionActivity

**File:** `packages/web/src/hooks/useSessionActivity.ts`

```typescript
interface SessionActivityEntry {
  type: "tool_call" | "reasoning" | "cost_tick" | "session_ended";
  timestamp: number;
  data: Record<string, unknown>;
}

interface UseSessionActivityResult {
  status: "connecting" | "streaming" | "ended" | "error";
  entries: ReadonlyArray<SessionActivityEntry>;
  summary: { duration: string; totalCost: number; actionCount: number; outcome: string } | null;
}

export function useSessionActivity(sessionId: string): UseSessionActivityResult;
```

**Implementation:**
1. Fetches `GET /api/sessions/:id/activity` for initial state.
2. Subscribes to WebSocket topic `session:<sessionId>`.
3. Appends incoming events to a local array (max 200, FIFO eviction).
4. On `session_ended` event: computes summary, transitions status to `ended`.
5. Cleanup: unsubscribes from WebSocket topic on unmount.

### 4.8 Hook: useRecipients

**File:** `packages/web/src/hooks/useRecipients.ts`

```typescript
interface Recipient {
  id: string;
  kind: "agent" | "user";
  name: string;
  role: string;
  status: string;
  hasActiveSession: boolean;
  avatarUrl: string | null;
}

interface UseRecipientsResult {
  status: "loading" | "ready" | "error";
  recipients: ReadonlyArray<Recipient>;
  error: string | null;
}

export function useRecipients(query?: string): UseRecipientsResult;
```

Fetches `GET /api/recipients?q=<query>`. Client-side filtering for instant feedback; server-side for correctness on large lists.

### 4.9 AppShell Integration

**File:** `packages/web/src/layouts/AppShell.tsx`

Add state for the recipient picker mode:

```typescript
const [showRecipientPicker, setShowRecipientPicker] = useState(false);
```

In the Submenu section for conversations view:
- Add a "New Thread" button (DaisyUI `btn btn-ghost btn-xs`) above the filter chips.
- When `showRecipientPicker` is true, render `<RecipientPicker>` instead of `<ThreadSections>`.
- On successful thread creation: `setShowRecipientPicker(false)` + navigate to `/conversations/:newThreadId`.

---

## 5. WebSocket Event Flow

### 5.1 Session Activity Streaming

```
Agent starts session
  → EventBus emits "session_started"
  → WsBroadcaster forwards to topic "session:<id>"
  → Client (subscribed) receives event, updates UI

Agent makes tool call
  → EventBus emits "tool_call_recorded"
  → WsBroadcaster forwards to topic "session:<id>"
  → Client appends to activity list

Agent finishes session
  → EventBus emits "session_ended"
  → WsBroadcaster forwards to topic "session:<id>"
  → Client transitions to summary state
```

### 5.2 Thread Creation (Recipient Picker Flow)

```
User selects recipient, types message, sends
  → Client POSTs /api/threads (with initial message)
  → Server creates thread + message atomically
  → Server emits "thread_created" to EventBus
  → WsBroadcaster forwards to topic "conversations"
  → All subscribed clients (including sender) see new thread in list
  → Client navigates to /conversations/:newThreadId
```

### 5.3 Interjection Flow

```
User types message in dial-in composer, sends
  → Client POSTs /api/threads/:taskThreadId/messages (plain type)
  → Server appends message (idempotent via clientKey)
  → Server emits "thread_message_appended" to EventBus
  → WsBroadcaster forwards to topic "thread:<taskThreadId>"
  → Agent (next time it reads context) sees the message in its task thread
```

---

## 6. Server-Side Activity Buffer

### 6.1 Service: SessionActivityBuffer

**File:** `packages/server/src/services/session-activity-buffer.ts`

```typescript
interface ActivityEntry {
  type: "tool_call" | "reasoning" | "cost_tick";
  timestamp: number;
  data: Record<string, unknown>;
}

export class SessionActivityBuffer {
  private buffers = new Map<string, ActivityEntry[]>();
  private readonly maxPerSession = 100;
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly eventBus: EventBus) {}

  start(): void {
    // Subscribe to tool_call_recorded, session_started, session_ended
    // On tool_call_recorded: append to buffer[sessionId]
    // On session_ended: keep buffer for 5 minutes, then evict
  }

  stop(): void { /* cleanup */ }

  getActivity(sessionId: string): ReadonlyArray<ActivityEntry> {
    return this.buffers.get(sessionId) ?? [];
  }
}
```

This is a simple in-memory ring buffer. No persistence. Acceptable for a desktop/single-server deployment.

---

## 7. Type Additions

### 7.1 `packages/shared/src/types.ts`

No new types needed. Existing `SessionState`, `ModelTier` cover the session domain.

### 7.2 `packages/shared/src/events.ts`

No new event types. `session_started`, `session_ended`, `tool_call_recorded` already exist.

---

## 8. Ordered Implementation Tasks

### Phase 1: Server Foundation (no frontend changes)

| # | Task | File(s) | Depends On |
|---|------|---------|-----------|
| 1 | Extend `findOrCreateDirectThread` with `recipientKind` param | `packages/server/src/services/direct-thread.ts` | -- |
| 2 | Create `GET /api/recipients` endpoint | `packages/server/src/routes/recipients.ts` + mount in app | -- |
| 3 | Create `SessionActivityBuffer` service | `packages/server/src/services/session-activity-buffer.ts` | -- |
| 4 | Add `GET /api/sessions/:id/activity` endpoint | `packages/server/src/routes/sessions-routes.ts` | Task 3 |
| 5 | Add session event forwarding to WsBroadcaster | `packages/server/src/services/ws-broadcaster.ts` | -- |

### Phase 2: Frontend -- Recipient Picker

| # | Task | File(s) | Depends On |
|---|------|---------|-----------|
| 6 | Create `useRecipients` hook | `packages/web/src/hooks/useRecipients.ts` | Task 2 |
| 7 | Create `RecipientPicker` component | `packages/web/src/components/RecipientPicker.tsx` + `.stories.tsx` | Task 6 |
| 8 | Integrate RecipientPicker into AppShell Submenu | `packages/web/src/layouts/AppShell.tsx` | Task 7 |
| 9 | Wire thread creation: on send, POST /api/threads, navigate to new thread | `packages/web/src/layouts/AppShell.tsx`, `packages/web/src/components/RecipientPicker.tsx` | Task 1, Task 8 |

### Phase 3: Frontend -- Dial-In View

| # | Task | File(s) | Depends On |
|---|------|---------|-----------|
| 10 | Create `useSessionActivity` hook | `packages/web/src/hooks/useSessionActivity.ts` | Task 4, Task 5 |
| 11 | Create `SessionActivityPanel` component | `packages/web/src/components/SessionActivityPanel.tsx` + `.stories.tsx` | Task 10 |
| 12 | Add dial-in detection: `useActiveSessionForTask` fetch in Conversations | `packages/web/src/pages/Conversations.tsx` | -- |
| 13 | Add companion split layout + dial-in toggle to Conversations detail | `packages/web/src/pages/Conversations.tsx` | Task 11, Task 12 |
| 14 | Handle session-end transition (summary card, graceful close) | `packages/web/src/components/SessionActivityPanel.tsx` | Task 13 |

### Phase 4: Integration & Polish

| # | Task | File(s) | Depends On |
|---|------|---------|-----------|
| 15 | Keyboard shortcuts (N for new thread, D for dial-in, Escape to cancel) | `packages/web/src/layouts/AppShell.tsx`, `pages/Conversations.tsx` | Task 9, Task 13 |
| 16 | Thread list auto-refresh on `thread_created` WS event | `packages/web/src/hooks/useConversationsThreads.ts` | Task 5 |
| 17 | E2E: Playwright tests for DM creation + thread list appearance | `packages/web/e2e/` | Task 9 |
| 18 | E2E: Playwright tests for dial-in activation + activity rendering | `packages/web/e2e/` | Task 14 |
| 19 | Unit tests: server routes, hooks, components | Colocated `__tests__/` dirs | All above |

---

## 9. Trade-Off Log

| Decision | Alternative | Cost of chosen | Cost of alternative |
|----------|-------------|----------------|---------------------|
| In-memory activity buffer (lost on restart) | Persist to SQLite | ~0 complexity; data loss on restart acceptable for desktop | +1 table, +migration, +cleanup job; overkill for ephemeral observation data |
| Client-side recipient filtering | Server-side only | Fetches all recipients on mount (~10-50 in a typical factory) | Extra RTT per keystroke; unnecessary for small lists |
| Companion split (CSS flexbox) | Resizable split pane | No drag handle; fixed 60/40 ratio | +dependency (react-split-pane or custom), +a11y work for keyboard resize |
| No new component budget slots | Add ActivityRow to Tier 2 | Renders activity with KeyValue + inline text; slightly less semantic | +1 to budget; only used in one place (dial-in); doesn't earn its keep |
| Session topics without auth check | Participant-only like thread topics | Any authenticated user can observe any session | +authorizer logic, +lookup table; contradicts "observe mode is read-only" spec intention |

---

## 10. Failure Modes

| Failure | Handling |
|---------|----------|
| WebSocket disconnect during dial-in | Activity panel shows "Reconnecting..." with spinner. Auto-reconnect (existing WS reconnect logic). On reconnect, re-fetch initial activity to fill gaps. |
| Session ends before dial-in activated | No activity panel shown. Thread renders normally. The "Live" badge never appears (detection fetch returns no active session). |
| Recipient picker: no recipients found | Empty state: "No users or agents found." |
| Thread creation fails (409 conflict on idempotency) | Show error toast. The idempotency key prevents duplicate threads. Retry with new clientKey. |
| Activity buffer full (100 entries) | FIFO eviction. Oldest entries dropped. Client only sees most recent 100. Acceptable -- observation is real-time, not archival. |
| Server restart loses activity buffer | Client's initial fetch returns empty array. Live events resume when session generates new activity. No backfill -- acceptable for desktop. |

---

## 11. Testing Strategy

### Unit Tests (Vitest)

- `packages/server/src/routes/__tests__/recipients.test.ts` -- GET /api/recipients with search, kind filter
- `packages/server/src/services/__tests__/direct-thread.recipientKind.test.ts` -- findOrCreateDirectThread with user/agent kinds
- `packages/server/src/services/__tests__/session-activity-buffer.test.ts` -- ring buffer behavior, eviction, event subscription
- `packages/server/src/routes/__tests__/sessions.activity.test.ts` -- GET /api/sessions/:id/activity
- `packages/web/src/hooks/__tests__/useRecipients.test.tsx` -- fetch states, filtering
- `packages/web/src/hooks/__tests__/useSessionActivity.test.tsx` -- WS subscription, event append, session-end transition
- `packages/web/src/__tests__/RecipientPicker.test.tsx` -- search, selection, send, cancel, keyboard
- `packages/web/src/__tests__/SessionActivityPanel.test.tsx` -- streaming state, filter tabs, summary transition, close

### E2E Tests (Playwright)

- `packages/web/e2e/q1-new-dm-thread.spec.ts`:
  1. Open Conversations, click "New Thread"
  2. Search for an agent, select it
  3. Type a message, send
  4. Verify new thread appears in submenu list
  5. Verify thread detail shows the sent message

- `packages/web/e2e/q1-session-dial-in.spec.ts`:
  1. Create a task with an active session (seeded fixture)
  2. Navigate to the task's thread in Conversations
  3. Verify "Live" badge and "Dial In" button appear
  4. Click "Dial In", verify companion pane opens
  5. Verify activity entries render (fixture injects tool_call_recorded events)
  6. End the session (fixture), verify summary card appears
  7. Close the panel, verify full-width thread returns

---

## 12. Dependency Graph

```
Task 1 ─────────────────────────────────────┐
Task 2 ──── Task 6 ──── Task 7 ──── Task 8 ─┼── Task 9 ──── Task 15, 16, 17
Task 3 ──── Task 4 ─┐                       │
Task 5 ─────────────┼── Task 10 ─── Task 11 ┼── Task 13 ── Task 14 ── Task 18
                    │                       │
                    └── Task 12 ────────────┘
```

Critical path: Tasks 3 → 4 → 10 → 11 → 13 → 14 → 18

Parallelizable:
- Tasks 1, 2, 3, 5 (all Phase 1) can run in parallel
- Tasks 6, 10, 12 can run in parallel once their server dependencies are met
- Tasks 17, 18, 19 can run in parallel after their dependencies
