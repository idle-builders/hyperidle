# R8 Signal-to-Noise Defaults -- Code Review

**Verdict: NOT DONE**

6 findings need resolution before this passes. 4 are substantive (F-01 through F-04); 2 are minor but still required for completeness (F-05, F-06).

---

## Lens 1: Architecture

### F-01 CRITICAL -- Dispatcher reads server_config directly, bypassing dependency injection

**Plan contract violated:** Architecture Decision 1, Task 2 (`DispatcherDeps` gains `readAlertPreferences`), Task 3 (`bootstrapFabric` context type gains `readAlertPreferences`).

The plan explicitly chose Option A: "Pass a preferences reader function into `registerNotificationDispatcher`." The plan specifies `DispatcherDeps.readAlertPreferences?: () => Promise<AlertPreferences>`. The builder instead wrote a private `readAlertPrefs(db)` function inside `dispatcher.ts` that imports `serverConfig as serverConfigTable` from `@hyperidle/db` and reads/parses the raw JSON blob inline.

The `@lore R8` comment in the code says "fabric cannot depend on server. Both share the @hyperidle/db package which exports the serverConfig table." This is technically correct about import paths, but it creates a semantic layer violation: the dispatcher now knows the exact shape of `server_config.notifications` JSON, duplicating the parsing logic that already exists in `packages/server/src/services/server-config.ts`. The two JSON parsers (readAlertPrefs in dispatcher.ts and readServerConfig in server-config.ts) can now drift independently.

The plan's DI approach was specifically designed to avoid this -- fabric defines the `AlertPreferences` type, server provides the reader as a closure. The `DispatcherDeps` interface was NOT modified to include `readAlertPreferences`. `bootstrap.ts` was NOT modified. `server-factory.ts` was NOT modified (line 128 still passes `bootstrapFabric` directly, not a wrapper).

**Consequence:** Two independent JSON parsers for the same data. If the notifications schema changes (field added, renamed), only one parser may be updated.

**Files:**
- `packages/fabric/src/services/notifications/dispatcher.ts` lines 86-113 (readAlertPrefs)
- `packages/fabric/src/bootstrap.ts` (unchanged -- should have gained readAlertPreferences param)
- `packages/server/src/server-factory.ts` (unchanged -- should have wrapped bootstrapFabric)

### F-02 WARNING -- AlertPreferences and applyAlertPreferences not exported from fabric barrel

`packages/fabric/src/index.ts` lines 154-166 export `AdapterFactory`, `DispatcherDeps`, and the named functions from dispatcher.ts, but do NOT export `AlertPreferences` (type) or `applyAlertPreferences` (function). The test file in `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts` does not import these either -- it tests the behavior end-to-end through `registerNotificationDispatcher`. While the test approach is fine, the architecture plan specifies `AlertPreferences` as a public type contract ("exported from @hyperidle/fabric"), and `applyAlertPreferences` as a public pure function. If the DI approach from F-01 were implemented, downstream code (server-factory) would need to import `AlertPreferences` from fabric.

**File:** `packages/fabric/src/index.ts` lines 154-166

---

## Lens 2: Security

### F-03 WARNING -- Two `as Record<string, unknown>` casts in readAlertPrefs

`dispatcher.ts` lines 99 and 102:
```
const notifications = (json as Record<string, unknown>).notifications;
const n = notifications as Record<string, unknown>;
```

The TypeScript rules state: "No `any`, no `@ts-ignore`, no unsafe `as` casts." These casts are unsafe -- they bypass the type checker on the JSON blob. The existing `readServerConfig` in `server-config.ts` uses Zod's `safeParse` for this purpose, which is the project's established pattern. If F-01 is fixed (use DI instead of direct read), these casts disappear entirely. If the direct-read approach is kept (despite F-01), the inline parsing should use Zod, not manual type narrowing with casts.

**File:** `packages/fabric/src/services/notifications/dispatcher.ts` lines 99, 102

---

## Lens 3: Adversarial

### AC1 Documentation Completeness -- Missing full event subscription @lore block

The plan's Task 5 specifies a `@lore` block at module level in `dispatcher.ts` documenting the full event-to-notification subscription mapping (the large table showing all event types and their disposition). The code has four smaller `@lore R8:` comments about specific mechanisms (alert preferences, direct DB read, quiet hours separation, quietHoursEnabled gate), but NOT the canonical event mapping table. The test file documents the mapping via assertions (AC1 tests), which is good, but the plan specified BOTH the test AND the @lore block.

### Test Quality -- AC1 documentation tests assert static arrays, not runtime behavior

The AC1 tests ("documents which event types the dispatcher subscribes to") assert properties of hardcoded arrays defined in the test itself:
```typescript
const SUBSCRIBED_EVENTS: EventType[] = [
    "item_created", "cost_cap_breached", "cost_cap_warning", "routine_fired",
];
expect(SUBSCRIBED_EVENTS).toContain("item_created");
```

This is tautological -- it asserts that a local constant contains a value the test author just typed. It does NOT assert that the dispatcher actually subscribes to these events. The plan specified "Asserts the event-to-notification mapping table is complete (no missing events)" -- this should verify something about the dispatcher's actual behavior or the EventType union, not just list hardcoded arrays. The AC2 tests (emit task_state_changed, verify no notification) are the actually useful behavioral tests.

---

## Lens 4: Simplification

No findings. The `applyAlertPreferences` function is a clean pure filter. The separation of quiet hours (enqueue) from alert preferences (drop) correctly addresses the architecture critique WARNING about the return type mismatch. The code is proportional to the problem.

---

## Lens 5: AI Slop

No findings. No verbose naming, no filler comments, no unnecessary abstractions.

---

## Missing Changes

### F-04 WARNING -- E2E fixtures and P3 settings test missing quietHoursEnabled field

The architecture plan (Migrations section) explicitly lists 5 files that need `quietHoursEnabled: false` added to their mock notification data:

1. `packages/web/e2e/fixtures.ts` line 42 -- notifications mock lacks `quietHoursEnabled`
2. `packages/web/e2e/settings.spec.ts` line 19 -- mock lacks `quietHoursEnabled`
3. `packages/web/e2e/M3-api-wiring.spec.ts` line 20 -- mock lacks `quietHoursEnabled`
4. `packages/web/e2e/settings-redesign.spec.ts` line 39 -- mock lacks `quietHoursEnabled`
5. `packages/web/e2e/mock-data-purge.spec.ts` -- mock likely lacks `quietHoursEnabled`

The P3 settings test (`packages/server/src/__tests__/P3-settings-config.test.ts` line 71-79) uses a type assertion for the response shape that omits `quietHoursEnabled`. While this doesn't break the test (type assertions don't enforce completeness), it documents an incomplete contract.

These are the fixture/test updates the plan specifically identified as necessary for the `quietHoursEnabled` field. None were made.

**Impact:** E2E mocks serve responses without `quietHoursEnabled`, so the `SettingsNotifications` component receives `undefined` for `draft.quietHoursEnabled`. In JavaScript, `undefined` is falsy, so the toggle renders unchecked and the inputs render disabled, which happens to match the correct default behavior. However, this is correctness by accident, not by design. If the default were ever `true`, the mocks would silently produce wrong behavior.

### F-05 MINOR -- No Playwright E2E test for quiet hours toggle

The plan's Task 4 specifies: "Playwright E2E test -- verify quiet hours toggle renders in OFF state, time inputs are disabled. Toggle ON, verify inputs become editable." No Playwright test was written. The testing rules require "Playwright for all user-facing features."

### F-06 MINOR -- Missing .stories.tsx for SettingsNotifications changes

The frontend rules state "Every custom component must have a `.stories.tsx` file." SettingsNotifications gained a new toggle (quietHoursEnabled) and changed the disabled state of the time inputs. If no stories file exists for this component, the UI change is not independently verifiable in isolation.

---

## AC Completeness Audit

| AC | Status | Evidence | Notes |
|----|--------|----------|-------|
| AC1: Event subscriptions reviewed and defaults documented | PARTIAL | `R8-signal-to-noise.test.ts` AC1 tests document subscription mapping via test assertions. Four `@lore R8` comments in dispatcher.ts. | Missing: full event subscription @lore table (plan Task 5). AC1 tests are tautological (assert on local constants, not runtime). |
| AC2: Routine task state changes silent | PASS | 3 tests: pending->in_progress, in_progress->done, multiple transitions -- all assert zero adapter calls and zero queue rows. | Behavioral tests correctly prove the negative. |
| AC3: Blocked tasks and cost caps generate visible notifications | PASS | Tests cover: blockerAlerts=true pushes, blockerAlerts=false drops; costAlerts=false drops warning+soft breach but hard breach still pushes (safety override); costAlerts=true pushes. | Good coverage of preference overrides and safety invariant. |
| AC4: Reviews surfaced prominently | PASS | Tests cover: reviewAlerts=false drops review items, reviewAlerts=true pushes, reviewAlerts=false does NOT suppress non-review blocking items. Existing Composer unresolved-review indicator unchanged. | Correctly tests notification-level suppression while leaving UI indicator independent. |
| AC5: Default quiet hours OFF | PASS | Tests cover: readServerConfig fresh DB returns quietHoursEnabled=false; quietHoursEnabled=false ignores window even when covering entire day; quietHoursEnabled=true silences within window; hard cost breach bypasses quiet hours. | Good behavioral coverage. |
| Constraint: Overridable via Settings | PARTIAL | PATCH /api/settings accepts quietHoursEnabled. Server-config schema updated. Settings UI has toggle. | E2E fixtures not updated (F-04). No Playwright E2E test (F-05). |

---

## Summary of Required Fixes

1. **F-01 (CRITICAL):** Implement the planned dependency injection for alert preferences through `DispatcherDeps` -> `bootstrapFabric` -> `server-factory.ts`, OR document a deliberate deviation from the plan with a clear rationale. The current approach duplicates JSON parsing logic.

2. **F-02 (WARNING):** Export `AlertPreferences` type and `applyAlertPreferences` function from `packages/fabric/src/index.ts`.

3. **F-03 (WARNING):** Remove the two `as Record<string, unknown>` casts. If keeping the direct-read approach, use Zod parsing. If implementing F-01 DI, the casts disappear naturally.

4. **F-04 (WARNING):** Add `quietHoursEnabled: false` to all 5 E2E fixture/mock files and update the P3 settings test type assertion.

5. **F-05 (MINOR):** Add Playwright E2E test for the quiet hours toggle (plan Task 4 requirement).

6. **F-06 (MINOR):** Verify that SettingsNotifications has a stories file covering the new toggle; add one if missing.
