# AD2 — Task-to-Session Dispatcher: Retrospective

## Cost Signals

| Metric | Value |
|--------|-------|
| Commits | 6 |
| Lines changed | +2,634 / -7 (12 files) |
| Tests | 13 (all passing) |
| Architecture score | 8.2/10 |
| Review verdict | DONE (3 non-blocking warnings) |
| Phases | 6 (setup → arch → critique → red → green → review) |

## What Went Well

1. **Architecture interrogation caught the critical gap.** The plan's "Design-It-Twice" sections resolved five key design questions before code was written. The handoff re-dispatch timing issue (provisionSession Phase 3 conditional transition) was identified during planning, preventing a likely InvalidTransitionError in implementation.

2. **Circular dependency broken with registry pattern.** The provision-registry.ts leaf module (54 lines) solved a Vite SSR TDZ error that dynamic `import()` would have caused. The pattern is generalizable to future fabric↔server integration points.

3. **Generation counter prevented test flakes.** A stale disposal race (disposed test's background drain corrupting next test's queue) was caught and fixed with a monotonic counter — 10 lines that prevent hard-to-debug intermittent failures.

4. **TDD discipline kept implementation focused.** Red phase (13 tests) clearly specified all ACs. Green phase had one job: make tests pass. No refactoring drift.

5. **Event-driven architecture is lean.** No polling, no timers, no new DB tables. Leverages existing events (task_state_changed, session_ended) with a startup sweep for crash recovery.

## What Was Harder Than Expected

1. **Handoff re-dispatch timing.** Understanding the full chain (handoff → provisionSession teardown → endSession → session_ended event → dispatcher re-dispatch) required reading three services end-to-end. Eight `@lore` comments were needed to document the flow.

2. **Startup sweep scope.** Initial sweep of both accepted AND in_progress tasks caused false re-dispatch in tests. Narrowed to accepted-only, accepting a narrow crash-recovery gap as documented limitation.

3. **Drain loop complexity.** The drainQueue function handles four error types, generation staleness, and per-agent blocking in a single pass. Required biome complexity suppression + detailed comments.

## Lore Discovered

Eight `@lore` comments added across task-dispatcher.ts, provision-registry.ts, and bootstrap.ts covering: fabric placement rationale, registry pattern for circular deps, module-level queue scoping, generation counters, fire-and-forget drain pattern, startup sweep scope, session_ended timing guarantee, and conditional transition guard.

## Process Observations

- Architecture-before-code prevented double rework (handoff gap caught in planning)
- Code review caught 3 warnings, 0 blockers — plan quality directly reduced review findings
- TDD phase separation (red/green) kept implementation coherent despite 535-line dispatcher
- In-memory queue validated as correct v1 choice; BullMQ migration path is clear
