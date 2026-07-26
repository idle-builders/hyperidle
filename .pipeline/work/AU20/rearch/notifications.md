# notifications — Service-as-Product Re-Architecture (AU20, BOTH lenses)

Layer: core-api · Owns: `notificationQueue` (1 table) · Now: 66 methods / 44 types (23 exposed)
· **Target: 12 methods / 10 types**

The prior pass (analysis/services/notifications.md) designed the OUTSIDE only — it shrank the
barrel to ~18–20 but left every internal function in place as a "package-internal helper," so the
code did not shrink. This pass anchors INSIDE-OUT from the substrate, derives the floor, and treats
the collapse as **deletion**, not re-labeling.

---

## 1. INSIDE-OUT (the anchor)

### Substrate: OWNED DB TABLES — `notificationQueue` (1 table)
The durable thing this service owns is a **queue** of notification rows (status pending → sending →
sent/dropped, plus read/seen flags for the in-app inbox). That table is the substrate. The delivery
channels (console/ntfy push, SMTP email) are an **external-API facet layered on top** — a genuine
owned capability, but not the substrate. Config + mute preferences are NOT owned tables (they live
in `settings`' `ServerConfig`, reached via the `serverConfig` DI port); this service owns only the
*logic* over them (sanitize / SSRF-guard / redact), not the storage.

### The FLOOR: ~5 CRUD ops over the 1 owned table → land at 4
- **create** → `enqueue` (insert + dedupe-by-event-subject + flood-cap eviction folded in)
- **read (get+list)** → `listNotifications(filter)` — get-by-id is `filter:{kind:"by-id"}`, so the
  two collapse into one
- **update/transition** → `markNotifications(selector, patch)` (read/seen flags + status
  transitions: claim, requeue, complete, revert — all one parameterized write)
- **delete** → `reap(cutoff, statuses)` (age-based terminal-status GC)

Floor = 5 for a 1-table service; the queue lands at **4** (get folded into list).

### Genuine owned capabilities ABOVE the floor (8)
1. **Delivery engine (external-channel adapter).** The service adapts three outbound channels
   (console/ntfy/SMTP) behind ONE `NotificationAdapter`. Its coherent surface is two ops, not one
   per channel and not one per trigger:
   - `installNotifications(deps, opts)` — lifecycle: wire + run the 3 background workers
     (dispatcher / listener / drain), return a disposer. The composition root wants a subsystem, not
     12 loose workers; adapter selection is config-driven and internal.
   - `deliver(spec)` — the unified one-shot drive-op over the engine. `spec` discriminates the
     intent: `{kind:"flush"}` (drain pending queue) | `{kind:"digest", window?}` (batched digest
     send) | `{kind:"test", channel?}` (config-verify send, does not touch the queue). Discriminated
     return. This FUSES the current `flush` + `runDigest` + `sendTest` — three flavors of "push
     notifications through the configured channels" — into one product capability parameterized by
     intent. New trigger (e.g. weekly digest) = a `window`/`kind` value, not a new method.
2. **Silence policy (owned internal logic).** `isSilenced(context, deps)` — the shared decision
   (factory-silence ∨ quiet-hours window ∨ per-team silence ∨ severity) consumed by `policy` AND by
   internal dispatch. The 3 sub-predicates (`isFactorySilenced`, `isInSilenceWindow`,
   `readSilenceWindow`) fold in as private rules.
3. **Delivery config (owned validation logic over settings-backed storage).**
   `readConfig` (redacted read) + `updateConfig` (validate → sanitize 8 fields → SSRF-guard →
   persist → redact). Sanitizers/redact/SSRF-guard run INSIDE these two; callers never hand-sanitize.
4. **Mute preferences.** `readPreferences` (muted type keys) + `updatePreferences(typeKey, muted)`.
5. **Digest projection.** `getDailyDigest` — READ projection of the day's activity (status page);
   distinct from `deliver({kind:"digest"})` which SENDS it.

---

## 2. OUTSIDE-IN (real consumer demand)

From `service-data-23.json` the only recorded cross-service consumer is **`policy`**, requesting
`isSilenced` (shared predicate) and `insert` (= `enqueue`, the emit seam). The remaining real demand
is in-package routes + boot (read from source):
- **Boot** (`server-factory`/`app`): wire the 3 workers + adapter factory → `installNotifications`.
- **Emit** (policy `insert`, `teams-routes` enqueue+dedupe) → `enqueue({dedupeBy})`.
- **Inbox UI** (`notifications-routes` GET /inbox, /queue; mark-read; mark-seen-all) →
  `listNotifications(filter)` + `markNotifications(selector, patch)`.
- **Silence** (policy + internal dispatch) → `isSilenced`.
- **Config page** (`notifications-routes` GET/PATCH config) → `readConfig` / `updateConfig`.
- **Preferences** (`notifications-routes` mute toggle) → `readPreferences` / `updatePreferences`.
- **Admin actions** (POST /flush, /digest, /test) → `deliver(spec)`.
- **Status page** digest tile → `getDailyDigest`.
- **Retention** (`retention-reaper`) → `reap`.

Every demand maps to a general parameterized interface — no method-per-caller.

---

## 3. THE COHERENT PRODUCT API (12 methods, 10 types)

| # | Interface | Shape | Lens | Source |
|---|---|---|---|---|
| 1 | `enqueue` | `(db, input, opts?:{dedupeBy?}) => Promise<id>` | both | table create; policy `insert`, teams emit |
| 2 | `listNotifications` | `(db, filter:NotificationFilter) => Promise<Notification[]>` | both | table read; inbox UI, dispatch, digest, dedupe |
| 3 | `markNotifications` | `(db, selector, patch) => Promise<number>` | both | table update; mark-read/seen, claim/requeue/complete |
| 4 | `reap` | `(db, cutoff, statuses) => Promise<id[]>` | outside-in | table delete; retention |
| 5 | `installNotifications` | `(db, bus, deps, opts?) => () => void` | both | delivery-engine lifecycle; boot |
| 6 | `deliver` | `(db, spec:DeliverySpec, deps, opts?) => Promise<DeliveryResult>` | both | delivery-engine drive; POST /flush /digest /test |
| 7 | `isSilenced` | `(input, deps) => Promise<boolean>` | both | owned silence logic; policy + dispatch |
| 8 | `readConfig` | `(db, deps) => Promise<SafeNotificationConfig>` | both | owned config logic; config page |
| 9 | `updateConfig` | `(db, patch, deps) => Promise<SafeNotificationConfig>` | both | owned config logic; config page |
| 10 | `readPreferences` | `(db, deps) => Promise<NotificationTypeKey[]>` | outside-in | mute domain; prefs UI |
| 11 | `updatePreferences` | `(db, typeKey, muted, deps) => Promise<void>` | outside-in | mute domain; prefs UI |
| 12 | `getDailyDigest` | `(db, deps) => Promise<DailyDigest>` | outside-in | digest projection; status page |

### Public types (10)
`Notification`, `NotificationChannel`, `NotificationFilter`, `NotificationSelector`,
`NotificationPatch`, `DeliverySpec`, `DeliveryResult`, `NotificationConfigPatch`,
`SafeNotificationConfig`, `NotificationsDeps`, plus `DailyDigest`. (Enqueue's `{dedupeBy}` stays an
inline literal.) `NotificationTypeKey` is imported from `@hyperidle/shared`, not owned here.

---

## 4. TARGET NUMBERS & WHAT GETS DELETED

- **substrate**: owned-tables (1 table). **floor**: 5. **targetMethods**: **12** (floor 4-realized
  + 8 justified capabilities). **targetTypes**: **10**.
- **from 66 → 12 methods; 44 → 10 types.**

**DELETED from the product API (internalized as package-private, called via relative import — the
prior pass left these as public-adjacent "helpers"; here they are genuinely off the barrel):**
- 16 raw queue helpers → 4: `queueCountByStatus, listByStatus, listPending, listPendingDigest,
  listUnread, listStuckLeases, listByIdsWithStatus, findPendingByEventSubject, findById, listAll,
  insertNotification, claimForSend, updateStatus, requeueLease, updateManyByIds, deleteReaped`.
- Delivery-engine machinery → folded into `installNotifications`/`deliver`: `flush`, `runDigest`,
  `sendTest`, `registerNotificationDispatcher`, `registerNotificationListener`,
  `startNotificationDrain`, `flushQueue`, `dispatchDigest`, `defaultNotificationAdapterFactory`,
  `createConsoleAdapter`, `recoverStuckLeases`, `NOTIFICATION_DRAIN_INTERVAL_MS`.
- 8 config sanitizers + `redactNotificationConfig` + `pickRecipient` + `loadNotificationConfig` +
  `readNotificationConfig` + `assertNtfyUrlNotSSRF` → inside `readConfig`/`updateConfig`.
- Silence sub-predicates `isFactorySilenced`, `readSilenceWindow`, `isInSilenceWindow` → inside
  `isSilenced` (the test that imports `isInSilenceWindow` must reach it via package-internal path or
  cover it through `isSilenced` — a test never justifies barrel surface).
- Mute factories `defaultMutePreferenceReader/Writer`, `getMutedTypeKeys` → inside
  `readPreferences`/`updatePreferences`.
- **Types deleted**: 15 individual DI ports + 4 sub-bags (`NotificationsConfigDeps/MuteDeps/
  SilenceDeps/DigestDeps`) → 1 `NotificationsDeps`; adapter chain (`NotificationAdapter`,
  `AdapterFactory`, `SendResult`, `ConsoleAdapterOptions`, `ScrubContext`); `Recipient`,
  `Classification`, `QueueReason`, `NotificationSeverity`, `NotificationQueuePatch`,
  `AlertPreferences`, `DigestResult` (subsumed by `DeliveryResult`), the 4 settings-mirror config
  interfaces.

**Merge note (delivery engine):** `flush`/`runDigest`/`sendTest` are the arithmetic parts; `deliver`
is ONE product op parameterized by `DeliverySpec.kind` with a discriminated return — the folded
thing, not the sum.

---

## 5. LEAN *AND* COMPLETE — every current user feature still deliverable

- **In-app inbox** (popover, queue view, unread badge) → `listNotifications({kind:"unread"|"by-status"})`.
- **Mark read / mark all seen** → `markNotifications({kind:"ids"|"all"}, {read|seen})`.
- **Emit alert + dedupe/throttle** → `enqueue(input, {dedupeBy:{eventType,subjectId}})`.
- **Quiet hours / team silence / factory mute** → `isSilenced` (all rules folded in).
- **Config page incl. SMTP/ntfy secrets + SSRF guard** → `readConfig`/`updateConfig`.
- **Per-type mute** → `readPreferences`/`updatePreferences`.
- **Send test / flush now / dispatch digest** → `deliver({kind:"test"|"flush"|"digest"})`.
- **Daily digest tile** → `getDailyDigest`. **Retention GC** → `reap`.
- **Future — weekly digest** → `deliver({kind:"digest", window:"weekly"})`; **SMS channel** →
  extend `NotificationChannel` + internal adapter; **per-project silence** → new field on
  `isSilenced` input + internal rule. All zero new barrel methods → sub-linear growth.

No capability is dropped; only fragmentation is removed.
