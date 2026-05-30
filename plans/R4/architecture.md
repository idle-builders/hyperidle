# R4 — Thread Identity Fix: Architecture Plan

## 1. Problem Statement

`GET /api/threads/:id` returns `{ thread, messages, headMessageId, nextMessagesCursor }` — no `identities` field. The frontend hook `useThreadDetail` (line 67) gracefully falls back to `{}` when `identities` is absent, causing `identityFor()` in `ThreadShell` to return `{ name: "Unknown" }` for every sender.

The coach endpoint (`GET /api/threads/coach`) already solves this with a `buildIdentities()` helper, but it only returns identities for two known participants (current user + CoC agent). The general thread detail endpoint must return identities for ALL message senders.

## 2. Key Insight: Agents ARE Users

There is no separate `agents` table. AI agents live in the `users` table with `kind: "ai"`. The `messages.senderId` column has a foreign key to `users.id`. Therefore, a single query against the `users` table resolves both human and agent identities.

## 3. Approach: Inline in threads.ts

**Decision:** Add a `buildThreadIdentities(db, senderIds)` function in `threads.ts`, NOT a shared utility.

**Why not extract to a shared module?**
- The coach endpoint's `buildIdentities` is specific to its two-participant pattern (hard-coded COC_AGENT_ID constant + single userId).
- The general version is a single `SELECT ... WHERE id IN (...)` query + a loop to build the map.
- Only one call site needs the general version today (`GET /api/threads/:id`).
- Extracting to a shared utility for a function with one caller is premature. If a second caller appears, extract then.

**Why not refactor the coach endpoint to share the same function?**
- The coach version hard-codes a fallback name ("You") and injects COC_AGENT_ROLE which is not in the DB. Generalizing it would make both call sites worse. Leave it alone.

## 4. Implementation

### 4.1 New function in `packages/server/src/routes/threads.ts`

```typescript
/**
 * Build the identities map for all senders in a thread.
 * Queries the users table for each unique senderId found in the messages.
 *
 * @lore R4: Unlike coach.ts buildIdentities() which hard-codes two
 * participants, this version resolves all senders dynamically. Both
 * humans and agents live in the users table (kind="human"|"ai"), so a
 * single IN query covers everyone.
 */
function buildThreadIdentities(
  db: HyperIdleDb,
  senderIds: ReadonlyArray<string>,
): Record<string, { name: string; role?: string }> {
  if (senderIds.length === 0) return {};
  const rows = db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.id, [...senderIds]))
    .all();
  const identities: Record<string, { name: string; role?: string }> = {};
  for (const row of rows) {
    identities[row.id] = {
      name: row.name,
      ...(row.role ? { role: row.role } : {}),
    };
  }
  return identities;
}
```

### 4.2 Modify `GET /api/threads/:id` handler (lines 274-299)

After fetching `messageRows`, extract unique senderIds, call `buildThreadIdentities`, and include the result in the response:

```typescript
// Extract unique sender ids from messages
const senderIds = [...new Set(messageRows.map((r) => r.senderId))];
const identities = buildThreadIdentities(db, senderIds);

return c.json({
  thread: rowToThread(row),
  messages: msgsDesc,
  headMessageId: head.headMessageId,
  nextMessagesCursor: null,
  identities,
});
```

### 4.3 No frontend changes required

- `useThreadDetail.ts` line 67 already decodes `identities` from the response: `const identitiesRaw = isObject(value.identities) ? value.identities : {};`
- `ThreadShell` already consumes `identities` prop and calls `identityFor()`.
- The only change is that the server now provides the data the frontend already expects.

### 4.4 No schema/migration changes

The `users` table already has `id`, `name`, and `role` columns. No new tables, columns, or migrations needed.

## 5. Files Changed

| File | Change |
|------|--------|
| `packages/server/src/routes/threads.ts` | Add `buildThreadIdentities()` function; modify `GET /:id` handler to compute and return `identities` |

That's it. One file, one new function, three lines added to the handler.

## 6. Query Performance

The `users` table is queried with `WHERE id IN (...)` on the primary key. This is an index scan returning at most N rows where N = number of unique senders in the thread (typically 2-5). Cost: negligible. No new indexes needed.

## 7. Edge Cases

| Case | Behavior |
|------|----------|
| Thread with zero messages | `senderIds` is empty, `buildThreadIdentities` returns `{}`. No DB query executed. |
| Sender deleted from users table | Cannot happen — `messages.senderId` has `onDelete: "restrict"` FK constraint. |
| Sender has no role | The `...(row.role ? { role: row.role } : {})` spread omits the `role` key, matching the coach pattern. |

## 8. Ordered Implementation Tasks

1. **Red phase:** Add a test in `packages/server/src/routes/__tests__/threads.routes.test.ts` that creates a thread with messages from two senders, fetches `GET /api/threads/:id`, and asserts the response includes `identities` with correct names and roles for both senders. This test will fail because the endpoint currently omits `identities`.

2. **Green phase:** Add `buildThreadIdentities()` to `threads.ts`. Modify the `GET /:id` handler to extract senderIds, call the function, and include `identities` in the response.

3. **Verify:** Run `npm run verify` (typecheck + lint + tests). The new test should pass. Existing tests should remain green since adding a field to the response is backward-compatible.

## 9. Self-Critique

- **Over-engineering risk:** None. This is one function and three lines in a handler.
- **Scope creep risk:** Low. The fix is strictly additive — no refactoring of the coach endpoint, no new shared modules, no schema changes.
- **Missing failure mode:** If a senderId in messages somehow doesn't exist in users (impossible due to FK), that sender simply won't appear in the identities map, and the frontend falls back to "Unknown" — the same behavior as today, but now only for genuinely orphaned senders rather than every sender.
- **Thread participants vs message senders:** We build identities from message senderIds, not from `thread.participants`. This is intentional — a participant who hasn't sent a message doesn't need an identity in the message stream. The `ThreadHostBanner` does use `thread.participants` for its display, but that component receives `participants` as `Array<{id, name}>` built from the same `identities` map (see ThreadShell line 251), so populating identities from senderIds covers that too — provided all participants have sent at least one message. For the banner edge case (participant who joined but never spoke), the identity falls back to "Unknown" which is acceptable and matches current behavior.
