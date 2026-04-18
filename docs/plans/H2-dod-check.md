# H2 — Notification Adapter — Definition of Done Audit

Auditor: independent QA.
Worktree: `/workspace/.worktrees/H2`.
Date: 2026-04-18.

Test command: `bun run test packages/server/src/__tests__/notifications` → **56 passed / 0 failed** across 7 files.
Full suite: `bun run test` → **1301 passed / 1 skipped**.
`bun run check` → zero type errors. `bun run lint` → zero errors (66 pre-existing warnings unrelated to H2).

---

## Acceptance Criteria Evidence

### AC1 — Console adapter logs a blocking item

- **Prod code:** `/workspace/.worktrees/H2/packages/server/src/services/notifications/console-adapter.ts`, wired as the default factory branch in `/workspace/.worktrees/H2/packages/server/src/app.ts:49-69` (`defaultNotificationAdapterFactory` → `createConsoleAdapter()`).
- **Tests:** `/workspace/.worktrees/H2/packages/server/src/__tests__/notifications/console-adapter.test.ts:34-64` asserts the adapter logs title + severity + recipient + bodyLength + deepLink through the injected `Logger`; no `console.log`. AC1 validated.

### AC2 — Ntfy adapter sends to a topic

- **Prod code:** `/workspace/.worktrees/H2/packages/server/src/services/notifications/ntfy-adapter.ts` — wired in `app.ts:51-55` when `primaryChannel === "ntfy"`.
- **Tests:** `/workspace/.worktrees/H2/packages/server/src/__tests__/notifications/ntfy-adapter.test.ts:65-89` posts to a real local HTTP fixture on `127.0.0.1:0`; asserts method=POST, path=`/<topic>`, `Title`/`Priority`/`Tags` headers, plain-text body. Bearer auth covered at 91-105, 5xx retriable at 107-125, 4xx non-retriable at 127-145, invalid topic at 147-165, and non-loopback `http://` rejected at 167-169. AC2 validated.

### AC3 — SMTP adapter delivers email

- **Prod code:** `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts` — wired in `app.ts:56-66`.
- **Tests:** `/workspace/.worktrees/H2/packages/server/src/__tests__/notifications/smtp-adapter.test.ts:85-112` runs an in-process `smtp-server` (MailHog substitute, documented in H2-plan §4.10), asserts envelope from/to + Subject/To/From/body. `114-131` covers unreachable server path; `133-159` proves CRLF header-injection protection. AC3 validated.

### AC4 — Silence mode queues items, doesn't push

- **Prod code:** `dispatcher.ts:550-565` calls `isSilenced(...)` and writes the queue with `reason="silence"`, returning before `dispatchPush`.
- **Tests:** `/workspace/.worktrees/H2/packages/server/src/__tests__/notifications/dispatcher.test.ts:222-242` fires a blocking item while `silence_mode=true`; asserts adapter.calls empty and queue row `severity="blocking"`, `reason="silence"`. `244-284` validates `flushQueue` drains after silence is lifted. `564-611` proves blocking stays deferred during silence while digest flushes. AC4 validated.

### AC5 — Push policy: only blocking + cost breaches

- **Prod code:** `dispatcher.ts:64-79` (`classifyItem`, `classifyCostBreach`, `classifyCostWarning`).
- **Tests:** `dispatcher.test.ts:134-148` (blocking pushes), `150-172` (hard cost_cap_breached pushes), `174-201` (cost_cap_warning routed to digest queue, NOT pushed), `203-220` (low-risk non-blocking → dropped; neither push nor queue). AC5 validated.

### AC6 — Daily digest accumulates and sends

- **Prod code:** `dispatcher.ts:636-654` subscribes to `routine_fired`; filters by `routineId.includes("daily_digest")`; invokes `runDailyDigest` via `queueMicrotask`. Seed: `/workspace/.worktrees/H2/packages/db/src/seed.ts:198-213` creates routine id `seed-routine-daily_digest` (cron `0 8 * * *`).
- **Tests:** `dispatcher.test.ts:504-554` validates batched notification body contains all three pending rows + rows flip to `sent`. `routine-digest.integration.test.ts:144-183` runs the full scheduler → event bus → dispatcher path: `checkAndFireRoutine` → `routine_fired` → `runDailyDigest` → adapter called → queue rows `sent`. `dispatcher.integration.test.ts:133-165` proves wiring via `createApp`. AC6 validated end-to-end.

---

## Additional Invariants

| Invariant | File:line | Verdict |
|---|---|---|
| `/test` rate limit returns 429 + Retry-After | `notifications-routes.test.ts:264-284` + `notifications-routes.ts:191,226-235` | Pass |
| SSRF blocklist rejects 169.254.169.254 | `notifications-routes.test.ts:203-212` + `config.ts:424-453` | Pass |
| SSRF blocklist rejects RFC1918 (10.0.0.5) | `notifications-routes.test.ts:214-221` | Pass |
| SSRF blocklist rejects `.local` mDNS | `notifications-routes.test.ts:223-230` | Pass |
| GET /config redacts SMTP password + ntfy token | `notifications-routes.test.ts:75-110` + `config.ts:196-221` | Pass |
| At-least-once replay of crashed send | `dispatcher.test.ts:800-834` (`recoverStuckLeases` → next flush re-sends) | Pass |
| `daily_digest` seed routine exists | `seed.ts:198-213` (`seed-routine-daily_digest`, `active: 0` by design — operator must enable; @lore documented) | Pass |
| SMTP subject CRLF header injection stripped | `smtp-adapter.test.ts:133-159` + `smtp-adapter.ts:116` | Pass |
| Config PATCH audit log redacts secrets | `notifications-routes.test.ts:295-347` | Pass |
| `smtpIgnoreTls=true` rejected in production | `notifications-routes.test.ts:250-262` + `smtp-adapter.ts:46-50` (runtime guard) | Pass |

## Production Wiring

`createApp` in `app.ts:139-149` installs `registerNotificationDispatcher(db, eventBus, {adapterFactory})` as a real subscriber to the event bus. `defaultNotificationAdapterFactory` picks ntfy/smtp/console from `cfg.primaryChannel`. Disposers flow through `disposeApp` → `APP_DISPOSERS` WeakMap. The dispatcher subscribes to `item_created`, `cost_cap_breached`, `cost_cap_warning`, `routine_fired` (real events, not test-injected). Three integration tests in `dispatcher.integration.test.ts` prove the wired app reacts to each event from the shared bus.

## Gaps / Observations

None rising to the level of rework. Observations worth noting:

- `seed-routine-daily_digest` is `active: 0` by design, so a fresh factory will NOT auto-fire 08:00 UTC until the operator flips it. This is spec-compliant and `@lore`-documented (`seed.ts:164-168`).
- The dispatcher matches digest routines by `routineId.includes("daily_digest")` (substring, not exact). Intentional per the `@lore` on `dispatcher.ts:638-642` so id renames do not break wiring, but a routine id that accidentally contains the substring would trigger the handler. Acceptable tradeoff.

---

## Verdict

**READY TO SHIP.**

All 6 acceptance criteria have named tests asserting the AC (not just `toBeDefined()`); production code is wired into `createApp` and reacts to real event-bus events. Rate limiter, SSRF defense, secret redaction, CRLF injection protection, at-least-once replay, and seed routine invariants are all covered with passing tests. `bun run check` + `bun run lint` + full `bun run test` (1301/1301) green.
