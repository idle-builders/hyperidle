# L15 — Security Review

**Worktree:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2` · **Branch:** `ab/L15-2`
**Reviewer:** security-researcher (read-only)
**Method:** STRIDE + OWASP top 10 against the L15 surface — four new endpoints, the `threads.ts` plain-type delegation, the new `task_snoozes` table + Drizzle plumbing. Plan §10 rows verified one by one against shipped code. Concurrency, idempotency, info-leak, XSS, mass-assignment, and DoS probes against each new code path.

---

## Surface inventory

| Component | File | New / changed |
|---|---|---|
| `POST /api/tasks/:id/request` | `packages/server/src/routes/tasks.ts:255-331` | NEW |
| `POST /api/tasks/:id/snooze` | `packages/server/src/routes/tasks.ts:334-380` | NEW |
| `DELETE /api/tasks/:id/snooze` | `packages/server/src/routes/tasks.ts:383-398` | NEW |
| `GET /api/tasks` extended response | `packages/server/src/routes/tasks.ts:118-161` | EXTENDED (`pendingRequest`, `snoozedUntil`) |
| `POST /api/threads/:id/messages` plain delegation | `packages/server/src/routes/threads.ts:404-415` | REFACTORED |
| `appendPlainMessage` helper | `packages/server/src/services/append-plain-message.ts` | NEW |
| `assertTaskParticipantAuthz` helper | `packages/server/src/services/task-authz.ts` | NEW |
| `ensureTaskThread` + `ensureParticipant` | `packages/server/src/services/ensure-task-thread.ts` | NEW |
| `task_snoozes` table | `packages/db/src/schema.ts:484-503`, `schema.pg.ts:473-490` | NEW |
| Migrations | `packages/db/drizzle/0010_add_task_snoozes.sql`, `drizzle-pg/0009_add_task_snoozes.sql` | NEW |
| `WorkTeam.tsx` callbacks | `packages/web/src/pages/WorkTeam.tsx:131-199` | NEW |
| `Kanban.tsx` (drag stripped, menu wired) | `packages/web/src/shell/Kanban.tsx` | REWRITTEN |
| `TaskActionsMenu.tsx` | `packages/design-system/src/TaskActionsMenu.tsx` | NEW |

Auth pre-condition (verified): `authMiddleware` mounted at `packages/server/src/app.ts:246` covers `/api/*`. `createTaskRoutes` is registered at `:266`. All four new task routes traverse the API-key gate; rate limiter + body limit (1 MiB default) sit before auth at `app.ts:194-230`. No "wired but not instantiated" gap on the L15 routes.

---

## Severity legend

- **MUST-FIX** — real exploit on shipped code. Block before deploy past single-tenant demo.
- **SHOULD-FIX** — mitigation gap or contract drift; close before next deploy.
- **CONSIDER** — defense-in-depth.

| Severity | Count |
|---|---|
| MUST-FIX | 2 |
| SHOULD-FIX | 4 |
| CONSIDER | 4 |

---

## MUST-FIX

### MUST-FIX-1 — Cross-team-vs-phantom NOT_FOUND code-case distinguisher (info leak)
**Files:** `packages/server/src/routes/tasks.ts:268, 309, 342, 388` and `packages/server/src/services/task-authz.ts:35, 43`.
**Tier:** ALWAYS — *Information disclosure across trust boundary*.
**Plan §10 row violated:** "Abuse: information leak via 404 vs 403 — When the founder lacks access to a task, return 404 (not 403) so existence is not revealed."
**STRIDE:** Information Disclosure.

**Issue.** All four new endpoints (`/request`, `/snooze` POST, `/snooze` DELETE, plus the older `tasks.ts:170, 205, 210` paths) return `code: API_ERROR_CODES.NOT_FOUND` which expands to the **uppercase** literal `"NOT_FOUND"` when the task row genuinely does not exist (`tasks.ts:268, 342, 388`). The cross-team / phantom-identity branch in `assertTaskParticipantAuthz` returns the **lowercase** literal `"not_found"` (`task-authz.ts:35, 43`). Both responses ship `status: 404` and `error: "Task not found"`, but the case-mismatch in the `code` field is a perfect oracle.

**Concrete attack path.**
```
# Probe a UUID for existence regardless of team.
curl -H 'X-API-Key: $K' -H 'X-Identity: agent-from-team-B' \
     -H 'Content-Type: application/json' \
     -d '{"verb":"request_stop","clientKey":"probe-00000001"}' \
     /api/tasks/<uuid-under-test>/request

# Response A (task does not exist):
#   { "error":"Task not found", "code":"NOT_FOUND" }
#   ← lookup at tasks.ts:266-269 hit first

# Response B (task exists in team A; agent is in team B):
#   { "error":"Task not found", "code":"not_found" }
#   ← assertTaskParticipantAuthz at tasks.ts:272-275 returns lowercase

# The case of `code` is a 1-bit oracle:
#   uppercase  → does not exist
#   lowercase  → exists in another team
```

The plan-§10 protection against existence leakage is broken in transit. Same issue on `/snooze` POST (`tasks.ts:342` vs `task-authz.ts`), DELETE `/snooze` (`tasks.ts:388`). The `tasks.request-authz.test.ts` test (e) at `:131-147` only asserts `status === 404` and never inspects the `code` body, so the regression is silent.

**Likelihood.** High. Anyone with a valid API key can enumerate task ids across teams once they hold one valid id from any source (link share, observability log, error message, or the unscoped `GET /api/tasks` list — see SHOULD-FIX-1).
**Impact.** High in multi-tenant. Confirms the inverse of plan §10 row 10's locked behaviour.
**Fix.** Either (a) make `task-authz.ts` return `code: API_ERROR_CODES.NOT_FOUND` (uppercase) so the two paths are byte-identical, or (b) route both branches through one constant. Add a regression assertion to `tasks.request-authz.test.ts` (e) that compares the response body byte-for-byte with the row (a) phantom-id case.

---

### MUST-FIX-2 — `ensureParticipant` lost-update race + malformed-JSON data destruction
**File:** `packages/server/src/services/ensure-task-thread.ts:96-110`.
**Tier:** ALWAYS — *Tampering / Authorization integrity*.
**STRIDE:** Tampering, Elevation of Privilege.

**Issue.** `ensureParticipant` is a non-transactional read-modify-write on the JSON `participants` column with NO conditional update guard:

```ts
// 96-110 (paraphrased):
const parts = JSON.parse(threadRow.participants); // (1) read column
if (parts.includes(senderId)) return;
db.update(threads)
  .set({ participants: JSON.stringify([...parts, senderId]) }) // (2) overwrite
  .where(eq(threads.id, threadRow.id))
  .run();
```

Two real problems:

1. **Lost-update race (PG, multi-connection).** Two concurrent `POST /api/tasks/:id/request` calls on a task whose thread already exists with three participants `[A, B, C]`, with senders `D` and `E`:
   - Both transactions read `[A, B, C]`.
   - One writes `[A, B, C, D]`.
   - The other writes `[A, B, C, E]`, overwriting the first.
   - Result: one participant is silently dropped.
   The participants list is the **authz substrate** for `appendPlainMessage` (line 122-125) — a dropped participant loses the right to post follow-up messages on the thread. SQLite serialises writers so the in-process race is bounded; the PG dialect (project supports both via `schema.pg.ts`) does not guarantee that ordering across connections.

2. **Malformed-JSON data wipe.** Lines 98-103 catch any JSON parse error on `threadRow.participants` and fall back to `parts = []`. Then the next branch unconditionally writes `[senderId]` to the column — overwriting whatever data was there. A row with corrupt JSON (legacy data, manual edit, partial write, dialect-specific encoding bug) gets silently rewritten to a single-participant array. In contrast, `appendPlainMessage` (`append-plain-message.ts:111-120`) returns 500 on malformed participants — the project rule is "let parse errors propagate." `ensureParticipant` violates that rule and converts data corruption into authz collapse.

**Concrete attack path.**
- Trigger: Two team-A members simultaneously request on a task whose thread has the founder + a former teammate who just left the team.
- Pre-state: `participants = ["u-founder", "agent-X", "agent-A1"]`.
- Both members read this list, append themselves, write back.
- Post-state: one of `agent-A2`/`agent-A3` is missing. The lost participant — call them `agent-A3` — now gets 403 `forbidden` from `appendPlainMessage:122-125` on every subsequent post, even though they're a legitimate team-A member. `assertTaskParticipantAuthz` lets them through (team-match), but the participant list is the second gate.

**Likelihood.** Medium for the race (requires concurrent identical-thread requests; rare on the team board today, common once L15 wires a notify-cascade). Low for the malformed-JSON wipe (requires a corrupt row).
**Impact.** Medium-High. Authz substrate corruption is hard to debug and easy to weaponise (intentionally over-write the participant list with concurrent requests by a determined attacker).
**Fix.**
- Wrap the read-modify-write in a transaction together with the message insert (`appendPlainMessage` already opens a tx — fold this into it).
- Use a conditional UPDATE shape (e.g. `WHERE participants = <observed bytes>` returning `changes`, retry on miss) — same idiom the L15 plan locked for `ensureTaskThread`.
- Drop the `try/catch` on `JSON.parse`; let parse errors propagate to 500 to match `appendPlainMessage`.
- Add a regression test: two concurrent posters on an existing thread → both senders end up in `participants[]`.

---

## SHOULD-FIX

### SHOULD-FIX-1 — `GET /api/tasks` has no team-scope authz; new fields amplify info disclosure
**File:** `packages/server/src/routes/tasks.ts:118-161`.
**Tier:** ALWAYS — *Authorization on every data access*.
**STRIDE:** Information Disclosure, Spoofing.

**Issue.** The list endpoint runs no authz at all. Any holder of a valid API key sees every task in every team. L15 amplifies this in two ways:
1. **`pendingRequest` per row** (line 138-150) leaks the most-recent thread-request `verb` AND the optional human-authored `reason` from any team's tasks. The `reason` field is up to 2 KiB of free text per request — the exact channel a founder might use to share sensitive context ("agent stuck on the password rotation; the OTP shared earlier was wrong").
2. **`snoozedUntil` per row** is per-user and harmless on its own, but the new column existing means clients now treat the wire row as authoritative — every consumer of the L15 row shape inherits the unscoped read.

The L8 review (HIGH-1, follow-ups.md `auth-middleware-participant-scope`) tracks the analogous gap on `GET /api/threads`. The same gap exists here, has been exercised by L15, and is not in the follow-ups file.

**Concrete attack path.**
```
# As any API-key holder, regardless of team:
curl -H 'X-API-Key: $K' /api/tasks
# Returns every task across every team, with `pendingRequest.reason`
# (free-text, up to 2 KiB) embedded for each task that has an active
# request on its thread.
```

**Likelihood.** High in multi-tenant.
**Impact.** Medium-High — direct info disclosure of cross-team operational signals AND human-authored free text.
**Fix.** Restrict the list to `task.teamId in (resolvedSenderTeamIds)` for non-founder identities, mirroring `assertTaskParticipantAuthz`'s shape. Add `bet_id`/`state`/`owner` filters as additional restrictors, not as the only authz gate. Add this to follow-ups.md alongside the existing `auth-middleware-participant-scope` row.

---

### SHOULD-FIX-2 — `state` query param on `GET /api/tasks` is not enum-validated
**File:** `packages/server/src/routes/tasks.ts:120, 126`.
**Tier:** ASK FIRST — *Input validation at boundary*.
**STRIDE:** Tampering (low).

**Issue.** `state = c.req.query("state")` is interpolated into `eq(tasks.state, state)` without validation against `TASK_STATES`. The `transitionTaskSchema` at `:60-62` enum-validates body input — but the GET `state` query param is unguarded. Drizzle parameterises the eq, so this is **not SQL injection**, but it is a missing defense-in-depth gate: an unknown state silently matches no rows; bad clients can't distinguish "no tasks in state X" from "X is not a valid state".

**Likelihood.** Low.
**Impact.** Low — silent empty result is the worst case.
**Fix.** Reuse `z.enum(TASK_STATES).optional()` to coerce the query param; reject 400 on unknown.

---

### SHOULD-FIX-3 — `appendPlainMessage` 500 leaks raw `cause` in error body
**File:** `packages/server/src/services/append-plain-message.ts:179-186`.
**Tier:** ASK FIRST — *Error information leakage*.
**STRIDE:** Information Disclosure.

**Issue.**
```ts
} catch (cause) {
  return {
    ok: false,
    status: 500,
    code: "internal_error",
    message: `Failed to append message: ${String(cause)}`,
  };
}
```
The route handlers at `tasks.ts:328` and `threads.ts:413-414` return that `message` as the `error` body field. `String(cause)` for a sqlite/PG error includes the SQL fragment, table/column names, and sometimes constraint names. An attacker triggering a constraint failure (e.g. duplicate `clientKey` race that landed inside the tx) gets schema details in the response. Compare to `threads.ts:560-563` which has the same shape — pre-existing pattern, but L15 propagated it.

**Likelihood.** Low (requires triggering a tx error).
**Impact.** Low (schema disclosure only).
**Fix.** Return a generic `"Failed to append message"` and log `cause` server-side via the observability adapter (note: there is currently no logger in `append-plain-message.ts` at all — see SHOULD-FIX-4).

---

### SHOULD-FIX-4 — No structured audit log on the new state-changing endpoints
**Files:** `packages/server/src/routes/tasks.ts:260-398`, `services/append-plain-message.ts`, `services/ensure-task-thread.ts`, `services/task-authz.ts`.
**Tier:** ASK FIRST — *Repudiation*.
**STRIDE:** Repudiation.

**Issue.** None of the new write paths emit an audit log line on failure. `authMiddleware` logs rejected API-key attempts (`auth.ts:45-49`), but a successful API key + cross-team probe (the MUST-FIX-1 oracle) leaves no server-side trace. `task_snoozed` events are emitted to the in-process `EventBus` but not persisted as an audit trail. If an incident responder needs to reconstruct who probed which task across team boundaries, there's nothing to reconstruct from.

**Fix.** Add a `WARN`-level log line in `assertTaskParticipantAuthz` when a non-founder, valid-agent identity hits the cross-team branch (line 43), with `senderId`, `task.id`, `task.teamId`. Do **not** log the full `reason` field or any free text from the request body — just identity + target. (NEVER tier: don't log secrets / PII.)

---

## CONSIDER

### CONSIDER-1 — `validateBody` echoes Zod issue paths in 400 body
**File:** `packages/server/src/middleware/validate.ts:13-19`.
**Issue.** The 400 body includes `details: { issues: result.error.issues }` — Zod's structured issue list including paths and messages. Mostly self-describing public schema, but for the L15 endpoints it confirms the `clientKey` regex shape, the `verb` enum membership, and the `reason` length cap. Tells an attacker the schema is well-defined; no concrete exploit. Fixable centrally if you ever want to ship.

### CONSIDER-2 — `ensureTaskThread` unique-constraint comment is ⚠️ UNVERIFIED for the PG dialect's transaction visibility
**File:** `packages/server/src/services/ensure-task-thread.ts:42-67`.
**Issue.** The conditional UPDATE rowcount idiom is correctly implemented for sqlite/better-sqlite3 (single writer, `result.changes` is reliable). For Postgres under read-committed isolation with multiple connections, the inserted speculative-thread row inside the tx is **invisible** to the racing tx until commit, but the tasks row UPDATE's `WHERE thread_id IS NULL` predicate reads the committed snapshot. Two concurrent txs can both see `thread_id IS NULL`, both succeed at their UPDATE on commit. The losing tx then has its FK pin overwritten by the winning tx's later commit. The plan's claim "first-writer-wins" relies on row-level locking on `tasks.id` during the UPDATE. This MAY be fine (PG row-locks the `tasks` row on UPDATE under read-committed), but the lore claim is unverified — flag with `⚠️ UNVERIFIED` and add a PG-driver concurrent test.

### CONSIDER-3 — `cancel_request` re-derivation is a per-call full-thread scan
**File:** `packages/server/src/routes/tasks.ts:286-298`.
**Issue.** The pre-check loads every message in the thread and runs `derivePendingRequest` to validate. A malicious client spamming `cancel_request` against a task with a long thread amplifies cost (full table scan + Zod parse per row). Bounded by the rate limiter (60/min default) and the `inArray`-less single-thread query. CONSIDER caching `pending_request_message_id` denormalised on `tasks` (the L15 plan §2.2 chose the read-model — keep, but note the DoS ceiling).

### CONSIDER-4 — `snooze` upsert hand-rolled (read-then-write) instead of `onConflictDoUpdate`
**File:** `packages/server/src/routes/tasks.ts:348-369`.
**Issue.** Already in the simplification scan as SF1 (deferred). Repeating here because the same-user double-snooze race writes a duplicate-PK conflict path on PG where the SELECT misses but the INSERT collides. Per the L15 simplification-scan resolution it's "behaviour-correct as-is." From a security lens, the worst case is a 500 on PK collision — recoverable, no data corruption, but a noisy failure mode the test suite doesn't exercise.

---

## Plan §10 row-by-row checklist

Each plan §10 row → resolved / unresolved / new gap.

| Plan §10 row | Status | Notes |
|---|---|---|
| Rate-limit on every POST/PATCH | **Resolved.** | `app.ts:194-207` mounts `createRateLimiter` before auth on `/api/*`; the four new task routes inherit. Verified. |
| Input-trust boundary for agent-authored fields | **Resolved.** | `verb` enum-validated (`tasks.ts:255-259`); `text` server-rendered from `REQUEST_VERB_TEXT` at `tasks.ts:317` via `renderRequestText`; never accepted from request body. `reason` length-capped at 2048 in both `requestBodySchema` (`tasks.ts:257`) and `requestPayloadSchema` (`threads-schema.ts:38-41`). |
| Authn vs authz | **Resolved.** | `authMiddleware` covers `/api/*`. `assertTaskParticipantAuthz` runs before lazy-thread-creation on `/request` (line 272), `/snooze` (line 344), DELETE `/snooze` (line 390). |
| Founder requests on tasks they don't own | **Resolved with caveats.** | Authz contract correct in code. **MUST-FIX-1** breaks the locked 404-without-information-leak invariant by case-mismatched `code`. |
| Client floods `clientKey` | **Resolved.** | Idempotency lookup at `append-plain-message.ts:127-156` keys on `(threadId, senderId, clientKey)`. Cross-user replay impossible — `senderId` is in the key. Same-user same-payload returns 200 with the canonical row; same-user divergent-payload returns 409. clientKey regex `[A-Za-z0-9_\-:.]{8,128}` enforced (`threads-schema.ts:22-23`). |
| Cancel_request without pending — DoS via empty cancels | **Resolved.** | Pre-check at `tasks.ts:279-298` returns 409 `already_resolved`. The cost is one full-thread scan per cancel — see CONSIDER-3. |
| Snooze flood | **Resolved (per-user).** | PK `(user_id, task_id)` deduplicates re-snooze. The hand-rolled upsert has a tiny race window (CONSIDER-4); not exploitable. |
| Path-traversal on path inputs | **N/A.** | No path inputs; only opaque IDs. |
| SSRF on outbound URL | **N/A.** | No outbound URLs in the L15 surface. |
| Secret handling on new credential surface | **N/A.** | No new credentials. |
| Information leak via 404 vs 403 | **UNRESOLVED — see MUST-FIX-1.** | The 404 status is correct; the `code` body field leaks existence via case mismatch. |
| Malicious `reason` payload (XSS via thread render) | **Resolved at React boundary; future risk flagged.** | `CommentRow.tsx:85` renders `payload.text` as a React text node; no `dangerouslySetInnerHTML` on plain payloads anywhere in `packages/design-system/src` or `packages/web/src` (verified by grep). The only `dangerouslySetInnerHTML` sites are `ArtifactView.tsx:141` (DOMPurify-sanitised) and `block/HtmlPayload.tsx:29` (`safe` content) — neither is on the plain-message render path. **Reason is also length-capped at 2048 server-side.** L15-introduced fields all flow through React text nodes. |
| Stale `pendingRequest` in concurrent edit | **Resolved.** | Read-model derivation runs at fetch time. The `cancel_request` raced-with-resolve path returns 409 `already_resolved` per W-6. |
| Agent-impersonation via senderId | **Out of L15 scope.** | Inherited from L1a; same status as plan claim. |

---

## New gaps (not in plan §10)

| Gap | Severity | File |
|---|---|---|
| `ensureParticipant` lost-update race + malformed-JSON wipe | **MUST-FIX-2** | `ensure-task-thread.ts:96-110` |
| `GET /api/tasks` cross-team info disclosure (now leaks `pendingRequest.reason`) | **SHOULD-FIX-1** | `tasks.ts:118-161` |
| `state` query param not enum-validated | SHOULD-FIX-2 | `tasks.ts:120, 126` |
| 500 error body echoes raw `cause` (schema leak surface) | SHOULD-FIX-3 | `append-plain-message.ts:179-186` |
| No audit log on cross-team probe | SHOULD-FIX-4 | `task-authz.ts:34-44` |
| `validateBody` echoes Zod issue paths | CONSIDER-1 | `middleware/validate.ts:13-19` |
| PG read-committed concurrent `ensureTaskThread` claim unverified | CONSIDER-2 | `ensure-task-thread.ts:42-67` |
| `cancel_request` re-scan is unbounded over thread length | CONSIDER-3 | `tasks.ts:286-298` |
| `snooze` upsert race window (PG dialect PK collision) | CONSIDER-4 | `tasks.ts:348-369` |

---

## Threat-by-threat checklist (review brief)

| Probe | Status | Notes |
|---|---|---|
| 1. Authn/authz drift across all four new endpoints | Pass with one finding | All four new endpoints call `assertTaskParticipantAuthz`. **MUST-FIX-1** breaks 404 contract via `code` case. |
| 2. 404 vs 403 information leak | **Fail** | MUST-FIX-1. |
| 3. Lazy-thread-creation race (CRITICAL-2) | Pass (sqlite); ⚠️ unverified for PG | CONSIDER-2. Test `tasks.request-concurrent.test.ts` exercises sqlite. |
| 3b. Other races: snooze upsert, list-projection vs concurrent request, cancel_request vs concurrent state transition | Mostly pass; `ensureParticipant` race fails | **MUST-FIX-2**. Snooze upsert race CONSIDER-4. |
| 4. Idempotency abuse via clientKey | Pass | `(threadId, senderId, clientKey)` key prevents cross-user replay. |
| 5. Input validation (reason cap, verb enum, clientKey shape, payload size) | Pass | All four covered by Zod at the boundary. Body limit 1 MiB inherited. |
| 6. XSS on reason via thread render | Pass | React text-node escape applies; no `dangerouslySetInnerHTML` on the plain-payload render path. |
| 7. CSRF (existing global middleware) | N/A | Project uses API-key in `X-API-Key` header, not cookie. CSRF not applicable to header-auth APIs. |
| 8. Mass assignment | Pass | All Zod schemas use closed object shapes; extra fields are silently dropped by `safeParse`. Verified `requestBodySchema` (`tasks.ts:255-259`), `snoozeBodySchema` (`tasks.ts:334-336`). |
| 9. SQL injection | Pass | Zero raw SQL in the L15 surface (verified by grep against `tasks.ts`, `append-plain-message.ts`, `ensure-task-thread.ts`, `task-authz.ts`). All Drizzle `eq`/`and`/`isNull`. |
| 10. DoS (unbounded result sets, N+1) | Bounded; defer to follow-up | `GET /api/tasks` N+1 already in `follow-ups.md` → `L15-task-list-projection-N+1`. CONSIDER-3 flags the cancel scan. Per-team task count not capped. |
| 11. Snooze-table abuse | Pass | Per-user PK `(user_id, task_id)` confines impact to the snoozer's own board. |
| 12. Transaction safety | Mostly pass | `ensureTaskThread` rollback path correct. **`ensureParticipant` runs OUTSIDE `appendPlainMessage`'s tx** — see MUST-FIX-2. |
| 13. Logging / leakage | Pass on bodies; **gap on audit** | No request bodies, secrets, or sender-ids logged at INFO in the new code. Auth middleware logs reject metadata only. SHOULD-FIX-4 flags the missing audit on cross-team probes. |

---

## Three-tier classification summary

| Tier | Findings |
|---|---|
| **ALWAYS (CRITICAL / MUST-FIX)** | MUST-FIX-1 (info leak via code-case), MUST-FIX-2 (`ensureParticipant` race + wipe), SHOULD-FIX-1 (`GET /api/tasks` unscoped). |
| **ASK FIRST (WARN)** | SHOULD-FIX-2, SHOULD-FIX-3, SHOULD-FIX-4. |
| **NEVER (BLOCK)** | None encountered. |

The L15 plan correctly identified the cross-team isolation contract (§10 row 10) and the `clientKey`/idempotency contract (§10 row 5) and locked them in protected tests. Two gaps slipped past:

1. The `code` field's case mismatch (MUST-FIX-1) is not asserted by `tasks.request-authz.test.ts (e)`. Pin it.
2. The `ensureParticipant` helper (MUST-FIX-2) is not exercised by any concurrent test — `tasks.request-concurrent.test.ts` covers the lazy-creation race only, not the participant-append-on-existing-thread race.

---

## Recommendations to the developer

1. **MUST-FIX-1** — change `task-authz.ts` to return `code: API_ERROR_CODES.NOT_FOUND` so the cross-team and not-exist branches are byte-identical. Add an assertion in `tasks.request-authz.test.ts (d)` that `body.code === "NOT_FOUND"`. Same fix on `/snooze` POST and DELETE.
2. **MUST-FIX-2** — make `ensureParticipant` either (a) a no-op replaced by always-include-on-create + reject-non-participant, or (b) a transactional conditional UPDATE inside `appendPlainMessage`'s tx. Drop the `JSON.parse` `try/catch` so corruption surfaces as 500. Add a regression test.
3. **SHOULD-FIX-1** — file an `auth-middleware-task-scope` follow-up alongside the L8/L1 row in `follow-ups.md`. Do not deploy past single-tenant demo until closed.
4. **SHOULD-FIX-2** — add `z.enum(TASK_STATES)` to the `state` query param.
5. **SHOULD-FIX-3** — drop `cause` from the 500 body; log via the observability adapter.
6. **SHOULD-FIX-4** — add a single WARN log line in `assertTaskParticipantAuthz`'s cross-team branch with identity + target id (no free text).
7. **CONSIDER** items — defense-in-depth; pick up alongside the next perf or auth touch.

End of review.

---

## Resolution

### MUST-FIX-1 — applied
- Files: `packages/server/src/services/task-authz.ts` (use
  `API_ERROR_CODES.NOT_FOUND` uppercase + narrow `status` to `404`),
  `packages/server/src/routes/__tests__/tasks.request-authz.test.ts`
  (assertions (c)/(d) now pin `body.code === "NOT_FOUND"` and
  `body.error === "Task not found"`; new (e1) regression compares
  cross-team and not-exist 404 bodies for byte-identity).
- Fix summary: cross-team and not-exist branches now produce
  byte-identical 404 bodies. The 1-bit existence oracle is closed.

### MUST-FIX-2 — applied
- File: `packages/server/src/services/ensure-task-thread.ts:96-145`,
  test in `packages/server/src/services/__tests__/ensure-task-thread.test.ts`.
- Fix summary: `ensureParticipant` now (a) uses
  `threadParticipantsSchema.parse(JSON.parse(...))` so parse errors
  propagate (no silent data wipe); (b) issues a conditional UPDATE that
  pins to the observed `participants` bytes via `WHERE participants =
  observed`, re-reads on miss, and retries up to a bounded count. Two
  regression tests added: (i) lost-update — racing writer flips the
  column between read and write, ensure both senders end up present;
  (ii) parse-error propagation — a corrupt column now throws instead of
  being silently overwritten.

### SHOULD-FIX-1 — applied (mitigation) + filed follow-up
- File: `packages/server/src/routes/tasks.ts:138-176` (strip `reason`
  for cross-team callers); `docs/work-packages/follow-ups.md`
  (`L15-auth-middleware-task-scope`).
- Fix summary: the list endpoint now strips `pendingRequest.reason`
  when the caller fails `assertTaskParticipantAuthz` for the row,
  closing the 2 KiB free-text exfiltration channel. Full team-scope
  authz on `GET /api/tasks` remains a follow-up under the
  auth-middleware track.

### SHOULD-FIX-2 — deferred
- File: `packages/server/src/routes/tasks.ts:120, 126`. Reason:
  defense-in-depth only; silent empty result is the worst case. Not a
  must-fix.

### SHOULD-FIX-3 — deferred
- File: `packages/server/src/services/append-plain-message.ts:179-186`.
- Reason: requires an observability adapter on the helper that does not
  exist yet; the current shape mirrors the pre-L15 `threads.ts:560-563`
  pattern. Filed as future work.

### SHOULD-FIX-4 — deferred
- Reason: requires the project's audit-log surface; not currently
  wired.

### CONSIDER-1..4 — skipped (defense-in-depth; out-of-scope for the
must-fix pass).
