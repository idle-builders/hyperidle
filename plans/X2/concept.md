# X2 -- MCP Bridge for Skill-Tools: Concept

## Required reading for downstream skills

- `/packages/server/src/skill-tools/tool-registry.ts` -- ToolRegistry, ToolDefinition, ToolContext, buildToolRegistry, toClaudeToolSpec, ALL_TOOL_DEFINITIONS
- `/packages/server/src/skill-tools/tool-result.ts` -- ToolResult discriminated union (ok/err)
- `/packages/server/src/services/session-provisioning.ts` -- 11-phase provisioning orchestrator; Phase 8 builds ToolRegistry, Phase 10 event-stream tool interception, Phase 11 teardown
- `/packages/server/src/harness/claude-agent-sdk-adapter.ts` -- ClaudeAgentSdkAdapter; how the current adapter starts sessions and streams events
- `/packages/shared/src/harness/harness-adapter.ts` -- HarnessAdapter interface: startSession, streamEvents, stopSession, getCapabilities
- `/packages/shared/src/harness/harness-events.ts` -- HarnessEvent union type including ToolCallEvent
- `/packages/server/src/server-factory.ts` -- server bootstrap; where new per-session infrastructure would be wired
- `/packages/server/src/harness/adapter-pool.ts` -- AdapterPool; how adapters are registered and selected
- `docs/architecture/system-overview.md` -- three-layer system (Human Interface > Meta Layer > Agent Runtime)
- `docs/architecture/key-interfaces-between-components.md` -- Agent > Meta Layer via skills; Meta Layer > Harness via HarnessAdapter
- `docs/architecture/components.md` -- Harness Adapter (SS2.7) and Workspace Adapter (SS2.8)
- `docs/agent-layer/principles.md` -- "Humans validate, agents execute"
- MCP SDK: `@modelcontextprotocol/sdk` v1.29.0 -- McpServer, StdioServerTransport, StreamableHTTPServerTransport
- Claude Agent SDK: `@anthropic-ai/claude-agent-sdk` -- createSdkMcpServer, McpServerConfig types, SdkMcpToolDefinition

---

## Nouns in this workpackage

| Noun | Classification | Notes |
|---|---|---|
| MCP Bridge | **New primitive** | Per-session MCP server exposing skill-tools |
| Session Token | **New primitive** | Opaque credential mapping MCP caller to ToolContext |
| ToolRegistry | Stable | Used as-is |
| ToolContext | Stable | Used as-is |
| HarnessAdapter | Stable | MCP Bridge sits alongside it, not inside it |

---

## MCP Bridge primitive

**Definition.** A per-session MCP server instance that translates MCP `tools/call` requests into ToolRegistry invocations, exposing HyperIdle's skill-tools to external harnesses via the Model Context Protocol.

### Essential properties

- Bound to exactly one session (one ToolContext, one ToolRegistry, one agent role).
- Exposes the same tool definitions as its ToolRegistry, derived from the same Zod schemas. No duplicate definitions.
- Enforces the same role-based filtering as the ToolRegistry (FORBIDDEN for cross-role calls).
- Returns tool results to the caller via MCP response (maps ToolResult to MCP CallToolResult).
- Has a lifecycle tied to the session lifecycle: created Phase 8 (after ToolRegistry), destroyed Phase 11 (before session row closes).
- Discoverable via `.mcp.json` written to the workspace.

### What MCP Bridge is NOT

1. **Not a general-purpose MCP server.** It exposes only MCP tools. No MCP resources, prompts, or sampling. Adding non-tool MCP features would expand the contract surface without solving the stated problem (harness tool calling). Out of scope per spec.

2. **Not a replacement for the event-stream path.** Both coexist. Harnesses that support MCP use the bridge. Harnesses that don't (or that prefer the existing path) continue to emit `tool_call` events on the event stream, handled by Phase 10 of provisioning. The bridge is additive, not substitutive.

3. **Not an authentication gateway.** It uses a session-scoped token for caller identification, not user authentication. The security boundary is the workspace filesystem (only processes with workspace access can read the token from `.mcp.json`). "Authentication beyond session-scoped tokens" is explicitly out of scope.

4. **Not a multi-session router.** Each bridge instance serves exactly one session. There is no shared MCP server dispatching to multiple sessions. This is a deliberate simplicity choice: one bridge per session means no session-routing logic, no shared state, no cross-session interference, and trivial cleanup (destroy the bridge when the session ends).

5. **Not a persistent service.** No database tables, no state that survives a session. If the session crashes, the bridge is gone. The bridge is a transport adapter with the lifetime of its session.

6. **Not a proxy for external MCP servers.** The harness's own MCP servers are the harness's business. The MCP Bridge exposes HyperIdle's tools TO the harness, not the other way around.

### Composition

- **Wraps:** one ToolRegistry (which wraps ToolContext + role-filtered ToolDefinitions)
- **Identified by:** one Session Token
- **Discovered via:** one `.mcp.json` Bridge Config file in the workspace
- **Lives alongside:** the event-stream tool interception path (Phase 10)
- **Created by:** session-provisioning orchestrator (Phase 8)
- **Destroyed by:** session-provisioning orchestrator (Phase 11)

### Lifecycle

```
             Phase 8                        Phase 11
  [not exists] -----> [active] -----> [destroyed]
              create    |          teardown
                        |
                  handles MCP tool calls
                  (tools/list, tools/call)
```

Two states only: active or destroyed. No pause, no reconnect, no graceful degradation. If the bridge process/transport fails, the session can continue via the event-stream fallback path.

### Authority

- **Session-provisioning orchestrator** creates and destroys the bridge.
- **ToolRegistry** owns the tool definitions and invocation logic.
- **MCP Bridge** owns nothing -- it translates. It is a pure adapter with no domain state.

---

## Session Token primitive

**Definition.** An opaque, short-lived capability token that maps an MCP caller to a specific session's ToolContext.

### Essential properties

- Maps to exactly one session (sessionId, agentId, taskId, teamId, workspacePath, watcher, role).
- Opaque to the holder: a cryptographically random string with no embedded claims.
- Short-lived: valid from bridge creation (Phase 8) to bridge destruction (Phase 11).
- Non-transferable by design: written to the workspace `.mcp.json`, readable only by processes with workspace filesystem access.

### What Session Token is NOT

1. **Not a user API key.** The existing HyperIdle API uses per-user API keys for human authentication. The Session Token is a separate credential namespace used only by the MCP Bridge. Different lifecycle, different trust model, different validation path.

2. **Not a JWT.** It carries no claims. It is opaque -- a random string that maps to server-side state (the ToolContext). Parsing the token yields nothing. This keeps the token format free to change without breaking callers.

3. **Not reusable across sessions.** When the session ends, the token is invalidated. There is no renewal, no refresh, no token rotation. The token's lifetime IS the session's lifetime.

### Authority

- **Session-provisioning orchestrator** generates the token during bridge creation.
- **MCP Bridge** validates the token on each request.
- **Invalidation** happens implicitly when the bridge is destroyed at Phase 11.

---

## Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **MCP Bridge** | Per-session MCP server translating tool calls to ToolRegistry invocations | mcp-server (too generic), tool-server, skill-server, mcp-adapter (collides with HarnessAdapter naming) |
| **Session Token** | Opaque capability token mapping MCP caller to ToolContext | api-key (different concept), auth-token (implies user auth), session-key (ambiguous with crypto), mcp-token |
| **Bridge Config** | The `.mcp.json` file written to workspace for harness auto-discovery | mcp-config (too generic), server-config (collides with existing server-config.ts) |

---

## Contracts

### MCP Bridge

| Contract | Rule |
|---|---|
| **Cardinality** | 1 bridge : 1 session. No exceptions. |
| **Tool closure** | Tool set is closed at bridge creation. Adding tools mid-session is not supported. |
| **Immutability** | Bridge is immutable after creation: tool set, ToolContext, session token all fixed. Only state change is destruction. |
| **Identity** | Externally identified by session token. Internally keyed by sessionId. |
| **Schema derivation** | Tool JSON Schemas MUST be derived from the same Zod schemas used by ToolRegistry. No hand-written schemas. |
| **Role enforcement** | Facilitator-only tools called from builder sessions MUST return FORBIDDEN, matching existing ToolRegistry behavior. |
| **Lifecycle** | Created after ToolRegistry (Phase 8). Destroyed before session teardown completes (Phase 11). |
| **Fallback** | The event-stream tool interception path (Phase 10) MUST continue to work. MCP Bridge is additive. |
| **Protocol compliance** | MUST work with any MCP client, not just Claude Code. |

### Session Token

| Contract | Rule |
|---|---|
| **Cardinality** | 1 token : 1 bridge : 1 session. |
| **Opacity** | Callers MUST NOT parse the token. Format may change without notice. |
| **Immutability** | Created once, invalidated once (at session teardown). |
| **Generation** | Cryptographically random (e.g., `crypto.randomBytes(32).toString('hex')`). |
| **Delivery** | Written to `.mcp.json` in the workspace. Not transmitted over the network separately. |

---

## Architecture decisions (locked by concept, decided by /architecture)

The following decisions are flagged for `/architecture` to resolve. The concept constrains them but does not pick the implementation:

1. **Transport choice.** The concept says "per-session MCP server." The transport (stdio, SSE, streamable-HTTP, or SDK-native via `createSdkMcpServer`) is an implementation decision. The concept constrains: must work with any MCP client (protocol compliance contract), must be destroyable at Phase 11, must carry the session token for authentication.

2. **Token delivery mechanism.** The concept says "written to `.mcp.json` in the workspace." The exact `.mcp.json` structure (which fields, which format) is an implementation decision. The concept constrains: must be readable by harnesses that auto-discover MCP servers.

3. **ToolResult to CallToolResult mapping.** The concept says "returns tool results via MCP response." The mapping from `{ success: true, data } | { success: false, error, code }` to MCP's `CallToolResult` (which uses `content: TextContent[]` + `isError: boolean`) is an implementation decision.

4. **Where the bridge code lives.** The concept says it's a transport adapter at the Agent Runtime boundary. File placement is an `/architecture` decision.

---

## Tension with existing architecture doc

`docs/architecture/what-this-architecture-does-not-include.md` states: "MCP servers or protocol adapters. Skills call CLIs and APIs directly." This referred to the meta layer's design philosophy: agents don't use MCP to discover or call external tools (the token tax / context bloat concerns documented in `docs/archive/RESEARCH_EXECUTION_LAYER.md`).

The MCP Bridge is the inverse direction: external harnesses use MCP to invoke HyperIdle's skill-tools. The token tax concern does not apply because HyperIdle exposes a small, fixed set of 15 tools (not hundreds of external API endpoints). The bridge lives at the Agent Runtime boundary, not in the meta layer. The architecture exclusion should be updated to note this exception when X2 ships.

## Rationale

HyperIdle's current tool invocation path works by intercepting `tool_call` events on the harness event stream (Phase 10 of session-provisioning). This has a gap: the tool result is computed but not returned to the harness (the event stream is one-directional). MCP fixes this by providing a proper request-response protocol for tool invocation.

The decision to make the bridge per-session (rather than a shared server with session routing) follows the system's existing pattern: one workspace per session, one ToolRegistry per session, one ToolContext per session. Adding a shared router would introduce cross-session state management, session-to-token dispatching logic, and a new failure mode (router crash takes down all sessions). The per-session model keeps the blast radius small and the cleanup trivial.

The decision to use an opaque session token (rather than JWTs or signed tokens) follows from the security boundary being the workspace filesystem. The token is never transmitted over untrusted networks -- it's written to a file in the workspace, and only processes with workspace access can read it. The token is a capability, not an identity credential.
