# O1 Code Review: Types and Events Split

**Reviewer:** Phase 4 code review  
**Branch:** `feat/O1-types-events-split`  
**Commits:** 3 (red tests, implementation, lint fixes)  
**Verdict:** DONE

---

## AC Completion Table

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Strategy types moved from `shared/types.ts` to `fabric/types.ts`: KnowledgeLayer, KNOWLEDGE_LAYERS, KnowledgeKind, KnowledgeScope, KNOWLEDGE_SCOPES, KNOWLEDGE_STATUSES (7-state), KnowledgeTopicHealth, KNOWLEDGE_TOPIC_HEALTHS, KnowledgeSortOption, KNOWLEDGE_SORT_OPTIONS, KnowledgeRelevanceSignals, KnowledgeAccessorKind, RiskTier, AutonomyLevel | PASS | All 16 types/consts present in `packages/fabric/src/types.ts` lines 11-66. Removed from `packages/shared/src/types.ts`. Grep for strategy types in `packages/shared/src/` (excluding tests) returns zero runtime exports. |
| 2 | PropagationLevel, PropagationStatus, PropagationResult moved from `shared/propagation.ts` to `fabric/types.ts` | PASS | All three present in `packages/fabric/src/types.ts` lines 63-77. `packages/shared/src/propagation.ts` deleted. |
| 3 | `KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived"]` added to `shared/types.ts` | PASS | Present at `packages/shared/src/types.ts` line 52. Tested in `types.test.ts` and `o1-type-split.test.ts`. |
| 4 | KERNEL_AGENT_ROLES, FABRIC_AGENT_ROLES, and full AGENT_ROLES union defined in `shared/types.ts` | PASS | Present at `packages/shared/src/types.ts` lines 67-74. Composition tested: AGENT_ROLES.length === 6 (3 kernel + 3 fabric). |
| 5 | All imports across all packages updated to reference new locations | PASS | Zero strategy-type imports from `@hyperidle/shared` in production code. Updated in: fabric internals (3 files), server (6 files), web (6 files), design-system (2 files). Package.json dependencies added for web and design-system. |
| 6 | KernelEvent and StrategyEvent unions defined in `shared/events.ts`. DomainEvent = KernelEvent \| StrategyEvent. | PASS | KernelEvent (16 members) at line 264, StrategyEvent (7 members) at line 283, DomainEvent at line 293. Exhaustiveness tested in `o1-event-split.test.ts`. |
| 7 | Deleted: BetShippedEvent, BetCommittedEvent, ResponseRecordedEvent (NotificationEvent moved to StrategyEvent per documented AC deviation) | PASS | Interfaces removed from `events.ts`. Exports removed from `index.ts`. NotificationEvent retained in StrategyEvent union (correctly deviated -- it IS emitted by policy-engine.ts and dependency-watcher.ts). |
| 8 | Tests updated: policy-engine.test.ts, task-state-machine.test.ts, dependency-watcher.test.ts, ws-broadcaster.test.ts | PASS | ws-broadcaster.test.ts migrated from ResponseRecordedEvent to KnowledgeUpdatedEvent. policy-engine, task-state-machine, dependency-watcher tests unchanged (NotificationEvent preserved). |
| 9 | Added: KnowledgeCreatedEvent, KnowledgeArchivedEvent, KnowledgeAccessedEvent | PASS | Interfaces defined in `events.ts` lines 109-134. Exported from `index.ts`. Compile-time tested in `o1-event-split.test.ts`. |
| 10 | KnowledgeUpdatedEvent.action kept as `string` with @lore | PASS | `action: string` at line 105 with detailed @lore documenting the 11+ action values and dynamic pattern. |
| 11 | SessionEndedEvent.costDelta field removed | PASS | Removed from interface, all emitters (session-lifecycle.ts, sessions-routes.ts), all consumers (observability dispatcher, console adapter, langfuse adapter), ObservabilityEvent type, and all test files. resolveCostBaseline function deleted. |
| 12 | @lore comment above KernelEvent union documenting how-to-add-an-event pattern | PASS | Present at `events.ts` lines 258-262. Documents the three-step process. |
| 13 | grep for strategy types in packages/shared/src/ returns only legitimate kernel refs | PASS | Only hits: KERNEL_KNOWLEDGE_STATUSES (new kernel type), PropagationLevelLiteral (inline duplicate with @lore), and @lore comments referencing fabric. |
| 14 | bun run check passes | PASS | 0 type errors. |
| 15 | bun run test passes | PASS | 4384 passed, 0 failed. |

---

## Findings by Lens

### Lens 1: Architecture

**No critical findings.**

- Layer boundaries respected. `packages/shared` (kernel) never imports from `@hyperidle/fabric` (strategy). `packages/fabric`, `packages/web`, `packages/server`, and `packages/design-system` import strategy types from `@hyperidle/fabric`.
- The `PropagationLevelLiteral` inline type in `events.ts` correctly avoids the forbidden shared-imports-fabric direction. @lore comment documents the duplication.
- KernelEvent/StrategyEvent classification matches the concept doc exactly (NotificationEvent deviation documented in architecture plan).
- Seed fixtures updated: `builtin:post-bet-retro` trigger config changed from `"bet_shipped"` to `"bet_state_changed"`.
- `KnowledgeFormat` correctly kept in shared (kernel concern).
- All 3 new knowledge events have correct shapes (streamId, itemId, timestamp; KnowledgeAccessedEvent adds accessorKind + accessorId).

### Lens 2: Design

Skipped -- no UI changes.

### Lens 3: Security

**No findings.** O1 adds no routes, no input surfaces, no new trust boundaries. Pure type reorganization.

### Lens 4: Adversarial

**WARN-1: Dead event cases in observability dispatcher.**  
`packages/server/src/services/observability/dispatcher.ts` lines 456 and 459 still contain `case "response_recorded":` and `case "bet_committed":` in the fall-through ignore list. These event types no longer exist in `DomainEvent`. They are dead code that can never match at runtime. The architecture plan (Task 10) only called for removing the `bet_shipped` case block, not the fall-through ignore list entries. This is not a regression (the code compiles and tests pass) but these string literals reference deleted types. They should be cleaned up. Pre-existing issue: the dispatcher's exhaustiveness check (`const Never: never = event` in default) was already incomplete before O1 -- thread events and propagation events were never handled. This is NOT an O1 regression.

**WARN-2: Inaccurate @lore comment about costDelta.**  
`packages/server/src/services/session-lifecycle.ts` lines 39-44 claim "costDelta was always 0 in practice." This is incorrect. The original code computed `costDelta = costInCents - resolveCostBaseline(db, sessionId, baselineCost)`. For provisioned sessions, `session-provisioning.ts` passed `baselineCost: 0`, making `costDelta = costInCents` (the full session cost). For the REST PATCH route, `costDelta` was explicitly 0. The @lore should say "costDelta was the full session cost for provisioned sessions and 0 for REST-originated ends" -- the current wording understates the data gap in the observability layer.

**WARN-3: `void baselineCost` pattern in session-lifecycle.ts.**  
Lines 152 and 214 use `void baselineCost;` to suppress unused-parameter warnings. The function signature retains `baselineCost?: number` with comment "retained for API compatibility." This is acceptable for now since callers in `session-provisioning.ts` pass the parameter, but the parameter should be removed in a follow-up when callers are updated. The `void` expression is honest about the situation.

**WARN-4: New knowledge events not handled in observability dispatcher.**  
`knowledge_created`, `knowledge_archived`, `knowledge_accessed` are new KernelEvent members but have no corresponding case in the observability dispatcher switch. They silently fall through to the `default` branch and are dropped. This is the same pattern as thread events (also dropped), so it is not an O1 regression. However, the dispatcher's ignore list should be updated to explicitly list these events, documenting the intentional drop.

### Lens 5: Simplification

**OBS-1: Test file `o1-type-split.test.ts` uses `as Record<string, unknown>` casts.**  
Lines 30-58 (6 instances) cast `sharedIndex` to `Record<string, unknown>` to check runtime export presence. These are necessary because TypeScript type-only exports are not visible at runtime -- the test correctly checks the index module's actual exports. The pattern is justified.

**OBS-2: Test file `o1-event-split.test.ts` uses local `KernelEvent` type re-definition.**  
Lines 169-190 define a local `KernelEvent` type via `Extract<DomainEvent, { type: ... }>` instead of importing `KernelEvent` from the source. This is intentional -- the test independently defines what KernelEvent should be and verifies exhaustiveness, creating a compile-time guard that catches drift between the test's expectation and the actual union. This is the right pattern.

### Lens 6: AI Slop

**No findings.** The code is clean. No unnecessary comments, no over-abstraction, no verbose naming, no defensive over-engineering. The @lore comments are substantive and specific. The diff is minimal -- pure moves and deletes with no filler.

---

## Summary

The implementation matches the architecture plan precisely. All 15 acceptance criteria are met. The type split is clean -- strategy types moved to fabric, kernel types kept/added in shared, all consumer imports updated, no boundary violations. The event split is correct -- KernelEvent (16 members) and StrategyEvent (7 members) compose into DomainEvent with the documented NotificationEvent deviation. All deleted events (BetShippedEvent, BetCommittedEvent, ResponseRecordedEvent) are fully removed from production code. costDelta removal is thorough across all services, adapters, and tests.

The four warnings are non-blocking: WARN-1 and WARN-4 are pre-existing patterns (dead/missing dispatcher cases), WARN-2 is an inaccurate lore comment that should be corrected, and WARN-3 is an acceptable temporary pattern.
