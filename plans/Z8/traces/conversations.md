# Conversations Domain — Full Code Trace (Z8)

Traced 2026-06-10. Every interactive + display element under the Conversations view, end-to-end:
DOM → handler → hook → fetch → Hono route → service → Drizzle → DB table, plus event-bus and WS hops.

Files read in full: `pages/Conversations.tsx`, `components/ThreadSections.tsx`, `components/RecipientPicker.tsx`,
`components/SessionActivityPanel.tsx`, `components/BlockRefEmbed.tsx`, `components/ReasoningBlockView.tsx`,
`components/CocAttachButton.tsx`, `shell/CocOverlay.tsx`, `shell/AssistantOverlay.tsx`, `layouts/AppShell.tsx`,
hooks `useConversationsThreads`, `useThreadDetail`, `useCocThread`→`useAssistantThread`, `useSessionActivity`,
`useRecipients`, `useHostThread`, `useBlockResolution`, `useFetch`, `useHints`, services `api-fetch`, `ws-client`,
`host-route`, contexts `CocContext`→`AssistantContext`, design-system `ThreadShell`, `CommentRow`, `Composer`,
`RichMessageCard`, `ThreadRow`, `ThreadHostBanner`, server `routes/threads.ts`, `routes/threads-schema.ts`,
`routes/assistant.ts`, `routes/recipients.ts`, `routes/sessions-routes.ts`, `routes/conversations.ts` (legacy),
`services/direct-thread.ts`, `services/ws-broadcaster.ts`, `services/session-activity-buffer.ts`, `db/src/schema.ts`.

---

## Element Inventory

### Surface 1 — Conversations List (`/conversations`, State A) — `pages/Conversations.tsx:465-630`

| # | Element | Kind | File:Line | Handler / chain | API | DB |
|---|---|---|---|---|---|---|
| 1.1 | Page header title "Conversations" | display | Conversations.tsx:531 | static | — | — |
| 1.2 | FilterChip "Blocking" | interactive | Conversations.tsx:537-543 (def 53-80) | `onToggle` → `setToggleFilter` (page state) → ThreadSections controlled `toggleFilter` | none (client-side filter) | — |
| 1.3 | FilterChip "Unread" | interactive | Conversations.tsx:544-548 | same as 1.2 | none | — |
| 1.4 | "New thread" header button | interactive | Conversations.tsx:554-564 | `onNewThread` (OutletContext) → AppShell.tsx:590 `setShowRecipientPicker(true)` | none (opens picker) | — |
| 1.5 | EmptyState "No conversations yet" + "Start a thread" button | interactive | Conversations.tsx:566-601 | same `onNewThread` chain | none | — |
| 1.6 | ThreadSections flat list | display container | Conversations.tsx:603-619 → ThreadSections.tsx:231-327 | data via OutletContext ← AppShell.tsx:370 `useConversationsThreads(user?.id)` | `GET /api/threads?participant_id=<uid>&limit=50` | threads SELECT, messages SELECT |
| 1.7 | ThreadRow (per thread) | interactive | ThreadSections.tsx:308-323 → ThreadRow.tsx:91-257 | `onClick` → `onSelect(t.id)` → Conversations.tsx:507-512 `navigate(/conversations/<id>)` | none (navigation) | — |
| 1.8 | ThreadRow unread dot | display | ThreadRow.tsx:136-143 | `unread` prop — **never set by rowToItem** (always undefined → transparent spacer) | — | — |
| 1.9 | ThreadRow pinned glyph | display | ThreadRow.tsx:148-160 | `pinned` ← row `pinned` ← threads.pinned | list API | threads.pinned |
| 1.10 | ThreadRow host pill (mono 10px) | display | ThreadRow.tsx:167-180 | `hostTag` ← `hostKind` ← threads.host_kind | list API | threads.host_kind |
| 1.11 | ThreadRow "Blocking" badge | display | ThreadRow.tsx:199-207 | `blocking` ← `row.blocking ?? false` — **server never emits `blocking`** (only Playwright fixtures do) | list API | — (no DB column) |
| 1.12 | ThreadRow title | display | ThreadRow.tsx:161-166 | `useConversationsThreads.rowToItem` placeholder: `"${Capitalize(hostKind)} thread ${id.slice(0,8)}"` (useConversationsThreads.ts:113) | list API | derived |
| 1.13 | ThreadRow snippet | display | ThreadRow.tsx:186-193 | always `""` (placeholder, useConversationsThreads.ts:115) | — | — |
| 1.14 | ThreadRow timestamp | display | ThreadRow.tsx:250-252 | `formatRelative(lastActiveAt)` → "just now"/"5m"/"3h"/"2d" (useConversationsThreads.ts:87-98) | list API | threads.last_active_at |
| 1.15 | ThreadRow status chip / tag / avatars / messageCount | display | ThreadRow.tsx:181-183, 209-248 | props never supplied from Conversations path — dead slots on this surface | — | — |
| 1.16 | Loading skeleton | display | ThreadSections.tsx:242-247 | `loading` ← threadsStatus === "loading" | — | — |
| 1.17 | ErrorState "Couldn't load threads" + Retry | interactive | ThreadSections.tsx:232-240 | `onRetry` → `useConversationsThreads.retry()` → tick bump → re-fetch | `GET /api/threads?...` | threads/messages SELECT |
| 1.18 | EmptyState "No threads" (filter-empty, flat mode) | display | ThreadSections.tsx:295-302 | renders when toggle filters exclude all | — | — |

Note: the section-grouped path of ThreadSections (Blocking/Active/Resolved buckets, ThreadSections.tsx:330-465 incl. sticky danger header, "Quiet — nothing in flight.", "Clear filter" link) is **dead on this page** — Conversations always passes `groupBySection={false}` (Conversations.tsx:616). It remains reachable only from stories/tests.

### Surface 2 — Thread Detail (`/conversations/:threadId`, States B–E) — `ConversationsDetail`, Conversations.tsx:216-459

| # | Element | Kind | File:Line | Handler / chain | API | DB |
|---|---|---|---|---|---|---|
| 2.1 | Loading skeleton (State B) | display | Conversations.tsx:294-300 | `useThreadDetail` status "loading" | `GET /api/threads/:id` in flight | — |
| 2.2 | "Thread not found" EmptyState + "Back to inbox" link (State E) | interactive | Conversations.tsx:302-313 | 404 → status "not-found"; Link → `/conversations` | — | — |
| 2.3 | ErrorState "Failed to load thread" + Retry (State D) | interactive | Conversations.tsx:315-326 | `onRetry` → `useThreadDetail.retry()` tick bump | `GET /api/threads/:id` | threads, messages, users, sessions, bets/tasks/knowledge_items SELECT |
| 2.4 | Thread title (h2) | display | Conversations.tsx:395, 407-409 | `identities[thread.hostId]?.name ?? thread.hostId` | detail API `identities` | users.name (senders only) |
| 2.5 | Host context: Tag(hostKind) + Link(hostTitle) | interactive | Conversations.tsx:411-421 | `resolveHostRoute(hostKind, hostId)` (host-route.ts:18-37); link navigates to host page | detail API `hostTitle` | bets.description / tasks.title / knowledge_items.title (threads.ts:295-328) |
| 2.6 | "Dial in" button + pulsing live dot + sr-only "Live session" badge | interactive | Conversations.tsx:335-356 | `onClick` → `setDialInSessionId(activeSession.id)`; visible only when task-hosted + active session | precondition: `GET /api/sessions?task_id=<hostId>&state=active` (Conversations.tsx:150-161) | sessions SELECT (sessions-routes.ts:93-116) |
| 2.7 | Keyboard "D" dial-in toggle | interactive | Conversations.tsx:234-253 | document keydown, skips inputs, toggles `dialInSessionId` | — | — |
| 2.8 | Review-verdict hint card + "Got it" | interactive | Conversations.tsx:425-444 | `useHint("review-verdict")` (useHints.tsx:125); dismiss → optimistic + fire-and-forget POST | `GET /api/hint-progress`; `POST /api/hint-progress/review-verdict/dismiss` | hint_progress SELECT/INSERT (routes/hints.ts) |
| 2.9 | ThreadShell (message stream) | composite | Conversations.tsx:447-455 → ThreadShell.tsx:239-530 | props: thread/messages/identities from `useThreadDetail`, `hideHostBanner=true` | `GET /api/threads/:id` | see Chain B |
| 2.10 | Companion split (dialed-in): ThreadShell flex-3 + SessionActivityPanel flex-2 | composite | Conversations.tsx:359-387 | `dialInSessionId` state | see Chain E | — |

### Surface 3 — ThreadShell internals (design-system, used in detail + both overlays)

| # | Element | Kind | File:Line | Handler / chain | API | DB |
|---|---|---|---|---|---|---|
| 3.1 | ThreadHostBanner (Tag, host link, blocked chip, "Resolved" tag, pin icon, participant avatars +N overflow, presence dots) | display | ThreadHostBanner.tsx:90-151 | from `thread` props | — | — | (hidden in Conversations via `hideHostBanner`; visible in CocOverlay/AssistantOverlay) |
| 3.2 | EmptyState "No messages yet" | display | ThreadShell.tsx:408-412 | `ordered.length === 0` | — | — |
| 3.3 | CommentRow avatar (initial char, agent-tinted variant) | display | CommentRow.tsx:247-261 | `sender.isAgent` — **never passed by ThreadShell** (builds sender as {id,name,role} only, ThreadShell.tsx:433-437/472-477/509-513) | — | — |
| 3.4 | CommentRow sender name + "Agent" badge + time | display | CommentRow.tsx:264-276 | name/role from identities; time = `formatMessageTime(message.createdAt)` (locale "2:34 PM"); Agent badge dead (see 3.3) | detail API | messages.created_at, users.name |
| 3.5 | CommentRow plain body (markdown via derivePayloads→renderPayload; @mention tokens via segmentMentions) | display | CommentRow.tsx:111-168, 203-205 | `payload.text`, `payload.refs` (MentionRef) | detail API | messages.payload JSON |
| 3.6 | CommentRow verdict body (StatusChip + decision label + note) | display | CommentRow.tsx:191-202 | `verdictDecisionToStatus/Label(payload.decision)` | detail API | messages.payload |
| 3.7 | CommentRow redacted body ("Redacted by X — reason") | display | CommentRow.tsx:183-189 | `isRedactedPayload` | detail API | messages.payload |
| 3.8 | CommentRow rich-row variant (REVIEW/QUESTION tag, title, reasoning list, disabled questionnaire option buttons) | display + disabled buttons | ThreadShell.tsx:162-237 (buildRichSlots), CommentRow.tsx:282-289 | questionnaire options rendered `disabled` + title "Answer dispatch lands in a follow-up" (intentional) | — | — |
| 3.9 | RichMessageCard (promoted review/questionnaire) header: tag, sender, role, blocked StatusChip | display | RichMessageCard.tsx:479-496 | promotion via `promotedRichMessageId(ordered)` (ThreadShell.tsx:271-293) | — | — |
| 3.10 | RichMessageCard verdict toolbar: Approve / Approve with comments / Request changes / Edit / Reject | interactive | RichMessageCard.tsx:373-392 (specs 81-87) | `handleVerdict` → `onAction({kind:"verdict",decision,clientKey:randomUUID()})` → ThreadShell.handleCardAction (ThreadShell.tsx:353-376) → `dispatchVerdict` → page `onAppend` | `POST /api/threads/:id/messages` `{type:"verdict",payload:{decision,resolvesMessageId},clientKey}` | messages INSERT, messages UPDATE (resolvedAt), threads UPDATE (resolvedAt,lastActiveAt) — threads.ts:812-865 |
| 3.11 | RichMessageCard questionnaire option buttons | interactive (no-op) | RichMessageCard.tsx:394-416 | `handleAnswer` → onAction kind "answer" → ThreadShell **silently ignores** (ThreadShell.tsx:374-376) | none | — |
| 3.12 | RichMessageCard "Saving…" sticky footer | display | RichMessageCard.tsx:344-354 | `cardState.phase === "saving"` (ThreadShell local state) | — | — |
| 3.13 | RichMessageCard error footer + Retry | interactive | RichMessageCard.tsx:355-371 | `handleRetry` reuses stored clientKey → onAction "retry" → ThreadShell replays `lastVerdictInput` (ThreadShell.tsx:318-340, 368-373) | `POST /api/threads/:id/messages` (idempotent replay → 200) | messages SELECT (idempotency, threads.ts:726-756) |
| 3.14 | RichMessageCard reasoning disclosure ("N reasons" / "Hide reasoning") | interactive | RichMessageCard.tsx:421-455 | local `reasoningOpen` state | none | — |
| 3.15 | ResolvedView row (RESOLVED pill, decision label, title, actor, timestamp, "Re-expand" button) | interactive (no-op) | RichMessageCard.tsx:181-228 | `onReexpandToggle` flips ThreadShell `reExpanded` (ThreadShell.tsx:296, 425-427) — **no expanded content exists anywhere**; only aria-expanded flips | none | — |
| 3.16 | Artifact slot (ArtifactView) inside review card/row | display | Conversations.tsx:117-128 → ArtifactView | `resolveArtifactSlot` always renders `preview={null}` (documented L11 placeholder — no /api/artifacts/:id fetch) | none | — |
| 3.17 | BlockRefEmbed (loading shimmer / resolved card / "Source changed" degraded / error+Retry) | interactive | BlockRefEmbed.tsx:32-96 ← renderRefEmbeds (Conversations.tsx:89-104) | `useBlockResolution` (useBlockResolution.ts:106-186): module-cached host-body fetch + `deriveBlocks` client-side | `GET /api/bets/:hostId` (field `pitch`) or `GET /api/knowledge/:hostId` (field `body`) | bets / knowledge_items SELECT |
| 3.18 | Composer textarea | interactive | Composer.tsx:86-95 | onChange local state; Cmd/Ctrl+Enter → `handleSubmit` | — | — |
| 3.19 | Composer "Send" button | interactive | Composer.tsx:96-107 | `handleSubmit` → ThreadShell.handleComposerSubmit (ThreadShell.tsx:342-351) → page `onAppend` (Conversations.tsx:255-292) | `POST /api/threads/:id/messages` `{type:"plain",payload:{text},clientKey}` | messages INSERT, threads UPDATE lastActiveAt; @mention resolution may UPDATE threads.participants (threads.ts:783-865) |
| 3.20 | Composer inline error row | display | Composer.tsx:79-83 | catch of onSubmit → `classifyHttpError` text from page | — | — |
| 3.21 | Composer "Unresolved review · acting required ↑" link | dead | Composer.tsx:67-78 | `unresolvedReviewLink` prop — **never passed by ThreadShell** (removed in L11); unreachable | — | — |
| 3.22 | Async-ack toast "Response recorded — agent will pick it up…" | display | Conversations.tsx:207, 285-289 → ToastRegion | fires via `ToastContext.showToast` when commit was not head-resolving | — | — |

### Surface 4 — RecipientPicker (new thread; mounted by AppShell.tsx:564-576, replaces Outlet)

| # | Element | Kind | File:Line | Handler / chain | API | DB |
|---|---|---|---|---|---|---|
| 4.1 | Keyboard "N" opens picker (conversations view) | interactive | AppShell.tsx:412-434 | document keydown → `setShowRecipientPicker(true)`; Escape closes | — | — |
| 4.2 | SearchField | interactive | RecipientPicker.tsx:149-154 | `setQuery` → `useRecipients(query || undefined)` re-fetch per keystroke (no debounce) + redundant client-side `.filter` (RecipientPicker.tsx:137-139) | `GET /api/recipients[?q=<query>]` | users SELECT (LIKE on name), sessions SELECT (state='active') — recipients.ts:34-75 |
| 4.3 | Recipient option row (avatar initials, name, Live pill, role Tag, StatusChip) | interactive | RecipientPicker.tsx:170-205 | `handleSelectRecipient` → state "selected" | none | — |
| 4.4 | Live pill on recipient | display | RecipientPicker.tsx:189-197 | `hasActiveSession` ← server joins sessions.state='active' on agentId | recipients API | sessions.state |
| 4.5 | StatusChip per recipient | display | RecipientPicker.tsx:203 | `getStatusForRecipient(users.status)`: active→healthy, paused→paused, retired→blocked, else done | recipients API | users.status |
| 4.6 | "Loading..." / "No recipients found" | display | RecipientPicker.tsx:160-169 | `useRecipients` status | — | — |
| 4.7 | "Change" button | interactive | RecipientPicker.tsx:219-229 | resets to browsing, clears selected+message | none | — |
| 4.8 | Message textarea (Enter sends, Shift+Enter newline, Esc cancels) | interactive | RecipientPicker.tsx:231-239, 123-135 | `handleMessageKeyDown` → `handleSend` | see 4.10 | — |
| 4.9 | "Cancel" button | interactive | RecipientPicker.tsx:246-253 | `onCancel` → AppShell `setShowRecipientPicker(false)` | none | — |
| 4.10 | "Send"/"Sending..." button | interactive | RecipientPicker.tsx:254-261, 79-112 | `handleSend` → POST; on 201 → `onSelect({id: body.thread.id,…})` → AppShell.tsx:388-394 navigate `/conversations/<threadId>` | `POST /api/threads` `{hostKind:<"agent"|"user">, hostId, participants:[id], initialMessage:{type:"plain",payload:{text},clientKey:uuid}}` | threads INSERT + messages INSERT in one tx (threads.ts:609-640); emits `thread_created` + `thread_message_appended` |
| 4.11 | Send error line (role=alert) | display | RecipientPicker.tsx:240-244 | `sendError` on !ok or network throw | — | — |

### Surface 5 — SessionActivityPanel (dial-in companion) — `SessionActivityPanel.tsx`

| # | Element | Kind | File:Line | Handler / chain | API / WS | DB |
|---|---|---|---|---|---|---|
| 5.1 | Header: agent name, Live pill (pulse), "Ended" label, task subtitle | display | SessionActivityPanel.tsx:174-197 | `agentName` = identities[activeSession.agentId]?.name ?? id; `taskTitle` = **raw `thread.hostId`** (Conversations.tsx:381); Live = status streaming/connecting | — | — |
| 5.2 | Close (×) button | interactive | SessionActivityPanel.tsx:198-216 | `onClose` → `setDialInSessionId(null)` (Conversations.tsx:382) | — | — |
| 5.3 | Filter tabs All / Tools / Reasoning / Cost | interactive | SessionActivityPanel.tsx:220-235 | local `activeFilter`, `filterEntry` (110-116) | — | — |
| 5.4 | Activity rows: tool_call (icon, mono toolName, argsSummary, HH:MM:SS), reasoning (italic excerpt), cost_tick (tabular +Δ/total) | display | SessionActivityPanel.tsx:43-108 | `useSessionActivity(sessionId)`: REST snapshot then WS topic `session:<id>` | `GET /api/sessions/:id/activity` (last 50 of in-memory ring buffer, sessions-routes.ts:257-279); WS events `tool_call_recorded`, `session_ended` (ws-broadcaster.ts:105-113) | sessions SELECT; activity from `SessionActivityBuffer` (in-memory, NOT DB) |
| 5.5 | "Connecting..." / error text / "No activity yet" | display | SessionActivityPanel.tsx:243-259 | hook status | — | — |
| 5.6 | "↓ Scroll to latest" nudge | interactive | SessionActivityPanel.tsx:267-282 | shows when user scrolled >40px from bottom; click scrolls + resumes auto-scroll | — | — |
| 5.7 | Footer "Session complete — N events recorded" | display | SessionActivityPanel.tsx:286-290 | status "ended"; count = entries.length (client cap 200, server cap 50) | — | — |

### Surface 6 — CocOverlay (assistant overlay; mounted by AppShell.tsx:754-759/786-791)

| # | Element | Kind | File:Line | Handler / chain | API | DB |
|---|---|---|---|---|---|---|
| 6.1 | Overlay dialog (fixed bottom-16 right-4, 360px, z-30) | container | CocOverlay.tsx:244-300 | `cocOverlayOpen` (AppShell.tsx:211); Sidebar trigger `onCocClick` toggles; Escape closes (217-228); auto-opens on `?onboarding=true` (AppShell.tsx:259-271) | — | — |
| 6.2 | "Assistant" header + close (×) | interactive | CocOverlay.tsx:272-297 | `onClose` → `setCocOverlayOpen(false)` | — | — |
| 6.3 | Loading spinner / error + Retry | interactive | CocOverlay.tsx:141-160 | `useCocThread` (= `useAssistantThread`, useAssistantThread.ts:63-114) | `GET /api/threads/assistant` | threads SELECT or INSERT (resolve-or-create `thr-ast-<uid>`, assistant.ts:165-223); messages SELECT; users SELECT ×2 |
| 6.4 | Context chips (kind, label, × remove) | interactive | CocOverlay.tsx:66-91, 171-189 | `onRemoveContextRef(index)` → AppShell.tsx:226-228 filter state | none | — |
| 6.5 | ThreadShell (assistant thread) incl. ThreadHostBanner "System Agent", stream, Composer | composite | CocOverlay.tsx:190-197 | `handleAppendMessage` (102-139) attaches serialized contextRefs to plain payload, POSTs, throws on !ok; **never refreshes** | `POST /api/threads/thr-ast-<uid>/messages` | messages INSERT, threads UPDATE |
| 6.6 | CocAttachButton "+" (on BetCard / KnowledgeBody when overlay open) | interactive | CocAttachButton.tsx:32-54; used WorkBet.tsx:277,1012; KnowledgeBody.tsx:146 | reads CocContext; `attachContext(ref)` → AppShell.tsx:222-224 appends to `cocContextRefs` | none | — |

---

## Data Flow Chains

### Chain A — Thread list
1. AppShell.tsx:370 `useConversationsThreads(user?.id)` (single fetch; Conversations consumes via OutletContext, Conversations.tsx:490-495).
2. Hook (useConversationsThreads.ts:145-198): `apiFetch("/api/threads?participant_id=<uid>&limit=50")`. apiFetch injects `X-API-Key` (api-fetch.ts:63-79).
3. Route `GET /api/threads` — threads.ts:404-494. Validation: `listThreadsQuerySchema` (threads-schema.ts:199-209). IDOR guard: participant_id must equal authenticated userId (threads.ts:427-430, 403 otherwise).
4. Drizzle: `db.select().from(threads).where(sql LIKE participants probe)` + JS re-verify membership (threads.ts:450-465) — threads **SELECT**; then `db.select({threadId}).from(messages).where(inArray(threadId) AND type IN (review,questionnaire) AND resolvedAt IS NULL)` (threads.ts:472-481) — messages **SELECT** → `hasUnresolvedReview` per row.
5. Response `{threads: ThreadListRow[], nextCursor: null}`. Client guard `isThreadListRow` (useConversationsThreads.ts:67-85) silently drops invalid rows; `rowToItem` synthesizes title/snippet/relative timestamp.
6. WS: hook subscribes topic `"conversations"` (useConversationsThreads.ts:210-222) via ws-client singleton (token: `POST /api/auth/ws-token` → `ws(s)://…/api/ws?token=`). Server broadcasts `thread_created` to `"conversations"` (ws-broadcaster.ts:68-70). Handler bumps tick → full re-fetch.

### Chain B — Thread detail
1. Conversations.tsx:217 `useThreadDetail(threadId)` → `GET /api/threads/:id` (useThreadDetail.ts:132).
2. Route threads.ts:497-545. Optional `block_id` query (length validation 503-510, unused by this page). Drizzle: threads **SELECT** (513); messages **SELECT** desc by createdAt,id (524-528); `rowToMessage` Zod-parses each payload (`messageRowSchema`); `headCollapsePredicate`; `buildThreadIdentities` — users **SELECT** `inArray(senderIds)` + per-AI-sender sessions **SELECT** latest (threads.ts:131-173, N+1 per agent sender) → `operationalStatus`; `resolveHostTitle` — bets/tasks/knowledge_items **SELECT** (295-328).
3. Response `{thread, messages (desc), headMessageId, nextMessagesCursor:null, identities, hostTitle}`. Client decode `decodeThreadDetail` (useThreadDetail.ts:59-108) — trusts thread/messages shape (`as unknown as`).
4. No WS subscription to `thread:<id>` anywhere in web — detail refreshes only on send (`retry()`) or manual reload.

### Chain C — Send plain message / verdict (detail page)
1. Composer submit (Composer.tsx:37-49) or verdict button (RichMessageCard.tsx:326-330) → ThreadShell → `onAppendMessage` = `onAppend` (Conversations.tsx:255-292).
2. `POST /api/threads/:id/messages` body `{type, payload, clientKey}`. Validation: `messageInputSchema` (threads-schema.ts:137-158; clientKey 8-128 chars `[A-Za-z0-9_\-:.]`; plain text ≤16384).
3. Route threads.ts:685-927. Sender = `X-Identity` header ?? auth userId (threads.ts:70-78). Steps: threads **SELECT**; participants Zod parse (500 on malformed); participant authz 403; idempotency messages **SELECT** on (threadId,senderId,clientKey) → replay 200 or divergent 409; verdict authz: messages **SELECT** resolvesMessageId + users **SELECT** sender (must be role="founder", not self-verdict, else 403); @mention resolution (`resolveMentionsForMessage` → users **SELECT** participants, users **SELECT** by teamId).
4. Transaction (threads.ts:812-865): messages **INSERT**; mention participants → threads **UPDATE** participants; verdict → messages **UPDATE** `resolvedAt` WHERE resolvedAt IS NULL (`.returning()`, race → 409 `verdict_race`) + threads **UPDATE** resolvedAt,lastActiveAt; review/questionnaire on resolved thread → threads **UPDATE** resolvedAt=null (reopen); else threads **UPDATE** lastActiveAt.
5. Events: `thread_message_appended` (always), `thread_resolved` (verdict), `thread_reopened` (reopen) — broadcast to WS topic `thread:<id>` only (ws-broadcaster.ts:71-79). Response 201 `{message, thread}`.
6. Client: !ok → throw `classifyHttpError(status)` (≥500: "Server couldn't record this response. Try again?"); caught by Composer (inline error) or ThreadShell cardState (error footer + Retry). ok → `retry()` full refetch + async-ack toast unless head-resolving (resolvedAt flipped or type=verdict).

### Chain D — Create thread (RecipientPicker)
1. `GET /api/recipients?q=` (useRecipients.ts:55-93) → recipients.ts:34-75: users **SELECT** (optional `LOWER(name) LIKE`), sessions **SELECT** WHERE state='active' (full table) → `hasActiveSession`. Response `{recipients:[{id,kind,name,role,status,hasActiveSession,avatarUrl}]}`; client guard `isRecipient` drops invalid.
2. `POST /api/threads` (RecipientPicker.tsx:85-98) → threads.ts:548-682. Validation `createThreadBodySchema`. Sender resolution `readInitialSenderId` (users **SELECT** per participant for review/questionnaire; plain → auth userId). Verdict-as-initial → 400. Mention resolution on initial plain message. Transaction: threads **INSERT** + messages **INSERT**. Events: `thread_created` (→ WS "conversations" → list auto-refresh) + `thread_message_appended` (→ `thread:<id>`). Re-SELECT thread+message; 201 `{thread, messages:[…]}`.
3. Picker → `onSelect({id: thread.id,…})` → AppShell navigate `/conversations/<threadId>` → Chain B.
4. Note: always **creates a new thread** — does not reuse an existing DM thread (`findOrCreateDirectThread` in services/direct-thread.ts is only used by `POST /api/users/...` DM route at users.ts:374 and the agent `send-message` skill-tool, not by this UI path).

### Chain E — Dial-in / session activity
1. `useActiveSessionForTask(taskId)` (Conversations.tsx:163-198) → `GET /api/sessions?task_id=<hostId>&state=active` → sessions-routes.ts:93-116 sessions **SELECT** (no ORDER BY; first row taken). One-shot: no polling, no WS — staleness until remount.
2. Dial-in → SessionActivityPanel → `useSessionActivity(sessionId)` → `GET /api/sessions/:id/activity` → sessions-routes.ts:257-279: sessions **SELECT**; activity = in-memory `SessionActivityBuffer.getActivity()` tail-50 (session-activity-buffer.ts:108-111; buffer fed only by `tool_call_recorded` events, capacity 100/session, evicted 5min after session_ended).
3. If `session.state !== "done"` → status "streaming" + WS subscribe `session:<id>`; handler appends `tool_call_recorded` entries (client cap 200 FIFO) and flips to "ended" on `session_ended` (useSessionActivity.ts:139-150, 210-262). Server broadcasts both to `session:<sessionId>` (ws-broadcaster.ts:105-113); any authenticated identity may subscribe (createDbSubscribeAuthorizer, ws-broadcaster.ts:222-249).

### Chain F — Assistant overlay
1. Open → `useAssistantThread` → `GET /api/threads/assistant` (mounted before `/:id`, threads.ts:395) → assistant.ts:165-223: threads **SELECT** WHERE hostKind='user' AND hostId=userId; on miss threads **INSERT** id `thr-ast-<uid>`, participants `[uid, ast-<uid>]`; messages **SELECT** (no ORDER BY); `buildIdentities` users **SELECT** ×2. No event emitted on create.
2. Send → `POST /api/threads/thr-ast-<uid>/messages` (Chain C semantics) with contextRefs merged into `payload.refs` (block refs full triple; entity refs kind+id; labels stripped). Refs validated by `inlineRefSchema` (threads-schema.ts:70-74).
3. No refresh after POST and no WS subscription — see FLAG-2.
4. Block refs render via BlockRefEmbed → `useBlockResolution` → `GET /api/bets/:id` (`pitch`) or `GET /api/knowledge/:id` (`body`), module-level promise cache keyed `hostKind:hostId`, `deriveBlocks` client-side, find by blockId; missing block → "Source changed" degraded card.

### Chain G — Legacy `/api/conversations` (conversations.ts)
`GET /`, `GET /:threadId` (threads + items + empty `responses:[]`), `POST /items` (items **INSERT**, `item_created` event → WS "conversations" topic, where the list hook ignores it). **No web code calls these endpoints** — server-side legacy wire-compat only.

---

## Display Element Sources

| Display element | API field | DB column | Transformation |
|---|---|---|---|
| List row title | — (none) | threads.host_kind, threads.id | client placeholder `"Task thread 1a2b3c4d"` (useConversationsThreads.ts:113) |
| List row snippet | — | — | always `""` |
| List row timestamp | `lastActiveAt` | threads.last_active_at | `formatRelative`: <1m "just now", `Nm`, `Nh`, `Nd` |
| List row host pill | `hostKind` | threads.host_kind | verbatim |
| List row pinned glyph | `pinned` | threads.pinned | boolean |
| List row unread dot / count badge / avatars / status chip | — | — | never populated on this surface |
| Blocking badge | optional `blocking` wire field | none | server never emits; `?? false` |
| Sidebar "blocking" count badge | derived | messages (unresolved review/questionnaire) | AppShell.tsx:450-453 counts `hasUnresolvedReview` (misnamed "blocking") |
| Detail h2 title | `identities[hostId].name` | users.name | fallback raw hostId |
| Host context link text | `hostTitle` | bets.description (deriveTitle) / tasks.title / knowledge_items.title | server-side per-kind switch |
| Message time | `createdAt` | messages.created_at | `toLocaleTimeString {hour:"numeric",minute:"2-digit"}`; only on first row of a 5-min sender group (`computeSenderGrouping`, ThreadShell.tsx:126-145) |
| Avatar initial | identities name | users.name | `charAt(0).toUpperCase()` |
| Agent badge / green avatar | identities `isAgent` | users.kind='ai' | decoded by useThreadDetail but dropped by ThreadShell — never rendered |
| Presence dot (operationalStatus) | identities `operationalStatus` | sessions.state / sessions.outcome (latest per agent) | active→green, crashed→red, else none; only renders in ThreadHostBanner/ThreadRow `avatars` — neither populated in Conversations |
| Verdict chip + label | `payload.decision` | messages.payload JSON | `verdictDecisionToStatus/Label` |
| RESOLVED row actor/timestamp | verdict senderId → identities; `resolvedAt` | messages.resolved_at | raw ISO string rendered (not formatted) — RichMessageCard.tsx:214-216 |
| Mention token | `payload.refs[kind=mention].displayName` | messages.payload | `segmentMentions` over sourceText spans |
| Recipient Live pill | `hasActiveSession` | sessions.state='active' join | set membership |
| Recipient StatusChip | `status` | users.status | active→healthy / paused→paused / retired→blocked / else done |
| Recipient avatar | name | users.name | `slice(0,2)` uppercase (avatarUrl fetched but unused in picker rows) |
| Activity tool row | buffer entry | in-memory (EventBus `tool_call_recorded`) | toolName mono + argsSummary + HH:MM:SS local |
| Cost tick row | deltaMinor/totalMinor | in-memory | `/100 .toFixed(4)` and `.toFixed(2)`; currency field ignored |
| "Session complete — N events" | entries | in-memory | client-side length |
| Hint copy | HINT_CATALOG (shared constant) + `/api/hint-progress` dismissals | hint_progress | visible = ready && !failed && !dismissed |
| Context chip | AssistantContextRef.label | n/a (client-only) | label never serialized |

---

## FLAGS

Severity: **P1** broken behavior visible to users · **P2** wrong/stale/dead behavior, security gap · **P3** polish/dead code/doc drift.

1. **P1 — Flat thread list sort is broken (orders by UUID, not recency).** ThreadSections.tsx:258-264 sorts by `Date.parse(t.timestamp)`, but `timestamp` is the relative string from `formatRelative` ("just now", "5m", "3h", "2d") → always NaN → falls through to `a.id.localeCompare(b.id)`. The list renders in thread-UUID order, scrambling the server's lastActiveAt-desc order. Fix: keep ISO `lastActiveAt` on ThreadItem (or sort upstream).

2. **P1 — Assistant overlay messages vanish after send.** CocOverlay.tsx:102-139 (and AssistantOverlay.tsx:180-212) POST the message but never call `refresh()`/`retry()` on the hook, and there is no WS subscription and no optimistic UI in ThreadShell. The composer clears and nothing appears until the overlay is closed/reopened (remount refetch). Assistant replies also never appear live.

3. **P1 — "Unread" filter chip can never match anything.** `rowToItem` (useConversationsThreads.ts:104-123) never sets `unread`; toggling Unread (Conversations.tsx:544) filters on `t.unread === true` → always the "No threads" empty state. Same for "Blocking": the server never emits `blocking` (documented as fixture-only, useConversationsThreads.ts:29-37), so the Blocking chip always yields empty in production. Two of the page's three header controls are inert.

4. **P2 — Wrong overlay mounted; AD8b rename half-landed; lore comment is false.** AppShell.tsx:28/754/786 mounts `CocOverlay` — a full, stale duplicate of `AssistantOverlay`. AssistantOverlay.tsx:368 claims "CocOverlay.tsx re-exports from this module" but CocOverlay.tsx is an independent implementation lacking `renderMessageExtra={renderToolCallSummaries}` — so assistant tool-call summary rows (AD8b B3.1, validated by `plainPayloadSchemaWithToolCalls`) are **never rendered in production**. `AssistantOverlay` + `AssistantAttachButton` are dead code; only `CocAttachButton` is used (WorkBet.tsx, KnowledgeBody.tsx). Also CocOverlay shows hostTitle "System Agent" vs AssistantOverlay's "Assistant".

5. **P2 — No live updates in an open thread.** Nothing in the web package subscribes to WS topic `thread:<id>` (server broadcasts `thread_message_appended`/`thread_resolved`/`thread_reopened` there, ws-broadcaster.ts:71-79). An open conversation only updates when *you* send (full `retry()` refetch). Likewise the thread *list* only refreshes on `thread_created` — message activity/resolution never updates list ordering, `hasUnresolvedReview`, or the Resolved bucket.

6. **P2 — IDOR on thread detail.** `GET /api/threads/:id` (threads.ts:497-545) has **no participant check** — any authenticated identity can read any thread's full messages. The list endpoint (threads.ts:427-430, AD1) and the WS `thread:<id>` topic (ws-broadcaster.ts:169-181) both enforce participant membership; the detail endpoint is the gap.

7. **P2 — Every send blanks the thread to a skeleton.** `onAppend` success → `retry()` (Conversations.tsx:283) → useThreadDetail sets status "loading" and `setData(null)` (useThreadDetail.ts:126-128) → ConversationsDetail renders SkeletonList. Each message/verdict causes a full-screen flash and scroll-position loss.

8. **P2 — RecipientPicker always creates a duplicate DM thread.** `POST /api/threads` unconditionally INSERTs (threads.ts:609-640); the dedupe helper `findOrCreateDirectThread` exists (direct-thread.ts) but only the `/api/users` DM route and agent skill-tool use it. Messaging the same agent twice via "New thread" produces two threads with identical host/participants.

9. **P2 — RecipientPicker has no error state.** When `useRecipients` returns status "error", the listbox renders nothing at all (RecipientPicker.tsx:160-205 only handles "loading" and "ready") — silent blank panel; `retry` from the hook is never wired. Also: a fetch fires per keystroke with no debounce, and an extra redundant client-side name filter runs over already-server-filtered results.

10. **P2 — Promoted questionnaire answer buttons are enabled but do nothing.** RichMessageCard renders active option buttons (RichMessageCard.tsx:394-416) and ThreadShell's `handleCardAction` deliberately ignores `kind:"answer"` (ThreadShell.tsx:374-376). The non-promoted CommentRow variant honestly disables its options (ThreadShell.tsx:219-233) — inconsistent: the *promoted* card dead-clicks.

11. **P2 — "Re-expand" on resolved review card is a visual no-op.** ResolvedView's button toggles `reExpanded`/aria-expanded (RichMessageCard.tsx:217-224, ThreadShell.tsx:425-427) but no code anywhere renders expanded content for `reExpanded === true`.

12. **P2 — Reasoning and Cost filter tabs can never show data.** `SessionActivityBuffer` only ever stores `tool_call` entries (session-activity-buffer.ts:46-64); nothing emits reasoning/cost_tick entries, and the WS handler only parses `tool_call_recorded`. Two of four tabs (SessionActivityPanel.tsx:160-165) are permanently empty. The `summary` value returned by useSessionActivity is also never consumed.

13. **P2 — Stale dial-in/session state.** (a) `useActiveSessionForTask` fetches once per taskId — a session starting/ending while viewing doesn't update the button/badge. (b) `dialInSessionId` survives navigation to a different thread (same ConversationsDetail instance) — you can be "dialed in" to the previous thread's session while viewing a new thread. (c) Sessions list has no ORDER BY (sessions-routes.ts:105-115); "first active session" is arbitrary when multiple are active.

14. **P2 — `isAgent`/`operationalStatus` fetched and decoded but never rendered.** Server computes them with an N+1 sessions query per AI sender (threads.ts:147-169); useThreadDetail decodes them (useThreadDetail.ts:73-89); ThreadShell builds senders as `{id,name,role}` only (ThreadShell.tsx:433-437, 472-477, 509-513) so CommentRow's Agent badge + green agent avatar (CommentRow.tsx:244-271) and presence dots are dead on this surface. Wasted queries + dead UI.

15. **P3 — AppShell's All/Blocking/Async filter context is dead on this page.** Conversations reads `conversationsFilter`/`onClearFilter` from OutletContext and passes them to ThreadSections (Conversations.tsx:614-615), but the flat-list branch ignores `activeFilter`/`onClearFilter` entirely (ThreadSections.tsx:231-327 — `predicateFor` only used in the dead grouped branch). `_onFilterChange` (Conversations.tsx:478) is underscore-dead; nothing ever calls `onFilterChange`.

16. **P3 — Thread header shows a raw UUID for non-person hosts.** `threadTitle = identities[hostId]?.name ?? hostId` (Conversations.tsx:395): identities are keyed by *message sender* ids, so for task/bet-hosted threads (and fresh DM threads where the recipient hasn't replied) the h2 is the opaque hostId. `hostTitle` exists and is only used in the small context link. Similarly the dial-in panel gets `taskTitle={data.thread.hostId}` (Conversations.tsx:381) — raw task id in the subtitle — and `agentName` falls back to raw agentId if the agent hasn't posted.

17. **P3 — Keyboard shortcuts swallow modifier combos.** Detail "D" handler (Conversations.tsx:244-247) and AppShell "N" handler (AppShell.tsx:422-425) don't check `metaKey/ctrlKey/altKey` — Cmd+D (bookmark) and Cmd+N (new window) are preventDefault'd and hijacked while in those views.

18. **P3 — `sanitizeHtml` never passed → doc drift.** CommentRow/ThreadShell lore (CommentRow.tsx:58-64) claims "web consumer (Conversations.tsx) passes DOMPurify here"; no ThreadShell consumer passes `sanitizeHtml`, so raw-HTML blocks degrade to UnknownPayload everywhere (safe, but the documented feature is unwired).

19. **P3 — Dead props/fields.** `ThreadDetail.artifactRef` never populated by decoder (useThreadDetail.ts:29); `headMessageId` decoded but unused by the page; Composer `unresolvedReviewLink` never passed (Composer.tsx:67-78); ThreadRow `avatarUrl` deprecated-but-still-passed by ThreadSections (ThreadSections.tsx:311 — ThreadRow ignores it); ThreadItem `status`/`tag`/`unread` never set by the hook; `useActiveSessionForTask.loading` returned but never consumed (and stays `true` forever if taskId flips to null mid-fetch); CocOverlay/CocAttachButton use a prop literally named `ref` (works only because React 19 forwards ref-as-prop; `{kind,id,label}` is not a ref — fragile and confusing).

20. **P3 — Context refs are re-sent on every assistant message.** CocOverlay merges the full current `contextRefs` into each plain payload (CocOverlay.tsx:106-122) and never clears chips after a successful send — every subsequent message re-attaches the same refs until manually removed.

21. **P3 — Assistant thread create race / ordering.** Two concurrent first `GET /api/threads/assistant` calls both miss and both INSERT `thr-ast-<uid>` → second throws → unhandled 500 (assistant.ts:170-205). Messages SELECT has no ORDER BY (assistant.ts:177-180) — client sorts, so benign today.

22. **P3 — ws-client global-topic matching is promiscuous.** `messageMatchesTopic` returns true for *all* frames for global topics (ws-client.ts:186-205), relying on every handler to filter by `msg.type`. Server `item_created`/`knowledge_updated` also broadcast to "conversations" (ws-broadcaster.ts:41-47) and are silently ignored by the list handler. Safe now; a foot-gun for the next subscriber.

23. **P3 — Misnamed sidebar count.** `conversationsBlockingCount` (AppShell.tsx:450-453) counts `hasUnresolvedReview`, not blocking. The Sidebar badge semantics differ from the "Blocking" filter chip semantics (which keys off the never-set `blocking` flag) — three different notions of "blocking" coexist.

24. **P3 — Send-interaction inconsistency.** Detail Composer requires Cmd/Ctrl+Enter (Composer.tsx:51-59); RecipientPicker sends on bare Enter (RecipientPicker.tsx:129-132). Cost rows drop the `currency` field. ResolvedView renders raw ISO `resolvedAt` unformatted (RichMessageCard.tsx:214-216).

25. **P3 — Idempotency check is read-then-write.** threads.ts:726-756 checks for an existing clientKey before the transaction; a concurrent duplicate POST passes the check and the unique index (`messages_idempotency_uq`) makes the INSERT throw → 500 `internal_error` instead of the intended 200 replay.
