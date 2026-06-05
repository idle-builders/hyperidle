# Code Review: X8 -- Eval Scenario Library

REVIEW-VERDICT: DONE

---

## Critique Fix Verification

### C1: item_routed checks riskTier not view -- FIXED

`ir-route-and-score-facilitator.ts` line 145-173: `itemRouted()` judge checks `items.riskTier !== null` for the seeded item. The item is seeded without riskTier (line 77: `seedItem` called without `riskTier`). The `@lore X8 C1` comment at lines 10-14 documents the rationale. Correct fix.

### C2: attention_scored checks knowledgeStrategyFabric.attentionScore -- FIXED

`ir-route-and-score-facilitator.ts` lines 182-211: `attentionScored()` judge queries `knowledgeStrategyFabric.attentionScore` where `knowledgeItemId = seededKnowledgeItemId`. The seed function creates a separate knowledge item (line 88) specifically for this purpose. The task prompt directs the facilitator to use `target: "knowledge_item"`. The `@lore X8 C2` comment at lines 17-21 documents the rationale. Correct fix.

### C3: artifact_has_preview checks previewJson not summary -- FIXED

`art-create-artifact-builder.ts` lines 128-153: `artifactHasPreview()` judge checks `artifacts.previewJson` is non-null and non-empty. The `@lore X8 C3` comment at lines 11-13 and 125-127 documents the rationale. Correct fix.

### W1: seedKnowledge accepts status parameter -- FIXED

`seeding.ts` lines 199-239: `seedKnowledge` now accepts an optional `status` parameter (line 210). Default is `"active"` (line 223). The `@lore X8 W1` comment at lines 203-207 documents why. Used by `km-promote-knowledge-facilitator.ts` line 92 (`status: "captured"`) and `auth-builder-cannot-promote.ts` line 95 (`status: "captured"`). Correct fix.

### W2: km-conflict-review-cos seeds ONE item -- FIXED

`km-conflict-review-cos.ts` lines 10-16: The `@lore X8 W2` comment documents that `create_conflict_review` operates on ONE item with a proposed change, not two competing items. The seed function creates one knowledge item about budget allocation (line 71-94), and the task prompt instructs the CoS to propose a bottom-up alternative via `create_conflict_review`. Correct fix.

### W3: ho-handoff-to-role handles crash gracefully -- FIXED

`ho-handoff-to-role.ts` lines 10-15, 113-115, 152-168: `sessionEndedGracefully()` judge accepts both "completed" and "crashed" outcomes. The rubric focuses on DB state (`handoffExecuted` checks `ownerAgentId` change) not session outcome. The `@lore X8 W3` comment documents why both outcomes are valid. Correct fix.

### W4: tm-submit-review checks type "review" OR "plain" -- FIXED

`tm-submit-review-builder.ts` lines 9-12, 119-120: The `@lore X8 W4` comment documents that `submit_review` creates `type: "plain"` without `artifactRef`. The `reviewSubmitted()` judge (lines 121-158) checks for ANY message in the bet thread rather than filtering by type, which handles both cases. Correct fix.

### W5: auth-builder-cannot-promote prompt doesn't name the tool -- FIXED

`auth-builder-cannot-promote.ts` lines 11-18: The `@lore X8 W5` comment documents the fix. The task prompt (lines 56-65) says "Determine if you can promote it to validated status" and "If you cannot promote it, document why" rather than naming `promote_knowledge` explicitly. The soul prompt (line 49) lists available tools and notes "You do NOT have access to promote_knowledge." Correct fix.

Partial concern: the soul prompt at line 49 explicitly mentions `promote_knowledge` by name even though W5 recommended not naming unavailable tools. However, this is in the soul prompt (system-level context) not the task prompt, and it correctly labels it as unavailable rather than asking the agent to use it. Acceptable.

### W6: seedThread JSON.stringifies participants -- FIXED

`seeding.ts` lines 337-343, 368: `seedThread` calls `JSON.stringify(opts.participants)` on insert. The `@lore X8 W6` comment at lines 337-341 documents the convention with evidence from `submit-review.ts` line 66. Correct fix.

---

## Lens 1: Architecture

### 1.1 Layer integrity: PASS

All changes are in `packages/eval/`. No cross-layer violations. Imports from `@hyperidle/db` (schema tables, types) and `@hyperidle/shared` (types) are read-only dependencies appropriate for a benchmarking tool outside the three-layer system.

### 1.2 API contracts match the plan: PASS

- `EvalScenario.feature?: string` -- matches plan Section 1
- `RunOptions.feature?: string` -- matches plan Section 1
- `ScenarioReport.feature?: string` -- matches plan Section 1
- `FeatureBreakdown` type -- matches plan Section 1
- `EvalReport.featureBreakdowns` -- matches plan Section 1
- `--feature / -f` CLI flag -- matches plan Section 2
- `seedThread`, `seedMultiAgentWorld`, `seedItem` signatures -- match plan Section 3/12
- Feature filtering in runner -- matches plan Section 1
- Feature breakdown computation in runner -- matches plan Section 10

### 1.3 Data model alignment: PASS

All rubric dimensions query actual DB columns that exist in the schema. Verified against `packages/db/src/schema.ts`:
- `sessions.outcome`, `sessions.notes` -- exist (lines 183-188)
- `tasks.notes`, `tasks.description`, `tasks.doneCondition`, `tasks.ownerAgentId` -- exist (lines 150-161)
- `bets.costActualMinor` -- exists (line 125)
- `knowledgeItems.updatedBy`, `knowledgeItems.status`, `knowledgeItems.body` -- exist (lines 383-387)
- `knowledgeConflicts.itemId`, `knowledgeConflicts.status` -- exist (lines 451-462)
- `knowledgeStrategyFabric.attentionScore`, `knowledgeStrategyFabric.knowledgeItemId` -- exist (lines 482-489)
- `artifacts.producingTaskId`, `artifacts.previewJson` -- exist (lines 619-624)
- `items.sourceAgentId`, `items.riskTier` -- exist (lines 281, 290)
- `messages.senderId`, `messages.threadId`, `messages.type`, `messages.payload` -- exist (lines 250-258)
- `threads.hostKind`, `threads.hostId`, `threads.participants` -- exist (lines 231-236)

### 1.4 Naming: PASS

All conventions from the plan are followed. Feature prefixes consistent. Judge factory names honest. Scenario IDs match file names.

### 1.5 Module depth: PASS

`judges.ts` extracts 10 reusable judges. Plan suggestion S2 (named factories `noExtraTasks()` and `noArtifactsByAgent()`) was implemented -- both exist in `judges.ts` lines 307-342. `noUnauthorizedAction` is the generic base, and the two named factories compose on it. Good.

### 1.6 Diff delivers every plan task: PASS

- Task 1 (framework extensions): types.ts, cli.ts, runner.ts all extended
- Task 2 (seeding library): seedThread, seedMultiAgentWorld, seedItem all added
- Task 3 (judge library): judges.ts created with all specified factories
- Task 4 (POC update): feature field added to poc-session-notes.ts
- Tasks 5-9 (scenarios): all 16 new scenarios present with correct features
- Task 10-11 (validation): check and lint pass, no test interference

---

## Lens 2: Design -- SKIPPED (no UI)

---

## Lens 3: Security

### 3.1 No secrets in code: PASS

No API keys, no hardcoded credentials. API key validation is in cli.ts (reads from environment only).

### 3.2 STRIDE: PASS (eval is a developer tool, not a production surface)

Eval scenarios run locally with real LLM calls. No network-facing API. No user input beyond CLI flags. No trust boundary concerns beyond the existing tool implementations being tested.

### 3.3 Auth on routes: N/A

No new routes added.

---

## Lens 4: Adversarial

### A1. FINDING: Module-level mutable state creates a reentrancy hazard

**Severity: WARNING**

Seven scenario files use module-level `let` variables to pass state from `seed()` to rubric judges:

- `km-promote-knowledge-facilitator.ts:35` -- `let seededKnowledgeItemId`
- `km-conflict-review-cos.ts:38` -- `let seededKnowledgeItemId`
- `ir-route-and-score-facilitator.ts:43-44` -- `let seededItemId`, `let seededKnowledgeItemId`
- `ho-handoff-to-role.ts:37` -- `let secondBuilderAgentId`
- `msg-read-and-reply.ts:31,33` -- `let seededThreadId`, `let pmAgentId`
- `auth-builder-cannot-promote.ts:40` -- `let seededKnowledgeItemId`

If the runner ever runs a scenario more than once in the same process (e.g., `--scenario` flag applied multiple times, or a future parallel runner), the module-level state from one run would contaminate the next. Currently the runner is serial and runs each scenario once, so this is not a live bug. But it is a latent defect.

The correct pattern would be to return seeded IDs from `seed()` via the `ScenarioSeedResult` type (or an extension), making them available to judges through the `JudgeContext.seedResult`. This would require extending `ScenarioSeedResult` per-scenario or using a generic `metadata` bag.

### A2. FINDING: Unused module-level variables assigned but never read

**Severity: MINOR**

Three scenario files assign module-level variables that are never referenced:

- `tm-submit-review-builder.ts:35` -- `_seededThreadCreatedAt` assigned at line 77, never read
- `msg-read-and-reply.ts:32` -- `_seedMessageCreatedAt` assigned at line 75, never read
- `msg-send-status-update-growth.ts:31` -- `_pmAgentId` assigned at line 75, never read

The underscore prefix is a convention for "intentionally unused" but these are dead code -- assigned a value that nobody consumes. Remove the variables and assignments.

### A3. FINDING: reviewSubmitted judge does not filter by senderId

**Severity: MINOR**

`tm-submit-review-builder.ts` lines 141-148: The `reviewSubmitted()` judge queries for ANY message in the bet thread, not specifically messages sent by the agent (`senderId = ctx.seedResult.agentId`). Currently safe because the seeded thread has no messages, so only agent-created messages would exist. But if `seedThread` were changed to include seed messages, or if `submit_review` creates system messages, this would produce false positives.

The `W4` fix correctly removed the `type` filter but should have added a `senderId` filter.

### A4. FINDING: POC scenario not refactored to use reusable judges

**Severity: MINOR**

`poc-session-notes.ts` still has 5 inline judge functions (~120 lines) that duplicate the logic in `judges.ts`. The plan (Task 4) noted this could "optionally refactor judges to use reusable library from Task 3." The builder chose not to refactor. This is not a bug but creates maintenance divergence -- if the judge logic needs updating, both the inline judges in POC and the reusable factories in judges.ts must be changed.

---

## Lens 5: Simplification

### S1. FINDING: Three dead variables across scenario files

See A2 above. `_seededThreadCreatedAt`, `_seedMessageCreatedAt`, `_pmAgentId` are assigned but never read. Delete them.

### S2. FINDING: `sessionEndedGracefully` judge always returns score 1.0

`ho-handoff-to-role.ts` lines 152-168: The `sessionEndedGracefully()` judge accepts BOTH "completed" and "crashed" outcomes with score 1.0. Since `TriggerResult.outcome` is typed as `"completed" | "crashed"` (types.ts line 59), the else branch at line 164 is unreachable -- `outcome` is always one of those two values. The dimension always scores 1.0.

This is technically correct behavior for the W3 fix (handoff can end either way), but a dimension that always scores 1.0 provides zero information. It should either be removed from the rubric or changed to score differently (e.g., 1.0 for "completed", 0.5 for "crashed" to track whether the harness handled it cleanly).

### S3. No unnecessary abstractions or over-engineering detected

The code is straightforward. No abstract base classes, no unnecessary generics, no premature optimization. Each scenario is a plain object. The judge factories are simple closures. Good.

---

## Lens 6: AI Slop

### SL1. FINDING: Index file comments are noisy and misplaced

`scenarios/index.ts` lines 11-33: Comments like `// Feature 5: artifacts (1 scenario)` appear above exports that are alphabetically sorted, not grouped by feature. The comment `// Feature 1: knowledge-management (4 scenarios)` appears above `kmWriteMemoryBuilder` (line 24) but three other km- exports appear earlier (lines 20-22) without the comment. The comments add noise without providing accurate information. Either sort exports by feature with correct comments, or remove the comments entirely (the `feature` field on each scenario is the source of truth for grouping).

### SL2. No other AI slop patterns detected

No verbose defensive null checks on non-nullable types. No `=== true` or redundant else-return. No "TODO: implement" on implemented code. No unnecessary async. No single-use helpers. No unnecessary comments beyond SL1. Code is clean.

---

## AC Completeness Audit

| # | AC | Status | Evidence |
|---|---|---|---|
| 1 | Scenarios grouped by feature covering kernel and strategy | PASS | 9 features across 17 scenarios. 5/6 roles covered (builder, PM, PF, CoS, growth). brand_voice excluded with justification. Features span kernel (task-management, messaging, artifacts, handoff, session-workspace) and strategy (knowledge-management, items-and-routing, prompt-role-grounding, role-authorization). Domains: software (5), consulting (2), marketing (2), commerce (1), finance (1), legal (1), operations (1), multi-product (1). |
| 2 | Multiple realistic roles and domains per feature | PASS | knowledge-management: 4 roles (builder, PM, PF, CoS) across 4 domains. task-management: 2 roles (PM, builder). messaging: 2 roles (builder, growth). items-and-routing: 2 roles (PM, PF). prompt-role-grounding: 2 roles (PM, CoS). Every feature with 2+ scenarios uses different roles. |
| 3 | Each scenario uses X7's composable seeding library | PASS | All 16 new scenarios use `seedMinimalWorld` or `seedMultiAgentWorld`. Additional seeding uses `seedKnowledge`, `seedThread`, `seedItem`. No direct `db.insert()` calls in scenario files. |
| 4 | Each scenario defines a rubric with role-specific dimensions | PASS | All scenarios have 3-4 rubric dimensions with `id`, `label`, and `judge` functions. Judges include descriptive `note` values on failure. Role-specific dimensions exist (e.g., `noArtifactsByAgent` for PM, `noExtraTasks` for CoS, `promotionBlocked` for builder auth test). |
| 5 | `npm run eval` executes all and produces per-feature rubric breakdowns | PASS | Runner computes `featureBreakdowns` (runner.ts lines 316-331). Prints feature summary table to stderr (lines 334-342). Includes in JSON report (line 351). Cannot validate actual execution (requires LLM API key), but the code path is correct. |
| 6 | `npm run eval --feature <feature>` runs scenarios per feature | PASS | CLI flag parsed (cli.ts line 49). Passed to runner (cli.ts line 164). Feature filtering applied (runner.ts lines 213-216). |
| 7 | `--model` comparison matrix reveals per-role/workflow degradation | PASS | No framework changes needed. The scenario library provides the data. Running with `--model A` and `--model B` produces two report files with per-scenario scores, per-feature breakdowns, and model labels. The `feature` field on `ScenarioReport` enables grouping by feature across reports. |
| 8 | Diagnosable reports when scenarios score low | PASS | Every rubric dimension includes descriptive failure notes. Examples: `knowledgeCreated` notes the agent's updatedBy key. `artifactHasPreview` notes which artifact ID is missing. `promotionBlocked` explains what status was expected vs found. `reviewSubmitted` notes the thread ID and expected behavior. Session notes judges explain which tool was expected. |

---

## Summary

All 8 ACs are met. All 9 critique findings (3 critical, 6 warnings) are fixed correctly with appropriate `@lore` documentation. The code typechecks and lints cleanly.

Findings to address before merge:

**WARNING (1):**
- A1: Module-level mutable state in 7 scenario files creates a latent reentrancy hazard. Not a live bug with serial execution but should be documented as a known limitation.

**MINOR (4):**
- A2/S1: Three dead variables (`_seededThreadCreatedAt`, `_seedMessageCreatedAt`, `_pmAgentId`). Remove.
- A3: `reviewSubmitted` judge should filter by `senderId`.
- A4: POC scenario has duplicated judge logic.
- SL1: Index file comments are misplaced relative to the actual export ordering.

**INFORMATIONAL (1):**
- S2: `sessionEndedGracefully` always scores 1.0 (unreachable else branch).

None of the findings are blocking. The implementation is solid, well-documented, and faithfully implements the architecture plan with all critique fixes applied.
