# Architecture Critique: X6

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:7 LI:9 AC:8 DM:9 N:9 MD:8 FMC:6 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (7/10)

Every AC from the spec maps to a plan task and has a verification section (AC-1 through AC-15). The plan does not invent requirements beyond the spec's scope. Two issues:

- The spec explicitly depends on X2 (MCP Bridge): "must set up MCP for consistency with the workspace contract." The plan's reconciliation table and task list make zero mention of MCP. The provisioning orchestrator already handles MCP bridge creation in Phase 8b regardless of adapter type, so no *new* code is needed, but the plan should have reconciled this dependency explicitly in the reconciliation table to document that the existing provisioning handles it.

- The spec's validation scenario says "the first agent turn produces a plan written to `work/task-notes.md` before any tool calls are made." The plan allows tool calls during the planning turn for context gathering (lines 340-341: "If response has tool calls -> execute them (context gathering)"). This contradicts the validation scenario's "before any tool calls are made." The concept document (section Lifecycle, point 2) also says "Tool calls during the planning turn are permitted." The plan follows the concept, but both concept and plan contradict this specific validation scenario. The builder should follow the plan's behavior (tool calls allowed during planning) since it's the more rational design, but the discrepancy should be documented.

### 2. Layer Integrity (9/10)

Clean. The built-in harness lives in `packages/server/src/harness/` (Meta Layer). It calls downward into the model gateway (resolution) and outward to LLM APIs (execution), and into the tool registry (skill-tools). No layer violations. The harness correctly does not reach into `packages/web` or `packages/db` directly -- tool execution goes through the registry, which has the DB access.

### 3. API Contracts (8/10)

No new HTTP routes are introduced (correct -- the harness is internal). The `callLlm` function's contract is well-specified with request/response formats for all three providers in the wire format mapping table. The `BuiltinHarnessAdapter` class signature is complete with all method signatures. The `LlmResponse` type is precisely specified.

Minor: The OpenRouter endpoint is listed as `{baseUrl}/v1/messages` in the wire format mapping table (line 161), but `resolveModelTier` for OpenRouter returns `baseUrl: "https://openrouter.ai/api"`. So the actual endpoint would be `https://openrouter.ai/api/v1/messages`. This is correct -- OpenRouter's Anthropic-compatible endpoint is at `/api/v1/messages`. Good.

### 4. Data Model Alignment (9/10)

No schema changes. The only shared type change is adding `resolvedFastModel?: ResolvedModel` to `SessionConfig` -- additive optional field, no migration. The plan correctly identifies all call sites that construct `SessionConfig` and confirms no changes needed due to optionality. Clean.

### 5. Naming (9/10)

Names are honest and consistent. `BuiltinHarnessAdapter` matches the concept vocabulary. `LlmMessage`, `LlmResponse`, `LlmToolDef` are descriptive without being generic. `callLlm` is a function name that eliminates a paragraph of doc. `contextWindowForModel` and `isAboveThreshold` are clear. The concept's vocabulary table is respected throughout. No naming conflicts with existing primitives.

### 6. Module Depth (8/10)

Good module depth. The public surface is small: `callLlm()` hides Anthropic/OpenAI format normalization. `BuiltinHarnessAdapter` exposes only the `HarnessAdapter` interface plus `setSessionToolRegistry`. Three files (`llm-types.ts`, `llm-client.ts`, `context-window.ts`) keep the main adapter file focused.

`setSessionToolRegistry` is a method on the concrete class, not the interface -- this is documented and justified (line 286-289: "The provisioning orchestrator casts to BuiltinHarnessAdapter when meta.type === 'builtin'"). The cast is a slight smell but acceptable given the session-scoped registry constraint.

### 7. Failure-Mode Coverage (6/10)

This is the weakest dimension.

**CRITICAL: Context window tracking is fundamentally wrong.** The plan uses `session.totalInputTokens += response.usage.inputTokens` as a cumulative counter (line 487). But `response.usage.inputTokens` from the API reflects the total tokens in *that specific request* (the full conversation sent to the LLM), not an incremental delta. Summing these across calls produces a number roughly proportional to `N * averageContextSize` (where N is the number of calls), not the actual current context window usage. A session with 5 calls each sending 40k tokens would report 200k cumulative input tokens, triggering pre-compaction at the 80% threshold even though the actual context is only ~40k tokens. The `isAboveThreshold` function compares this cumulative total against the context window, which is incorrect. The correct signal for context window pressure is the *most recent* `response.usage.inputTokens`, not the cumulative sum.

**WARNING: No timeout on LLM API calls.** The plan specifies that `callLlm` "throws on HTTP errors (non-2xx) or network failures" but does not specify a timeout for HTTP requests. A hung LLM provider connection would block the session loop indefinitely. The plan should specify a per-call timeout (e.g., 120s) and a total session timeout.

**WARNING: No retry strategy for transient LLM failures.** The plan's error path (line 388-390) catches any error and terminates the session. A single transient 429 (rate limit) or 503 (overloaded) from the LLM provider crashes the entire session. The plan should specify retry-with-backoff for transient HTTP errors (429, 502, 503) vs immediate failure for permanent errors (400, 401, 403).

**OK: Security block is thorough.** Rate limiting, input trust boundaries, secret handling, path traversal, SSRF, and max-iterations bypass are all addressed with clear resolutions.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is well-scoped. No abstract base classes, no plugin points, no feature flags. The cost estimation table is pragmatic (acknowledged as approximate). The summarization strategy (sliding window + LLM-generated summary) is the simplest approach that works.

Minor concern: the `estimateCost` function with hardcoded pricing tables feels like it will rot. But the plan acknowledges this ("Updated as pricing changes") and the cost_update events are informational only, so accuracy is non-critical.

### 9. Verifiability (8/10)

Every AC (1-15) has a concrete verification method with specific assertions. Test names aren't provided but verification strategies are detailed (e.g., AC-2: "Mock LLM returns a plan text on first call -> assert completion event contains plan text"). The protected-tests block is populated (empty, correctly -- no existing tests are modified). Tests are ordered before implementation in the task list (context-window tests in Task 2, llm-client tests in Task 3, adapter tests in Task 5).

Minor: AC-15 (provisioning orchestrator integration) says "integration test: provision a session targeting the built-in harness, assert no double tool execution." This is underspecified -- how do you assert "no double execution" when tool_call events are still emitted? The test would need to verify the tool registry is called exactly once per tool call, not twice. The verification could be more precise about the assertion mechanism (mock registry call count).

---

## CRITICAL

1. **[plan section D, lines 486-492] Context window tracking uses cumulative input tokens instead of per-call input tokens.** `session.totalInputTokens += response.usage.inputTokens` accumulates across all LLM calls. But `response.usage.inputTokens` is the total input tokens for *that call* (the full conversation), not a delta. Pre-compaction will trigger after ~5 calls regardless of actual context size. **Fix:** Track the *most recent* `response.usage.inputTokens` as the context pressure signal. `isAboveThreshold` should compare the last call's `inputTokens` against the context window, not the cumulative sum. Keep the cumulative counter for cost tracking and `token_usage` events, but use a separate `lastInputTokens` field for context window management.

## WARNING

2. **[plan section B/detailed design, callLlm signature lines 151-153] No timeout specified for LLM HTTP calls.** A hung provider connection blocks the session loop with no upper bound. **Fix:** Add a `timeout` option to `CallLlmOptions` (default 120000ms) and apply it to the `fetch` call. Document that the session's total wall-clock time is bounded by `maxIterations * timeout`.

3. **[plan section A, error path lines 388-390] No retry for transient LLM failures.** A single 429/503 crashes the session. **Fix:** Add retry-with-exponential-backoff for HTTP status codes 429, 502, 503 (max 3 retries, base delay 1s). Immediate failure for 400, 401, 403, 404. Document this in the `callLlm` contract.

4. **[plan reconciliation table, line 34] Missing X2 (MCP Bridge) dependency reconciliation.** The spec says X6 depends on X2: "must set up MCP for consistency with the workspace contract." The plan's reconciliation table does not address this. **Fix:** Add a row: `X2 dependency (MCP Bridge) | Session provisioning Phase 8b already creates MCP bridge for all adapter types | No additional code needed in the built-in harness. MCP bridge is set up by the provisioning orchestrator, not the adapter.`

5. **[plan section A, line 331] Tool definitions sourced from `config.tools` but `config.tools` is `readonly string[]`.** The pseudocode says "Tool definitions from config.tools -> converted to LlmToolDef[]" but `SessionConfig.tools` is an array of tool *names* (strings), not definitions. The actual definitions come from `registry.toClaudeToolSpecs()` via the injected `ToolRegistry`. **Fix:** Update the pseudocode to: "Tool definitions from registry.toClaudeToolSpecs() -> converted to LlmToolDef[]". This also means `startSession` cannot build tool defs until `setSessionToolRegistry` has been called -- the plan already requires this ordering (line 280) but the pseudocode contradicts it by sourcing from `config.tools`.

6. **[plan section D, line 490] `config.resolvedModel` accessed without null check.** `SessionConfig.resolvedModel` is `ResolvedModel | undefined`. The plan accesses `session.config.resolvedModel.model` in the context window check (and presumably in `callLlm` calls). **Fix:** Document in the `startSession` contract that the built-in harness requires `resolvedModel` to be present and throws on `startSession` if it's `undefined`. This is already implied by the design but should be an explicit guard.

## SUGGESTION

7. **[plan section F, lines 601-608] Cost estimation table has stale model IDs.** The table includes `claude-haiku-3-5-20241022` but not `claude-haiku-4` or future models. Consider using the same model ID source as `MODEL_CONTEXT_WINDOWS` or sharing a single model metadata table that includes both context window and pricing. Not critical since the default fallback covers unknown models.

8. **[plan section C, lines 439-479] Reflection checkpoint tool calls increment `toolCallCount` but this is not addressed.** If the model makes tool calls during a reflection (which the plan allows, lines 472-478), those tool calls increment `toolCallCount`, which could trigger another reflection immediately. Consider whether reflection-turn tool calls should be excluded from the checkpoint counter, or document that this cascading behavior is intentional.

9. **[plan section D, lines 548-559] Summarization preserves 6 messages (3 user-assistant pairs) but counts from the end.** If the last few messages include tool_result blocks (which are user-role messages), the "last 3 pairs" may not represent 3 complete semantic turns. Consider preserving by semantic turns rather than raw message count, or document the simplification as acceptable for v1.

---

## What's Working Well

- **Plan reconciliation table is excellent.** Every assumption is checked against the codebase with a resolution. This catches drift before code is written. The format should be adopted by other workpackages.

- **Provisioning integration design (section G) is precise and minimal.** The plan identifies exactly two changes needed in `session-provisioning.ts` (Phase 8.5 registry injection + Phase 10 tool_call skip) and specifies the conditional logic at the code level. This gives the builder zero ambiguity.

- **Security block is thorough and honest.** Each STRIDE concern is marked applicable/N/A with a clear resolution or delegation (e.g., path traversal is the tool's responsibility, not the harness's). No hand-waving.
