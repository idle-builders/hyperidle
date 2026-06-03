# X6 Code Review: Built-in Harness (Best-Practice Agent Loop)

**Verdict: DONE**

All three blocking findings from round 1 are resolved. The two non-blocking items are also fixed. All 33 tests pass and typecheck is clean. No new blocking issues found.

---

## Round 1 Findings Resolution

| # | Finding | Severity | Resolved? | How? |
|---|---|---|---|---|
| 1 | CRITICAL-1: AC-15 provisioning orchestrator integration missing | Blocking | **Yes** | `session-provisioning.ts` Phase 8.5a injects registry via `setSessionToolRegistry(sessionId, registry)` when `selectedAdapter.meta.type === "builtin"` (line 385-387). Phase 10 tool_call handler skips `registry.invoke()` when `selectedAdapter.meta.type !== "builtin"` is false (line 548). `sessions-routes.ts` resolves fast tier model (lines 125, 143-149) and passes `resolvedFastModel` to `provisionSession` (line 193). New integration test at `X6-provisioning-integration.test.ts` with 2 tests covering end-to-end provisioning and no-double-execution. |
| 2 | WARNING-2: Timer leak in `fetchWithTimeout` | Blocking | **Yes** | `llm-client.ts` lines 355-375: `rejectTimeoutId` is stored in a `let` variable, cleared in both the `try` success path (line 368) and the `catch` error path (line 373) via `clearTimeout(rejectTimeoutId!)`. Both paths also clear `abortTimeoutId`. No timer can leak. |
| 3 | WARNING-4: `{} as SessionConfig` unsafe cast | Blocking | **Yes** | `BuiltinSession.config` is now typed `SessionConfig | null` (line 64). `setSessionToolRegistry` sets `config: null` for pre-registered sessions (line 172). `runLoop` has a null guard (line 364). `runPlanningTurn`, `runExecuteTurn`, `runMaxIterationsTurn`, and `injectReflection` all guard against null config. The `@lore` comment at lines 57-61 documents the rationale. |
| 4 | SUGGESTION-4/5: Weak AC-12/AC-14 tests | Non-blocking | **Yes** | AC-14 test "compresses conversation history" (lines 755-806) now accumulates 10+ messages before triggering summarization and asserts: (a) `pre_compaction` event emitted, (b) summarization callLlm used the `SUMMARIZE_SYSTEM` system prompt, (c) summarization request has exactly 1 message. AC-14 test "preserves recent messages" (lines 808-855) asserts that the next callLlm after summarization contains `[Previous conversation summary]` in messages. These are substantive assertions on the correct behavior. |
| 5 | WARNING-5: `toolDefsFromRegistry` duck-typing for test mocks | Non-blocking | **Yes** | `toolDefsFromRegistry` (lines 785-796) now reads `spec.input_schema.properties` and `spec.input_schema.required` directly -- no `as unknown as Record<string, unknown>` cast, no conditional branching for camelCase `inputSchema`. The test mock `makeMockRegistry` (test file lines 110-118) returns proper `ClaudeToolSpec` shape with `input_schema` (snake_case). |

---

## AC Completeness (Round 2)

| AC | Description | Implemented? | Tested? | Evidence |
|---|---|---|---|---|
| AC-1 | `BuiltinHarnessAdapter` implements `HarnessAdapter` | Yes | Yes | Class at `builtin-harness-adapter.ts:138`. Tests: 3 tests in "AC-1" describe block. |
| AC-2 | Uses model gateway for LLM calls | Yes | Yes | `callLlm()` uses `ResolvedModel` from gateway. Tests in `llm-client.test.ts`. |
| AC-3 | Tool calls via tool registry | Yes | Yes | `executeToolCalls` calls `registry.invoke()`. Tests in "AC-4" describe block (3 tests). |
| AC-4 | Anthropic tool_use + OpenAI function_calling | Yes | Yes | `callAnthropic`/`callOpenAi` in `llm-client.ts`. Tests in `llm-client.test.ts`. |
| AC-5 | Streams events (cost_update, token_usage, tool_call, completion, error) | Yes | Yes | `emitEvent()` + `trackUsage()` emit all event types. Tests in "AC-7" describe block (4 tests). |
| AC-6 | Default adapter registered in pool | Yes | Yes | Registered as "builtin" in `adapter-pool.ts`. Tests in "AC-8" describe block (3 tests). |
| AC-7 | Task decomposition (planning turn) | Yes | Yes | `runPlanningTurn()`. Tests in "AC-2" describe block (2 tests). |
| AC-8 | Reflection checkpoints every N tool calls | Yes | Yes | `injectReflection()` triggered by modulo check. Test in "AC-10" describe block. |
| AC-9 | Pre-compaction at 80% context window | Yes | Yes | `isAboveThreshold()` check in `runExecuteTurn`. Tests in "AC-11" describe block (3 tests). |
| AC-10 | Cost-aware tier switching | Yes | Yes | `summarizeHistory()` uses `resolvedFastModel` when available. Tests in "AC-12" describe block (2 tests). |
| AC-11 | Structured output for tool calls | Yes | Yes | Success/failure formatting in `executeToolCalls`. Tests in "AC-4" describe block. |
| AC-12 | Session history management (sliding window + summarization) | Yes | Yes | `summarizeHistory()` replaces old messages with summary + preserved recent. Tests in "AC-14" describe block (2 tests) with substantive assertions. |
| AC-13 (constraint) | Max-iterations guard (default 50) | Yes | Yes | Loop guard at line 379. Tests in "AC-13" describe block (2 tests). |
| AC-14 (constraint) | Reflection is harness-injected | Yes | Yes | `REFLECTION_PROMPT` constant injected by the harness at `injectReflection`. Verified in AC-10 test. |
| AC-15 (constraint) | Conversation history in-memory only | Yes | N/A | `BuiltinSession.messages` is an in-memory array. Type-system enforced. |
| AC-15 (plan) | Provisioning orchestrator integration | **Yes** | **Yes** | Phase 8.5a: `session-provisioning.ts` line 385-387 injects registry. Phase 10: line 548 skips `registry.invoke()` for builtin. `sessions-routes.ts` resolves fast tier at lines 143-149. Integration test at `X6-provisioning-integration.test.ts` (2 tests). |

---

## Remaining Observations (non-blocking, informational)

### Architecture

**WARNING-1 (carried from round 1, not a regression): `setSessionToolRegistry` / `startSession` reconciliation is fragile.**
The `startSession` method iterates the sessions map and picks the first entry where `loopPromise === null && registry !== null && !done`. If two sessions are pre-registered concurrently, the first `startSession` call could steal the registry intended for the second. In practice, the provisioning orchestrator calls `setSessionToolRegistry` immediately before `startSession` for each session, and sessions are provisioned sequentially per-agent (concurrency is bounded by `maxConcurrentSessions`). This is acceptable for v1 but should be revisited if parallel builtin sessions become common.

**SUGGESTION-2 (carried from round 1): `as const` casts in switch cases are unnecessary filler.**
`llm-client.ts` lines 211-218 and 293-303 use `return "end_turn" as const` etc. inside IIFEs that assign to `stopReason`. These `as const` assertions are technically unnecessary since TypeScript already infers string literal types from string literals in a const context. Harmless but filler.

### Adversarial

**WARNING-3 (carried from round 1, accepted by builder): Non-HTTP errors are not retried.**
The retry loop throws immediately for non-HTTP errors (network failures, timeouts). This is a design choice documented in the code. A DNS resolution failure or connection reset would crash the session on first occurrence rather than retrying. Noted for future improvement.

**SUGGESTION-1 (carried from round 1, not fixed, non-blocking): `runLoop` error is handled twice.**
The `.catch()` on `startSession`'s detached loop promise (line 261-270) duplicates the error handling already present in `runLoop`'s try/catch (lines 406-416). The outer `.catch()` only fires if the inner catch itself throws (e.g., `emitEvent` throws), which would produce a double error event. Low risk but redundant.

### Slop

**No new slop findings.** The biome suppression comment on `startSession` (line 193) is still slightly misleading but not wrong. The `@lore` comments added for the nullable config rationale (lines 57-61) and the tool_call skip logic in provisioning (lines 377-384, 540-547) are well-written and add genuine value.

---

## Test Results

All 33 tests pass (2 test files, 0 failures):
- `builtin-harness-adapter.test.ts`: 31 tests
- `X6-provisioning-integration.test.ts`: 2 tests

Typecheck: clean (0 errors).

---

## Phase 2 Critique Findings Verification (unchanged from round 1)

| Critique Finding | Addressed? | How? |
|---|---|---|
| CRITICAL: Context window uses latest inputTokens, not cumulative sum | **Yes** | `isAboveThreshold` takes `latestInputTokens`. Regression test present. |
| WARNING: Timeout on LLM calls | **Yes** | `fetchWithTimeout` with timer cleanup in both paths. |
| WARNING: Retry for transient failures | **Yes** | Retry loop with exponential backoff for 429/502/503. |
| WARNING: Tool defs from registry, not config.tools | **Yes** | `toolDefsFromRegistry()` calls `registry.toClaudeToolSpecs()`. |
| WARNING: resolvedModel null check | **Yes** | Guard in `startSession` throws if `resolvedModel` is undefined. |
