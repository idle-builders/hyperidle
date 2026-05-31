# R8 — Signal-to-Noise Defaults: Architecture Plan

## Required Reading

- `packages/fabric/src/services/notifications/dispatcher.ts` — event subscriptions, classification logic
- `packages/fabric/src/services/notifications/config.ts` — dispatcher config from `factorySettings`
- `packages/fabric/src/services/notifications/types.ts` — Classification, Notification, severity types
- `packages/fabric/src/services/silence-policy.ts` — three-level silence hierarchy
- `packages/server/src/services/server-config.ts` — notification preferences (alert toggles, quiet hours)
- `packages/server/src/routes/settings.ts` — Settings API (PATCH notifications)
- `packages/server/src/routes/notifications-routes.ts` — notification admin routes
- `packages/server/src/services/ws-broadcaster.ts` — WS event forwarding topics
- `packages/web/src/settings/SettingsNotifications.tsx` — Settings UI (alert toggles, quiet hours)
- `packages/design-system/src/Composer.tsx` — unresolved review indicator
- `packages/design-system/src/RichMessageCard.tsx` — review verdict rendering

## Plan Reconciliation: Spec vs Reality

### Already satisfied (no code change needed)

| AC | Spec assumption | Reality | Handling |
|----|----------------|---------|----------|
| AC2 | Routine task status changes should not generate prominent notifications | Dispatcher does NOT subscribe to `task_state_changed` or `bet_state_changed`. WS broadcaster forwards them to "work" topic for silent UI updates only. | **Already done.** Add test proving the negative. |
| AC3 | Blocked tasks and cost cap warnings generate clear notifications | `classifyItem(blocking=true)` returns `push/blocking`. `classifyCostWarning(critical)` returns `push/cost_breach`. `classifyCostBreach(hard)` returns `push/cost_breach` and bypasses silence. | **Already done.** Existing tests cover this (AC5a, AC5b in dispatcher.test.ts). |
| AC4 | Reviews pending human verdict are surfaced via existing unresolved review indicator | `Composer` renders `unresolvedReviewLink` ("Unresolved review - acting required"). `RichMessageCard` renders verdict buttons. `ThreadShell` wires these together. | **Already done.** No changes needed to review surfacing. |

### Needs change

| AC | Spec assumption | Reality | Gap |
|----|----------------|---------|-----|
| AC5 | Default quiet hours are OFF | `server_config` defaults to `quietHoursStart: "22:00"`, `quietHoursEnd: "08:00"`. These are cosmetically "on" in the UI even though they are disconnected from the dispatcher's `silence_window_*` keys in `factorySettings`. | Change defaults to empty strings representing "off". Add `quietHoursEnabled` boolean to make the on/off state explicit. |
| AC1 | Defaults documented | No documentation exists mapping events to notification outcomes. | Create a canonical reference test and `@lore` comments documenting the full event-to-notification mapping. |
| Constraint | Defaults must be overridable via existing notification preferences in Settings | The `reviewAlerts`, `costAlerts`, `blockerAlerts` toggles in `server_config` / Settings UI are NOT consulted by the dispatcher. The dispatcher reads only `factorySettings`. | Wire alert preferences into the dispatcher's classification as a post-classification filter. |

### Disconnection analysis: two config stores

The system has two config stores for notifications:

1. **`factorySettings` (KV table)** — read by `loadNotificationConfig()` in fabric. Controls notification delivery infrastructure: channels, SMTP, ntfy, flood control, silence windows.
2. **`server_config` (JSON blob table)** — read by `readServerConfig()` in server. Controls user-facing notification preferences: alert toggles, quiet hours, team mutes.

These are in different packages (`fabric` vs `server`) and never talk to each other. The dispatcher in fabric has no access to server_config preferences. The quiet hours in server_config don't affect the silence window in factorySettings.

**R8 approach:** Bridge the gap minimally. The dispatcher needs to read alert preferences. Rather than importing server_config into fabric (wrong dependency direction — fabric should not import from server), we pass alert preferences into the dispatcher at registration time via a new `preferences` reader function.

## Architecture Decisions

### Decision 1: How to wire alert preferences into the dispatcher

**Option A: Pass a preferences reader function into `registerNotificationDispatcher`.**

The dispatcher's `DispatcherDeps` gains a `readPreferences` function that returns `{ blockerAlerts: boolean; costAlerts: boolean; reviewAlerts: boolean }`. The route function in `dispatcher.ts` calls this before classifying, and applies preferences as a post-classification filter. The bootstrap wiring in `bootstrap.ts` passes `readServerConfig(db).then(c => c.notifications)` as the reader.

- Trade-off: Adds one function parameter to the dispatcher registration. Keeps fabric independent of server internals.
- Coupling surface: One function signature. No package dependency added.

**Option B: Move alert preferences into `factorySettings` so `loadNotificationConfig` reads them.**

- Trade-off: Fragments user preferences across two tables. Settings UI already writes to server_config — would need migration.
- Reject: Creates schema drift; the UI already saves to server_config.

**Decision: Option A.** The dispatcher gets a preferences reader injected at registration.

### Decision 2: How to represent "quiet hours off"

**Option A: Add `quietHoursEnabled: boolean` to the schema, default `false`.**

The quiet hours start/end fields keep their placeholder format but are ignored when `quietHoursEnabled` is false. The UI gets a toggle to enable/disable quiet hours.

- Trade-off: One new field in server_config, one new toggle in Settings UI.
- Cost: Schema change in `NotificationsSchema`, PATCH validation, UI toggle.

**Option B: Use empty strings `""` for start/end to represent "off".**

- Trade-off: Empty string as sentinel is ambiguous. The Zod regex `/^\d{2}:\d{2}$/` rejects empty strings, so we'd need to change validation.
- Reject: Sentinel values are a code smell. Also breaks the existing regex constraint.

**Decision: Option A.** Explicit boolean. Default `false`. Clear semantics.

### Decision 3: How to document event-to-notification mapping (AC1)

A dedicated test file `R8-signal-to-noise.test.ts` that exhaustively maps every event type to its notification outcome. This test IS the documentation — it's machine-verifiable, lives with the code, and fails if someone adds a new event subscription without updating the map. Complemented by `@lore` comments in `dispatcher.ts`.

## Acceptance Criteria with Verification

### AC1: Event subscriptions reviewed and defaults documented

**Verification:** A new test file `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts` that:
- Enumerates every event type from `events.ts`
- For each, documents whether the dispatcher subscribes to it and what the classification outcome is
- Asserts that `task_state_changed` and `bet_state_changed` are NOT subscribed (silent)
- Asserts that `item_created` (blocking) IS subscribed and classified as push/blocking
- Asserts that `cost_cap_breached` (hard) IS subscribed and classified as push/cost_breach
- Asserts that `cost_cap_warning` (critical) IS subscribed and classified as push/cost_breach
- Asserts the event-to-notification mapping table is complete (no missing events)
- `@lore` block in `dispatcher.ts` header documenting the full subscription table

### AC2: Routine task status changes do not generate prominent notifications

**Verification:** Test in `R8-signal-to-noise.test.ts` that:
- Emits `task_state_changed` (pending -> in_progress -> done) on the event bus with the dispatcher registered
- Asserts zero adapter.send() calls
- Asserts zero notification_queue rows
- Asserts the WS broadcaster DID forward the event to "work" topic (silent UI update only)

### AC3: Blocked tasks and cost cap warnings generate clear notifications

**Verification:** Existing tests in `dispatcher.test.ts` already cover the positive case (AC5a, AC5b, AC5c — blocking items push, cost breaches push). New tests in `R8-signal-to-noise.test.ts` add the preference-override cases:
- `blockerAlerts: false` + blocking item → classification downgraded to `drop`, no push, no queue
- `costAlerts: false` + cost_cap_warning(critical) → downgraded to `drop`
- `costAlerts: false` + cost_cap_breached(hard) → STILL pages (safety override — hard breaches always push)
- `costAlerts: false` + cost_cap_breached(soft) → downgraded to `drop` (was digest, now drop)
- All alerts ON (defaults) → identical behavior to existing tests

### AC4: Reviews pending human verdict are surfaced prominently

**Verification:** Two independent systems handle review surfacing:

1. **Notification system (push/digest):** Review items created by `session-review-creator.ts` have `kind: "review"` and `riskTier: "medium"|"high"`. High-risk reviews classify as `push/blocking`, medium as `digest`. The `reviewAlerts` preference can suppress these push notifications.
   - Test: `reviewAlerts: false` + review item (kind="review", riskTier="high") → `drop`
   - Test: `reviewAlerts: true` + same item → `push/blocking` (unchanged)
   - Test: `reviewAlerts: false` + non-review blocking item → `push/blocking` (only reviews affected)

2. **In-thread UI indicator:** The `Composer` renders `unresolvedReviewLink` ("Unresolved review - acting required") based on thread resolution state. This is independent of notification preferences — it's always visible when a review is unresolved.
   - Existing test in `Composer.test.tsx` covers this.
   - No changes needed to the Composer or RichMessageCard.

### AC5: Default quiet hours are off

**Verification:** Test in `R8-signal-to-noise.test.ts` and `P3-settings-config.test.ts`:
- `readServerConfig(db)` on a fresh DB returns `quietHoursEnabled: false`
- `quietHoursStart` and `quietHoursEnd` have placeholder values but are not active
- When `quietHoursEnabled` is patched to `true`, the dispatcher applies the quiet hours window as silence
- Settings UI shows the toggle in "off" state by default

## Type Signatures

### New: `AlertPreferences` (dispatcher.ts)

```typescript
/** Alert preferences read from server_config (user-facing toggles). */
export interface AlertPreferences {
  readonly blockerAlerts: boolean;
  readonly costAlerts: boolean;
  readonly reviewAlerts: boolean;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
}
```

### New: `applyAlertPreferences` (dispatcher.ts)

```typescript
/** Metadata passed alongside the classification for preference filtering. */
interface EventMeta {
  readonly eventType: string;
  readonly itemKind?: string;   // "review" | "approval" | ... from items.kind
  readonly costLevel?: string;  // "hard" | "soft" | "critical" | "warning"
}

/**
 * Post-classification filter. Downgrades push/digest to drop when the user
 * has disabled the corresponding alert toggle. Hard cost breaches bypass
 * all filters (safety invariant).
 */
export function applyAlertPreferences(
  classification: Classification,
  prefs: AlertPreferences,
  meta: EventMeta,
): Classification
```

### Modified: `DispatcherDeps` (dispatcher.ts)

```typescript
export interface DispatcherDeps {
  adapterFactory: AdapterFactory;
  now?: () => Date;
  logger?: Logger;
  /** Reader for user-facing alert preferences. Called per-event. */
  readAlertPreferences?: () => Promise<AlertPreferences>;
}
```

### Modified: `NotificationsSchema` (server-config.ts)

```typescript
const NotificationsSchema = z.object({
  reviewAlerts: z.boolean().default(true),
  costAlerts: z.boolean().default(true),
  blockerAlerts: z.boolean().default(true),
  quietHoursEnabled: z.boolean().default(false),  // NEW — default OFF
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  mutedTeams: z.array(z.string()).default([]),
});
```

### Modified: `NotificationSettings` (settings-types.ts)

```typescript
export interface NotificationSettings {
  reviewAlerts: boolean;
  costAlerts: boolean;
  blockerAlerts: boolean;
  quietHoursEnabled: boolean;  // NEW
  quietHoursStart: string;
  quietHoursEnd: string;
  mutedTeams: string[];
}
```

### Modified: `bootstrapFabric` (bootstrap.ts)

```typescript
import { readServerConfig } from "@hyperidle/server/services/server-config.js";
// Wait — this breaks the dependency direction. Fabric cannot import from server.
```

**Revised approach:** The `bootstrapFabric` context type is defined in fabric (`bootstrap.ts`), called from server (`server-factory.ts` line 128). The context currently has `{ db, eventBus }`. We add `readAlertPreferences` to this context. Fabric defines the `AlertPreferences` type and the reader interface. Server provides the implementation that reads from `readServerConfig`.

The call chain:
1. `server-factory.ts` imports `bootstrapFabric` from `@hyperidle/fabric`
2. `server-factory.ts` also imports `readServerConfig` from `./services/server-config.js`
3. `server-factory.ts` passes the reader as a closure

```typescript
// In server-factory.ts (line ~128):
import { readServerConfig } from "./services/server-config.js";

strategyBootstrap: (ctx) => bootstrapFabric({
  ...ctx,
  readAlertPreferences: async () => {
    const cfg = await readServerConfig(ctx.db);
    return {
      blockerAlerts: cfg.notifications.blockerAlerts,
      costAlerts: cfg.notifications.costAlerts,
      reviewAlerts: cfg.notifications.reviewAlerts,
      quietHoursEnabled: cfg.notifications.quietHoursEnabled,
      quietHoursStart: cfg.notifications.quietHoursStart,
      quietHoursEnd: cfg.notifications.quietHoursEnd,
    };
  },
}),
```

Wait -- this has a problem. `createApp` in `app.ts:72` defines the `strategyBootstrap` type as `(ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>`. Changing `bootstrapFabric`'s context type to include `readAlertPreferences` means `server-factory.ts` needs to wrap it, since `app.ts` passes `{ db, eventBus }` to the bootstrap function at line 460.

**Simpler approach:** `server-factory.ts` wraps `bootstrapFabric`:

```typescript
// server-factory.ts:
strategyBootstrap: ({ db, eventBus }) =>
  bootstrapFabric({
    db,
    eventBus,
    readAlertPreferences: async () => {
      const cfg = await readServerConfig(db);
      return cfg.notifications;
    },
  }),
```

This works because `server-factory.ts` already imports `bootstrapFabric` and has access to `readServerConfig`. The `AppOptions.strategyBootstrap` type in `app.ts` stays unchanged — it's the caller (`server-factory.ts`) that adapts the shape.

```typescript
// Modified bootstrap.ts context type:
export function bootstrapFabric(ctx: {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly readAlertPreferences?: () => Promise<AlertPreferences>;
}): Array<() => void> {
  // ... pass readAlertPreferences into registerNotificationDispatcher deps
}
```

The `AlertPreferences` type is exported from `@hyperidle/fabric` (defined in dispatcher.ts or a shared types file within fabric).

## Ordered Task List

### Task 1: Add `quietHoursEnabled` to server_config schema and change defaults

**Files:**
- `packages/server/src/services/server-config.ts` — add `quietHoursEnabled: z.boolean().default(false)` to `NotificationsSchema`
- `packages/web/src/settings/settings-types.ts` — add `quietHoursEnabled: boolean` to `NotificationSettings`
- `packages/server/src/routes/settings.ts` — add `quietHoursEnabled` to Zod schema, buildSettingsResponse

**Test:** `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts` — assert `readServerConfig(db)` on fresh DB returns `quietHoursEnabled: false`

**Dependencies:** None

### Task 2: Add `AlertPreferences` type and `readAlertPreferences` to dispatcher

**Files:**
- `packages/fabric/src/services/notifications/dispatcher.ts` — add `AlertPreferences` interface, add `readAlertPreferences` to `DispatcherDeps`, use it in `route()` function as post-classification filter
- `packages/fabric/src/services/notifications/types.ts` — export `AlertPreferences` type (or keep in dispatcher.ts)

**Logic change in `route()`:**

The alert preferences filter is applied as a post-classification step. A new helper
`applyAlertPreferences` takes the classification, event metadata, and preferences,
and returns a potentially downgraded classification:

```
function applyAlertPreferences(
  classification: Classification,
  prefs: AlertPreferences,
  eventMeta: { eventType: string; itemKind?: string; costLevel?: string },
): Classification

Rules:
1. If classification.kind === "drop" → return as-is (already dropped)
2. If eventType === "item_created" AND itemKind === "review" AND !prefs.reviewAlerts
   → return { kind: "drop", reason: "review alerts disabled" }
3. If classification.severity === "blocking" AND !prefs.blockerAlerts
   → return { kind: "drop", reason: "blocker alerts disabled" }
4. If eventType starts with "cost_cap" AND !prefs.costAlerts
   AND costLevel !== "hard"
   → return { kind: "drop", reason: "cost alerts disabled" }
   (hard cost breach ALWAYS pages — safety override, matches existing silence bypass)
5. If prefs.quietHoursEnabled AND isInSilenceWindow(prefs.quietHoursStart, prefs.quietHoursEnd, now)
   → enqueue with reason "silence" (same as existing silence behavior)
```

Note on review items: `session-review-creator.ts` creates items with `kind: "review"`,
`riskTier: "medium"|"high"`, `blocking: false`. A high-risk review item classifies
as `push/blocking` via `classifyItem(riskTier: "high")`. The `reviewAlerts` filter
checks `item.kind === "review"` to suppress specifically review-originated notifications,
regardless of their risk-based classification. The `item_created` handler already
fetches the full item row from the DB (line 598-605), so `item.kind` is available.

**Test:** New tests in `R8-signal-to-noise.test.ts`:
- Blocking item with `blockerAlerts: false` → no notification
- Blocking item with `blockerAlerts: true` → notification (existing behavior)
- Review item (kind="review", riskTier="high") with `reviewAlerts: false` → no notification
- Review item (kind="review", riskTier="high") with `reviewAlerts: true` → notification
- Non-review blocking item with `reviewAlerts: false` → STILL notifies (only reviews suppressed)
- Cost cap critical with `costAlerts: false` → no notification
- Cost cap hard with `costAlerts: false` → STILL notifies (safety override)
- Quiet hours enabled + within window → silenced (queued with reason "silence")
- Quiet hours disabled → not silenced regardless of time
- All preferences at defaults (true/true/true/false) → identical to current behavior

**Dependencies:** Task 1 (needs `quietHoursEnabled` field)

### Task 3: Wire `readAlertPreferences` through bootstrap

**Files:**
- `packages/fabric/src/bootstrap.ts` — add `readAlertPreferences` to context type and pass through to `registerNotificationDispatcher`
- `packages/server/src/app.ts` (or wherever `bootstrapFabric` is called) — construct the `readAlertPreferences` function from `readServerConfig`

**Test:** Integration test verifying the wiring — emit an event with `blockerAlerts: false` in server_config, assert no notification sent.

**Dependencies:** Task 1, Task 2

### Task 4: Update Settings UI for quiet hours toggle

**Files:**
- `packages/web/src/settings/SettingsNotifications.tsx` — add toggle for `quietHoursEnabled`, disable time inputs when OFF
- `packages/server/src/routes/settings.ts` — add `quietHoursEnabled` to PATCH validation schema

**Test:** Playwright E2E test — verify quiet hours toggle renders in OFF state, time inputs are disabled. Toggle ON, verify inputs become editable.

**Dependencies:** Task 1

### Task 5: Document event-to-notification mapping (AC1)

**Files:**
- `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts` — the comprehensive mapping test (may already exist from earlier tasks)
- `packages/fabric/src/services/notifications/dispatcher.ts` — add `@lore` block at module level documenting the full event subscription table

**@lore block content:**
```
@lore R8: Event-to-notification subscription mapping.
Events the dispatcher subscribes to:
  item_created       → classifyItem (blocking→push, high→push, medium→digest, low→drop)
  cost_cap_breached  → classifyCostBreach (hard→push+bypass_silence, soft→digest)
  cost_cap_warning   → classifyCostWarning (critical→push, warning→digest)
  routine_fired      → daily_digest trigger only (not a notification)

Events the dispatcher does NOT subscribe to (intentionally silent):
  task_state_changed  → silent; WS "work" topic for UI updates only
  bet_state_changed   → silent; WS "work" topic for UI updates only
  session_started     → silent; WS "session:<id>" topic for observe mode
  session_ended       → silent; WS "session:<id>" topic for observe mode
  thread_*            → silent; WS per-thread topics for UI updates
  knowledge_*         → silent; WS "conversations" topic for UI updates
  artifact_created    → silent; WS "work" topic for UI updates
  propagation_applied → silent; WS "work" topic for UI updates
  propagation_failed  → silent; WS "rail" topic for UI updates
  tool_call_recorded  → silent; WS "session:<id>" topic for observe mode
  dependency_met      → silent; internal scheduling
  bet_revised         → silent; internal
```

**Test:** Assert the mapping table is complete by checking the count of event types in `events.ts` matches the documented set.

**Dependencies:** Tasks 2-3 complete

### Task 6: Verify and commit

Run `npm run verify` (check + lint + test). All green. Commit.

**Dependencies:** All above tasks

## Security & Abuse Cases

| Vector | Applicable? | Handling |
|--------|------------|----------|
| Rate limit on POST/PATCH | N/A | No new endpoints. Existing routes already have rate limiting (test bucket on POST /test). |
| Input-trust boundary for agent-authored fields | N/A | Alert preferences are human-configured via Settings UI, not agent-writable. |
| Secret handling | N/A | No new credential surfaces. |
| Path traversal | N/A | No path inputs. |
| SSRF | N/A | No new outbound URLs. |
| Preference bypass | Applicable | Hard cost breach (`cost_cap_breached` with `level: "hard"`) MUST bypass all preference filters, matching the existing silence bypass behavior. Test asserts this. |
| Preference tampering via API | Low risk | PATCH /api/settings validates with Zod. Toggles are booleans. No injection surface. |

## Protected Tests (must not change assertions)

```
protectedTests:
  - packages/server/src/__tests__/notifications/dispatcher.test.ts
  - packages/server/src/__tests__/notifications/dispatcher.integration.test.ts
  - packages/server/src/__tests__/notifications/notifications-routes.test.ts
  - packages/server/src/__tests__/silence-policy.test.ts
  - packages/server/src/__tests__/P3-settings-config.test.ts
```

These files' existing assertions must not change. New test assertions go in the new `R8-signal-to-noise.test.ts` file. If existing tests fail due to the new `quietHoursEnabled` field appearing in API responses, the tests should be updated to include the new field in their expected shapes (additive, not behavioral change).

## Migrations

### Symbol changes

| Symbol | Change | Affected files |
|--------|--------|----------------|
| `NotificationsSchema` (server-config.ts) | Add `quietHoursEnabled` field | `server-config.ts` |
| `NotificationSettings` (settings-types.ts) | Add `quietHoursEnabled` field | `settings-types.ts`, `SettingsNotifications.tsx` |
| `notificationPatchSchema` (settings.ts) | Add `quietHoursEnabled` to Zod schema | `settings.ts` |
| `buildSettingsResponse` (settings.ts) | Add `quietHoursEnabled` to response | `settings.ts` |
| `DispatcherDeps` (dispatcher.ts) | Add `readAlertPreferences` | `dispatcher.ts`, `bootstrap.ts` |
| `bootstrapFabric` context type (bootstrap.ts) | Add `readAlertPreferences` | `bootstrap.ts`, `app.ts` (caller) |

### Fixture/test updates for new field

| File | Migration |
|------|-----------|
| `packages/web/e2e/fixtures.ts` | Add `quietHoursEnabled: false` to notification fixtures |
| `packages/web/e2e/settings.spec.ts` | Add `quietHoursEnabled` to expected response shape |
| `packages/web/e2e/M3-api-wiring.spec.ts` | Add `quietHoursEnabled` to mock notification data |
| `packages/web/e2e/settings-redesign.spec.ts` | Add `quietHoursEnabled` to mock notification data |
| `packages/web/e2e/mock-data-purge.spec.ts` | Add `quietHoursEnabled` to mock notification data |

No tables are added or renamed. No columns are added to the DB schema. The `server_config` table stores JSON, so `quietHoursEnabled` is a JSON-level addition, not a migration.

## Error Handling

**`readAlertPreferences` failure:** If the reader throws (DB error, corrupt JSON), the dispatcher catches and logs the error, then proceeds with all-alerts-ON defaults. Rationale: fail-open for notifications is safer than fail-closed. A missed notification about a cost breach is worse than an unwanted digest. This matches the existing pattern where `loadNotificationConfig` returning null (disabled) short-circuits the entire dispatcher.

**`quietHoursEnabled` + invalid time format:** If `quietHoursStart/End` are present but malformed, `isInSilenceWindow` already returns `false` (line 87-88 of silence-policy.ts — `startParts.length !== 2` check). No additional validation needed in the preference path.

## Risks & Ambiguities

1. **Performance: per-event preference read.** `readAlertPreferences` calls `readServerConfig` on every event, which does a DB read. At normal event volumes (tens per minute) this is negligible. If event storms occur, the existing flood-control mechanism already caps to 6 pushes/minute, so the extra DB read is bounded. No caching needed for MVP.

2. **Backward compatibility: existing `server_config` JSON.** Adding `quietHoursEnabled` to the Zod schema with `.default(false)` means existing JSON blobs without this field parse correctly (Zod fills the default). No data migration needed.

3. **Review alert semantics.** The `reviewAlerts` toggle controls whether review-type item_created events generate push notifications. It does NOT control the in-thread `unresolvedReviewLink` indicator in the Composer, which is a UI element driven by thread resolution state, not the notification system. This distinction should be documented.

4. **Quiet hours wiring.** The `quietHoursEnabled` + start/end in preferences is a SEPARATE mechanism from `factorySettings.silence_window_start/end`. The preference-based quiet hours are user-facing ("I don't want to be disturbed 22:00-08:00"). The factorySettings silence is operator-level ("mute everything factory-wide"). Both can coexist. The preference check happens in the dispatcher's route() function via `readAlertPreferences`. The factorySettings silence check continues to happen via `isSilenced()`.
