# Architecture Critique: X7

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:7 N:9 MD:9 FMC:8 S:9 V:7

---

## Dimension Scores

### 1. Spec Alignment (8/10)

Every AC (1-10) maps to at least one task. The plan does not invent requirements beyond what the spec asks for. Two gaps:

- AC5 requires "token usage by tier" in the report. The plan caught this mid-draft (Section 19, revised types) and added `tokensByTier` to `ScenarioReport` and `totalTokensByTier` to `EvalReport`. The fix is present but was added as a self-correction addendum rather than integrated into the canonical Section 3.4 type definitions. The builder could miss it if they only read Section 3.4.
- AC9 says "without any framework changes" but the plan's discovery mechanism requires adding one export line to `scenarios/index.ts`. The plan correctly documents this trade-off (Section 17) and the spec's validation scenario (line 298) says "added to the scenarios directory" which is ambiguous about whether an index file counts as "framework." The plan's interpretation is reasonable and well-defended by the design-it-twice analysis.

### 2. Layer Integrity (9/10)

The eval package sits outside the three-layer architecture (Human Interface / Meta Layer / Agent Runtime) as developer infrastructure. It consumes `@hyperidle/server` (Agent Runtime layer) and `@hyperidle/db` (data layer) directly, which is correct for a test/eval harness that must exercise real infrastructure. No layer violations.

The new server export additions (Section 2) expose internal modules, but only to the eval package. The plan explicitly notes "the eval package is the only consumer outside the server package itself." This is acceptable.

### 3. API Contracts (8/10)

No HTTP routes are introduced (correct -- eval is CLI-only). The TypeScript interfaces in Section 3 are complete: `EvalScenario`, `SeedContext`, `ScenarioSeedResult`, `TriggerContext`, `TriggerResult`, `RubricDimension`, `JudgeContext`, `DimensionScore`, `ScoringRubric`, `ScenarioReport`, `DimensionReport`, `EvalReport`. All fields have types, readonly modifiers, and doc comments.

The CLI argument contract (Section 8) is specified: `--model`, `--quick`, `--scenario`, `--output`. Exit codes documented.

One gap: the plan does not specify how `callLlm` would be used by LLM-as-judge dimensions. `callLlm` is exported from `@hyperidle/server` harness internals, but the plan's export additions (Section 2) do not include `./harness/llm-client`. The `JudgeContext` provides `resolvedModel` but no function to call. The POC scenario does not use LLM-as-judge (all rule-based), so this is not blocking for X7, but it is a gap for X8 scenarios that will need it.

### 4. Data Model Alignment (7/10)

No schema changes are introduced (correct -- eval uses existing tables). The seeding helpers (Section 4) must populate existing tables correctly. Several data model issues:

**CRITICAL: `productId` vs `teamId` field mismatch.** `ProvisionSessionParams` (lines 171-197 of session-provisioning.ts) has a field called `productId: string`. The plan's `runEvalSession` (Section 5) takes `params: { taskId, agentId, teamId }` and `ScenarioSeedResult` returns `teamId`. But `provisionSession()` expects `productId`, not `teamId`. The sessions route (sessions-routes.ts line 187) passes `productId: task.teamId` -- the value IS the teamId, but the parameter NAME is `productId`. The plan's provision-harness must map `teamId` to `productId` when calling `provisionSession()`. This mapping is not documented anywhere in the plan.

**WARNING: `TriggerResult.outcome` type mismatch.** The plan defines `outcome: "completed" | "crashed"` (Section 3.2). The actual `SessionOutcome` type in `@hyperidle/shared/events.ts` is `"completed" | "crashed" | "stopped"`. The `ProvisionSessionResult.outcome` uses `SessionOutcome`. The plan's `TriggerResult` narrows the union, which is intentional (eval sessions should not be manually stopped) but the plan does not document this deliberate narrowing or how `runEvalSession` should handle a `"stopped"` outcome if it occurs unexpectedly.

**WARNING: `seedKnowledge` must insert into two tables.** The `knowledgeItems` kernel table and the `knowledgeStrategyFabric` extension table are separate. The plan's reconciliation table (line 37) correctly notes "Seeding library must populate knowledge items with strategy fabric rows" and the `seedKnowledge` helper accepts `layer` and `kind` (fabric fields). But the function signature does not show the full set of required `knowledgeStrategyFabric` columns. The builder needs to know the fabric table schema to implement this correctly. The plan should reference `packages/db/src/schema.ts` lines 478+ for the strategy fabric table definition.

### 5. Naming (9/10)

Names are honest and specific. `EvalScenario`, `ScoringRubric`, `DimensionScore`, `JudgeContext` -- all describe what they are without generic suffixes. `seedMinimalWorld` communicates scope. `runEvalSession` says exactly what it does.

The `provision-harness.ts` filename is slightly misleading -- it does not implement a harness; it wires up dependencies for calling `provisionSession`. A name like `eval-session.ts` or `session-wiring.ts` would be more honest. Minor.

### 6. Module Depth (9/10)

The public surface is appropriately small. The eval package exports its types from the root, and the CLI is the single entry point. Internally, there are 6 source files with clear responsibilities. `seedMinimalWorld` is a well-designed deep function -- small interface (optional overrides), significant complexity hidden (7 table inserts with FK relationships).

The `EvalScenario` interface is the single contract that X8 implements. Three methods (seed, trigger, rubric). This is an excellent example of interface simplicity.

### 7. Failure-Mode Coverage (8/10)

The security analysis (Section 12) addresses all required concerns: rate-limiting (N/A -- no HTTP), input trust boundaries, secret handling, path traversal, SSRF. Each is marked applicable/N/A with reasoning.

Cost runaway mitigation is well-thought-out: `maxIterations: 20` for eval, running cost display, `--quick` mode.

Gaps:

- **Migration resolution.** `createEvalDb()` uses `resolveMigrationsFolder()` which resolves `packages/db/drizzle/` relative to the monorepo root via `import.meta.url`. The plan mentions this (Section 11) but does not specify what happens if the path resolution fails (e.g., eval is run from a different working directory). The test-utils version handles this via `__dirname` + ESM fallback (the `resolveDirname` function added in the same file). The eval should use the same resolution strategy.
- **PGlite `waitReady` timeout.** The plan's `createEvalDb` calls `await client.waitReady` with no timeout. PGlite WASM initialization can take 850ms+ per the test-utils comments. If WASM fails to initialize (e.g., insufficient memory), there is no timeout or error handling specified.
- **LLM call failure during eval.** If `provisionSession` throws (LLM API error, rate limit, network timeout), the plan says the scenario outcome is `"crashed"` (Section 8, exit code). But it does not specify whether the PGlite instance is properly torn down on crash, or whether the runner continues to the next scenario.

### 8. Simplicity / Over-Engineering Risk (9/10)

The plan is admirably lean. No abstract base classes, no plugin systems, no feature flags. The design-it-twice sections (Sections 16 and 17) are genuine -- both rejected alternatives have real trade-offs and the chosen options are simpler.

The seeding library has 9 helpers, which might seem like over-engineering for a single POC scenario. But the spec explicitly says "Scenarios in X8 compose these helpers -- they don't each reinvent DB seeding." This is correct forward investment demanded by the spec.

The decision to not use `seed()` from `@hyperidle/db` (Section 4, design decisions) is well-reasoned: the existing seed reads from disk (`docs/souls/`) and inserts too many fixtures. Building from composable helpers is simpler and more predictable.

### 9. Verifiability (7/10)

This is the weakest dimension. All 10 ACs have verification methods, but most are "Manual validation" -- run the eval and inspect the output. This is inherent to the nature of evals (they require real LLM calls, so automated CI testing is impossible), but the plan could do better:

- AC2 and AC4 have type-check verification, which is concrete and automatable.
- AC10 has a static check (confirm vitest config exclusion), which is concrete.
- ACs 1, 3, 5, 6, 7, 8 all say "Manual validation" -- this is the correct approach for an eval framework, but the plan should specify what "manual validation" means more precisely. For example, AC5 lists the exact JSON fields to verify, which is good. AC1 just says "observe" which is weaker.

The protected-tests list is empty (Section 13), which is correct -- no existing tests are modified. But the plan should explicitly note that `vitest.config.ts` must NOT be modified to include `packages/eval` in the projects list.

---

## CRITICAL

1. **[plan SS5, SS3.2] `productId`/`teamId` field mapping undocumented.** `ProvisionSessionParams.productId` must receive the `teamId` value (confirmed in sessions-routes.ts line 187: `productId: task.teamId`). The plan's `runEvalSession` takes `teamId` in its params but must pass it as `productId` to `provisionSession()`. This mapping is absent from the plan. Without it, the builder will either pass `teamId` as a nonexistent field (type error) or discover the mismatch during implementation and make an ad-hoc decision. **Fix:** Add explicit mapping in the Section 5 implementation sketch: `productId: params.teamId` in the `provisionSession` call, with a comment referencing the `@lore U1` naming legacy.

## WARNING

1. **[plan SS3.4, SS19] Token tracking types not integrated into canonical type definitions.** Section 3.4 defines `ScenarioReport` and `EvalReport` without `tokensByTier` / `totalTokensByTier`. These fields are added in Section 19 as an addendum. The builder reading Section 3.4 as the source of truth will produce incomplete types. **Fix:** Merge the Section 19 revised types into Section 3.4 so there is one canonical definition.

2. **[plan SS3.2] `TriggerResult.outcome` silently narrows `SessionOutcome`.** The production type is `"completed" | "crashed" | "stopped"`. The plan uses `"completed" | "crashed"`. If provisionSession returns `"stopped"` (theoretically possible if `stopSession` is called via a tool or event), `runEvalSession` will need to handle or discard it. **Fix:** Either use `SessionOutcome` directly (importing from `@hyperidle/shared`) or document the narrowing with a comment explaining that eval sessions cannot be stopped and what happens if they are.

3. **[plan SS4] `seedKnowledge` strategy fabric columns not fully specified.** The helper accepts `layer` and `kind` but the `knowledgeStrategyFabric` table has additional columns (`scopeId`, `confidence`, `vectorEmbedding`, etc.) that may be needed for realistic materialization. **Fix:** Add `packages/db/src/schema.ts` lines 478-510 to the Required reading list, and expand the `seedKnowledge` signature or note which fabric columns the builder should default.

4. **[plan SS2] Missing `llm-client` export for LLM-as-judge.** The plan says LLM-as-judge is supported (Section 6) and `JudgeContext` provides `resolvedModel`, but there is no way for a judge function to actually call an LLM. The server's `callLlm` lives at `./harness/llm-client` which is not in the export additions. For the POC (all rule-based), this is non-blocking. For X8, it will be. **Fix:** Either add `"./harness/llm-client": "./src/harness/llm-client.ts"` to the server exports now, or add `"./harness/llm-types": "./src/harness/llm-types.ts"` as well (since `callLlm` uses `LlmMessage` etc.), or note this as a deferred export for X8.

## SUGGESTION

1. **[plan SS5] Document crash/teardown behavior in the execution loop.** Section 7 lists the per-scenario lifecycle but does not specify what happens if step 3 (Trigger) throws. Does step 6 (Teardown) still run? Is the scenario recorded as `outcome: "crashed"` with score 0? The runner must be resilient to individual scenario failures. A try/catch wrapper with cleanup is implied but not specified.

2. **[plan SS11] Reuse the `resolveDirname` pattern from test-utils.** The plan's `createEvalDb` uses `resolveMigrationsFolder()` which must resolve `packages/db/drizzle/` correctly. The existing `test-utils.ts` already solves this with the `resolveDirname()` function (ESM/CJS compat). Rather than reinventing, the eval should either import the migrations folder path from `@hyperidle/db` or replicate the same `import.meta.url` pattern. The plan references this pattern ("using the same `import.meta.url` pattern as `test-utils.ts`") but should be more specific.

3. **[plan SS10] POC scenario `knowledge_item_created` dimension references `write_memory` tool.** The dimension description says "the `write_memory` tool (not `create_item`) is the correct tool for knowledge creation." This is correct for the tool name, but the task description ("Create a knowledge item with the summary") should guide the agent to use `write_memory`, not `create_item`. The distinction matters because the `updatedBy` format differs. The plan should note this in the task description guidance -- or make the dimension check for both tools' output patterns.

4. **[plan SS14] AC verification should note vitest.config.ts exclusion explicitly.** AC10 verification says "confirm no vitest config references packages/eval." The vitest.config.ts at the monorepo root has an explicit `projects` list that does NOT include `packages/eval`. The plan should note that this file must not be modified as part of X7 implementation.

---

## What's Working Well

1. **The plan reconciliation table (Section 0) is excellent.** Every assumption the spec makes is validated against the actual codebase with a resolution column. The `productId` naming issue is the one gap, but the thoroughness of checking `ProvisionSessionDeps` fields, `LocalWorkspaceAdapter` constructor guard, `EventBus` interface, model gateway config, and file watcher lifecycle demonstrates genuine codebase investigation rather than assumed knowledge.

2. **Design-it-twice decisions are genuine.** Both the ephemeral DB strategy (Section 16) and scenario discovery mechanism (Section 17) present real alternatives with real trade-offs. The PGlite-per-scenario decision over TRUNCATE-and-reuse is the right call for an eval framework where isolation trumps speed. The explicit re-export over glob import is the right call for type safety. Neither rejected option is straw-manned.

3. **The security analysis is calibrated to the threat model.** Instead of applying generic security patterns to a CLI tool, the plan correctly marks HTTP-specific concerns as N/A and focuses on the real risks: cost runaway, secret handling, and the intentional trust given to agents during eval. The `maxIterations: 20` limit is a concrete, measurable mitigation.
