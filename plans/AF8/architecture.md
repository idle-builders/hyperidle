# AF8 — Architecture plan (build target)

Notification **delivery backend** (the bulk: drain loop, event listener, lease recovery, cost signal, persisted source link, type registry, mute enforcement) + **light frontend** (popover + Settings type-list). Concept LOCKED (`docs/human-interface-layer/notification-primitive.md`); design LOCKED (`plans/AF8/design/approved.md`). This plan does not re-litigate either.

Closes Z8-005 (no drain loop), Z8-007 (zero `notification` listeners), Z8-008 (cost sentinel reads unwritten field), Z8-098/099 (lease recovery + source-link persistence).

## Required reading (engineer reads before implementing)
- `plans/AF8/concept.md`, `plans/AF8/concept-notes.md`, `docs/human-interface-layer/notification-primitive.md` — the locked model + the 6 silent assumptions.
- `plans/AF8/design/approved.md` — popover + Settings visual/interaction contract.
- `packages/fabric/src/services/notifications/dispatcher.ts` — enqueue/flush/lease/recover (extend, do not rewrite).
- `packages/fabric/src/services/notifications/types.ts` + `config.ts` — severity/channel/queue types + config shape.
- `packages/fabric/src/services/cost-sentinel.ts` + `silence-policy.ts` — the cost read + silence/quiet-hours gate. **Note:** `isSilenced` currently merges factory-silence AND the quiet-hours window into one boolean; AF8 splits them (see § Cost-breach silence split) — read that section before touching the drain.
- `packages/fabric/src/services/policy-engine.ts` (~208–218) + `packages/server/src/services/dependency-watcher.ts` (~87–95) — the two `notification` emitters.
- `packages/fabric/src/bootstrap.ts` + `packages/server/src/app.ts` (~500–535) — disposer wiring.
- `packages/db/src/schema.ts` (~677–706 `notificationQueue`, ~502 `factorySettings`) — schema delta target.
- `packages/web/src/shell/CocOverlay.tsx`, `Sidebar.tsx` (~348–414), `layouts/AppShell.tsx` (~505–533 sidebarProps), `settings/SettingsNotifications.tsx`.
- `packages/shared/src/events.ts` (~77 `NotificationEvent`).

---

## Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality | Plan handling |
|---|---|---|
| "reuse `eventType` as the type key" | `notification_queue.eventType` holds raw bus names (`item_created`, `cost_cap_breached`) not concept type keys | Add a **`typeKey` column**; derive it via an explicit event→type map. Keep `eventType` for audit. |
| Source link `deepLink` persisted | `deepLink` is built in `dispatcher.ts:178` (`buildItemNotification`) as `` `/conversations/item/${item.id}` `` but **never inserted** into the row — AND the route is **broken**: router.tsx only defines `conversations/:threadId` (+ legacy `review`/`chat` redirects), so `/conversations/item/<id>` **404s**. | Add **`sourceLink` column**; persist a **CORRECTED, thread-keyed** link at enqueue: `` `/conversations/${item.threadId}` ``. Never reconstruct at render (hard rule #2); never copy the broken `dispatcher.ts:178` shape. Items carry `threadId` (see protected test fixture). |
| Cost sentinel reacts to a real value | `cost-sentinel.ts:108` reads `factory_settings.cost_actual` — **zero writers** (grep-confirmed). `routine-scheduler.ts:188` reads it too. | Write a canonical **`factory_settings.cost_actual`** aggregate; coordinate AF10 (below). Fixes BOTH consumers. |
| `notification` event → notification | **Zero `.on("notification")` listeners** (grep-confirmed). Two emitters: policy-engine `push` (→ notification) and dep-watcher auto-unblock (→ **ambient, NOT a notification**, hard rule #6). | New listener subscribes to `notification`; **filters out the dep-watcher auto-unblock via the MANDATORY `kind` discriminator** (`kind==="auto_unblock"` → ignore). No message-string matching — see Type registry §. |
| Drain loop exists | `flushQueue` exists but only via `POST /flush`. No timer. | Add **`startNotificationDrain` interval** in `bootstrapFabric`, calling `flushQueue` (which already calls `recoverStuckLeases`). |
| Lease recovery automatic | `recoverStuckLeases` exists but only runs inside `flushQueue` (manual). | The drain interval makes it automatic. No new recovery code — just scheduled invocation. |
| Per-user mute store | AF15 owns it; not built. Today: 3 boolean fields in server config (`AlertPreferences`). | AF8 defines the **`isTypeMuted` read interface** + a `MutePreferenceReader`; AF15 implements persistence. Default = all on (fail-open). |
| `severity` is the model field | `severity: blocking|cost_breach|digest` drives egress (adapters/flood/digest). | **Keep `severity`** for the dormant egress path; **add `urgency` + `typeKey` + `sourceLink` + read-state** for the in-app popover. `digest` stays a severity, never an urgency. |
| Cost-detail route for `cost_alert` source link | No dedicated cost-detail page exists | **Decision:** `cost_alert.sourceLink = "/work/portfolio"` (the factory/portfolio cost surface) for v1. Flagged as open — see Risks. |

---

## Phase 0 — Interrogation (resolved, autonomous)

1. **What's the smallest useful version?** The in-app path made real: events→queued→delivered-to-popover automatically, mute honored, cost sentinel firing off a real value, source link persisted. Egress (push/email) stays **dormant but drain-correct**. Confirmed by spec out-of-scope.
2. **What's the canonical factory cost the sentinel reads — and who writes it?** *Load-bearing.* Options in Design-it-twice §A. **Decision: AF8 writes `factory_settings.cost_actual` = SUM(users.cost_actual) on each cost record**, via a hook in/after `recordCostAndCheck`. Coordinate AF10 (it owns `recordCostAndCheck`). Contract dependency flagged.
3. **Does the `notification` listener consume both emitters?** No. policy-engine `push` → yes (becomes review/blocker). dep-watcher auto-unblock → **NO** (ambient, hard rule #6). The listener filters. This is the trap that makes a naive listener wrong.
4. **Does the drain replace the dispatcher's direct-send path?** No. The dispatcher still attempts direct push for `immediate` egress; the drain handles **pending** rows (silenced/quiet-hours/flood-coalesced/retry). For the **popover** (the near-term surface), rows are written to the store and the popover reads them — egress delivery is orthogonal. The drain's job is to keep the egress queue from stalling (Z8-005) and recover leases (Z8-098).
5. **Read-state granularity?** Single-founder near-term → row-level `seenAt`/`readAt` on `notification_queue`. No per-(user,notification) join in scope (concept-notes §4). Confirmed.
6. **Does the cost-breach exception treat factory-silence and quiet-hours identically?** *Load-bearing — concept hard rule #8.* **No.** A hard cost breach bypasses **factory silence** (`silence_mode` / per-product silence — the kill switch the founder can flip) but **respects the quiet-hours window** (the founder is asleep; the breach is real but waits until morning). The existing `flushQueue` collapses both into ONE `isSilenced` boolean and exempts `cost_breach` from all of it — so today a hard cost breach would page during quiet hours, **violating hard rule #8**. AF8 must split the predicate. See § "Cost-breach silence split" below.

---

## Cost-breach silence split (CRITICAL — hard rule #8)

**Concept hard rule #8:** a hard cost breach *bypasses factory silence* but *respects quiet hours* — it pages immediately even when the founder has silenced the factory, yet it still defers when the founder is in their declared quiet-hours window.

**The bug in the reused path.** `silence-policy.ts:isSilenced` returns `true` if ANY of: (1) `silence_mode=true`, (2) per-product silence, **or (3) the quiet-hours window** (`silence_window_start/end`) covers `now`. `flushQueue` (dispatcher.ts:394–403) only defers when `isSilenced && severity==="blocking"`; `cost_breach` is exempt from `isSilenced` **entirely**. Net: a hard `cost_breach` flushed during the quiet-hours window pages the founder — **rule #8 violated**, and currently unflagged.

**The fix — two predicates, not one boolean.** Replace the single `isSilenced` gate inside `flushQueue` with two independent reads, each already available in `silence-policy.ts`:

```
// Predicate 1 — FACTORY SILENCE (kill switch): silence_mode + per-product.
//   cost_breach BYPASSES this. blocking/digest respect it as today.
factorySilenced = silence_mode==="true" || perProductSilence(row)

// Predicate 2 — QUIET HOURS (window): silence_window_start/end covers now.
//   cost_breach RESPECTS this — defers. blocking respects it too.
inQuietHours = isInSilenceWindow(windowStart, windowEnd, now)   // already exported

// Per-row decision inside flushQueue:
if (severity === "cost_breach") {
    if (inQuietHours) { deferred++; continue; }   // RESPECT quiet hours (rule #8)
    // else fall through → flush (BYPASS factory silence, rule #8)
} else if (severity === "blocking") {
    if (factorySilenced || inQuietHours) { deferred++; continue; }  // defer on either
}
// digest: always flush (non-interruptive), unchanged.
```

**Implementation requirement.** `silence-policy.ts` must expose the two factory predicates separately so the drain can consult them independently — do NOT keep collapsing them into one `isSilenced` boolean for the cost-breach path. Add `isFactorySilenced(db, item, now)` (silence_mode + per-product only, **no window check**) alongside the existing `isInSilenceWindow(start, end, now)` (already exported) and a small reader for the window endpoints. `isSilenced` stays as the OR-of-both for the `blocking`-row path (back-compat for policy-engine + existing blocking semantics). The drain reads the window endpoints once per tick (config-level) and calls `isInSilenceWindow` per row.

**Protected-test impact.** `dispatcher.integration.test.ts` (protected) currently asserts a hard `cost_cap_breached` event produces a `cost_breach` send — but it sets **no** silence/quiet-hours state, so it does NOT encode the now-superseded "breach bypasses *everything*" behavior; it stays green unchanged. **However** the dispatcher's `route()` (dispatcher.ts:651–655) and its `@lore` (lines 372–378) DO encode "hard cost breaches bypass quiet hours" for the **direct-send** path. AF8 must update that `route()` logic + `@lore` to defer cost breaches during quiet hours, mirroring the drain split. The builder updates the `@lore` text; no protected-test assertion needs to change (the protected test never exercises the quiet-hours branch). Flagged in the task list (step 6) and covered by the new AC12 below.

---

## Design-it-twice

### A. The canonical factory cost value (the AF10 coordination point)

**Option A1 — Derived aggregate written on cost record.** After every `recordCostAndCheck`, write `factory_settings.cost_actual = SUM(users.cost_actual)` (minor units). The sentinel + routine-scheduler read it unchanged.
- *Trade-off:* one extra `SUM` query + upsert per cost event (low volume — cost events are per-session-event, not per-token). Eventually-consistent within one event.
- *Reject reason:* none fatal; the `SUM` is over the small `users` table.

**Option A2 — Sentinel computes the sum itself (no stored field).** Change `cost-sentinel.ts` to `SELECT SUM(cost_actual) FROM users` directly; delete the `cost_actual` factory_settings read.
- *Trade-off:* no write path needed; the sentinel is self-sufficient. But `routine-scheduler.ts:188` ALSO reads `factory_settings.cost_actual` — A2 leaves that consumer broken unless also changed.
- *Reject reason:* leaves a second silently-broken reader; diverges from "a value the system writes" (the spec/concept wording implies a written value AF10 and AF8 agree on).

**Synthesis (chosen): A1, but the writer lives at the cost-recording boundary, coordinated with AF10.** AF8 specifies: *a single helper `recordFactoryCost(db)` that sets `factory_settings.cost_actual = SUM(users.cost_actual)` (minor units), called at the end of `recordCostAndCheck`.* Because AF10 owns `recordCostAndCheck` and has **no progress yet**, AF8's plan provides the helper + the call-site contract; if AF10 lands first it must call this helper, if AF8 lands first it adds the call itself. **The canonical value is defined identically: factory cost = SUM over `users.cost_actual`, minor units, currency = factory default.** Both consumers (sentinel + routine-scheduler) read `factory_settings.cost_actual` unchanged → fixes Z8-008 without touching the readers. **CONTRACT FLAG (AF10):** if AF10 changes how per-entity cost accumulates (delta vs total), the `SUM` is still correct as long as `users.cost_actual` is the authoritative per-agent running total — which AF10's AC guarantees ("accumulated session cost equals the sum of true per-event deltas").

**Known inflation until AF10 lands (honest disclosure).** `SUM(users.cost_actual)` is the correct aggregate, but **until AF10 fixes its quadratic delta-accumulation bug, `users.cost_actual` is real-but-inflated** (each per-event write over-accumulates). So the value AF8 surfaces to the sentinel is directionally correct but biased **high**. This **fails safe toward over-alerting**: the cost sentinel may fire `cost_cap_warning`/`breached` slightly early, never late — the founder is warned before the true cap, never after. Acceptable for v1: over-alerting on spend is the safe failure direction, and the bias disappears automatically once AF10 ships (AF8 changes nothing — same `SUM`, now over a correct column). Documented here and as a `@lore` at the `recordFactoryCost` call-site so the inflation is not mistaken for a bug in AF8's aggregation.

### B. typeKey/urgency: new columns vs reinterpret severity

**Option B1 — Add `typeKey`, `urgency`, `sourceLink`, `seenAt`, `readAt` columns.** Egress keeps `severity`; popover keys off the new columns.
- *Trade-off:* 5-column migration; clean separation of in-app model from egress model.
- *Reject reason:* none — the columns are nullable/back-fillable.

**Option B2 — Overload `severity` + parse `eventType` at render.** No migration; derive everything in the popover.
- *Trade-off:* zero schema change.
- *Reject reason:* violates hard rule #2 (source link must be persisted, not reconstructed) and conflates the retired `severity` with the model. Rejected.

**Chosen: B1.**

---

## Acceptance criteria + verification

| # | AC | Verification |
|---|---|---|
| AC1 | Pending notifications drain automatically (no manual flush) | **Integration** (`{db,app,eventBus}`): enqueue a `pending` row, advance the drain tick (inject `now` + call the drain fn directly, or start the interval with a fake timer), assert row → `sent` and a FakeAdapter recorded the send. |
| AC2 | A `notification` event from policy-engine yields a queued, source-linked, typed row | **Integration**: seed an item (verb=review, risk=high) **on a thread** (`item.threadId=<threadId>`), emit `notification`{targetId=itemId, kind="attention"}; assert a `notification_queue` row exists with `typeKey="review_request"`, `urgency="immediate"`, **`sourceLink` exactly equal to `` `/conversations/${item.threadId}` `` (thread-KEYED, NOT `/conversations/item/<id>`)**, `severity` set for egress. The assertion pins the corrected route shape so the builder cannot copy the broken `dispatcher.ts:178` `deepLink`. |
| AC3 | dep-watcher auto-unblock event does NOT create a notification | **Integration**: emit a `notification` event with `kind="auto_unblock"`; assert NO new `notification_queue` row (reclassified ambient, hard rule #6). Filter is on `kind` ONLY — the test must NOT rely on message text. |
| AC4 | Quiet-hours/silence + retry-deferral honored by auto delivery | **Integration**: set silence window covering `now`, enqueue a non-cost-breach (`blocking`) row, run drain; assert row stays `pending` (deferred); clear silence, run drain; assert `sent`. Uses the split `flushQueue` silence-aware logic (see § Cost-breach silence split). |
| AC12 | **Cost-breach honors the split: bypasses factory silence, defers in quiet hours (hard rule #8)** | **Integration, two cases.** (a) Set `silence_mode="true"` (factory silence) with NO quiet-hours window; enqueue a `cost_breach` row; run drain; assert row → `sent` (BYPASSED factory silence). (b) Set a quiet-hours window (`silence_window_start/end`) covering `now`, `silence_mode` unset; enqueue a `cost_breach` row; run drain; assert row stays `pending` (DEFERRED). Advance `now` past the window; run drain; assert `sent`. This is the regression guard for the previously-unflagged rule-#8 violation. |
| AC5 | Stuck/expired `sending` leases recovered automatically | **Integration**: insert a row `status=sending, claimedAt = now-6min`; run drain tick; assert row requeued (`pending`, `claimedAt=null`) then delivered. (Drives `recoverStuckLeases` via the scheduled drain, not manual flush.) |
| AC6 | Cost sentinel reacts to a real written value | **Integration**: record cost via `recordCostAndCheck` (or call `recordFactoryCost`) so `factory_settings.cost_actual` > 0; set `cost_cap`; run `runCostSentinelCheck`; assert it emits `cost_cap_warning`/`breached` based on the real sum (not 0). |
| AC7 | Source link persisted, never reconstructed | **Integration**: assert the row's `sourceLink` column is populated at enqueue. **Unit**: the popover row renders `navigate(row.sourceLink)` reading the column (no route-building in the component). |
| AC8 | Type registry is the single source for Settings + mute targets | **Unit**: `NOTIFICATION_TYPES` exports `{key,label,description,defaultUrgency}` for review/blocker/cost; `urgencyForType(key)` returns the default. **Component**: Settings renders one Toggle per registry entry. |
| AC9 | Muting a type suppresses its notifications (no popover row, no egress) | **Integration**: with `isTypeMuted("review_request")=true`, emit a review `notification`; assert NO row enqueued. **Component**: Settings toggle off → calls the mute write. |
| AC10 | Popover lists, marks-seen, dismisses; unread dot reflects unseen | **Component** (`NotificationPopover.test.tsx`): renders rows from a store fixture in urgency+recency order; opening calls mark-seen; dismiss calls mark-read + removes row; empty/loading/error states render. **API integration**: GET list / POST seen / POST read return expected shapes. |
| AC11 | Settings type-list supersedes the 3 AF15 toggles | **Component**: the old `review-requests/cost-alerts/blocker-notifications/email-digests` hardcoded toggles are gone; registry-driven toggles render; no `email-digests` row. |

---

## Schema / migration deltas

`packages/db/src/schema.ts` — extend `notificationQueue` (~677–706). All nullable (back-compat for existing rows):

```ts
// AF8 — in-app notification model (popover). severity/channel stay for egress.
typeKey: text("type_key"),              // concept type key: review_request | blocker_alert | cost_alert
urgency: text("urgency"),               // "immediate" | "ambient" (from type registry default)
sourceLink: text("source_link"),        // persisted route, thread-keyed `/conversations/${threadId}` (NOT /conversations/item/<id> — that 404s); never reconstructed at render (hard rule #2)
seenAt: text("seen_at"),                // ISO; set when popover opened (clears unread dot)
readAt: text("read_at"),                // ISO; set on jump or dismiss
```
Add index for the popover query: `index("nq_inapp_idx").on(table.readAt, table.createdAt)` (list unread newest-first).

`factory_settings` — no schema change; `cost_actual` is a `key/value` row written by `recordFactoryCost`.

**Migration:** `npm run db:generate` produces a new `drizzle/00NN_*.sql` adding 5 columns + 1 index to `notification_queue`. **PostgreSQL is the active dialect** (`drizzle.config.ts` dialect=postgresql; migrations in `packages/db/drizzle/`). `ALTER TABLE ADD COLUMN` nullable = non-blocking. → **`gate: ci-required`** (schema migration touches a shared infra file + runs `db:migrate`).

---

## Type registry + interfaces

**`packages/shared/src/notifications.ts`** (new — shared so server, fabric, web all import):
```ts
export type NotificationUrgency = "immediate" | "ambient";
export type NotificationTypeKey = "review_request" | "blocker_alert" | "cost_alert";

export interface NotificationType {
  readonly key: NotificationTypeKey;
  readonly label: string;        // Settings + popover type label
  readonly description: string;  // Settings row description
  readonly defaultUrgency: NotificationUrgency;
}

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  { key: "review_request", label: "Review requests", description: "When an agent needs your review", defaultUrgency: "immediate" },
  { key: "blocker_alert",  label: "Blocker alerts",  description: "When an agent is blocked and needs you to intervene", defaultUrgency: "immediate" },
  { key: "cost_alert",     label: "Cost alerts",     description: "When factory spend crosses a configured cost cap", defaultUrgency: "immediate" },
] as const;

export function urgencyForType(key: NotificationTypeKey): NotificationUrgency { /* lookup, default "ambient" */ }
```
Note: `review_request` urgency is `immediate` by default; the concept allows demotion to `ambient` for low-risk reviews — the **listener** computes the actual urgency per-instance (immediate if `risk_tier ≥ medium`/blocking, else ambient) and persists it; `defaultUrgency` is the Settings/registry fallback.

**Mute read interface (AF8 defines, AF15 implements persistence):**
```ts
// packages/fabric/src/services/notifications/mute.ts
export interface MutePreferenceReader {
  isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean>;
}
// Default impl (until AF15): reads notifications.mute_<key> from factory_settings; absent = not muted (fail-open).
export function defaultMutePreferenceReader(db: HyperIdleDb): MutePreferenceReader;
```
**AF15 CONTRACT FLAG:** AF15 reworks Settings to per-user persistence. AF8 consumes only `isTypeMuted(typeKey)`. When AF15 lands, it provides a per-user `MutePreferenceReader` (signature gains `userId`); AF8's drain/listener/popover inject it. Until then, the factory-level default reader is used. The **write** (Settings toggle + popover mute shortcut) goes through a sibling `MutePreferenceWriter.setMuted(key, muted)` — AF8 ships the factory-level default writer; AF15 swaps in per-user.

**Event→type mapping (the listener core):**
```ts
// packages/fabric/src/services/notifications/notification-listener.ts
// Subscribes to "notification". Enriches the thin NotificationEvent into a typed, source-linked row.
//   policy-engine push (kind="attention", targetId = itemId): look up item → read item.threadId →
//     verb=review → review_request, urgency by risk
//     blocking    → blocker_alert,  urgency=immediate
//   PERSISTED sourceLink shape (corrected — router has ONLY /conversations/:threadId):
//     review_request / blocker_alert: `/conversations/${item.threadId}`   (thread-keyed; NOT /conversations/item/<id>)
//     cost_alert:                     "/work/portfolio"                   (factory cost surface; see Risks R1)
//   The listener builds sourceLink ONCE here and persists it on the row. The popover reads row.sourceLink
//   verbatim and never rebuilds a route (hard rule #2). If item.threadId is null, the listener falls back to
//   "/conversations" (queue) rather than emitting a 404-shaped link.
//   dep-watcher auto-unblock (event.kind === "auto_unblock") → IGNORE (ambient, hard rule #6) — filter on `kind` ONLY, never message text
// Honors isTypeMuted before enqueue. Enqueues via enqueueNotification + new typeKey/urgency/sourceLink fields.
export function registerNotificationListener(db, bus, deps: { mute: MutePreferenceReader; now? }): () => void;
```
**Discriminator — MANDATORY `kind` field (no message-string fallback).** The listener distinguishes policy-engine `push` (→ notification) from dep-watcher auto-unblock (→ ambient, hard rule #6) **solely** on a structural discriminator: add a **mandatory** `kind: "attention" | "auto_unblock"` field to `NotificationEvent` in `shared/events.ts`, set at BOTH emit sites (policy-engine → `"attention"`, dependency-watcher → `"auto_unblock"`). The listener filters `if (event.kind === "auto_unblock") return;` — **no `auto_unblock` row is ever enqueued**.

**Explicitly rejected: any message-string fallback.** The earlier draft floated matching on message substrings (`"auto-transitioned"`/`"dependencies are done"`/`"requires attention"`) or on `streamId === targetId`. **Drop it entirely.** Message copy is presentation, not a contract; an agent or a copy edit changing the wording would silently re-classify an auto-unblock as a notification and **re-break hard rule #6** with no test catching it. The discriminator is `kind` and only `kind`. Making `kind` mandatory (not optional) means TypeScript forces both emit sites to set it — the compiler is the enforcement. The listener does not branch on message text at all. (Shared-type change → `sharedFiles`; both emit sites must be updated in the same change or the build breaks, which is the desired forcing function.)

**Drain loop:**
```ts
// packages/fabric/src/services/notifications/drain.ts
export const NOTIFICATION_DRAIN_INTERVAL_MS = 60_000; // 1 min
export function startNotificationDrain(db, factory: AdapterFactory, deps: { now? }): () => void;
// Each tick: load config; if disabled, no-op; else flushQueue(db, factory, cfg, now()).
// flushQueue already calls recoverStuckLeases at its top → lease recovery is automatic (AC5).
```

---

## API routes (popover)

Extend `packages/server/src/routes/notifications-routes.ts` (mounted at `/notifications` in `app.ts:437`):

| Method | Path | Shape | Notes |
|---|---|---|---|
| GET | `/notifications/inbox` | `{ unseenCount, rows: [{id, typeKey, urgency, title, sourceLink, createdAt, seenAt, readAt}] }` | `readAt IS NULL` rows, urgency-then-recency sort, cap 50. Drives popover + unread dot. |
| POST | `/notifications/seen` | `{}` → `{ updated }` | Set `seenAt=now` for all `seenAt IS NULL` rows. Called on popover open. |
| POST | `/notifications/:id/read` | `{}` → `{ ok }` | Set `readAt=now` (jump or dismiss). Validate `:id` is UUID. |
| GET | `/notifications/mute` | `{ muted: NotificationTypeKey[] }` | Reads the mute store (registry + reader). For Settings render. |
| PUT | `/notifications/mute/:key` | `{ muted: boolean }` → `{ ok }` | Validate `:key ∈ NOTIFICATION_TYPES`. Writes via `MutePreferenceWriter`. Popover shortcut + Settings toggle both hit this. |

Web hook: `packages/web/src/hooks/useNotifications.ts` (polls `/api/notifications/inbox` every ~30s + on popover open; exposes `markSeen`, `markRead`, `muteType`).

---

## Ordered task list (builder follows in order)

1. **Shared registry + types** — `packages/shared/src/notifications.ts` (`NOTIFICATION_TYPES`, `NotificationUrgency`, `urgencyForType`); export from `shared/src/index.ts`. Add **MANDATORY** `kind: "attention"|"auto_unblock"` to `NotificationEvent` in `events.ts` (not optional — the compiler then forces both emit sites to set it; this is the rule-#6 enforcement). *Test:* unit on registry + `urgencyForType`. (AC8)
2. **Schema delta + migration** — add 5 columns + index to `notificationQueue`; `npm run db:generate`; `npm run db:migrate`. *Test:* migration runs; columns present. **ci-required.** (AC7 schema half)
3. **Mute interface** — `notifications/mute.ts` (`MutePreferenceReader`/`Writer` + factory-level default impls reading/writing `factory_settings.notifications.mute_<key>`). *Test:* unit set→read round-trip. (AC9 backend)
4. **enqueueNotification extension** — thread `typeKey`, `urgency`, `sourceLink` through `enqueueNotification` (dispatcher.ts) into the insert. *Test:* unit asserts persisted columns. (AC2, AC7)
5. **Event→type listener** — `notification-listener.ts` (`registerNotificationListener`): subscribe `notification`, ignore `kind==="auto_unblock"` (the ONLY discriminator — no message-string matching), enrich policy-engine push → review/blocker, compute urgency, build+persist the corrected thread-keyed sourceLink (`/conversations/${item.threadId}`), honor `isTypeMuted`. Set the mandatory `kind` at both emit sites (policy-engine→`"attention"`, dependency-watcher→`"auto_unblock"`). *Test:* integration AC2 (assert exact `/conversations/${threadId}` shape), AC3, AC9.
6. **Drain loop + cost-breach silence split** — `drain.ts` (`startNotificationDrain`); register in `bootstrapFabric` (disposer). **Split the `flushQueue` silence gate into two predicates** (see § Cost-breach silence split): add `isFactorySilenced` to `silence-policy.ts` (silence_mode + per-product, no window); use `isInSilenceWindow` for quiet hours; `cost_breach` bypasses factory silence but defers in quiet hours; `blocking` defers on either; `digest` always flushes. **Also update the dispatcher direct-send `route()` (dispatcher.ts:651–655) + its `@lore` (372–378)** to defer cost breaches during quiet hours, mirroring the split. *Test:* integration AC1, AC4, AC5, **AC12 (both cost-breach cases)** (drives `flushQueue` + `recoverStuckLeases`).
7. **Cost signal** — `recordFactoryCost(db)` (writes `factory_settings.cost_actual = SUM(users.cost_actual)`); call at end of `recordCostAndCheck` in `cost-cap.ts`. *Test:* integration AC6. **`@lore` at the call-site: (a) AF10 coordination (must preserve the trailing call); (b) the surfaced value is real-but-inflated until AF10 fixes its quadratic delta bug — fails safe toward over-alerting, never under.**
8. **Popover API** — the 5 routes above in `notifications-routes.ts`. *Test:* route integration (AC10 API half, AC9 mute API).
9. **Wire fabric exports** — export `startNotificationDrain`, `registerNotificationListener`, `recordFactoryCost`, mute impls from `fabric/src/index.ts`; register listener + drain in `bootstrapFabric` (`app.ts` already collects disposers).
10. **Popover component** — `packages/web/src/shell/NotificationPopover.tsx` (CocOverlay-clone shell + purpose-built rows per `approved.md`); `useNotifications` hook. *Test:* component AC10 (states + interactions).
11. **Sidebar affordance** — add notification trigger + unread dot to `Sidebar.tsx` bottom strip; wire open/close + `unseenCount` in `AppShell.tsx` sidebarProps; render `<NotificationPopover>` (desktop + mobile branches). *Test:* component — dot shows when `unseenCount>0`.
12. **Settings type-list** — rewrite `SettingsNotifications.tsx` over `NOTIFICATION_TYPES` + mute API; remove hardcoded array/`SERVER_KEY_MAP`/`email-digests`/solo-filter. *Test:* component AC8, AC11. Update/migrate `AD5-settings-notifications.test.tsx` + `AD3-SettingsNotifications-solo.test.tsx`.
13. **Stories** — `NotificationPopover.stories.tsx` (empty/loading/error/populated). Settings stays in existing story coverage.
14. **Verify** — `npm run check && npm run lint && npm run test && npm run test:integration`.

---

## Security & abuse cases
- **Rate-limit on POST/PUT — deliberately none, justified on the route's own properties:** `/notifications/mute/:key` (and `/seen`, `/:id/read`) carry **no rate limiter by design**, justified positively:
  1. **Idempotent:** `PUT /mute/:key {muted}` is a set-to-value (not increment); N identical calls = one call's effect. Replaying it cannot accumulate state or exhaust a resource.
  2. **Founder-tier auth:** the only caller is the authenticated founder (single-tenant, single trust tier). There is no untrusted or multi-tenant actor who could abuse the endpoint; an attacker with the founder token already has full control.
  3. **No fan-out:** the write touches exactly one `factory_settings` row and emits no events, no egress, no downstream work. Worst-case abuse is a tight loop of single-row upserts — a self-DoS the founder has no incentive to run, bounded by their own connection.
  Contrast: `/notifications/test` HAS a token-bucket because it triggers **real egress** (sends a push/email — fan-out + external side effect) and is the one abuse-amplifying route. The mute/seen/read writes have none of those properties, so a limiter would add config + failure surface with zero risk reduction. (The `/test` precedent is cited to show the team adds limiters *where fan-out exists* — not as a blanket "other routes lack one" appeal.)
- **Input-trust boundary (agent-authored fields):** notification `title`/`body` originate from item content (agent-authored). They are rendered as **text** in the popover (no `dangerouslySetInnerHTML`) — XSS-safe by React default. **Addressed.**
- **Source-link injection:** `sourceLink` is **system-authored** (built by the listener from item ids), not agent-supplied — but defense-in-depth: the popover must reject non-in-app links (`javascript:`, absolute URLs). **Addressed:** popover validates `sourceLink` starts with `/` before `navigate()`; else no-op.
- **`:key` / `:id` params:** validate `:key ∈ NOTIFICATION_TYPES` (zod enum) and `:id` is UUID before query. **Addressed** (route validation).
- **Secret handling:** no new credential surface. **N/A.**
- **Path traversal / SSRF:** no path or outbound-URL input added. **N/A.**

## Route checklist
- `GET /notifications/inbox`, `POST /notifications/seen`, `POST /notifications/:id/read`, `GET /notifications/mute`, `PUT /notifications/mute/:key` — all in `notifications-routes.ts`, mounted under `/notifications` (`app.ts:437`).

## Protected tests
`protectedTests`:
- `packages/server/src/__tests__/notifications/dispatcher.integration.test.ts` (egress path must stay green). **Review note:** its hard-`cost_cap_breached` test (lines 137–156) sets NO silence/quiet-hours state, so it does NOT encode the superseded "breach bypasses everything" behavior and **stays green unchanged** under the new split. The cost-breach silence split changes the dispatcher `route()` quiet-hours branch + `@lore`, which this test never exercises — so no protected assertion changes. The new AC12 (in a NEW test file, not this protected one) is the regression guard for the split. If the builder finds any existing assertion that DOES depend on a cost breach paging during quiet hours, that assertion encodes the rule-#8 violation and must be updated — flag it explicitly rather than weakening the new behavior.
- `packages/server/src/__tests__/notifications/R8-signal-to-noise.integration.test.ts` (alert-pref drop logic)
- `packages/server/src/__tests__/notifications/routine-digest.integration.test.ts`
- `packages/web/src/__tests__/NotificationRow.test.tsx` (the DS primitive is unchanged — popover does NOT use it)

## Shared files (parallel-overlap risk)
`sharedFiles`:
- `packages/db/src/schema.ts` (notificationQueue columns) — **overlaps AF16** (retention TTL) if concurrent.
- `packages/shared/src/events.ts` + `index.ts` (NotificationEvent **mandatory** `kind`, registry export). Mandatory field → both emit sites (`policy-engine.ts`, `dependency-watcher.ts`) MUST set it in the same change or the build breaks (intended forcing function).
- `packages/fabric/src/bootstrap.ts` (new disposers) — **overlaps AF6** (scheduler) if concurrent.
- `packages/fabric/src/services/cost-cap.ts` (`recordFactoryCost` call) — **overlaps AF10** (owns this file). **Merge-order: AF10 before AF8 preferred**; if AF8 first, AF10 rebases onto the `recordFactoryCost` helper.
- `packages/server/src/services/dependency-watcher.ts` + `policy-engine.ts` (set `kind`).
- `packages/web/src/layouts/AppShell.tsx`, `shell/Sidebar.tsx`, `settings/SettingsNotifications.tsx`.

## Risks / open
- **Cost-detail route (R1):** `cost_alert.sourceLink = "/work/portfolio"` for v1 (no cost-detail page). If AF10/a later WP adds a cost page, update the listener's source-link builder. Low risk — the route is valid today.
- **AF10 not started (R2):** `recordFactoryCost` is AF8-owned; the call-site in `recordCostAndCheck` is the only AF10 touch. If AF10 lands later and rewrites `recordCostAndCheck`, it must preserve the trailing `recordFactoryCost(db)` call. **CONTRACT FLAG.**
- **AF15 mute persistence (R3):** AF8 ships factory-level mute (not per-user). The `MutePreferenceReader/Writer` interface is the seam AF15 swaps. Until AF15, mute is global-per-factory — acceptable for the single-founder near-term (concept-notes §4). **CONTRACT FLAG.**
- **Drain vs dispatcher double-send (R4):** the dispatcher's direct `dispatchPush` and the drain both touch egress. The lease (`claimRow`) + `pending`-only drain query prevent double-claim (existing `@lore` at-least-once). No new race introduced — the drain only handles `pending` rows the dispatcher deferred.

## Gate recommendation
**`gate: ci-required`** — the schema migration (5 columns + index on `notification_queue`) runs `db:migrate` and touches shared infra (`schema.ts`, `shared/events.ts`, `bootstrap.ts`). Local-green is insufficient; CI must run the migration + full integration suite.

## Test strategy summary
- **Integration** (`{db,app,eventBus}` fixtures): drain (AC1,4,5), **cost-breach silence split (AC12 — both cases)**, listener (AC2,3,9), cost signal (AC6), popover API (AC10).
- **Component** (`.test.tsx`): popover states+interactions (AC10), Settings type-list (AC8,11).
- **Unit**: registry + `urgencyForType` (AC8), mute round-trip (AC9), enqueue column persistence (AC7).
