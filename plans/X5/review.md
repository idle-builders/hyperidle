# X5 Code Review: Multi-Harness Adapter Layer

**Verdict: DONE**

All 7 acceptance criteria are met. The implementation faithfully follows the architecture plan, addresses 3 of 4 Phase 2 warnings satisfactorily, and introduces no regressions. Test coverage is specific and meaningful. Minor findings below are suggestions, not blockers.

---

## AC Completeness

| AC | Status | Evidence |
|----|--------|----------|
| AC1: HarnessAdapter interface unchanged | PASS | `startSession`, `streamEvents`, `stopSession`, `getCapabilities` signatures unchanged. `McpConnectionInfo` and `mcpConnectionInfo?` added to adjacent types, not the interface methods. Type system enforces this. |
| AC2a: Claude SDK adapter exists | PASS | `claude-agent-sdk-adapter.ts` unchanged except `mcpSupport: true` added to capabilities. |
| AC2b: CLI adapter | PASS | `cli-harness-adapter.ts` — 440 lines, fully implements HarnessAdapter. 35 unit tests cover template resolution, spawn, streaming, stop escalation, ENOENT. |
| AC2c: Built-in adapter stub | PASS | `builtin-harness-adapter.ts` — stub throws "not yet implemented (see X6)" on all session methods. 7 unit tests. |
| AC3: Pool selects by harnessType | PASS | `adapter-pool.ts` registers each adapter with distinct `type`. Pool.select filters by `harnessType`. Tests in `X5-adapter-pool-multi.test.ts` confirm selection for "claude-code", "builtin", and custom types. |
| AC4: SessionConfig standardized | PASS | `SessionConfig` includes `workspacePath`, `composedPrompt`, `mcpConnectionInfo?`, `resolvedModel?`, `modelTier`, `tools`. Type-checked. Tests in `X5-session-config-mcp.test.ts` verify construction. |
| AC5: MCP adapters include connection info | PASS | `session-provisioning.ts` passes `mcpConnectionInfo` to `startSession` when bridge token exists. CLI adapter resolves `{{mcpUrl}}` from it. |
| AC6: Non-MCP adapters fall back to event-stream | PASS | `interceptToolCalls = !(mcpSupport && mcpBridgeToken)` — when either condition fails, tool_call events are dispatched to registry. 7 tests verify the formula with all adapter combinations. |
| AC7: New adapters via register only | PASS | Two new adapters added with zero changes to `provisionSession()`. Tests demonstrate registering arbitrary adapters and selecting them. |

---

## Phase 2 Warning Disposition

| Warning | Status | Assessment |
|---------|--------|------------|
| W1: `@lore` on spawn args security boundary | ADDRESSED | Two `@lore X5 W1` annotations: one at the module level (lines 9-14) documenting why array form is critical, one at the spawn call (line 170). |
| W2: ENOENT → clear "binary not found" error | ADDRESSED | Lines 219-242: checks `child.pid === undefined`, awaits error event, catches ENOENT specifically, throws descriptive message. Test at line 291 confirms. |
| W3: Verify Claude SDK MCP behavior | PARTIALLY ADDRESSED | Comment at line 238-240 asserts Claude Code reads .mcp.json. However, no `@lore` tag (just a plain comment), and the assertion remains unverified — the comment states it as fact without citing documentation or test evidence. |
| W4: Test contracts must be specific | ADDRESSED | Tests assert specific values (resolved args contain "/workspace/test-123", env contains "sk-test-key", SIGKILL after 5s, exit code 0 maps to "completed"), not just `toBeDefined()`. |

---

## Lens 1: Architecture (Positive)

The implementation respects all structural contracts:

- **Layer integrity:** All new code lives in `packages/server` (Meta Layer) for adapters and `packages/shared` for types. No cross-layer violations.
- **API contract:** `HarnessAdapter` interface signature is byte-for-byte unchanged. The 4-method interface remains stable.
- **Data model:** `McpConnectionInfo` is runtime-only (no schema changes). `HarnessCapabilities.mcpSupport` is a required boolean — all 6 adapters updated.
- **Module boundaries:** `createLocalAdapterPool()` is the single factory; `provisionSession()` is adapter-agnostic. Adding CLI adapters required zero changes to the orchestrator.
- **Plan fidelity:** Every task in the architecture plan's ordering (Phases 1-6) is implemented. No scope creep.

---

## Lens 2: Design (Positive)

No UI changes in this workpackage. N/A.

---

## Lens 3: Security (Positive)

- **Env sandboxing:** `buildSandboxedEnv` only forwards allowlisted vars. No `...process.env` spread. Test at line 319 confirms secrets like `HYPERIDLE_SECRET` and `DATABASE_URL` are not forwarded.
- **Shell injection:** `spawn(binary, resolvedArgs, ...)` uses array form (no `shell: true`). Security boundary documented with `@lore`. Test at line 243 verifies `options.shell` is falsy.
- **API key exposure:** Keys flow through `envMap` template resolution, never hardcoded in args. Sandboxed env is a fresh object, not a mutation of `process.env`.
- **Process escalation:** SIGTERM → 5s → SIGKILL mirrors IsolatedHarnessAdapter's established pattern.
- **ENOENT handling:** Specific error catch prevents cryptic stack traces from leaking internal paths.

---

## Lens 4: Adversarial (Negative)

### F1: `parseStdoutLine` trusts parsed JSON as HarnessEvent without runtime validation

**File:** `cli-harness-adapter.ts:357-366`

The NDJSON parser checks that the parsed object has a string `type` field, then casts it directly to `HarnessEvent`. A malicious or buggy CLI tool could emit `{"type": "cost_update", "deltaCost": -999999}` which would pass the type guard and be yielded to the provisioner's event loop.

The provisioner has a defensive clamp (`Math.max(0, event.deltaCost)` at line 494) which prevents negative cost injection. But other event types (e.g., `tool_call` with arbitrary `args`) would pass through. Since the MCP bridge handles actual tool invocation for CLI adapters (`mcpSupport: true`), and `interceptToolCalls` would be false, the injected tool_call wouldn't be invoked — it would only appear in observability. Risk: **low**.

### F2: Module-level mutable `nextId` counter is not isolated per-adapter

**File:** `cli-harness-adapter.ts:114`

`let nextId = 1` is module-level, shared across all `CliHarnessAdapter` instances. This isn't a correctness bug (session IDs just need uniqueness within the adapter, and the prefix `cli-session-` distinguishes them), but it means session IDs leak information about total CLI session count across all adapter instances. Impact: **negligible** — this is an internal implementation detail not exposed to users.

### F3: No stdin handling — CLI tool gets a pipe but nothing is written to it

**File:** `cli-harness-adapter.ts:172`

`stdio: ["pipe", "pipe", "pipe"]` creates a writable stdin pipe, but nothing ever writes to it or closes it. Some CLI tools (e.g., Aider) read from stdin for interactive commands. If a tool blocks waiting for stdin input, the session would hang until the maxDuration timeout kills it. Mitigation: `stopSession` has SIGTERM/SIGKILL escalation. Risk: **low** — provisioning has overall timeout.

---

## Lens 5: Simplification (Negative)

### S1: `CliAvailabilityDeps` interface is separate from `CliAdapterDeps`

Two nearly-identical dep injection interfaces exist when one could suffice. However, `checkAvailability` is a static method while the constructor takes `CliAdapterDeps`, so the separation is structurally necessary. No action needed.

### S2: Template variable type is over-specified

`type TemplateVar = "{{workspace}}" | "{{model}}" | "{{apiKey}}" | "{{baseUrl}}" | "{{mcpUrl}}"` at line 29 exists but is only used in the `resolveTemplates` function's parameter type and in the cast at line 90. The type provides documentation value but the cast `as [TemplateVar, string][]` is the price paid. Acceptable tradeoff for v1.

---

## Lens 6: AI Slop (Negative)

### No significant slop patterns detected.

- No `=== true` comparisons.
- No single-use helper functions that add no clarity.
- No unnecessary async (biome-ignore comments are applied to interface-required async methods that legitimately cannot await — this is the correct pattern used throughout the codebase).
- No "TODO: implement" on implemented code.
- No verbose variable names that add no information.
- Comments explain _why_, not _what_.

---

## Findings Summary

| # | Severity | Finding |
|---|----------|---------|
| F1 | Low | NDJSON parser trusts parsed JSON shape beyond `type` field check — could yield malformed events. Mitigated by provisioner's defensive clamps. |
| F2 | Negligible | Module-level `nextId` shared across adapter instances. Not a correctness or security issue. |
| F3 | Low | Stdin pipe opened but never written/closed. CLI tools expecting interactive input will hang until timeout. |
| W3 | Note | Claude SDK MCP behavior claim (line 238-240) should be a `@lore` annotation for discoverability, and should cite evidence (SDK docs or test observation). |

None of these findings are blocking. The implementation is sound, well-tested, and faithful to the architecture plan.

---

## Final Assessment

The X5 workpackage delivers exactly what was planned: two new adapter implementations, expanded type definitions, adapter pool registration, and conditional tool interception in the provisioner. The code is clean, well-documented with `@lore` annotations, and covered by 62 specific tests. All existing tests were updated to include `mcpSupport` in their capability objects without behavioral changes. The async `createLocalAdapterPool()` signature change propagated correctly to all call sites.
