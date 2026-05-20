# Architecture Critique: O1

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:8 LI:9 AC:8 DM:8 N:9 MD:9 FMC:8 S:8 V:7

---

## Round 1 Finding Resolution

All 4 critical findings, 5 warnings, and 4 suggestions from round 1 have been addressed:

- **C1 (action tightening):** Resolved. `action` stays as `string` with a detailed `@lore` comment listing all 11+ emitted values including the dynamic `practice_meeting_turn_${turnNumber}` pattern. Filed as follow-up.
- **C2 (bet-state-machine.ts emitter):** Resolved. Task 4 now has a dedicated section with exact lines to delete (227-234) and 3 `@lore` comments to update.
- **C3 (4 missing files):** Resolved. `bet-state-machine.test.ts` (7 refs), `routine-scheduler.test.ts` (2 refs), `seed-fixtures.ts` (line 65), `seed.test.ts` (line 209) all enumerated with migration instructions.
- **C4 (test files for action tightening):** Resolved by C1 resolution -- action stays as `string`, so these test files need no action-related changes.
- **W1-W5, S1-S4:** All resolved. EventType cascade documented, lifecycle-propagation.ts split import clarified, bet-state-machine.test.ts added to protected tests, exhaustiveness test improved, query-practice.ts covered, atomicity constraint noted, resolveCostBaseline deletion explicit, knowledge-repository.ts import noted, costDelta observability gap documented.

---

## CRITICAL

None.

---

## WARNING

### W1. [plan Task 2, import map] Import splits not explicit for multi-type import lines

Several files import both strategy types (moving to fabric) and kernel types (staying in shared) on the same import line:

- `design-system/src/status-mapping.ts:1` imports `BetStatus, KnowledgeStatus, SessionOutcome, TaskState` from shared. Only `KnowledgeStatus` moves. The plan says "from `@hyperidle/fabric`" for `KnowledgeStatus` but doesn't note the import must be split into two lines.
- `web/src/pages/KnowledgeDetail.tsx:37` imports `KnowledgeScope, KnowledgeStatus, Message` from shared. Only the first two move.
- `web/src/hooks/useGlobalSearch.ts:1-2` imports `BetStatus, KnowledgeKind, KnowledgeLayer, KnowledgeStatus` (type) and `BET_STATUSES, KNOWLEDGE_STATUSES` (value) from shared. Only the knowledge types move.
- `server/src/services/practice-meeting.ts:3` imports `EventBus, KnowledgeKind, KnowledgeUpdatedEvent` from shared. Only `KnowledgeKind` moves.
- `server/src/routes/knowledge.ts:7-8` imports `ApiErrorResponse, KnowledgeLayer` and `API_ERROR_CODES, EventBus, KNOWLEDGE_LAYERS` from shared. Only `KnowledgeLayer` and `KNOWLEDGE_LAYERS` move.

The plan's import map identifies WHICH types move but does not explicitly note that each of these is an import-line split. An experienced builder will handle this correctly, but the lack of explicit "split this import into two lines" instructions introduces ambiguity for less experienced builders.

**Impact:** Low. The builder will discover the need to split imports when the non-strategy types fail to resolve from `@hyperidle/fabric`. Not blocking.

### W2. [plan Task 10, dispatcher.ts] BetShippedEvent import removal not mentioned

Task 10 says to delete the `case "bet_shipped":` block from `dispatcher.ts`. However, `dispatcher.ts` also imports `type BetShippedEvent` at line 29. After deleting the type from events.ts, this import will cause a compile error. The plan should note that the import must be removed alongside the case block.

**Impact:** Low. `bun run check` will catch this immediately. Not blocking.

### W3. [plan Task 9, builtin-routines.ts] Comment and function name updates underspecified

The plan correctly changes the handler from `BetShippedEvent` to `BetStateChangedEvent` and adds the `toState !== "shipped"` filter. But:
- The handler is still called `betShippedHandler` in the plan's "After" code example (line 495). It should be renamed to reflect the new semantics (e.g., `betStateChangedHandler` or kept generic since it only fires post-ship-retro).
- The plan mentions updating `@lore` comments at lines 439 and 441 but doesn't provide the updated text.

**Impact:** Low. Naming is cosmetic and the builder can choose the right name. Not blocking.

---

## SUGGESTION

### S1. [plan Task 6, events.test.ts] StrategyEvent exhaustiveness test missing

The plan includes a compile-time exhaustiveness test for `KernelEvent` (switch over all 16 variants). No equivalent test exists for `StrategyEvent` (7 variants). For symmetry and to enforce the same completeness guarantee on the strategy union, a matching `StrategyEvent` exhaustiveness test should be added.

### S2. [plan, Risks section] `BetShippedEvent` import in `builtin-routines.ts` not listed as explicit removal

Risk 6 discusses the behavior preservation of the builtin-routines migration. The plan's Task 9 "Before/After" code shows changing `import { ..., BetShippedEvent, ... }` to `import { ..., BetStateChangedEvent, ... }`, which is correct. But the `@lore` comment at line 248 (`currently just \`builtin:post-bet-retro\` on \`bet_shipped\``) and the function doc at line 248 also need updating. The plan mentions lines 439 and 441 but not line 248.

### S3. [plan Task 11] costDelta in `session-provisioning.ts` is only a comment

The plan says "Check and remove `costDelta` from any `session_ended` emissions" for `session-provisioning.ts`. The codebase shows only a comment at line 404 referencing costDelta, not an actual field emission. The plan should clarify this is a comment-only cleanup, not a functional change.

---

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| **Spec Alignment** | 8 | Every AC maps to a task. The NotificationEvent deviation is well-justified (AC says "never emitted" but it IS emitted -- reclassify instead of delete). One concept-doc inconsistency (concept says tighten action, plan correctly defers) is documented. |
| **Layer Integrity** | 9 | Boundary rule respected throughout. The PropagationLevelLiteral inline avoids shared importing from fabric. The `@lore` comment documents the duplication. |
| **API Contracts** | 8 | No new routes. Event interface contracts are fully specified with type discriminants, field types, and StreamId semantics. PropagationLevelLiteral duplication is the only contract risk. |
| **Data Model** | 8 | No schema changes (intentional -- O2). Type definitions match the current DB column types. The AutonomyLevel name collision (numeric vs string) is correctly identified and resolved. |
| **Naming** | 9 | KernelEvent/StrategyEvent names are honest. KernelKnowledgeStatus vs KnowledgeStatus avoids collision. KERNEL_AGENT_ROLES/FABRIC_AGENT_ROLES follow the established pattern. |
| **Module Depth** | 9 | Public surface is narrow -- fabric/types.ts exports only moved types. No new modules, no unnecessary abstractions. The barrel re-export in fabric/index.ts is appropriate. |
| **Failure-Mode Coverage** | 8 | Security section correctly identifies O1 as pure type reorganization with no attack surface. Stale DB rows with "bet_shipped" are identified as a follow-up. The EventType cascade through utility types is now documented. |
| **Simplicity** | 8 | The PropagationLevelLiteral inline is the simplest solution that respects the boundary rule. No over-engineering. The `@lore` comments document intentional tradeoffs, not defensive scaffolding. |
| **Verifiability** | 7 | Every task has a verification step. The grep-for-zero-hits verification for type split is concrete. Protected tests list is populated. The exhaustiveness test is improved. Deducted for: missing StrategyEvent exhaustiveness test (S1), and the test update table counts refs but doesn't always specify the exact assertion change needed. |

---

## What's Working Well

1. **Plan reconciliation table is now comprehensive.** The spec-vs-codebase-reality table catches three spec errors (NotificationEvent IS emitted, BetShippedEvent IS actively used with 4 consumer files, action values don't match proposed tightening) and provides principled resolutions for each. This table is the single most valuable section of the plan.

2. **Exhaustive file enumeration.** The import update map now covers every file that imports strategy types from `@hyperidle/shared` -- 3 fabric files, 7 server files, 7 web files, 2 design-system files, plus 13 test files. Cross-referencing against a `grep` of the codebase confirms zero gaps. The ordered task list with explicit "Done when" criteria makes the builder's job mechanical.

3. **Risk analysis is thorough and honest.** 11 enumerated risks with resolutions. The costDelta observability gap, AutonomyLevel name collision, stale DB rows, and KnowledgeFormat placement are all identified before the builder encounters them. Risk 6 (builtin-routines behavior preservation with filter-first guard) shows the plan understands the behavioral contract, not just the type contract.
