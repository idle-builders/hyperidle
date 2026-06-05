# Code Review: X8 v4 -- Eval Scenario Library (84 scenarios)

REVIEW-VERDICT: DONE

---

## Build Status

- `npm run check`: zero type errors
- `npm run lint`: zero errors (280 warnings -- all pre-existing, not from X8 changes)
- `packages/eval` correctly excluded from `vitest.config.ts` projects list -- eval files never run as tests

---

## AC Completeness

| # | AC (from TRACK-X.md) | Status | Evidence |
|---|---|---|---|
| 1 | Scenarios grouped by feature, covering kernel + strategy, realistic roles + domains | PASS | 84 scenarios across 24 features (24 interaction files + 1 POC). All 6 roles exercised. 8 domains. Feature field on every EvalScenario. |
| 2 | Each scenario uses X7's composable seeding library | PASS | All scenarios import from seeding.ts. 12 seed helpers (8 new in X8). No raw DB inserts in scenario files. |
| 3 | Each scenario defines rubric with role-specific, diagnosable dimensions | PASS | Every scenario has explicit `rubric.dimensions[]` with descriptive failure `note` values. LLM-as-judge dimensions use anchored criteria. |
| 4 | `npm run eval` produces per-feature rubric breakdowns | PASS | `FeatureBreakdown` type. Runner computes per-feature averages (runner.ts:331-353). |
| 5 | `npm run eval --feature <feature>` filters | PASS | `--feature/-f` in CLI. Runner filters by exact match. Zero-match prints available features. |
| 6 | `--model` comparison reveals degradation | PASS (framework) | Two separate runs produce JSON reports with per-scenario scores keyed by feature. Manual comparison required (no --compare flag). |
| 7 | Evals isolated from test/verify pipeline | PASS | `packages/eval` not in vitest projects. Entry point is `tsx src/cli.ts`. |

---

## Critique Fix Verification

| Finding | Fixed? | Evidence |
|---------|--------|----------|
| CRITICAL-1: taskId in triggerConfig | YES | All routine-sessions, delegation, skill-autonomy scenarios include taskId. `@lore` on seedRoutine (seeding.ts:496-498). |
| CRITICAL-2: Cost info unreachable in prompt | RESOLVED | Combined eval scenarios that depended on this were not built. Correct decision -- building them would produce untestable dimensions. |
| W1: Feature name consistency | YES | 24 snake_case feature strings, all verified unique and matching interaction names. |
| W2: Factory settings keys | YES | builtin-routines.ts uses `cost_cap`/`cost_actual` (lines 65-66). `@lore X8 W2` documents this. |
| W3: Builtin routine rows seeded | YES | Every builtin routine scenario calls `seedBuiltinRoutines(ctx.db)`. |
| W5: judgeLlmQuality concrete | YES | Full implementation in judges.ts:489-547 with Anthropic SDK, JSON parsing, anchored criteria template. |
| W6: fewer_tool_calls | YES | Dimension not implemented. Comment-only acknowledgment in judges.ts:12. |
| W7: seedAgent with costCapMinor | YES | seedAgent accepts costCapMinor/costCapCurrency (seeding.ts:109-110). |
| W8: seedBet with appetite | YES | seedBet accepts appetite string (seeding.ts:145). |

---

## Architecture Lens

### Contracts honored

- EvalScenario.feature (types.ts:116), RunOptions.feature (types.ts:207), CliArgs.feature (cli.ts:31), FeatureBreakdown (types.ts:170-175), EvalReport.featureBreakdown (types.ts:195) -- all match plan Section 1-2.
- All 12 seeding helpers match architecture Section 3 signatures.
- All judge factories from Section 4 implemented in judges.ts (1162 lines).
- File structure matches plan Section 7 exactly.
- discoverScenarios walks array exports (runner.ts:139-148) per Task 1.5.

### Scope reconciliation

Plan v4 base: 83 + POC = 84 scenarios. Plan v4+combined critique: 106 total (23 from Section 11). Builder implemented 84 (the base plan). The 23 combined evals were correctly deferred -- they depend on unresolved data paths (cost information not reaching agent prompt, session history not queryable via buildSessionContextData).

### Data model alignment

Verified all rubric dimension column references against schema.ts. Key columns confirmed: sessions.outcome, sessions.notes, tasks.notes, bets.costActualMinor, knowledgeItems.updatedBy/status/body, knowledgeStrategyFabric.layer/kind/attentionScore/meta, knowledgeEditLog.editor/field/newValue, knowledgeConflicts.proposedBy, artifacts.producingTaskId/kind/previewJson, items.sourceAgentId/kind/riskTier/blocking, messages.senderId/type/payload, routines.lastRunAt/nextRunAt, userSkills.autonomyLevel/successCount/failureCount.

No rubric dimension references dropped columns (costEstimate, items.attentionScore). Correct per plan reconciliation note.

### Per-feature scenario counts match plan

| Feature | Plan | Actual | Match |
|---------|------|--------|-------|
| write_memory | 4 | 4 | YES |
| query_practice | 3 | 3 | YES |
| write_session_notes | 2+POC=3 | 2+POC=3 | YES |
| create_artifact | 3 | 3 | YES |
| create_item | 5 | 5 | YES |
| create_task | 3 | 3 | YES |
| log_task | 3 | 3 | YES |
| read_inbox | 3 | 3 | YES |
| send_message | 3 | 3 | YES |
| submit_review | 4 | 4 | YES |
| handoff_to | 4 | 4 | YES |
| route_item | 3 | 3 | YES |
| score_attention | 3 | 3 | YES |
| promote_knowledge | 4 | 4 | YES |
| create_conflict_review | 3 | 3 | YES |
| session | 3 | 3 | YES |
| materialized_knowledge | 3 | 3 | YES |
| composed_prompt | 3 | 3 | YES |
| tool_authorization | 3 | 3 | YES |
| knowledge_writeback | 3 | 3 | YES |
| builtin_routines | 8 | 8 | YES |
| routine_sessions | 4 | 4 | YES |
| skill_autonomy | 3 | 3 | YES |
| delegation | 3 | 3 | YES |

All 24 features match exactly.

---

## Adversarial Lens

### F1: Module-level mutable state (WARNING)

35 `let` variables across 11 scenario files pass data from seed() to rubric.judge() through file-level mutation. Root cause: ScenarioSeedResult is too narrow (5 fields). Scenarios that seed routines, knowledge items, conflicts, threads, etc. need to pass those IDs to judges but JudgeContext only has seedResult.

Files: routine-sessions.ts (7 vars), delegation.ts (5), skill-autonomy.ts (5), promote-knowledge.ts (4), builtin-routines.ts (3), route-item.ts (3), score-attention.ts (2), send-message.ts (2), create-conflict-review.ts (2), read-inbox.ts (1), knowledge-writeback.ts (1).

Impact: Safe under serial execution (runner.ts:238 is a `for` loop). Breaks silently if parallelism is added.

### F2: Judges re-execute runBuiltinRoutine (WARNING)

builtin-routines.ts: 6 judge functions call `runBuiltinRoutine()` again instead of querying DB state. The routine runs TWICE per scenario -- once in trigger, once in judge. Each judge also calls `clearBuiltinCostSentinelCache()` to force fresh execution.

Lines: 88-98 (warning_emitted), 106-116 (no_breach_emitted), 154-163 (breach_emitted), 200-209 (no_events_emitted), 374-384 (routine_not_fired dedup), 393-405 (dedup_reason).

The double-execution works because builtin routines are deterministic given the same DB state. But it doubles execution cost and creates a pattern where judges trigger side effects rather than observing them.

### F3: Unsafe `as` casts on FireResult (INFO)

8 instances of `(result as { reason: string }).reason` in builtin-routines.ts (lines 383, 399, 404) and delegation.ts (lines 297, 300, 398, 401). The `checkAndFireRoutine` and `runBuiltinRoutine` return types do not include `reason` when `fired: false`. If the property name changes, these casts silently produce `undefined` instead of a compile error.

### F4: Feature breakdown re-discovers scenarios (INFO)

runner.ts:334 calls `discoverScenarios()` again to find the feature field for each report. The scenarios were already loaded and executed. The feature should be stored during execution, not re-discovered.

### F5: Duplicate dimension ID "notes_logged" (INFO)

`judgeLogTaskCalled()` (judges.ts:184) and `judgeNotesLogged()` (judges.ts:1039) both use `id: "notes_logged"`. If both appear in the same rubric, the scoring engine would have duplicate dimension IDs. Currently no scenario uses both.

---

## Simplification Lens

No single-use helpers. No premature generics. No dead code. No commented-out code. No unnecessary async. No value-free wrappers. Judge factories are genuinely reused across dozens of scenarios. The inline judges for scenario-specific checks are appropriate -- they test specific DB state that no factory covers.

The `judgeNoHarmfulActions` factory (judges.ts:82-112) hardcodes `allTasks.length > 1` as "unexpected." This correctly excludes the seeded task but would produce a false positive if a scenario legitimately creates tasks AND uses this judge. Currently only 6 scenarios use it, none of which expect task creation. Acceptable.

---

## AI Slop Lens

No verbose naming. No unnecessary comments. No defensive over-engineering. No single-use helpers. No filler code. The `@lore` comments (6 total) are accurate, grounded in specific critique findings, and provide useful context for future maintainers.

The `buildDefaultSoulPrompt` (seeding.ts:640-645) is never used in practice (every scenario provides custom prompts), but it serves as a reasonable fallback for `seedMinimalWorld` when no prompt is specified. Acceptable.

---

## Findings Summary

| # | Severity | Finding |
|---|----------|---------|
| F1 | WARNING | 35 module-level `let` variables couple seed/judge state through file-level mutation. Safe with serial execution, breaks with parallelism. |
| F2 | WARNING | 6 judge functions in builtin-routines.ts re-execute `runBuiltinRoutine()` instead of querying DB state. |
| F3 | INFO | 8 unsafe `as { reason: string }` casts on routine/delegation results. |
| F4 | INFO | runner.ts:334 re-discovers scenarios for feature breakdown. |
| F5 | INFO | Duplicate dimension ID "notes_logged" across two judge factories. |

---

## Verdict

**DONE.** All 7 ACs satisfied. 84 scenarios across 24 interactions implemented exactly per plan. All architecture critique fixes verified. Typecheck and lint pass. Eval isolated from test pipeline.

The 2 WARNINGs (F1, F2) are code quality issues that do not affect correctness under current serial execution. They should be addressed before adding runner parallelism.
