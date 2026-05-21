# Architecture Critique: O3

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:6 AC:7 DM:8 N:8 MD:8 FMC:7 S:7 V:7

---

## Dimension Scores

### 1. Spec Alignment (8/10)

Every acceptance criterion maps to a plan task. The plan correctly identifies that AC-11 (frontend strategy type imports) and AC "Components referencing removed columns" are already satisfied from O1/O2 and require only validation -- not code changes. The reconciliation table is thorough and honest.

Minor dings: The plan includes Task 6 (move `defaultNotificationAdapterFactory` to fabric) which is not explicitly called for by any AC but is a forced dependency of Task 3. This is valid scope, not creep. The plan also extends the knowledge route to include `layer` and `kind` in the GET response (Task 7), which is an implicit requirement of AC-10 (frontend knowledge URL shape) since the UI relies on those fields.

### 2. Layer Integrity (6/10)

**CRITICAL finding.** The plan claims at line 317: "No moved service imports a kernel service that stays in server. Clean separation confirmed." This is factually wrong. `lifecycle-propagation.ts` imports:
- `transitionTask` (runtime function) from `./task-state-machine.js` (kernel -- stays)
- `RevisionLogEntry` (type) from `./bet-state-machine.js` (kernel -- stays)

After the move to `packages/fabric/src/services/`, these relative imports break. The `transitionTask` import is a runtime dependency, not type-only, so it creates a reverse dependency from fabric back to server -- violating the dependency direction (server -> fabric, never fabric -> server).

Additionally, `notifications/dispatcher.ts` imports `isSilenced` from `../silence-policy.js`. Both move to fabric, so the relative path from `notifications/` up to `services/` still works. The plan missed this import entirely in its "Internal import fixes" analysis (lines 296-301) but it happens to be fine because both files move together.

The plan's own "Boundary Rule Enforcement" section (lines 733-739) correctly states the invariant ("fabric NEVER imports from @hyperidle/server") but the plan's file-move Task 1 would violate this invariant due to the lifecycle-propagation issue.

### 3. API Contracts (7/10)

The `bootstrapFabric` signature is fully specified with TypeScript. The `AppOptions` changes are documented. The `defaultNotificationAdapterFactory` export is defined.

However, the plan's extended deliberation about the bootstrap signature (lines 60-150) is confusing -- it walks through Options A through "Truly final decision" in a stream-of-consciousness style. The final decision is correct (follow the spec: `{ db, eventBus }`) but a builder could mistake an intermediate rejected decision for the final one. The plan should have pruned the deliberation trail and left only the final contract.

The `BootstrapFabricContext` interface appears in the plan at line 97 but is then explicitly rejected. A builder could accidentally implement the rejected extended interface.

### 4. Data Model Alignment (8/10)

No schema changes. The plan correctly identifies that `knowledgeStrategyFabric` already has `layer` and `kind` columns and the `GET /api/knowledge/` route just needs to widen its select. The migration inventory (lines 776-797) is thorough -- it inventories every symbol that moves and every call site that breaks.

### 5. Naming (8/10)

`bootstrapFabric` is honest -- it bootstraps all fabric (strategy) services. `strategyBootstrap` on `AppOptions` is clear about its purpose. `defaultNotificationAdapterFactory` is a bit long but accurately describes what it does.

The new file `adapter-factory.ts` in the notifications subtree is appropriately named.

### 6. Module Depth (8/10)

The public surface is minimal: one `bootstrapFabric` function as the entry point, hiding 7 register calls + 9 service modules + a notification subtree. This is a textbook deep module -- small interface hiding significant complexity.

The plan re-exports every individual service function from `fabric/index.ts` (Task 2), which is a large export surface. However this is necessary because server routes and tests import individual functions (not just the bootstrap). The exports serve real consumers.

### 7. Failure-Mode Coverage (7/10)

The security/abuse-cases table (lines 743-752) correctly marks all vectors as N/A with reasons, since O3 is a move-only workpackage that introduces no new surfaces. The dependency boundary violation check (`grep` for fabric -> server imports) is present.

**WARNING:** The plan does not address what happens when tests that previously injected `notificationAdapterFactory` or `gitRunnerFactory` via `AppOptions` try to use the new `strategyBootstrap` API. Three test files use these fields:
- `git-export.test.ts` (line 1147): passes `gitRunnerFactory` to `createApp()`
- `notifications/dispatcher.integration.test.ts` (line 75): passes `notificationAdapterFactory`
- `notifications/notifications-routes.test.ts` (lines 62, 311): passes `notificationAdapterFactory`

The plan's Migration Inventory (line 788) mentions this but says "the test architecture changes" without specifying how. The notification route still needs an `adapterFactory` parameter (it takes one in its constructor options). After removing `notificationAdapterFactory` from `AppOptions`, the route setup at `app.ts` line 290 needs a different source for the factory. The plan acknowledges this at lines 509-516 but the resolution is vague ("the route can import `defaultNotificationAdapterFactory` from `@hyperidle/fabric` directly").

### 8. Simplicity / Over-Engineering Risk (7/10)

The plan is appropriately scoped -- file moves + import rewrites + one bootstrap function + one frontend URL fix. No abstractions, no plugin points, no registries.

The extended design-decision deliberation (lines 58-150) is unnecessarily long for what turns out to be "follow the spec." The plan walks through 5 rejected alternatives in detail before arriving at the obvious answer. This wastes builder time -- a builder must read 90 lines of rejected ideas to find the 3-line conclusion.

### 9. Verifiability (7/10)

Every AC has a concrete verification command (grep, ls, or `bun run check`). The protected-tests list (lines 757-768) is populated and separates frozen tests from import-only changes.

**WARNING:** The plan lists `routines.test.ts` as NOT needing changes, but `routine-digest.integration.test.ts` (in the notifications subdirectory) imports `routine-scheduler` from a relative path -- this IS in the plan but only in Task 4's table, not in the narrative around it.

The kernel-only boot test (AC-8) is well specified: `createApp({})` + `GET /api/health` returns 200.

---

## CRITICAL

- **[Plan, Task 1, line 317]** `lifecycle-propagation.ts` imports `transitionTask` (runtime function) from `./task-state-machine.js` and `type RevisionLogEntry` from `./bet-state-machine.js`. Both are kernel services that stay in `packages/server`. After the move, these relative imports break and create a forbidden fabric -> server dependency. The plan's claim "No moved service imports a kernel service that stays in server. Clean separation confirmed" is false.

  **Fix:** The plan must address this cross-boundary dependency. Three options: (a) extract `transitionTask` and `RevisionLogEntry` to `@hyperidle/shared` so both packages can import them; (b) keep `lifecycle-propagation.ts` in the server package (contradicts AC-1); (c) accept that `lifecycle-propagation` re-exports its dependency through fabric's index and the kernel-service functions it needs must be passed as parameters (dependency injection). The plan must pick one and update Task 1's import analysis, Task 2's exports, and the verification steps. Option (a) is recommended -- `transitionTask` is a pure state-machine function that belongs in shared, and `RevisionLogEntry` is a type that belongs wherever bet types live.

## WARNING

- **[Plan, Task 4, lines 567-598]** Three notification test files are missing from the Task 4 inventory: `console-adapter.test.ts`, `dispatcher.test.ts`, and `dispatcher.integration.test.ts`. All three import from `../../services/notifications/` via relative paths and will break after the move. The builder must update these files' imports too.

  **Fix:** Add these three files to the Task 4 test file table with their respective service imports.

- **[Plan, Task 1, lines 296-301]** The "Internal import fixes within moved files" section is missing `notifications/dispatcher.ts` which imports `../silence-policy.js`. Both files move together so the path still works, but the omission from the analysis suggests the audit was incomplete. The section should also note that `lifecycle-propagation.ts` has external kernel dependencies (the CRITICAL finding above).

  **Fix:** Add `notifications/dispatcher.ts` -> `../silence-policy.js` to the internal import analysis. Note it works because both move together.

- **[Plan, Task 3 + Task 6, lines 509-516]** After removing `notificationAdapterFactory` from `AppOptions`, the `app.ts` notification-route setup at line 290 (`const adapterFactory = options.notificationAdapterFactory ?? defaultNotificationAdapterFactory`) needs to change. The plan says "import from `@hyperidle/fabric` directly" but does not specify the exact code change or the test migration strategy for tests that inject custom adapters via `AppOptions`.

  **Fix:** Specify that `app.ts` line 290 changes to `const adapterFactory = defaultNotificationAdapterFactory` (imported from `@hyperidle/fabric`), and that the three test files using `notificationAdapterFactory`/`gitRunnerFactory` in `AppOptions` must instead pass a custom `strategyBootstrap` function that wires individual register functions with their test factories. Provide the pattern once; the builder applies it three times.

- **[Plan, Design Decision, lines 58-150]** The deliberation trail for the bootstrap signature is 90 lines of rejected alternatives that muddy the final contract. A builder scanning the plan may misread an intermediate "decision" as final.

  **Fix:** Prune to: state the spec constraint, note the notification/git factory concern, state the final decision (2-3 sentences), provide the final code. Move the deliberation trail to a collapsed/summary section or remove it.

## SUGGESTION

- **[Plan, Task 2, lines 328-404]** The export list is approximate (marked "builder MUST read each service file's actual exports"). For a 25-file move with ~60 exports, an inaccurate list risks the builder missing re-exports that break downstream consumers. Consider generating the list from `grep "^export" packages/server/src/services/<file>` rather than hand-approximating it.

- **[Plan, Task 7, lines 655-666]** The knowledge route extension (adding `layer` and `kind` to the GET response) introduces strategy data into a kernel route. The plan's `@lore O2` comment already acknowledges this as a "pragmatic boundary compromise." This is fine for O3 but should be flagged as tech debt for the fabric to eventually serve its own endpoint.

- **[Plan, Task 8]** The verification step should include a `grep -rn "from.*\"\.\.\/services\/" packages/server/src/__tests__/notifications/ | grep -v observability` check to catch any notification test files that still use old relative imports after the migration. The current grep patterns in AC verification only check `packages/server/src/services/` for file existence, not test import paths.

## What's Working Well

- The Plan Reconciliation table (lines 18-29) is excellent -- it cross-references every spec assumption against codebase reality with concrete file paths and line numbers, and identifies four assumptions that are already satisfied (no wasted work).

- The task parallelism diagram (lines 816-832) and the critical-path analysis are clear and actionable. The recommended execution order for a single builder is pragmatic and correctly sequenced.

---

**Verdict:** Score is 7/10. The CRITICAL finding about `lifecycle-propagation.ts` importing kernel services must be resolved in the plan before proceeding to build. The plan is otherwise thorough and well-structured. Once the CRITICAL is addressed and the WARNING items are incorporated, this plan is ready for `/write-tests`.
