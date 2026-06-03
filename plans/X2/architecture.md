# X2 -- MCP Bridge for Skill-Tools: Architecture Plan

## Required reading

- `plans/X2/concept.md` -- locked concept (MCP Bridge, Session Token, contracts)
- `packages/server/src/skill-tools/tool-registry.ts` -- ToolRegistry, ToolDefinition, ToolContext, buildToolRegistry, toClaudeToolSpec
- `packages/server/src/skill-tools/tool-result.ts` -- ToolResult (ok/err)
- `packages/server/src/services/session-provisioning.ts` -- 11-phase provisioning
- `packages/server/src/app.ts` -- createApp, AppOptions, api sub-router, disposeApp
- `packages/server/src/server-factory.ts` -- createServer, ServerHandle, port wiring
- `packages/shared/src/harness/harness-adapter.ts` -- HarnessAdapter, SessionConfig
- `packages/shared/src/harness/harness-events.ts` -- HarnessEvent, ToolCallEvent
- `@modelcontextprotocol/sdk` v1.29.0 -- McpServer, WebStandardStreamableHTTPServerTransport
- `@anthropic-ai/claude-agent-sdk` -- McpHttpServerConfig for `.mcp.json` format reference

---

## Plan reconciliation

| Spec assumption | Reality | Resolution |
|---|---|---|
| "14 skill-tools" | Actually 15 (create_artifact added in R6) | Plan uses 15. |
| `@modelcontextprotocol/sdk` is available | Present as transitive dep via claude-agent-sdk, NOT a direct dep of packages/server | **Task 1: add as direct dependency.** |
| `.mcp.json` exists in workspaces | `.mcp.json` at repo root is `{ "mcpServers": {} }` -- workspaces don't have one | **Task 5: write per-workspace `.mcp.json` during provisioning.** |
| "MCP server started Phase 8" | Phase 8 currently builds ToolRegistry. Bridge creation slots in after registry build. | **Task 4: extend Phase 8 in session-provisioning.ts.** |
| "MCP server stopped Phase 11" | Phase 11 calls endSession/crashSession. Bridge teardown slots in before. | **Task 4: extend Phase 11 in session-provisioning.ts.** |
| Existing event-stream path continues | Phase 10 `tool_call` event handling exists and must not change | **No changes to Phase 10.** Covered by AC7 + protected test. |
| Port is known at provisioning time | `createServer(port)` receives port; provisioning happens later. Port not currently passed into provisioning deps. | **Task 3: pass server port through ProvisionSessionDeps.** Or: use env var `PORT`. Simpler: read `process.env.PORT \|\| 3001` in the bridge factory. |
| `docs/architecture/what-this-architecture-does-not-include.md` says "MCP servers or protocol adapters" are excluded | Concept doc explains the MCP Bridge is the inverse direction (harness-to-HyperIdle, not agent-to-external) and lives at the Agent Runtime boundary | **Task 7: update the architecture exclusion doc.** |

---

## Architecture decisions

### D1: Transport -- WebStandardStreamableHTTPServerTransport on the existing Hono server

**Chosen.** The MCP Bridge uses `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`, mounted as a Hono route on the existing API server. Each session gets its own transport + McpServer instance.

**Why not stdio?** The MCP Bridge needs access to live ToolContext objects (db, eventBus, watcher). A stdio child process would need to either duplicate these objects or use IPC -- both more complex than sharing them in-process via HTTP.

**Why not a separate HTTP server per session?** Port allocation per session is operationally expensive (port exhaustion, firewall rules, discovery). Mounting on the existing Hono server reuses the existing port.

**Route:** `ALL /api/mcp/:token` -- the session token in the URL path routes to the correct transport instance.

**Hono integration pattern** (from MCP SDK docs, verified):
```typescript
// @modelcontextprotocol/sdk v1.29.0 WebStandardStreamableHTTPServerTransport docs:
// "Hono.js usage: app.all('/mcp', async (c) => { return transport.handleRequest(c.req.raw); });"
```

### D2: Session token -- crypto.randomBytes(32) hex string

**Format:** 64-character hex string from `crypto.randomBytes(32).toString('hex')`.
**Delivery:** Written to `<workspace>/.mcp.json`.
**Validation:** Lookup in an in-memory `Map<string, McpBridgeInstance>`. O(1). Token not found = 401.
**Lifetime:** Created at Phase 8, invalidated at Phase 11 (removed from map).

### D3: One McpServer + transport per session (not shared)

Each session provisioning creates:
- One `McpServer` instance
- One `WebStandardStreamableHTTPServerTransport` instance (stateless mode -- our session token replaces MCP's session management)
- Registered in a `Map<string, McpBridgeInstance>` keyed by session token

The Hono route handler looks up the token, delegates to the correct transport. Cleanup removes the entry from the map.

### D4: ToolResult to CallToolResult mapping

```typescript
// ToolResult { success: true, data } → { content: [{ type: "text", text: JSON.stringify(data) }] }
// ToolResult { success: false, error, code } → { content: [{ type: "text", text: JSON.stringify({ error, code }) }], isError: true }
```

The `isError: true` flag tells the MCP client the tool call failed. The error body is JSON-stringified so the harness can parse the machine-readable `code`.

### D5: Bridge registry location -- server-scoped singleton

The `Map<string, McpBridgeInstance>` lives as a module-level singleton in the MCP bridge module. It's passed into the provisioning deps so sessions can register/unregister bridges.

Alternative considered: putting it on `AppOptions` / Hono context. Rejected because the bridge registry is Agent Runtime infrastructure, not API Layer state. It doesn't need to be accessible from arbitrary route handlers.

### D6: Tool registration -- pass Zod schemas directly to McpServer.registerTool

The MCP SDK's `registerTool` accepts `AnySchema` which includes Zod 4 types. Our `ToolDefinition.inputSchema` is `z.ZodType<Input>` (Zod 4). We pass it directly -- no manual JSON Schema conversion needed. This keeps the Zod schema as the single source of truth (satisfying the "no duplicate definitions" contract).

**Verified:** `getZodSchemaObject()` in MCP SDK v1.29.0 (`mcp.js`) checks `isZodSchemaInstance(schema)` and passes full Zod schemas through unchanged. `validateToolInput` uses `safeParseAsync` with the schema. Compatible with our `z.object()` schemas.

### D7: Double validation is intentional

The MCP SDK validates tool input via Zod before calling the handler. The handler delegates to `registry.invoke(name, args)` which re-validates via `safeParse`. This double validation is intentional: the registry's `invoke()` is the authorization gate that checks role-based filtering (returning FORBIDDEN for cross-role calls). Bypassing it to avoid double validation would bypass the security boundary. No skill tools use `.transform()`, so double parsing is idempotent.

---

## Type signatures

### McpBridgeInstance

```typescript
// packages/server/src/mcp/mcp-bridge.ts

interface McpBridgeInstance {
  readonly token: string;
  readonly sessionId: string;
  readonly mcpServer: McpServer;
  readonly transport: WebStandardStreamableHTTPServerTransport;
}
```

### McpBridgeRegistry

```typescript
// packages/server/src/mcp/mcp-bridge-registry.ts

interface McpBridgeRegistry {
  /** Register a new bridge. Returns the token. */
  readonly register: (instance: McpBridgeInstance) => void;
  /** Look up a bridge by token. Returns undefined if not found or expired. */
  readonly lookup: (token: string) => McpBridgeInstance | undefined;
  /** Unregister and close a bridge. No-op if not found. */
  readonly unregister: (token: string) => Promise<void>;
  /** Handle an incoming HTTP request by looking up the token and delegating. */
  readonly handleRequest: (token: string, request: Request) => Promise<Response>;
  /** Number of active bridges. For observability. */
  readonly size: number;
}

function createMcpBridgeRegistry(): McpBridgeRegistry;
```

### createMcpBridge

```typescript
// packages/server/src/mcp/mcp-bridge.ts

import type { ToolRegistry } from "../skill-tools/tool-registry.js";
import type { ToolResult } from "../skill-tools/tool-result.js";

interface CreateMcpBridgeOptions {
  readonly sessionId: string;
  readonly registry: ToolRegistry;
}

/** Create an McpServer with all tools from the registry registered, and a transport. Returns an McpBridgeInstance. */
function createMcpBridge(options: CreateMcpBridgeOptions): Promise<McpBridgeInstance>;
```

### Bridge config (.mcp.json)

```typescript
// Written to <workspace>/.mcp.json by session-provisioning

interface BridgeConfig {
  readonly mcpServers: {
    readonly hyperidle: {
      readonly type: "http";
      readonly url: string; // e.g., "http://localhost:3001/api/mcp/<token>"
    };
  };
}
```

### Extended ProvisionSessionDeps

```typescript
// packages/server/src/services/session-provisioning.ts

export interface ProvisionSessionDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly adapterPool: AdapterPool;
  readonly workspace: WorkspaceAdapter;
  /** X2: MCP bridge registry. When present, a bridge is created per session. */
  readonly mcpBridgeRegistry?: McpBridgeRegistry;
  /** X2: Base URL for MCP bridge (e.g., "http://localhost:3001"). */
  readonly mcpBaseUrl?: string;
}
```

---

## Hono route

```typescript
// packages/server/src/routes/mcp-route.ts

import { Hono } from "hono";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";

function createMcpRoute(bridgeRegistry: McpBridgeRegistry): Hono;

// Route: ALL /api/mcp/:token
// 1. Extract token from params
// 2. bridgeRegistry.handleRequest(token, c.req.raw)
// 3. If bridge not found, return 401 Unauthorized
// 4. Otherwise, return the Response from the transport
```

The route is mounted BEFORE the auth middleware (like the WS routes) because MCP clients authenticate via the session token in the URL, not via X-API-Key.

---

## File layout

```
packages/server/src/mcp/
  mcp-bridge.ts              -- createMcpBridge, McpBridgeInstance, tool registration + ToolResult mapping
  mcp-bridge-registry.ts     -- createMcpBridgeRegistry, McpBridgeRegistry, in-memory Map

packages/server/src/routes/
  mcp-route.ts               -- Hono route: ALL /api/mcp/:token

packages/server/src/__tests__/
  mcp-bridge.test.ts         -- Unit: createMcpBridge, tool registration, ToolResult mapping
  mcp-bridge-registry.test.ts -- Unit: register, lookup, unregister, handleRequest
  mcp-route.integration.test.ts -- Integration: full HTTP round-trip (Hono testClient)

Modified files:
  packages/server/package.json           -- add @modelcontextprotocol/sdk dependency
  packages/server/src/app.ts             -- add registerMcpRoute option on AppOptions, mount before auth
  packages/server/src/server-factory.ts  -- pass mcpBridgeRegistry + mcpBaseUrl to createApp
  packages/server/src/services/session-provisioning.ts -- Phase 8: create bridge; Phase 11: destroy bridge; write .mcp.json
  docs/architecture/what-this-architecture-does-not-include.md -- update exclusion note
```

---

## Acceptance criteria with verification methods

### AC1: MCP server exposes all 15 skill-tools as MCP tools with JSON Schema from Zod

**Verification:** Unit test in `mcp-bridge.test.ts`. Call `createMcpBridge` with a mock ToolRegistry containing 15 tools. Assert the McpServer has 15 tools registered. For at least 3 tools, verify the JSON Schema matches the output of `toClaudeToolSpec` for the same tool (checking `properties` and `required` fields).

### AC2: Session-scoped token maps MCP invocations to ToolContext

**Verification:** Integration test in `mcp-route.integration.test.ts`. Create a bridge via `createMcpBridge`, register it in a registry. Send an MCP `tools/call` request via HTTP to `/api/mcp/<token>`. Assert the tool handler receives the correct ToolContext (sessionId, agentId match).

### AC3: Tool results returned via MCP response

**Verification:** Integration test. Call a tool via MCP that returns `{ success: true, data: { id: "abc" } }`. Assert the MCP response contains `{ content: [{ type: "text", text: '{"id":"abc"}' }] }` with `isError` absent or false. Call a tool that returns `{ success: false, error: "not found", code: "NOT_FOUND" }`. Assert the MCP response contains `isError: true` and the error text includes `NOT_FOUND`.

### AC4: Role-based filtering (FORBIDDEN for cross-role calls)

**Verification:** Unit test. Create a bridge with a builder-role ToolRegistry. Invoke a facilitator-only tool (`route_item`) via the bridge. Assert the response is `isError: true` with `FORBIDDEN` in the text.

### AC5: MCP server started Phase 8, stopped Phase 11

**Verification:** Integration test in `mcp-route.integration.test.ts` (or a dedicated provisioning integration test). Use `provisionSession` with a mock harness that immediately completes. Assert:
- After session starts: `bridgeRegistry.size === 1` and the token is valid.
- After session ends: `bridgeRegistry.size === 0` and the token returns 401.

### AC6: `.mcp.json` written to workspace for auto-discovery

**Verification:** Integration test. After `provisionSession` starts (before harness session ends), read `<workspace>/.mcp.json`. Assert it contains `{ "mcpServers": { "hyperidle": { "type": "http", "url": "http://localhost:<port>/api/mcp/<token>" } } }`.

### AC7: Event-stream tool interception continues as fallback

**Verification:** Existing tests for Phase 10 tool_call handling must continue to pass. **Protected test:** the existing session-provisioning tests that cover Phase 10 `tool_call` event handling.

---

## Security and abuse cases

| Surface | Applicable? | Mitigation |
|---|---|---|
| **Rate limiting on MCP endpoint** | Yes -- POST to `/api/mcp/:token` is a write path | The global rate limiter already covers `/api/*`. MCP requests go through it. No additional rate limiter needed unless MCP traffic is disproportionate (monitor post-launch). |
| **Token brute-force** | Yes -- 64-char hex = 256 bits of entropy | 2^256 search space makes brute force infeasible. Rate limiter provides defense-in-depth. Failed lookups return 401 with no timing oracle (Map.get is O(1) constant-time). |
| **Input trust boundary** | Yes -- MCP tool arguments come from an external harness | The ToolRegistry already validates all input via `Zod.safeParse`. The MCP bridge delegates to `registry.invoke(name, rawArgs)` which runs the same validation. No additional sanitization needed. |
| **Secret handling** | Yes -- session token is a credential | Token is written to workspace filesystem (same trust boundary as the workspace itself). Token is not logged. Token is not included in error responses. Token is removed from registry at session end. |
| **Path traversal** | No -- the MCP bridge does not handle file paths. `.mcp.json` is written to a known workspace path via `path.join(workspacePath, ".mcp.json")`. The workspace path is already validated by the workspace adapter. | N/A. |
| **SSRF** | No -- the MCP bridge does not make outbound requests. It only receives requests. | N/A. |
| **Replay attacks** | Low risk -- tokens are short-lived (session duration). | After session teardown, token is removed from registry. Replayed requests return 401. |
| **MCP route before auth middleware** | Yes -- the MCP route must be mounted before the API auth middleware so MCP clients don't need an X-API-Key | The session token in the URL IS the authentication. Requests with invalid tokens get 401. The rate limiter (mounted before the MCP route) provides flood protection. |

---

## Protected tests

```
protectedTests:
  - packages/server/src/__tests__/session-provisioning.test.ts  # Phase 10 tool_call handling must not regress
  - packages/server/src/__tests__/tool-registry.test.ts           # ToolRegistry contract must not change
```

---

## Ordered task list

### Task 1: Add @modelcontextprotocol/sdk dependency

**Files:** `packages/server/package.json`
**Action:** `npm install @modelcontextprotocol/sdk@^1.29.0 --workspace=packages/server`
**Verification:** `npm ls @modelcontextprotocol/sdk --workspace=packages/server` shows the package. `npm run check` passes.

### Task 2: Implement mcp-bridge.ts -- createMcpBridge + ToolResult mapping

**Files:** `packages/server/src/mcp/mcp-bridge.ts`
**Action:**
- Define `McpBridgeInstance` interface
- Implement `createMcpBridge(options)`:
  1. Generate token via `crypto.randomBytes(32).toString('hex')`
  2. Create `WebStandardStreamableHTTPServerTransport` in stateless mode (`sessionIdGenerator: undefined`)
  3. Create `McpServer` with name `"hyperidle"`, version from package.json
  4. For each tool in `options.registry.definitions`:
     - Extract the Zod shape from `def.inputSchema`. Since our tools use `z.object(...)`, extract the shape via the Zod 4 internal `._zod.def.shape` property, OR use the full schema object since `registerTool` accepts `AnySchema`.
     - Register via `mcpServer.registerTool(def.name, { description: def.description, inputSchema: def.inputSchema }, handler)`
     - The handler calls `options.registry.invoke(def.name, args)`, then maps ToolResult to CallToolResult
  5. Connect mcpServer to transport: `await mcpServer.connect(transport)`
  6. Return `{ token, sessionId, mcpServer, transport }`

- Implement `toolResultToCallToolResult(result: ToolResult): CallToolResult`:
  - success=true: `{ content: [{ type: "text", text: JSON.stringify(result.data) }] }`
  - success=false: `{ content: [{ type: "text", text: JSON.stringify({ error: result.error, code: result.code }) }], isError: true }`

**Test:** `mcp-bridge.test.ts`
- Creates a bridge with mock tools, asserts tool count
- Calls a tool through the McpServer, asserts correct ToolResult mapping
- Tests both success and error paths

**Depends on:** Task 1

### Task 3: Implement mcp-bridge-registry.ts -- createMcpBridgeRegistry

**Files:** `packages/server/src/mcp/mcp-bridge-registry.ts`
**Action:**
- Implement `createMcpBridgeRegistry()`:
  - Internal `Map<string, McpBridgeInstance>`
  - `register(instance)`: add to map
  - `lookup(token)`: get from map
  - `unregister(token)`: get from map, call `transport.close()` and `mcpServer.close()`, delete from map
  - `handleRequest(token, request)`: lookup, if found delegate to `transport.handleRequest(request)`, if not found return `new Response("Unauthorized", { status: 401 })`
  - `size`: map.size

**Test:** `mcp-bridge-registry.test.ts`
- Register/lookup/unregister lifecycle
- handleRequest with valid token delegates to transport
- handleRequest with invalid token returns 401
- unregister cleans up (lookup returns undefined after)

**Depends on:** Task 2

### Task 4: Implement mcp-route.ts -- Hono route

**Files:** `packages/server/src/routes/mcp-route.ts`
**Action:**
- Create Hono sub-router
- Route: `ALL /mcp/:token` (note: mounted on `/api` sub-router, so full path is `/api/mcp/:token`)
- Handler:
  1. Extract `token` from `c.req.param("token")`
  2. Call `bridgeRegistry.handleRequest(token, c.req.raw)`
  3. Return the Response

**Test:** `mcp-route.integration.test.ts`
- Uses Hono `testClient` or direct `app.request()`
- Creates a bridge, registers it, sends MCP `initialize` + `tools/list` + `tools/call` requests
- Asserts correct responses
- Tests 401 for invalid token

**Depends on:** Task 3

### Task 5: Wire MCP route into app.ts and server-factory.ts

**Files:** `packages/server/src/app.ts`, `packages/server/src/server-factory.ts`
**Action:**
- Add `registerMcpRoute?: (apiRouter: Hono) => void` to `AppOptions`
- In `createApp`, invoke `registerMcpRoute` at the same point as `registerWebSocket` (before auth middleware)
- In `createServer`, create `McpBridgeRegistry`, create the route factory, pass it via `registerMcpRoute`
- Pass `mcpBridgeRegistry` and `mcpBaseUrl` (`http://localhost:${port}`) to provisioning deps

**Test:** Integration test verifying the MCP route is accessible on the full app
**Depends on:** Task 4

### Task 6: Integrate MCP bridge into session-provisioning.ts

**Files:** `packages/server/src/services/session-provisioning.ts`
**Action:**
- Extend `ProvisionSessionDeps` with optional `mcpBridgeRegistry?: McpBridgeRegistry` and `mcpBaseUrl?: string`
- After Phase 8 (ToolRegistry built), if `mcpBridgeRegistry` is present:
  1. Call `createMcpBridge({ sessionId, registry })`
  2. Register the bridge in `mcpBridgeRegistry`
  3. Write `.mcp.json` to `workspacePath`:
     ```json
     { "mcpServers": { "hyperidle": { "type": "http", "url": "<mcpBaseUrl>/api/mcp/<token>" } } }
     ```
  4. Store the token for cleanup
- In Phase 11 (teardown), if bridge was created:
  1. Call `mcpBridgeRegistry.unregister(token)`

**Test:** Integration test that provisions a session with a mock harness + real bridge registry. Asserts:
- Bridge is registered during session
- `.mcp.json` exists in workspace with correct URL
- Bridge is unregistered after session ends

**Depends on:** Task 5

### Task 7: Update architecture exclusion doc

**Files:** `docs/architecture/what-this-architecture-does-not-include.md`
**Action:** Update the MCP line to note the X2 exception:
```
- **MCP servers for external tool discovery.** Skills call CLIs and APIs directly. 
  (Exception: X2 MCP Bridge exposes HyperIdle's skill-tools TO external harnesses 
  via MCP -- the inverse direction. See plans/X2/concept.md.)
```

**Verification:** Visual inspection.
**Depends on:** None (can be done at any time)

---

## Risks and mitigations

### R1: WebStandardStreamableHTTPServerTransport stateless mode behavior

**Risk:** The MCP SDK's stateless mode (no session ID generator) may not work cleanly with all MCP clients. Some clients may expect a session ID in the response.

**Mitigation:** Use stateless mode since our session token replaces MCP's session management. If a client requires MCP session IDs, we can add `sessionIdGenerator: () => token` to reuse our token as the MCP session ID. Test with Claude Code as the primary client.

### R2: Zod schema compatibility between ToolDefinition and McpServer.registerTool

**Risk:** The `registerTool` API may not correctly handle our `z.ZodType<Input>` schemas if it expects a raw shape (`Record<string, AnySchema>`) rather than a full `z.object()`.

**Mitigation:** The MCP SDK's `registerTool` signature accepts `AnySchema` (which includes `z4.$ZodType`). If registration fails at runtime, fall back to using `toClaudeToolSpec` to generate JSON Schema and register via the lower-level `Server.setRequestHandler` API. This is the backup plan -- test early in Task 2.

### R3: MCP transport lifetime vs session lifetime

**Risk:** The `WebStandardStreamableHTTPServerTransport` may have internal state (open SSE connections) that needs explicit cleanup at session teardown.

**Mitigation:** `transport.close()` is called during `unregister()`. This closes all active connections. The MCP SDK docs confirm this behavior.

---

## Design-it-twice: Bridge registry scope

### Option A: Module-scoped singleton (chosen)

The `McpBridgeRegistry` is created once in `server-factory.ts` and passed through `createApp` options and `ProvisionSessionDeps`. Simple, testable, no global state.

**Trade-off:** The registry must be threaded through dependency injection to reach both the route handler and the session provisioner.

### Option B: Hono middleware / context variable

Store the registry in Hono's context (`c.set("mcpBridgeRegistry", registry)`). Route handlers access it via `c.get("mcpBridgeRegistry")`.

**Trade-off:** Couples the registry to the Hono request lifecycle. The session provisioner (which runs outside Hono request handlers) can't access it this way. Requires a separate path to the same registry.

**Why A:** The session provisioner is the primary consumer (creates/destroys bridges). It runs outside HTTP request context. Threading via deps is the established pattern (see `adapterPool`, `workspaceAdapter`).

---

## Task dependency graph

```
Task 1 (add dep)
    ↓
Task 2 (mcp-bridge.ts)
    ↓
Task 3 (mcp-bridge-registry.ts)
    ↓
Task 4 (mcp-route.ts)
    ↓
Task 5 (wire into app.ts / server-factory.ts)
    ↓
Task 6 (integrate into session-provisioning.ts)

Task 7 (update doc) — independent, any time
```

Tasks 1-6 are strictly sequential. Task 7 is independent.
