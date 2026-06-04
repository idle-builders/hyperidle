# Integration Test Review: What to Keep, Unify, or Drop

## Existing Test Coverage Map

### packages/server/src/__tests__/session-provisioning.test.ts (918 lines)

The most relevant existing test file. Contains:

- **ScriptedHarnessAdapter** -- a fully-featured mock harness with:
  - Scripted event sequences (HarnessEvent[])
  - Scripted file writes (simulates agent writing to workspace)
  - afterFileWrites hooks (for deterministic writeback assertions)
  - throwAfter (crash simulation)
  - onStart hook (for observing state during provisioning)
  - Custom stopResult
  - getCapabilities()
- **seedDomain()** -- seeds team, teamMember, bet, agent, task, knowledgeItem with overrides for agentCostCap, agentMaxConcurrentSessions, taskState, taskRiskTier, extraTasks
- **Full provisionSession() integration tests** covering:
  - AC1: end-to-end mock run (provisioning -> file write -> writeback -> DB -> cleanup)
  - AC3: crash recovery (marks crashed, preserves pre-crash knowledge)
  - AC4: cost cap rejection (zero cap, no side effects)
  - AC5: concurrent sessions (3 parallel, isolated writebacks)
  - AC6: task state transitions (accepted -> in_progress before streamEvents)
  - AC7: sub-agent cost aggregation
  - AC8: session_ended event (normal + crashed + tool_call_recorded)
  - C7: mid-session cost cap breach detection
  - Workspace spawn failure revert
  - Negative deltaCost clamping
  - stopSession error propagation
  - Facilitator role provisioning (G1 AC6)
  - Review item creation on session end

### packages/server/src/__tests__/X6-provisioning-integration.test.ts (287 lines)

Tests BuiltinHarnessAdapter integration with provisioning:
- No double tool execution when builtin harness handles tools internally
- setSessionToolRegistry called before startSession
- Uses callLlm mock to control harness behavior

### packages/server/src/skill-tools/__tests__/ (21 test files)

Individual tool tests, each calling the tool handler directly with a ToolContext:
- **write-session-notes.test.ts** -- writes to sessions.notes
- **write-memory.test.ts** -- creates knowledgeItems rows
- **create-task.test.ts** -- inserts tasks in "proposed" state
- **submit-review.test.ts** -- creates thread + review message
- **create-artifact.test.ts** -- creates artifacts with preview validation
- **handoff-to.test.ts** -- task ownership reassignment + audit trail
- **tool-registry.test.ts** -- registry.invoke(), role filtering, unknown tool error

### packages/server/src/__tests__/R5-agent-work-loop.test.ts (422 lines)

Integration tests calling skill-tool handlers directly then checking API routes:
- create_task -> GET /api/bets/:id shows new task
- submit_review -> thread message exists
- Verdict round-trip (review -> verdict -> read_inbox)
- Cost accumulation on bets via recordCostAndCheck

### packages/server/src/__tests__/handoff-protocol.test.ts (710 lines)

Comprehensive handoff service tests:
- Agent-to-agent handoff (session end + ownership transfer + thread message)
- Role-based handoff with resolution
- Handoff to human (task blocked + review item)
- Structured metadata in thread messages
- Audit trail preservation, multiple sequential handoffs
- Atomic transaction rollback on failure
- Data integrity (notes vs auditTrail separation)
- costActual preservation across handoff

### packages/server/src/__tests__/R7-knowledge-e2e.test.ts

End-to-end knowledge tests:
- write_memory creates items with status="draft"
- scopeKind/scopeId on kernel and fabric tables
- Items appear in knowledge list endpoint
- Full triage-to-curated flow (write_memory -> promote_knowledge)
- Materialization into subsequent sessions

### packages/server/src/__tests__/cost-cap*.test.ts (3 files)

Cost cap mechanics at the unit level:
- Deduplication
- Session end paths
- Bet cost accumulation

---

## Overlap Analysis

### 1. EvalHarnessAdapter vs ScriptedHarnessAdapter

**DUPLICATE with degradation.**

| Capability | ScriptedHarnessAdapter (existing) | EvalHarnessAdapter (new) |
|---|---|---|
| Replays HarnessEvent sequence | Yes -- arbitrary events array | Yes -- but only tool_call, cost_update, completion (turn-based) |
| Crash simulation (throwAfter) | Yes | No |
| File writes to workspace | Yes | No |
| afterFileWrites hooks | Yes | No |
| onStart hooks | Yes | No |
| Custom stopResult | Yes | No (always returns "completed") |
| Session ID format | `scripted-session-N` | `eval-session-N` |
| mcpSupport | false | false |

The EvalHarnessAdapter is strictly less capable than ScriptedHarnessAdapter. Its only structural difference is the "turn-based" scripting model (ScriptedTurn with toolCalls/costDelta/completion fields), which is a convenience wrapper around the same underlying event sequence. The existing adapter can express everything the new adapter can by listing events directly.

**Verdict: DUPLICATE. The turn-based convenience could be a thin wrapper over ScriptedHarnessAdapter's event model if desired, but a separate adapter class is not justified.**

### 2. seedWorld() vs seedDomain()

**PARTIAL OVERLAP.**

| Feature | seedDomain (session-provisioning.test.ts) | seedWorld (packages/eval/src/seed.ts) |
|---|---|---|
| Team + teamMember | Yes | Yes |
| Agent (users) | Single agent with overrides | Multiple agents with costCapMinor, soulPrompt |
| Bet | Single bet | Single bet with costAppetiteMinor |
| Tasks | Primary + optional extras | Multiple tasks with ownerAgentId, description |
| KnowledgeItems | Single seed item | Optional array |
| Return type | void | void |
| Configurability | SeedOverrides object | EvalSeedData object |

seedWorld is more configurable for multi-agent/multi-task scenarios but less configurable for per-field overrides (no taskRiskTier, no agentMaxConcurrentSessions). Both are simple INSERT helpers. The existing skill-tool tests each have their own inline seed functions too (see write-memory.test.ts, create-task.test.ts, etc.).

**Verdict: PARTIAL OVERLAP. seedWorld is not a copy of seedDomain, but both exist because there is no shared seed utility. If a shared seed helper existed in @hyperidle/db test-utils, neither function would need to exist.**

### 3. Scenarios vs Existing Tests

#### Scenario 1: knowledge-task (write_session_notes + write_memory -> DB assertions)

- **write_session_notes**: Already tested in `skill-tools/__tests__/write-session-notes.test.ts` (handler called directly, asserts sessions.notes)
- **write_memory**: Already tested in `skill-tools/__tests__/write-memory.test.ts` (handler called directly, asserts knowledgeItems row) and `R7-knowledge-e2e.test.ts` (full knowledge lifecycle)
- **Session completion**: Already tested in `session-provisioning.test.ts` AC1 (end-to-end with ScriptedHarnessAdapter, asserts session.state='done')

**What's new**: Running both tools in sequence through provisionSession's Phase 10 tool_call interception, rather than calling handlers directly. This is the "provisioning orchestrator dispatches tool_call events to registry.invoke()" path.

**Verdict: The individual tool behaviors are thoroughly tested. The new coverage is the "tool_call event -> registry.invoke() dispatch" path in provisionSession Phase 10, BUT this path is already tested by session-provisioning.test.ts AC8 (tool_call_recorded events) and X6-provisioning-integration.test.ts (no double execution). DUPLICATE.**

#### Scenario 2: coordination-task (create_task + submit_review -> DB assertions)

- **create_task**: Tested in `skill-tools/__tests__/create-task.test.ts` and `R5-agent-work-loop.test.ts` AC1
- **submit_review**: Tested in `skill-tools/__tests__/submit-review.test.ts` and `R5-agent-work-loop.test.ts` AC2

**What's new**: Running both tools in a single provisionSession call. Same verdict as knowledge-task.

**Verdict: DUPLICATE.**

#### Scenario 3: synthesis-task (write_session_notes + create_artifact -> DB assertions)

- **create_artifact**: Tested in `skill-tools/__tests__/create-artifact.test.ts` (comprehensive -- 6 AC tests + integration test) and `skill-tools/__tests__/create-artifact.integration.test.ts`

**What's new**: Same as above -- running through provisioning.

**Verdict: DUPLICATE.**

#### Scenario 4: handoff-task (write_session_notes + handoff_to -> DB assertions)

- **handoff_to tool**: Tested in `skill-tools/__tests__/handoff-to.test.ts`
- **handoff protocol**: Comprehensively tested in `handoff-protocol.test.ts` (11 test cases, 710 lines)

**What's new**: Running handoff_to through the provisioning tool_call dispatch path. The existing handoff-protocol.test.ts calls `handoff()` directly (the service function), while the eval scenario calls `handoff_to` tool -> handler -> `handoff()`. The tool handler layer is already tested in handoff-to.test.ts.

**Verdict: DUPLICATE.**

#### Scenario 5: cost-bounded-task (cost_update events + write_session_notes + write_memory -> bet cost assertion)

- **Cost tracking through provisioning**: Tested in `session-provisioning.test.ts` AC7 (cost aggregation) and C7 integration (mid-session breach detection)
- **Bet cost accumulation**: Tested in `R5-agent-work-loop.test.ts` AC4 and `cost-cap-bet.test.ts`

**What's new**: Verifying bet.costActualMinor > 0 after a provisioned session with cost_update events and costAppetiteMinor on the bet. The existing tests cover cost_update -> agent cost accumulation and recordCostAndCheck -> bet cost accumulation separately. There is no existing test that goes provisioning with cost_update events -> bet.costActualMinor in a single flow.

**Verdict: PARTIAL OVERLAP. The end-to-end flow of "cost_update events during provisioning -> bet cost increment" has a minor gap in existing coverage, but the individual links in the chain are all tested.**

---

## The Standalone Runner Question

The architecture plan (Task 0, Q1) explicitly chose a standalone script over vitest, citing:

1. "Vitest parallel workers fight with PGlite WASM allocation"
2. "Eval scenarios are intentionally serial"
3. "Vitest's reporter would swallow the structured JSON output"
4. "Adding evals to npm run test would make the test suite flaky in live mode"

**Every one of these arguments is wrong for deterministic scripted tests:**

1. PGlite allocation is already handled by the pool in test-utils.ts. Every existing test file in the repo uses createTestDb() through vitest workers without issue -- including concurrent provisioning tests (AC5).
2. Vitest can run tests serially with `--sequence.concurrent=false` or by not using `concurrent`. The scenarios are independent and could even run in parallel.
3. Vitest's reporter formats test results well. The JSON report is custom eval infrastructure that duplicates vitest's built-in `json` reporter.
4. Live mode does not exist for scripted/deterministic tests. The entire premise of "these are evals that need a separate runner" has been reclassified away.

The standalone runner reinvents:
- Test discovery (vitest does this)
- Per-test setup/teardown (beforeEach/afterEach)
- Error collection and reporting (vitest's reporter)
- Exit code management (vitest handles this)
- The `try/catch` around each scenario (vitest does this per-test)

For a total of ~174 lines (runner.ts) replacing zero lines of vitest configuration.

**Conclusion: The standalone runner is not justified. These are integration tests. They should be vitest tests in the appropriate package -- which is `packages/server/`, where the provisioning orchestrator and tool registry live.**

---

## Recommendation

### For each piece of new code

| File | Decision | Rationale |
|------|----------|-----------|
| `packages/eval/` (entire package) | **DROP** | The package exists to house an eval framework. With deterministic scripted tests, there is no eval framework -- there are integration tests. These belong in `packages/server/src/__tests__/`. |
| `eval-harness-adapter.ts` | **DROP** | Strictly less capable than the existing ScriptedHarnessAdapter in session-provisioning.test.ts. |
| `live-harness-adapter.ts` | **DROP** | Single-turn, broken types (6 unsafe casts, TS2769 on messages.create), acknowledged incomplete. If live evals are needed later, build them properly. |
| `runner.ts` | **DROP** | Reinvents vitest. |
| `report.ts` | **DROP** | Custom reporting infrastructure for a framework that should not exist. |
| `types.ts` | **DROP** | Types for a framework that should not exist. `ScriptedToolCall` and `ScriptedTurn` are minor conveniences over the existing HarnessEvent[] model. |
| `seed.ts` | **CONSIDER EXTRACTING** | The seedWorld pattern is useful, but it duplicates patterns in 5+ existing test seed functions. If consolidated, it should live in `@hyperidle/db/test-utils` or `packages/server/src/test-utils.ts`, not in a separate package. |
| `scenarios/knowledge-task.ts` | **DROP or MERGE** | Coverage already exists in write-session-notes.test.ts + write-memory.test.ts + session-provisioning.test.ts. If the "tool_call dispatch through provisionSession" integration is desired, add 1 test case to session-provisioning.test.ts. |
| `scenarios/coordination-task.ts` | **DROP or MERGE** | Coverage exists in create-task.test.ts + submit-review.test.ts + R5-agent-work-loop.test.ts. |
| `scenarios/synthesis-task.ts` | **DROP or MERGE** | Coverage exists in create-artifact.test.ts + create-artifact.integration.test.ts. |
| `scenarios/handoff-task.ts` | **DROP or MERGE** | Coverage exists in handoff-to.test.ts + handoff-protocol.test.ts (710 lines). |
| `scenarios/cost-bounded-task.ts` | **MERGE** | This is the one scenario with a minor coverage gap: provisioning + cost_update -> bet.costActualMinor. Add as a test case in session-provisioning.test.ts or cost-cap-bet.test.ts. |
| `index.ts` | **DROP** | Barrel for a package that should not exist. |
| `vitest-setup.ts` | **DROP** | PGlite warm-up already exists in packages/server/src/vitest-setup.ts. |
| `vitest.config.ts` | **DROP** | Config for a package that should not exist. |
| `__tests__/seed.test.ts` | **DROP** | Tests a seed utility that should be inlined or shared differently. |
| `__tests__/eval-harness-adapter.test.ts` | **DROP** | Tests an adapter that should not exist. |
| `__tests__/report.test.ts` | **DROP** | Tests reporting infrastructure that should not exist. |
| `packages/server/src/session.ts` | **KEEP** | The subpath barrel export is a clean architectural improvement regardless of the eval package. Other consumers may benefit from importing provisioning types without triggering server startup. |
| `packages/db/src/test-utils.ts` change | **KEEP** | The ESM/CJS `__dirname` compat fix is defensive and correct, even if the eval runner that motivated it is dropped. |

### Summary verdict

**The entire `packages/eval/` package is redundant.** The 5 scenarios exercise tool paths that already have 30+ focused test cases across the server package. The "eval framework" identity was a category error: these are integration tests with scripted responses, not evals. The standalone runner, report system, and separate package add ~1500 lines of infrastructure to run 5 test cases that could each be a single `it()` block in the existing session-provisioning test file.

---

## Rename Plan

If any code is kept rather than dropped, everything named "eval" should be renamed:

| Current | Target |
|---------|--------|
| `packages/eval/` | Do not keep the package. Move test cases to `packages/server/src/__tests__/`. |
| `@hyperidle/eval` | N/A (package dropped) |
| `EvalHarnessAdapter` | N/A (class dropped) |
| `EvalSeedData` | N/A (type dropped) |
| `EvalScenario` | N/A (type dropped) |
| `EvalReport` | N/A (type dropped) |
| `EvalScenarioResult` | N/A (type dropped) |
| `EvalTrigger` | N/A (type dropped) |
| `AssertionContext` | N/A (type dropped; also has a typo: "Asserti**o**n" vs "Assertion") |
| `npm run eval` in root package.json | Remove the script |
| `eval-results.json` in .gitignore | Remove the entry |

---

## Minimum Action Items

1. **Delete `packages/eval/` entirely.** Remove the directory, the workspace reference, the vitest project entry, the `npm run eval` script, and the `.gitignore` entry for `eval-results.json`.

2. **Keep `packages/server/src/session.ts`** (the subpath barrel export). It is a clean architectural improvement independent of the eval package.

3. **Keep the `packages/db/src/test-utils.ts` change** (ESM __dirname compat). It is defensive and correct.

4. **If the "tool_call dispatch through provisioning" integration coverage is desired**, add 1-2 test cases to `packages/server/src/__tests__/session-provisioning.test.ts` using the existing ScriptedHarnessAdapter:
   - A test that scripts tool_call events for `write_session_notes` + `write_memory`, runs provisionSession, and asserts the knowledge item exists in DB. (This covers the Phase 10 dispatch path.)
   - A test that scripts cost_update events during provisioning and asserts bet.costActualMinor is incremented. (This closes the minor gap from scenario 5.)

5. **Clean up biome.json and knip.json** if they reference the eval package.

6. **Update the root tsconfig.json** to remove the eval package reference.

7. **Rebase onto main** to ensure the branch is clean after deletions.
