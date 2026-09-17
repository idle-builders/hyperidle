# BC3 — thread module fact sheet (read-only survey, branch feature/task-action-list)

All paths repo-relative to the worktree root. Line refs are `file:line`.

## 1. Routes whose subject is a thread / message / item / review / assistant

Mounts: `layers/core-api/src/app.ts:405` (`/reviews`), `:414` (`/conversations`), `:417` (`/threads`), `:428` (`/recipients`), `:444` (`/search`). Actions router: `app.ts:393`.

| Route | File:line | Size | Validates | Writes | Emits | WS push | Cross-layer |
|---|---|---|---|---|---|---|---|
| `GET /threads` | `routes/threads.ts:735-818` | 84 | `listThreadsQuerySchema` (`threads-schema.ts:298`); 400 if neither `host_kind` nor `participant_id`; 403 if `participant_id !== c.get("userId")` (`:758`) | — | — | no | — |
| `GET /threads/:id` | `threads.ts:822-889` | 68 | `block_id` non-empty ≤128 (`:827-835`); `authorizeRead` on loaded participants (`:857`) | — | — | no | — |
| `POST /threads` | `threads.ts:893-1247` | 355 | `createThreadBodySchema` (`threads-schema.ts:277`); initial msg may not be `verdict` (`:957`) | `threads`, `messages` in one tx (`:1099-1128`) | `thread_created` (`:1209`), `thread_message_appended` (`:1219`) | `conversations` + `thread:<id>` (`:1230`,`:1236`) | — |
| `POST /threads/direct` | `threads.ts:681-698` | 18 | `directThreadBodySchema`; sender = `c.get("userId")` | `threads` via `findOrCreateDirectThread` | **none** | no | — |
| `POST /threads/:id/messages` | `threads.ts:1255-1608` | **354** | see step list below | `messages`, `threads` | `thread_message_appended`, `thread_resolved`, `thread_reopened` | 4 sites | `agentWorkIntentRecorder`, `reviewVerdictRecorder` |
| `PATCH /threads/:id` | `threads.ts:705-731` | 27 | `updateThreadBodySchema` (participants/lastActiveAt/pinned only) | `threads` | **none** | **no** | — |
| `GET /threads/assistant` | `routes/assistant.ts:176-231` | 56 | none; scope from `c.get("userId")` | **creates a `threads` row on a GET** (`:203`) | **none** | no | — |
| `GET /conversations/items/:id` | `routes/conversations.ts:69-80` | 12 | none | — | — | no | — |
| `PATCH /conversations/items/:id` | `conversations.ts:86-109` | 24 | `updateItemSchema` (riskTier/kind/verb) | `items` | **none** | no | — |
| `POST /conversations/items` | `conversations.ts:114-161` | 48 | `createItemSchema`; thread must exist (`:120`) | `items` | `item_created` (`:158`) | no | — |
| `GET /reviews/:reviewMessageId` | `routes/reviews.ts:47-139` | 93 | none — **no authz at all** | — | — | no | — |
| `GET /recipients` | `routes/recipients.ts:39-67` | 29 | none | — | — | no | — |
| `GET /search` (threads arm) | `routes/search.ts:146-190+` | — | participant LIKE probe + JS membership verify | — | — | no | — |
| `GET /ws` | `routes/ws.ts:71-146` | 76 | one-shot upgrade token; `subscribe` authorized per `thread:<id>` topic by hub | — | — | transport | — |

### The ~350-line message-post handler, step by step (`threads.ts:1255-1608`)
1. `:1259-1271` parse body, `messageInputSchema`.
2. `:1276` senderId = `c.get("userId")` only (never `X-Identity` — AF11 IDOR fix).
3. `:1278-1291` load thread; Zod-parse `participants` JSON, 500 on malformed.
4. `:1295-1300` `authorizeWrite` (participant scope for user/agent hosts, any principal for task/knowledge hosts).
5. `:1303-1323` idempotency on `(threadId, senderId, clientKey)`; divergent payload ⇒ 409.
6. `:1327-1340` verdict authz: resolves-message must be in this thread; sender role must be `"founder"`; no self-verdict.
7. `:1348-1364` @mention resolution → enriched `refs` + new participant ids; `sanitizeNoticeForSender` strips a spoofed `notice`.
8. `:1366-1371` compute `wasResolved` / `willReopen` / `recordsAssistantIntent`.
9. `:1379-1426` transaction: `insertMessage`; atomic participant add; verdict → `resolveMessageIfUnresolved` (first-verdict-wins, else `VerdictRaceConflict` 409) + thread `resolvedAt`; else reopen or bump `lastActiveAt`.
10. `:1452-1471` **post-commit** cross-layer: `resolveAssistantTurnRequest` bake + `agentWorkIntentRecorder({kind:"assistant_turn"})`. Deliberately outside the tx (deadlock, `:1438-1451`).
11. `:1473-1482` emit `thread_message_appended`.
12. `:1496-1525` **post-commit** `reviewVerdictRecorder` (resume the agent that filed the review); 5 verdict decisions collapse to approve/decline.
13. `:1530-1542` if not resumable, insert a second plain message into the thread telling the human.
14. `:1544-1563` emit `thread_resolved` / `thread_reopened`.
15. `:1565-1599` re-read thread+message; 4 `pushUpdate` calls (`thread:<id>` message, `conversations` list row, resolved, reopened).
16. `:1600-1606` respond 201 `{message, thread}`.

Supporting helpers in the same file: `buildThreadListRowForPush` `:124-146`, `buildSenderIdentityForPush` `:154-160`, `readInitialSenderId` `:187-206`, `buildThreadIdentities` `:229-248`, `buildMentionLookup` `:261-302`, `resolveMentionsForMessage` `:313-352`, `resolveHostTitle` `:361-378`, `resolveThreadTitles` (5-rung ladder) `:426-559`, `rowToThread` `:567-580`, `rowToMessage` `:582-617`, `sanitizeNoticeForSender` `:629-634`.

## 2. Data model

| Table | Def | Columns | Notes |
|---|---|---|---|
| `threads` | `framework/db/src/schema.ts:734-769` | id, hostKind, hostId, initiatorId, participants (JSON text), pinned, resolvedAt, lastActiveAt, createdAt, directKey | No title column — title is *computed* per viewer (`threads.ts:426`). `participants` is a JSON string, queried by LIKE probe. `directKey` partial-unique. |
| `messages` | `schema.ts:771-798` | id, senderId→users, threadId→threads, type, payload (JSON text), clientKey, deletedAt, redactedAt, resolvedAt, createdAt, **legacyItemId**, blockId | 4 types: `plain·review·questionnaire·verdict` (`threads-schema.ts:219-241`). Unique `(threadId,senderId,clientKey)`. |
| `items` | `schema.ts:802-824` | id, sourceAgentId→users, verb, kind, title, body, attachments, proposedAction, options, riskTier, blocking, reasoning, auditTrail, **threadId NOT NULL**→threads, createdAt | Kind is free text (`text("kind")`, no check). Observed kinds: `review`, `escalation`, `skill_change` (`policy-engine.ts:105`, `tool-definitions.ts:279`). |
| `changes` | `schema.ts:567-586` | id, object, objectId, kind, actor→users, before, after, at | `object` check already allows `'thread'`; `kind` check is `created|changed` only — **no `message` kind**. |

- **Message parts**: there is no parts table. "Parts" is UI-only rendering of `payload` (`layers/core-ui/src/components/PartList.tsx`, `components/parts/part.ts`).
- **Reviews are messages**, not rows: `type:"review"` message + `type:"verdict"` message resolving it (`reviews.ts:47-139` composes the review page from the message + its thread's task).
- **Recipients/participants**: only the `threads.participants` JSON array. `GET /recipients` is just a users list (`recipients.ts:47`).
- **Attachments**: no column on threads/messages. `items.attachments` is an opaque text field nothing reads. Review evidence rides the payload (`artifacts[]`, `producedItemId`, `threads-schema.ts:190-198,242-247`).
- **Who writes items**: `POST /conversations/items` only (`conversations.ts:130`), reached by the `create_item` tool via the seam (`core-api-port-composition.ts:403`) and by `routine-scheduler-bindings.ts:71`. **Who reads items**: `policy-engine.ts:57`, `notifications/install.ts:301`, `routine-scheduler.ts:483`, `policy-bindings.ts:20`, `reviews`-unrelated. **No UI surface reads items at all** (no `/api/conversations/items` fetch under `core-ui`).
- **Folding `items` into messages as a kind** would need per column: `title`,`body` → payload; `verb`,`kind`,`riskTier`,`blocking`,`reasoning`,`proposedAction`,`options`,`attachments` → payload fields; `sourceAgentId` → `messages.senderId` (note: items allow NULL source agent, messages do not — `schema.ts:775` NOT NULL); `auditTrail` → gone (only `policy_queued` marker, `policy-engine.ts:187`, and `task-service.ts:479` queries it via LIKE); `threadId` already NOT NULL on both; `createdAt` direct. New message type `item` must be added to `MESSAGE_TYPES` and both Zod unions (`threads-schema.ts:219,246`), and to `messageRowSchema`'s redaction union.

## 3. Tools that post or read threads

| Tool | File:line | Beyond a plain post |
|---|---|---|
| `send_message` | `tool-definitions.ts:52-85` | `to` recipient must exist; `findOrCreateDirectThread` then post; concatenates `subject\n\n body`. Routes over the HTTP seam, not DI. |
| `reply` | `tool-definitions.ts:118-160` | **No thread argument** — always `ctx.threadId` (baked at emit). Fallback: direct thread with the sole human (`:144`); error `NO_REPLY_RECIPIENT` if none. This is the reply-to-caller rule. |
| `create_item` | `tool-definitions.ts:286-36x` | Creates a thread when none given (host = the session's task, `:307`); when the item is a review/escalation (`isReviewItem` `:278`) it resolves review recipients and **mutates the thread's participants** (`:330`); then `POST /conversations/items`. |
| `submit_review` | `tool-definitions.ts:465-560` | Verifies `producedItemId` is parented to the calling task (`:487-500`); resolves-or-creates the task thread seeded with review recipients (`:450-463`); posts a `review` message; `ports.gate.linkReviewToSession(ctx.sessionId, messageId)` (`:543`) — the row a verdict later reads to resume the session; bumps `lastActiveAt`; walks the parent chain to return `rootTaskId`. |
| `create_conflict_review` | `tool-definitions.ts:644` | **Does not touch threads** — writes a `knowledge_conflicts` row. |
| `return_status` | plumbing twin of `POST /mcp/:token/return-status` | — |

Return gate: `RETURN_ACTION_NAMES = ["submit_review","edit_task","send_message","reply"]` (`framework/harness-protocol/src/harness/return-actions.ts:47`); `isReturnAction` `:105-121` — three are unconditionally terminal, `edit_task` is argument-gated. `provisioner.ts:1566` forces `required = ["reply"]` for a session with a calling thread and no task. MCP name stripping `:77-82`.

## 4. UI surfaces

| Surface | File | Lines | Reaches |
|---|---|---|---|
| `useThreadDetail` | `core-ui/src/hooks/useThreadDetail.ts` | 248 | `GET /api/threads/:id` (`:187`); WS `thread:<id>` (`:234-244`), handles `thread_message_appended` / `thread_resolved` / `thread_reopened` (`:132-146`) |
| `useAssistantThread` | `hooks/useAssistantThread.ts` | 191 | `GET /api/threads/assistant` (`:124`); WS `thread:<id>` (`:168-180`) |
| `useConversationsThreads` | `hooks/useConversationsThreads.ts` | 270 | `GET /api/threads?participant_id=…&limit=50` (`:183`); WS `conversations` (`:239-265`) |
| `useHostThread` | `hooks/useHostThread.ts` | 108 | `GET /api/threads?host_kind&host_id` then `GET /api/threads/:id` (`:72`,`:90`) — **no WS** |
| `useRecipients` | `hooks/useRecipients.ts` | 119 | `GET /api/recipients` (`:74`) + orchestration active-counts |
| `host-threads.ts` (service) | `services/host-threads.ts` | 151 | `GET/POST /api/threads` (`:35`,`:52`), `POST /threads/:id/messages` plain (`:98`) and verdict (`:138`) |
| `ws-client.ts` | `services/ws-client.ts` | 281 | topic subscribe/unsubscribe; `messageMatchesTopic` (`:203-`) |
| `Conversations.tsx` | `pages/Conversations.tsx` | 750 | `useThreadDetail` (`:296`), direct `POST /threads/:id/messages` (`:351`) |
| `AssistantOverlay.tsx` | `shell/AssistantOverlay.tsx` | 544 | `useAssistantThread` (`:260`), direct `POST /threads/:id/messages` (`:285`) |
| `HostThreadSection.tsx` | `shell/HostThreadSection.tsx` | 330 | `useHostThread` (`:145`), `resolveOrCreateHostThread` + `postPlainHostMessage` (`:181`,`:187`) |
| `ReviewPage.tsx` | `pages/review/ReviewPage.tsx` | 240 | `GET /api/reviews/:id` (`:32`), `useThreadDetail` (`:119`), `postPlainHostMessage` (`:151`), `postVerdictHostMessage` (`:184`) |
| `RecipientPicker.tsx` | `components/RecipientPicker.tsx` | — | `POST /api/threads` to start a thread (`:85`) |
| `KnowledgeDetail.tsx` | `pages/KnowledgeDetail.tsx` | — | `useHostThread("knowledge_item", id)` (`:699`) |
| `AppShell.tsx` | `layouts/AppShell.tsx` | — | single `useConversationsThreads(user?.id)` (`:493`) — sidebar badge |
| `ConversationSurface.tsx` / `ThreadSections.tsx` / `PartList.tsx` | components | 277 / 419 / — | render only |

## 5. Background writers and reactions

| Registrant | File:line | Trigger | Effect |
|---|---|---|---|
| `registerPolicyEngine` | `core-api/policy/src/policy-engine.ts:26-48` (206 lines; registered `service-bootstrap.ts:374` via `register-policy.ts:19`) | `item_created` | loads item, computes agent approval rate, then `push` (emits `notification`) / `queue` (appends `auditTrail` marker) / `auto_resolve` (**writes a `verdict` message as senderId `"policy_engine"`**, resolves the review, resolves the thread — `:139-177`). Errors silently swallowed (`:34-42`). |
| `registerAssistantThreadPinReaction` | `src/services/assistant-thread-pin-reaction.ts:50` (64 lines; bootstrap `:334`) | `thread_message_appended` | pins the assistant thread on the first AI plain reply |
| `registerAssistantTurnCoherenceTrigger` | `src/services/assistant-turn-coherence-trigger.ts:112` (127 lines; bootstrap `:347`) | `thread_message_appended` | re-bakes pending sibling assistant-turn intents on the same thread |
| `registerSessionNotReturnedNotice` | `conversation/src/session-not-returned-notice.ts:72` (86 lines; bootstrap `:361`) | `session_not_returned` | posts `"I couldn't finish that turn…"` into `event.callingThreadId` as the agent |
| notifications listener | `core-api/notifications/src/install.ts:294-313` | `notification` | reads the item, classifies (`:244`), source link `/conversations/<threadId>` (`:256`) |
| routine scheduler | `core-api/routine/src/routine-scheduler.ts:460-521` | thread + item events | builds routine subjects of kind `thread` / `item` |

Session → thread bridge: `resolveOrCreateCallingThread` (`src/services/calling-thread-bindings.ts:74`, 80 lines) resolves the `(task, taskId)` thread or creates one seeded `[soleHuman, agentId]` (`:55-56`); baked into the work intent at `task-run-resolver.ts:238,301`; carried on `payloadJson` (`run-orchestration/src/runtime.ts:198,507`) into `provisioner.ts:1465` as `ctx.threadId`. The caller identity for an agent post is **the agent's own user id** (`ctx.agentId`) passed as the seam actor (`tool-handlers-bindings.ts:146-150`), which becomes `c.get("userId")` server-side. Assistant path: human plain message on an `ast-*` thread → `recordsAssistantIntent` (`threads.ts:1368`) → `resolveAssistantTurnRequest` (`conversation/src/assistant-turn-resolver.ts:122`, `callingThreadId` `:160`) → intent drain → agent replies with `reply`.

## 6. The two hand-pushed WS sites

`pushUpdate` (`threads.ts:98-105`) is the only pusher; its two **topics** are `conversations` and `thread:<id>`, used at six call sites: `:936`, `:1057`, `:1181`, `:1230`, `:1236`, `:1574`, `:1584`, `:1591`, `:1596`. Envelope: `{type:"update", topic, kind, data}` where `kind` is the legacy `EventType`. Hub: `src/ws-connection-hub.ts` (143 lines), `subscribe` is async and checks `threads.participants` for `thread:<id>` (`:91-115`). Client subscribes via `ws-client.ts:54` with `{type:"subscribe", topic}` (`:89`) and re-subscribes on reconnect (`:147-153`); `messageMatchesTopic` (`:203`) routes by the payload, since the server does not echo the topic on every frame.

A "stream from `changes` rows" would replace: `pushUpdate` + all nine call sites, `buildThreadListRowForPush` (the viewer-relative title bug, `:113-123`), `buildSenderIdentityForPush`, the per-hook topic wiring in `useThreadDetail:234`, `useAssistantThread:168`, `useConversationsThreads:239`, and the hub's thread-participant authorizer. Note `PATCH /threads/:id` and `POST /threads/direct` and `GET /threads/assistant` push **nothing** today, so those writes are invisible until a refetch.

## 7. Authorization today

| Surface | Rule | Enforced at |
|---|---|---|
| `GET /threads` by participant | `participant_id` must equal the principal | `threads.ts:758` |
| `GET /threads` by host | no check — any authenticated principal | — |
| `GET /threads/:id` | `authorizeRead` → participant-scope for host `user`/`agent`, **true for `task`/`knowledge_item`/`team`/`factory`** | `threads.ts:857`, `auth/authorize.ts:29`, `auth/access-boundary.ts:32-66` |
| `POST /threads/:id/messages` | `authorizeWrite` = same predicate (`canWrite` delegates to `canRead`, `access-boundary.ts:76`) | `threads.ts:1295` |
| verdict | sender role must be literal `"founder"` and not the review's own sender | `threads.ts:1333-1339` |
| `POST /threads` | **none** — any principal may create a thread with any participants | — |
| `PATCH /threads/:id` | **none** — any principal may rewrite any thread's participant list | `threads.ts:705-731` |
| `POST /threads/direct` | sender forced to principal; recipient unchecked | `threads.ts:694` |
| `GET /threads/assistant` | scoped to principal; creates the thread | `assistant.ts:181` |
| `GET /reviews/:id`, `GET /conversations/items/:id`, `PATCH /conversations/items/:id`, `POST /conversations/items` | **none** | — |
| WS `thread:<id>` | participant check in the hub | `ws-connection-hub.ts:91-115` |

Team membership is never consulted for thread access. "Assistant thread" is recognised structurally by an `ast-<userId>` participant (`threads.ts:398-405`).

## 8. What would be deleted, and who reaches in from outside

| Thing | File | Lines |
|---|---|---|
| thread routes | `core-api/src/routes/threads.ts` | 1619 |
| thread schemas | `routes/threads-schema.ts` | 324 |
| conversations/items routes | `routes/conversations.ts` | 167 |
| assistant thread route | `routes/assistant.ts` | 234 |
| reviews route | `routes/reviews.ts` | 142 |
| recipients route | `routes/recipients.ts` | 70 |
| conversation package | `core-api/conversation/src/` (store 392 + resolver 164 + notice 86 + index 70) | 712 |
| policy engine | `core-api/policy/src/policy-engine.ts` (+ `approval-rate.ts` 104 if unused elsewhere) | 206 |
| the four tools | `tool-definitions.ts:52-85,118-160,286-36x,465-560` | ~330 |
| UI hooks + service | `useThreadDetail` 248 · `useAssistantThread` 191 · `useConversationsThreads` 270 · `useHostThread` 108 · `useRecipients` 119 · `host-threads.ts` 151 | 1087 |
| WS push plumbing | `pushUpdate` + hub thread authz + client topic wiring | ~150 |
| tables | `items` (`schema.ts:802-824`), `messages.legacyItemId` (`:788`) | — |
| governance rows | `actions-projected.ts:156-159,197-198,213-218` (routes), `:239,244,245,247` (tools), `:267-271` (events) | — |

Callers outside the thread area that reach these symbols:
- **task module**: `TaskView.threadId` (`framework/domain-model/src/actions/task.ts:156`, read at `task-actions.ts:253`) — but **nothing in production writes `tasks.threadId`**; only demo seed (`tools/setup/src/demo-world/conversations.ts`) and e2e fixtures. The task page uses `useHostThread("task", id)` instead.
- **calling thread**: `src/services/calling-thread-bindings.ts:35` imports `findThread`/`insertThread`; feeds `task-run-resolver.ts:238,301`.
- **knowledge**: `KnowledgeDetail.tsx:699` `useHostThread("knowledge_item", …)`; `threads.ts:371` resolves knowledge titles; conflict reviews are a separate table (`knowledge/src/knowledge-conflicts.ts`) and do **not** touch threads.
- **routines**: `routine-scheduler.ts:460-521` builds `thread` and `item` subjects; `routine-scheduler-bindings.ts:70-74` creates/reads items; `POST /routines/:id/trigger`.
- **notifications**: `notifications/src/install.ts:294-313` consumes `notification` from the policy engine and deep-links `/conversations/<threadId>`.
- **search**: `routes/search.ts:24,146` imports `listMessages`/`listThreads`/`searchConversations`.
- **orchestration seam**: `core-api-port-composition.ts:390-461` (8 thread/item methods), `tool-handlers-bindings.ts:131-150`, `tool-handlers/src/ports.ts:180-245`.
- **review→session gate**: `ports.gate.linkReviewToSession` (`tool-definitions.ts:543`) and `reviewVerdictRecorder` (`threads.ts:1504`, `POST /agent-orchestration/review-verdicts`).
- **return gate**: `return-actions.ts:47` names three of the four tools; `provisioner.ts:568,1566` names `reply` as a literal.
- **`GET /org/review-recipients`** (`routes/org.ts:183`) exists only to serve `create_item`/`submit_review`.

## 9. Open questions, each with the smallest option

1. **Is `item` a message kind, or does `create_item` just become `send_message` with `type:"review"`?** Smallest: drop `item` entirely — every production reader of items is the policy engine, notifications and routine subjects, all of which BC3 deletes or can read a `review` message instead. No new message type, no migration of shape, only a data migration.
2. **Does the policy engine survive?** Smallest: delete it. Its only unique effect is auto-approving a review on behalf of a trusted agent, which no human asked for and which posts as a fake sender `"policy_engine"` (`policy-engine.ts:164`) — a user id with no `users` row, violating the messages FK for any new install.
3. **Does `changes` gain a `message` kind, or is a message a `thread` `changed` row?** Smallest: reuse `kind:'changed'` with the message in `after` — no check-constraint migration (`schema.ts:585`). The plan's `thread.message` event then derives from a `changed` row whose `after` carries a message.
4. **Does a thread get a real `title` column?** Smallest: keep the computed 5-rung ladder (`threads.ts:426-559`) and let *adjust a thread* write an override column that rung 0 checks. The ACTIONS.md row says "Title, recipients, delete" so some stored title is implied.
5. **Where does *delete a thread* live?** Nothing deletes threads today; `messages.deletedAt`/`redactedAt` exist and nothing writes them. Smallest: soft-delete via a `thread` `changed` row, no new column beyond `deletedAt`.
6. **Who may post where, as an invariant?** Today host-scoped threads are world-writable to any authenticated principal (`access-boundary.ts:61`) and `PATCH /threads/:id` is unguarded. Smallest invariant: principal ∈ participants for every post, plus "creating a thread makes you a participant" — which is already true of every real call path.
7. **Does the verdict role check stay string-`"founder"`?** It is not in `USER_ROLES` (`threads.ts:198-201`). Smallest: keep the string, move it into the invariant function so one place owns it.
8. **Does `send_message` with an existing id overwrite, and does that rewrite history or append a `changed` row?** Smallest: overwrite the row, append a `changed` change row — no versions table.
9. **Does `reply`'s no-thread fallback survive as an invariant of *send a message*?** Smallest: yes — "a message with neither thread id nor recipients goes to the caller's calling thread, else the sole human" is one rule expressible in `sendMessageInvariants`.
10. **Does the assistant thread stay auto-created on read?** `GET /threads/assistant` writes on a GET (`assistant.ts:203`). Smallest: create it lazily inside *send a message* when the recipient is `ast-<me>`, so *open a thread* stays a read.
11. **Is `hasUnresolvedReview` part of the search result or derived client-side?** It costs a second query per list (`threads.ts:796`) and is the sidebar badge. Smallest: keep it on the search row.
12. **`tasks.threadId` — drop the column or start writing it?** Smallest: drop; `resolveOrCreateCallingThread` already resolves by `(hostKind, hostId)`.
