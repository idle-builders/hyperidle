# AD8b Approved Design -- Assistant Agent + Overlay

## Summary

The CocOverlay becomes AssistantOverlay. The core shape is unchanged: a 360px fixed-position floating panel rendering ThreadShell. The extension adds three capabilities: (1) tool-call result rendering inside plain messages, (2) review-message gating for high-risk actions, and (3) a soul-prompt editor in settings. No new design-system components.

---

## 1. Overlay shell -- AssistantOverlay

### Dimensions and positioning (unchanged from CocOverlay)

- **Width:** 360px
- **Min height:** 200px
- **Max height:** 70vh
- **Position:** fixed, bottom-16 right-4
- **z-index:** 30 (above Main z-0, below Settings z-40)
- **Surface:** `--surface-overlay`, `--border-default`, `--shadow-elevated`
- **Radius:** `--r-subtle` (10px)
- **Animation:** fade-in + translateY, `--motion-fast`

### Header bar

- Title: "Assistant" (15px, font-weight 600, `--text-primary`)
- Close button: 24x24, X icon, `--text-secondary` hover `--accent-primary`
- Border bottom: 1px `--border-subtle`
- Padding: 12px horizontal, 9px vertical

### Structure (top to bottom)

1. **Header bar** (shrink-0)
2. **Context chips area** (conditional -- only when refs attached, shrink-0)
3. **ThreadShell** (flex-1, scrollable message stream + pinned composer)

### Keyboard

- **Escape** closes the overlay
- **Focus** moves into overlay on open (first focusable element)
- Overlay does NOT close on outside click (user interacts with Main while overlay is open)

### Context chips area

Unchanged from current CocOverlay. Renders above the ThreadShell when `contextRefs.length > 0`.

- Chip shape: `--r-subtle` border, `--border-subtle`, `--surface-elevated` bg
- Kind label: 10px mono uppercase `--text-tertiary`
- Entity label: 13px `--text-secondary`, max-width 120px truncate
- Dismiss: "x" button, `--text-tertiary` hover `--text-primary`
- Container: flex-wrap, gap 3px, px 12px py 6px, border-bottom `--border-subtle`

---

## 2. Message rendering inside ThreadShell

ThreadShell already handles the four message types. The overlay uses ThreadShell exactly as Conversations does, with these props:

### 2.1 Plain messages (assistant responses with tool results)

When the assistant executes tools and responds, the response arrives as a **plain message** with structured text. Tool-call results are NOT a new message type -- they are rendered as part of the assistant's plain text response.

**Why plain text, not a new message type:** The assistant's LLM response is a natural-language summary of what it did, with entity references inline. The message type system (plain/review/questionnaire/verdict) is a closed vocabulary for structural interaction patterns. "The assistant ran a query and here are the results" is content, not structure. Adding a "tool_result" message type would break the closed vocabulary for a rendering concern.

**Tool-call visibility:** Tool calls that the assistant made are visible as a collapsible section in the message stream. This uses CommentRow's existing `richHeader` slot:

- A tinted row (same pattern as AQ-016 action blocks): `rgba(22, 118, 79, 0.03)` bg, `--r-subtle`, 9px 12px padding
- Tool name in mono 11px `--text-tertiary` uppercase
- Result summary in 13px `--text-secondary`
- If multiple tool calls in one response, they stack vertically with 6px gap

**Implementation detail for architecture:** The server-side response loop posts the assistant's natural-language response as a plain message. Tool-call metadata (which tools were called, inputs, outputs) is stored on the message row as structured metadata, not in the payload text. The UI reads this metadata to render the tool-call section above the message text. This keeps the plain-message payload clean while enabling rich rendering.

### 2.2 Review messages (high-risk action approval)

When the assistant proposes a high-risk action (create_bet, edit_bet, submit_review, handoff_to), it posts a **review message** using the existing `submit_review` tool. ThreadShell already renders review messages as RichMessageCard with verdict buttons.

**At 360px width:** The verdict buttons (Approve, Approve with comments, Request changes, Edit, Reject) will naturally wrap to a vertical stack. The existing `flex-wrap gap-[9px]` on the verdict toolbar handles this gracefully. No layout change needed.

**Review message content:**
- Title: description of the proposed action (e.g. "Create bet: Test Bet")
- Reasoning: why the assistant thinks this is appropriate (e.g. "1. User requested this. 2. Budget $500 is within range.")
- Artifact ref: points to a preview of the to-be-created entity (uses existing ArtifactView `action_summary` shape -- a list of KeyValue rows showing the proposed fields)

### 2.3 Verdict messages

Unchanged. When the user clicks Approve/Reject on a review message, the verdict is posted as a verdict message. ThreadShell handles this.

### 2.4 Artifact rendering

The overlay passes an `artifactSlot` render prop to ThreadShell. When a review message references an artifact (the proposed action), the artifact renders inline using the existing ArtifactView component (Tier 3 shell composition).

At 360px width, the `action_summary` shape (list of KeyValue rows) works well -- it is a vertical list, not a side-by-side layout.

---

## 3. Sidebar trigger

**Label:** "Assistant" (unchanged from current -- already reads "Assistant" after AD8a)

**Behavior:** Click toggles overlay open/closed. `aria-expanded` reflects state. `aria-label="Assistant"`.

**Accent when open:** `--accent-primary` text color (already implemented).

---

## 4. Conditional pinning

The assistant thread starts **unpinned**. It pins after the first real assistant response.

**UI impact:** The thread does NOT appear in the Conversations sidebar thread list until it has been pinned. Before the first response, the only way to reach the assistant is through the sidebar "Assistant" button.

**After pinning:** The thread appears in the sidebar Conversations list like any other pinned thread, with the title "Assistant" and the assistant's avatar.

---

## 5. Settings -- Soul prompt editor

A new section in SettingsPage between "Models" and "Appearance":

### Section layout

```
[ASSISTANT]  (SectionTitle -- 13px/600 uppercase, --text-tertiary, border-bottom)

Soul prompt
[textarea -- full width, min-height 120px, max-height 300px, resize vertical]

[Save] (small primary pill button, right-aligned)

The soul prompt defines your assistant's personality and capabilities.
You can reference your name, your team's focus areas, and any special
instructions.
(12px --text-tertiary helper text below textarea)
```

### Component composition

- **SectionTitle**: existing pattern from SettingsPage ("ASSISTANT")
- **Label**: 13px/500 `--text-secondary` ("Soul prompt")
- **Textarea**: standard form element, `--surface-page` bg, `--border-default` border, `--r-subtle` radius, 13px `--text-primary`, 15px font-size on mobile (AQ-005 iOS zoom). Placeholder: "You are a helpful assistant..."
- **Save button**: small primary pill (`px-[12px] py-[7px] text-[12px] font-[500] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]`)
- **Helper text**: 12px `--text-tertiary`

### States

- **Loading**: textarea disabled, placeholder "Loading soul prompt..."
- **Dirty**: Save button enabled (it starts disabled when content matches server)
- **Saving**: Save button shows "Saving..." and is disabled
- **Saved**: brief flash of "Saved" label next to button, reverts to disabled Save after 2s
- **Error**: inline error text below textarea in `--status-error`, Save button re-enabled

### Data flow

- `GET /api/users/:id/assistant` returns the assistant agent row including soul prompt text
- `PATCH /api/users/:id/assistant` with `{ soulPrompt: string }` updates the soul prompt
- The soul prompt is stored on the assistant agent's user row (agents are users with kind=ai)

---

## 6. Context attachment

Unchanged from current CocContext/CocAttachButton pattern. The "+" button appears on:

- **BetCard** -- attaches `{ kind: "bet", id, label: betTitle }`
- **TaskCard** -- attaches `{ kind: "task", id, label: taskTitle }`
- **KnowledgeRow** -- attaches `{ kind: "knowledge_item", id, label: itemTitle }`
- **Block** (via BlockActionsPopover) -- attaches `{ kind: "block", blockId, hostKind, hostId, label }`
- **CommentRow / ThreadRow** -- attaches `{ kind: "message", id, label: snippet }`

The CocContextRef type already supports all these kinds. The CocAttachButton already renders nothing when the overlay is closed.

**Rename consideration:** CocContext/CocAttachButton names carry the dead "CoC" noun. AD8b renames:
- `CocContext` -> `AssistantContext`
- `CocAttachButton` -> `AssistantAttachButton`
- `CocContextRef` -> `AssistantContextRef`
- `useCocThread` -> `useAssistantThread`

---

## 7. States (overlay)

| State | What renders |
|---|---|
| **Closed** | Nothing. Overlay returns null. |
| **Loading** | Overlay shell + centered spinner (existing pattern) |
| **Error** | Overlay shell + error text + Retry button (existing pattern) |
| **Empty** | Overlay shell + ThreadShell EmptyState ("No messages yet. Be the first to post in this thread.") |
| **Populated** | Overlay shell + ThreadShell with message stream + composer |
| **Review pending** | Populated + RichMessageCard at top of stream (promoted review message) with verdict buttons |
| **Saving verdict** | Review pending + "Saving..." in verdict footer |
| **Verdict error** | Review pending + error alert + Retry button in verdict footer |

---

## 8. Mobile adaptation

The overlay is desktop-only at 360px. On mobile (viewport <= 768px):

- The "Assistant" button in the sidebar bottom strip navigates to a full-screen assistant conversation page (not an overlay)
- This full-screen view uses the same ThreadShell with identical message rendering
- The context-chip area moves above the composer in the full-screen view
- The soul-prompt editor in Settings works identically (textarea is already full-width)

**Out of scope for AD8b:** The full-screen mobile assistant view. AD8b ships the overlay (desktop). Mobile adaptation is deferred to AE4 (mobile views).

---

## 9. Rejected directions

1. **Split-pane overlay (tool calls in left column, chat in right):** Rejected. 360px is too narrow for two columns. The information density would be unreadable. Tool calls belong inline in the message stream.

2. **Persistent tool-call sidebar/drawer:** Rejected. Adds a new Tier 3 component for a secondary concern. Tool calls are context for the conversation, not a parallel information stream. They belong inline.

3. **Expanding overlay to full-width panel:** Rejected. The overlay is intentionally constrained. It is a quick-access surface, not the primary workspace. Users who want full-thread features use the Conversations view.

4. **Chat-bubble layout (messages alternate left/right):** Rejected. HyperIdle uses a feed layout (all messages left-aligned with avatar + sender header). Bubble layout wastes horizontal space and conflicts with the dense aesthetic.

5. **Floating action buttons for common assistant commands:** Rejected. The composer is the universal input. Pre-built command buttons are a crutch that fragments the interaction grammar. The assistant interprets natural language.

6. **Separate "Actions" tab in the overlay:** Rejected. Tabs in a 360px overlay create tiny unusable viewports. Everything is one stream.

---

## 10. Open questions for architecture

1. **Message metadata for tool calls:** How does tool-call metadata attach to the plain message? Options: (a) a `toolCalls` field on the message row, (b) a separate `tool_calls` table joined by messageId, (c) embedded in the plain payload as a structured `toolCalls` array. Recommend (c) -- extend PlainPayload with optional `toolCalls?: Array<{ name: string; input: unknown; output: string }>`.

2. **Assistant agent creation timing:** At user registration (always creates the agent) vs. first overlay open (lazy). Recommend registration-time: simpler, no race conditions, one less loading state.

3. **Session provisioning:** When the user posts a message, how is the assistant session provisioned? The AD2 task dispatcher provisions sessions for tasks. The assistant needs a different path: message posted -> assistant session created -> reads thread history + tools -> responds -> session ends. Recommend a dedicated assistant dispatcher that listens for `message_created` events on assistant threads.

4. **Soul prompt storage:** On the assistant's user row (a text column) or in a separate config table? Recommend the user row -- add a `soulPrompt` text column to the users table, nullable, only populated for kind=ai agents.

5. **Pinning trigger:** Server-side (after assistant posts first response, update thread.pinned=true) vs. client-side (after receiving first response, PATCH thread). Recommend server-side -- the assistant's response handler pins the thread atomically.
