# X7 Architecture Critique: E2E Eval Framework

**Reviewer:** Architecture Critique (Phase 2)
**Date:** 2026-06-04
**Plan:** `plans/X7/architecture.md`

---

## Dimension Scores

### 1. Spec Fidelity — 8/10

Every AC has a clear implementation path. The AC-to-implementation mapping table (plan lines 75-86) is explicit and complete. All six ACs are addressed with concrete file paths, type definitions, and verification methods.

**Findings:**

- **AC3c (Synthesis task) -- incorrect `create_artifact` preview shape.** The plan's scenario scripts `preview: { kind: "decision", title: "...", summary: "..." }` but the actual `artifactPreviewSchema` discriminated union for kind `"decision"` requires `{ kind: "decision", claim: string, rationale: string }` (see `packages/server/src/schemas/artifact-preview.ts:65-68`). This will fail Zod validation at runtime. The builder must correct the preview to use `claim` and `rationale` fields.

- No other spec fidelity issues. All ACs are accounted for.

### 2. Reconciliation — 9/10

The plan's reconciliation table (lines 49-69) is thorough and accurate. I verified every claim against the codebase:

- `createTestDb()` -- confirmed at `packages/db/src/test-utils.ts`, exported from `packages/db/src/index.ts`.
- `provisionSession()` -- confirmed at `packages/server/src/services/session-provisioning.ts` with the exact `ProvisionSessionDeps` + `ProvisionSessionParams` signatures the plan references.
- `ScriptedHarnessAdapter` -- confirmed NOT exported from `session-provisioning.test.ts` (it's a test-local class). Plan correctly decides to build a separate `EvalHarnessAdapter`.
- `AdapterPool` -- confirmed with `register(id, adapter, meta)` signature. The plan's runner uses this correctly.
- `buildToolRegistry` + `ToolContext` -- confirmed at `packages/server/src/skill-tools/tool-registry.ts`.
- All 7 tool names referenced exist in `packages/server/src/skill-tools/`.
- `ProvisionSessionResult` fields (`sessionId`, `outcome`, `totalCostCents`, `taskId`) match the plan's assertion usage.

**Findings:**

- **Risk 6 (traceId gap) is correctly identified.** `SessionContext` at `session-lifecycle.ts:30-38` requires `traceId: string`, but `session-provisioning.ts:349-355` constructs it without `traceId`. The `handoff-to.ts:54-60` tool has the same omission. This is a real pre-existing type gap masked by composite project reference resolution. The plan correctly identifies this and defers resolution.

- The plan states the runner imports `AdapterPool` from `@hyperidle/server/harness/adapter-pool.js` and `provisionSession` from `@hyperidle/server/services/session-provisioning.js`. These are deep imports into `@hyperidle/server` internals -- not re-exported from the package's barrel `index.ts`. The plan does not verify whether these deep imports will resolve from a sibling package. The builder will need to either add these exports to `@hyperidle/server`'s barrel or configure path mappings. This is a gap in reconciliation.

### 3. Type Design — 8/10

The types are well-structured and follow existing patterns:

- `EvalScenario` interface with `seed`, `trigger`, `script`, `assert` cleanly separates concerns.
- `HarnessScript` with `ScriptedTurn[]` maps directly to how `provisionSession` Phase 10 consumes events.
- `EvalReport` and `EvalScenarioResult` are minimal and purpose-built for the JSON output contract.
- `EvalSeedData` captures the right entity relationships.
- `readonly` modifiers are used consistently throughout.

**Findings:**

- **`AssertionContext.events` is always `[]`.** The plan's runner (line 547) passes `events: []` because "Events captured via eventBus listeners in future iteration." The `events` field on `AssertionContext` (line 267) is typed as `readonly import("@hyperidle/shared").HarnessEvent[]` but is never populated. No scenario uses it. This is dead API surface. Either remove it from the interface or wire up event capture via `eventBus.on()`.

- **`EvalScenarioResult.costCents` is 0 on failure.** When a scenario throws, the runner catches the error and returns `costCents: 0` (line 570). But if the scenario partially succeeded before throwing (e.g., some cost_update events were processed), the actual cost is lost. This is acceptable for v1 mock mode (cost is always 0 in mock) but would misreport in live mode.

- **The `EvalSeedData.agents` array uses `readonly` on the inner object but uses a `readonly` modifier on the array itself.** This is correct TypeScript but worth noting that the nested `readonly` pattern is unusually verbose compared to the rest of the codebase. Consistent, so no deduction.

### 4. Task Ordering — 9/10

The dependency graph is correct. Tasks 2/3/4 are genuinely independent after Task 1. Task 5 correctly depends on all three. Task 6 depends on Task 5. The critical path is Task 1 -> Task 5 -> Task 6.

**Findings:**

- **Task 7 (root wiring) should be Task 1's dependency, not independent.** The plan says Task 7 "is independent of task ordering but should be done early." In practice, `npm run eval` won't work until root wiring is done, and `npm install` won't resolve `@hyperidle/eval` workspace dependencies until the root `package.json` recognizes the workspace. Task 7 should be part of or immediately follow Task 1.

### 5. Risk Identification — 8/10

The six identified risks are real and specific. No FUD. Particularly good:

- Risk 1 (provisionSession deep dependencies and filesystem needs) is practical and points to the known-working approach from the existing test suite.
- Risk 3 (PGlite cold start) is quantified with actual numbers.
- Risk 5 (live mode non-determinism) is honestly acknowledged with a concrete follow-up suggestion.
- Risk 6 (traceId gap) is a genuine codebase finding that demonstrates real reconciliation effort.

**Findings:**

- **Missing risk: `packages/eval/` workspace registration.** Adding a new package to the npm workspace requires updating root `package.json` workspaces array. The plan mentions root `package.json` changes for the `eval` script but does not mention the `workspaces` field. If `packages/eval/` is not in the workspaces array, `npm install` won't hoist its dependencies and the deep `@hyperidle/server` imports won't resolve.

- **Missing risk: `processWriteback` / `watcher.stop()` in teardown.** The `provisionSession` flow calls `endSession` which calls `watcher.stop()` and then `processWriteback()`. In the eval context, the watcher is writing to temp directories. If `processWriteback` fails (e.g., manifest not found), it could throw during teardown and mask the actual assertion result. The existing test suite handles this, but the risk should be noted.

### 6. Security — 8/10

The security table (lines 1116-1123) covers the relevant concerns:

- API keys read from env, never logged or written to report -- correct.
- Tool args pass through Zod validation -- same trust boundary as production.
- `eval-results.json` added to `.gitignore` -- prevents accidental commit of cost data.
- No HTTP endpoints exposed by evals -- no rate-limiting needed.
- Workspace isolation via `os.tmpdir()` -- same as existing tests.

**Findings:**

- **Live mode API key in process memory.** The `LiveHarnessAdapter` receives the API key via constructor. If the eval crashes and produces a core dump or error trace, the key could leak into stack frames. Low severity for a dev-only tool, but the plan should note this.

- No other security gaps. The plan correctly identifies that evals introduce no new trust boundaries.

### 7. Simplicity — 9/10

The plan is notably restrained:

- Standalone script instead of Vitest -- well-justified, avoids fighting Vitest semantics.
- Per-scenario DB isolation instead of shared state -- simplest correct approach.
- Custom `EvalHarnessAdapter` instead of injecting into `BuiltinHarnessAdapter` -- correctly avoids X6 dependency.
- No eval-specific DB tables -- evals read existing tables.
- No unnecessary abstraction layers -- the runner is a single serial loop.

**Findings:**

- **`LiveHarnessAdapter` as a separate task is good separation.** Keeping it optional and gated on `--live` + API key presence prevents scope creep.

- The plan's runner infrastructure is approximately 150 lines as estimated. No over-engineering detected.

### 8. Testability — 7/10

Each task has a verification method specified. Most are appropriate.

**Findings:**

- **Task 2 says "Unit test: call `seedWorld()` with test data, query DB, assert rows exist."** But the CLAUDE.md rules state that evals are NOT tests and should not be added to `npm run test`. Where do these unit tests live? If in `packages/eval/src/__tests__/`, they would need to be included in Vitest config -- but the plan explicitly says NOT to add `packages/eval` to the Vitest projects list (line 172). This creates a contradiction: the plan specifies unit tests for Tasks 2-4 but provides no mechanism to run them. The builder needs guidance -- either add eval package tests to Vitest (contradicting the "evals are not tests" principle) or skip unit tests for infrastructure code and rely on `npm run eval` as the single verification method.

- **Task 5 verification: "npm run eval with no scenarios produces an empty report (or errors gracefully)."** This is underspecified. Which behavior is expected? An empty report with 0 scenarios and exit code 0? Or an error exit? The plan's runner code (lines 467-469) exits with code 1 when `scenarios.length === 0`, which means "errors gracefully" -- but this contradicts Task 5's "produces an empty report" option.

- **No verification for the `EvalHarnessAdapter`'s interaction with `provisionSession`'s Phase 10.** The adapter emits `tool_call` events, but the plan doesn't specify how to verify that `provisionSession` actually intercepts and dispatches these to `registry.invoke()`. This is the core integration path. The verification relies entirely on Task 6's end-to-end scenarios, which is acceptable but makes debugging harder if Phase 10 interception doesn't work.

### 9. Completeness — 8/10

The plan covers all necessary components to ship `npm run eval` with 5 mock scenarios and optional live mode. The package structure, type definitions, runner, seed helpers, scenarios, and root wiring are all specified.

**Findings:**

- **Missing: `packages/eval/` needs to be added to the root `workspaces` array.** Without this, `npm install` will not install eval's dependencies. The plan mentions root `package.json` additions but only shows the `scripts.eval` entry, not the workspaces change.

- **Missing: How does the builder import from `@hyperidle/server` internal paths?** The runner imports `AdapterPool` from `@hyperidle/server/harness/adapter-pool.js`, `LocalWorkspaceAdapter` from `@hyperidle/server/harness/local-workspace-adapter.js`, and `provisionSession` from `@hyperidle/server/services/session-provisioning.js`. These are deep imports that bypass the barrel export. The plan doesn't address whether these paths will resolve from a sibling workspace package. If `@hyperidle/server` doesn't re-export these, the builder needs to either add them to `packages/server/src/index.ts` or use TypeScript path mapping. This is an implementation gap.

- **Missing: `eval-results.json` gitignore entry location.** The plan says "Add `eval-results.json` to `.gitignore`" but doesn't specify which `.gitignore` (root or `packages/eval/`). Root is the correct answer but should be explicit.

---

## Summary

| Dimension | Score |
|-----------|-------|
| 1. Spec fidelity | 8 |
| 2. Reconciliation | 9 |
| 3. Type design | 8 |
| 4. Task ordering | 9 |
| 5. Risk identification | 8 |
| 6. Security | 8 |
| 7. Simplicity | 9 |
| 8. Testability | 7 |
| 9. Completeness | 8 |
| **Average** | **8.2** |

## Verdict: PASS

The plan scores 8.2/10, above the 7.0 threshold. It is thorough, well-reconciled against the codebase, and appropriately scoped.

## Required Fixes (builder must address before implementation)

1. **Fix synthesis scenario preview shape.** Change `preview: { kind: "decision", title: "...", summary: "..." }` to `preview: { kind: "decision", claim: "...", rationale: "..." }` to match the `artifactPreviewSchema` discriminated union.

2. **Resolve deep import paths from `@hyperidle/server`.** The runner imports `AdapterPool`, `LocalWorkspaceAdapter`, and `provisionSession` via deep paths (`@hyperidle/server/harness/...`, `@hyperidle/server/services/...`). Either add these to `packages/server/src/index.ts` barrel exports or document that the builder should use relative paths (`../../server/src/...`). This is a blocking gap -- the build will fail without resolution.

3. **Add `packages/eval` to root workspace array.** The plan omits this from the root `package.json` additions. Without it, `npm install` will not resolve `@hyperidle/eval`'s workspace dependencies.

4. **Resolve testability contradiction.** The plan says "Do NOT add packages/eval to the vitest projects list" but specifies unit tests for Tasks 2-4. Clarify: either these "unit tests" are exercised via `npm run eval` integration (no separate vitest), or add a limited vitest config for eval infrastructure tests only.

## Advisory Notes (non-blocking)

- `events: []` in `AssertionContext` is dead API surface. Consider removing the field or wiring up `eventBus.on()` capture.
- The `EvalScenarioResult.costCents` is 0 on failure -- acceptable for v1 mock but will misreport in live mode.
- `processWriteback` / watcher cleanup during eval teardown could mask assertion errors if it throws. Consider wrapping teardown in additional error handling.
