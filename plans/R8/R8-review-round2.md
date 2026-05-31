# R8 Signal-to-Noise Defaults -- Code Review Round 2

**Verdict: NOT DONE**

1 new finding from round 2. All 6 original findings are resolved, but the fix for F-06 introduced a test reliability defect that must be fixed before merge.

---

## Round 1 Finding Verification

### F-01 CRITICAL -- Dispatcher reads server_config directly

**Status: RESOLVED**

The builder correctly implemented the planned DI approach:

1. `DispatcherDeps` gained `readAlertPreferences?: () => Promise<AlertPreferences>` (dispatcher.ts line 130).
2. `bootstrapFabric` context type gained `readAlertPreferences` (bootstrap.ts line 30).
3. `server-factory.ts` wraps `bootstrapFabric` and injects `readAlertPreferences` backed by `readServerConfig(db)` (server-factory.ts lines 130-145).
4. The private `readAlertPrefs(db)` function that read `server_config` directly is gone.
5. The dispatcher now calls `readPrefs(deps.readAlertPreferences)` (line 535), which fails open to all-alerts-ON defaults.

Layer integrity restored. Fabric defines the type, server provides the implementation.

### F-02 WARNING -- AlertPreferences not exported from fabric barrel

**Status: RESOLVED**

`packages/fabric/src/index.ts` now exports both `AlertPreferences` (type) and `applyAlertPreferences` (function) from the dispatcher module.

### F-03 WARNING -- Unsafe `as` casts

**Status: RESOLVED**

The two `as Record<string, unknown>` casts were in the deleted `readAlertPrefs(db)` function. With F-01 resolved via DI, these casts no longer exist. The only remaining `as` cast in dispatcher.ts (line 396: `row.severity as NotificationSeverity`) is pre-existing, not from this PR.

### F-04 WARNING -- E2E fixtures not updated for quietHoursEnabled

**Status: RESOLVED**

`quietHoursEnabled: false` added to all 5 locations:

- `packages/web/e2e/fixtures.ts` (DEFAULT_SETTINGS)
- `packages/web/e2e/settings.spec.ts` (SETTINGS_FIXTURE)
- `packages/web/e2e/M3-api-wiring.spec.ts` (SETTINGS_API_RESPONSE)
- `packages/web/e2e/settings-redesign.spec.ts` (DEFAULT_SETTINGS)
- `packages/web/e2e/mock-data-purge.spec.ts` (OVERRIDE_SETTINGS)

P3 test (`P3-settings-config.test.ts`) also gained the `TestDbHandle` type import for proper cleanup.

### F-05 MINOR -- No Playwright E2E test for quiet hours toggle

**Status: RESOLVED**

Two E2E tests added in `packages/web/e2e/settings-redesign.spec.ts`:

1. "R8: quiet hours toggle renders OFF by default; time inputs disabled when toggle is OFF" -- verifies checkbox unchecked, start/end inputs disabled.
2. "R8: toggling quiet hours ON enables time inputs" -- verifies click toggles state, inputs become enabled.

Tests use proper accessibility selectors (`getByRole("checkbox", { name: /enable quiet hours/i })`, `getByLabel(/quiet hours start/i)`).

### F-06 MINOR -- AC1 tests tautological + missing @lore table

**Status: RESOLVED**

The tautological documentation tests (asserting on hardcoded local arrays) have been replaced with 5 behavioral tests in "R8 AC1 -- Event subscription mapping (behavioral)":

- `item_created` with blocking item: emits event, asserts adapter receives severity="blocking"
- `cost_cap_breached` (hard): emits event, asserts adapter receives severity="cost_breach"
- `cost_cap_warning` (critical): emits event, asserts adapter receives push
- `task_state_changed`: emits event, asserts zero adapter calls AND zero queue rows
- `cost_cap_warning` (warning level): emits event, asserts digest queue row appears, no push

The `@lore R8` event mapping table is present at the module level in dispatcher.ts (lines 19-29), documenting subscribed events with their classification paths and intentionally silent events.

---

## New Finding

### F-07 WARNING -- Missing `handle.close()` in 6 of 9 describe-block afterEach hooks

**File:** `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts`

**Lines:** 339, 416, 486, 608, 792, 947 (afterEach blocks)

**Contract violated:** Testing rules -- "Tests must not depend on execution order." Resource leaks from unclosed DB handles make later tests depend on the accumulated leak state of earlier tests.

Six describe blocks call `createTestDb()` in `beforeEach` but only call `unsubscribe?.()` in `afterEach`, never closing the DB handle. Three describe blocks (lines 206, 719, 892) correctly include `await handle?.close()`.

**Measured impact:** When the properly-closing AC1 block (line 206) runs, its tests complete in 438ms-2017ms. Immediately after the AC2 block (line 339, no `handle.close()`), the first test completes in 29ms but the second takes 107180ms (107 seconds) because the `beforeEach` of the next test must wait for the leaked SQLite handle. Under CI load (multiple worktrees running tests concurrently), this consistently exceeds the 120s hookTimeout, causing test failures.

**Evidence:** Two R8 tests failed in the full test suite run with "Hook timed out in 120000ms" errors:
- `R8 Settings API > PATCH /api/settings accepts quietHoursEnabled=true` (line 801)
- `R8 Preferences wiring > all alerts ON (defaults)` (line 854)

Both failures occurred at `beforeEach` hooks (creating the next test's DB), not in test bodies.

**Fix:** Add `await handle?.close()` to all 6 afterEach blocks that are missing it. Pattern to match:

```typescript
afterEach(async () => {
    unsubscribe?.();
    await handle?.close();
});
```

Affected describe blocks:
- "R8 AC2 -- Routine task state changes are silent" (line 339)
- "R8 AC3 -- Blocker alerts respect blockerAlerts preference" (line 416)
- "R8 AC3 -- Cost alerts respect costAlerts preference" (line 486)
- "R8 AC4 -- Review alerts respect reviewAlerts preference" (line 608)
- "R8 AC5 -- Quiet hours dispatcher integration" (line 792)
- "R8 Preferences wiring -- server_config drives dispatcher" (line 947)

---

## AC Completeness Audit

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Event subscriptions reviewed and defaults documented | PASS | 5 behavioral tests in "AC1 -- Event subscription mapping (behavioral)" prove subscription by emitting events and observing adapter/queue outcomes. @lore event mapping table at dispatcher.ts lines 19-29. |
| AC2: Routine task state changes silent | PASS | 3 tests in "AC2 -- Routine task state changes are silent" emit task_state_changed and assert zero adapter calls + zero queue rows. AC1 also includes a task_state_changed silence test. |
| AC3: Blocked tasks and cost cap warnings generate clear notifications | PASS | Tests cover: blockerAlerts on/off, costAlerts on/off, hard cost breach safety override (bypasses costAlerts=false), cost warning push/digest classification. |
| AC4: Reviews pending human verdict surfaced prominently | PASS | Tests cover: reviewAlerts=false drops review items, reviewAlerts=true pushes, reviewAlerts=false does NOT suppress non-review blocking items. |
| AC5: Default quiet hours are off | PASS | readServerConfig returns quietHoursEnabled=false by default. Tests verify: quietHoursEnabled=false ignores window, quietHoursEnabled=true enqueues within window, hard cost breach bypasses quiet hours. UI toggle renders OFF, time inputs disabled. E2E tests verify toggle and input state. |
| Constraint: Overridable via Settings | PASS | PATCH /api/settings accepts quietHoursEnabled (Zod schema + route). Settings UI has toggle controlling enabled state with disabled time inputs. E2E tests verify toggle interaction. |

All ACs are covered. The only open item is F-07 (test reliability) which does not affect feature correctness but causes flaky test failures under load.

---

## Summary

The builder correctly resolved all 6 findings from round 1. The DI approach for alert preferences (F-01) is properly implemented through the three-layer chain: dispatcher defines the type, bootstrap accepts the reader, server-factory provides the implementation. The tautological tests (F-06) are replaced with genuine behavioral tests. The E2E tests (F-05) and fixture updates (F-04) are complete.

One new finding (F-07) must be fixed: 6 of 9 describe blocks in the R8 test file leak DB handles by omitting `handle.close()` in afterEach. This causes test timeouts under concurrent load (measured at 107s per test vs sub-2s with proper cleanup). The fix is mechanical -- add `await handle?.close()` to each affected afterEach.
