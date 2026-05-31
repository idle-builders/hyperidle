# Architecture Critique: R8

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:7 DM:8 N:9 MD:8 FMC:8 S:7 V:8

## Dimension Scores

### 1. Spec Alignment (9/10)

All five ACs map to plan tasks. The plan correctly identifies that AC2, AC3, and AC4 are already satisfied by existing code, and documents verification for them anyway. The only scope-creep risk is the alert-preferences wiring (the "critical gap" — dead toggles that never reach the dispatcher), which is a legitimate forced dependency: without it, the spec's "defaults overridable via Settings" constraint is unmet. One minor gap: AC1 says "reviewed and defaults documented" — the plan covers documentation via test + @lore but does not specify *where* the review itself is recorded (the test IS the review artifact, which is defensible, but the plan should state this explicitly).

### 2. Layer Integrity (9/10)

The plan correctly identifies the dependency direction problem (fabric cannot import from server) and solves it via dependency injection — `bootstrapFabric` accepts a `readAlertPreferences` function, server provides the implementation. This preserves the Human Interface -> Meta Layer -> Agent Runtime dependency direction. The `AlertPreferences` type is defined in fabric (where the consumer lives), not server. Clean.

### 3. API Contracts (7/10)

The PATCH `/api/settings` already exists and the plan adds `quietHoursEnabled` to the existing Zod validation schema. The response shape change (adding `quietHoursEnabled` to the notifications object in `buildSettingsResponse`) is described but not given as an explicit before/after contract. The plan does not specify the HTTP status codes for the PATCH endpoint (though they already exist and are unchanged). No new routes are introduced, which limits the contract surface. However, the `AlertPreferences` type is well-specified with all fields typed.

**Finding:** The plan shows the `AlertPreferences` interface including `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd` alongside the alert booleans. But the plan's `applyAlertPreferences` function signature takes `Classification` + `AlertPreferences` + `EventMeta` and returns `Classification`. The rules for quiet hours (rule 5) say "enqueue with reason silence" — but the function signature returns a `Classification`, not a queue action. The quiet hours logic cannot be expressed purely as a classification downgrade because it needs to enqueue rather than drop. This is a contract mismatch within the plan.

### 4. Data Model Alignment (8/10)

The schema change is JSON-level (adding `quietHoursEnabled: boolean` to the `server_config` JSON blob), not a table migration. The plan correctly notes that Zod's `.default(false)` handles backward compatibility with existing JSON blobs. The `NotificationsSchema` update is specified field-by-field. The plan identifies all fixture/test files that need the new field added to their mock data. No column additions, no migrations needed.

### 5. Naming (9/10)

`AlertPreferences` is honest — it describes what it holds. `applyAlertPreferences` describes what it does. `readAlertPreferences` describes its side effect. `quietHoursEnabled` is unambiguous. `EventMeta` is slightly generic but scoped to the dispatcher's internal use, so acceptable.

### 6. Module Depth (8/10)

The public surface addition is minimal: one new optional field on `DispatcherDeps`, one new type export (`AlertPreferences`), one new pure function (`applyAlertPreferences`). The `readAlertPreferences` reader is injected as a closure, not exposed as a public API. The `bootstrapFabric` context type gains one optional field. This is proportional to the problem.

### 7. Failure-Mode Coverage (8/10)

The plan addresses: `readAlertPreferences` failure (fail-open with all-alerts-ON defaults), malformed quiet hours times (existing `isInSilenceWindow` returns false), per-event DB read performance (bounded by flood control), and backward compatibility. The security table covers preference bypass (hard cost breach override), preference tampering (Zod validation), and marks N/A items with reasons.

**Finding:** The plan does not specify what happens if the `readAlertPreferences` function is called but the server_config table row doesn't exist yet (first boot). This is actually handled by `readServerConfig` returning `DEFAULTS`, but the plan should state this explicitly in the error-handling section since it's a dependency assumption.

### 8. Simplicity / Over-Engineering Risk (7/10)

The plan introduces two levels of quiet hours (preference-based via `AlertPreferences.quietHoursEnabled` + factory-level via `factorySettings.silence_window_*`). The plan acknowledges this dual mechanism in Risk #4 but does not explain why this is necessary rather than consolidating. For an M-complexity workpackage, having two independent silence mechanisms that can conflict is complexity that could confuse future maintainers. However, the plan defends this as intentional separation of user-facing vs operator-level concerns, which is reasonable.

The `EventMeta` type with `eventType`, `itemKind`, and `costLevel` adds a metadata-passing layer that could alternatively be handled by extending the `Classification` type to carry this context. But the plan's approach of keeping classification pure (output of event analysis) and metadata separate (input context for preference filtering) is defensible.

### 9. Verifiability (8/10)

Every AC has concrete test assertions in named test files. The test cases are specific: "blocking item with `blockerAlerts: false` -> no notification." The protected-tests list is populated with 5 existing test files. The plan specifies that existing test assertions must not change, only additive updates for the new field. Playwright E2E is planned for the quiet hours toggle.

**Finding:** The plan places the new comprehensive test file at `packages/server/src/__tests__/notifications/R8-signal-to-noise.test.ts` but imports from `@hyperidle/fabric` (the dispatcher is in fabric). This is consistent with existing test patterns (the existing `dispatcher.test.ts` is also in server's test dir and imports from fabric), so this is fine — but the plan should note this is by precedent, not accident.

---

### CRITICAL

None.

### WARNING

- [plan "Type Signatures" / `applyAlertPreferences`] The function signature returns `Classification` but rule 5 (quiet hours) requires enqueueing with reason "silence", which is a side-effecting queue operation, not a classification downgrade. The `drop` classification means "discard entirely" per the existing `route()` function semantics, while silence means "hold for later delivery." These are different outcomes that cannot be expressed in the same return type. The builder must either: (a) handle quiet hours separately in `route()` before calling `applyAlertPreferences` (keeping the function pure for alert toggles only), or (b) extend the return type to include a `{ kind: "silence" }` variant. Option (a) is simpler and consistent with how the existing factory-level silence check works in `route()` (lines 542-555 of dispatcher.ts).

- [plan "Ordered Task List" / Task 3] The plan says the bootstrap wiring change should be in `packages/server/src/app.ts` ("or wherever `bootstrapFabric` is called"). The actual call site is `packages/server/src/server-factory.ts` line 128. `app.ts` defines the `AppOptions.strategyBootstrap` type but does NOT call `bootstrapFabric` — it calls `options.strategyBootstrap?.({ db, eventBus })`. The correct file to modify is `server-factory.ts`, where the wrapper closure should be constructed. The `bootstrapFabric` context type in `packages/fabric/src/bootstrap.ts` also needs updating to accept the optional `readAlertPreferences`. The plan's "Revised approach" code block at lines 253-265 is correct, but Task 3's file list is ambiguous.

### SUGGESTION

- [plan "Plan Reconciliation" / AC5] The plan says quiet hours start/end default to `"22:00"` and `"08:00"` and are "cosmetically on in the UI." This is a good observation. However, the plan's solution (add `quietHoursEnabled: false`) means the time inputs show populated values ("22:00" / "08:00") but are inactive. Consider whether the time inputs should show empty/placeholder state when disabled, or retain the defaults as pre-populated values when the user enables the toggle. This is a UI detail the builder can decide, but the plan could specify the expected behavior.

- [plan "Ordered Task List" / Task 5] The @lore block lists `cost_cap_warning` events with levels "critical" and "warning" but the dispatcher also subscribes to `routine_fired` for daily digest triggers. The @lore mapping correctly lists `routine_fired` but describes it as "daily_digest trigger only (not a notification)." This is accurate but could confuse a reader since `routine_fired` IS a dispatcher subscription — just one that does not produce a Classification. Consider noting this distinction more explicitly.

- [plan "Risks & Ambiguities" / #1] The per-event `readServerConfig` DB read is acknowledged as negligible at normal volumes. Consider whether the `readAlertPreferences` call could be lifted to the top of `route()` (where `loadNotificationConfig` is already called) to batch the two DB reads together, rather than adding it as a separate call in the event handler. This reduces the number of DB round-trips per event from 2 to 1 if the reads are done in parallel.

- [plan "Migrations" / Fixture/test updates] The plan identifies 5 e2e files needing `quietHoursEnabled: false` added to mock data. Given that these are additive changes to mock objects, the builder should verify that the e2e tests' mock API response shapes match the updated `buildSettingsResponse` return type (which will now include `quietHoursEnabled`). If any e2e test does exact-match assertions on the response shape, they will fail without the new field.

### What's Working Well

- The two-config-store disconnection analysis is excellent. The plan identifies a real architectural gap (Settings UI writes toggles that the dispatcher never reads) and proposes a clean dependency-injection solution that respects the layer boundary. This level of codebase forensics is what separates a good plan from a superficial one.

- The "already satisfied" reconciliation table with verification for each AC is rigorous. Rather than assuming existing behavior is correct, the plan requires proving tests for the negative cases (task_state_changed NOT subscribed, reviews surfaced via Composer). This prevents silent regressions if future changes accidentally add subscriptions.
