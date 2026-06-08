# AD1 — Wire Review Routing to Humans: Architecture Plan

## Summary

Two integration points need to call `resolveReviewRecipients()` and add returned human IDs to thread participants when creating review items. Additionally, the `GET /api/threads` endpoint's `participant_id` query parameter must be validated against the authenticated user to close an IDOR vulnerability.

---

## 1. Cross-Package Dependency Resolution

**Problem:** `resolveReviewRecipients()` lives in `packages/server/src/services/org-routing.ts` but `session-review-creator.ts` lives in `packages/fabric/`. Fabric cannot import from server (no such dependency edge, and adding one would create a cycle since server depends on fabric).

**Decision: Move `org-routing.ts` to fabric.**

Rationale:
- The function depends only on `@hyperidle/db` and `drizzle-orm` — both already fabric dependencies.
- It is a strategy-layer concern (routing reviews to humans based on org structure).
- No non-test code in server currently imports it. Only `packages/server/src/__tests__/P2-fallback-routing.test.ts` imports it.
- After the move, fabric exports it from `index.ts`. Server tests import from `@hyperidle/fabric`. `create-item.ts` (in server) imports from `@hyperidle/fabric` as well.

**Alternative considered (inject via bootstrap context):** Same pattern as `readAlertPreferences`. Rejected because it adds indirection for a function that has zero server-specific dependencies. The function naturally belongs in fabric.

**Files changed:**
- DELETE: `packages/server/src/services/org-routing.ts`
- CREATE: `packages/fabric/src/services/org-routing.ts` (identical content)
- EDIT: `packages/fabric/src/index.ts` — add export line
- EDIT: `packages/server/src/__tests__/P2-fallback-routing.test.ts` — change import path from `"../services/org-routing.js"` to `"@hyperidle/fabric"`

---

## 2. Call Site 1: `create-item.ts` (line 70-78)

**File:** `packages/server/src/skill-tools/create-item.ts`

**Current behavior (line 70-78):** When no `threadId` is provided, creates a new thread with `participants: JSON.stringify([ctx.agentId])` — only the agent.

**Required behavior:** After thread creation (or when using existing thread), resolve human recipients and add them to the thread participants. The routing context is built from the agent's user row (userId, role, teamId from users table).

**Implementation:**

```typescript
import { resolveReviewRecipients, type ReviewRoutingContext } from "@hyperidle/fabric";
```

After the thread creation block (after line 78), and before item insertion:

1. Look up the agent's user row to get `role` and `teamId` for the routing context.
2. Call `resolveReviewRecipients(ctx.db, routingContext)`.
3. Merge returned human IDs into the thread's participants array.
4. Update the thread row's participants column with the merged, sorted, deduplicated array.

**Key detail — existing thread case:** When `threadId` is provided (line 61-65), the thread already exists. We still need to add human recipients as participants to ensure they see the review. Query the existing participants, merge, update if changed.

**Routing context construction:**
```typescript
// Look up the agent user row for role/teamId
const [agentUser] = await ctx.db.select().from(users).where(eq(users.id, ctx.agentId)).limit(1);
const routingContext: ReviewRoutingContext = {
  userId: ctx.agentId,
  agentRole: agentUser?.role ?? undefined,
  teamId: agentUser?.teamId ?? undefined,
};
```

**Participant merge logic:**
```typescript
const humanRecipients = await resolveReviewRecipients(ctx.db, routingContext);
const currentParticipants: string[] = /* parse from thread row */;
const merged = [...new Set([...currentParticipants, ...humanRecipients])].sort();
// Update thread participants if changed
await ctx.db.update(threads).set({ participants: JSON.stringify(merged) }).where(eq(threads.id, threadId));
```

**Scope gate:** Only invoke routing when the item being created is a review-type (`kind === "review"` or `verb === "review"` or `kind === "escalation"`). Non-review items (knowledge, work, chat) do not need human routing. This keeps the function's cost bounded and matches the workpackage's stated scope: "When an agent creates a review item."

**Required imports added to create-item.ts:**
- `users` from `@hyperidle/db`
- `resolveReviewRecipients`, `type ReviewRoutingContext` from `@hyperidle/fabric`
- `eq` already imported from `drizzle-orm`

---

## 3. Call Site 2: `session-review-creator.ts` (line 44-62)

**File:** `packages/fabric/src/services/session-review-creator.ts`

**Current behavior (line 47-58):** Creates a thread with `participants: JSON.stringify([session.agentId])` — only the agent. Or uses existing thread (line 44: `task.threadId`).

**Required behavior:** Same as call site 1 — resolve human recipients and merge into participants.

**Implementation:** Since this file is in fabric (same package as the moved `org-routing.ts`), it imports directly:

```typescript
import { resolveReviewRecipients } from "./org-routing.js";
```

After determining/creating the thread (after the if/else block ending at line 62):

1. Look up the agent user row (already have `session.agentId`).
2. Build routing context. Task row has `teamId` (from schema: `tasks.teamId`). Agent user row has `role`.
3. Call `resolveReviewRecipients(db, routingContext)`.
4. Merge human IDs into the thread participants.
5. Update the thread row.

**For the newly-created-thread path (line 47-58):** Instead of writing `[session.agentId]` and then immediately updating, construct the full participants array before the insert:

```typescript
const routingContext: ReviewRoutingContext = {
  userId: session.agentId,
  agentRole: agentUser?.role ?? undefined,
  teamId: task.teamId ?? undefined,
};
const humanRecipients = await resolveReviewRecipients(db, routingContext);
const participants = [...new Set([session.agentId, ...humanRecipients])].sort();

await db.insert(threads).values({
  ...
  participants: JSON.stringify(participants),
  ...
});
```

**For the existing-thread path:** Read current participants, merge, update.

**Required imports added:**
- `users` from `@hyperidle/db`
- `import { resolveReviewRecipients } from "./org-routing.js"`
- `import type { ReviewRoutingContext } from "./org-routing.js"`

---

## 4. IDOR Fix: `GET /api/threads?participant_id=X`

**File:** `packages/server/src/routes/threads.ts` (line 200-252)

**Vulnerability:** The `participant_id` query parameter is not validated against `c.get("userId")`. Any authenticated user can query another user's threads by passing their ID.

**Fix location:** After query param validation succeeds and before executing the database query. Specifically at line 213 (after the "Missing scope" check), when the `participant_id` branch is entered.

**Implementation:**

```typescript
// IDOR fix: validate participant_id matches authenticated user
if (q.participant_id && q.participant_id !== c.get("userId")) {
  const e = err("forbidden", "Cannot query threads for another user", 403);
  return c.json(e.body, e.status);
}
```

**Constraint — local-mode single-founder:** In local mode, the auth middleware resolves `userId` from the first human user row (or fallback "u-founder"). The `participant_id` passed by the frontend must match this resolved ID. Since the frontend obtains its own userId from the auth context (or a `/me` endpoint), it always passes the correct value. No special-casing needed — the check naturally works in both local and shared mode.

**Edge case — agents querying threads:** Agents authenticate via the agent harness (X-API-Key + X-Identity header). If an agent queries `participant_id=<its-own-id>`, the auth middleware sets `userId` from the X-Identity header fallback path... Actually, reviewing `readSenderId` vs the auth middleware: the auth middleware sets `userId` to the resolved human user (line 228-229). The X-Identity header is only used within the threads route's `readSenderId` for message attribution, NOT for the auth context `userId`.

This means: agents using X-API-Key auth always have `userId = <first-human-user>`. They would need to query `participant_id=<first-human-user>` to pass the check. However, agents don't typically query the threads list endpoint — they use the skill tools. If agent thread-listing is needed in future, it would go through a different auth path or a dedicated agent endpoint.

**For now:** The IDOR fix applies unconditionally. The `participant_id` must equal the authenticated userId. This is correct for the human-facing API.

---

## 5. Test Plan

### 5.1 create-item routing test

**File:** `packages/server/src/skill-tools/__tests__/create-item.test.ts` (extend existing)

New test cases:
- When `create_item` is called with `kind: "review"` and no `threadId`, the auto-created thread includes human recipients from org_edges as participants.
- When `create_item` is called with `kind: "review"` and an existing `threadId`, the existing thread's participants are updated to include human recipients.
- When no org_edges match, fallback adds all human users as participants.
- When `kind` is NOT review/escalation, no routing occurs (participants stay as `[agentId]`).

### 5.2 session-review-creator routing test

**File:** `packages/server/src/__tests__/session-review-creator.test.ts` (extend existing)

New test cases:
- When session ends for high-risk task and org_edges exist, thread participants include routed humans.
- When session ends and no org_edges match, thread participants include all human users (fallback).
- When task already has a thread, existing participants are preserved and humans are added.

### 5.3 IDOR fix test

**File:** `packages/server/src/routes/__tests__/threads.routes.test.ts` (extend existing) or new dedicated file.

New test cases:
- `GET /api/threads?participant_id=<own-id>` returns 200 with threads.
- `GET /api/threads?participant_id=<other-id>` returns 403 with appropriate error message.
- When no `participant_id` is provided (using `host_kind` scope), no 403 (the check only applies to participant_id queries).

### 5.4 P2-fallback-routing.test.ts import fix

Update import from `"../services/org-routing.js"` to `"@hyperidle/fabric"`.

---

## 6. Ordered Task List

| # | Task | File(s) | Depends on |
|---|------|---------|-----------|
| 1 | Move `org-routing.ts` from server to fabric | `packages/fabric/src/services/org-routing.ts` (create), `packages/fabric/src/index.ts` (export), `packages/server/src/services/org-routing.ts` (delete) | — |
| 2 | Fix import in P2-fallback-routing test | `packages/server/src/__tests__/P2-fallback-routing.test.ts` | 1 |
| 3 | Write failing tests for IDOR fix | `packages/server/src/routes/__tests__/threads.routes.test.ts` | — |
| 4 | Implement IDOR fix | `packages/server/src/routes/threads.ts` | 3 |
| 5 | Write failing tests for create-item routing | `packages/server/src/skill-tools/__tests__/create-item.test.ts` | 1 |
| 6 | Implement routing in create-item.ts | `packages/server/src/skill-tools/create-item.ts` | 1, 5 |
| 7 | Write failing tests for session-review-creator routing | `packages/server/src/__tests__/session-review-creator.test.ts` | 1 |
| 8 | Implement routing in session-review-creator.ts | `packages/fabric/src/services/session-review-creator.ts` | 1, 7 |
| 9 | Run full verify (`npm run check && npm run lint && npm run test`) | — | All |

---

## 7. Risks and Constraints

1. **Performance:** `resolveReviewRecipients` issues up to 3 DB queries + 1 fallback query. For `create-item` (called during agent tool use) this is acceptable — it's not a hot path. For `session-review-creator` (event handler), same — fires once per session end.

2. **Thread participants column update race:** If two concurrent processes update the same thread's participants, the last write wins (no CAS). Acceptable: review creation is not a high-concurrency path, and the worst case is a human participant being temporarily absent from one thread (corrected on next review item creation).

3. **Sorted + deduplicated invariant:** The spec requires "Thread participant arrays must remain sorted and deduplicated." Both call sites must use `[...new Set([...existing, ...new])].sort()`.

4. **Scope gate for create-item:** Only route for review-type items. The condition is: `kind === "review" || kind === "escalation"`. Other item kinds (knowledge, work, chat, etc.) are informational and don't need human routing — they go to the attention feed, not a review queue.
