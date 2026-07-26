# notifications — Service-as-Product Audit (AU20)

Layer: core-api · Owns: `notificationQueue` · Current public exports: **89** · Target: **~18**

## 1. Existence / Consolidation Verdict — STANDALONE

Notifications earns its own boundary. It is a real end-user product, not infra: **get the right
alert to the right human on the right channel, respecting quiet hours and mute** — plus the in-app
notification center. It owns `notificationQueue`, runs three background workers (dispatcher,
listener, drain), owns delivery adapters (console/ntfy/smtp), and owns the digest. Nothing here
belongs inside `policy` (which only *asks* "is this silenced?" and *emits* a row) or `retention`
(which only reaps). Candidate-cluster context lists **no neighbors** (`[]`) — correct; there is no
sibling to fold into.

`isInfraPlatform: false`. Its ultimate consumer is a human (the alert, the notification-center UI),
not another service. Peer services touch it only at its two natural product seams: *emit an alert*
(policy `insert`, teams-route `enqueueNotification`) and *ask a shared predicate* (policy
`isSilenced`); retention hits the maintenance seam (`deleteReaped`). Those are product uses, not
evidence of a missing boundary.

**The AU19 "why separate" claim survives, but the export count does not.** The problem is not
existence — it is **extreme over-exposure**: 89 exports for a subsystem whose entire
adapter/digest/mute/redact/queue-CRUD pipeline is internal machinery. The barrel leaks every private
helper (18 raw queue-CRUD fns, 6 config sanitizers, 4 silence helpers, the whole adapter factory
chain, 15 DI-port types). The real external demand is ~8 coherent capabilities. Collapse hard.

## 2. Deliberate Target Public API (~18 exports, from 89)

Real demand, read from consumers:
- **Boot** (`app.ts`, `server-factory.ts`): install the 3 workers + adapter factory + default port impls.
- **Emit** (policy `insert`, teams-route `enqueueNotification`+`findPendingByEventSubject` dedupe).
- **Inbox UI** (`notifications-routes.ts`): listUnread/listByStatus, markRead, markSeenAll.
- **Silence predicate** (policy, internal dispatch): isSilenced.
- **Config page** (`notifications-routes.ts`): read/update config + 6 sanitizers + redact.
- **Preferences** (`notifications-routes.ts`): getMutedTypeKeys, defaultMutePreferenceWriter.
- **Digest** (`status.ts` getDailyDigest; route dispatchDigest).
- **Retention** (`retention-reaper.ts`): deleteReaped.

### Functions (12)

| Interface | Shape | Subsumes | Why it is a shared capability |
|---|---|---|---|
| `installNotifications` | `(deps: NotificationsDeps) => Handle` | registerNotificationDispatcher, registerNotificationListener, startNotificationDrain, defaultNotificationAdapterFactory, defaultMutePreferenceReader/Writer, recoverStuckLeases, flushQueue(boot), NOTIFICATION_DRAIN_INTERVAL_MS, createConsoleAdapter, applyAlertPreferences | One "wire this subsystem into the app" call. The composition root wants a subsystem, not 12 loose workers. Adapter choice is internal (driven by config). |
| `enqueue` | `(input, { dedupeBy? }) => id` | enqueueNotification, insertNotification, findPendingByEventSubject, tryFloodReserve | The single emit seam. Dedupe-by-event-subject and flood-reserve become options, not separate caller-visible probes. |
| `listNotifications` | `(filter) => Notification[]` | listUnread, listByStatus, listAll, listByIdsWithStatus, listPending, listPendingDigest, listStuckLeases, queueCountByStatus, claimForSend, findById | filter = `{status?, unread?, ids?, forDigest?, stuck?, count?}`. One parameterized read replaces nine hand-carved list variants. |
| `markNotifications` | `(selector, patch) => n` | markRead, markSeenAll, updateStatus, updateManyByIds, requeueLease | selector = `{ids}\|{all}`; patch = `{read?, seen?, status?}`. One transition replaces four bespoke writers. |
| `isSilenced` | `(context) => boolean` | isSilenced, isFactorySilenced, isInSilenceWindow, readSilenceWindow | The shared decision (factory-silence ∨ quiet-hours ∨ team-silence ∨ severity) used by policy AND internal dispatch. The 3 sub-predicates fold in as internal rules. |
| `readConfig` | `() => SafeNotificationConfig` | readNotificationConfig, loadNotificationConfig, redactNotificationConfig, pickRecipient | Redaction/recipient-pick are read-side internals, never separate exports. |
| `updateConfig` | `(patch) => SafeNotificationConfig` | updateNotificationConfig, sanitizeCron/Email/NtfyUrl/SmtpCredential/SmtpHost/Topic, assertNtfyUrlNotSSRF | Validation+sanitization+SSRF-guard run *inside* the write. Callers stop hand-sanitizing 6 fields one-by-one. |
| `readPreferences` | `() => NotificationPreferences` | getMutedTypeKeys, defaultMutePreferenceReader | Mute keys + alert prefs as one read. |
| `updatePreferences` | `(patch) => NotificationPreferences` | defaultMutePreferenceWriter, AlertPreferences apply | One write seam for mute/alert prefs. |
| `getDailyDigest` | `() => DailyDigest` | getDailyDigest | The digest projection (status route). |
| `runDigest` | `({ window? }) => DigestResult` | runDailyDigest, dispatchDigest | Trigger; window-parameterized (daily today, weekly tomorrow, no new method). |
| `reap` | `(cutoff) => n` | deleteReaped | Retention maintenance seam. |

### Public types (~6)
`Notification`, `NotificationChannel`, `NotificationConfigPatch`, `SafeNotificationConfig`,
`NotificationsDeps` (the ONE install-deps type, collapsing all 15 `Notifications*Deps`/`*Reader`/
`*Port`/`*Cipher`/`*Store` port interfaces), `DailyDigest`.

**Everything else goes internal**: adapter chain (NotificationAdapter, AdapterFactory,
ConsoleAdapterOptions, SendResult, scrubErrorMessage, ScrubContext, console/ntfy/smtp adapters),
Recipient, Classification, QueueReason, NotificationSeverity, NotificationQueuePatch, and the 14
other port types — all machinery behind the 12 functions.

## 3. Inside Lens

Module layout is already clean (one module owns the table, DI ports isolate outbound edges). The
redesign is almost entirely a **barrel diet**: stop re-exporting internals. `notification-queue.ts`
stays the sole table-toucher but exposes only `enqueue/listNotifications/markNotifications/reap` to
the barrel; `claimForSend/findById/updateManyByIds/requeueLease/listStuckLeases` become
module-private, called by dispatcher/drain/digest directly within the package. Config validation
moves *inside* `updateConfig` (sanitizers become private). The 15 port interfaces collapse into one
`NotificationsDeps` bag consumed only by `installNotifications`. Adapter selection moves inside
install (config-driven), so no consumer ever names an adapter type. New delivery channel or silence
rule = new internal file, zero barrel churn.

## 4. Scaling Argument (sub-linear)

Add dozens of services and hundreds of calls — the barrel does **not** grow:
- "list notifications for team T / for a digest / that are stuck" → `listNotifications({teamId})` /
  `{forDigest}` / `{stuck}` — filter fields, **no new method**. (Contrast today: each spawned its
  own `listByStatus`/`listPendingDigest`/`listStuckLeases`.)
- "add SMS channel" → extend `NotificationChannel` union + internal adapter; barrel unchanged.
- "add per-project mute" → new `context` field on `isSilenced` + internal rule; **no export**.
- "weekly digest" → `runDigest({window:'weekly'})`; parameter, not `runWeeklyDigest`.
- "new emitter service" → calls existing `enqueue`; composes, adds nothing.

Method-per-intent (today) is O(use-cases); parameterized-by-filter (target) is O(1) in the barrel.

## 5. Key Collapses

1. **18 queue-CRUD fns → 4** (`enqueue`, `listNotifications`, `markNotifications`, `reap`).
2. **13 config exports → 2** (`readConfig`, `updateConfig`); 6 sanitizers + SSRF-guard + redact +
   pickRecipient all internalized into the write/read.
3. **Entire adapter chain → 0 external** (createConsoleAdapter, defaultNotificationAdapterFactory,
   AdapterFactory, NotificationAdapter, ConsoleAdapterOptions, SendResult, scrubErrorMessage,
   ScrubContext, assertNtfyUrlNotSSRF) — absorbed into `installNotifications`, config-driven.
4. **15 DI-port types → 1** `NotificationsDeps`.
5. **~9 boot/worker exports → 1** `installNotifications`.
6. **4 silence-policy exports → 1** `isSilenced`; **5 mute exports → readPreferences/updatePreferences**.

Net: **89 → ~18**.
