# conversation — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

Rows whose **verdict moved**:

| Row | Method | Old | New | Ruling | Why |
|---|---|---|---|---|---|
| 8 | `findOrCreateDirectThread` | SIMPLIFY (keep, drop `recipientKind`) | **MERGE** (into the AF14 `directKey` dedupe; `recipientKind` survives and gets wired) | Ruling 1 | The first wave judged `recipientKind` dead flexibility because "no production caller passes it" in a one-user world. Re-tracing on the shared-backend premise found the real defect: there are **two DM find-or-create mechanisms that cannot see each other's threads**. The UI door (`POST /api/threads`, threads.ts:1016–1027) dedupes by `directKey` and supports human↔human DMs today; the store's `findOrCreateDirectThread` scans `(hostKind, hostId)`, never sets `directKey`, and hard-defaults `hostKind:"agent"` — so an agent sending to a human (tool-definitions.ts:122, :197) creates a thread labeled `hostKind:"agent"`, `hostId:<userId>` that the UI's dedupe can never find. Same pair, opposite initiator → **two forked conversations**. In a multi-human deployment where agents DM humans and humans DM each other, this is a core-product correctness bug, not a param to delete. Fold the two mechanisms into one store function that computes `directKey` and takes the recipient's real kind. |

Rows/kills whose **verdict stands but whose first-wave reasoning was voided by Ruling 1 and had to be re-reached**:

| Row / kill | Verdict (unchanged) | Old reasoning (void) | New reasoning (shared backend) |
|---|---|---|---|
| Kill 1 — `GET /api/conversations/` + `/:threadId` | DELETE | "no client calls it" (single-user usage argument) | The kill gets **stronger** multi-human: the list route does zero participant filtering (`countThreads` + `listThreads({order:"created"})`, conversations.ts:82–93) — on a shared backend it returns **every human's DM threads to any authenticated principal**. Only the `/:threadId` detail route calls `authorizeRead`. The product's real thread list, `GET /api/threads?participant_id`, is participant-scoped and multi-human correct. The conversations list is a second, scope-bypassing way to do what the first way does safely. Dead AND a leak. |
| Kill 2 — `GET`/`POST /api/users/:id/inbox` | DELETE | "no client sends these requests" | Re-judged as product: a human's "what is waiting for me" is core in a team deployment — and these routes are a **half-built third inbox that would damage the product if used**. GET (users.ts:291) is a firehose of every message in your threads, including ones you sent — no unread state, no read markers, no sender exclusion. The real human inbox is `GET /api/notifications/inbox` (AU18 ownership, has read state). POST (users.ts:326) is a second send path that skips the entire message-append contract: no `thread_message_appended` emission (so no coherence trigger, no pin reaction, no WS push — Ruling 2: the fact happens, nothing announces it), no `lastActiveAt` bump (the thread never rises in the recipient's list), no idempotency triple, and it mislabels human recipients via the `recipientKind` default. The canonical pair `POST /api/threads/direct` + `POST /api/threads/:id/messages` does all of this correctly. Rebuild-don't-keep: DELETE both routes; the genuine gap they gesture at is named in Holes (DM notification emission). |
| Row 11 — `countThreads` | DELETE | dies with kill 1 | Unchanged mechanically, but now also: a global thread count is meaningless to any principal on a shared backend — there is no surface where one human should see the org-wide total. |
| Row 14 — `listInbox` participant-probe variant | SIMPLIFY | probe variant's only door is dead route | Same fact, corrected frame: the probe variant IS the half-built third inbox (kill 2). The surviving `excludeSenderId` variant is the agent `read_inbox` tool — live and multi-human correct (each agent excludes itself). Per-human inbox stays with notifications where read state lives. |
| First-wave hole "No human→human DM kind" | **RETRACTED** | "if human-to-human DMs ship, the parameter comes back" | Human↔human DMs are not a future feature — they exist now through `POST /api/threads` (`hostKind:"user"`, 2 participants, `directKey` dedupe) and are core product per Ruling 1. `recipientKind` is the right vocabulary with missing wiring (same shape as Ruling 2's missing emissions); it survives inside the row-8 MERGE. |

Ruling 2 check: this package's surface contains no event types; nothing here was killed on subscriber count. The soft-delete/redaction guard kill (kill 4) rests on "no production writer ever sets the column" — that is a payload-nothing-sets fact, which Ruling 2 explicitly does not protect. Stands.

Ruling 3 check: nothing in this package is knowledge-management ritual. No PLUGIN verdicts.

A4 check (live session surface): the conversation package's contribution to "dial into a session and watch" is `resolveAssistantTurnRequest` (the turn producer) and `registerSessionNotReturnedNotice` (the session-died-tell-the-human net). Both were already KEEP/SIMPLIFY in wave 1 and are now additionally **protected** — the resolver's baked-transcript machinery (`BakedTranscriptRow`, `BakedAssistantTurnRequest`) is the substrate the live-session producer will extend. Nothing in this verdict deletes anything A4 needs.

## Should this service exist?

**KEEP — this IS the product, and Ruling 1 makes it more so.** Conversation between several humans and their agents on one shared backend is the first clause of what HyperIdle is. `threads` + `messages` are the central tables; every agent tool that talks (`send_message`, `reply`, `read_inbox`, `submit_review`) and every chat surface lands here. The AU12 ownership seam (single owner of thread/message row writes) is what the AU-track governance stands on.

The function surface was already destroyed once (AU20 Am5: 29 → 14 store functions). The remaining rot, re-judged for a team deployment: one scope-bypassing dead door (the unscoped conversations list — now a leak, not just dead), one half-built third inbox (users inbox routes), one superseded route (coach), guards for a writer-less feature, a typed error nobody catches — and one genuine multi-human correctness bug the single-user lens hid: **the forked DM dedupe**.

## If written today, from scratch

For several humans and their agents talking on one shared backend, OIDC-identified, with an event stream plugins hang off:

- `insertThread` / `updateThread` / `insertMessage` — the irreducible writes
- `resolveMessageIfUnresolved` — the one conditional write (verdict CAS, absorbs `updateMessage`)
- `findThread` / `listThreads` / `findMessage` / `listMessages` — the filtered reads; every thread read participant-scoped at the door, because on a shared backend every list is somebody's privacy boundary
- **one** `findOrCreateDirectThread(db, senderId, recipientId, recipientKind, now)` — `directKey`-deduped, so the SAME thread resolves regardless of who initiates: human→human, human→agent, agent→human. Not two mechanisms.
- `listInbox({excludeSenderId, limit})` — the agent `read_inbox` tool; the *human* inbox lives with notifications, which owns read state
- `searchConversations` — global search across what the principal can see
- `resolveAssistantTurnRequest` — human message → assistant turn; also the producer seam for the A4 live-session surface
- plus two bootstrap reactions: pin-after-first-AI-reply (moved to Layer code) and session-not-returned notice

Not in the from-scratch shape: `countThreads`, `updateMessage`, the typed error class, the participant-probe inbox variant, the deleted/redacted read guards, a second DM-dedupe mechanism, an unscoped thread list.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 10 |

Surface: 18 callable units (17 functions + 1 class) → 15 functions, 0 classes. Same route-level kills as wave 1 (4 dead HTTP routes, 1 DI interface, 1 policy-port member, 7 filter/param fields) — with kill 1 upgraded from "dead" to "dead and a participant-scope bypass", and one new MERGE consolidating the two DM dedupe mechanisms into one.

## Feature-level kills

1. **`GET /api/conversations/` + `GET /api/conversations/:threadId` (routes/conversations.ts) — dead door, and on a shared backend a scope bypass.** Zero production callers (UI uses `GET /api/threads?participant_id=…`, agent seam uses only `client.conversations.items.*`). The list route filters by nothing — every thread on the backend, other humans' DMs included, to any authenticated principal; only the detail route does `authorizeRead`. Sole caller of `countThreads`. The `:threadId` route still ships `responses: []` "for one release" — that release shipped. The `/items` routes on the same router are live (agent seam) and stay. What breaks: nothing observable; what closes: an information leak the single-user lens graded as merely dead.
2. **`GET /api/users/:id/inbox` + `POST /api/users/:id/inbox` (routes/users.ts:291, 326) — half-built third inbox and event-blind second send path.** Zero production callers, re-confirmed (`rg -a`: only their own definitions). Judged as product for a team: GET has no read state, no sender exclusion, returns your own messages back to you — the notifications inbox (AU18) is the real per-human "waiting for you" surface and owns read state. POST inserts a message with no `thread_message_appended`, no WS push, no `lastActiveAt` bump, no idempotency, and a mislabeled thread — a DM sent through it would be invisible to the recipient's live UI and would never trigger an assistant turn. Keeping it multi-human would mean rebuilding it into `POST /threads/direct` + `POST /threads/:id/messages` — which already exist. DELETE both; sole callers of the participant-probe `listInbox` variant die with them.
3. **`GET /api/threads/coach/` (routes/coach.ts) — superseded door.** Killed for supersession, not usage: AD8b replaced it with `/api/threads/assistant` (per-user, `hostKind:"user"` + `hostId` lookup — already multi-human correct; every human gets their own assistant thread). Coach queried `pinned=true`, which the assistant design made wrong (threads start unpinned). Sole caller of `findThread({pinned})`. What breaks: nothing; `useAssistantThread.ts` moved in AD8b.
4. **Message soft-delete/redaction read-guards — defense for a feature with no writer.** No production code sets `messages.deletedAt` or `messages.redactedAt`. Four read paths guard a state the DB cannot reach: `MessageFilter.includeDeleted`, the resolver's deleted/redacted throw, `searchConversations`' `deletedAt IS NULL`, `getArtifactThreadSummaries`' non-deleted filtering. Strip all four. Multi-human framing: retract-my-message is a real team feature *someday* — when its writer ships, it re-adds the guards it needs, on its own read paths. Ruling 2 does not protect writer-less columns. (Schema columns are `framework/db`'s surface — flagged, not verdicted here.)
5. **`AssistantTurnSourceUnavailableError` — a typed error nobody catches.** No importer outside the package + barrel, no `instanceof` anywhere. Ceremony around `throw new Error(...)`.
6. **NEW — the forked DM dedupe (MERGE, not delete).** Two mechanisms decide "does a direct thread between A and B already exist": AF14 `directKey` (threads.ts:385, :1016–1027, with a unique partial index and race-winner resolution) and the store's `findOrCreateDirectThread` (hostKind-scan, `directKey` never set, `recipientKind` defaulted to `"agent"` by every caller). They cannot find each other's threads; agent-initiated and human-initiated DMs between the same pair fork. One mechanism survives: move `directKey` computation into the store function, wire `recipientKind` from the recipient's real identity, point `POST /threads/direct` and the AF14 path at it. Everything about DMs the product promises — one thread per pair, either side can start it — depends on this being one mechanism.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registerAssistantThreadPinReaction` | BOOTSTRAP (service-bootstrap.ts) → EVENT:thread_message_appended | SIMPLIFY | Unchanged from wave 1. Live product effect (assistant thread sorts pinned-first), but 80 lines + DI interface + WeakSet for one conditional UPDATE. Move to Layer code, import `findUser` statically, delete `AssistantThreadPinReactionDeps` + WeakSet. Write still routes through `updateThread`. |
| 2 | `resolveAssistantTurnRequest` | UI:POST /api/threads/:id/messages + EVENT:thread_message_appended (coherence trigger) | SIMPLIFY | Unchanged, now A4-protected: this is the turn producer the live-session surface extends. Shrink: make `readServerConfig` required (both real call sites wire it), delete the absent-branch; delete the deleted/redacted guard (kill 4). Do not touch the baked-transcript machinery. |
| 3 | `insertThread` | UI:POST /api/threads/ (+12 more doors, 2 agent tools, 2 schedulers) | KEEP | Irreducible row write; AU12 ownership seam for thread creation. |
| 4 | `updateThread` | UI:PATCH /api/threads/:id, message-append lastActiveAt bump, agent seam | KEEP | Irreducible row write; recency bumps drive the thread list every human sees. |
| 5 | `insertMessage` | UI:POST /api/threads/:id/messages + AGENT:send_message/reply/submit_review + SCHED:lifecycle | KEEP | The most core write in the product — a message getting sent. |
| 6 | `updateMessage` | EVENT:item_created → policy-engine.ts (only production caller) | MERGE | Unchanged. One caller, one field (`resolvedAt`); `resolveMessageIfUnresolved` does it with first-wins semantics. Switch policy-engine, delete this + the `updateMessage` port member in `policy/src/ports.ts`. |
| 7 | `resolveMessageIfUnresolved` | UI:POST /api/threads/:id/messages (verdict path) + AGENT:submit_review | KEEP | The verdict CAS — first-verdict-wins matters MORE with several humans reviewing concurrently. Absorbs #6. |
| 8 | `findOrCreateDirectThread` | UI:POST /api/threads/direct + AGENT:send_message/reply (seam port) + users.ts POST inbox (dying, kill 2) | **MERGE** | **CHANGED (Ruling 1), was SIMPLIFY-drop-recipientKind.** Second of two DM dedupe mechanisms; cannot see AF14 `directKey` threads, mislabels human recipients `hostKind:"agent"`, and races without the unique-index backstop AF14 has. Merge with the `directKey` mechanism into ONE store function; `recipientKind` survives and callers pass the recipient's real kind. See feature kill 6. |
| 9 | `findThread` | 14 UI doors + agent tools + 2 event subscribers | KEEP | The single-thread read behind every thread route, authz check, and reaction. Drop the `pinned` filter field (kill 3 — supersession, not usage). |
| 10 | `listThreads` | UI:GET /api/threads/ (participant-scoped, the real list), GET /api/search/, routine scheduler | SIMPLIFY | Unchanged. Drop `order:"created"` and `offset` — their only caller is the conversations route, which dies as a scope bypass (kill 1). Every surviving caller orders by `lastActive`, no offset. |
| 11 | `countThreads` | UI:GET /api/conversations/ — a door with zero production callers | DELETE | Unchanged, strengthened: dies with kill 1, and an org-global thread count has no principal it should ever be shown to on a shared backend. |
| 12 | `findMessage` | UI:POST /api/threads/:id/messages (idempotency + verdict target), GET /api/reviews/:id, EVENT:coherence trigger | KEEP | Idempotency replay and verdict-target lookup — correctness of the core send path. |
| 13 | `listMessages` | 7 direct UI doors + resolver + trust-model verdict windows (policy-bindings.ts) | KEEP | Every conversation render and the approval-rate trust model. `legacyItemIds`/`noLegacyItem`/`threadInitiatorId` are live trust-model inputs. Drop only `includeDeleted` (kill 4). |
| 14 | `listInbox` | UI:GET /api/threads/inbox → AGENT:read_inbox (seam) | SIMPLIFY | Verdict unchanged, reasoning re-reached (Ruling 1): the `excludeSenderId` variant is the agent inbox — live, multi-human correct. The participant-probe variant is the half-built third inbox (kill 2); the human "waiting for you" surface is notifications, which owns read state. Keep `{excludeSenderId, limit}` only; delete the probe branch, `"%%"` fallback, `offset`. |
| 15 | `searchConversations` | UI:GET /api/search/ → GlobalSearchPanel (live) | KEEP | Global search over conversations, a real product surface. Drop the `deletedAt IS NULL` clause (kill 4). Multi-human note for its caller (search.ts, not this row): the participant pattern is the scoping mechanism — it must stay principal-derived. |
| 16 | `getArtifactThreadSummaries` | UI:GET /api/bets/:id/artifact-thread-summary → live bet page hook | KEEP | Distinct aggregate surface: conversation state on a bet's artifacts. Drop the deleted-message filtering (kill 4). |
| 17 | `registerSessionNotReturnedNotice` | BOOTSTRAP (service-bootstrap.ts) → EVENT:session_not_returned | KEEP | Unchanged, A4-protected: the never-silent net. On a shared backend, N humans wait on agent turns — each must be told when a session died instead of hanging. Part of the session-surface trust story the founder wants finished. |
| 18 | `AssistantTurnSourceUnavailableError` (class) | INTERNAL — thrown at resolver:126, caught by nobody | DELETE | Unchanged. No importer outside package+barrel, no `instanceof`. Replace with plain `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AssistantThreadPinReactionDeps` | DELETE | Dies with row 1's move to Layer code. Unchanged. |
| `AssistantTurnResolverDeps` | SIMPLIFY | Keep `requireRunnableAgent`; make `readServerConfig` required. Unchanged. |
| `BakedTranscriptRow` | KEEP | The resolver's transcript element; also A4 substrate. Unchanged. |
| `BakedAssistantTurnRequest` | SIMPLIFY | Make `harnessDisabled` required once its dep is; drop the barrel export. Unchanged. |
| `ThreadFilter` | SIMPLIFY | Drop `offset`, `order:"created"`, `pinned` (kills 1, 3). `directKey` gains a second caller when row 8's merge lands. Survivors: id, directKey, host, hostKind, participantProbe, ids, order:"lastActive", limit. |
| `MessageFilter` | SIMPLIFY | Drop `includeDeleted` (kill 4). Trust-model trio stays. Do not grow it. Unchanged. |
| `InboxFilter` | SIMPLIFY | Drop `participantProbe` and `offset` (row 14). Survives as `{excludeSenderId, limit}`. Reasoning re-reached under Ruling 1; verdict unchanged. |
| `InboxRow` | KEEP | `read_inbox` wire element; `participants` returned to the agent. Unchanged. |
| `ThreadSearchRow` | KEEP | Exact projection of the live search route. Unchanged. |
| `ArtifactThreadSummaryRow` | KEEP | Wire shape of a live UI hook. Unchanged. |
| `SESSION_NOT_RETURNED_NOTICE_TEXT` (const) | SIMPLIFY | Un-export; only tests import it externally. Unchanged. |

## Holes this leaves

- **RETRACTED from wave 1: "No human→human DM kind."** Human↔human DMs exist today via `POST /api/threads` (directKey path) and are core product (Ruling 1). `recipientKind` survives inside the row-8 merge instead of coming back "with its first real caller" — its callers exist now.
- **No global thread list endpoint.** Still fine — better than fine: the only unscoped list was a participant-scope bypass. Anyone wanting an org-wide overview must build it participant-aware; do not resurrect this route.
- **DM-to-human emits no notification (pre-existing gap, now named as work).** `notification` events are emitted only by policy-engine and dependency-watcher; a human DMing a human (or an agent DMing a human) reaches the recipient only through the WS thread-list bump. In a team deployment "someone messaged you" belongs in the notifications inbox. This is Ruling-2-shaped missing emission — schedule an emission on the canonical message-append path / a notifications subscriber. It is not a reason to keep the users-inbox routes, which also lacked it.
- **No per-human read state on threads.** Unread markers per participant do not exist anywhere; notifications carries read state for its own rows only. Genuine multi-human product gap, owned by whoever ships unread — not by resurrecting any killed surface here.
- **Message deletion/redaction loses its read-side guards.** Unchanged: the feature has no writer; its future implementation (a real team want — retract my message) re-adds the guards it needs.
- **Coach route deletion** — stale external clients pinned to `/api/threads/coach` get 404. None known.
- **Policy-engine resolve becomes first-wins** (CAS merge) — strictly safer with several humans issuing verdicts concurrently.
- **Until the row-8 merge lands, DMs stay forked.** This is not a hole the deletions open — it is the live defect the single-user premise hid, and the reason row 8 is MERGE rather than a signature trim.
