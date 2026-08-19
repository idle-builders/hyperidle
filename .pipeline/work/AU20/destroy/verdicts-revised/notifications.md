# notifications — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

The first wave's central argument — "enterprise notification platform for a product whose only
notification surface is a popover in the same window" — is void under **Ruling 1**. The product is a
shared backend for a team and an organisation of teams. Reaching a human who is *not* looking at the
app is exactly what outbound notification is for: an agent blocked on an approval (A1 FINISH) with
the approver away from the app is a broken core loop without it. So a minimal outbound path is now
core, not enterprise reflex.

That rescues the **config write path and one channel** — nothing else. Everything with no writer, no
trigger, or no reader still dies on its own terms.

Rows whose verdict moved (7):

| Row | Old | New | Ruling |
|---|---|---|---|
| `deliver` | DELETE | SIMPLIFY | Ruling 1 — test-send becomes the settings UI's "does my SMTP work" button; flush/digest variants still die |
| `readConfig` | DELETE | FINISH | Ruling 1 — the read side of the delivery-settings UI that was never built |
| `updateConfig` | DELETE | FINISH | Ruling 1 — the only config writer; the missing half is the UI that calls it |
| `DeliverySpec` | DELETE | SIMPLIFY | Ruling 1 — shrinks with `deliver` to the test variant |
| `DeliveryResult` | DELETE | SIMPLIFY | Ruling 1 — same |
| `NotificationConfigPatch` | DELETE | SIMPLIFY | Ruling 1 — 18 members → ~7 (enabled + SMTP fields); recipient/ntfy/flood/digest/test-cap fields still die |
| `SafeNotificationConfig` | DELETE | SIMPLIFY | Ruling 1 — redaction is legit once a UI reads config back |

Verdict unchanged, substance changed (2):

- `installNotifications` — still SIMPLIFY, but the surviving shape is listener + one inline urgent
  send, not listener-only.
- `NotificationsDeps` — still SIMPLIFY, but the membership flips: `users`, `credentialStore`,
  `credentialCipher` now **survive** (per-user email addressing from OIDC identity; SMTP password at
  rest reuses the credential infra A5 keeps). `teams` still dies with silence.

**What did NOT change — dead is still dead, on its own terms, at any user count:**

- Silence (`isSilenced`, `isInSilenceWindow`, the `silence` schema): **no writer anywhere** — no
  route, no UI. Re-confirmed with `rg -a` across `layers framework applications tools`: only the
  schema defaults (`settings/src/server-config.ts:43–44`) and the reader. Constant-false since day
  one. DELETE.
- Quiet-hours prefs: PATCHable via `/api/settings` but **zero UI writers** (re-confirmed; only route
  plumbing and an e2e fixture). DELETE.
- Daily digest, both flavors: trigger exists only in `tools/setup/src/demo-fixture.ts:225`
  (`demo-routine-daily_digest`); `GET /api/status/digest` has zero clients. A team premise adds no
  reader. DELETE.
- Delivery-status state machine, lease recovery, drain worker, flood cap, adapter cache, SSRF guard,
  ntfy + console channels, SMTP retry triage, error scrubbing: judged on readers — with a fire-once
  inline send, nothing reads `pending/sending/sent/claimedAt/attempts`, nothing recovers leases,
  and ntfy/console die as second and third ways to do one thing. DELETE, all of it.

## Should this service exist?

KEEP AS **in-app inbox + one outbound channel a team can actually turn on**.

The inbox half is unchanged from the first wave: policy engine emits `notification` events, the
listener writes typed rows, the popover reads them (`useNotifications.ts`), Settings mutes types
(`useNotificationMute.ts`). Real doors, real users.

The outbound half is re-judged under Ruling 1. In a shared deployment humans are away from the app
while agents run; approvals, mentions, and urgent failures must reach them or the human-in-the-loop
stalls. The engine's delivery core demonstrably works (dispatcher + adapters carry unit and
integration coverage: `AF8-notification-delivery`, `install.test.ts`); what never existed is a
**writer for its config** — `enabled: false` by default, and the only writer (`PATCH
/api/notifications/config`) has zero production callers. The verdict is FINISH the writer (a
delivery-settings UI), not delete the engine — but finish it at one-channel size, and delete the
platform around it.

One channel: **email (SMTP)**. Every teammate already has an address — OIDC supplies it per user —
while ntfy needs every human to install an app and subscribe to a topic. Additional channels are
exactly what the event extension surface is for (Ruling 2): a plugin subscribing to `notification`
events can deliver anywhere. The three-channel platform never returns to core.

## If written today, from scratch

For a team on a shared backend, OIDC identity, plugins on the event stream. Ten methods:

- `enqueue` — insert an inbox row, cap-bounded (drop oldest)
- `listNotifications` — `unread` (popover), `by-event-since` + `pending-by-event` (agent-health)
- `markNotifications` — `read` / `seen`
- `reap` — TTL GC on read/old rows
- `installNotifications` — the one event listener; for urgent, unmuted rows with an addressable
  recipient, fire one inline email send — no queue lifecycle, no retry, no lease
- `readPreferences` / `updatePreferences` — mute toggles
- `readConfig` / `updateConfig` — SMTP settings behind a real settings screen (FINISH)
- `deliver` — test-send only, the settings screen's "verify it works" button

Per-user is the honest team shape and the current code is not it — named in Holes, not silently
absorbed: inbox rows carry no `userId` (every teammate shares one inbox and one read/seen state),
mutes are global (one human muting a type silences the whole org), and outbound addressing is a
single global `recipientEmail` instead of the recipient user's OIDC email. The from-scratch shape
scopes rows and mutes per user and addresses outbound mail from the user row.

No adapters abstraction, no channel union, no silence, no quiet hours, no digest, no flood cap, no
delivery statuses, no lease recovery, no ntfy, no console channel.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| FINISH | 2 |
| MERGE | 0 |
| SIMPLIFY | 6 |
| KEEP | 2 |
| PLUGIN | 0 |

Surface: 16 methods → 10 methods (38% cut). By volume the cut stays deep: of `install.ts`'s ~1,600
delivery lines, only the SMTP send path, config CRUD, and test-send survive (~350 lines); ntfy +
console adapters, dispatcher state machine, drain worker, lease recovery, flood cap, adapter cache,
SSRF guard, digest, and silence all still go. PLUGIN is 0 because nothing here is Ruling-3 ritual —
extra channels are future plugins, but no existing code re-provides as one.

## Feature-level kills

1. **Two of three channels + the adapter abstraction** (ntfy adapter, console adapter,
   `NotificationAdapter`/`Notification`/`NotificationChannel`, priority mapping, SSRF guard +
   private-IP tables, ntfy auth token). One channel, hardcoded, composed from the row. Breaks:
   nothing — neither channel was ever enabled in any install.
2. **Queue-based delivery lifecycle** (delivery statuses `pending/sending/sent/failed/dropped`,
   `attempts`, `claimedAt`, `lastError`, drain interval, flushQueue, lease recovery, `onlyIfStatus`
   claim guard, SMTP retry triage, error scrubbing). Replaced by fire-once inline send at listener
   time; a failed send logs via observability and the row is still in the inbox — the inbox IS the
   fallback. Breaks: a transient SMTP failure loses that one email. Acceptable; the row survives.
3. **Flood cap + coalescing** (`floodMaxPerMinute`, `floodCoalesceWindowMs`, window state). The real
   flood control is "only urgent, unmuted rows go outbound." Breaks: a storm of urgent events sends
   a storm of emails — fix the storm at the policy engine, not with rate-limit machinery.
4. **Daily digest, both flavors** (`getDailyDigest`, `GET /api/status/digest`, the `routine_fired`
   digest worker, `digestCron`, `pending-digest`/`stuck` filters, `work.listQueuedItemsSince` — flag
   to the `work` destroyer stands). Demo-only trigger, zero-client route. If a team ever wants a
   digest it is a plugin on routines + events (Ruling 2), not core.
5. **Silence + quiet hours** (`silence-policy.ts` entirely, the silence schema, the quiet-hours
   branch, policy-engine's silence consumer + `PolicyDeps.silence`, `teams` dep). No writer has ever
   existed for either. Zero behavior change.
6. **Dead endpoints**: `POST /flush`, `POST /digest`, `GET /queue`, `GET /api/status/digest` die.
   `GET/PATCH /config` and `POST /test` **live** — they become the settings screen's backend
   (FINISH). The route-level audit-diff logger on config PATCH still dies (ETHOS: audit trail
   nobody reads).
7. **Single-recipient config** (`recipientEmail`, `recipientNtfyTopic`). Single-user relics.
   Outbound mail addresses the recipient user's email from their user row (OIDC-fed).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `getDailyDigest` | UI:GET /api/status/digest (zero clients) | DELETE | Demo-only trigger, zero-client route — dead on its own terms at any team size. Digest-as-plugin if ever wanted. |
| 2 | `scrubErrorMessage` | INTERNAL (export TEST-ONLY) | DELETE | Serves the retry/error paths of the platform being cut; fire-once send logs via observability. Preemptive-security reflex. |
| 3 | `priorityForSeverity` | INTERNAL (export TEST-ONLY) | DELETE | ntfy priority mapping; ntfy dies — email is the one channel. |
| 4 | `classifySmtpRetriable` | INTERNAL (export TEST-ONLY) | DELETE | Retry triage for a retry machine that dies; fire-once + inbox fallback needs no triage. |
| 5 | `installNotifications` | BOOTSTRAP (`service-bootstrap.ts:488`) | SIMPLIFY | 3 workers → 1: listener that writes the row and inline-sends urgent unmuted ones. Dispatcher state machine, drain worker, lease recovery die. |
| 6 | `deliver` | UI:POST /test·flush·digest (zero clients today) | SIMPLIFY | Was DELETE; Ruling 1. Keep test-send as the settings screen's verify button. flush/digest variants and their routes die. |
| 7 | `readConfig` | UI:GET /api/notifications/config (zero clients today) | FINISH | Was DELETE; Ruling 1. Read side of the delivery-settings UI that was never built. Redaction stays. |
| 8 | `updateConfig` | UI:PATCH /api/notifications/config (zero clients today) | FINISH | Was DELETE; Ruling 1. The only config writer; build the UI that calls it, shrink the patch to enabled + SMTP. Kill recipient/ntfy/flood/digest sanitizers and the smtpIgnoreTls carve-out. |
| 9 | `readPreferences` | UI:GET /api/notifications/mute | KEEP | Core value: mute toggles in Settings, named door, real users. Per-user mutes are the honest team shape — priced in Holes. |
| 10 | `updatePreferences` | UI:PUT /api/notifications/mute/:key | KEEP | Same door, write side. |
| 11 | `enqueue` | EVENT:notification, EVENT:session_ended, SCHED:lifecycle-propagation tick | SIMPLIFY | Core inbox write. Delete `dedupeBy` (zero production callers) and digest-first cap eviction; cap = drop oldest. |
| 12 | `listNotifications` | UI:GET /inbox, EVENT:session_ended | SIMPLIFY | 10 filters → 3: `unread`, `by-event-since`, `pending-by-event`. `all`/`by-id` test-only; `by-status`/`pending`/`pending-digest`/`by-ids`/`stuck` die with queue lifecycle. |
| 13 | `markNotifications` | UI:POST /seen, POST /:id/read | SIMPLIFY | Keep `read`/`seen` + ids/all. Delete `status`/`attempts`/`sentAt`/`lastError`/`claimedAt` fields and `onlyIfStatus` — lease machinery for a deleted deliverer. |
| 14 | `reap` | SCHED:6h retention tick (`service-bootstrap.ts:516`) | SIMPLIFY | Repoint at read/old rows past TTL; drop the `statuses` param — no row reaches `sent/failed/dropped` anymore. |
| 15 | `isInSilenceWindow` | INTERNAL (silence + quiet-hours only) | DELETE | Both consumers have no writer anywhere — re-confirmed. Dead regardless of user count. |
| 16 | `isSilenced` | BOOTSTRAP → policy-engine (`service-bootstrap.ts:244`) | DELETE | `silence` config has no writer; constant-false in every install that has ever existed. Kill the policy-engine branch + `PolicyDeps.silence` + schema. Team-wide hush, if ever wanted, gets built from a real learning. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `DeliverySpec` | SIMPLIFY | Was DELETE; Ruling 1. Shrinks to the test variant. |
| `DeliveryResult` | SIMPLIFY | Was DELETE; Ruling 1. Survives with test-send. |
| `NotificationConfigPatch` | SIMPLIFY | Was DELETE; Ruling 1. 18 members → ~7: `enabled`, `smtpHost/Port/Secure/Username/Password/From`. Recipient, ntfy, flood, digestCron, testMaxPerHour, smtpIgnoreTls die. |
| `SafeNotificationConfig` | SIMPLIFY | Was DELETE; Ruling 1. Redaction is legit once the settings UI reads config back. |
| `NotificationFilter` | SIMPLIFY | 10 variants → 3 (`unread`, `by-event-since`, `pending-by-event`). |
| `NotificationSelector` | SIMPLIFY | Keep `ids`/`all`; delete `onlyIfStatus`. |
| `NotificationPatch` | SIMPLIFY | Keep `read`/`seen`; delete the 5 delivery-lifecycle fields. |
| `NotificationsDeps` | SIMPLIFY | 6 → 5, different five than the first wave: keep `serverConfig` (shrunk), `credentialCipher` + `credentialStore` (SMTP password at rest, reusing the credential infra A5 keeps), `users` (per-user email addressing — Ruling 1); delete `teams` (silence-only); `work` shrinks to `getItemById`. |
| `NotificationChannel` | DELETE | One hardcoded channel needs no union. |
| `Notification` | DELETE | Adapter payload; compose the email from the DB row directly. |
| `NotificationAdapter` | DELETE | Adapter abstraction over one channel is a wrapper; FakeAdapter tests die with it. |

## Holes this leaves

1. **The FINISH is real work, not a survivor.** Until the delivery-settings UI ships, outbound email
   remains exactly as unreachable as today (`enabled: false`, no writer). The FINISH must include:
   the settings screen calling `GET/PATCH /config` + `POST /test`, per-user addressing from the user
   row's OIDC email, and the listener's inline urgent send. Countable work — do not book it as KEEP.
2. **Per-user scoping gap (Ruling 1).** Inbox rows have no `userId` — one shared inbox, shared
   read/seen state for the whole team; mutes are global. Works crudely for one team, wrong for an
   organisation. Needs a follow-up: recipient column on the queue, mutes keyed by user. Without it,
   outbound "email the approver" has to derive its recipient from the event payload each time.
3. **Transient email loss.** Fire-once send means a flaky SMTP moment drops that one email; the
   inbox row remains. Accepted trade for deleting the retry/lease/status machine.
4. **Reap must repoint in the same change** as the status-machine deletion, or the inbox grows to
   the 10k cap.
5. **Schema debt.** Queue keeps dead columns (`status`, `attempts`, `claimedAt`, `lastError`,
   `channel`, `reason`) until a follow-up migration trims to inbox shape + recipient;
   `lifecycle-propagation.ts:645` still inserts `severity: "warning"` (not in the union).
6. **Tests.** Silence/digest/dispatcher-lifecycle suites die with their features
   (`silence-policy`, `daily-digest`, `R8-signal-to-noise`, dispatcher lease/flood cases, FakeAdapter
   suites). `AF8-notification-delivery` shrinks to cover the one surviving send path instead of
   dying — the finished feature needs it.
7. **Cross-service flags stand**: `@hyperidle/work.listQueuedItemsSince` loses its only consumer
   (route to `work` destroyer); `framework/host-process` SSRF helpers may lose a consumer; the ntfy
   credential row orphans. The SMTP credential row now has a live owner.
