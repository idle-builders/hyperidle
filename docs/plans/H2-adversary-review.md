# H2 Adversary Review

Read-only review of the H2 notification adapter implementation.

## CRITICAL (must fix before proceeding)

1. **AC6 end-to-end is non-functional — `routine_fired` is never emitted.**
   `packages/server/src/services/notifications/dispatcher.ts:436` subscribes
   to `routine_fired`, but `packages/server/src/services/routine-scheduler.ts`
   (around line 358–370, inside `checkAndFireRoutine`) only updates
   `lastRunAt`/`nextRunAt` and never calls `eventBus.emit({type:"routine_fired",...})`.
   Grep confirms zero producers of that event type outside tests and this
   subscriber. The only reason the integration test at `dispatcher.integration.test.ts:133`
   passes is because it fabricates the event with `bus.emit(...)`. In
   production, the scheduled daily digest will NEVER fire. AC6 is not met
   without the manual `POST /notifications/digest` trigger, which is not
   part of the AC.

2. **`flushQueue` ignores silence — can punch through an active silence window.**
   `dispatcher.ts:211` drains every `pending` row through the adapter
   unconditionally. The test at `dispatcher.test.ts:243` even calls
   `flushQueue` while still in a "silence_mode=true" setting (it clears
   the flag first, but `POST /flush` does not). An operator (or the
   `/flush` endpoint) called during quiet hours will push every queued
   "blocking" row — defeating AC4. `flushQueue` must either re-run
   `isSilenced` per row or restrict itself to "silence was lifted".

3. **At-least-twice delivery on partial failure — no transactional guard.**
   In both `flushQueue` (`dispatcher.ts:240–255`) and `runDailyDigest`
   (`digest.ts:72–94`), the adapter send happens BEFORE the row-update
   to `status:"sent"`. If the process crashes, the adapter call throws
   mid-batch (digest), or the DB write fails after a successful send,
   the row stays `pending` — next flush/digest will re-send. ntfy and
   SMTP do not dedupe. There is no `claimed` intermediate status and no
   `SELECT ... FOR UPDATE SKIP LOCKED` / single-row CAS.

## WARNINGS (should fix, creates risk)

4. **`GET /queue` accepts ANY string for `status` without validation.**
   `notifications-routes.ts:157`: `const statusParam = c.req.query("status") ?? "pending"`
   is piped directly into `eq(notificationQueue.status, statusParam)`. Not
   a SQL-injection risk (Drizzle parameterizes), but it violates the zod-
   validation convention applied to every other endpoint on this router
   and silently returns `count:0` for typos. The whole file enforces strict
   zod bodies; the query string was skipped.

5. **New SMTP transporter created per push — connection/socket leak.**
   `dispatcher.ts:306` (`const adapter = deps.adapterFactory(cfg)`) is
   called inside `dispatchPush`, and `defaultNotificationAdapterFactory`
   (`app.ts:49`) calls `createSmtpAdapter` which calls
   `nodemailer.createTransport` (`smtp-adapter.ts:52`). Under load this
   creates one transporter per notification, holds pooled connections
   open, and never calls `.close()`. For ntfy the same pattern creates a
   new adapter object per push, which is cheaper but still wasteful. The
   dispatcher should memoize one adapter per `cfg` identity.

6. **Silent-drop of blocking notifications when recipient is unconfigured.**
   `dispatcher.ts:308` — if the `primaryChannel` recipient is missing
   (`pickRecipient` returns `null`), we `logger.warn` and return. The
   blocking item is NOT enqueued. A misconfiguration silently swallows
   AC1/AC2/AC3. Contrast with `flushQueue`, which at least marks the row
   `failed`. The dispatcher path should enqueue-with-`failed`+`lastError`
   so the operator can see what was lost.

7. **Unbounded queue retention — `sent`/`failed`/`dropped` rows never
   purged.** `notification_queue` has only `status/createdAt` indexes but
   no TTL, no compaction routine, no `/queue/purge` endpoint. The
   QUEUE_CAP only counts `pending`, so a long-running factory grows the
   table forever. Indexes on `(status, createdAt)` do not protect against
   table bloat; Postgres in particular will see poor plan quality.

8. **Digest "all-or-nothing" write is worse than per-row.**
   `digest.ts:90–95` iterates all rows and does N single-row `UPDATE`s
   AFTER the adapter send. One cross-row transaction would be atomic
   (all rows flip to `sent` or none do). If the process dies between
   row 3 and row 4, rows 1–3 are `sent` but 4..N stay `pending` and will
   be re-sent in the NEXT digest batch — same at-least-twice problem as
   #3, but with a larger blast radius because the digest is already
   multi-item.

9. **`POST /flush` and `POST /digest` do no authorization beyond the
   global API-key gate.** Either endpoint can be used to force a
   notification burst by anyone holding the key (e.g., an operator
   testing something). Rate-limiting is absent. `POST /test` will happily
   call a real SMTP server on every request. Not a bug per se, but a
   DoS / noisy-neighbor vector with no throttle.

10. **`isInSilenceWindow` edge cases uncovered.** `silence-policy.ts:74`
    rejects malformed time strings by returning `false` (i.e., NOT
    silenced). An operator fat-fingering `silence_window_start="22"`
    silently disables the entire quiet-hours feature with no log. The
    route `/config` PATCH does not validate these keys at all — they
    live under the generic `factory_settings` table.

## OBSERVATIONS (worth discussing)

11. **`sanitizeTopic` is more restrictive than ntfy accepts.** ntfy docs
    allow dots in topic names; this regex is `[A-Za-z0-9_-]+` only.
    Operators will hit this the first time they paste a real topic.

12. **Flood state is purely in-memory.** `DispatcherState.flood` resets
    on process restart, so a restart during a flood storm lets the first
    `maxPerMinute` push through again. Likely acceptable for v1 but
    worth a `@lore` comment — there isn't one.

13. **`routineId.includes("daily_digest")`** (dispatcher.ts:442) is a
    stringly-typed substring match. A routine named
    `"seed-routine-daily_digest_v2_dryrun"` will fire the real digest.
    The @lore comment acknowledges this as "decoupled from id format" —
    the opposite is true: it is coupled to ANY id containing that
    substring.

14. **`dispatcher.test.ts:345-386` tests nothing useful.** The "queue
    cap" tests explicitly note the cap is 10k so eviction isn't exercised,
    then assert `rows.toHaveLength(4)` / `toHaveLength(3)` — tautologies
    that would pass even if the cap logic were entirely removed. The
    eviction branches (`dispatcher.ts:143–171`) have zero real coverage.

15. **`pickRecipient` coupling on `adapter.name` instead of channel config.**
    `flushQueue` (line 225) uses `adapter.name` rather than the row's
    stored `channel`. If the configured channel changes between enqueue
    and flush, a row enqueued for `ntfy` might send via `smtp`. The
    stored `channel` column exists but is unused on read.

16. **Credential exposure in `notification_queue.body`/`title`?** Grep
    confirms secrets do not currently round-trip into rows; titles and
    bodies come from item / cost-cap events. Low risk, but any future
    event that embeds config fields in a title (e.g. "SMTP password
    rotated") would persist plaintext. Worth a `@lore` guardrail.

17. **SMTP adapter retriable-classification is regex-on-message.**
    `smtp-adapter.ts:78` matches `/ECONNREFUSED|...|5\d\d|4\d\d/` on the
    error string. A 4xx is marked retriable here, but 4xx SMTP codes
    (e.g. 421 "service not available") are transient; 5xx are permanent
    (550 mailbox unavailable). The nodemailer docs give the numeric code
    on `err.responseCode` — use that instead of pattern-matching the
    localized message.

## VERDICT

**REVISE** — Critical issue #1 means AC6 is not actually satisfied (the
scheduled-trigger path doesn't exist), and #2 means AC4 is violated by
the very `/flush` endpoint this feature ships. #3 creates a duplicate-
delivery window that will surface in production. Fix 1–3 before proceeding;
4–10 should be filed and addressed before general release.

## Summary

H2 ships working adapters (console/ntfy/SMTP), a coherent classification
policy, and thoughtful silence + flood queueing. However the scheduled
daily digest is non-functional: `routine_fired` has no producer in the
routine-scheduler, so AC6 relies on a manual `POST /notifications/digest`
that the AC does not mention. `flushQueue` ignores silence, so `POST
/flush` will punch through an active quiet-hours window and violate AC4.
Neither `flushQueue` nor `runDailyDigest` is transactional across send
and row-update, giving at-least-twice delivery on crash or DB error.
Secondary issues: unvalidated `status` query on `/queue`, SMTP/ntfy
adapter instances created per-push (transporter leak), silent drop on
missing recipient, unbounded queue retention, and queue-cap eviction
tests that assert tautologies rather than exercising the eviction
branches. Adapters are solid; dispatcher needs rework on reliability
(transactional boundaries, memoized adapters) and correctness
(scheduled-trigger plumbing, silence-aware flush).

(Word count ~245.)

## Files referenced

- /workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/digest.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/silence-policy.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/ntfy-adapter.ts
- /workspace/.worktrees/H2/packages/server/src/services/notifications/console-adapter.ts
- /workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts
- /workspace/.worktrees/H2/packages/server/src/app.ts
- /workspace/.worktrees/H2/packages/server/src/services/routine-scheduler.ts
- /workspace/.worktrees/H2/packages/server/src/__tests__/notifications/dispatcher.test.ts
- /workspace/.worktrees/H2/packages/server/src/__tests__/notifications/dispatcher.integration.test.ts
- /workspace/.worktrees/H2/packages/db/src/schema.ts
- /workspace/.worktrees/H2/packages/db/src/schema.pg.ts
