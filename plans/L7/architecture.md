# L7 — Thread response unblocks the agent (plan)

**Status:** drafted by /architecture. Inputs: TRACK-L.md L7 (lines 238–265), `docs/design-explorations/L7/approved.md`, L1-plan §6 (Thread primitive landed).

---

## 1. Context

The verdict-commit handler in `packages/web/src/pages/ConversationsReview.tsx:107-123` is a partial stub: it `fetch`es `POST /api/threads/:id/messages` but ignores the response, swallows network errors, never surfaces failure to the user, and bypasses the page-level pending/error state machine the design contract requires (`approved.md` §3.3). The story closes that gap AND specifies the **response-as-event contract** that connects a thread response to the waiting agent — both sync (event-driven unblock) and async (next-pickup record).

**Spec calls out (line 252):** This is NOT a UI auto-advance / undo story. The architect specifies the response-as-event contract; the designer picks any optional UI affordances around responding. Any temptation to "polish the conversation flow" is rejected by `approved.md` §8.

## 2. Constraints

- **Reuse existing thread-response endpoint** (line 261). `POST /api/threads/:id/messages` already exists in `packages/server/src/routes/threads.ts:349-564`; it is the canonical commit path. No new server route.
- **Reuse existing event** `ThreadMessageAppendedEvent` (events.ts:174-182) and `ThreadResolvedEvent` (events.ts:184-190) as the unblock signal. `ResponseRecordedEvent` (events.ts:94-101) is L0 legacy — out of scope.
- **No optimistic UI** (story line 261; `approved.md` §4 bullet 1).
- **Component budget unchanged.** Prop additions on `ReviewVerdictBar` and `Composer` only; no new component (`approved.md` §2 — surface count stays 19).
- **No emojis** (story line 263, AQ-105).
- **Server identity attribution** stays `X-Identity` header (threads.ts:47-56) — out of scope to redesign.

## 3. Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "existing thread-response endpoint" | `POST /api/threads/:id/messages` (threads.ts:349) — already idempotent on `(thread_id, sender_id, client_key)`, emits `thread_message_appended` + (verdict-only) `thread_resolved` | Reuse as-is. No new route. |
| "agent harness contract" needs a sync unblock primitive | No `WaitingAgentRegistry` exists today. Sessions are advanced by the harness loop; agents read inbox via the `read_inbox` skill tool. Subscribers to `thread_message_appended` today: `ws-broadcaster` only. | Spec a thin `AgentResponseRouter` service. **Sync** = an in-process subscriber on `thread_message_appended` that, when the thread has a registered waiter (a session whose harness called the new `await_thread_response` skill tool), resolves the waiter's pending promise with the appended message. **Async** = no waiter registered → the message persists; the agent's next session picks it up via the existing `read_inbox` tool over the same thread. The same event powers both modes. |
| "response not recorded as committed when server rejects" | Page-level fetch in `ConversationsReview.tsx:107-123` swallows non-OK responses silently; never sets local "committed" flag because no such flag exists. | Plan adds the `pending`/`error` state machine described in `approved.md` §3.3, threaded through `ThreadShell` via prop additions on `ReviewVerdictBar` and `Composer`. The "committed" signal IS the refreshed thread arriving from `GET /api/threads/:id` (sync resolve = head unmounts; async = new message in stream). Failure → `error` set, no refresh, payload preserved for retry. |
| "hardcoded review fixtures on `ConversationsReview.tsx`" | `ConversationsReview.tsx` already does a real fetch (L1a refactor, lines 79-105). The fixture line at `:132` referenced in the story spec is **stale** — the file's stub is the silent-failure `onAppend` at line 107. | Plan replaces the `onAppend` stub (NOT a hardcoded fixture). The L6 inventory row this story closes is the no-op error-handling gap, not a fixture removal. Confirmed in story line 245: "the client-side function … is empty". |
| Toast root for "Response recorded" async ack (`approved.md` §3.1, OQ-3) | `bun run dev` uses DaisyUI; no global toast root mounts today. | Plan adds a `<ToastRegion>` shell mount in `packages/web/src/shell/AppShell.tsx` using a tiny portal-less stack (DaisyUI `toast` class on a fixed root div). NOT a new design-system component — Tier 3 shell wrapper, counts as 0 of 19. |

## 4. Design

### 4.1 Response-as-event contract (the load-bearing spec)

**Single canonical event:** `ThreadMessageAppendedEvent` (already emitted by `POST /api/threads/:id/messages` after the DB transaction commits). For verdict messages on a review-typed head, the existing `ThreadResolvedEvent` is the additional terminal signal.

**Two delivery modes — same event, different consumers:**

```
┌──── HTTP commit (unchanged) ────┐    ┌──── EventBus (in-process) ────┐
│ POST /api/threads/:id/messages  │───▶│ thread_message_appended       │
│ → 201 with {message, thread}    │    │ thread_resolved (if verdict)  │
└─────────────────────────────────┘    └────────────┬──────────────────┘
                                                    │
                  ┌─────────────────────────────────┴──────────────────┐
                  ▼                                                    ▼
       ┌──────── SYNC ─────────┐                       ┌──────── ASYNC ────────┐
       │ AgentResponseRouter   │                       │ no waiter registered  │
       │ has waiter for thread │                       │ → message sits in DB  │
       │ → resolves Promise<>  │                       │ → next session picks  │
       │   in harness loop     │                       │   up via read_inbox   │
       └───────────────────────┘                       └───────────────────────┘
```

**Why one event, not two:** an event named `thread_response_received` would duplicate `thread_message_appended` semantically (every appended message in a thread the agent participates in IS a potential response). The waiter registry decides what "response" means for *this* agent; the event is just `something happened in this thread`.

### 4.2 `AgentResponseRouter` service (new)

File: `packages/server/src/services/agent-response-router.ts`.

```ts
// pseudocode — not implementation
export interface ThreadWaiter {
  agentId: string;
  threadId: string;
  // Resolves with the message that unblocks the waiter.
  // The router filters: the message must be in `threadId`, the senderId
  // must NOT be the waiter's own agentId (an agent never unblocks itself).
  resolve: (message: Message) => void;
  reject: (cause: Error) => void;
  // For timeout cleanup; the harness sets a default of 60s but can override.
  timeoutMs: number;
}

export class AgentResponseRouter {
  constructor(eventBus: EventBus, db: HyperIdleDb);
  // Called by `await_thread_response` skill tool. Returns a Promise that
  // resolves on the next qualifying thread_message_appended event, or
  // rejects on timeout. The waiter is removed on either path.
  waitFor(input: { agentId: string; threadId: string; timeoutMs?: number }): Promise<Message>;
  // Internal: subscribed to thread_message_appended at construction.
  // For each waiter on event.threadId where event.senderId !== waiter.agentId,
  // load the row via `messages` table and resolve(message).
  private onAppended(event: ThreadMessageAppendedEvent): void;
  // Test/teardown.
  cancelAll(reason: string): void;
}
```

**Cardinality contract:**
- One waiter per `(agentId, threadId)`. A second `waitFor` for the same pair rejects the older waiter with `"superseded"` and registers the new one. (Keeps the harness loop simple — an agent that calls `await_thread_response` again has logically retried.)
- A waiter only fires on messages whose `senderId !== agentId`. An agent's own append never unblocks itself (it would deadlock the harness — the agent waited on its own message).

**Race contract — commit ⇆ pickup:**
- The router subscribes to `thread_message_appended` synchronously (EventBus delivery is sync per `event-bus.ts:101`). The EventBus emit happens AFTER the DB transaction commits in `threads.ts:518-527`. So a waiter registered before the commit always gets the event; a waiter registered after the commit does not — for that case the harness MUST first call `read_inbox` (existing tool), then `await_thread_response` only if no qualifying message was found. This is the documented "race-free pickup" loop and gets a `@lore` comment on the new tool.

### 4.3 `await_thread_response` skill tool (new)

File: `packages/server/src/skill-tools/await-thread-response.ts`. Tool name (registry key): `await_thread_response`. Roles: every harness role EXCEPT founder (founders never run as harness agents). Description string: `"Block until a non-self message arrives in the given thread, or a timeout elapses. Returns the unblocking message."`

```ts
// Input schema (Zod)
const inputSchema = z.object({
  threadId: z.string().min(1),
  // Default 60_000 (60s) when omitted; hard cap 600_000 (10m).
  timeoutMs: z.number().int().positive().max(600_000).optional(),
});
type AwaitThreadResponseInput = z.infer<typeof inputSchema>;

// Output (success body) — concrete shape (NOT just "Message"):
// ok({
//   message: { id, threadId, senderId, type, payload, clientKey, createdAt, resolvedAt },
//   thread:  { id, hostKind, hostId, participants, resolvedAt, lastActiveAt, ... },
// })
// Both shapes mirror `rowToMessage` / `rowToThread` from threads.ts:572-604.

// Closed error-code union (returned via ToolResult.err):
//   "FORBIDDEN"      — agent is not a participant of threadId            (authz fail)
//   "NOT_FOUND"      — threadId does not exist                            (lookup fail)
//   "TIMEOUT"        — no qualifying message within timeoutMs             (waiter timeout)
//   "SUPERSEDED"     — a newer waitFor for the same (agentId,threadId) replaced this one
//   "VALIDATION"     — zod schema rejected the input
//   "INTERNAL"       — DB read or router invariant breach (caller retries)

// Behavior:
// 1. Validate via inputSchema → on failure err("VALIDATION", message).
// 2. Lookup thread by id; if missing → err("NOT_FOUND").
// 3. Authz: `participants.includes(ctx.agentId)`; else err("FORBIDDEN").
// 4. Drain check (race-safe pickup): SELECT messages WHERE thread_id = ? AND sender_id != ?
//    AND (last_seen_message_id IS NULL OR createdAt > (SELECT createdAt FROM messages
//    WHERE id = last_seen_message_id)) ORDER BY createdAt ASC LIMIT 1.
//    If hit → write cursor (see §4.4 cursor-write policy), return ok(message,thread).
// 5. Otherwise: `await ctx.router.waitFor({ agentId, threadId, timeoutMs ?? 60_000 })`.
//    On resolve → write cursor, return ok(message,thread).
//    On timeout → err("TIMEOUT", "no response within Xms"), DO NOT update cursor.
//    On supersede → err("SUPERSEDED"), DO NOT update cursor.
```

**Why a skill tool, not a generic `subscribe`:** harness adapters already speak the tool-call contract; a skill tool keeps the unblock primitive observable in the existing tool-call event stream (`tool_call_recorded`, events.ts:153) and inherits the registry's authz model.

### 4.4 Drain marker — minimal addition to the schema

File: `packages/db/src/schema.ts` (and `schema.pg.ts`).

```sql
-- SQLite (drizzle sqlite-core)
CREATE TABLE agent_thread_cursor (
  agent_id              TEXT NOT NULL,
  thread_id             TEXT NOT NULL,
  last_seen_message_id  TEXT NOT NULL,           -- the message that satisfied the wait
  last_seen_at          TEXT NOT NULL,           -- ISO 8601, set at cursor-write time
  PRIMARY KEY (agent_id, thread_id),
  FOREIGN KEY (agent_id)            REFERENCES agents(id)    ON DELETE CASCADE,
  FOREIGN KEY (thread_id)           REFERENCES threads(id)   ON DELETE CASCADE,
  FOREIGN KEY (last_seen_message_id) REFERENCES messages(id) ON DELETE SET NULL
);
CREATE INDEX idx_agent_thread_cursor_thread ON agent_thread_cursor(thread_id);
```

Postgres (`schema.pg.ts`) uses identical column names; types `text NOT NULL` (no JSONB needed). Drizzle migration auto-generated by `bun run db:generate`. **Both columns of the composite PK are NOT NULL** (PK semantics enforce this in both engines, but the column declarations restate it for clarity). `last_seen_message_id` is NOT NULL because a cursor row is only written AFTER a successful pickup — no row exists for an agent that has never picked up in the thread.

**Cursor-write policy (resolves OQ-C, see §13):** the cursor is written ONLY by `await_thread_response` on a successful return path. `read_inbox` does NOT mutate the cursor. Rationale: the cursor's purpose is to avoid double-firing a waiter for a message a previous `await_thread_response` call already returned; it is not a generic "read receipt". `read_inbox` is read-only by design — adding a write would violate that contract and conflate two semantics. The cursor is per-(agent, thread), not per-session.

**Atomicity:** cursor writes happen in a single Drizzle `INSERT ... ON CONFLICT DO UPDATE` (SQLite) / `INSERT ... ON CONFLICT (agent_id, thread_id) DO UPDATE SET ...` (Postgres). NOT inside the `messages` insert transaction in `threads.ts` — that path is shared and must stay decoupled. The cursor write executes inside the `await_thread_response` handler, after the message row is read, before the tool returns ok.

**Migration name + rollback:** Drizzle generates `<NNNN>_add_agent_thread_cursor.sql`. Rollback is `DROP TABLE agent_thread_cursor;` — no other table references it. Plan documents this in the migration's `down` note (we do not deploy down migrations in production but the SQL is committed for parity).

**Why not reuse `messages.deletedAt` or a session-scoped flag:** sessions are ephemeral; the cursor must outlive a session so that a new session for the same agent picks up where the prior one left off. The cursor scope is `(agent, thread)`, not `(session, thread)`.

### 4.4b Concurrency note on `AgentResponseRouter.waitFor` (drain ↔ wait)

The drain check in §4.3 step 4 (synchronous SELECT against `messages` + `agent_thread_cursor`) and the EventBus subscription in §4.2 must be sequenced so no event is missed:

```
register waiter (under router internal lock)
  ↓
run drain SELECT in same critical section
  ↓
if drain hit → unregister waiter, return drained message
if drain miss → release lock; the waiter is now armed for incoming events
```

Because the EventBus emit is synchronous (`event-bus.ts:101`) and JS is single-threaded, the only ordering hazard is registering AFTER an emit has already run. The "register before drain" order plus the post-drain release closes that window: any commit whose emit happened during step 1/2 was either (a) already in the messages table at drain time → returned synchronously, or (b) emitted while the waiter is registered → delivered through the subscriber. This invariant gets a `@lore` comment on `AgentResponseRouter.waitFor`.

### 4.5 Web client — `onAppend` rewrite

File: `packages/web/src/pages/ConversationsReview.tsx`.

The current `onAppend` (lines 107-123) becomes:

```ts
type CommitState =
  | { kind: "idle" }
  | { kind: "pending"; key: string }   // clientKey of in-flight request
  | { kind: "error"; key: string; payload: AppendInput; error: string };

// Page state: detail (existing) + commitState + lastError (existing)
// onAppend(input):
//   1. set commitState = pending(input.clientKey).
//   2. fetch with AbortController + 15s timeout.
//   3. if !res.ok → classify(error) per approved.md §3.3, set commitState = error(input).
//   4. if res.ok → re-fetch GET /api/threads/:id (refresh), set commitState = idle.
//      For async threads (where the bar stays visible), trigger a transient toast:
//      "Response recorded — agent will pick it up on next session."
//      An async thread is one where: thread.resolvedAt === null AND the appended
//      message did NOT cause resolution (i.e. it wasn't a verdict that resolved
//      the head). We detect this from the 201 response body's thread.resolvedAt
//      vs the prior thread's resolvedAt.
```

Error classification (mirrors `approved.md` §3.3 verbatim — copy is the design's, not the architect's):
- network/AbortError → "No connection. Try again when you're back online."
- AbortError due to 15s timeout → "Request timed out. Try again?"
- 5xx → "Server couldn't record this response. Try again?"
- 4xx with `{error: string}` → server message, truncated to 120 chars
- 4xx without body → `Couldn't record response (HTTP <code>).`

### 4.6 ThreadShell prop forwarding

File: `packages/design-system/src/ThreadShell.tsx`.

```ts
// Add to ThreadShellProps:
//   pending?: { kind: "verdict" | "composer"; key: string } | null;
//   error?: { kind: "verdict" | "composer"; message: string; onRetry: () => void } | null;
// Forward to ReviewVerdictBar (verdict-flavored) and Composer (composer-flavored).
```

`ReviewVerdictBar` adds `pending?: VerdictDecision | null`, `error?: string`, `onRetry?: () => void` (per `approved.md` §3.1).
`Composer` adds `pending?: boolean`, `error?: string`, `onRetry?: () => void`, plus payload-preservation: textarea content is NOT cleared until a successful commit (per `approved.md` §3.2).

### 4.7 Toast region (shell)

File: `packages/web/src/shell/ToastRegion.tsx` (new).
- Tier 3 shell wrapper, NOT a new design-system component.
- Implements DaisyUI `toast` class with a small `useToast()` hook reachable via React context.
- Single transient toast at a time; auto-dismiss 4s; `role="status"` for assistive tech.
- Mounted once in `AppShell`.

## 5. File-paths summary

**New:**
- `packages/server/src/services/agent-response-router.ts`
- `packages/server/src/__tests__/agent-response-router.test.ts`
- `packages/server/src/skill-tools/await-thread-response.ts`
- `packages/server/src/skill-tools/__tests__/await-thread-response.test.ts`
- `packages/db/src/schema.ts` adds `agentThreadCursor` table; migration auto-generated under `packages/db/drizzle/<NNNN>_*.sql`
- `packages/web/src/shell/ToastRegion.tsx` + `ToastRegion.stories.tsx`
- `packages/web/src/shell/__tests__/ToastRegion.test.tsx`
- `packages/web/e2e/thread-response.spec.ts` (Playwright)

**Modified:**
- `packages/web/src/pages/ConversationsReview.tsx` — replace stub `onAppend` with state-machine version; thread `commitState` + toast.
- `packages/design-system/src/ThreadShell.tsx` — accept and forward `pending` / `error` / `onRetry` props.
- `packages/design-system/src/ReviewVerdictBar.tsx` + stories — new prop additions per `approved.md` §3.1.
- `packages/design-system/src/Composer.tsx` + stories — new prop additions per `approved.md` §3.2; payload preservation.
- `packages/server/src/server-factory.ts` — instantiate `AgentResponseRouter` and pass into `ToolContext`.
- `packages/server/src/skill-tools/tool-registry.ts` — register `awaitThreadResponseTool`.
- `packages/web/src/shell/AppShell.tsx` — mount `<ToastRegion>` once.

## 6. Ordered tasks (TDD red → green)

1. **T1 — Schema:** add `agent_thread_cursor` table to `packages/db/src/schema.ts` and `schema.pg.ts`. Generate migration. Test: migration runs, `bun run db:generate` clean, table+PK assertions in dual-driver test.
2. **T2 — Router service spec test:** write failing tests for `AgentResponseRouter` (waitFor resolves on appended event, ignores own-author, supersede behavior, timeout rejects, commit-before-wait drain via cursor).
3. **T3 — Router implementation:** implement service to make T2 green. Subscribes synchronously; reads message rows via Drizzle.
4. **T4 — Skill tool spec test:** failing tests for `await_thread_response` (authz, drain, sync wake, async timeout). Use existing `_helpers.ts` harness in `packages/server/src/skill-tools/__tests__/`.
5. **T5 — Skill tool implementation + registry wiring:** implement and register; tool-registry tests cover schema validation.
6. **T6 — Web onAppend state machine — Vitest:** failing test in `packages/web/src/pages/__tests__/ConversationsReview.commit.test.tsx` (vitest + RTL) covers: pending flag set on click; cleared on success; error string set on 4xx/5xx/network/timeout; payload preserved for retry; refresh fetched on success.
7. **T7 — ThreadShell + ReviewVerdictBar + Composer prop forwarding:** failing component tests for the new prop states. Deliverables:
   - `Composer.pending-error.test.tsx` and `ReviewVerdictBar.pending-error.test.tsx` covering the four state-table rows in `approved.md` §3.1/§3.2: `Idle`, `Pending`, `Error`, `ErrorThenRetry`.
   - Stories added to `Composer.stories.tsx` and `ReviewVerdictBar.stories.tsx`: matching `Idle`, `Pending`, `Error`, `ErrorThenRetry` story exports (per `approved.md` §10).
   - `ThreadShell.stories.tsx` gets a `ThreadShellPendingErrorComposition` story exercising the prop forwarding end-to-end.
   - Component tests assert: pressed-button-only spinner (verdict bar), `aria-busy="true"` on pending button, `role="alert"` on error row, `role="status"` on toast, focus moves to `[Retry]` on error, focus returns to textarea after composer success, Cmd/Ctrl+Enter suppressed during composer pending.
8. **T8 — ToastRegion shell:** failing test for `useToast` lifecycle (mount/show/auto-dismiss 4s); `<ToastRegion>` mounted in `AppShell`.
9. **T9 — Web wire-up:** make T6+T7+T8 green by editing `ConversationsReview.tsx`, `ThreadShell.tsx`, `ReviewVerdictBar.tsx`, `Composer.tsx`, `AppShell.tsx`.
10. **T10 — Playwright e2e:** `packages/web/e2e/thread-response.spec.ts` covers the loop (load thread → click verdict → server returns 500 → error row visible → click Retry → server returns 200 → bar unmounts) per `approved.md` §10. Use the dev-fixture mode of the server (existing `test-routes.ts`).
11. **T11 — DoD gates:** `bun run check`, `bun run lint`, `bun run test`, `bun run e2e`. Confirm L6 inventory row closure.

## 7. Failure-mode coverage (required)

The table below is the canonical mapping. Every row in `approved.md` §3.3 (web error classification) and §5 (copy table) is represented here, plus the harness/router-side failures that the design page does not see.

### 7.1 Design ⇆ plan error classification cross-check

| `approved.md` §3.3 / §5 row | Plan failure row (below) | Test row |
|---|---|---|
| HTTP 5xx → "Server couldn't record this response. Try again?" | "5xx" | T6 |
| HTTP 4xx with `{error: string}` → server message ≤120 chars | "4xx with body" | T6 |
| HTTP 4xx no body → `Couldn't record response (HTTP <code>).` | "4xx without body" | T6 |
| Network → "No connection. Try again when you're back online." | "Network down (fetch rejects)" | T6 |
| Abort/timeout → "Request timed out. Try again?" | "Timeout (15s)" | T6 |
| Async ack toast → "Response recorded — agent will pick it up on next session." | "Async commit ack" | T6 + T8 + T10 |
| Cmd/Ctrl+Enter suppression while `pending` | "Composer keyboard suppression" | T7 |
| Server identity 403 → 4xx-with-body branch | "Server identity mismatch" | T6 |

If a future change adds a new design error string, this cross-check table is the contract that must be updated alongside it.

### 7.2 Failure-mode table

| Failure | Detection | Surface | Test |
|---|---|---|---|
| Network down (fetch rejects) | `fetch` throws `TypeError` (or AbortError on offline) | `error` row, "No connection. Try again when you're back online." | T6 — mock fetch reject |
| Timeout (15s) | `AbortController.abort()` | `error` row, "Request timed out. Try again?" | T6 — fake timer + abort |
| 4xx with `{error: string}` | `res.json()` body shape | `error` row, server message ≤120 chars | T6 |
| 4xx without body | `res.json()` throws or shape mismatch | `error` row, `Couldn't record response (HTTP <code>).` | T6 |
| 5xx | `res.status >= 500` | `error` row, "Server couldn't record this response. Try again?" | T6 |
| Idempotency replay (same payload) | server returns 200 + existing message (threads.ts:420) | refreshed thread, no error, no duplicate | T6 — assert single message in stream after retry with same `clientKey` |
| Idempotency conflict (different payload) | server returns 409 `idempotency_conflict` (threads.ts:412-418) | `error` row using server's message | T6 — clientKey collision |
| Verdict race (concurrent verdict) | server returns 409 `verdict_race` (threads.ts:507-510) | `error` row, server message; bar refreshes via re-GET | T6 |
| Race: commit fires before agent registers waiter | `await_thread_response` does the drain check FIRST via `agent_thread_cursor` | unblock returned synchronously | T4 — append message, then call tool |
| Race: agent registers waiter, then second commit | router resolves with first qualifying event | unblock fires once | T2 |
| Waiter timeout (no response within timeoutMs) | `setTimeout` rejection inside router | `await_thread_response` returns `err("TIMEOUT")` | T2, T4 |
| Multiple waiters for same `(agent, thread)` | router supersedes older waiter | older Promise rejects with `"superseded"` | T2 |
| Server identity mismatch | existing 403 path (threads.ts:386-389) | `error` row with server message | covered by T6 4xx case |
| WS disconnect during commit | HTTP commit is independent of WS | commit still succeeds; WS reconnect refreshes | not regressed; out of scope |
| Server restart between commit + waiter | router is in-process; on restart, the cursor table preserves "we saw this message" so a new harness session calls `read_inbox` first and finds the message | no message lost | T4 — drain path covers this exact recovery |
| Async commit ack | response on a non-resolving thread (no `thread_resolved`) | DaisyUI `toast` with copy "Response recorded — agent will pick it up on next session." (4s, role="status") | T6 (state machine emits toast intent) + T8 (toast lifecycle) + T10 (E2E) |
| Composer keyboard suppression | Cmd/Ctrl+Enter pressed while `pending` | suppressed (no second submit fired) | T7 — component test on Composer pending state |
| Cursor-write race (two `await_thread_response` calls land same message) | composite PK on `(agent_id, thread_id)` + INSERT...ON CONFLICT DO UPDATE | last writer wins; no duplicate row; no exception bubbled to caller | T2 + T4 — concurrent-call assertion in router test |
| Drain SELECT vs concurrent INSERT | drain runs before subscriber registration; INSERT after drain fires the subscriber | exactly-once delivery (drain hit OR subscriber hit, never both) | T2 — register-then-commit and commit-then-register both asserted |
| Toast XSS via 4xx error string | server-provided error string rendered in error row | React text-node escaping; truncate to 120 chars; never `dangerouslySetInnerHTML` | T6 — assert `<` in server message renders as text |
| Async toast double-fire on rapid retries | two successful appends within 4s | `useToast()` collapses to one visible toast at a time (queue depth 1) | T8 |

## 8. Route checklist

**No new HTTP routes introduced.** The server contract reuses:

| HTTP route | Status | Method/path | Auth | Rate limit |
|---|---|---|---|---|
| Thread message append | reused, unchanged | `POST /api/threads/:id/messages` | `X-Identity` participant check | API-root limit (`app.ts:193-209`) |
| Thread detail fetch | reused, unchanged | `GET /api/threads/:id` | `X-Identity` participant check | API-root limit |

No middleware changes. No CORS surface change. No new auth guard. No new public-facing endpoint. The route-checklist enumeration is therefore complete: zero new rows.

### 8.1 Skill tool registry checklist (in lieu of route-checklist for tool surface)

The skill tool `await_thread_response` is the single new agent-facing capability. Registry-level requirements:

- **Reality check:** `tool-registry.test.ts:32-49` currently asserts a canonical 12-tool set (`create_item`, `handoff_to`, `log_task`, `query_practice`, `read_inbox`, `send_message`, `write_memory`, `write_session_notes`, `route_item`, `score_attention`, `promote_knowledge`, `create_conflict_review`) and `expect(...).toHaveLength(12)`. (The previous plan text "14 existing tools" was a miscount — corrected here.)
- **Required edits to existing tests** (allowed because they belong to the same canonical-tool contract; documented in §10 protected-tests note):
  1. `tool-registry.test.ts` — extend the canonical-set assertion to include `await_thread_response`; bump `toHaveLength(12)` → `toHaveLength(13)` (or whatever role exposes it; see below).
  2. `tool-registry-role.test.ts` — add `await_thread_response` to the role visibility matrix. The new tool is visible to roles `["builder", "chief_of_staff", "practice_facilitator"]` and HIDDEN from any future founder-as-agent role (founders don't run as harness agents per `read-inbox.ts` and the L7 story line 252). Add explicit assertions for each role.
- **New test file** `await-thread-response.test.ts` (sibling of `read-inbox.test.ts`) covers tool-level concerns: schema validation, authz on participant check, drain hit, drain miss → router resolve, timeout, superseded, idempotent re-call after success.
- **`ToolContext` extension:** add `readonly responseRouter: AgentResponseRouter` to `ToolContext` in `tool-registry.ts`. Existing `_helpers.ts` test helper must construct an in-memory router for context. This is an additive interface change; all 12 existing tools ignore the field. Documented as a contract diff in §10.

## 9. Security & abuse cases

| Risk | Vector | Mitigation | Status |
|---|---|---|---|
| Rate-limit on commit POST | `POST /api/threads/:id/messages` | covered by API-root rate limit (`app.ts:193`) | applicable+addressed |
| Input-trust on agent-authored field | `await_thread_response` `threadId` | zod schema; participant-authz check before waiting | applicable+addressed |
| Authz bypass on waiter | An agent registers a waiter for a thread it doesn't participate in | tool's `participants.includes(ctx.agentId)` check before call to router | applicable+addressed |
| Promise leak / DoS via hung waiters | Agent calls `await_thread_response` repeatedly without timeout | enforce `timeoutMs` default 60s, hard cap 600s; supersede on duplicate; `cancelAll` on shutdown | applicable+addressed |
| Self-unblock | Agent's own appended message resolves its own waiter | router filters `message.senderId !== waiter.agentId` | applicable+addressed |
| Cross-thread leakage via router | Waiter on thread A resolves with a message from thread B | router keys waiters by `(agentId, threadId)`; subscriber checks `event.threadId === waiter.threadId` | applicable+addressed |
| Path traversal | n/a — no path inputs | N/A | N/A |
| SSRF | n/a — no outbound URLs | N/A | N/A |
| Secret handling | n/a — no new credentials | N/A | N/A |
| Toast XSS | server-provided 4xx error string rendered in `error` row | render as text node (React default escaping) and truncate to 120 chars; never `dangerouslySetInnerHTML` | applicable+addressed |

## 10. Protected tests

Two layers: **frozen** (no edits) and **augmentable** (additive edits only — no existing assertions weakened).

### 10.1 Frozen (zero changes by L7)

```
protectedTests:
  - packages/server/src/routes/__tests__/threads.routes.test.ts             # L1a contract — idempotency, verdict authz, race, events
  - packages/shared/src/__tests__/event-bus.test.ts                          # synchronous delivery semantics the router depends on
  - packages/shared/src/__tests__/thread-events.test.ts                      # event payload shape
  - packages/server/src/__tests__/ws-broadcaster.thread-topic.test.ts        # topic forwarding
  - packages/server/src/__tests__/ws-subscribe-authz.test.ts                 # participant authz
  - packages/server/src/skill-tools/__tests__/read-inbox.test.ts             # read_inbox is unchanged (no cursor-write side effect)
  - packages/server/src/skill-tools/__tests__/send-message.test.ts           # message append path unchanged
  - packages/server/src/skill-tools/__tests__/tool-result.test.ts            # err/ok shape contract
  - packages/web/e2e/conversations-review.spec.ts                            # existing E2E for the page (selectors must keep working)
  - packages/web/e2e/threads-host.spec.ts                                    # any existing thread-host E2E
  - packages/design-system/src/__tests__/Composer.test.tsx                   # existing Composer behavior — payload-preservation tests are ADDITIVE, prior idle/disabled/onSubmit assertions unchanged
  - packages/design-system/src/__tests__/ReviewVerdictBar.test.tsx           # existing verdict-bar behavior unchanged
  - packages/design-system/src/__tests__/ThreadShell.test.tsx                # existing shell composition unchanged
```

### 10.2 Augmentable (add-only)

L7 may add assertions to these files. Existing rows MUST remain green and untouched:

```
augmentableTests:
  - packages/server/src/skill-tools/__tests__/tool-registry.test.ts          # add `await_thread_response`; bump count 12→13
  - packages/server/src/skill-tools/__tests__/tool-registry-role.test.ts     # add role visibility rows for new tool
  - packages/server/src/skill-tools/__tests__/_helpers.ts                    # extend default ToolContext factory with `responseRouter`
  - packages/server/src/skill-tools/__tests__/tool-schemas.test.ts           # add zod-schema row for new tool
```

### 10.3 New protected tests (introduced by L7; future stories must not weaken them)

```
newProtectedTests:
  - packages/server/src/__tests__/agent-response-router.test.ts              # waitFor sync resolve, supersede, timeout, drain race, self-author filter, cross-thread filter
  - packages/server/src/skill-tools/__tests__/await-thread-response.test.ts  # tool-level: authz, validation, drain hit/miss, timeout, supersede, cursor-write policy
  - packages/db/src/__tests__/agent-thread-cursor.dual-driver.test.ts        # PK uniqueness, FK cascade on agent/thread delete, NOT NULL on PK columns, both SQLite + Postgres
  - packages/web/src/pages/__tests__/ConversationsReview.commit.test.tsx     # state machine: pending→success, pending→error (4xx/5xx/network/timeout), payload preserved on retry, refresh on success
  - packages/web/src/shell/__tests__/ToastRegion.test.tsx                    # mount, show, auto-dismiss 4s, single-toast invariant, role="status"
  - packages/web/e2e/thread-response.spec.ts                                 # full loop: load → click verdict → 500 → error → retry → 200 → bar unmounts
  - packages/design-system/src/__tests__/Composer.pending-error.test.tsx     # additive component test for new prop states (Idle/Pending/Error/ErrorThenRetry stories)
  - packages/design-system/src/__tests__/ReviewVerdictBar.pending-error.test.tsx
```

DoD audits via `git diff --name-only` plus a per-file assertion-count guard: §10.1 files → unchanged line/assertion count; §10.2 files → strictly greater assertion count, no removed/edited assertions.

## 11. Plan reconciliation against approved design

| `approved.md` claim | Plan addresses |
|---|---|
| §2 Component mapping (prop additions, no new component) | §4.6 |
| §3.1/§3.2 State tables for ReviewVerdictBar / Composer | §4.6 + T7 |
| §3.3 Page-level pending/error machine | §4.5 + T6 |
| §4 No optimistic UI; idempotency `clientKey` reused on retry | §4.5 (payload preserved); §7 (idempotency replay) |
| §5 Copy table | §4.5 (verbatim) |
| §6 Mobile adaptation | unchanged — design tokens in `Composer`/`ReviewVerdictBar` already meet AQ-015 |
| §8 Rejection list | enforced — no auto-advance, no undo, no confirmation modal, no success toast on sync, no different sync/async pending |
| §9 OQ-1 pending state location | answered: lives in `ConversationsReview` page, threaded through `ThreadShell` props (§4.5+§4.6) |
| §9 OQ-2 4xx error shape | answered: server returns `{error: string, code: string}` per `ApiErrorResponse`; design's "no body" fallback covers shape mismatch |
| §9 OQ-3 toast root | answered: new `<ToastRegion>` shell mount (§4.7) |
| §9 OQ-4 retry uses same `clientKey` | confirmed: server dedupes by `(thread_id, sender_id, client_key)` (threads.ts:392-427) |

## 12. Trade-offs (design-it-twice)

**Decision:** Sync unblock = in-process EventBus subscriber + skill-tool waiter. Alt: request a per-thread WebSocket from the harness back to the server.

- (A — chosen) **Skill-tool waiter on EventBus.** Pros: in-process, zero new transport, observable in the tool-call event stream, dies cleanly with the session, matches the existing harness loop. Cons: only works while the server process is up; multi-process deployments need the EventBus Redis adapter (already specced in events.ts:247-251 — out of scope to implement).
- (B — rejected) **Per-thread WS upcall to harness.** Pros: scales across processes today. Cons: doubles the transport surface; needs reconnect logic; auth complexity; observability orphaned from the tool-call stream.

Reverse cost of (A) is small — when Redis lands, the router just swaps `EventBus` for the adapter. Reverse cost of (B) is high — once the harness speaks WS, removing it is invasive.

## 13. Resolved decisions (formerly open questions)

- **D-A (was OQ-A) — single event vs synthetic event.** **Decision: single event.** The verdict commit emits `thread_message_appended` (already happens) and, for verdicts, `thread_resolved` (already happens). NO new `thread_response_received` event. Rationale: a synthetic event would duplicate `thread_message_appended` semantically — every appended message in a thread the agent participates in IS a potential response. The waiter registry decides what "response" means for *this* agent (sender filter + thread filter); the event payload doesn't need to encode that. Adding a second event would force every existing subscriber (`ws-broadcaster`, future analytics) to ignore it or risk double-counting. Frozen.
- **D-B (was OQ-B) — default `timeoutMs`.** **Decision: 60_000 ms (60 s)** when caller omits the field. Hard cap 600_000 ms (10 min) enforced by the Zod schema. Rationale: the harness loop is `read_inbox` → optional `await_thread_response` → tool-call → repeat; a 60-second waiter keeps the agent responsive to system events (cost-cap warnings, session-end signals) while still covering the median founder verdict latency. If founders routinely take >60s, the harness loops naturally — that IS the "async on next pickup" path the spec describes (line 246). The cap of 10 minutes prevents a runaway agent from holding a waiter for hours and exhausting Promise budgets in the router. Frozen until telemetry justifies a change.
- **D-C (was OQ-C) — cursor write policy.** **Decision: write only on successful `await_thread_response` returns.** `read_inbox` is read-only and does NOT mutate `agent_thread_cursor`. The cursor is the drain marker for `await_thread_response`, not a generic "read receipt". On `await_thread_response` success (drain hit OR router resolve), upsert `(agent_id, thread_id) → (last_seen_message_id, last_seen_at = now)`. On `TIMEOUT` / `SUPERSEDED` / `FORBIDDEN` / error paths: cursor is NOT written. See §4.4 for atomicity. Frozen.

---

`/architecture-critique` is the next gate; iterate to ≥7 score before `/write-tests`.
