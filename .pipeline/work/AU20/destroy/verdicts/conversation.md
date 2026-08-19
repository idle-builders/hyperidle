# conversation — destroyer verdict

## Should this service exist?

**KEEP — this IS the product.** "Humans and agents collaborating through conversations" is the first clause of what HyperIdle is. `threads` + `messages` are the central tables; every agent tool that talks (`send_message`, `reply`, `read_inbox`, `submit_review`) and every chat surface in the UI lands here. The AU12 ownership seam (single owner of thread/message row writes) is also the thing AU-track governance is built on — killing it re-scatters raw table writes across 20 callers.

The function surface was already destroyed once (AU20 Am5: 29 → 14 store functions). What's left is close to the minimal honest shape. The remaining fat is not in the functions — it is in **dead doors calling them** (4 production-dead HTTP routes), **dead flexibility** (params and filter fields whose only callers are those dead routes), and **defenses for a feature that never shipped** (message soft-delete/redaction has no production writer, yet four read paths guard against it). This verdict kills those.

## If written today, from scratch

Eleven callable units:

- `insertThread` / `updateThread` / `insertMessage` — the irreducible writes
- `resolveMessageIfUnresolved` — the one conditional write (verdict CAS, absorbs `updateMessage`)
- `findThread` / `listThreads` / `findMessage` / `listMessages` — the filtered reads
- `findOrCreateDirectThread(db, senderId, recipientId, now)` — DMs, no kind param
- `listInbox` — sender-exclusion only (the agent `read_inbox` tool)
- `searchConversations` — the live global-search join
- `resolveAssistantTurnRequest` — human message → assistant turn, the product's beating heart
- plus two bootstrap reactions: pin-after-first-AI-reply (moved to Layer code, DI interface dead) and session-not-returned notice

Not in the from-scratch shape: `countThreads`, `updateMessage`, the typed error class, `recipientKind`, the participant-probe inbox variant, the deleted/redacted guards.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 10 |

Surface: 18 callable units (17 functions + 1 class) → 15 functions, 0 classes (~17% unit cut; the deeper cut is 4 dead routes, 1 DI interface, 1 policy-port member, and 7 filter/param fields — measured in reachable surface, not function count).

## Feature-level kills

These are caller kills — the service methods they reach survive via live doors, but the dead doors and the flexibility that exists only for them die.

1. **`GET /api/conversations/` + `GET /api/conversations/:threadId` (routes/conversations.ts) — dead thread-list door.** Zero production callers: the web UI's thread list is `GET /api/threads?participant_id=…` (`useConversationsThreads.ts:165`), and the agent seam uses only `client.conversations.items.*` (core-api-port-composition.ts:473–494). The list route is a second way to list threads, carries an `attention_score` branch that is byte-identical to its default branch, and is the **sole caller of `countThreads`**. The `:threadId` route still ships `responses: []` "for one release" — that release shipped. What breaks: nothing observable. The `/items` routes on the same router are live (agent seam) and stay.
2. **`GET /api/users/:id/inbox` + `POST /api/users/:id/inbox` (routes/users.ts:291, 326) — dead inbox doors.** Zero production callers: the UI's inbox is `/api/notifications/inbox` (`useNotifications.ts:45`), agents read via `GET /api/threads/inbox` (sender-exclusion seam). GET is the **sole caller of `listInbox`'s participant-probe variant**; POST is the sole caller passing nothing but defaults into `findOrCreateDirectThread`. What breaks: nothing — no client sends these requests.
3. **`GET /api/threads/coach/` (routes/coach.ts) — superseded door.** `useAssistantThread.ts:9` records the fetch path moving coach → assistant (AD8b); no production caller remains, only the comment. It is the **sole caller of `findThread({pinned})`**. A whole route file duplicating assistant.ts. What breaks: nothing.
4. **Message soft-delete/redaction read-guards — defense for a feature with no writer.** No production code ever sets `messages.deletedAt` or `messages.redactedAt` (the only `deletedAt` writer is routine soft-delete, a different table; `updateMessage`'s only caller patches `resolvedAt`). Yet four paths defend against it: `MessageFilter.includeDeleted` (sole caller search.ts:180), the resolver's `message.deletedAt || message.redactedAt` throw, `searchConversations`' `deletedAt IS NULL` clause, and `getArtifactThreadSummaries`' non-deleted filtering. Strip all four. What breaks: nothing today — no such row can exist. When message deletion actually ships, its writer re-adds the guards it needs. (The schema columns are `framework/db`'s surface, not this service's — flagged, not verdicted here.)
5. **`AssistantTurnSourceUnavailableError` — a typed error nobody catches.** No file outside the package + its barrel imports it; no `instanceof` anywhere. Ceremony around a `throw new Error(...)`.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registerAssistantThreadPinReaction` | BOOTSTRAP (service-bootstrap.ts) → EVENT:thread_message_appended | SIMPLIFY | Live product effect (assistant thread sorts pinned-first in ThreadSections.tsx:134), but 80 lines + a DI interface + WeakSet for one conditional UPDATE. Move to `core-api/src/services/` (Layer code — same shape as assistant-turn-coherence-trigger.ts), import users' `findUser` statically, delete `AssistantThreadPinReactionDeps` and the WeakSet guard. Write still routes through `updateThread`. |
| 2 | `resolveAssistantTurnRequest` | UI:POST /api/threads/:id/messages (threads.ts:1516) + EVENT:thread_message_appended (coherence trigger:75) | SIMPLIFY | Core value itself — human message → assistant turn. Shrink: `readServerConfig` is "optional" but both real call sites wire it — make it required and delete the absent-branch + conditional `harnessDisabled` spread; delete the deleted/redacted guard (feature kill #4). |
| 3 | `insertThread` | UI:POST /api/threads/ (+12 more doors, 2 agent tools, 2 schedulers) | KEEP | Irreducible row write; the AU12 ownership seam for thread creation. Core: threads exist. |
| 4 | `updateThread` | UI:PATCH /api/threads/:id, POST /api/threads/:id/messages (lastActiveAt bump), agent tools via seam | KEEP | Irreducible row write; lastActiveAt bumps drive the recency-sorted thread list the UI actually renders. |
| 5 | `insertMessage` | UI:POST /api/threads/:id/messages + AGENT:send_message/reply/submit_review + SCHED:lifecycle | KEEP | The single most core write in the product — a message getting sent. |
| 6 | `updateMessage` | EVENT:item_created → policy-engine.ts:199 (only production caller) | MERGE | One caller, one field: policy-engine sets `resolvedAt` on a review message. `resolveMessageIfUnresolved` does exactly that with better (first-wins) semantics. Switch policy-engine to it, delete this and the `updateMessage` member of `policy/src/ports.ts:76`. |
| 7 | `resolveMessageIfUnresolved` | UI:POST /api/threads/:id/messages (verdict path) + AGENT:submit_review via seam | KEEP | The verdict CAS — first-verdict-wins is the review→act loop (AL7), which is earned, chosen review, not ceremony. Absorbs #6. |
| 8 | `findOrCreateDirectThread` | UI:POST /api/threads/direct + AGENT:send_message/reply (seam port) | KEEP* | DMs between humans and agents — core. *Shrink signature: drop `recipientKind` — no production caller passes it (threads.ts:762 omits it; the only other caller is dead route kill #2). |
| 9 | `findThread` | 14 UI doors + agent tools + 2 event subscribers | KEEP | The single-thread read behind every thread route, authz check, and reaction. Drop the `pinned` filter field with feature kill #3. |
| 10 | `listThreads` | UI:GET /api/threads/ (the real UI list), GET /api/search/, routine scheduler | SIMPLIFY | Live everywhere — but drop `order:"created"` and `offset` from `ThreadFilter`: their only caller is the dead conversations route (kill #1). Every surviving caller orders by `lastActive` with no offset. |
| 11 | `countThreads` | UI:GET /api/conversations/ — a door with zero production callers | DELETE | Sole consumer is dead route kill #1; a pagination `total` no client ever reads. Delete the function and the route together. |
| 12 | `findMessage` | UI:POST /api/threads/:id/messages (idempotency + verdict target), GET /api/reviews/:id, EVENT:coherence trigger | KEEP | Idempotency replay and verdict-target lookup — correctness of the core send path. |
| 13 | `listMessages` | 7 direct UI doors (transcripts, search, agent profile) + resolver + trust-model verdict windows (policy-bindings.ts:155) | KEEP | Every conversation render and the approval-rate trust model read through it. The `legacyItemIds`/`noLegacyItem`/`threadInitiatorId` fields are live trust-model inputs, not dead legacy. Drop only `includeDeleted` (kill #4). |
| 14 | `listInbox` | UI:GET /api/threads/inbox → AGENT:read_inbox (seam) | SIMPLIFY | The sender-exclusion variant is the agent `read_inbox` tool — core. The participant-probe variant's only door is dead route kill #2. Un-merge the XOR: keep `{excludeSenderId, limit}` only, delete the probe branch, the `"%%"` fallback, and `offset`. |
| 15 | `searchConversations` | UI:GET /api/search/ → GlobalSearchPanel (live) | KEEP | Global search over conversations is a real product surface the shell renders. Drop the `deletedAt IS NULL` clause (kill #4). |
| 16 | `getArtifactThreadSummaries` | UI:GET /api/bets/:id/artifact-thread-summary → useArtifactThreadSummary (live bet page) | KEEP | Distinct aggregate product surface: conversation state on a bet's artifacts. Live hook in production UI. Drop the deleted-message filtering (kill #4). |
| 17 | `registerSessionNotReturnedNotice` | BOOTSTRAP (service-bootstrap.ts) → EVENT:session_not_returned | KEEP | The never-silent net: a person waiting on an agent turn is told it died instead of hanging forever. That is conversation-trust, the product's core promise, in 20 effective lines. |
| 18 | `AssistantTurnSourceUnavailableError` (class) | INTERNAL — thrown at resolver:126, caught by nobody | DELETE | No importer outside the package, no `instanceof` anywhere. Replace the throw with plain `Error`. Typed-error ceremony. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AssistantThreadPinReactionDeps` | DELETE | Dies with row 1's move to Layer code, which may import `@hyperidle/users` directly. Mechanism C ceremony with no remaining reason to exist. |
| `AssistantTurnResolverDeps` | SIMPLIFY | Keep `requireRunnableAgent` (the Mechanism C boundary is real). Make `readServerConfig` required — both production call sites (threads.ts:1516, coherence trigger:82) already wire it; the optional is dead flexibility. |
| `BakedTranscriptRow` | KEEP | The resolver's transcript element; run-orchestration deliberately mirrors it structurally (runtime.ts:178) so the drain stays decoupled. |
| `BakedAssistantTurnRequest` | SIMPLIFY | The emit-time contract — load-bearing. Make `harnessDisabled` required once its dep is (above), and drop the barrel export from index.ts: no external file imports the name. |
| `ThreadFilter` | SIMPLIFY | Drop `offset`, `order:"created"`, `pinned` — each field's only production caller is a dead route (kills #1, #3). Survivors: id, directKey, host, hostKind, participantProbe, ids, order:"lastActive", limit. |
| `MessageFilter` | SIMPLIFY | Drop `includeDeleted` (kill #4). Everything else is exercised by live doors, including the trust-model trio. Note: `findMessage` silently ignores 12 of these fields — acceptable for a shared key type, but do not grow it. |
| `InboxFilter` | SIMPLIFY | Drop `participantProbe` and `offset` (die with row 14). Survives as `{excludeSenderId, limit}`. |
| `InboxRow` | KEEP | The `read_inbox` tool's wire element; `participants` is returned to the agent by the live inbox route. |
| `ThreadSearchRow` | KEEP | Exact projection the live search route JS-filters and responds with. |
| `ArtifactThreadSummaryRow` | KEEP | Wire shape of a live UI hook. |
| `SESSION_NOT_RETURNED_NOTICE_TEXT` (const) | SIMPLIFY | Production use is only intra-module; every external importer is a test. Un-export; tests assert the literal. |

## Holes this leaves

- **No global thread list endpoint.** Killing `GET /api/conversations/` removes the only unscoped "all threads, paginated" door. Nothing calls it, and the participant-scoped `GET /api/threads` is what the product actually uses. If an admin-ish overview is ever wanted — that's an enterprise reflex; don't rebuild it.
- **No human→human DM kind.** Dropping `recipientKind` hard-codes direct threads to `hostKind:"agent"`. Today no production path creates a user-kind direct thread. If human-to-human DMs ship, the parameter comes back with its first real caller.
- **Message deletion/redaction loses its read-side guards.** If someone hand-writes `deletedAt` into the DB, deleted messages will render. Acceptable: the feature has no writer, so the guards defend a state the product cannot reach. The feature's future implementation owns re-adding them.
- **Coach route deletion** removes a URL that has been dead since AD8b; any stale external client pinned to `/api/threads/coach` gets a 404. None is known to exist.
- **Policy-engine resolve becomes first-wins** (via the CAS merge). If a review message were somehow already resolved, policy-engine's stamp becomes a no-op instead of an overwrite — strictly safer, and no production path races it today.
