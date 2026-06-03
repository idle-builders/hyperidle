# X2 -- MCP Bridge for Skill-Tools: Code Review

REVIEW-VERDICT: **NOT DONE** (1 WARNING, 2 SUGGESTION — WARNING must be addressed before ship)

---

## Lens 1: Architecture (positive)

### Layer integrity

All new code lives in `packages/server` (Agent Runtime layer). No cross-layer violations. The MCP bridge module (`packages/server/src/mcp/`) imports only from `@modelcontextprotocol/sdk`, `../skill-tools/`, and Node builtins. The route module imports only from `../mcp/` and `hono`. No upward dependencies into Human Interface or Meta Layer packages.

### API contracts match the plan

| Plan contract | Implementation | Status |
|---|---|---|
| `McpBridgeInstance` (token, sessionId, mcpServer, transport) | `mcp-bridge.ts` lines 18-23 | Match |
| `McpBridgeRegistry` (register, lookup, unregister, handleRequest, size) | `mcp-bridge-registry.ts` lines 14-25 | Match |
| `createMcpBridge(options): Promise<McpBridgeInstance>` | `mcp-bridge.ts` line 76 | Match |
| `createMcpBridgeRegistry(): McpBridgeRegistry` | `mcp-bridge-registry.ts` line 36 | Match |
| `createMcpRoute(bridgeRegistry): Hono` | `mcp-route.ts` line 19 | Match |
| Route `ALL /api/mcp/:token` mounted before auth middleware | `app.ts` lines 319-323 | Match |
| `ProvisionSessionDeps.mcpBridgeRegistry` and `mcpBaseUrl` (optional) | `session-provisioning.ts` lines 189-192 | Match |
| Bridge config `.mcp.json` shape: `{ mcpServers: { hyperidle: { type: "http", url }}}` | `session-provisioning.ts` lines 389-395 | Match |

### Architecture decisions (D1-D7)

| Decision | Implementation | Correct? |
|---|---|---|
| D1: Stateless transport (`sessionIdGenerator: undefined`) | `mcp-bridge.ts` line 85 | Yes |
| D2: 64-char hex token from `crypto.randomBytes(32)` | `mcp-bridge.ts` line 80 | Yes |
| D3: One McpServer + transport per session | `mcp-bridge.ts` line 76-114 | Yes |
| D4: ToolResult to CallToolResult mapping | `mcp-bridge.ts` lines 37-53 | Yes |
| D5: Server-scoped singleton registry | `server-factory.ts` line 128, threaded through deps | Yes |
| D6: Zod schemas passed directly to registerTool | `mcp-bridge.ts` line 102 | Yes |
| D7: Double validation intentional | `mcp-bridge.ts` line 105 calls `registry.invoke` which re-validates | Yes |

### Plan reconciliation items addressed

| Item | Resolution |
|---|---|
| `mcpBaseUrl` on deps, not `process.env.PORT` | `server-factory.ts` line 129: `http://localhost:${port}` | Correct |
| Zod v3 vs v4 (critique warning) | The project is on Zod 4 (`^4.3.6`). The `@lore D6` comment correctly states "z4.$ZodType". The critique's v3 warning was wrong — the project migrated to Zod 4 before X2. |
| `@modelcontextprotocol/sdk` as direct dependency | `package.json` line 26: `"@modelcontextprotocol/sdk": "^1.29.0"` | Correct |

### File layout matches plan

```
packages/server/src/mcp/
  mcp-bridge.ts              -- createMcpBridge, McpBridgeInstance, toolResultToCallToolResult ✓
  mcp-bridge-registry.ts     -- createMcpBridgeRegistry, McpBridgeRegistry ✓

packages/server/src/routes/
  mcp-route.ts               -- Hono route: ALL /api/mcp/:token ✓

packages/server/src/__tests__/
  mcp-bridge.test.ts         -- 12 tests ✓
  mcp-bridge-registry.test.ts -- 17 tests ✓
  mcp-route.integration.test.ts -- 10 tests ✓
```

Architecture lens: **PASS**

---

## Lens 2: Design

Skipped — no UI surface in this workpackage.

---

## Lens 3: Security

### STRIDE analysis

| Threat | Assessment |
|---|---|
| **Spoofing** | Token is 256-bit random (brute-force infeasible). Written to workspace filesystem (same trust boundary). Not exposed in error responses. |
| **Tampering** | MCP tool args validated twice: MCP SDK via Zod safeParse, then `registry.invoke()` via safeParse. No way to bypass. |
| **Repudiation** | Tool calls through MCP emit `tool_call_recorded` events (Phase 10 only, not Phase 8b MCP path). MCP-invoked tools do NOT emit `tool_call_recorded` — see finding below. |
| **Information Disclosure** | Token not logged. Error responses contain only `Unauthorized` (401) or tool-level error codes (FORBIDDEN, NOT_FOUND). No stack traces leaked. |
| **Denial of Service** | Rate limiter covers `/api/*` (mounted before MCP route at `app.ts` line 248-258). MCP route is at `/api/mcp/:token`. |
| **Elevation of Privilege** | Role-based filtering enforced by `registry.invoke()` which returns FORBIDDEN for cross-role calls. Double validation prevents bypass. |

### Auth bypass check

The MCP route (`/api/mcp/:token`) is mounted at `app.ts` line 322, BEFORE the auth middleware at line 332. This follows the same pattern as WebSocket routes (line 310) and worker WS routes (line 316). The session token in the URL IS the authentication mechanism. Unknown tokens return 401 from `handleRequest`.

### Rate limiting

The global rate limiter at line 248-258 covers `/api/*`. The MCP route is at `/api/mcp/:token`, which falls under this wildcard. No additional rate limiter needed per the security analysis.

### Secret handling

The session token is:
- Generated via `crypto.randomBytes(32)` (256 bits) — not predictable
- Written to `<workspace>/.mcp.json` — same trust boundary as the workspace
- Not logged (no `console.log` or observability emit for the token value)
- Removed from the registry at Phase 11 (before endSession/crashSession)

### Path traversal

`.mcp.json` is written via `path.join(workspacePath, ".mcp.json")` at `session-provisioning.ts` line 387. The `workspacePath` is provided by the workspace adapter (already validated). No user-controlled path components.

Security lens: **PASS** (with one observation about audit trail — see AC completeness)

---

## Lens 4: Adversarial

### The Saboteur

**MCP bridge unregister can crash teardown.** `mcp-bridge-registry.ts` line 58: `await instance.mcpServer.close()` is not wrapped in try-catch. If `close()` throws (e.g., transport already closed, network error), the exception propagates through `session-provisioning.ts` line 532. This blocks Phase 11 teardown: neither `crashSession` nor `endSession` runs. The session row stays `active` in the database permanently. The adapter pool slot is released (line 509/517), but the session state is corrupted.

This is the exact scenario I flagged as SUGGESTION in the architecture critique ("close errors are caught and logged, not propagated — matching the existing `stopSession` crash-path pattern"). The builder did not address it.

**Severity: WARNING.** The same `stopSession` crash-path in the same file (line 497-507) has explicit try-catch for exactly this reason. The MCP teardown should match.

**Silent bridge creation failures.** `session-provisioning.ts` line 397: the `catch` block is empty (comment-only, no logging). If bridge creation fails, there is zero signal. The session continues in fallback mode, but diagnosing WHY MCP is not working for a given session requires reading the provisioning code and reasoning about the absence of `.mcp.json`. A `console.warn` matching the existing pattern at line 505 would make failures observable.

**Severity: SUGGESTION.** Consistent with existing patterns in the same function.

### The New Hire

**10-second understanding.** The `@lore` comments are well-placed and explain non-obvious decisions (stateless transport, double validation, transitive close, crash-path cleanup). A new developer can understand the design decisions quickly.

**`eslint-disable @typescript-eslint/no-loop-func` at mcp-bridge.ts line 95.** Justified: `for...of` with `const` creates a new binding per iteration. The captured `def` variable is stable. No issue.

### The Auditor

**Comment contradicts code.** `session-provisioning.ts` line 530: the comment says "Fire-and-forget" but the code does `await mcpBridgeRegistry.unregister(mcpBridgeToken)`. The unregister is awaited, not fire-and-forget. The comment is misleading.

**Severity: SUGGESTION** (comment-only, no behavioral issue).

### Race conditions

No concurrent access issues identified. The bridge registry is an in-memory Map accessed synchronously (register/lookup/delete are O(1) sync operations). The `unregister` function deletes the entry synchronously (line 53) before awaiting `mcpServer.close()`, preventing use-after-unregister races.

### Type safety

No `any`, no `@ts-ignore`, no unsafe `as` casts in any new file. One justified `eslint-disable` for `no-loop-func`. `npm run check` passes clean (verified: no TS errors in new files).

### Test quality

Tests use real `createTestDb()` and `buildToolRegistry()` — no mocking of the database. Mocks are used only where appropriate: `transport.handleRequest` for routing verification, `transport.close`/`mcpServer.close` for cleanup verification. Test assertions are meaningful (not just `toBeDefined()` or `not.toThrow()`).

One integration test at line 617 (`session provisions and completes even if createMcpBridge fails`) uses `failingRegistry.register` that throws to simulate bridge creation failure. This tests the try-catch but via a slightly different failure path (register throws, not createMcpBridge throws). The try-catch in the implementation wraps both `createMcpBridge` AND `register`, so both failure paths are covered.

Adversarial lens: **1 WARNING, 2 SUGGESTION**

---

## Lens 5: Simplification

### Dead code

None identified. Every export is used. `McpBridgeRegistry.lookup` is used in tests only (not in production code), but the plan acknowledged this and the architecture critique noted it as SUGGESTION. Keeping it for observability and testing is acceptable.

### Single-use helpers

`toolResultToCallToolResult` is extracted as a separate exported function. This is correct — it enables unit testing of the mapping logic without spinning up a full McpServer. Not over-engineering.

### Premature generics

None. The types are concrete. No generic type parameters on any new function.

### Unnecessary async

`McpBridgeRegistry.unregister` is correctly async (calls `mcpServer.close()` which is async). `createMcpBridge` is correctly async (calls `mcpServer.connect(transport)` which is async). `handleRequest` is correctly async (transport.handleRequest returns Promise).

### Commented-out code

None.

### Value-free wrappers

`createMcpRoute` wraps a single Hono route definition. This could be inlined in server-factory.ts, but the extraction follows the existing pattern (every route family has its own `create*Routes` factory). Consistent with codebase conventions.

Simplification lens: **PASS** — no actionable findings.

---

## Lens 6: AI Slop

### Verbose naming

`toolResultToCallToolResult` is verbose but self-documenting. The architecture plan explicitly calls this out as "slightly verbose but self-documenting." Acceptable.

### Unnecessary comments

The `@lore` comments are substantive (explain non-obvious decisions, cite architecture critique). No filler comments like "// loop through tools" or "// return the result."

### Defensive over-engineering

The empty `catch` on line 397 of session-provisioning.ts catches ALL errors from bridge creation. This is intentional (graceful degradation per the architecture critique). Not defensive for no reason.

### AI tell-tales

No "TODO: implement," no "simplified version," no "for now." No `=== true` comparisons (the `if (mcpBridgeRegistry && mcpBaseUrl)` guard is idiomatic). No unnecessary else-return.

### `@lore` comment quality

All `@lore` comments cite specific architecture decisions (D1, D3, D4, D5, D6, D7) or critique warnings. They document WHY, not WHAT. No lore comments restate the obvious.

Slop lens: **PASS** — no findings.

---

## AC Completeness Audit

| AC | Description | Implemented? | Tested? | Verdict |
|---|---|---|---|---|
| AC1 | MCP server exposes all 15 skill-tools as MCP tools with JSON Schema from Zod | Yes: `mcp-bridge.ts` iterates `registry.definitions` and calls `registerTool` with Zod schema | Yes: `mcp-bridge.test.ts` verifies 15 tools registered, checks all 15 names | PASS |
| AC2 | Session-scoped token maps MCP invocations to ToolContext | Yes: 64-char hex token generated per session, registry maps token to bridge instance, handleRequest delegates to transport | Yes: registry tests verify register/lookup/handleRequest; integration tests verify 401 for unknown and expired tokens | PASS |
| AC3 | Tool results returned via MCP response (success + error mapping) | Yes: `toolResultToCallToolResult` maps success to `content[text]` and failure to `isError: true` with JSON body | Yes: 5 unit tests covering success, null data, error, FORBIDDEN, array data | PASS |
| AC4 | Role-based filtering (FORBIDDEN for cross-role calls) | Yes: `registry.invoke()` returns FORBIDDEN for cross-role tools. Builder registry has 11 tools (not 15) | Yes: unit tests verify FORBIDDEN for facilitator-only tool on builder, verify 11-tool count | PASS |
| AC5 | MCP server started Phase 8, stopped Phase 11 | Yes: Phase 8b creates bridge before harness.startSession. Phase 11 unregisters before both crashSession and endSession | Yes: integration tests verify size=1 during session, size=0 after normal end and after crash | PASS |
| AC6 | `.mcp.json` written to workspace for auto-discovery | Yes: `session-provisioning.ts` writes `.mcp.json` with `{ mcpServers: { hyperidle: { type: "http", url }}}` | Yes: integration test reads `.mcp.json` at startSession time, verifies structure and token format | PASS |
| AC7 | Event-stream tool interception continues as fallback | Yes: Phase 10 `tool_call` handling unchanged. Bridge creation skipped when `mcpBridgeRegistry` is absent | Yes: integration test provisions without registry and completes successfully. Protected tests (session-provisioning.test.ts) continue to pass | PASS |

### Observation (not blocking)

MCP-invoked tools do not emit `tool_call_recorded` events. When a tool is invoked via MCP (Phase 8b bridge), the call goes directly through `registry.invoke()`. The `tool_call_recorded` event is emitted only in the Phase 10 event-stream path (`session-provisioning.ts` line 474-480). This means MCP tool calls are not visible in the session activity buffer (Q1). This is not an X2 AC, but it is a gap for future work — the activity buffer will show no tool calls for MCP-based sessions.

---

## Critique Warning Resolution

| Critique Warning | Resolution in Code | Status |
|---|---|---|
| Crash-path bridge cleanup (both endSession AND crashSession must unregister) | `session-provisioning.ts` line 529-533: unregister called BEFORE both paths | ADDRESSED |
| Bridge creation failure → graceful degradation (try-catch, session continues) | `session-provisioning.ts` lines 382-401: try-catch wrapping entire Phase 8b | ADDRESSED |
| Zod v3 not v4 | Critique was wrong — project is on Zod 4 (`^4.3.6`). Implementation correctly uses Zod 4 terminology | N/A (critique error) |
| mcpBaseUrl on deps, not process.env.PORT | `server-factory.ts` line 129: `http://localhost:${port}` from function parameter | ADDRESSED |

---

## Findings Summary

### WARNING (must fix before ship)

**W1: `unregister` can crash teardown.** `mcp-bridge-registry.ts` line 58: `await instance.mcpServer.close()` is not wrapped in try-catch. If `close()` throws, Phase 11 teardown in `session-provisioning.ts` is blocked — neither `crashSession` nor `endSession` runs, leaving the session row permanently `active`. Fix: wrap `mcpServer.close()` in try-catch inside `unregister()`, matching the `stopSession` crash-path pattern at `session-provisioning.ts` lines 497-507.

### SUGGESTION (improve, not blocking)

**S1: Silent bridge creation failure.** `session-provisioning.ts` line 397: the `catch` block has no logging. Add a `console.warn` matching the existing pattern at line 505 so failed bridge creation is observable.

**S2: Misleading comment.** `session-provisioning.ts` line 530: "Fire-and-forget" but the code does `await`. Remove "fire-and-forget" from the comment.

---

## Test Results

All 39 tests pass (3 test files, 0 skipped):
- `mcp-bridge.test.ts` — 12 tests
- `mcp-bridge-registry.test.ts` — 17 tests
- `mcp-route.integration.test.ts` — 10 tests

`npm run check` passes (zero type errors in new files).

---

REVIEW-VERDICT: **NOT DONE** — W1 must be fixed before shipping. The `unregister` close failure can corrupt session state.
