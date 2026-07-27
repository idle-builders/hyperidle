# conversation — Service-as-Product Audit (AU20)

Layer: core-api · Owns: `threads`, `messages` · Current public exports: 34 (29 fns + 5 types)
Consumers (services): notifications, policy, realtime, review, dispatch, session-requests, tool-handlers (+ many server routes).
Outbound service edges: none (pure leaf). Candidate neighbors: none.

## 1. Existence / Consolidation Verdict — STANDALONE

`conversation` earns its own boundary. It is the sole owner of the two most central tables in the
product — `threads` + `messages` — the substrate under every conversational surface (chat, inbox,
DM, review threads, verdict workflow, artifact discussions, search). Its product is "durable
conversation storage + the read projections the rest of the app needs over it." Seven distinct
services consume it plus the entire route layer; it depends on nothing. That is exactly the shape of
a legitimate leaf-domain product, and splitting it out is what makes Table ACL over `threads`/
`messages` possible at all (before AU19 any file wrote these tables raw).

Not infra/platform: it serves end-user product data, not other services' execution machinery. No
consolidation candidate — there is no sibling it duplicates or that duplicates it; the landscape
pass proposed none. The AU19 "why separate" claim holds; I do not challenge the boundary.

**What I DO challenge is the surface.** This is the frame's poster child for over-fragmentation: a
pure-leaf CRUD store with 29 functions, ~10 of which are near-duplicate thread-list variants and ~6
near-duplicate verdict/review message projections, each carved to fit one call site's exact
where/order/projection. The boundary is right; the API is garbage. The fix is a redesign, not a
merge/dissolve.

## 2. Deliberate Target Public API (~18 exports, down from 34)

The store has exactly two nouns (thread, message) and one join family. Design two general
read interfaces per noun (find-one / list-many, parameterized by filter), the irreducible CRUD
writes, one composite DM helper, and the three genuinely-distinct joined/aggregate surfaces.

### Threads
- **`findThread(exec, q: ThreadFilter): Promise<Thread | undefined>`** — first match, limit 1.
  Replaces `getThreadById`, `getThreadByDirectKey`, `getFirstThreadByHost`,
  `getFirstPinnedThreadByHost`. (`ThreadFilter = { id?, directKey?, host?:{kind,id}, pinned? }`)
- **`listThreads(exec, f: ThreadFilter): Promise<Thread[]>`** — filter + order + page.
  Replaces `listThreadsByHost`, `listThreadsByHostKind`, `listThreadsByParticipant`,
  `listThreadsByRecency`, `getThreadIdsByHost` (caller `.map(t=>t.id)`), `listThreadMetaByIds`
  (caller projects). (`ThreadFilter` adds `{ hostKind?, participantProbe?, ids?,
  order?:'lastActive'|'created', limit?, offset? }`)
- **`countThreads(exec): Promise<number>`** — aggregate; not expressible as a row filter.
- **`insertThread(exec, values)`** / **`updateThread(exec, id, patch)`** — irreducible CRUD writes.
- **`findOrCreateDirectThread(exec, sender, recipient, now, recipientKind?)`** — idempotent DM
  create with participant-set matching. A real shared capability (DM semantics), not a per-caller
  method; kept as one composite.

### Messages
- **`findMessage(exec, q: MessageFilter): Promise<Message | undefined>`** — first match.
  Replaces `getMessageById`, `getMessageByClientKey`.
- **`listMessages(exec, f: MessageFilter): Promise<Message[]>`** — the workhorse. Filter carries
  both message predicates AND the owned thread-join predicates. Replaces `listMessagesByThread`,
  `getMessagesByThreadIds`, **and all four verdict/review projections**: `listUnresolvedReviewThreadIds`
  (`{threadIds, types:['review','questionnaire'], unresolved:true}` → caller distinct-maps threadId),
  `listVerdictItemIds` (`{types:['verdict'], legacyItemIds}` → map legacyItemId),
  `listInitiatedVerdictMessages` (`{types:['verdict'], threadInitiatorId, since, noLegacyItem:true}`),
  `listVerdictMessagesByItemIds` (`{types:['verdict'], legacyItemIds, since}`).
  (`MessageFilter = { id?, clientKey?, threadId?, threadIds?, types?, blockId?, unresolved?,
  includeDeleted?, threadInitiatorId?, legacyItemIds?, noLegacyItem?, since?, order?, dir?,
  tiebreakId?, limit? }`)
- **`insertMessage(exec, values)`** / **`updateMessage(exec, id, patch)`** — CRUD writes.
- **`resolveMessageIfUnresolved(exec, id, at)`** — first-verdict-wins compare-and-set with
  `returning`. Distinct concurrency primitive, not a plain update; kept.

### Joined / aggregate surfaces (return combined or rolled-up rows — not plain table filters)
- **`listInbox(exec, f: InboxFilter): Promise<InboxRow[]>`** — messages⋈threads returning
  message+participants. Replaces `listInboxBySenderExclusion`, `listInboxByParticipantProbe`.
  (`InboxFilter = { excludeSenderId?, participantProbe?, limit?, offset? }`)
- **`searchConversations(exec, { participantPattern, messagePattern, limit }): Promise<ThreadSearchRow[]>`**
  — thread⋈message search join. A distinct product capability (conversation search surface).
- **`getArtifactThreadSummaries(exec, artifactIds): Promise<ArtifactThreadSummaryRow[]>`** — per-artifact
  message-count/last-message/unresolved-review rollup. A distinct aggregate serving the artifact/bets
  surface.

### Exported types (~5)
`ThreadFilter`, `MessageFilter`, `InboxFilter` (the parameterizations) + `InboxRow`,
`ThreadSearchRow`, `ArtifactThreadSummaryRow` (combined/aggregate return shapes).
**Dropped:** `MessageListOpts` (subsumed by `MessageFilter`), `VerdictMessageRow` (dissolves — the
four verdict paths now return plain `Message`/derive from it via `listMessages`).

**Count: 14 functions + 5 types = ~19 exports** (target 18-19, down from 34).

## 3. Inside Lens

Two tables → two `find`/`list` pairs + CRUD is a flat, obvious internal shape. All filtering lives in
one `buildThreadWhere(f)` / `buildMessageWhere(f)` conjunction-builder each; adding a new predicate
is one `if (f.x) conds.push(...)` line, touched in one place, tested once. The join surfaces
(`listInbox`/`searchConversations`/`getArtifactThreadSummaries`) stay separate precisely because they
return non-`Thread`/`Message` shapes — keeping them out of the generic lists prevents the generic
filter from growing a projection-selector zoo. No events, no outbound DI, no orchestration — the
store stays a thin, behavior-preserving persistence layer, which is why it's cheap to evolve.

## 4. Scaling Argument (sub-linear)

The current API grows one method per (where-clause × order × projection) tuple a caller wants — that
is why 7 consumers produced 29 functions. The target API absorbs new demand by composition:

- "pinned threads for a host kind, newest-created" → `listThreads({ hostKind, pinned, order:'created' })`
  — **no new method**. Under the old shape this was a 9th `listThreadsByHostKindPinnedByRecency`.
- "verdict messages for a thread set in a window" → `listMessages({ threadIds, types:['verdict'], since })`
  — **no new method**. Old shape: a 5th verdict projection.
- "messages of type X unresolved in thread" → `listMessages({ threadId, types:['X'], unresolved:true })`.

Add dozens of services and hundreds of calls: they parameterize `ThreadFilter`/`MessageFilter`. Only
a genuinely new *shape* of result (a new join returning a new combined/aggregate row) warrants a new
export — and those are rare and named after a product capability (inbox, search, artifact-summary),
not after a caller. Method count tracks distinct result-shapes, not use-cases → sub-linear.

## 5. Key Collapses

1. **~10 thread reads → `findThread` + `listThreads`** (the ~8 near-dup thread-list variants the
   frame calls out: `listThreadsByHost/ByHostKind/ByParticipant/ByRecency`, `getFirst*ByHost`,
   `getThreadById/ByDirectKey`, `getThreadIdsByHost`, `listThreadMetaByIds`).
2. **6 message reads incl. all 4 verdict/review projections → `listMessages` + `findMessage`** —
   `MessageFilter` carries the thread-join predicates (`threadInitiatorId`, `legacyItemIds`, `since`,
   `unresolved`) so the bespoke verdict/review queries dissolve into filter parameterizations; the
   `VerdictMessageRow` projection type disappears.
3. **2 inbox variants → `listInbox`** (one join, filter by `excludeSenderId` XOR `participantProbe`).
4. **`MessageListOpts` → `MessageFilter`** unifies with all the new message-filter demand under one
   parameter type.

Kept unchanged (each earns it): `countThreads` (aggregate), the four CRUD writes +
`resolveMessageIfUnresolved` (CAS), `findOrCreateDirectThread` (DM composite), `searchConversations`
and `getArtifactThreadSummaries` (distinct joined/aggregate product surfaces).
