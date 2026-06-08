# AD7 — Search Backend: Architecture Plan

## 1. Summary

Build `GET /api/search?q=<query>` so the existing `useGlobalSearch` hook and `GlobalSearchPanel` component can find conversations (threads), bets, and knowledge items. The frontend is fully built and calls `GET /api/search?q=...` with 150ms debounce. The backend does not exist (404). This workpackage fills the gap.

---

## 2. Design Decisions

### 2.1 Three separate queries vs UNION

**Decision: Three separate queries.**

- UNION across three structurally different tables (threads+messages, bets+teams, knowledgeItems+knowledgeStrategyFabric) would require hand-written SQL with `sql` tagged template literals — not Drizzle builder queries. Debugging is harder.
- Three queries execute sequentially in ~1-3ms each on solo-founder data volumes (hundreds of rows, not millions). Total wall time stays under 20ms.
- Separate queries produce separate typed result arrays, trivially mapped to the three response buckets. No discriminant column or post-query sorting needed.
- **Cost of the alternative:** A UNION requires casting all columns to a common shape (`text` coercion everywhere), adds a discriminant column, and loses Drizzle type safety. Gain is one round trip — saving ~0.5ms at current volumes.

### 2.2 LIKE vs FTS5/tsvector

**Decision: LIKE with `escapeLikePattern()` from the existing `like-escape.ts` utility.**

- The existing knowledge search endpoint (`GET /api/knowledge/search`) already uses this exact pattern. Reusing it keeps the codebase consistent.
- At solo-founder/small-team data volumes (< 10,000 rows per table), LIKE with pattern matching is fast enough for interactive use. PostgreSQL's LIKE on text columns scans the table but returns in single-digit milliseconds at these volumes.
- FTS5 (SQLite) or `tsvector` (PostgreSQL) would require new migration infrastructure, index maintenance, and per-dialect branching. Out of scope.
- **When to revisit:** If any table exceeds 50,000 rows or p95 latency exceeds 150ms, add `pg_trgm` GIN indexes — they accelerate `LIKE '%pattern%'` without changing the query syntax.

### 2.3 Thread title derivation

**Decision: First plain-message text, truncated to 80 chars.**

Threads have no `title` column. The frontend expects a `title: string` in the conversation result. Options:

| Strategy | Pros | Cons |
|---|---|---|
| **A: First message text** | Always available; no joins beyond messages | May be long or unhelpful |
| **B: Host entity title (bet, task, artifact)** | Semantically meaningful | Requires joining bets/tasks/artifacts by hostKind+hostId; review threads on tasks have task titles but chat threads on nothing have no host |
| **C: Derive from hostKind + hostId** | Simple concatenation | "review:uuid" is not user-friendly |

**Choice: A — first plain-message text, truncated.** Rationale: All threads have at least one message (created atomically with the thread). The first message's payload text is the most natural "what is this thread about" signal. Truncation to 80 chars matches the snippet pattern already used in the artifact-thread-summary endpoint (bets.ts line 1186).

Implementation: A correlated subquery on `messages` fetches the first message payload for each matched thread, ordered by `createdAt ASC LIMIT 1`. The text is extracted from the JSON `payload.text` field in application code (not SQL) for safety with malformed payloads.

### 2.4 Snippet generation for conversations

The conversation result needs a `snippet: string`. This is the same text extraction from the *latest* message's `payload.text`, truncated to 120 chars. If the payload is not parseable or has no `.text`, the snippet is `"..."`.

### 2.5 Auth boundary for threads

**Decision: JSON LIKE probe + application-layer participant check (same pattern as `GET /api/threads`).**

The `threads.participants` column stores a JSON array of user IDs as text. The existing thread list endpoint (threads.ts line 243) uses:
1. SQL `WHERE participants LIKE '%"<userId>"%' ESCAPE '\\'` to pre-filter
2. JS `JSON.parse(row.participants).includes(userId)` to verify membership

Search reuses this exact pattern. Threads where the current user is not a participant are excluded from results.

### 2.6 Knowledge item visibility

**Decision: Mirror the `GET /api/knowledge` filter.**

Knowledge items with `scopeKind = 'user'` are private. The existing knowledge list endpoint filters: `WHERE scope_kind != 'user' OR updated_by = :userId`. Search applies the same predicate.

### 2.7 Result limit

**Decision: Cap each bucket at 5 results.** The search panel is a quick-jump tool, not a full listing. Five results per category (15 total max) keeps the response small and the panel scannable. The `LIMIT 5` is applied in SQL.

### 2.8 Query length cap

**Decision: 1-200 chars.** Matches the I2 security pattern from knowledge search (knowledge.ts line 171). Rejects empty queries with 400 (AC-4: empty queries return no results). The existing knowledge search caps at 500 but search hits three tables — 200 is sufficient for interactive Cmd+K queries.

---

## 3. File Inventory

### New Files

| File | Purpose |
|---|---|
| `packages/server/src/routes/search.ts` | `createSearchRoutes(db, eventBus)` factory — single `GET /` route |
| `packages/server/src/__tests__/search.integration.test.ts` | Integration tests for `GET /api/search` |

### Modified Files

| File | Change |
|---|---|
| `packages/server/src/app.ts` | Add `import { createSearchRoutes }` + `api.route("/search", createSearchRoutes(options.db, eventBus))` |

### No Changes Required

| File | Why |
|---|---|
| `packages/web/src/hooks/useGlobalSearch.ts` | Already calls `GET /api/search?q=...` — no changes needed |
| `packages/web/src/components/GlobalSearchPanel.tsx` | Already renders results — no changes needed |
| `packages/db/src/schema.ts` | No schema changes — LIKE queries work on existing columns |

---

## 4. Type Signatures

### Route factory

```typescript
// packages/server/src/routes/search.ts
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";

export function createSearchRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv>
```

The `eventBus` parameter follows the route factory convention (every route factory takes `(db, eventBus)`) even though search does not emit events. This keeps the signature uniform and avoids a special case in app.ts.

### Zod query validation

```typescript
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
```

### Response shape (matching useGlobalSearch expectations)

```typescript
interface ConversationSearchResult {
  id: string;          // thread.id
  title: string;       // first message payload.text, truncated 80 chars
  snippet: string;     // latest message payload.text, truncated 120 chars
  timestamp: string;   // thread.lastActiveAt
  kind: "review" | "chat";  // thread.hostKind
}

interface WorkSearchResult {
  id: string;          // bet.id
  title: string;       // deriveTitle(bet.description, bet.id)
  team: string;        // teams.name via join
  status: BetStatus;   // bet.status
  appetite: string;    // formatted from costAppetiteMinor/Currency, or "—"
}

interface KnowledgeSearchResult {
  id: string;                // knowledgeItems.id
  title: string;             // knowledgeItems.title
  layer: string;             // knowledgeStrategyFabric.layer ?? "L0"
  kind: string;              // knowledgeStrategyFabric.kind ?? "pattern"
  status: string;            // knowledgeItems.status
  timestamp: string;         // knowledgeItems.updatedAt
}

// Response body
interface SearchResponse {
  conversations: ConversationSearchResult[];
  work: WorkSearchResult[];
  knowledge: KnowledgeSearchResult[];
}
```

---

## 5. SQL Query Strategy

### 5.1 Conversations (threads + messages)

```
Step 1: Find threads where the user is a participant AND at least one message
        matches the query.

SELECT t.*, 
  (SELECT m.payload FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at ASC LIMIT 1) AS first_msg_payload,
  (SELECT m.payload FROM messages m WHERE m.thread_id = t.id AND m.type = 'plain' AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS latest_msg_payload
FROM threads t
WHERE t.participants LIKE '%"<userId>"%' ESCAPE '\\'
  AND EXISTS (
    SELECT 1 FROM messages m 
    WHERE m.thread_id = t.id 
      AND m.deleted_at IS NULL
      AND (m.payload LIKE '%<pattern>%' ESCAPE '\\')
  )
ORDER BY t.last_active_at DESC
LIMIT 5
```

Step 2 (application code): For each row, verify `JSON.parse(participants).includes(userId)`. Extract text from first/latest message payload JSON. Truncate. Map `hostKind` to `kind`.

**Auth boundary:** The `participants LIKE` pre-filter + JS verification ensures only threads the user participates in are returned. The `EXISTS` subquery on messages means the query string matched message content. Message content from non-participant threads is never exposed because the outer WHERE filters to participant-only threads.

**hostKind mapping:** `useGlobalSearch` expects `kind: "review" | "chat"`. Thread `hostKind` values in the database are these same strings (review, chat). Pass through directly.

### 5.2 Work (bets + teams)

```
SELECT b.*, t.name AS team_name
FROM bets b
LEFT JOIN teams t ON t.id = b.team_id
WHERE b.description LIKE '%<pattern>%' ESCAPE '\\'
   OR b.hypothesis LIKE '%<pattern>%' ESCAPE '\\'
   OR b.done_condition LIKE '%<pattern>%' ESCAPE '\\'
ORDER BY b.created_at DESC
LIMIT 5
```

Application code: `deriveTitle(bet.description, bet.id)` for title. Format appetite from `costAppetiteMinor`/`costAppetiteCurrency` or `"—"`.

No auth boundary needed. All bets are visible to all authenticated users (no per-user scoping exists on bets).

### 5.3 Knowledge (knowledgeItems + knowledgeStrategyFabric)

```
SELECT ki.*, ksf.layer, ksf.kind
FROM knowledge_items ki
LEFT JOIN knowledge_strategy_fabric ksf ON ksf.knowledge_item_id = ki.id
WHERE (ki.scope_kind != 'user' OR ki.updated_by = :userId)
  AND (
    ki.title LIKE '%<pattern>%' ESCAPE '\\'
    OR ki.body LIKE '%<pattern>%' ESCAPE '\\'
    OR ki.topic LIKE '%<pattern>%' ESCAPE '\\'
  )
ORDER BY ki.updated_at DESC
LIMIT 5
```

Application code: Map `ksf.layer` to response (default `"L0"` if null). Map `ksf.kind` to response (default `"pattern"` if null).

Auth boundary: The `scope_kind != 'user' OR updated_by = :userId` predicate mirrors `GET /api/knowledge`.

---

## 6. Result Mapping

### 6.1 Conversation result mapping

```typescript
function extractPayloadText(payloadJson: string | null, maxLen: number): string {
  if (!payloadJson) return "...";
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const text = payload.text;
    if (typeof text === "string" && text.length > 0) {
      return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
    }
  } catch { /* ignore malformed */ }
  return "...";
}

// For each matched thread row:
{
  id: row.id,
  title: extractPayloadText(row.firstMsgPayload, 80),
  snippet: extractPayloadText(row.latestMsgPayload, 120),
  timestamp: row.lastActiveAt,
  kind: row.hostKind as "review" | "chat",
}
```

### 6.2 Work result mapping

```typescript
// For each matched bet row:
{
  id: row.id,
  title: deriveTitle(row.description, row.id),
  team: row.teamName ?? row.teamId,
  status: row.status as BetStatus,
  appetite: row.costAppetiteMinor != null && row.costAppetiteCurrency != null
    ? `${row.costAppetiteMinor} ${row.costAppetiteCurrency}`
    : "—",
}
```

### 6.3 Knowledge result mapping

```typescript
// For each matched knowledge item row:
{
  id: row.id,
  title: row.title,
  layer: row.layer ?? "L0",
  kind: row.kind ?? "pattern",
  status: row.status,
  timestamp: row.updatedAt,
}
```

---

## 7. Error Handling

| Condition | HTTP Status | Response |
|---|---|---|
| Missing `q` parameter | 400 | `{ error: "Query parameter 'q' is required (1-200 chars)", code: "VALIDATION_ERROR" }` |
| `q` too long (> 200 chars) | 400 | Same as above |
| Empty `q` (whitespace only) | 400 | Same as above (AC-4: empty queries produce no results) |
| Internal error | 500 | Propagates through `errorHandler` middleware |

No 404 — the route always returns a response. Even if zero results match, the response is `{ conversations: [], work: [], knowledge: [] }` with 200.

---

## 8. Registration in app.ts

Add inside the `if (options?.db)` block, alongside other route registrations:

```typescript
import { createSearchRoutes } from "./routes/search.js";
// ...
api.route("/search", createSearchRoutes(options.db, eventBus));
```

Position: After the existing domain routes, before the status route. The exact line does not matter — all routes are under the auth middleware, and there is no route ordering conflict with `/search`.

---

## 9. Performance Budget

At solo-founder volumes (< 1,000 rows per table):
- Three LIKE queries: ~1-3ms each = 3-9ms total
- JSON parsing + mapping: ~1ms
- Total server-side: ~5-10ms
- Network round trip (localhost): ~1ms

Well within the 300ms AC-3 target. The 150ms debounce in `useGlobalSearch` dominates the perceived latency.

---

## 10. Acceptance Criteria Verification

| AC | How it is met |
|---|---|
| AC-1: Cmd+K search returns grouped results | `GET /api/search?q=...` returns `{ conversations, work, knowledge }` matching useGlobalSearch expectations |
| AC-2: Results navigate to correct detail page | The `id` fields in each result correspond to thread/bet/knowledgeItem IDs. The existing `onNavigate` in GlobalSearchPanel routes these correctly. No backend change needed. |
| AC-3: Results within 300ms | Three LIKE queries on small tables + 150ms debounce = well under 300ms |
| AC-4: Empty queries return no results | Zod validation rejects empty/whitespace `q` with 400. useGlobalSearch does not fire for empty query (line 280-291). |
| AC-5: "Search coming soon" no longer appears | The 404-triggered empty state in GlobalSearchPanel (line 150) only renders when the error contains "404". Once the route exists, no 404 is returned for valid queries. |

---

## 11. Ordered Task List for Builder

### Task 1: Create search route file

**File:** `packages/server/src/routes/search.ts`

1. Import `HyperIdleDb`, table schemas (`threads`, `messages`, `bets`, `teams`, `knowledgeItems`, `knowledgeStrategyFabric`), `Hono`, `z`, Drizzle operators, `escapeLikePattern`, `deriveTitle`, `HyperIdleEnv`.
2. Define `searchQuerySchema` (Zod: `z.object({ q: z.string().min(1).max(200) })`).
3. Define `extractPayloadText(payloadJson: string | null, maxLen: number): string` helper.
4. Define `createSearchRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv>`.
5. Inside: single `router.get("/", async (c) => { ... })` handler.
6. Parse and validate `c.req.query("q")` via `searchQuerySchema.safeParse({ q: rawQ?.trim() })`. Return 400 on failure.
7. Build escaped LIKE pattern: `%${escapeLikePattern(query)}%`.
8. Run three queries sequentially (conversations, work, knowledge) as described in section 5.
9. Map results as described in section 6.
10. Return `c.json({ conversations, work, knowledge })`.

### Task 2: Register in app.ts

**File:** `packages/server/src/app.ts`

1. Add import: `import { createSearchRoutes } from "./routes/search.js";`
2. Add route: `api.route("/search", createSearchRoutes(options.db, eventBus));` inside the `if (options?.db)` block.

### Task 3: Write integration tests

**File:** `packages/server/src/__tests__/search.integration.test.ts`

Using the test fixture pattern (`import { test, describe, expect } from "../test-fixtures.js"`).

Test cases:

1. **Returns 400 for missing query parameter**
   - `GET /api/search` (no `?q=`) -> 400

2. **Returns 400 for empty query**
   - `GET /api/search?q=` -> 400
   - `GET /api/search?q=%20%20` (whitespace only) -> 400

3. **Returns empty results for non-matching query**
   - Seed a thread, bet, knowledge item
   - `GET /api/search?q=xyznonexistent` -> 200, all arrays empty

4. **Returns matching conversations**
   - Seed a thread with the test user as participant, seed a message with payload `{ text: "deploy pipeline review" }`
   - `GET /api/search?q=deploy` -> 200, `conversations` has 1 result with correct id, title, snippet, timestamp, kind

5. **Excludes conversations where user is not a participant**
   - Seed a thread with participants `["other-user"]`, seed a message matching the query
   - `GET /api/search?q=...` -> 200, `conversations` is empty (auth boundary)

6. **Returns matching work items (bets)**
   - Seed a team, seed a bet with description "# Build mobile app\nDescription..."
   - `GET /api/search?q=mobile` -> 200, `work` has 1 result with derived title, team name, status, appetite

7. **Returns matching knowledge items**
   - Seed a knowledge item with title "Rate Limiting Patterns", seed its fabric row with layer/kind
   - `GET /api/search?q=rate%20limiting` -> 200, `knowledge` has 1 result with correct fields

8. **Excludes user-scoped knowledge from other users**
   - Seed a knowledge item with `scopeKind: "user"`, `updatedBy: "other-user"`
   - `GET /api/search?q=...` -> 200, `knowledge` is empty

9. **Returns results across all three categories**
   - Seed matching data in all three tables
   - `GET /api/search?q=test` -> 200, all three arrays populated

10. **Limits results to 5 per category**
    - Seed 7 matching bets
    - `GET /api/search?q=...` -> 200, `work` has exactly 5 results

11. **Escapes LIKE wildcards in query** (security)
    - Seed data that would match `%` or `_` as wildcards but not as literals
    - `GET /api/search?q=_` -> 200, no false matches

12. **Rejects overly long query** (> 200 chars)
    - `GET /api/search?q=<201-char-string>` -> 400

### Task 4: Verify

Run `npm run check && npm run lint && npm run test:integration` (targeted at search test file first), then `npm run verify` for full suite.

---

## 12. Self-Critique

**Over-engineering risk:** None detected. One route file, one registration line, standard patterns. No new abstractions, no new middleware, no new database tables.

**Missing failure modes:**
- Malformed `participants` JSON in threads could crash `JSON.parse`. Mitigated: wrap in try-catch and exclude the row (same pattern as threads.ts line 249-255).
- Malformed message `payload` JSON could crash text extraction. Mitigated: `extractPayloadText` has try-catch.
- Concurrent thread creation during search could cause a thread with no messages. Mitigated: threads are created atomically with their first message. If the first-message subquery returns null, title defaults to "...".

**Scope creep guard:** This workpackage does NOT add:
- Pagination (the panel shows max 5 per category)
- Sorting options (always recency-ordered)
- Highlighting/snippeting of matched terms in results
- Search suggestions or autocomplete
- FTS or tsvector indexes

**Thread hostKind values:** The frontend expects `kind: "review" | "chat"`. The thread hostKind in the database uses these exact values. If new hostKind values are added in the future, they would be silently dropped by the frontend's `parseConversation` validator (it checks `CONVERSATION_KINDS.has(kind)`). This is acceptable — new kinds need explicit frontend support anyway.

**knowledge layer/kind defaults:** When a knowledge item has no fabric row (possible for items created before the fabric extension), `layer` and `kind` are null. Defaulting to `"L0"` / `"pattern"` matches the useGlobalSearch parser expectations (it validates against known sets). If the default is wrong for some item, the item still appears in results — the layer/kind badge may be inaccurate but the item is findable.
