# HyperIdle Conversation Current State: Comprehensive Inventory

**Date:** 2026-06-17  
**Scope:** Complete have-vs-need map for AM1 (Conversation Experience redesign)  
**Sources:** packages/shared/src/thread.ts, packages/design-system/src/{ThreadShell,CommentRow,RichMessageCard,Composer}, packages/web/src/pages/Conversations.tsx, docs/human-interface-layer/

---

## 1. The Thread/Message Primitive: Complete Specification

**Status:** Stable, locked contract. AM1 renders *within* these; does not reshape them.

### 1.1 Thread Row (Core Identity)
**File:** `packages/shared/src/thread.ts:68–78`

```typescript
interface Thread {
  readonly id: ThreadId;
  readonly hostKind: HostKind;         // 8 kinds: bet | task | knowledge_item | artifact | agent | user | team | factory
  readonly hostId: string;
  readonly initiatorId: IdentityId;
  readonly participants: ReadonlyArray<IdentityId>;
  readonly pinned: boolean;
  readonly resolvedAt: string | null;
  readonly lastActiveAt: string;
  readonly createdAt: string;
}
```

### 1.2 Message Types (Discriminated Union)
**File:** `packages/shared/src/thread.ts:31–32, 225–241`

**Closed vocabulary:** `plain | review | questionnaire | verdict`

Each message is immutable after persistence (audit rule). Types:

1. **plain** — User/agent deliberate message with optional refs + toolCalls + notice
2. **review** — Review title + reasoning list + artifactRef (visual embed)
3. **questionnaire** — Title + question + options list (renders disabled buttons, L11)
4. **verdict** — Binding terminal action (approve / approve-with-comments / request-changes / edit / reject) + resolvesMessageId reference

### 1.3 Verdict Semantics (Critical)
**File:** `docs/human-interface-layer/thread-primitive.md:20–21`

- **Binding verdicts** (5): `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject` — emit a `verdict`-payload message that terminates the review message they resolve.
- **Non-binding** (3): `comment`, `inline-comment`, `reply` — emit `plain` messages, do NOT terminate
- **Sidecar operations** (2): `snooze`, `escalate` — emit no message in the thread (workflow-level, not conversation substance)

### 1.4 InlineRef Types (3 Variants)
**File:** `packages/shared/src/thread.ts:96–134`

Discriminated union. A message's `payload.refs` array holds these:

```typescript
type InlineRef = EntityRef | BlockRef | MentionRef;

interface EntityRef {
  kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
  id: string;
}

interface BlockRef {
  kind: "block";
  blockId: string;
  hostKind: BlockHostKind;
  hostId: string;
}

interface MentionRef {
  kind: "mention";
  identityId: IdentityId;
  displayName: string;
  sourceText: string;  // AE5: CRITICAL — round-trip fidelity for @name tokens
}
```

### 1.5 Message Identity & Idempotency
**File:** `packages/shared/src/thread.ts:22, packages/db/src/schema.ts` (messages table)

- **Uniqueness constraint:** `(thread_id, sender_id, client_key)` — dedupes at-least-once retries
- **Ordering:** by `(createdAt, id)` ascending
- **Mutability:** payload immutable after persistence; soft-delete via `deletedAt`; redaction via structured `RedactedPayload` (preserves id/sender/type/createdAt)

### 1.6 Configurations (Non-Persisted Classifier)
**File:** `packages/shared/src/thread.ts:268, 280–290`

Not an enum; derived from (hostKind + pinned + participants):

- **DM:** host=agent/user, 2 participants
- **Assistant:** host=user, pinned=true
- **Feed:** host=team/factory (broadcast)
- **Attached:** all other combinations

---

## CRITICAL QUESTION: Thread vs Conversation

**The founder's question:** Is there Slack-style sub-threading (a message spawning a reply-thread)? Or is a "Thread" itself the whole conversation container (1 thread = 1 conversation)?

### Answer: One Thread = One Conversation Container

**Quote from `docs/human-interface-layer/thread-primitive.md:28`:**
> "A *Conversation* is the deliberate-messaging reading of a Thread, rendered through the **Part model**"

**Quote from `docs/human-interface-layer/part-model.md:34`:**
> "Cardinality. Conversation ↔ Thread is 1:1."

**There is NO sub-threading / nested replies.** A Thread is a flat, chronological append-only sequence. Every message lives at the same level. There is no "reply to a message spawning a side-thread" — responses (verdict, plain comment, questionnaire answer) are all first-class messages in the main thread sequence, ordered by `createdAt`.

The distinction between "reply" and "message" is semantic only:
- A `verdict` message resolves a prior `review` message (links via `resolvesMessageId`)
- A `plain` message with text is a reply (no special marker — just a message)
- A questionnaire answer would be a `plain` message (per L11 plan §5.6: "answer dispatch lands in a follow-up")

---

## 2. Existing Conversation UI: Complete Feature Inventory

### 2.1 ThreadShell (Composition Root)
**File:** `packages/design-system/src/ThreadShell.tsx:239–531`

**What renders:**
- `ThreadHostBanner` (top) — thread context + participants + status flags
- Message stream (middle) — ordered messages dispatched by type
- `Composer` (bottom) — plain-message input, always pinned

**Dispatch logic** (lines 415–520):

1. **Promoted rich message** (first-class card): oldest unresolved `review` or `questionnaire` rendered as `RichMessageCard`
2. **Other unresolved review/questionnaire** (stream rows): rendered as `CommentRow` with rich slots
3. **Plain/verdict/all other:** rendered as `CommentRow` (standard body)

**Sender grouping:** 5-minute window (line 46); consecutive same-sender messages within 5 min omit repeat sender header

**Props:** identities map, artifactSlot renderer, renderRefEmbeds render prop (for BlockRefEmbed), renderMessageExtra render prop (for tool-call summaries, AD8b)

**States:** empty, loading, error, populated (4 states per approved.md §4)

### 2.2 RichMessageCard (Tier 2 Component)
**File:** `packages/design-system/src/RichMessageCard.tsx:265–451` (truncated, full ~600 lines)

**Renders:**
- Header metadata: REVIEW/QUESTION tag, title, reasoning list (optional collapsible), question text
- Body: artifactSlot (ArtifactView card) — only for unresolved review
- Footer: Verdict buttons (Approve, Approve with comments, Request changes, Edit, Reject) + error alert + retry

**States:**
- `idle` — action buttons enabled
- `saving` — buttons disabled, "Saving..." state
- `error` — retry button appears
- `resolved` — shows verdict decision + actor + timestamp + Re-expand toggle (read-only card)

**Props:**
- `message`, `sender` (id/name/role/avatarUrl), `blocking` (left-border danger color), `state`
- `artifactSlot` — ReactNode for the visual embed
- `onAction` — callback for verdict/answer/retry actions

**Critical detail:** Oldest unresolved review wins (line 272: `promotedRichMessageId(ordered)`). Once resolved, card collapses to a one-line RESOLVED header. Re-expansion is UI-local state (line 297: `[reExpanded, setReExpanded]`).

### 2.3 CommentRow (Per-Message Row)
**File:** `packages/design-system/src/CommentRow.tsx:216–450+`

**Renders:**
- Sender header (conditionally): avatar, name, (Agent badge if isAgent=true), timestamp
- Rich slots (if message type is review/questionnaire and slots supplied): richHeader, richBody, richActions
- Standard body: payload rendering via `derivePayloads()` → `renderPayload()` pipeline
  - **Plain messages:** markdown → bold, code blocks, lists, headings, links (via block rendering pipeline)
  - **Verdict messages:** StatusChip + decision label + optional note
  - **Redacted:** "Redacted by X — reason" (greyed italic)
- **Mention rendering (AE5):** MentionToken spans with @displayName (inline, non-interactive)
- afterBody slot (for BlockRefEmbed cards)

**Props:**
- `message`, `sender`, `showSenderHeader`
- `richHeader`, `richBody`, `richActions` (optional slots from ThreadShell)
- `sanitizeHtml` — for raw HTML block payloads (DOMPurify pass-through, web-layer consumer)
- `afterBody` — for inline ref embeds

**Variants:** `data-variant="rich-review" | "rich-questionnaire"` (line 229–232)

### 2.4 Composer (Plain-Message Input)
**File:** `packages/design-system/src/Composer.tsx:32–111`

**Current features:**
- Textarea input (multiline, resizable)
- "Send" button (pill shape, accent-primary)
- **Keyboard submission:** Cmd/Ctrl+Enter sends
- Error state display
- Disabled state while submitting
- Client-side idempotency key generation (`crypto.randomUUID()`)

**Props:**
- `threadId`, `onSubmit` callback
- `unresolvedReviewLink?` — optional button to jump to unresolved review (L1 plan §7.6)

**What's NOT supported today:**
- Rich text formatting UI (no bold/italic/code toggle buttons)
- @mention typeahead / autocomplete
- File attachment picker
- Emoji picker
- Message edit / delete after send
- Draft auto-save
- Typing indicator send
- Undo/history

### 2.5 BlockRefEmbed (Inline Reference Card)
**File:** `packages/web/src/components/BlockRefEmbed.tsx:32–97`

**Renders:**
- Loading: Skeleton bar
- Degraded: "Source changed — block no longer exists"
- Error: "Could not load reference" + retry button
- Resolved: bordered card with "Block from [host]" label + rendered block content

**Props:** blockId, hostKind, hostId

**Hooked at:** ThreadShell's `renderRefEmbeds` render prop (lines 104–105 of ThreadShell) — called per message with `message.payload.refs`

### 2.6 ThreadHostBanner (Context Chrome)
**File:** `packages/design-system/src/ThreadHostBanner.tsx:1–100+`

**Renders:**
- Host kind + title (link to host detail page)
- Pinned indicator (SVG pin icon)
- Status flags: blocking (danger left-border), resolved (greyed)
- Participant avatars with operational status dots (AE5: green=active, red=error, none=idle)

**Props:**
- `hostKind`, `hostTitle`, `hostHref`
- `blocking`, `resolved`, `pinned`
- `participants: {id, name, avatarUrl?, isAgent?, operationalStatus?}`

### 2.7 ThreadRow (List Item in Submenu)
**File:** `packages/design-system/src/ThreadRow.tsx:91–200+`

**Renders:**
- Title + snippet
- Timestamp (relative)
- Status chip (e.g., blocking / active / resolved)
- Host tag badge (bet / task / agent / etc.)
- Participant avatar stack (overlapping 24px circles)
- Message count badge (green if unread, neutral if read)
- Pinned indicator (SVG before title)
- Optional actions menu (swipe/right-click on mobile)

**Props:**
- `title`, `snippet`, `timestamp`, `status?`, `tag?`
- `blocking?`, `pinned?`, `unread?`, `selected?`
- `avatars?: ThreadAvatarItem[]` (with operationalStatus for presence dots)
- `messageCount?`, `hostTag?: HostKind`

### 2.8 Conversations Page (Shell Integration)
**File:** `packages/web/src/pages/Conversations.tsx:24–200+`

**States:**
- A: No thread selected (empty with "Be the first" prompt)
- B: Loading thread detail
- C: Thread loaded, no errors
- D: Error loading thread
- E: Thread not found (no ThreadShell rendered)

**Features:**
- Thread list in sidebar (submenu) via `ThreadSections` component
- Dial-in support (Q1): When viewing task-hosted thread with active session, "Dial In" button opens split view (thread left flex-3, `SessionActivityPanel` right flex-2)
- `renderRefEmbeds` provider: wraps BlockRefEmbed cards for inline embeds
- Artifact slot resolver: maps old ArtifactViewShape (5 kinds) → new ArtifactView kind strings

**Page layout:**
- Header with thread title + agent name + timestamp + type badge
- Main detail pane: ThreadShell (message stream + composer)
- Optional right pane: SessionActivityPanel (when dial-in active)

---

## 3. App Shell & Where Conversations Live

### 3.1 Shell Structure
**File:** `docs/information-architecture/app-shell-always-present.md:1–44`

**Frame (always present):**
- **Sidebar (left):** Search row + 3 section tabs (Conversations / Work / Knowledge) + fast-nav list + Settings
- **Main (center):** Active section's view content
- **Optional right pane:** Dial-in companion (Q1, session activity)

**Navigation rules:**
- Clicking a section tab → swaps the fast-nav list + navigates main to section overview (`/conversations`, `/work`, `/knowledge`)
- Clicking a fast-nav item → navigates directly to detail (`/conversations/:threadId`, etc.)
- ⌘1/2/3 keyboard shortcuts map to sections

### 3.2 Conversations View Container
**File:** `docs/information-architecture/conversations-view.md:1–113`

**Sidebar submenu (Thread List):**
- Search/jump bar
- Filter bar (product, agent, type: review/chat, status: blocking/open/snoozed/resolved)
- Pinned section header + 1 assistant thread item
- Active Threads section header + items
- Resolved section header (24h window) + items
- Thread actions (right-click/swipe): Snooze, Archive, Mute
- Estimated review time tag on each thread

**Main pane (Thread Detail):**
- **Thread header:** title, agent name, timestamp, type badge
- **Review threads:** agent reasoning block (collapsible, expanded by default) → ArtifactView → conversation history → verdict action bar → linked threads indicator
- **Chat threads:** message list → reply input → action buttons (Start task, Close, Escalate)

**Message list order:** oldest first (ascending by createdAt)

---

## 4. Feature Gap Analysis: MISSING vs Real Chat

| Feature | Status | Citation |
|---------|--------|----------|
| **Reactions (emoji, +1, etc.)** | ABSENT | No `reactions` field on Message; no UI affordance; no payload type |
| **Attachments / File Upload** | ABSENT | Composer has no file picker; Thread/Message schema has no file_lease_ids (legacy L1 migration removed them); no upload endpoint |
| **Rich Text Formatting** | PARTIAL | Markdown *rendering* supported (bold, code, lists, headings via `renderPayload`), but no inline formatting UI (no bold/italic button toggle); plain text input only |
| **@Mention Autocomplete** | PARTIAL | MentionRef exists + MentionToken rendering (AE5); but NO typeahead UI — mentions must be passed as structured refs (server-side responsibility) |
| **Message Hover Actions** | ABSENT | No edit/delete/pin/copy-link/save affordances on messages; soft-delete (`deletedAt`) exists in schema but no UI to trigger it |
| **Read State / Presence** | PARTIAL | Unread badge exists on ThreadRow; presence dots on avatars (AE5: active/error/idle); but NO read-receipts per message, NO "User is typing" indicator |
| **Typing Indicator** | ABSENT | No `typing` state; no client broadcasting; no Composer typing-send signal |
| **Message Search** | ABSENT | No search UI in Conversations; no full-text index on payload; search is sidebar quick-jump only |
| **Multi-User Identity** | PRESENT | Thread carries `participants[]`, `initiatorId`; sender visible on every message; ThreadHostBanner shows avatars with operational status; but only 2-person DM recognized (`participants.length === 2`), rest default to "attached" |
| **Sub-Threading / Reply Threads** | ABSENT | NO nested replies; all messages flat chronological sequence; verdict resolution via `resolvesMessageId` link only, not a sub-thread spawn |
| **Message Drafts** | ABSENT | No draft persistence; Composer clears on send; no "Save draft" affordance |
| **Redaction** | PRESENT | `RedactedPayload` exists + "Redacted by X — reason" UI (CommentRow line 185–189) |
| **Soft Delete** | PRESENT | `deletedAt` field on Message; renders conditionally (UI omits deleted rows) |
| **Session Reference** | PLANNED (AM1) | Concept locked in `plans/AM1/concept.md` (Part model Phase 3); SessionActivityPanel exists (Q1, session dial-in); but NO Embed type for session-reference yet |

---

## 5. The Locked AM1 Concept & Stress Points

**File:** `plans/AM1/concept.md:1–147`

### 5.1 What AM1 Committed To

**Phase 0 — The Nouns:**
- **Conversation** (reshaped): deliberate-messaging reading of Thread, rendered through Part model
- **Part** (new primitive): typed, source-agnostic rendering unit; closed vocabulary
- **Part model** (new structure): Part kinds + calm reading column + Embed/Fold devices
- **Embed** (reshaped): inline compact card for referenced thing (artifact, block, diff, session-reference, entity-ref, mention)
- **Fold** (new device): collapse-to-summary affordance (UI-local state, never persisted)
- **Session reference** (new satellite): Embed pointing at Session without inlining activity

**Phase 1 — Essence:**
- Conversation is deliberate messages only (not a work-log)
- Part is **source-agnostic** (Message → Part; session event → Part in AM3)
- Embed rendering model: closed set (artifact, block, diff, session-reference, entity-ref, mention)
- Fold is UI-local, never persisted
- Session reference rejects inlining session work-log

**Phase 2 — Rejection (Critical Guards):**

1. **NOT a session work-log / transcript.** (Hard rule 3: "Session activity never renders as first-class conversation Parts")
2. **NOT a live runtime activity stream.** (Messages are deliberate; HarnessEvents are not messages)
3. **NOT a new primitive replacing Thread.** (Renders within Thread/Message/verdict unchanged)
4. **Part model NOT conversation-only.** (AM3 reuses it without duplication — uniformity contract)
5. **NOT stored data.** (Parts are derived; no `part` table/column; Message rows stay truth)
6. **Embed NOT a bare link or (for session) inlined work-log.** (Compact reference card only)

### 5.2 Stress Points vs Founder's Questions

**Point 1: Thread-vs-Conversation Clarity**
- **Founder asked:** Is there Slack-style sub-threading?
- **Concept answer:** NO. 1:1 Thread ↔ Conversation. All messages flat.
- **Stress:** The concept language uses both "Thread" and "Conversation" — could be confusing. But thread.ts is the data contract (stable); concept locks the rendering reading as "Conversation."

**Point 2: Multi-User Identity in Conversations**
- **Founder asked:** What about full composer support for multi-user teams?
- **Concept committed:** "equal participants (humans + agents)" — but thread-config only recognizes 2-person as "DM"; larger groups default to "attached"
- **Stress:** Composer today is plain-text input only (no team selection, no @group mention). If AM1 wants "equal participant" identity, Composer may need:
  - Sender-override UI (for team messages routed from founder → team agent)
  - @team mention / group call-out
  - Per-message recipient targeting
  - Currently, plain message always assumes `senderId = authenticatedUser`

**Point 3: Full Composer in AM1 Context**
- **Founder implied:** embedding & references should be part of the composed message
- **Concept answer:** Part model + Embed devices handle *display*; but the Composer's `onSubmit` callback currently only receives `{text, clientKey, refs?}` — ThreadShell wires it
- **Stress:** If AM1 wants in-composer embed affordances (e.g., "Insert artifact" button, "Mention @person" typeahead), Composer.tsx needs to:
  - Accept refs input / build refs array
  - May need modal/picker UI for artifact selection
  - May need typeahead for mentions
  - Currently unimplemented; Composer is plain text only

**Point 4: AM1 Concept Locks Thread Primitive Unchanged**
- **Concept hard rule 5:** "Thread / Message / verdict semantics are unchanged"
- **Risk:** If founder wants new message features (sub-threading, drafts, reactions, attachments), they require:
  - New Message fields (payload shape, schema columns)
  - Hard rule 5 violation → concept reshaping required → delays AM1
  - Example: Adding reactions would require Thread/Message schema change; current concept forbids it

**Point 5: Fold Device & UI-Local Fold State**
- **Concept committed:** Fold is never persisted; state is UI-local only
- **Stress:** If founder wants to *remember* which Parts are folded between sessions, concept needs updating. Today: every reload re-expands all Parts.

---

## 6. Summary: Have-vs-Need Map for AM1

### Have (Fully Implemented)

✓ Thread primitive (stable contract, 8 host kinds, 4 message types)  
✓ Message dispatch by type (review → card, plain → row, verdict → terminator)  
✓ Sender grouping (5-minute window collapses repeat headers)  
✓ Rich message card (unresolved review/questionnaire as promoted card)  
✓ Verdict workflow (5 binding decisions terminate via verdict message)  
✓ Reference rendering (BlockRefEmbed fetches + renders inline)  
✓ Markdown rendering (bold, code, lists, headings in plain messages)  
✓ @Mention rendering (inline highlighted spans, MentionToken)  
✓ Redaction (soft-redacted messages display reason)  
✓ Soft-delete (deletedAt field, UI omits deleted rows)  
✓ Participant avatars with operational status (presence dots: active/error/idle)  
✓ Thread pinning & blocking indicators  
✓ Artifact embed shapes (5 visual types: text_diff, content_preview, visual_comparison, action_summary, data_metrics)  
✓ Session dial-in (Q1: companion pane SessionActivityPanel)  

### Need (Concept Locked, Not Yet Implemented)

✗ **Part model primitive** — closed Part kinds + Embed/Fold devices; typed rendering unit  
✗ **Embed model formalization** — source-agnostic; unified artifact/block/diff/session-ref/entity-ref/mention  
✗ **Fold device** — collapse-to-summary UI with one-line labels ("Worked for 17s", "12 lines of reasoning")  
✗ **Session reference Embed** — discrete Embed kind pointing at Session without inlining activity  
✗ **Full AM1 rebranding** — ThreadShell → Part-rendering surface; message stream → calm reading column  

### Not Planned (Outside Concept Scope)

✗ Reactions (emoji, +1, etc.) — concept forbids; would require Message schema change  
✗ File attachments — concept forbids; would require schema change  
✗ Rich-text authoring UI (bold/italic buttons) — possible within concept but not locked  
✗ @Mention autocomplete — possible within concept but requires Composer enhancement  
✗ Message edit/delete/pin UI — possible but soft-delete exists, UI affordances missing  
✗ Read receipts per message — possible but not concept-locked  
✗ Typing indicator — possible but not concept-locked  
✗ Message search — possible but not concept-locked  
✗ Draft persistence — concept locks Fold state as UI-local; draft persistence conflicts  
✗ Sub-threading — explicitly rejected (hard rule 1 in concept Phase 2)  

---

## 7. References (File:Line)

### Primitive Definition
- `packages/shared/src/thread.ts:68–78` — Thread row
- `packages/shared/src/thread.ts:31–32, 225–241` — Message types (discriminated union)
- `packages/shared/src/thread.ts:96–134` — InlineRef types (EntityRef, BlockRef, MentionRef)
- `packages/shared/src/thread.ts:280–290` — classifyThreadConfiguration
- `docs/human-interface-layer/thread-primitive.md:1–29` — Thread primitive spec + Conversation/Part model

### Conversation UI
- `packages/design-system/src/ThreadShell.tsx:239–531` — Composition root + dispatch logic
- `packages/design-system/src/RichMessageCard.tsx:265–451` — Review/questionnaire card
- `packages/design-system/src/CommentRow.tsx:216–450+` — Per-message row rendering
- `packages/design-system/src/Composer.tsx:32–111` — Plain-message input
- `packages/design-system/src/ThreadHostBanner.tsx:1–100+` — Thread context chrome
- `packages/design-system/src/ThreadRow.tsx:91–200+` — List item in submenu

### Integration & Container
- `packages/web/src/pages/Conversations.tsx:24–200+` — Page routing + artifact/ref slot resolution
- `packages/web/src/components/BlockRefEmbed.tsx:32–97` — Block reference card
- `packages/web/src/components/SessionActivityPanel.tsx:1–80` — Session dial-in companion
- `docs/information-architecture/app-shell-always-present.md:1–44` — Shell frame
- `docs/information-architecture/conversations-view.md:1–113` — Conversations surface spec

### AM1 Concept (Locked)
- `plans/AM1/concept.md:1–147` — Full concept + Phase 0–6 (nouns, essence, rejection, vocabulary, contracts, rationale)
- `docs/human-interface-layer/part-model.md:1–49` — Part model ground truth (Conversation, Part, Embed, Fold, Session reference)

### Database Schema
- `packages/db/src/schema.ts` (messages table) — id, senderId, threadId, type, payload, clientKey, deletedAt, redactedAt, resolvedAt, createdAt, blockId

