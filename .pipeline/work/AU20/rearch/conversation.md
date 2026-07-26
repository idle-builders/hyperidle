# conversation — Service-as-Product (AU20 re-architecture, BOTH lenses)

Layer: core-api · Substrate: **owned-tables** (`threads`, `messages`) · Outbound service edges: none (pure leaf).
Current: **14 methods + 6 types**. Target: **14 methods + 6 types**. Floor: 10 (5×2 tables).

This service is the exemplar of the redesign the frame demands, already landed: Am5 replaced 15 bespoke
thread/message/inbox variants + 4 verdict projections + 2 dead types with general filter interfaces. The
failure mode the frame warns about ("public API shrank but the code did not — old queries hidden inside")
does NOT apply: the implementation IS a filter-conjunction builder, not a facade wrapping 29 private
functions. Verified against `conversation-store.ts` (546 lines, all general). No further deletion needed;
this doc re-derives the number from the substrate to prove 14 is floor + justified, not residual sprawl.

## 1. INSIDE-OUT (anchor)

**Substrate:** two owned DB tables, `threads` + `messages`. This is a plain persistence store — no
external system, no algorithm. Floor = CRUD over the two tables.

**The floor (CRUD, ~5 ops/table → nominal 10, effective 8):**
- `threads`: create=`insertThread`, get=`findThread`, list=`listThreads`, update=`updateThread`.
  No hard delete — thread deletion is not a product operation.
- `messages`: create=`insertMessage`, get=`findMessage`, list=`listMessages`, update=`updateMessage`.
  Delete folds into update: soft-delete is `updateMessage(id, {deletedAt})`; `listMessages`/joins carry an
  `includeDeleted`/`deletedAt IS NULL` predicate. So delete is NOT a distinct method — 8 real CRUD ops, not 10.

get and list are BOTH floor reads (find-one vs list-many); each is parameterized by a single filter bag
(`ThreadFilter`/`MessageFilter`) — one general read pair per table, not a method per where/order/projection.

**Genuine owned capabilities beyond the floor (6):**
1. `countThreads` — aggregate `COUNT(*)`; not expressible as a row filter over the two tables.
2. `resolveMessageIfUnresolved` — first-verdict-wins compare-and-set (`SET resolvedAt WHERE resolvedAt IS
   NULL RETURNING id`). A concurrency primitive the store owns, distinct from a plain patch.
3. `findOrCreateDirectThread` — idempotent DM upsert with participant-set matching. Owned DM semantics
   (host=recipient, exactly-two-participant identity), one composite, not a per-caller helper.
4. `listInbox` — `messages ⋈ threads` returning message + `participants` JSON for JS membership filtering.
   Distinct combined shape (`InboxRow`); serves the agent inbox surface.
5. `searchConversations` — `threads ⋈ messages` search join (participant-pattern AND message-payload
   pattern), distinct projected row (`ThreadSearchRow`); serves conversation search.
6. `getArtifactThreadSummaries` — per-artifact rollup (message count / last message / unresolved-review
   flag), distinct aggregate row (`ArtifactThreadSummaryRow`); serves the artifact/bets discussion surface.

Each of the 6 returns a shape or performs an operation the generic `find`/`list`/CRUD cannot express, and
each maps to a named product capability (count, verdict-race, DM, inbox, search, artifact-summary) — not a
consumer. **8 CRUD + 6 capabilities = 14.**

## 2. OUTSIDE-IN (real consumer demand)

7 consuming services, 20 distinct requested methods in the data — every one maps onto the 14 by
parameterization, none needs a bespoke method:

- **notifications** `listVerdictItemIds` → `listMessages({types:['verdict'], legacyItemIds})`.
- **policy** `insertMessage`/`updateMessage`/`insertThread`/`updateThread` (CRUD, direct);
  `listMessagesByThread` → `listMessages({threadId})`; `listInitiatedVerdictMessages` →
  `listMessages({types:['verdict'], threadInitiatorId, since, noLegacyItem})`;
  `listVerdictMessagesByItemIds` → `listMessages({types:['verdict'], legacyItemIds, since})`.
- **realtime** `getThreadById` → `findThread({id})`.
- **dispatch** CRUD writes; `getThreadById` → `findThread({id})`; `listMessagesByThread` →
  `listMessages({threadId})`; `getThreadIdsByHost` → `listThreads({host}).map(t=>t.id)`.
- **session-requests** `getMessageById` → `findMessage({id})`.
- **tool-handlers** CRUD writes; `getThreadById`/`getFirstThreadByHost` → `findThread({id}|{host})`;
  `findOrCreateDirectThread` (direct); `listInboxBySenderExclusion` → `listInbox({excludeSenderId})`.

Demand is a small closed set: get-thread, list-threads-by-host, CRUD, verdict/review message projections
(all now filter params on `listMessages`), inbox, DM. No consumer asks for anything the 14 cannot serve.

## 3. THE COHERENT PRODUCT API (fused, 14 methods / 6 types)

**Threads**
- `insertThread(exec, values)` — floor create. [inside-out]
- `updateThread(exec, id, patch)` — floor update (covers pin/rename/soft-state). [inside-out]
- `findThread(exec, q: ThreadFilter)` — floor get-one; serves realtime/dispatch/tools get-by-id/host. [both]
- `listThreads(exec, f: ThreadFilter)` — floor list-many; serves list-by-host/host-kind/participant/recency/id-set + `.map(id)`. [both]
- `countThreads(exec)` — aggregate capability. [inside-out]
- `findOrCreateDirectThread(exec, sender, recipient, now, recipientKind?)` — DM composite capability; serves tools. [both]

**Messages**
- `insertMessage(exec, values)` — floor create. [inside-out]
- `updateMessage(exec, id, patch)` — floor update (incl. soft-delete via `deletedAt`). [inside-out]
- `findMessage(exec, q: MessageFilter)` — floor get-one; serves get-by-id/client-key. [both]
- `listMessages(exec, f: MessageFilter)` — floor list-many; the workhorse. Filter carries message
  predicates AND owned thread-join predicates (`threadInitiatorId` via subquery), absorbing all 4 verdict/
  review projections. [both]
- `resolveMessageIfUnresolved(exec, id, at)` — CAS concurrency capability. [inside-out]

**Joined / aggregate surfaces** (distinct combined/aggregate shapes — cannot be plain table filters)
- `listInbox(exec, f: InboxFilter)` — inbox join capability; serves tools. [both]
- `searchConversations(exec, participantPattern, messagePattern, limit)` — search capability. [inside-out]
- `getArtifactThreadSummaries(exec, artifactIds)` — artifact rollup capability. [inside-out]

**Types (6, all genuinely needed):**
`ThreadFilter`, `MessageFilter`, `InboxFilter` — the three read parameterizations (one per read family).
`InboxRow`, `ThreadSearchRow`, `ArtifactThreadSummaryRow` — the three distinct join/aggregate return
shapes. None is a per-caller mirror; each read family and each join surface needs exactly one.

**Completeness proof:** every current user feature still deliverable — chat/DM (insert/update/find/listMessages
+ findOrCreateDirectThread), inbox (listInbox), review & verdict workflow (listMessages with
types/unresolved/legacyItemIds/threadInitiatorId + resolveMessageIfUnresolved), conversation search
(searchConversations), artifact discussions (getArtifactThreadSummaries), thread pinning/recency listing
(listThreads with pinned/order). No capability removed; only fragmentation removed.

## 4. TARGET NUMBERS

- **targetMethods = 14** = 8 CRUD floor + 6 genuine capabilities (count, CAS, DM, inbox, search,
  artifact-summary). Every method above the 8-op floor is justified by a named owned capability or a
  distinct join/aggregate return shape.
- **targetTypes = 6** = 3 read-filter parameterizations + 3 distinct join/aggregate return shapes.
- **Floor = 10** (nominal 5×2); effective CRUD = 8 (no hard delete; soft-delete rides update).

**DELETED (already landed in Am5, deletion not internalization — implementation is general filter builders,
verified in source):** 15 bespoke reads collapsed into the 4 general read methods — `getThreadById`,
`getThreadByDirectKey`, `getFirstThreadByHost`, `getFirstPinnedThreadByHost`, `getThreadIdsByHost`,
`listThreadsByHost`, `listThreadsByHostKind`, `listThreadsByParticipant`, `listThreadsByRecency`,
`listThreadMetaByIds`, `getMessageById`, `getMessageByClientKey`, `listMessagesByThread`,
`getMessagesByThreadIds`, `listUnresolvedReviewThreadIds`; 4 verdict/review projections folded into
`listMessages` filter params (`listVerdictItemIds`, `listInitiatedVerdictMessages`,
`listVerdictMessagesByItemIds`, + the review projection); 2 inbox variants → `listInbox`; 2 dead types
`MessageListOpts`, `VerdictMessageRow`. Nothing further to delete — service sits at floor + justified.
