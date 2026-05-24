# Q1 Design Variants: Human-Initiated Conversations & Session Dial-In

**Classification:** NOVEL -- session dial-in composes real-time event streams with the existing thread view in a way no existing surface does. Three variants explored.

---

## Design Decisions at Play

1. **How to compose thread messages and session activity** (the dial-in view)
2. **How to present the recipient picker** (new-thread flow)
3. **How to signal dial-in availability and transition between modes**

## Existing Constraints

- Shell: `IconRail | Submenu | Main | Rail`. Q1 operates in the Main pane.
- Component budget: 19 custom components. Cannot add new Tier-2/3 components without justification.
- ThreadShell already renders message lists with typed dispatch (CommentRow, RichMessageCard, etc.).
- Conversations page has a single detail route (`/conversations/:threadId`).
- WebSocket infrastructure supports topic-based subscription (`thread:<id>`, global topics).
- Session events: `session_started`, `session_ended`, `tool_call_recorded` already exist in EventBus.
- Density: 8-12px padding default. No whitespace inflation.

---

## Variant A: Interleaved Timeline

### Core Idea

Session activity entries are interleaved directly into the thread message timeline as lightweight, visually distinct rows. The thread becomes a unified chronological stream of both messages and session activity.

### How It Works

**Recipient Picker:** Slide-over panel from the right edge of the Submenu (same column, replaces thread list temporarily). Search field at top, two sections: "Users" and "Agents" with StatusChip showing agent state. Selecting a recipient + typing a message creates the DM thread.

**Dial-in Composition:** When viewing a task thread with an active session:
- A thin status bar appears above the message list: `[StatusChip: active] Builder on T-42 | $2.34 / $50 | 12 actions`
- Session events (tool calls, reasoning excerpts) appear as CommentRow-like entries in the timeline, but with a distinct left-border color (base-300) and smaller text to differentiate from real messages.
- Messages and activity share ONE scroll position.
- The user types in the same composer -- their message goes to `POST /api/threads/:id/messages`.

**Dial-in Affordance:** A small "live" indicator (pulsing dot + "Session active") appears in the thread header when an active session exists on the thread's task. Clicking it enables activity streaming (subscribes to session events).

**Mode Transition:** When the session ends, the status bar shows `[StatusChip: done] Session ended` with a fade-out animation. Activity entries remain visible in the timeline but stop arriving.

### Strengths
- Single mental model: everything is a timeline entry. No split attention.
- Reuses existing ThreadShell rendering with a new row variant.
- Simplest implementation -- one scroll container, one data stream merged into message list.
- The composer naturally applies to the same thread -- interjection is just "reply."

### Weaknesses
- High-frequency session activity can drown out human messages.
- Activity entries are not messages in the DB -- mixing ephemeral and persistent data in one timeline creates a conceptual lie.
- Scrolling to find your own messages in a flood of tool-call entries is tedious.
- No way to read messages without session noise, or session activity without message noise.

---

## Variant B: Stacked Panes (Split Horizontal)

### Core Idea

The Main pane splits vertically into two stacked regions: the thread message list (top, larger) and the session activity stream (bottom, compact). Each has its own scroll. The user reads messages normally; the activity stream runs independently below.

### How It Works

**Recipient Picker:** Modal dialog (DaisyUI `modal`). Triggered by a "+" button in the Submenu header. Modal contains: SearchField, list of users/agents with avatars and StatusChips, a message textarea at the bottom. Submit creates the thread and closes the modal.

**Dial-in Composition:** When an active session is detected on the thread's task:
- The Main pane gains a collapsible bottom region (default height: 200px, resizable via drag handle).
- **Top region (60-70%):** Standard ThreadShell -- messages, composer at bottom.
- **Bottom region (30-40%):** Activity stream -- a compact, auto-scrolling feed of session events rendered as dense KeyValue-like rows: `[timestamp] tool_call: edit_file(src/index.ts)` / `[timestamp] reasoning: "Checking if the auth middleware..."` / `[timestamp] cost: +$0.12 ($2.46 total)`.
- The bottom region has its own SearchField for filtering activity types.

**Dial-in Affordance:** In the thread header, a toggle button: `[icon: activity] Dial In`. Visible only when the agent has an active session on this task. Clicking it opens the bottom pane.

**Mode Transition:** When session ends, the bottom pane shows a terminal state: "Session ended -- [outcome]. 47 actions, $4.20 spent." The pane remains visible until manually dismissed or the user navigates away.

### Strengths
- Clear separation: messages are messages, activity is activity. No conceptual mixing.
- Each region scrolls independently -- you can read old messages while activity streams below.
- The composer stays attached to the message list -- interjection is spatially obvious.
- Collapsible: the user can dismiss the activity pane when not needed.
- The bottom pane is analogous to a browser DevTools panel -- power users will find it natural.

### Weaknesses
- Vertical space is consumed. On laptop screens (768-900px viewport height), 200px for the activity pane leaves the message list cramped.
- Two scroll containers in one pane add cognitive overhead.
- The "dial in" toggle is a mode switch -- the user must discover and activate it.
- Resizable split-pane is non-trivial to implement accessibly (keyboard resize, min/max constraints).

---

## Variant C: Companion Rail (Side-by-Side)

### Core Idea

Dial-in mode co-opts the existing companion pane pattern (already used by ArtifactView for complex reviews -- section 2.4 of the IA doc). The Main pane splits horizontally: conversation on the left, session activity on the right. This mirrors the existing `left: conversation | right: artifact` pattern but substitutes the artifact with a live activity stream.

### How It Works

**Recipient Picker:** Inline in the Submenu. A "New Thread" NavItem at the top of the thread list. Clicking it replaces the thread list content with a recipient search + selection UI (same column, no overlay). Selecting a recipient shows a mini-composer inline. Sending the message creates the thread and the submenu returns to the thread list with the new thread selected.

**Dial-in Composition:** When the user activates dial-in on a task thread:
- The Main pane splits into two columns (existing companion layout pattern):
  - **Left (50-60%):** Thread messages + composer (standard ThreadShell). The composer is the interjection point.
  - **Right (40-50%):** Session activity panel. Header shows: agent name, session duration, StatusChip, cost burn. Below: auto-scrolling activity entries (tool calls, reasoning, cost ticks). Dense monospace rendering for activity entries.
- The right panel has filter tabs at top: `All | Tools | Reasoning | Cost`.

**Dial-in Affordance:** The thread header shows a "Session Active" badge (StatusChip with `healthy` state). Next to it, a button: "View Session". Clicking splits the pane. When already in companion mode (e.g., viewing a review artifact), dial-in replaces the artifact pane.

**Mode Transition:** When session ends, the right panel transitions to a summary card: session duration, total cost, action count, outcome. A "Close" button dismisses the panel, returning to full-width thread view.

### Strengths
- Leverages an EXISTING layout pattern (companion pane from section 2.4). No new layout paradigm.
- Horizontal split preserves full vertical space for both messages and activity.
- The thread stays full-height -- messages are never cramped.
- Clear spatial metaphor: left = conversation (what I say), right = observation (what the agent does).
- Filter tabs give power users control over activity noise.
- Graceful degradation: on narrow viewports, the companion pane can stack below (same as ArtifactView companion on mobile).

### Weaknesses
- Horizontal space is consumed. The thread list (Submenu) + split Main means 4 columns of content. On 1280px displays, each column gets narrow.
- The companion pattern is currently used for artifact review -- reusing it for session activity means the two cannot co-exist (a review thread with an artifact AND a live session would conflict for the right panel).
- "View Session" button is still a mode switch, though it's more discoverable than Variant B's toggle.

---

## Variant Comparison Matrix

| Dimension | A: Interleaved | B: Stacked | C: Companion |
|-----------|---------------|------------|--------------|
| **Concept clarity** | Weak -- mixes ephemeral + persistent | Strong -- clear separation | Strong -- spatial metaphor |
| **Reuses existing patterns** | Partially (CommentRow variant) | No (new split-pane) | Yes (companion layout) |
| **Component budget impact** | 0 new (style variant of CommentRow) | 1 new (resizable split pane) | 0 new (reuses companion) |
| **Vertical space** | Full | Cramped on laptop | Full |
| **Horizontal space** | Full | Full | Reduced |
| **Information separation** | Poor | Good | Excellent |
| **Interjection clarity** | High (same composer) | High (composer in top pane) | High (composer in left pane) |
| **Implementation complexity** | Low | Medium-High | Medium |
| **Scroll independence** | None (one scroll) | Full (two scrolls) | Full (two scrolls) |
| **Graceful degradation** | Good (just stops adding rows) | Acceptable (pane hides) | Good (summary card) |

---

## Recommended Variant: C (Companion Rail)

### Rationale

1. **Existing pattern reuse.** The companion layout already exists in the codebase for ArtifactView complex reviews (section 2.4 of the IA doc). Dial-in reuses this exact split, substituting activity for artifact. No new layout paradigm to learn, implement, or maintain.

2. **No component budget impact.** Zero new custom components. The activity stream renders as a list of KeyValue + StatusChip rows inside the existing companion pane. Filter tabs are DaisyUI `tabs tabs-bordered`.

3. **Clear spatial metaphor.** Left = what you and the agent say to each other. Right = what the agent is doing right now. The mental model is "I'm watching over their shoulder while having a conversation."

4. **Full vertical height for messages.** Unlike Variant B, the thread never gets cramped. On a 900px laptop, all vertical space serves messages OR activity -- never both fighting for the same axis.

5. **Conflict resolution for review+session overlap.** If a task thread contains BOTH a review message AND an active session, the user can toggle between artifact view and session activity in the right panel. One panel, switchable content -- a natural extension of the companion pattern.

### Concession

The companion pattern reduces horizontal space for the thread. On 1280px viewports, the left column (messages) drops to roughly 500px. This is acceptable -- message content is primarily text, and 500px is wider than most chat interfaces (Slack's message column is ~450px at default).

---

## Recipient Picker: Recommended Approach

**Inline Submenu replacement** (from Variant C) is the strongest option:

- A "New Thread" button appears at the top of the Conversations submenu thread list (above the filter chips, below the SearchField).
- Clicking it replaces the thread list with a recipient picker: SearchField (focused immediately), scrollable list of users + agents.
- Each row: Avatar + Name + Role/StatusChip. Agents show their current status (`active` = has a session, `idle` = no session, `paused`).
- Selecting a recipient transitions the submenu to show a single-line message input. The main pane shows an empty thread state with the selected recipient's name.
- Sending the first message creates the DM thread atomically (POST /api/threads with initial message).
- The submenu returns to the thread list with the new thread selected.
- Escape at any point cancels and returns to the thread list.

This avoids modals (which break flow and obscure context) and slide-overs (which layer over the submenu creating z-index confusion). The inline approach is consistent with how the PitchSelector replaces the Kanban in the Work view.

---

## Dial-In Affordance: Recommended Approach

1. **Thread header badge:** When the thread's host task has an active session, a StatusChip with `healthy` status and text "Live" appears in the thread header area. This is passive -- always visible when applicable.

2. **Activation:** Next to the badge, a compact button "Dial In" (DaisyUI `btn btn-ghost btn-xs`). Clicking it splits the pane into companion layout.

3. **Passive detection:** The frontend queries `GET /api/sessions?task_id=<hostId>&state=active` when rendering a task-hosted thread. If an active session exists, the affordance appears. No WebSocket subscription needed just for detection -- the session state is fetched on thread open.

4. **Deactivation:** An "X" button in the top-right of the activity panel closes it. Or the session ends naturally, transitioning to the summary state.

---

## States & Transitions

### Conversations Submenu States

| State | Content | Trigger |
|-------|---------|---------|
| Thread List (default) | Sectioned thread rows | Page load |
| Recipient Picker | Search + user/agent list | Click "New Thread" |
| Picker + Recipient Selected | Selected recipient + message input | Select a row |

### Main Pane States (Thread Detail)

| State | Content | Trigger |
|-------|---------|---------|
| A: Empty | "Select a thread" placeholder | No threadId in URL |
| B: Thread (normal) | ThreadShell full-width | Thread selected, no active session |
| C: Thread + Dial-In | Companion split: messages left, activity right | User clicks "Dial In" |
| D: Thread + Session Ended | Companion split: messages left, summary card right | Session ends during dial-in |
| E: Not Found | Error empty state | Thread 404 |

### Activity Panel Lifecycle

```
(hidden) --[user clicks Dial In]--> streaming
streaming --[session ends]--> summary
summary --[user clicks X]--> (hidden)
streaming --[user clicks X]--> (hidden)
```

---

## Keyboard & Accessibility

- **N** in Conversations view: opens recipient picker (focus SearchField).
- **Escape** in recipient picker: returns to thread list.
- **D** in thread detail (when badge visible): toggles dial-in panel.
- **Tab** from the message composer does NOT move focus into the activity panel. The activity panel is a read-only observation surface -- keyboard users interact with the left pane only.
- Activity panel is `aria-live="polite"` so screen readers announce new entries without interrupting the conversation context.

---

## Mobile Considerations

On mobile (viewport < 768px):
- **Recipient picker:** Full-screen overlay (replaces the Conversations tab content) with a back arrow.
- **Dial-in:** Not available on mobile. The "Live" badge is still visible as an FYI indicator, but no companion split. Users must use desktop to observe sessions.
- **Rationale:** Session observation is a power-user, desktop-first activity. Mobile is for quick replies and approvals.
