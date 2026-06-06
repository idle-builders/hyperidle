# Architecture Critique: X8 v2 Expanded Scenario Catalog

Review of Section 20 additions (13 new scenarios, 3 new judges, updated counts).

---

## CRITICAL

### C1. [Section 20, `auth-cos-can-route`] `items` table has no `view` column -- repeats v1 C1

The rubric dimension `item_routed` says: "query the seeded item. Score 1.0 if `view` is non-null."

The `items` table (`packages/db/src/schema.ts` lines 277-300) has NO `view` column. The `route_item` tool computes the view via `routeItem()` from `@hyperidle/fabric` and returns it in the response, but does NOT persist it to the database. It only persists `riskTier`, `kind`, and `verb` overrides (see `route-item.ts` lines 51-58).

The v1 `ir-route-and-score-facilitator` scenario already fixed this by checking `items.riskTier` instead. The v2 `auth-cos-can-route` scenario repeats the original incorrect assumption.

Fix: change the `item_routed` judge to check `items.riskTier` or `items.kind` is non-null after routing, matching the v1 fix pattern in `ir-route-and-score-facilitator.ts` lines 145-173.

### C2. [Section 20, `auth-cos-can-route`] `items` table has no `attentionScore` column -- repeats v1 C2

The rubric dimension `attention_scored` says: "query the seeded item. Score 1.0 if `attentionScore` is non-null."

The `items` table has no `attentionScore` column (stripped per O2 kernel/strategy separation). The `score_attention` tool with `target: "item"` is a no-op on DB writes (`score-attention.ts` lines 134-143: "items.attentionScore removed -- no-op on items score writes"). It returns `ok` but writes nothing to the database.

The v1 `ir-route-and-score-facilitator` scenario already fixed this by seeding a `knowledge_item` and checking `knowledgeStrategyFabric.attentionScore` instead. The v2 `auth-cos-can-route` scenario ignores that fix and repeats the original incorrect assumption.

Fix: either (a) seed a knowledge item alongside the item and have the CoS score attention on the knowledge item via `target: "knowledge_item"`, matching the v1 fix, or (b) remove the `attention_scored` dimension entirely and replace it with a different observable check (e.g., verify `route_item` was called successfully by checking `riskTier` was set).

### C3. [Section 20, `km-layer-boundary-growth` and `km-layer-boundary-cos`] Task prompts use `kind "reference"` which is not a valid `KNOWLEDGE_KINDS` value

Both task prompts instruct the agent to call `write_memory` with `kind "reference"`:

- km-layer-boundary-growth: `Use write_memory with layer "L3", kind "reference", and a substantive body`
- km-layer-boundary-cos: `Use write_memory with layer "L3", kind "reference", title "Clinical Triage Protocol Patterns", and a substantive body`

The `write_memory` tool's Zod schema (`write-memory.ts` lines 13-22) defines `KNOWLEDGE_KINDS` as: `["pattern", "anti_pattern", "brief", "principle", "decision", "failure", "reflection", "focus"]`. The value `"reference"` is NOT in this enum. The tool will return `INVALID_INPUT` before the layer check is ever reached.

This breaks both scenarios' primary rubric dimensions:
- `km-layer-boundary-growth`: the `layer_write_denied` dimension tests whether L3 writes are forbidden for growth agents. If the tool rejects the input at the kind-validation step, the layer enforcement is never tested. The scenario is testing Zod validation, not layer boundaries.
- `km-layer-boundary-cos`: the `l3_write_succeeded` dimension tests whether CoS can write at L3. If the tool rejects the input at the kind-validation step, the CoS will never succeed regardless of layer permissions.

Fix: change both task prompts to use a valid kind value (e.g., `"pattern"` or `"decision"`). Also update the seed descriptions to match.

---

## WARNING

### W1. [Section 20, `km-layer-boundary-growth`] Rubric dimension `layer_write_denied` uses incorrect query pattern

The rubric says: "query `knowledge_items` for items with `updatedBy = 'agent:<agentId>'` that have a corresponding `knowledgeStrategyFabric` row with `layer = 'L3'`."

This query pattern checks whether L3 items were CREATED, not whether the tool call was DENIED. When `write_memory` returns `err("FORBIDDEN", ...)`, no rows are inserted at all -- neither in `knowledge_items` nor in `knowledgeStrategyFabric`. The absence of L3 rows is the correct signal, and the described query will work, but the rubric description is misleading. It implies a join query is needed when a simple count of L3 knowledge items by the agent would suffice.

More importantly: if the agent's `write_memory` call fails due to `INVALID_INPUT` (wrong kind -- see C3) rather than `FORBIDDEN` (layer restriction), the same "no L3 items exist" result occurs. The rubric dimension cannot distinguish between "layer enforcement worked" and "input validation rejected the request." The dimension scores 1.0 in both cases, giving a false positive on layer enforcement testing.

Fix: after fixing C3, consider checking the session outcome or session notes for evidence that the agent received a FORBIDDEN response specifically, not just that no L3 items were created.

### W2. [Section 20, `km-layer-boundary-growth`] `fallback_to_l2` dimension assumes agent can write at L0/L1/L2

The dimension says: "query knowledge_items for items created by the agent at L0/L1/L2. Score 1.0 if the agent wrote knowledge at an allowed layer instead."

This is correct in principle. The `write_memory` tool allows growth agents to write at L0-L2 (verified: `write-memory.ts` lines 46-53, `NON_FACILITATOR_MAX_LAYER = new Set(["L0", "L1", "L2"])`). However, the task prompt only instructs the agent to write at L3. Whether the agent decides to fall back to a lower layer depends entirely on the LLM's reasoning. The soul prompt and task description do not hint at fallback.

The risks table (line 1633) acknowledges this: "agent may loop trying L3." The mitigation says "soul prompt explicitly mentions 'if a layer is restricted, try a lower layer'" but the actual task prompt in the plan does NOT contain this hint. The soul prompt description at line 1088 also does not mention fallback behavior.

Fix: add fallback guidance to the soul prompt or task description, or lower the weight expectation for this dimension (it's measuring LLM adaptability, not framework correctness).

### W3. [Section 20, `auth-cos-can-route`] Risk entry references nonexistent column

The v2 risks table (line 1638) says: "items.view column might not accept arbitrary string values." There is no `items.view` column. This risk entry is based on the same incorrect assumption as C1.

### W4. [Section 20, `ir-growth-experiment-proposal`] Rubric checks `items.sourceAgentId` but `create_item` uses `ctx.agentId` not `input.agentId`

The rubric dimension `item_created` says: "query `items` table for rows created during the session (items with `sourceAgentId = agentId`)."

This is correct -- `create-item.ts` line 82 sets `sourceAgentId: ctx.agentId`. However, the `items.sourceAgentId` column is nullable (schema.ts line 281: no `.notNull()`), and `create_item` always sets it from `ctx.agentId` (line 82). This is not a bug, just noting that the query should use `eq(items.sourceAgentId, agentId)` and handle the nullable case.

### W5. [Section 20, `tm-triage-inbox-pm`] Thread seeding must include PM in participants for `read_inbox` to work

The `read_inbox` tool (`read-inbox.ts` lines 33-42) filters messages by checking `JSON.parse(threads.participants)` includes the calling agent's ID. The scenario seeds 3 messages from the builder in a thread, but the plan does not explicitly state that the PM agent ID must be in the thread's `participants` array.

If the builder implements this by calling `seedThread` with `participants: [builderAgentId]` (only the sender), the PM's `read_inbox` will return zero messages and the scenario fails silently with a misleading "agent didn't read inbox" diagnosis.

Fix: explicitly state in the scenario seed description that the thread `participants` must include both the PM and builder agent IDs.

### W6. [Section 20, `km-layer-boundary-cos`] `product_manager` is in FACILITATOR_ROLES -- scenario tests CoS but the finding applies to PM too

The plan says (line 1060): "write_memory enforces L3/L4 restrictions on non-facilitator roles." The FACILITATOR_ROLES set in `write-memory.ts` line 46-50 includes `chief_of_staff`, `practice_facilitator`, AND `product_manager`. So PM can also write L3/L4. The scenario correctly tests that CoS (a facilitator) CAN write L3. No bug, but the plan's gap table at line 1060 says this was "only tested indirectly by `auth-builder-cannot-promote`" -- that scenario tests promote_knowledge, not write_memory layer enforcement. The v2 km-layer-boundary scenarios correctly address this gap.

---

## INFO

### I1. [Section 20, `auth-growth-cannot-route`] `seedItem` uses arbitrary `kind` values that bypass `create_item` Zod validation

The scenario seeds an item with `kind: "experiment_proposal"`. This value is NOT in `create_item`'s `ITEM_KINDS` enum (`create-item.ts` lines 18-29). This is not a bug because `seedItem` inserts directly into the DB (`seeding.ts` lines 424-435) bypassing tool validation. The `items.kind` column is `text` (no DB-level constraint). Similarly, `auth-cos-can-route` uses `kind: "process_improvement"` which is also not in ITEM_KINDS. Both are fine for seeding purposes.

### I2. [Section 20, `km-batch-curation-facilitator`] Seeded knowledge items need `status: "captured"` -- this was v1 W1, already fixed

The v1 critique (W1) flagged that `seedKnowledge` had no `status` parameter. This was fixed -- `seedKnowledge` now accepts optional `status` (`seeding.ts` line 210). The batch curation scenario correctly uses `status: "captured"` for its seed items. No issue.

### I3. [Section 20, scenario count] Index file says "X8 adds 16 scenarios" but v1 has 17 + v2 adds 13 = 30 total

The `scenarios/index.ts` comment on line 9 says "X8 adds 16 scenarios across 9 features." This counts the v1 batch (16 new + 1 POC = 17 total). After v2, it should read "X8 adds 29 scenarios" (16 v1 + 13 v2) or the comment should be updated. Minor housekeeping.

### I4. [Section 20, `prg-ambiguous-task-pm` and `prg-ambiguous-task-builder`] Ambiguous scenarios are well-designed

These scenarios correctly omit tool names from task prompts. The rubric dimensions use existing judge factories (`tasksCreated`, `knowledgeCreated`, `taskNotesLogged`, `sessionNotesWritten`, `sessionCompleted`, `noArtifactsByAgent`) which are already implemented. No data model issues. The design is sound -- these scenarios measure role grounding quality, not framework correctness.

### I5. [Section 20, `sw-cost-tracked-on-bet`] New judge factories are well-specified

`costAccumulatedOnBet()` and `tokensRecordedOnBet()` correctly reference `bets.costActualMinor` (schema.ts line 125) and `bets.tokensActualJson` (schema.ts line 128). Both columns exist and are the correct types. The `keywordCheck()` generic factory is a good abstraction that eliminates duplication across 5+ scenarios.

---

## Summary

3 criticals, 6 warnings, 5 info items.

The critical findings are all data model mismatches that will cause runtime failures:
- C1 and C2 are direct repeats of the v1 critique's C1 and C2, applied to the new `auth-cos-can-route` scenario. The v1 scenario already has working fixes that should be copied.
- C3 is a new finding: two scenarios use an invalid knowledge kind that will cause Zod validation rejection before the intended test (layer enforcement) is reached.

All criticals are straightforward to fix. The overall scenario design is sound -- the gap analysis is thorough, the seeding composition is correct, and the judge factory approach avoids duplication.
