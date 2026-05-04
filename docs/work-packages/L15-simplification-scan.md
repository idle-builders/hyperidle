# L15 — Simplification Scan

Read-only scan over the L15 baseline diff. No code changes were made.

**Scope (12 files):**
- `packages/shared/src/task-request-verbs.ts`
- `packages/shared/src/task-pending.ts`
- `packages/shared/src/thread.ts` (L15 deltas only)
- `packages/server/src/services/task-authz.ts`
- `packages/server/src/services/ensure-task-thread.ts`
- `packages/server/src/services/append-plain-message.ts`
- `packages/server/src/routes/tasks.ts` (POST `:id/request` only)
- `packages/server/src/routes/threads-schema.ts` (L15 deltas only)
- `packages/design-system/src/TaskActionsMenu.tsx`
- `packages/design-system/src/TaskActionsMenu.stories.tsx`
- `packages/web/src/shell/Kanban.tsx` (L15 changes)
- `packages/web/src/pages/WorkTeam.tsx` (L15 changes)

---

## Summary

| Severity | Count |
|---|---|
| HIGH    | 3 |
| MEDIUM  | 5 |
| LOW     | 4 |
| **Total** | **12** |

---

## HIGH

### H1 — `appendPlainMessage` extraction is premature consolidation; threads.ts was not migrated
**Files:** `packages/server/src/services/append-plain-message.ts` (entire file, 206 LOC), `packages/server/src/routes/threads.ts:380–596` (unmigrated original)

The helper's docblock claims it is "Used by: POST /api/threads/:id/messages (when input.type === "plain") AND POST /api/tasks/:id/request". That is false today. `grep` shows only `tasks.ts:298` calls `appendPlainMessage`. `threads.ts` still has its own inline copy of:
- thread lookup + 404 (lines ~400–404)
- participants Zod parse + 500 (lines ~410–420)
- participant check + 403
- idempotency lookup with sameType/samePayload + 409
- transactional insert + thread `lastActiveAt` bump
- `thread_message_appended` event emit
- `rowToMessage(existing)` / `rowToMessage(created)` (line 454, 590)

That is the second copy the helper was supposedly extracted to dedupe. The dev's own note ("noticed but not touching") makes this explicit: the extraction has **one caller**, exactly like the inline version it replaced.

A 200-LOC helper with one production caller is a **single-use helper that pretends to be shared**. Either:
- migrate `threads.ts` POST `:id/messages` plain-branch to use it (which is the point), or
- inline `appendPlainMessage` back into the request handler (~50 LOC of straight-line code) and drop the file.

The added cost (without the second migration) is real: an extra layer of indirection, a `rowToMessage` duplicate, an extra `AppendPlainResult` discriminated union for the caller to translate, and an `AppendPlainInput` shape that re-types what the caller already has.

**Recommendation:** Either migrate threads.ts now, or inline it. Don't ship the half-extraction.

---

### H2 — `rowToMessage` is now duplicated three times
**Files:**
- `packages/server/src/routes/threads.ts:103` (`rowToMessage`)
- `packages/server/src/routes/tasks.ts:37` (`dbRowToMessage` — same function, different name)
- `packages/server/src/services/append-plain-message.ts:67` (`rowToMessage`)

All three convert `DbMessage` → `Message` via `messageRowSchema.parse({type, payload: JSON.parse(...)})` and a 4-arm switch. Bodies are identical except for variable naming. Adding the helper module made things **worse**, not better, because it created a third copy instead of consolidating the existing two.

**Recommendation:** One exported `rowToMessage` in `routes/threads-schema.ts` (next to `messageRowSchema`) or in a sibling module; delete the other two.

---

### H3 — `DEFAULT_FOUNDER_ID = "u-founder"` is now defined in three modules
**Files:**
- `packages/server/src/routes/threads.ts:48` (existing)
- `packages/server/src/routes/tasks.ts:25` (added by L15)
- `packages/server/src/services/task-authz.ts:17` (added by L15)

L15 added two new copies of an identity constant. `task-authz.ts` exports its copy; `tasks.ts:25` re-declares the same string locally instead of importing the exported one. If the founder id ever changes, you have to find three call sites. This is exactly the silent drift problem the export was supposed to prevent.

**Recommendation:** Single source of truth in one shared module (`packages/shared/src/identity.ts` or similar). Both routes and the authz service import it. Delete the local re-declarations.

---

## MEDIUM

### M1 — `TaskActionsMenu` has its own canonical-text table that duplicates `REQUEST_VERB_TEXT`
**Files:**
- `packages/shared/src/task-request-verbs.ts:27` (`REQUEST_VERB_TEXT`)
- `packages/design-system/src/TaskActionsMenu.tsx:30` (`VERB_DEFS` — same `primary` strings)

`VERB_DEFS.request_stop.primary === "Request stop"`, etc. — character-for-character identical to `REQUEST_VERB_TEXT.request_stop`. The component imports from `@hyperidle/shared` already (`TASK_VERBS_BY_STATE`, `RequestVerb`) but ignores the canonical text table and ships its own. If the verb wording is changed in one place, the menu and the rendered request-message text will diverge silently.

**Recommendation:** Either consume `REQUEST_VERB_TEXT[verb]` for `primary` (keeping `secondary` / `shortcut` local), or move `secondary` and `shortcut` into the shared registry too.

---

### M2 — `REQUEST_VERB_TEXT` export has zero callers
**File:** `packages/shared/src/task-request-verbs.ts:27`, re-exported from `packages/shared/src/index.ts:134`

`renderRequestText` is the only consumer of `REQUEST_VERB_TEXT`, and `renderRequestText` is called once (`tasks.ts:297`). `REQUEST_VERB_TEXT` itself has no external import (verified by grep). Either inline it into `renderRequestText` and drop the export, or wire `TaskActionsMenu` (M1) to consume it. As-is it's a public surface with no consumer.

---

### M3 — `EnsureTaskThreadResult.created` field is unread
**File:** `packages/server/src/services/ensure-task-thread.ts:25–28`, consumer `tasks.ts:275`

The single caller destructures `const { threadRow } = ensureTaskThread(...)` and never reads `created`. The field is computed and returned but no production code branches on it. Either:
- a future caller needs it (then document what), or
- drop the field and return `threads.$inferSelect` directly.

YAGNI — drop until a caller appears.

---

### M4 — `TaskThreadRaceLost` is a public class with no external consumer
**File:** `packages/server/src/services/ensure-task-thread.ts:18`

The class is exported. Production code only uses it intra-module (throw + `instanceof` in the same file's catch). Test file `__tests__/ensure-task-thread.test.ts` imports it solely to assert it is exported and instantiable (line 145–148: "exports `TaskThreadRaceLost` as the sentinel error class"). That is a tautology test — it tests its own export.

If no real consumer differentiates this error from a generic one, the class can be a private symbol or a string-tagged Error. The export and the test that validates only the export are both speculative.

---

### M5 — `cancel_request` flow does an extra full-thread message read just to derive pending
**File:** `packages/server/src/routes/tasks.ts:277–295`

For the cancel path the handler reads ALL messages in the thread, sorts asc, runs `derivePendingRequest`, then writes a new cancel message anyway. This is O(n) per cancel call and reuses no state with the subsequent `appendPlainMessage`. Two issues:

1. `derivePendingRequest` only needs to know whether *the most recent request-bearing plain message* is non-cancel. A `LIMIT 50` reverse scan, or a query that filters `type='plain'` + `payload LIKE '%"verb"%'`, is cheaper. The current code loads every message (verdicts, reviews, questionnaires) only to skip them in JS.
2. There's a TOCTOU between this read and the subsequent insert — concurrent cancels could both pass. Either accept the race (cancel is idempotent on verb=cancel_request anyway via clientKey) and skip the precheck, or do the check inside the same transaction. The current shape gives the cost of a check without the safety of one.

**Recommendation:** Remove the precheck (let the message append; downstream pending-derivation is the single source of truth) OR push it into a SQL query that returns only the latest request-bearing row.

---

## LOW

### L1 — `KanbanProps` declares 6 unused callback props
**File:** `packages/web/src/shell/Kanban.tsx:29–34`

`onRequestStateChange`, `onCancelPendingRequest`, `onOpenThread`, `onReplyInThread`, `onSnooze24h`, `onCopyLink` are declared on `KanbanProps` but never consumed by `Kanban` — `WorkTeam.tsx:238` only passes `tasks`, `renderTaskActions`, `groupByBet`. The render-slot pattern (`renderTaskActions`) is the actual integration; the callbacks are dead surface.

**Recommendation:** Drop them. They are speculative API for a caller that uses the slot instead.

---

### L2 — `WorkTeam.tsx` defines 4 no-op `useCallback` handlers and a `handleMoveBet` mock
**File:** `packages/web/src/pages/WorkTeam.tsx:150–171`

`handleOpenThread`, `handleReplyInThread`, `handleSnooze24h`, `handleCopyLink`, and `handleMoveBet` are stubs with empty bodies and unused params. They exist so the menu has something to call, then do nothing. This is anticipating future stories (Composer modal, snooze table, deep-link copy) — the deferrals called out in the task brief.

**Recommendation:** Pass `undefined` to the optional callbacks instead of stubs. The menu already guards each with `?.()`. That removes the rendered menu items "Reply in thread…", "Snooze 24h", "Copy task link" until they actually do something — which is preferable to a menu that lies. If you want to keep them visible for design, mark them with a `disabled` state instead of silently no-oping.

---

### L3 — `RequestVerb` import re-typed in route handler instead of using shared zod schema
**File:** `packages/server/src/routes/tasks.ts:31–35`, `packages/server/src/routes/threads-schema.ts:35–38`

`requestBodySchema` in `tasks.ts` and `requestPayloadSchema` in `threads-schema.ts` are nearly identical (verb + reason). The route schema additionally has `clientKey`, but the verb/reason pair is duplicated. Define `requestPayloadSchema` once in `threads-schema.ts` (already there) and compose: `requestBodySchema = requestPayloadSchema.extend({ clientKey: clientKeySchema })`.

---

### L4 — `RequestPayload` interface in shared/thread.ts is structurally identical to `task-request-verbs.RequestVerb` + `reason`
**File:** `packages/shared/src/thread.ts:96–99`

The interface adds nothing over `{verb: RequestVerb; reason?: string}`. Naming-wise it is a typedef for clarity, but it lives in `thread.ts` while `RequestVerb` lives in `task-request-verbs.ts`, splitting one concept across two files. Acceptable as-is, but worth noting: if this interface ever needs to move, the cross-file dependency is established.

No action required — observation only.

---

## Cross-cutting Observations

1. **The "extract a helper, migrate one caller" anti-pattern.** H1, H2, H3 share a root cause: L15 introduced helpers for code that already existed in `threads.ts`, but only migrated the new code path. Result: more code, more duplicates, more drift surface. The brief calls out the developer "noticed but not touching" — that decision is exactly what makes the extraction a net negative.

2. **TaskActionsMenu UI labels and shared verb labels are not yet linked.** M1+M2 together: a shared `REQUEST_VERB_TEXT` exists, no one uses it, and the only UI that should is shipping its own copy. Fix in one direction or the other.

3. **Speculative optional props.** Several optional callbacks in both `KanbanProps` and `TaskActionsMenuProps` exist for stories that haven't shipped (snooze table, composer modal, deep-link copy). Each is a small over-abstraction; together they create the appearance of an API surface that does not actually function.

---

## Recommendations — Top 3 to Address

1. **Pick one outcome for `appendPlainMessage` (H1)** — migrate `threads.ts` POST `:id/messages` to consume it, or inline it back into `tasks.ts`. The current state (one helper, one caller, original site untouched) is the worst of both options.
2. **Consolidate `rowToMessage` and `DEFAULT_FOUNDER_ID` (H2 + H3)** — one canonical export each, delete the duplicates. This is mechanical and removes ~30 LOC.
3. **Wire `TaskActionsMenu` to `REQUEST_VERB_TEXT` (M1 + M2)** — single source of truth for verb wording, kills the dead export.
