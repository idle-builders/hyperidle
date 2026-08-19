# notifications — destroyer verdict

## Should this service exist?

KEEP AS **in-app inbox only** — roughly 450 lines, not 2,739.

What users actually touch is small and real: the policy engine emits `notification` events, the listener writes typed rows (`typeKey`, `urgency`, `sourceLink`), the UI popover reads them (`GET /inbox`), marks them seen/read, and the Settings page mutes types. That is the whole product. Doors: `useNotifications.ts` and `useNotificationMute.ts` in `layers/core-ui/src/hooks/` — the only production clients of any notification endpoint.

Everything else — the entire push-delivery engine — is dead by construction, verified three independent ways:

1. **Off by default, no way on.** `enabled: false` in `layers/core-api/settings/src/server-config.ts:23`. The only writer is `PATCH /api/notifications/config`, and `rg` across `layers framework applications tools` finds **zero production callers** of that endpoint. No UI ever shipped for channels, recipients, or SMTP/ntfy settings. Every real install has run with delivery disabled since day one.
2. **Dead doors.** `GET/PATCH /config`, `POST /test`, `POST /flush`, `POST /digest`, `GET /queue`, `GET /api/status/digest` — the routes exist; nothing in web, desktop, agent tools, or tools/ calls any of them. Curl-only endpoints for a config no one can see.
3. **Dead trigger.** The digest fires on a routine whose id contains `daily_digest` — the only producer of such a routine is `tools/setup/src/demo-fixture.ts`. And even in the demo it no-ops because `enabled` is false.

Silence is the same story with a different mechanism: `server_config.notifications.silence` (`mode`, `silencedTeamIds`, `windowStart/End`) has **no writer anywhere** — no route, no UI. `isSilenced` returns false in every install that has ever existed. Quiet-hours prefs (`quietHoursEnabled` etc.) are PATCHable via `/api/settings` but no UI writes them either.

This is a textbook enterprise notification platform — per-channel adapters, delivery-status state machine, lease recovery, flood caps, digest batching, SSRF guards, credential encryption, secret scrubbing, retriable-error triage — built for a product whose only real notification surface is a popover in the same window.

## If written today, from scratch

Seven methods:

- `enqueue` — insert an inbox row (cap-bounded)
- `listNotifications` — `unread` (popover), `by-event-since` + `pending-by-event` (agent-health self-count/throttle)
- `markNotifications` — `read` / `seen`
- `reap` — TTL GC so the table stays bounded
- `installNotifications` — register the one event listener
- `readPreferences` / `updatePreferences` — mute toggles

No adapters, no channels, no config CRUD, no silence, no digest, no delivery statuses.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 0 |
| SIMPLIFY | 5 |
| KEEP | 2 |

Surface: 16 methods → 7 methods (56% cut). By volume the cut is deeper: ~1,600 of `install.ts`'s 1,897 lines are delivery machinery.

## Feature-level kills

1. **Push-delivery engine** (`install.ts` ~lines 90–1,660: console/ntfy/SMTP adapters, dispatcher, drain interval, flushQueue, lease recovery, adapter cache, flood cap, SSRF guard + private-IP tables, secret encryption via credentialStore, error scrubbing, SMTP retriable triage). Breaks: nothing observable — it has never been enabled in any install and cannot be enabled from the product. Also deletes the `nodemailer` + `@types/nodemailer` dependencies and the `item_created` dispatcher subscription (a second, parallel classification path next to the listener — two ways to do one thing).
2. **Daily digest, both flavors.** (a) queue-digest via `routine_fired` — trigger exists only in the demo fixture; (b) `getDailyDigest` behind `GET /api/status/digest` — zero clients (the comment at `routes/status.ts:62` claiming consumers is stale; verified by search). Breaks: nothing. Kills the `digestCron` config field and `work.listQueuedItemsSince`'s only consumer (flag to the `work` destroyer).
3. **Silence + quiet hours** (`silence-policy.ts` entirely, the dispatcher quiet-hours branch, the silence schema in `server-config.ts`, and the consumer branch in `layers/core-api/policy/src/policy-engine.ts` ~line 126 + `PolicyDeps.silence`). Config has no writer; the predicate is constant-false in production. Zero behavior change.
4. **Delivery config CRUD + secrets** (`readConfig`/`updateConfig`, sanitizers, `writeSecret`/`readSecret`, the audit-diff logger in the route — an audit trail for an endpoint nobody calls is the ETHOS anti-pattern verbatim).
5. **Six dead endpoints** in `routes/notifications-routes.ts` + `routes/status.ts` (`/config` x2, `/test`, `/flush`, `/digest`, `/queue`, `/api/status/digest`) plus their test-bucket rate limiter.
6. **Delivery-status lifecycle on the queue** (`pending/sending/sent/failed/dropped`, `attempts`, `claimedAt`, `lastError`, `channel`, `reason`) — with no deliverer, rows have no lifecycle beyond unread → seen/read → reaped. Schema-level follow-up, priced under Holes.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `getDailyDigest` | UI:GET /api/status/digest (route has zero clients) | DELETE | Endpoint nothing calls; route comment claiming consumers is stale. Kill the route too. |
| 2 | `scrubErrorMessage` | INTERNAL (export is TEST-ONLY: `delivery-helpers.test.ts`) | DELETE | Serves only delivery-engine error paths; dies with the engine, test dies with it. |
| 3 | `priorityForSeverity` | INTERNAL (export is TEST-ONLY) | DELETE | ntfy priority mapping for a channel no install has ever enabled. |
| 4 | `classifySmtpRetriable` | INTERNAL (export is TEST-ONLY) | DELETE | SMTP retry triage for a channel with no UI; prior WP already stripped SMTP dev deps. |
| 5 | `installNotifications` | BOOTSTRAP (`service-bootstrap.ts:488`) | SIMPLIFY | Boots 3 workers; 2 are dead (dispatcher routes to disabled delivery, drain flushes to nothing). Shrink to listener-only registration. |
| 6 | `deliver` | UI:POST /api/notifications/test·flush·digest (zero clients) | DELETE | All three variants serve curl-only endpoints; flush/digest additionally no-op on `enabled:false`. Kill the three routes. |
| 7 | `readConfig` | UI:GET /api/notifications/config (zero clients) | DELETE | Redacted view of config no UI renders. Kill route. |
| 8 | `updateConfig` | UI:PATCH /api/notifications/config (zero clients) | DELETE | The only writer of delivery config, and nothing calls it — proof the whole config is dead. Kill route + sanitizers + secret writes. |
| 9 | `readPreferences` | UI:GET /api/notifications/mute | KEEP | Core value: mute toggles in Settings (`SettingsNotifications.tsx` → `useNotificationMute.ts`). Named door, real user. |
| 10 | `updatePreferences` | UI:PUT /api/notifications/mute/:key | KEEP | Same door, write side. Muting a noisy type is the one notification control users have. |
| 11 | `enqueue` | EVENT:notification (listener), EVENT:session_ended (agent-health), SCHED:lifecycle-propagation tick (via `PolicyDeps.notifications.insert`) | SIMPLIFY | Core inbox write. Delete the `dedupeBy` option (zero production callers — verified) and the digest-first cap-eviction loop (delivery-era severity logic); cap becomes "drop oldest". |
| 12 | `listNotifications` | UI:GET /inbox, EVENT:session_ended (agent-health) | SIMPLIFY | 10 filter variants → 3. Keep `unread`, `by-event-since`, `pending-by-event`. Delete `all` + `by-id` (test-support, self-documented as such — test-only reachable = dead), `by-status` (dead /queue), `pending`/`pending-digest`/`by-ids`/`stuck` (delivery-engine-only). |
| 13 | `markNotifications` | UI:POST /seen, POST /:id/read | SIMPLIFY | Keep `read`/`seen` + ids/all selector. Delete `status`/`attempts`/`sentAt`/`lastError`/`claimedAt` patch fields and `onlyIfStatus` guard — all claim/lease machinery for the dead deliverer. |
| 14 | `reap` | SCHED:6h retention tick (`service-bootstrap.ts:516`) | SIMPLIFY | GC is real (bounded local DB) but the predicate is wrong post-kill: nothing reaches `sent/failed/dropped` anymore. Repoint at read/old rows past TTL; drop the `statuses` param. |
| 15 | `isInSilenceWindow` | INTERNAL (silence + quiet-hours only) | DELETE | Both consumers die: silence config has no writer, quiet-hours has no UI. |
| 16 | `isSilenced` | BOOTSTRAP → policy-engine (`service-bootstrap.ts:244`), plus dead flush path | DELETE | Constant-false in every real install — `silence` config has no writer anywhere. Kill the caller too: policy-engine's silence branch + `PolicyDeps.silence` + the schema. Zero behavior change. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `DeliverySpec` | DELETE | Dies with `deliver`. |
| `DeliveryResult` | DELETE | Dies with `deliver`. |
| `NotificationConfigPatch` | DELETE | Dies with `updateConfig`; 18 members describing channels nobody configured. |
| `SafeNotificationConfig` | DELETE | Redaction wrapper for a config endpoint nothing calls. |
| `NotificationFilter` | SIMPLIFY | 10 variants → 3 (`unread`, `by-event-since`, `pending-by-event`). |
| `NotificationSelector` | SIMPLIFY | Keep `ids`/`all`; delete `onlyIfStatus` (claim guard for the dead deliverer). |
| `NotificationPatch` | SIMPLIFY | Keep `read`/`seen`; delete the 5 delivery-lifecycle fields. |
| `NotificationsDeps` | SIMPLIFY | 6 fields → 2. `credentialCipher` + `credentialStore` die with SMTP/ntfy secrets; `users` + `teams` die with `isSilenced`; `serverConfig` shrinks to `mutedTypes`; `work` shrinks to `getItemById` (`listQueuedItemsSince` dies with the digest). |
| `NotificationChannel` | DELETE | No channels survive. |
| `Notification` | DELETE | Adapter payload type; the inbox reads DB rows, never this shape. |
| `NotificationAdapter` | DELETE | No adapters survive; the tests' FakeAdapter dies with it. |

## Holes this leaves

1. **No out-of-app ping, ever.** When the founder is away from the app, nothing emails or pushes. This hole is not new — delivery has been off-by-default and unconfigurable since it shipped; deleting the code makes reality honest. If push is ever actually wanted, build ONE channel with a UI the same day, from a real learning, not this speculative three-channel platform.
2. **Queue retention must repoint.** With delivery statuses gone, `reap(["sent","failed","dropped"])` collects nothing; unaddressed, the inbox grows to the 10k cap. The SIMPLIFY on `reap` (TTL on read/old rows) closes this — it must land in the same change, not later.
3. **Rows with delivery-era fields.** `lifecycle-propagation.ts:645` inserts `severity: "warning"` (not even in the severity union) and agent-health writes `reason`/`channel`/`status` — the queue schema keeps dead columns until a follow-up migration trims it to inbox shape (`id`, `eventType`, `subjectId`, `typeKey`, `urgency`, `title`, `body`, `sourceLink`, `createdAt`, `seenAt`, `readAt`).
4. **Tests die in bulk**: `notifications/src/__tests__/delivery-helpers.test.ts` and most of `install.test.ts`, plus the delivery/dispatcher/silence/digest integration suites under `layers/core-api/src/__tests__/` (`dispatcher`, `AF8-notification-delivery`, `R8-signal-to-noise`, `silence-policy`, `daily-digest`, parts of `notifications-routes`). They test the deleted feature; they die with it.
5. **Cross-service flags**: `@hyperidle/work.listQueuedItemsSince` loses its only consumer (route to the `work` destroyer); `framework/host-process` SSRF helpers may lose a consumer; the two SMTP/ntfy rows in the credentials store become orphans.
