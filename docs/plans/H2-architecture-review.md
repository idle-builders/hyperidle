# H2 — Architecture Review

Scope: worktree `/workspace/.worktrees/H2`, branch `feat/H2-notification-adapter`.
Read-only review against `docs/ARCHITECTURE.md` §2.9, `docs/work-packages/TRACK-H.md` §H2, `docs/plans/H2-plan.md`.

## Summary (<250 words)

H2 implements a Meta-Layer Notification Dispatcher that subscribes to `item_created`, `cost_cap_breached`, `cost_cap_warning`, and `routine_fired`, classifies each event, honors a shared silence predicate, enqueues to a persistent `notification_queue`, and dispatches through Console / Ntfy / SMTP adapters. Layer boundaries are respected: the code lives in `packages/server/src/services/notifications/`, reads/writes only its own tables + `factory_settings`, and never reaches the Agent Runtime or the Human Interface.

Sibling registration matches the codebase contract (`(db, eventBus, deps) => () => void` disposer). Silence-policy extraction is behavior-preserving and reused from `policy-engine.ts` — no duplication. SQLite and Postgres schemas for `notification_queue` are in sync, indexes match, and migration files for both drivers are additive and idempotent-safe. HTTP routes mirror the git-export router pattern (Zod strict schemas, per-field sanitizers, redaction helper, `createXRoutes(db, opts)` factory) and live behind `authMiddleware`.

Two serious architectural defects: (1) the dispatcher subscribes to `routine_fired`, but `routine-scheduler.ts` never emits that event — the digest trigger path is dead wiring; (2) plan §4.11 promised a routine-scheduler service registry so digest runs via the C5 scheduler, but the worktree did not extend `routine-scheduler.ts` and did not seed a `daily_digest` routine row. The digest therefore does not run at all in production. Also: config.ts does not own the `notifications.silence_*` / `notifications.digest_cron` keys promised in plan §4.6, `/test` and `/flush` diverge from the sibling `/config` auth pattern in one subtle way (documented below), and a redaction gap exists on ntfy base URL userinfo.

---

## Findings

### 1. Layer boundaries — PASS

- All services live in `packages/server/src/services/notifications/`. No imports reach the agent runtime or the web package.
- DB access is exclusively through Drizzle. No raw SQL in runtime code (only in generated migrations).
- The dispatcher reads its config and silence state from DB on every event — no cross-layer state.

### 2. Sibling consistency of `registerNotificationDispatcher` — MOSTLY PASS, with deviations

Compared against:
- `registerPolicyEngine(db, eventBus, options?) => () => void` (`services/policy-engine.ts:18`)
- `registerGitExportHandler(db, eventBus, opts = {}) => () => void` (`services/git-export.ts:480`)
- `registerSessionReviewCreator(db, eventBus) => () => void` (`services/session-review-creator.ts:11`)

`registerNotificationDispatcher(db, bus, deps)` (`services/notifications/dispatcher.ts:287`) matches the shape and returns a disposer.

Deviations worth flagging (none blocking):

- Param name is `bus` vs. `eventBus` used by siblings. Cosmetic; consider renaming for grep consistency.
- `DispatcherDeps.adapterFactory` is required (no default). Siblings make deps optional (`opts = {}`). This is acceptable because the app always wires it, but consider a `createAdapterFromConfig` default inside the module so tests constructing the dispatcher without an adapter factory produce a clear failure.
- Disposer semantics: the disposer sets `state.disposed = true` AND unsubscribes. Good — that matches the git-export disposer's double-guard pattern against scheduled microtasks.

### 3. Event bus contracts — DEFECT

`dispatcher.ts:404–454` subscribes to `item_created`, `cost_cap_breached`, `cost_cap_warning`, `routine_fired`. All four types exist in `packages/shared/src/events.ts:110` (`RoutineFiredEvent`).

However, `routine_fired` is NEVER emitted anywhere in production code:
- `services/routine-scheduler.ts` only calls `eventBus.emit(...)` for `session_started` (line 232) and `item_created` (line 277) in `createRoutineSession` / `createReviewItem`.
- `checkAndFireRoutine` (line 308) updates `lastRunAt`/`nextRunAt` but does not emit `routine_fired`.
- A project-wide search confirms the only reference to `routine_fired` outside shared/events.ts is in H2's own dispatcher + test. The test in `dispatcher.integration.test.ts:133` emits the event manually — it proves the handler's correctness, NOT the integration with the scheduler.

Impact: the digest code path is dead in production. AC6 (daily digest) can only be triggered manually via `POST /notifications/digest`, not by the routine-scheduler as the plan claims.

Recommendation: either (a) add `eventBus.emit({ type: "routine_fired", … })` inside `checkAndFireRoutine` on successful fire, OR (b) implement plan §4.11's service-registry escape hatch in `routine-scheduler.ts`. Option (a) is smaller and stays aligned with the event-bus-centric wiring already used by this dispatcher.

Separately: policy-engine emits the synthetic `notification` event at `services/policy-engine.ts:123`; the dispatcher does not subscribe to it. Plan §10 and §4.6 state this is intentional (the `notification` event drives the in-app Rail via WS broadcaster; the push dispatcher subscribes to the upstream sources). No duplication found — this is correct.

### 4. Silence-policy extraction — PASS, with topology note

`services/notifications/silence-policy.ts` contains the behavior previously in `policy-engine.ts`, exported as `isSilenced(db, { sourceAgentId }, now)` and `isInSilenceWindow`. `policy-engine.ts:4` imports from it as `sharedIsSilenced` and calls it at line 84. The single-source-of-truth goal of plan §4.7 is achieved.

Note: the plan §4.7 said the module would live at `packages/server/src/services/silence-policy.ts`; the worktree placed it at `services/notifications/silence-policy.ts`. This nests a shared predicate inside one of its consumers, creating a layering oddity — `policy-engine.ts` (older, non-notification module) now imports from a `notifications/` subdirectory. Recommend moving it to `services/silence-policy.ts` to reflect that it is shared. Low priority; current placement works.

### 5. `notification_queue` schema parity — PASS

- `packages/db/src/schema.ts:293` and `schema.pg.ts:293` declare the table with identical column lists, nullability, defaults, and indexes (`nq_status_created_idx`, `nq_severity_idx`).
- Column types match: `text` for all string columns (SQLite), `text` (Postgres); `integer` with `.default(0)` on `attempts`; nullable `lastError`/`sentAt`/`body`/`subjectId`/`channel`.
- `NotificationQueueRow` + `NewNotificationQueueRow` exported from both schemas. H4 will be able to exercise pg without query changes because `HyperIdleDb` abstracts the driver and all dispatcher queries use Drizzle builders.

Minor concern: neither schema adds a foreign key on `subjectId → items.id`. This is defensible (subject may be an entityId from cost_cap events, not an item id) but should be noted as deliberate.

### 6. Migration files — PASS, with ordering note

- SQLite: `packages/db/drizzle/0003_damp_wild_pack.sql` — 17 lines, `CREATE TABLE` + two `CREATE INDEX`. Additive, idempotent enough for a fresh DB (no `IF NOT EXISTS`, but Drizzle's journal guards against double-apply via `_journal.json`).
- Postgres: `packages/db/drizzle-pg/0001_useful_micromax.sql` — bundles `notification_queue` with unrelated changes (`knowledge_conflicts` new table, FK on it, knowledge_items column type changes, tasks.audit_trail column, plus three knowledge-items indexes).

The pg migration is correctly generated (it captures the entire diff since 0000), but it is LARGER than the SQLite migration because the Postgres journal skipped ahead of SQLite's. This mismatch means "migration 0003 on SQLite" and "migration 0001 on Postgres" do not correspond 1:1. Not a correctness bug — each driver's journal is independent — but it does make drift harder to audit. Recommend documenting that migration indexing diverges between drivers, or running `drizzle-kit generate` for both drivers in the same PR so the journal steps match.

Naming: `0003_damp_wild_pack` / `0001_useful_micromax` are Drizzle-auto-generated. Fine.

### 7. HTTP API consistency — MOSTLY PASS

Compared against `git-export-routes.ts`:

- `GET /config` → redacted config. Matches sibling pattern. ✓
- `PATCH /config` with Zod `strict()` schema + per-field sanitizer reason strings → 400 with `VALIDATION_ERROR` code. Matches. ✓
- `POST /test` → synthetic adapter send. Reasonable extension; no sibling equivalent to compare. ✓
- `POST /flush` → drains queue. Reasonable. ✓
- `POST /digest` → manual digest trigger. Reasonable — the fallback path when routine-scheduler wiring is missing (see §3 defect). ✓
- `GET /queue` → paginated queue view with redacted body (title only). ✓

Gaps vs. plan §4.12 and sibling behavior:

- Plan said `validateBody(flushBodySchema)` with `z.object({}).strict()` — implemented correctly.
- Auth: `authMiddleware` is applied by `app.ts:118` on all `/api/*` routes. The notification routes ride on that wiring. Consistent with siblings. ✓
- Plan §4.12 promised rate-limiting on `POST /test` (§9 "one test notification per 10s per process"). Not found in `notifications-routes.ts`. This is a security gap for an opt-in install where an authenticated operator could use `/test` to send through SMTP to any address. Recommend a simple token bucket shared across processes OR document this as deferred.
- Plan §4.6 / §9 promised redaction of the `ntfy_base_url` userinfo (if present). `sanitizeNtfyUrl` in `config.ts:355` rejects userinfo at PATCH time — good. But `readNotificationConfig` does not double-redact; if a userinfo-bearing URL ever lands in the KV via a pre-sanitizer write path it will surface in `GET /config`. Recommend a defensive redact on the read path too.
- `GET /queue` validates `status` param by string equality but accepts any value. If a caller passes `status=garbage`, Drizzle returns zero rows — not an error. Consider a `z.enum(["pending","sent","failed","dropped"])` for parity with PATCH validation.

### 8. Config via `factory_settings` — PARTIAL

Compared against `git-export-config.ts`:

- Keys prefixed with `notifications.` — matches `git_export.*` convention. ✓
- Typed loader (`readNotificationConfig`) + short-circuit loader (`loadNotificationConfig`) + patch applier (`updateNotificationConfig`) + redactor (`redactNotificationConfig`) — matches git-export shape. ✓
- Sanitizers return `SanitizeResult = { ok: true } | { ok: false; reason }` — matches git-export. ✓
- Redaction marks `passwordSet` / `authTokenSet` booleans — nice improvement over git-export's `remoteUrl` pattern (machine-readable presence flag). ✓

Divergences from plan §4.6:

- Plan listed `notifications.silence_mode`, `notifications.silence_window_start`, `notifications.silence_window_end` as aliases of the factory-wide keys. The implementation does NOT read these keys — it goes straight to `silence_mode` / `silence_window_start` / `silence_window_end` via `silence-policy.ts`. In practice this is correct (single source of truth), but it contradicts the plan's own spec. Either update plan or add aliases.
- Plan listed `notifications.digest_cron` with default `"0 8 * * *"`. Not implemented. No cron string is parsed inside the notifications module. Given §3 defect (routine-scheduler doesn't emit `routine_fired`), this key is also unnecessary today.
- `DEFAULTS.smtpHost` / `smtp_from` have no sensible defaults — consistent with spec.

### 9. Dispatcher-vs-policy-engine duplication — PASS

No duplication. `dispatcher.ts:352` calls `isSilenced(db, { sourceAgentId }, now)` from the shared module; `policy-engine.ts:84` calls the same function. Silence semantics (factory-wide + per-product + window) are owned by `silence-policy.ts` alone.

Subtle behavior difference worth noting: the dispatcher bypasses silence for `cost_breach` severity (`dispatcher.ts:351`), while policy-engine honors silence for all non-blocking items. This is intentional — a hard cost breach must page even during quiet hours — but make sure the plan makes that explicit and a test protects the invariant.

### 10. Digest scheduling integration with C5 — DEFECT (see §3)

Plan §4.11 committed to extending `routine-scheduler.ts` with a service-registry escape hatch. The worktree did not touch `routine-scheduler.ts`. Instead, the dispatcher listens for `routine_fired` events that nothing emits. The seed does not register a digest routine row.

The `POST /notifications/digest` route provides an out-of-band manual trigger that works, and the test suite uses `bus.emit({ type: "routine_fired", … })` to prove the handler itself is correct in isolation. But the end-to-end path promised by AC6 — scheduled routine → digest notification on the founder's inbox — is non-functional.

Two valid fixes:

A. Minimal: add `eventBus.emit({ type: "routine_fired", streamId, routineId, agentId, timestamp })` inside `checkAndFireRoutine` (routine-scheduler.ts:370) on successful fire, AND add a seed row for a `calendar` routine with id embedding `daily_digest`. No API changes, no scheduler refactor.

B. Plan-conforming: implement the `registerService` escape hatch as promised. Larger surface but pays dividends for later schedules.

Either is acceptable; option A keeps the story small.

### 11. Other

- `dispatcher.ts:116–123` counts the queue with `count(*)` on every enqueue. Under burst load this is an O(N) scan on inserts. Consider a bounded-cache counter or an index-only count on `status='pending'` (the existing `nq_status_created_idx` makes this cheap on Postgres; fine on SQLite at expected volumes).
- `flushQueue` (`dispatcher.ts:211`) sends serially. For a backlog of 100 rows this is fine; if digest channel is SMTP with 1s latency per send the user waits 100s on the `POST /flush` request. Consider capping per-request flush count or responding 202 + finishing async.
- `smtp-adapter.ts:78` classifies retriability via a regex over the error message. Brittle — `nodemailer` does expose error codes on the thrown error. Recommend switching to `err.code` / `err.responseCode` checks in a follow-up.
- The `ntfy-adapter` URL-encodes the topic with `encodeURIComponent` (line 79). This differs from ntfy's documented conventions where the topic is a path segment of alphanumeric/-/_ only. Since `sanitizeTopic` already restricts to `[A-Za-z0-9_-]+`, the encode is a safe no-op — keep it as defense-in-depth.

---

## Blocking items to fix before ship

1. `routine_fired` is never emitted. Either emit it from `checkAndFireRoutine` or implement the §4.11 service registry. Without this, AC6 (daily digest) is not independently verifiable end-to-end.
2. Seed does not include a `daily_digest` routine row. Add one, idempotent, per plan §4.11.

## Non-blocking recommendations

- Move `silence-policy.ts` to `services/silence-policy.ts` (out of the `notifications/` subfolder) to reflect its shared status.
- Add rate-limit to `POST /test` (plan §9).
- Validate `GET /queue?status=` against the enum.
- Defensive redact on `GET /config` for ntfy userinfo.
- Replace SMTP regex retriability with `err.code` inspection.
- Document migration-index divergence between SQLite (0003) and Postgres (0001) journals.

## Files reviewed

- `/workspace/.worktrees/H2/packages/server/src/services/notifications/types.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/silence-policy.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/digest.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/console-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/ntfy-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts`
- `/workspace/.worktrees/H2/packages/server/src/app.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/policy-engine.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/routine-scheduler.ts`
- `/workspace/.worktrees/H2/packages/db/src/schema.ts`
- `/workspace/.worktrees/H2/packages/db/src/schema.pg.ts`
- `/workspace/.worktrees/H2/packages/db/drizzle/0003_damp_wild_pack.sql`
- `/workspace/.worktrees/H2/packages/db/drizzle-pg/0001_useful_micromax.sql`
- `/workspace/.worktrees/H2/packages/shared/src/events.ts`
- `/workspace/.worktrees/H2/docs/plans/H2-plan.md`
- `/workspace/.worktrees/H2/docs/work-packages/TRACK-H.md`
- `/workspace/.worktrees/H2/docs/ARCHITECTURE.md` (§2.9)
