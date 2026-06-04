# Architecture Critique: X5

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:9 DM:10 N:9 MD:9 FMC:7 S:8 V:7

## Dimension Scores

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Spec Alignment | 9 | All 7 ACs mapped to tasks with verification methods. No scope creep. Minor: AC4 spec says "host:port or socket path" but plan only provides full URL — acceptable since the URL is a superset. |
| 2 | Layer Integrity | 10 | Clean. All changes in Meta Layer (server) and shared types (shared). CLI adapter spawns Agent Runtime processes from Meta Layer — correct direction. No cross-layer violations. |
| 3 | API Contracts | 9 | No new HTTP routes. All internal interfaces fully typed (McpConnectionInfo, CliAdapterConfig, SessionConfig expansion). The CliAdapterConfig type is well-structured. |
| 4 | Data Model Alignment | 10 | No schema changes needed. Correctly identifies harnessType as existing text column from X3. McpConnectionInfo is runtime-only. |
| 5 | Naming | 9 | Consistent with existing adapter naming. Self-correction on per-tool type registration (from generic "cli" to "aider"/"goose"/"opencode") is good. Vocabulary table is clear. |
| 6 | Module Depth | 9 | CliHarnessAdapter is a deep module: 4-method interface hides subprocess management, template resolution, env sandboxing, event parsing. Parameterized design (one class + N configs) is the right call. |
| 7 | Failure-Mode Coverage | 7 | Six failure modes documented. Gaps identified below (WARNING items). |
| 8 | Simplicity | 8 | Three genuine trade-off analyses. Self-critique is honest. One minor over-engineering concern noted below. |
| 9 | Verifiability | 7 | Test files named, verification methods listed per AC. But test assertions are not specific enough — "unit tests" is not a contract. |

---

## CRITICAL

None.

---

## WARNING

### W1: [plan, "CliHarnessAdapter design" / "startSession flow"] Template variable injection is not validated for shell-unsafe content

The plan resolves template variables like `{{workspace}}`, `{{model}}`, `{{apiKey}}` by direct string substitution into args and envMap values. These values come from DB columns (workspace path from provisioning, model/apiKey from ResolvedModel). The plan does not specify input validation on the resolved values before they are passed to `child_process.spawn`.

While `spawn` with an args array (not a shell string) is safe against shell injection, the plan should explicitly note this mitigation and document that the args array form is load-bearing for security. If a future developer changes `spawn` to `exec` (string form), the template injection becomes an RCE vulnerability.

Fix: Add a security note in the CliHarnessAdapter design section stating that `child_process.spawn` with explicit args array (no `shell: true`) is the security boundary for template variables. Add a `@lore` annotation requirement in the task list.

### W2: [plan, "Failure modes"] Missing failure mode: CLI binary exists at registration but disappears before startSession

The plan checks binary availability at registration (`checkAvailability`) but does not address the TOCTOU gap: the binary could be uninstalled or moved between registration and session start. When `spawn` fails with ENOENT, the plan's generic "CLI process crashes" path would catch it (non-zero exit / error event), but this specific failure mode should be documented since the error message from `spawn` ENOENT is cryptic and the adapter should translate it to a clear "binary not found" error.

Fix: Add failure mode 7: "CLI binary removed after registration" with the mitigation being a specific ENOENT catch in startSession that produces a clear error message.

### W3: [plan, "Session provisioning changes" / "Conditional tool_call interception"] The interception logic changes existing behavior for Claude SDK adapter

The plan adds `mcpSupport: true` to ClaudeAgentSdkAdapter. The provisioning code currently unconditionally invokes `registry.invoke(event.toolName, event.args)` for every `tool_call` event (line 518 of session-provisioning.ts). With the plan's change, when `mcpSupport === true && mcpBridgeToken !== undefined`, tool_call events would be skipped. This means the Claude SDK adapter's tool calls would NO LONGER be handled via event-stream interception when an MCP bridge is active.

The plan assumes this is correct ("the actual invocation already happened via MCP before the event was emitted"), but the current ClaudeAgentSdkAdapter does NOT use MCP for tool calls. It uses the Claude Agent SDK's built-in tool execution which emits tool_call events in the stream. The SDK's `query()` function handles tool_use blocks internally and the tool_call events in the stream are informational. The plan's assumption is only valid if the Claude Agent SDK actually connects to the MCP bridge via .mcp.json at startup.

This needs verification: does the Claude Agent SDK read .mcp.json and route tool calls through MCP when a bridge is present? If yes, the plan is correct. If no, setting `mcpSupport: true` for ClaudeAgentSdkAdapter would silently break tool handling.

Fix: The plan must document the Claude SDK's MCP behavior explicitly. If the SDK reads .mcp.json and routes tool calls through MCP (making event-stream tool_call events informational only), document this with a @lore note. If it does not, ClaudeAgentSdkAdapter.getCapabilities() should return `mcpSupport: false` and the .mcp.json file serves only Claude Code's own MCP client (separate from our event-stream interception).

### W4: [plan, "Verifiability" / "Phase 6: Tests"] Test contracts are too vague

The plan names 4 test files but does not specify what assertions they contain. "Unit tests" for the CLI adapter could mean anything from "constructor doesn't throw" to "full lifecycle with mock subprocess." The plan should specify the key assertions per test file so the builder has a clear target.

Specifically:
- `X5-cli-harness-adapter.test.ts`: What does it test? Template resolution? Subprocess spawn with mock? Event parsing (ndjson and text modes)? SIGTERM/SIGKILL escalation?
- `X5-session-config-mcp.test.ts`: What does it test? That mcpConnectionInfo flows through? That the conditional interception works?

Fix: Add 2-3 key assertion descriptions per test file in the "Phase 6: Tests" section.

---

## SUGGESTION

### S1: [plan, "createLocalAdapterPool() changes"] Async registration timing should be explicit

The plan's self-critique correctly identifies that `createLocalAdapterPool` becomes async due to CLI binary checks. The plan says "make createLocalAdapterPool async and update server-factory.ts (it's already in an async function). Cost: 2-3 call sites updated." But the plan does not list these call sites in the task ordering. The builder will need to find them.

Fix: Add the call sites to the "Phase 4: Registration" task list: `server-factory.ts` (line 123), and the two test files that call `createLocalAdapterPool` directly (`X3-adapter-pool-type.test.ts` line 259, `adapter-pool-integration.test.ts` line 247).

### S2: [plan, "CliHarnessAdapter design" / "stopSession flow"] SessionResult cost is always zero for CLI adapters

The plan says "Return SessionResult with zero cost/tokens (CLI tools don't report these through our channel)." This means sessions run via CLI adapters will show $0.00 cost in the UI, which is misleading to the founder. The cost is real (the CLI tool is spending API credits) but invisible to HyperIdle's cost tracking.

This is acceptable for v1 but should be documented as a known limitation in the plan, not just implied.

### S3: [plan, "CliHarnessAdapter design" / "Constructor and registration"] envAllowlist overlaps with envMap

The plan has both `envAllowlist` (forwarded from host process.env) and `envMap` (template-resolved values). The interaction between them is not specified: does envMap override envAllowlist entries? What if both set `ANTHROPIC_API_KEY`? The plan should specify merge order: envAllowlist first, then envMap overrides.

### S4: [plan, "Task ordering"] No explicit task for updating the harness/index.ts barrel export

Phase 1 task 4 says "Export McpConnectionInfo from harness/index.ts" but the file plan table says the same thing for the modified files. This is fine but make sure it also exports the updated HarnessCapabilities type (which gains mcpSupport). Currently it already exports HarnessCapabilities so no change is needed — but the plan should confirm this explicitly rather than leaving it implicit.

---

## What's Working Well

1. **Self-correcting design.** The plan caught its own error about CLI adapter type registration (`type: "cli"` vs per-tool types) and corrected it in-place with reasoning. This is rare and valuable — it shows the architect is adversarially reviewing their own work.

2. **Trade-off analyses are genuine.** All three design-it-twice sections (template vars vs config files, parameterized vs per-tool classes, mcpSupport flag vs separate interface) have real alternatives with honest evaluation. None are straw-manned.

3. **Backward compatibility analysis is thorough.** The plan explicitly calls out that `mcpSupport: boolean` is intentionally required (not optional) on HarnessCapabilities, explains why (load-bearing for provisioner), and counts the cost (5 files updated). This is exactly the kind of impact analysis that prevents silent regressions.
