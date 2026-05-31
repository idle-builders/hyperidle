# T5 Architecture: Block Discussion Completion

**Status:** Active
**Workpackage:** T5 -- Block Discussion Completion
**Complexity:** M

---

## Task 1: Concept Check

T5 introduces no new or reshaped nouns. Every concept is already defined and locked in the concept doc (`plans/human-authoring/editing-experience-concept.md`):

| T5 noun | Concept doc coverage | Status |
|---|---|---|
| **blockId persistence** | AC-19, section "Block Discussion (complete L18/L26)" | Covered -- "Block-anchored messages persist blockId durably (not just in opaque JSON payload -- structured for query)." |
| **anchor lost** | AC-20, same section | Covered -- "Anchor lost indicator when a block's content changes and blockId no longer resolves." |
| **Block Anchor** | "Concept: Block Reference" section, vocabulary table | Covered -- `BlockAnchor` defined as `{ blockId }` on a message within the host's own thread. Distinguished from Block Reference. |
| **block-scoped thread view** | AC-20 + contracts section ("render-time derivation") | Implicitly covered -- filtering is a query/render concern, not a new concept. |

No concept work is missing. The concept doc explicitly authorizes everything T5 needs. Proceed directly to architecture.

---

## Task 2: Design Decision -- Skip /design

T5 has two UI micro-changes, both within existing components:

1. **"Anchor lost" indicator**: A small text label on messages whose blockId no longer resolves to a derived block. This renders inside the existing `AnchoredMessages` component in `KnowledgeBody.tsx` and the equivalent in `WorkBet.tsx`. It is a conditional text span, not a new component or layout.

2. **Block-scoped filter**: A way to show only messages for a specific block. This is filtering within the existing `HostThreadSection` -- either a query param or component state toggle. No new page, no new layout, no new primitive.

Neither surface warrants variant exploration. Both are single-implementation-path changes within existing components. /design is skipped.

---

## Task 3: Architecture Plan

### 0. Current State Analysis

**Where blockId lives today:**

- `PlainPayloadWithBlockId` in `packages/shared/src/thread.ts` (line 393) defines `blockId?: string` on the payload.
- `plainPayloadSchema` in `packages/server/src/routes/threads-schema.ts` (line 64) validates `blockId: z.string().optional()` on the payload.
- `postPlainHostMessage` in `packages/web/src/services/host-threads.ts` (line 84) sends `blockId` inside the JSON payload body.
- The `messages` table in `packages/db/src/schema.ts` (line 234) has NO `blockId` column -- the blockId is buried inside the opaque `payload` JSON text column.

**The gap:** blockId is stored only inside the serialized JSON payload. It cannot be queried with SQL. There is no `WHERE block_id = ?` path. The messages table has no `block_id` column.

**What already works:**

- Block-anchored message creation (L18): users click "Discuss" on a block, composer gets a prefill chip, message is posted with `blockId` in the JSON payload.
- `messagesByBlockId` derivation in `KnowledgeDetail.tsx` (line 338) and `KnowledgeBody.tsx` (line 98): client-side JS loops through all messages, parses each payload, and groups by blockId.
- Orphan message detection: `KnowledgeBody.tsx` (line 98) already identifies messages whose blockId does not match any rendered block -- but renders them silently with no visual indicator.

---

### 1. Schema Migration: Add `block_id` column to messages

**File:** `packages/db/src/schema.ts`

Add a nullable `blockId` text column to the `messages` table, with an index for block-scoped queries.

```typescript
// In the messages table definition:
blockId: text("block_id"),

// In the table's index array:
index("messages_block_id_idx").on(table.blockId),
```

**Column properties:**

| Property | Value | Rationale |
|---|---|---|
| Type | `text` | BlockId is a branded string (Blake2s hash). Text matches all other ID columns. |
| Nullable | Yes | Most messages have no block anchor. Existing rows will be NULL. |
| Default | None (NULL) | Additive -- existing rows are unaffected. |
| Index | B-tree on `block_id` | Enables `WHERE block_id = ?` for block-scoped thread queries. |
| FK constraint | None | BlockIds are content-derived (not row IDs). No foreign key target exists. |

**Migration file:** `packages/db/drizzle/0020_T5_block_id_column.sql`

```sql
-- T5: Add block_id column to messages for queryable block-anchored discussions.
-- Nullable: most messages have no block anchor. Existing rows get NULL.
-- Forward migration only (no rollback). The column is additive.

ALTER TABLE "messages" ADD COLUMN "block_id" text;
CREATE INDEX "messages_block_id_idx" ON "messages" ("block_id");
```

**Generation:** Run `npm run db:generate` in `packages/db` to produce the migration, then verify the generated SQL matches the expected shape. If drizzle-kit produces a different migration name, rename to follow the `0020_T5_*` convention.

---

### 2. Backfill: Extract blockId from existing JSON payloads

**Migration file:** `packages/db/drizzle/0020_T5_block_id_column.sql` (appended to the same migration)

```sql
-- Backfill: extract blockId from existing plain-message payloads.
-- Only plain messages carry blockId. The payload column is JSON text.
-- PostgreSQL json extraction: payload::json->>'blockId'
UPDATE "messages"
SET "block_id" = (payload::json->>'blockId')
WHERE "type" = 'plain'
  AND payload::json->>'blockId' IS NOT NULL
  AND "block_id" IS NULL;
```

**Why in-migration vs. application code:** The backfill is a one-time data correction. Running it as SQL inside the migration ensures:
- It runs exactly once, atomically with the column addition.
- No application code path to maintain or accidentally re-run.
- Works regardless of how many messages exist (PostgreSQL handles it).

**Risk:** If any payload is malformed JSON, `payload::json` will throw. Mitigation: the Zod schema on the write path has always validated payloads, so malformed JSON should not exist. If it does, the migration will fail loudly and can be fixed by wrapping in a `DO $$ ... EXCEPTION WHEN ...` block.

---

### 3. Server-Side Changes

#### 3.1 Schema types update

**File:** `packages/db/src/schema.ts`

The `Message` inferred type will automatically include `blockId: string | null` after the column is added. No manual type changes needed -- Drizzle infers from the table definition.

#### 3.2 Message creation: write blockId to both payload AND column

**File:** `packages/server/src/routes/threads.ts`

When inserting a message, if the payload contains a `blockId` (plain messages only), write it to both the `payload` JSON and the new `block_id` column. This is dual-write: the column is the queryable source; the payload retains it for backward compatibility and for clients that read the payload directly.

**In `POST /api/threads` (create thread + initial message, ~line 362):**

```typescript
// Extract blockId from plain payload for the column
const blockIdCol = input.initialMessage.type === "plain"
  ? (input.initialMessage.payload as { blockId?: string }).blockId ?? null
  : null;

await tx.insert(messages).values({
  id: messageId,
  senderId,
  threadId,
  type: input.initialMessage.type,
  payload: JSON.stringify(input.initialMessage.payload),
  clientKey: input.initialMessage.clientKey,
  blockId: blockIdCol,  // NEW: write to column
  createdAt: now,
});
```

**In `POST /api/threads/:id/messages` (append message, ~line 524):**

```typescript
const blockIdCol = input.type === "plain"
  ? (input.payload as { blockId?: string }).blockId ?? null
  : null;

await tx.insert(messages).values({
  id: messageId,
  senderId,
  threadId,
  type: input.type,
  payload: JSON.stringify(input.payload),
  clientKey: input.clientKey,
  blockId: blockIdCol,  // NEW: write to column
  createdAt: now,
});
```

**Type safety note:** The payload is already validated by Zod (`plainPayloadSchema` accepts `blockId: z.string().optional()`). The `as { blockId?: string }` cast is safe because we've checked `input.type === "plain"` and Zod has validated the payload shape. However, to avoid the `as` cast, the builder should extract blockId from the Zod-parsed result using a type narrowing helper.

#### 3.3 Thread detail response: include blockId on messages

**File:** `packages/server/src/routes/threads.ts`

The `rowToMessage` function (line 147) converts DB rows to the `Message` type from `@hyperidle/shared`. Currently it reads `type` and `payload` from the row. The `blockId` column is NOT part of the shared `Message` type -- it lives in the payload.

**No change needed to `rowToMessage`:** The blockId is already in the payload JSON, which is already returned to clients. The new column is for server-side querying, not for a new wire field. Clients continue to read blockId from the parsed payload.

However, for the block-scoped thread view (AC-5), we need a query parameter.

#### 3.4 Block-scoped thread query

**File:** `packages/server/src/routes/threads.ts`

Add an optional `block_id` query parameter to `GET /api/threads/:id` that filters messages to only those anchored to a specific block.

**Schema change in `packages/server/src/routes/threads-schema.ts`:**

No new schema needed -- the `block_id` is a simple query parameter on an existing endpoint. It will be validated inline.

**Route change in `GET /api/threads/:id` (~line 283):**

```typescript
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const blockIdFilter = c.req.query("block_id");  // NEW: optional filter

  const [row] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  if (!row) { /* 404 */ }

  // Build message query with optional block_id filter
  const conditions = [eq(messages.threadId, id)];
  if (blockIdFilter) {
    conditions.push(eq(messages.blockId, blockIdFilter));
  }

  const messageRows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id));

  // ... rest unchanged
});
```

**Wire format:** The response shape is unchanged -- same `{ thread, messages, headMessageId, ... }` envelope. The `block_id` query param only narrows the message set.

---

### 4. Client-Side Changes

#### 4.1 Anchor-lost detection (render-time derivation)

**Concept:** At render time, compare each message's `blockId` against the current `deriveBlocks()` output. If the blockId exists on a message but is NOT in the set of derived block IDs, the message is "anchor-lost."

**Where it happens:** `KnowledgeBody.tsx` and the equivalent BetPitch body renderer. The orphan detection logic already exists at `KnowledgeBody.tsx:98` -- it computes `orphanMessages` as messages whose blockId does not match any rendered block. T5 extends this to add the visual indicator.

**Implementation approach:**

The existing `AnchoredMessages` component (line 59) renders messages below their anchor block. For orphan messages (caught at line 142), they currently render identically -- no visual distinction.

T5 adds an `anchorLost` boolean prop to `AnchoredMessages`:

```typescript
function AnchoredMessages({
  messages,
  anchorLost = false,
}: {
  messages: ReadonlyArray<Message>;
  anchorLost?: boolean;
}): JSX.Element | null {
  if (messages.length === 0) return null;
  return (
    <div data-testid="anchored-messages" className="flex flex-col gap-1 mt-1">
      {anchorLost && (
        <span
          data-testid="anchor-lost-indicator"
          className="text-xs text-[var(--text-lo)] italic"
        >
          anchor lost
        </span>
      )}
      {messages.map((msg) => { /* unchanged */ })}
    </div>
  );
}
```

**Indicator design:**

| Property | Value | Rationale |
|---|---|---|
| Text | "anchor lost" | Honest: does not distinguish deleted vs edited (AC-3). Lowercase, no icon. |
| Color | `var(--text-lo)` | Low-emphasis secondary text. Not a danger/error state -- the message still exists. |
| Style | Italic | Visually distinct from message text without adding color weight. |
| Position | Above the orphan messages block | Groups the indicator with the messages it describes. |
| data-testid | `anchor-lost-indicator` | Testable. |

**Why NOT red/danger:** AC-3 says the indicator is "honest" -- block changed or deleted, same signal. This is informational, not an error. Using `--text-lo` + italic keeps it subordinate to message content. Using `--danger` (red) would imply something is broken that needs fixing.

#### 4.2 Where anchor-lost renders

**In `KnowledgeBody.tsx`:**

The catch-all `<AnchoredMessages messages={orphanMessages} />` at line 143 gets `anchorLost={true}`:

```typescript
<AnchoredMessages messages={orphanMessages} anchorLost />
```

Messages still anchored to existing blocks render normally (no indicator).

**In `WorkBet.tsx` (BetPitch rendering):**

Same pattern. The WorkBet page has identical block-body rendering with `messagesByBlockId`. Apply the same `anchorLost` prop to orphan messages.

#### 4.3 Block-scoped thread view (AC-5)

**Concept:** When the user clicks "Discuss" on a specific block, the thread section can filter to show only messages for that block.

**Implementation approach: Component state, not query param.**

The block-scoped filter is a UI-level concern. The existing `prefill` prop on `HostThreadSection` already carries the `blockId` when a user clicks "Discuss." We extend this to also filter the displayed messages.

**Option A: Client-side filter (chosen)**

- `HostThreadSection` receives all messages (existing behavior).
- When `prefill.blockId` is set, the component filters `messages` to only show those with a matching blockId in their payload.
- A "Show all messages" toggle exits the filter.
- Cost: No API change. All messages are already fetched. Simple JS filter.
- Trade-off: If a thread has 10,000 messages, we fetch all and filter client-side. At current expected volumes (tens of messages per thread), this is negligible.

**Option B: Server-side filter (deferred)**

- Uses the new `GET /api/threads/:id?block_id=X` endpoint.
- Requires `useHostThread` to accept a blockId param and refetch when it changes.
- Cost: API round-trip on every filter toggle. More complex hook wiring.
- When needed: If threads grow to hundreds of messages, the server filter becomes valuable. The endpoint is built in section 3.4 regardless -- it can be wired later.

**Decision: Option A for now.** Build the server endpoint (section 3.4) for future use, but wire the client to filter locally. This keeps the implementation simple and avoids refetch latency on filter toggle.

**HostThreadSection changes:**

```typescript
// New prop:
filterBlockId?: string;

// In render, filter messages:
const displayMessages = filterBlockId
  ? messages.filter((msg) => {
      if (msg.type !== "plain") return false;
      if (isRedactedPayload(msg.payload)) return false;
      return (msg.payload as PlainPayloadWithBlockId).blockId === filterBlockId;
    })
  : messages;
```

**Page-level wiring (KnowledgeDetail.tsx):**

When `threadPrefill` is set (user clicked "Discuss" on a block), pass `filterBlockId={threadPrefill.blockId}` to `HostThreadSection`. Add a "Show all" toggle in the HostThreadSection UI when filtering is active.

---

### 5. File Change List (Implementation Order)

| # | File | Change | Layer |
|---|---|---|---|
| 1 | `packages/db/src/schema.ts` | Add `blockId` column + index to `messages` table | DB |
| 2 | `packages/db/drizzle/0020_T5_block_id_column.sql` | Migration: ADD COLUMN + backfill from JSON payload | DB |
| 3 | `packages/server/src/routes/threads.ts` | Dual-write blockId on message insert (both endpoints); block_id query filter on GET /:id | Server |
| 4 | `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Add `anchorLost` prop to `AnchoredMessages`; pass `anchorLost={true}` for orphan messages | Web |
| 5 | `packages/web/src/pages/WorkBet.tsx` | Same anchor-lost indicator pattern for bet pitch orphan messages | Web |
| 6 | `packages/web/src/shell/HostThreadSection.tsx` | Add `filterBlockId` prop; filter displayed messages; "Show all" toggle | Web |
| 7 | `packages/web/src/pages/KnowledgeDetail.tsx` | Wire `filterBlockId={threadPrefill?.blockId}` to HostThreadSection | Web |

**Test files (parallel with implementation):**

| # | File | Tests |
|---|---|---|
| T1 | `packages/server/src/routes/__tests__/threads.blockId.test.ts` | Message creation writes blockId to column; GET with block_id filter returns subset; backfill correctness |
| T2 | `packages/web/src/pages/knowledge/__tests__/KnowledgeBody.anchorLost.test.tsx` | Orphan messages show "anchor lost" indicator; anchored messages do not |
| T3 | `packages/web/src/shell/__tests__/HostThreadSection.filter.test.tsx` | Block-scoped filter shows only matching messages; "Show all" toggle works |
| T4 | E2E: `e2e/block-discussion.spec.ts` | Full flow: post block-anchored message, verify blockId persisted, edit body, verify anchor-lost indicator appears |

---

### 6. Task Breakdown (Ordered)

#### Phase 1: Schema + Migration

**Task 1.1: Add blockId column to schema**

- Edit `packages/db/src/schema.ts`: add `blockId: text("block_id")` to messages table, add index.
- Run `npm run db:generate` to produce migration SQL.
- Verify the generated migration matches expected shape.
- If drizzle-kit generates a differently-named file, rename to `0020_T5_block_id_column.sql`.

**Task 1.2: Add backfill SQL to migration**

- Append the `UPDATE messages SET block_id = ...` backfill to the migration file.
- Run `npm run db:migrate` to verify the migration applies cleanly.

#### Phase 2: Server-side dual-write + query

**Task 2.1: Dual-write blockId on message insert**

- Edit `packages/server/src/routes/threads.ts`:
  - In `POST /api/threads` handler (~line 362): extract blockId from plain payload, pass to `tx.insert(messages).values({ ..., blockId })`.
  - In `POST /api/threads/:id/messages` handler (~line 524): same extraction and dual-write.
- Write test: create a message with blockId, query the DB row directly, assert `block_id` column is populated.

**Task 2.2: Block-scoped message query**

- Edit `packages/server/src/routes/threads.ts`:
  - In `GET /api/threads/:id` handler (~line 283): read optional `block_id` query param, add `eq(messages.blockId, blockIdFilter)` to WHERE clause when present.
- Write test: create thread with 3 messages (2 with blockId "abc", 1 without), GET with `?block_id=abc`, assert only 2 returned.

#### Phase 3: Client-side anchor-lost indicator

**Task 3.1: Anchor-lost indicator in KnowledgeBody**

- Edit `packages/web/src/pages/knowledge/KnowledgeBody.tsx`:
  - Add `anchorLost?: boolean` prop to `AnchoredMessages`.
  - Render `<span data-testid="anchor-lost-indicator">anchor lost</span>` when `anchorLost={true}`.
  - Pass `anchorLost` to the catch-all orphan messages at line 143.
- Write test: render KnowledgeBody with a messagesByBlockId entry whose blockId does not match any derived block, assert "anchor lost" text appears.

**Task 3.2: Anchor-lost indicator in WorkBet**

- Apply same pattern in `packages/web/src/pages/WorkBet.tsx` for bet pitch orphan messages.
- Write test: same pattern as 3.1 but for bet pitch context.

#### Phase 4: Block-scoped thread view

**Task 4.1: HostThreadSection filter**

- Edit `packages/web/src/shell/HostThreadSection.tsx`:
  - Add `filterBlockId?: string` prop.
  - When set, filter displayed messages to only those with matching blockId in payload.
  - Render a "Show all messages" link/button when filter is active.
- Write test: render HostThreadSection with 5 messages (2 for block A, 1 for block B, 2 unanchored), set filterBlockId to A, assert only 2 messages shown plus "Show all" toggle.

**Task 4.2: Wire filter from KnowledgeDetail**

- Edit `packages/web/src/pages/KnowledgeDetail.tsx`:
  - Pass `filterBlockId={threadPrefill?.blockId}` to HostThreadSection.
- Write test: simulate "Discuss" click on a block, verify HostThreadSection receives the filterBlockId.

#### Phase 5: E2E test

**Task 5.1: Block discussion E2E**

- Write Playwright E2E test covering the full AC scenario:
  1. Navigate to a knowledge item with blocks.
  2. Click "Discuss" on a block, post a message.
  3. Verify the message appears with correct block association.
  4. Edit the knowledge item body (changing the paragraph).
  5. Verify the "anchor lost" indicator appears on the previously-anchored message.
  6. Verify the block-scoped filter shows only the relevant messages.

---

### 7. AC Mapping

| AC | Implementation | Verification |
|---|---|---|
| 1. blockId in structured queryable field | `block_id` column on messages table + dual-write | Unit test: insert message, assert column value |
| 2. "anchor lost" when blockId no longer resolves | Render-time comparison of message.blockId vs deriveBlocks() output | Component test: orphan messages show indicator |
| 3. "anchor lost" does not distinguish deleted vs edited | Single "anchor lost" text, no conditional logic | Visual inspection + test: same indicator for both cases |
| 4. Anchored messages outlive their block | No delete cascade, no cleanup job | Test: messages remain after body edit removes block |
| 5. Block-scoped thread view | filterBlockId prop on HostThreadSection | Component test: filter shows subset |

---

### 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backfill fails on malformed JSON payload | Low | Medium (blocks migration) | Wrap in `DO $$ ... EXCEPTION` block if needed; Zod validation on write path prevents malformed payloads |
| drizzle-kit generates unexpected migration shape | Low | Low (cosmetic) | Verify generated SQL, adjust manually if needed |
| WorkBet.tsx path differs from KnowledgeBody | Medium | Low | Read WorkBet.tsx thoroughly before implementing; the pattern should be identical |
| Thread with many messages makes client-side filter slow | Low at current scale | Low | Server-side filter endpoint is built regardless; can be wired later |

---

### 9. What This Does NOT Change

- **Block primitive**: Blocks remain derived from GFM. No block persistence.
- **Thread primitive**: Threads still attach to one host. blockId is message-level.
- **Message types**: Still plain/review/questionnaire/verdict. No new type.
- **PlainPayloadWithBlockId type**: Unchanged. The payload shape is preserved.
- **InlineRef / Block Reference (T4)**: Unrelated. Block refs are cross-entity; block anchors are in-host.
- **deriveBlocks()**: Unchanged. Still pure markdown-to-blocks.
- **Component budget**: No new custom components. AnchoredMessages is a local helper function, not a design-system component.
