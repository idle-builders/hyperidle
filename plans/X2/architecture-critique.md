# Architecture Critique: X2

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:10 N:9 MD:8 FMC:7 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every AC from the workpackage spec maps to a plan task and a verification method. The tool count discrepancy (spec says 14, reality is 15) is caught in the reconciliation table and resolved. Task 7 (update architecture exclusion doc) is the only item not directly traced to an AC, but it is a forced dependency (the architecture doc currently contradicts this workpackage's existence).

Minor deduction: the spec AC says "An MCP server process starts alongside (or as part of) the HyperIdle server" -- the plan resolves the ambiguity (mounts on the existing Hono server) but does not call out that it made this choice. Not a gap, just worth noting.

### 2. Layer Integrity (9/10)

The MCP Bridge lives entirely within `packages/server` (Agent Runtime layer). No cross-layer violations. The bridge factory reads from `ToolRegistry` (same layer), writes `.mcp.json` to the workspace (same trust boundary), and the Hono route stays in the server package. The concept doc's positioning of the bridge at the Agent Runtime boundary is respected.

Minor deduction: the plan proposes reading `process.env.PORT || 3001` in the bridge factory as the "simpler" approach for the base URL (plan reconciliation row, Task 3 alternative). This couples the bridge to an environment variable rather than threading the port through the dependency graph. The plan offers both options and the correct one (`mcpBaseUrl` on `ProvisionSessionDeps`) is what Task 5/6 actually implement. The reconciliation table's "simpler" note should not survive to implementation -- it is the wrong choice.

### 3. API Contracts (8/10)

The MCP route is well-specified: `ALL /api/mcp/:token`, delegates to `bridgeRegistry.handleRequest(token, c.req.raw)`, returns `Response` from the transport. 401 for invalid tokens.

The `McpBridgeRegistry` interface is clean: `register`, `lookup`, `unregister`, `handleRequest`, `size`. The `McpBridgeInstance` and `CreateMcpBridgeOptions` types are precise.

The `BridgeConfig` (.mcp.json) shape is specified with exact field names and types.

Deductions:
- The plan does not specify what HTTP status code the MCP route returns for non-401 cases. The transport returns its own Response objects (which could be 200, 202, etc. per the MCP spec). This is fine -- it is delegated to the SDK -- but the plan should state "transport-owned response codes" explicitly so the builder does not add status code assertions that would break.
- The `handleRequest` on `McpBridgeRegistry` returns `Promise<Response>` but does not specify what happens if `transport.handleRequest()` throws. The registry should catch and return a 500, or let it propagate. Neither behavior is specified.

### 4. Data Model Alignment (10/10)

No new database tables or columns. The bridge is purely in-memory (Map keyed by token). The `.mcp.json` is a filesystem artifact scoped to the workspace. The concept explicitly says "no database tables, no state that survives a session." The plan respects this.

### 5. Naming (9/10)

`McpBridge`, `McpBridgeInstance`, `McpBridgeRegistry`, `createMcpBridge`, `createMcpBridgeRegistry` -- clear, consistent, honestly descriptive. The concept doc's vocabulary table is respected (no aliasing: "MCP Bridge" not "mcp-server" or "tool-server").

`toolResultToCallToolResult` is slightly verbose but self-documenting. The file layout (`packages/server/src/mcp/`) creates a clean module boundary.

Minor deduction: `mcp-bridge-registry.ts` could arguably just be `bridge-registry.ts` since it lives inside the `mcp/` directory, but the prefix-redundancy is a matter of taste, not a naming lie.

### 6. Module Depth (8/10)

The public surface is small: `createMcpBridge` (one function), `createMcpBridgeRegistry` (one function), `createMcpRoute` (one function). Three modules, three exports. The `McpBridgeRegistry` interface hides the Map, the transport lifecycle, and the cleanup logic behind 5 methods.

Deduction: `McpBridgeRegistry.handleRequest` combines lookup + delegation + 401-on-miss into one call, which is good depth. But `McpBridgeRegistry.lookup` is also exposed as a separate method. If `handleRequest` is the only way requests flow, `lookup` exists only for observability or testing. The plan should state whether `lookup` is needed by a caller or can be removed.

### 7. Failure-Mode Coverage (7/10)

This is the weakest dimension.

**What is covered well:**
- Security and abuse cases table addresses rate limiting, token brute-force, input trust boundary, secret handling, path traversal, SSRF, replay attacks, and the auth-bypass concern of mounting before auth middleware. Each is marked applicable/N-A with reasoning.
- Double validation (D7) is explicitly defended.
- Token entropy (256 bits) makes brute force infeasible.

**What is missing or underspecified:**

1. **Crash-path bridge cleanup.** The plan says Phase 11 calls `mcpBridgeRegistry.unregister(token)`. But looking at `session-provisioning.ts`, Phase 11 has TWO paths: `crashSession` (line 486) and `endSession` (line 496). The plan says "Phase 11: destroy bridge" but does not specify WHERE in the crash vs. normal paths the unregister call goes. If the bridge is only unregistered on the normal path, a crashed session leaks its bridge instance (and the token remains valid). This must be explicit: unregister BEFORE both `crashSession` and `endSession`.

2. **Transport/McpServer close() error handling.** `unregister()` calls `transport.close()` and `mcpServer.close()`. What if `close()` throws? The plan does not specify. Given this runs during teardown (possibly on the crash path), the close errors should be caught and logged, not propagated -- same pattern as `harness.stopSession` on the crash path (lines 455-469 in session-provisioning.ts).

3. **`.mcp.json` cleanup.** The plan writes `.mcp.json` to the workspace during Phase 8. On normal completion, the workspace is destroyed (line 501: `workspace.destroy(workspaceHandle)`), so the file disappears. On crash, the workspace is preserved for post-mortem. The `.mcp.json` file remains, containing a now-invalid token. This is not a security issue (the token is removed from the registry), but the plan should document this behavior explicitly so post-mortem tooling does not try to use the stale token.

4. **What happens if `createMcpBridge` fails?** Phase 8 extension creates the bridge after the registry is built. If bridge creation throws (e.g., `mcpServer.connect(transport)` fails), the session should continue without MCP (fall back to event-stream path). The plan does not specify this graceful degradation. The concept doc says "If the bridge process/transport fails, the session can continue via the event-stream fallback path" -- but the plan does not translate this into error handling at the integration point.

5. **Concurrent session token collision.** `crypto.randomBytes(32)` generates 256 bits of entropy. Collision is astronomically unlikely. But the plan does not check for collision before inserting into the Map. A defensive `if (map.has(token))` check costs nothing and prevents the theoretical duplicate-key overwrite. SUGGESTION level.

### 8. Simplicity / Over-Engineering Risk (8/10)

The design is appropriately simple. One transport per session, one Map for the registry, no database persistence, no token rotation, no multi-session routing. The "design-it-twice" section on bridge registry scope is genuine: Option B (Hono context) has a real trade-off (provisioner runs outside request context), and Option A wins on the merits.

Deductions:
- The plan identifies `OutputArgs` as a generic on `registerTool` but never uses output schemas. The type parameter exists in the SDK signature but is irrelevant here. Not over-engineering per se, but the plan should not mention it if it is not used.
- D6 claims "our `ToolDefinition.inputSchema` is `z.ZodType<Input>` (Zod 4)." This is inaccurate. `import z from "zod"` resolves to Zod v3 (the package's default export is `zod/v3/external`). The schemas are Zod v3 `ZodType` instances. The MCP SDK's `AnySchema` includes `z3.ZodTypeAny`, so the schemas ARE compatible -- but for v3 reasons, not v4 reasons. The plan's stated rationale is wrong even though the conclusion is correct. The builder could waste time debugging a phantom Zod v4 issue that does not exist. This should be corrected.

### 9. Verifiability (8/10)

Every AC has a named test file, a specific assertion, and a clear expected output. The verification methods are aligned with the codebase's test infrastructure (Vitest unit tests, Hono `testClient` / `app.request()` for integration). Protected tests are listed (session-provisioning.test.ts, tool-registry.test.ts).

Deductions:
- AC1 verification says "Assert the McpServer has 15 tools registered." How? The `McpServer` class does not expose a public tool count. The plan needs to specify the mechanism (e.g., calling `tools/list` via the transport, or inspecting `_registeredTools` which is private). Without this, the builder will either use an unsafe cast to access private state or discover the issue mid-implementation.
- AC5 verification says "Use `provisionSession` with a mock harness that immediately completes." This is an integration test that depends on the full provisioning pipeline including workspace materialization, database writes, and adapter pool wiring. The plan should note the test fixtures required or reference existing provisioning test patterns that the builder can extend.
- The task ordering is strictly sequential (1-6). Task 7 is independent. But the plan does not specify when tests are written relative to implementation. The red-green ordering (write test, then implement) is a project rule. The plan should either make this explicit per task or state that each task's test is written first.

---

## CRITICAL

None.

## WARNING

- **[plan, Reconciliation row "Port is known"]** The reconciliation table offers `process.env.PORT || 3001` as the "simpler" approach. This couples the bridge to an undocumented environment variable convention and diverges from the codebase's DI pattern (every other dep is threaded through `ProvisionSessionDeps`). The tasks correctly use `mcpBaseUrl` on deps. Remove the env-var alternative from the reconciliation table so the builder does not implement the wrong one.

- **[plan, D6]** The plan claims `ToolDefinition.inputSchema` is "Zod 4" and references `z4.$ZodType`. In reality, `import z from "zod"` in this codebase resolves to Zod v3. The schemas are `z3.ZodType` instances. They are compatible with the MCP SDK's `AnySchema` type because `AnySchema = z3.ZodTypeAny | z4.$ZodType`, and v3 ZodType is assignable to `z3.ZodTypeAny`. Correct the rationale: the compatibility is v3-based, not v4-based. The builder needs accurate information to debug type errors.

- **[plan, Task 6 / Failure-Mode Coverage]** The plan says bridge teardown happens at "Phase 11" but does not specify which teardown path. Session provisioning has two teardown paths: crash (line 486) and normal (line 496). The `mcpBridgeRegistry.unregister(token)` call must happen BEFORE both `crashSession()` and `endSession()`, or a crashed session leaks its bridge. Add explicit placement: "unregister bridge before crashSession/endSession in both the crash and normal paths."

- **[plan, Task 6 / Failure-Mode Coverage]** The plan does not specify error handling if `createMcpBridge` fails during Phase 8 extension. The concept doc says "the session can continue via the event-stream fallback path" on bridge failure, but the plan does not translate this into a try-catch at the integration point. A failed `mcpServer.connect(transport)` should log a warning and skip `.mcp.json` writing, not crash the session. Add: "wrap bridge creation in try-catch; on failure, log warning and proceed without MCP bridge."

## SUGGESTION

- **[plan, Task 3 / McpBridgeRegistry]** `McpBridgeRegistry.lookup` is exposed but no caller outside tests is identified. If `handleRequest` is the sole request-path entry point, consider removing `lookup` from the public interface and testing through `handleRequest`. Alternatively, document which caller needs it.

- **[plan, Task 3 / McpBridgeRegistry.unregister]** `unregister()` calls `transport.close()` and `mcpServer.close()`. These may throw during teardown (especially on crash path). Add: "close errors are caught and logged, not propagated" -- matching the existing `stopSession` crash-path pattern in session-provisioning.ts lines 455-469.

- **[plan, AC1 verification]** The plan says "Assert the McpServer has 15 tools registered." Specify the mechanism: call `tools/list` via the MCP protocol through the transport, or use the returned `RegisteredTool` handles from `registerTool()` calls. `McpServer._registeredTools` is private and should not be accessed.

- **[plan, Task ordering]** The project mandates red-green ordering (write failing test, then implement). The plan's task list does not make this explicit. Each task description includes both "Action" and "Test" but does not state which comes first. Add a note: "For each task, the test file is created first (red phase), then the implementation (green phase)."

- **[plan, D6 footnote]** The `registerTool` callback type when `InputArgs extends AnySchema` is `(args: SchemaOutput<AnySchema>, extra: RequestHandlerExtra) => CallToolResult | Promise<CallToolResult>`. The `extra` parameter is required by the callback signature. The plan's handler description omits `extra`. Ensure the builder knows the handler receives `(args, extra)`, not just `(args)`.

- **[plan, Reconciliation row ".mcp.json"]** The plan says `.mcp.json` at the repo root is `{ "mcpServers": {} }`. The workspace `.mcp.json` will have content. Clarify that the repo-root file is unrelated to the per-workspace file -- they serve different purposes and the bridge does not modify the root file.

---

## What's Working Well

- **Plan reconciliation table is thorough.** Every assumption is checked against the codebase. The "14 vs 15 tools" catch, the transitive-vs-direct dependency distinction, and the Phase 8/11 slot identification are exactly the kind of reality-check that prevents mid-implementation surprises.

- **Security analysis is substantive.** The abuse cases table covers 8 surfaces with specific reasoning for each. The token entropy calculation (256 bits), the timing oracle consideration (Map.get is O(1)), and the rate limiter coverage analysis show genuine adversarial thinking, not checkbox compliance.

- **Design-it-twice is genuine.** The bridge registry scope decision (module singleton vs Hono context) presents a real trade-off with a real winner. Option B fails because the provisioner runs outside HTTP context -- this is a codebase-specific insight, not a generic argument.
