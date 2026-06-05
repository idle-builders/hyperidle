# Code Review: X8 v2 -- Expanded Eval Scenario Catalog (13 new scenarios)

REVIEW-VERDICT: DONE

---

## Critique Fix Verification (architecture-critique-v2.md)

### C1: auth-cos-can-route checks riskTier not view -- FIXED

`auth-cos-can-route.ts` lines 128-158: `itemRouted()` judge checks `items.riskTier !== null` for the seeded item. The `@lore X8 C1` comment at lines 10-12 documents the rationale. Matches the v1 fix pattern from `ir-route-and-score-facilitator.ts`.

### C2: auth-cos-can-route checks knowledgeStrategyFabric.attentionScore -- FIXED

`auth-cos-can-route.ts` lines 162-197: `attentionScored()` judge queries `knowledgeStrategyFabric.attentionScore` using the seeded knowledge item ID. The seed function creates a separate knowledge item (lines 82-97). The task prompt directs the CoS to use `target: "knowledge_item"`. The `@lore X8 C2` comment at lines 14-16 documents the rationale.

### C3: Layer-boundary scenarios use valid kind "principle" -- FIXED

Both `km-layer-boundary-growth.ts` (line 60) and `km-layer-boundary-cos.ts` (line 52) use `kind: "principle"` in task prompts instead of the invalid `"reference"`. The `@lore X8 C3` comments at lines 11-13 (growth) and lines 10-12 (cos) document the rationale. `"principle"` is a valid `KNOWLEDGE_KINDS` value.

### W1: No action needed (query pattern description fixed in implementation)

The `layerWriteDenied` judge correctly checks for absence of L3 items. This is a correct signal for layer enforcement (though see CRITICAL finding F1 below about the layer value mismatch).

### W2: Soul prompt includes fallback guidance -- FIXED

`km-layer-boundary-growth.ts` lines 45-54: The soul prompt explicitly says "If a write is denied or fails (e.g., FORBIDDEN), try writing at the next available layer (L2 or L1)." The task description (lines 64) also mentions fallback: "If that write is denied or fails, try writing at layer 'factory' (L2) or 'team' (L1) instead." The `@lore X8 W2` comment at lines 16-17 documents the rationale.

### W5: tm-triage-inbox-pm includes PM in thread participants -- FIXED

`tm-triage-inbox-pm.ts` lines 72-97: `seedThread` call includes both `BuilderId` and `pmAgentId` in the `participants` array. Comment on line 71 documents the W5 fix explicitly. This ensures `read_inbox` surfaces the messages for the PM.

---

## CRITICAL FINDINGS

### F1. Layer value mismatch between judges and write_memory tool [km-layer-boundary-growth, km-layer-boundary-cos]

**Contract violated:** Architecture plan Section 20 rubric specifications; DB column value consistency.

The judges in both layer-boundary scenarios check `knowledgeStrategyFabric.layer` against human-readable names ("practice", "factory") but the `write_memory` tool stores `KnowledgeLayer` enum values ("L0", "L1", "L2", "L3", "L4").

Evidence chain:
- `write_memory` tool (`write-memory.ts` line 27): `layer: z.enum(KNOWLEDGE_LAYERS)` where `KNOWLEDGE_LAYERS = ["L0", "L1", "L2", "L3", "L4"]` (fabric/types.ts line 14).
- `write_memory` passes the Zod-parsed layer to `createKnowledgeItem` (line 92), which stores it directly into `knowledgeStrategyFabric.layer` (knowledge-repository.ts line 160).
- Judge `layerWriteDenied` in `km-layer-boundary-growth.ts` line 142: `eq(knowledgeStrategyFabric.layer, "practice")` -- will never match an agent-created item (which stores `"L3"`).
- Judge `l3WriteSucceeded` in `km-layer-boundary-cos.ts` line 131: `eq(knowledgeStrategyFabric.layer, "practice")` -- same mismatch.
- Judge `knowledgeQuality` in `km-layer-boundary-cos.ts` line 168: `eq(knowledgeStrategyFabric.layer, "practice")` -- same mismatch.
- Judge `fallbackToL2` in `km-layer-boundary-growth.ts` line 185: `eq(knowledgeStrategyFabric.layer, "factory")` -- also mismatches; write_memory would store `"L2"`.

Impact:
- `km-layer-boundary-growth` `layerWriteDenied`: **false pass.** Always scores 1.0 because the query finds zero rows matching `layer = "practice"`, regardless of whether the growth agent actually wrote L3 knowledge (which would be stored as `layer = "L3"`).
- `km-layer-boundary-cos` `l3WriteSucceeded`: **false fail.** Always scores 0.0 because the query finds zero rows matching `layer = "practice"`, even when the CoS successfully wrote L3 knowledge (stored as `layer = "L3"`).
- `km-layer-boundary-growth` `fallbackToL2`: **false fail on fallback dimension.** Always scores 0.5 or 0.0 because factory writes are stored as `"L2"`, not `"factory"`.

Note: the seedKnowledge helper uses human-readable names (`"factory"`, `"practice"`) because it inserts directly into the DB. But runtime tool calls use enum values (`"L0"`-`"L4"`). The seeded items and agent-created items use different encoding schemes for the same column.

Fix: change all judge layer comparisons to use `"L3"` (not `"practice"`) and `"L2"` (not `"factory"`). OR change the task prompt layer hints to match the tool's Zod schema exactly (say `layer: "L3"` not `layer: "practice"`). Both are needed.

Also: the task prompts say `layer: "practice" (which corresponds to L3)` and `layer "factory" (L2)`. The Zod schema accepts `"L0"`-`"L4"` only. If the agent sends `"practice"`, Zod rejects it with `INVALID_INPUT`. The prompts should say `layer: "L3"` directly.

### F2. Task prompts use human-readable layer names that the Zod schema rejects [km-layer-boundary-growth, km-layer-boundary-cos]

**Contract violated:** Architecture plan C3 fix intent (ensure tool calls are not rejected by validation before the intended test is reached).

The C3 fix correctly changed `kind: "reference"` to `kind: "principle"`. But the same class of problem exists for the `layer` parameter:

- `km-layer-boundary-growth.ts` line 59: `layer: "practice" (which corresponds to L3)` -- the Zod schema accepts `"L3"`, not `"practice"`.
- `km-layer-boundary-growth.ts` line 64: `layer "factory" (L2)` or `layer "team" (L1)` -- Zod accepts `"L2"` and `"L1"`, not `"factory"` and `"team"`.
- `km-layer-boundary-cos.ts` line 51: `layer: "practice" (L3)` -- same issue.

Impact: if the agent faithfully follows the prompt and passes `layer: "practice"`, the tool returns `INVALID_INPUT`. The intended layer boundary test (FORBIDDEN vs allowed) is never reached -- identical to the C3 problem that was fixed.

Fix: change task prompts to use `layer: "L3"` directly (matching the Zod schema), not `layer: "practice"`.

---

## WARNING FINDINGS

### W1. Module-level mutable state is a shared-state hazard [6 scenarios]

**Contract violated:** Architecture plan expectation that scenarios are independently runnable.

Seven v2 scenarios (and several v1 scenarios) use module-level `let` variables to pass IDs from `seed()` to judges:

- `km-layer-boundary-growth.ts` line 40: `let _agentId: string` (dead code -- never read)
- `km-batch-curation-facilitator.ts` lines 32-34: `SubstantiveItemId1`, `SubstantiveItemId2`, `StubItemId`
- `tm-triage-inbox-pm.ts` line 34: `BuilderId`
- `msg-portfolio-synthesis-cos.ts` lines 32-33: `ThreadId`, `PmAgentId`
- `auth-growth-cannot-route.ts` line 36: `SeededItemId`
- `auth-cos-can-route.ts` lines 39-40: `SeededItemId`, `SeededKnowledgeItemId`

This is an established pattern from v1 (same pattern in `auth-builder-cannot-promote`, `ir-route-and-score-facilitator`, etc.). It works because the eval runner creates a fresh PGlite DB per scenario. However, if the runner ever parallels scenarios within the same process, module-level mutable state causes cross-scenario contamination.

This is a warning, not a critical, because:
1. The current runner is sequential.
2. The pattern is established in v1 and consistent.
3. The alternative (passing IDs through JudgeContext.seedResult) would require adding scenario-specific fields to ScenarioSeedResult, which changes the framework contract.

### W2. Dead code: `_agentId` in km-layer-boundary-growth.ts

**Contract violated:** TypeScript rules -- no dead code.

`km-layer-boundary-growth.ts` line 40: `let _agentId: string;` is assigned at line 70 (`_agentId = result.agentId`) but never read anywhere in the file. All judges use `ctx.seedResult.agentId` instead. The leading underscore suggests awareness that it is unused, but it should be removed entirely.

### W3. Naming inconsistency: PascalCase for let variables [km-batch-curation-facilitator, msg-portfolio-synthesis-cos, auth-growth-cannot-route, auth-cos-can-route]

**Contract violated:** TypeScript rules -- camelCase for variables.

Several scenarios use PascalCase for module-level `let` variables:
- `km-batch-curation-facilitator.ts`: `SubstantiveItemId1`, `SubstantiveItemId2`, `StubItemId`
- `msg-portfolio-synthesis-cos.ts`: `ThreadId`, `PmAgentId`
- `auth-growth-cannot-route.ts`: `SeededItemId`
- `auth-cos-can-route.ts`: `SeededItemId`, `SeededKnowledgeItemId`

The v1 scenarios use camelCase (`seededKnowledgeItemId`, `seededThreadId`, `pmAgentId`). The v2 scenarios should follow the same convention.

### W4. Seeding library stores different layer values than runtime tools [cross-cutting]

**Contract violated:** Data model consistency between seeding and production code.

`seedKnowledge` in `seeding.ts` line 234 stores `layer: opts.layer ?? "factory"` directly into `knowledgeStrategyFabric.layer`. Callers pass human-readable names: `"factory"`, `"practice"`.

But the write_memory tool stores `KnowledgeLayer` enum values: `"L0"`, `"L1"`, `"L2"`, `"L3"`, `"L4"`.

This means seeded items and agent-created items store different values in the same column. The `km-batch-curation-facilitator` scenario is unaffected because it only checks `knowledgeItems.status` (not layer). But any judge that compares layer values between seeded items and agent-created items will have a mismatch.

This is a pre-existing issue in the seeding library from v1 (all v1 `seedKnowledge` calls use `"factory"`). The fix belongs in `seedKnowledge` (translate human-readable to enum), but that is out of scope for v2.

### W5. `auth-cos-can-route` attentionScore comparison is fragile [auth-cos-can-route]

`auth-cos-can-route.ts` lines 186-187: The `attentionScored` judge checks:
```
if (score !== null && score !== "0" && score !== "0.0" && score !== "")
```

The `score_attention` tool stores `String(score)` (score-attention.ts line 119/125). If the agent passes score `0`, the tool stores `"0"`, and the judge returns 0.0 even though `score_attention` was successfully called. This is technically correct (a zero attention score is not a meaningful score), but the dimension label says "Attention Scored on Knowledge Item" -- meaning "did the tool get called", not "was the score non-zero." An agent correctly calling `score_attention` with score `0` would get penalized.

### W6. Index.ts comment says "16 scenarios" but there are 30 [index.ts]

`index.ts` line 9: `"X8 adds 16 scenarios across 9 features."` After v2, there are 29 X8 scenarios + 1 POC = 30 total. The comment is stale.

---

## INFO FINDINGS

### I1. All 13 v2 scenarios conform to the EvalScenario interface

Every scenario exports a default `EvalScenario` with the required fields: `id`, `description`, `tags`, `feature`, `seed`, `trigger`, `rubric`. All seed functions return `ScenarioSeedResult`. All trigger functions return `TriggerResult`. TypeScript passes (`npm run check` exits 0).

### I2. No direct db.insert() in scenario files

All 13 scenarios compose from seeding library helpers (`seedMinimalWorld`, `seedMultiAgentWorld`, `seedKnowledge`, `seedThread`, `seedItem`). Zero `db.insert()` calls in scenario files. AC2 met.

### I3. No `as` casts, no `any`, no `@ts-ignore`

Zero unsafe type assertions in the 13 new scenario files and the 3 new judge factories. One `as` cast in `tokensRecordedOnBet()` judge (judges.ts line 370): `JSON.parse(bet.tokensActualJson) as { byTier?: ... }` -- this is a JSON parse boundary, acceptable.

### I4. Feature coverage is complete

30 scenarios across 9 features. All 6 roles covered (builder: 9, PM: 6, CoS: 5, growth: 4, PF: 3, brand_voice: 1). Domains: software, consulting, marketing, commerce, finance, legal, operations, multi-product, healthcare, design.

### I5. New judge factories are well-implemented

- `costAccumulatedOnBet()`: correctly checks `bets.costActualMinor > 0`. Column exists (schema.ts line 125).
- `tokensRecordedOnBet()`: correctly parses `bets.tokensActualJson` and checks for non-zero prompt tokens. Column exists (schema.ts line 128).
- `keywordCheck()`: generic factory with configurable thresholds. Used inline in 5+ v2 scenarios for session notes / message content checks. Several v2 scenarios implement their own keyword checks inline instead of using this factory (see Simplification S1).

### I6. No cross-contamination with vitest

`packages/eval` is not in the vitest workspace `projects` list (vitest.config.ts lines 12-21). Eval scenario files are not `.test.ts` or `.spec.ts`. `npm run test` will not discover them.

### I7. Critique fixes from architecture-critique-v2.md

C1 (view column): Fixed. C2 (attentionScore): Fixed. C3 (invalid kind): Fixed. W2 (fallback guidance): Fixed. W5 (PM in participants): Fixed. All documented with `@lore` comments.

---

## SIMPLIFICATION FINDINGS

### S1. keywordCheck() factory exists but 5 scenarios implement keyword checks inline

The `keywordCheck()` generic factory (judges.ts lines 406-448) was added in v2, but the following scenarios implement identical keyword-matching logic inline instead of using it:

- `km-batch-curation-facilitator.ts` `sessionNotesMentionRationale` (lines 247-293)
- `tm-triage-inbox-pm.ts` `triageJudgment` (lines 223-269)
- `ir-growth-experiment-proposal.ts` `knowledgeQueriedEvidence` (lines 177-217)
- `prg-brand-voice-constrained.ts` `brandVoiceFormal` (lines 120-164) and `brandVoiceHeritage` (lines 171-216)
- `msg-portfolio-synthesis-cos.ts` `messageReferencesPatterns` (lines 190-229)

Each reimplements the same pattern: lowercase text, filter keywords, score based on count thresholds. The `keywordCheck()` factory could replace most of these, reducing ~200 lines of duplicated logic.

Not blocking -- the inline implementations are correct and consistent. But the factory was presumably added to avoid exactly this duplication.

---

## AC COMPLETENESS

| AC | Status | Evidence |
|---|---|---|
| AC1: Scenarios grouped by feature covering kernel and strategy | PASS | 30 scenarios across 9 features. All 6 roles. All scenarios declare `feature` field. |
| AC2: Multiple realistic roles and domains | PASS | 6 roles, 10+ domains (software, consulting, marketing, commerce, finance, legal, operations, multi-product, healthcare, design). |
| AC3: Each uses seeding library -- no direct db.insert() | PASS | Zero `db.insert()` in scenario files. All compose from seeding helpers. |
| AC4: Each has role-specific rubrics | PASS | Every scenario has 3-5 dimensions with descriptive labels and failure notes. |
| AC5: --feature filtering works | PASS (pre-existing from v1 implementation) | runner.ts feature filtering, cli.ts --feature flag. |
| AC6: --model comparison | PASS (framework-level, pre-existing) | Not scenario-specific. |
| AC7: Diagnosable reports | PASS | All judge failures include descriptive notes with actual vs expected values. |

---

## VERDICT: NOT DONE

Two critical findings must be fixed before this can ship:

**F1 + F2 (same root cause): Layer value mismatch.** The layer-boundary scenario judges check for `"practice"` and `"factory"` but write_memory stores `"L3"` and `"L2"`. The task prompts also use human-readable names that the Zod schema rejects. Both `km-layer-boundary-growth` and `km-layer-boundary-cos` will produce false results (false pass on denial test, false fail on success test).

Fix needed:
1. Change judge layer comparisons: `"practice"` -> `"L3"`, `"factory"` -> `"L2"` in all four judge functions across both files.
2. Change task prompt layer hints: `layer: "practice"` -> `layer: "L3"`, `layer "factory"` -> `layer "L2"`, `layer "team"` -> `layer "L1"`.
3. Remove dead code: `let _agentId` in `km-layer-boundary-growth.ts`.
4. Fix naming: PascalCase `let` variables -> camelCase.
5. Update index.ts comment count.

---

## RE-REVIEW (post-fix commit e2b789c6)

All five fix items verified:

- **F1 (layer values):** All four judge `.where()` clauses in `km-layer-boundary-growth.ts` and `km-layer-boundary-cos.ts` now use `"L3"` and `"L2"` instead of `"practice"` and `"factory"`. Confirmed correct against `KNOWLEDGE_LAYERS` enum.
- **F2 (task prompts):** Both files now use `layer: "L3"` directly in task descriptions, matching the Zod schema.
- **W2 (dead code):** `let _agentId` removed from `km-layer-boundary-growth.ts`.
- **W3 (PascalCase):** All module-level `let` variables renamed to camelCase across 5 files (auth-cos-can-route, auth-growth-cannot-route, km-batch-curation-facilitator, msg-portfolio-synthesis-cos, tm-triage-inbox-pm). Zero PascalCase `let` variables remain.
- **W6 (comment count):** `index.ts` updated to "X8 v2 adds 13 more scenarios (30 total)".

REVIEW-VERDICT: DONE
