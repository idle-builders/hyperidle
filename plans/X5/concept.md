# X5 Concept: Multi-Harness Adapter Layer

## What concepts does X5 introduce or reshape?

X5 introduces one new concept -- the **CLI Adapter** -- and expands an existing concept -- **SessionConfig** -- with MCP connection metadata. It does NOT introduce a new HarnessAdapter interface (stable) nor a new adapter pool (X3 already exists).

---

## Concept 1: CLI Adapter (CliHarnessAdapter)

### What IS it?

A CLI Adapter is a HarnessAdapter implementation that wraps any command-line agent tool (Aider, Goose, OpenCode) by spawning it as a subprocess and translating its stdout/stderr into the HarnessEvent stream.

### Essential properties

1. It spawns exactly one child process per session.
2. It injects configuration through environment variables and file-system conventions (workspace path, `.mcp.json`, model config).
3. It reads structured events from the child's stdout (one JSON object per line -- NDJSON).
4. It has a finite, well-defined lifecycle: spawn -> stream -> stop/kill.
5. It declares its type (e.g. `"cli"`) and wrapped binary (e.g. `"aider"`) at registration.
6. It checks binary availability (executable exists in PATH) at registration.

### What it is NOT

- It is NOT the IsolatedHarnessAdapter. The isolated adapter forks a Node.js worker with the Claude SDK inside it. The CLI adapter spawns an arbitrary external binary that is NOT a Node.js process and does NOT use Node IPC.
- It is NOT a protocol bridge. It does not translate between protocols (MCP/gRPC/etc). It reads from stdout and writes to stdin -- Unix process IO.
- It is NOT a harness itself. It does not implement agent logic. It is the adapter that wraps someone else's harness.
- It is NOT responsible for installing the external binary. The deployer installs it; the adapter checks it exists.
- It is NOT a long-lived daemon. It spawns fresh per session and the process exits when the session ends.

### Minimal contract a CLI tool must meet to be wrapped

For a CLI tool to be wrappable by the CLI adapter, it MUST:

1. **Accept a workspace path** -- either as a CLI argument or via an environment variable (e.g. `--cwd /path` or `WORKSPACE=/path`).
2. **Accept a prompt/task** -- either via stdin, a CLI argument, or by reading a file from the workspace (e.g. CLAUDE.md, task.md).
3. **Exit on completion** -- the process must terminate when the task is done (exit code 0 = completed, non-zero = crashed).
4. **Stream progress on stdout** -- ideally as NDJSON (one JSON object per line), but raw text is also accepted (treated as completion events).

Optionally (for rich event streaming):

5. **Emit structured events** -- JSON lines matching the HarnessEvent type discriminator: `{"type":"tool_call","toolName":"...","args":{}}`, `{"type":"completion","text":"..."}`, `{"type":"token_usage","inputTokens":N,"outputTokens":N}`, `{"type":"cost_update","totalCost":N,"deltaCost":N}`.
6. **Accept MCP configuration** -- via `.mcp.json` in the workspace, environment variables, or CLI flags.
7. **Accept model configuration** -- via environment variables like `MODEL_NAME`, `API_KEY`, `BASE_URL`.

Tools that only satisfy requirements 1-4 get "best-effort" wrapping: all stdout is captured as completion events, no cost/token tracking, session ends when process exits.

### How it relates to existing adapters

| Adapter | Process model | Communication | Binary |
|---------|--------------|---------------|--------|
| ClaudeAgentSdkAdapter | In-process (same V8) | SDK function calls | N/A |
| IsolatedHarnessAdapter | Fork (Node child) | Node IPC (process.send) | Node.js worker |
| RemoteHarnessAdapter | Remote (WebSocket) | JSON over WS | Any (remote) |
| **CliHarnessAdapter** | Spawn (child_process) | stdout/stderr/stdin | External binary |

### Lifecycle

```
registration: check binary exists in PATH
  |
startSession: spawn(binary, args, { env, cwd })
  |
streamEvents: read stdout line-by-line, parse NDJSON -> HarnessEvent
  |
stopSession: send SIGTERM -> wait 5s -> SIGKILL (same as IsolatedHarnessAdapter)
  |
result: map exit code to outcome (0=completed, non-zero=crashed)
```

### Configuration injection strategy

Different CLI tools accept configuration differently. The adapter uses a layered injection strategy:

1. **Environment variables** (universal): `WORKSPACE_PATH`, `MODEL_NAME`, `API_KEY`, `API_BASE_URL`, `MCP_URL`.
2. **File-system conventions**: `.mcp.json` written to workspace (already done by session provisioning).
3. **CLI arguments**: tool-specific, passed via `CliAdapterConfig.args` template with variable substitution.

The adapter config (stored per-registration) specifies which injection method to use:

```typescript
interface CliAdapterConfig {
  binary: string;              // e.g. "aider", "goose", "opencode"
  args: string[];              // e.g. ["--cwd", "{{workspace}}", "--model", "{{model}}"]
  envMap: Record<string, string>; // e.g. { "OPENAI_API_KEY": "{{apiKey}}" }
  eventFormat: "ndjson" | "text"; // how to parse stdout
}
```

---

## Concept 2: SessionConfig expansion (MCP connection info)

### What changes?

SessionConfig gains a new optional field: `mcpConnectionInfo`. This tells the adapter how to connect to the MCP bridge for this session.

### Why optional?

- Not every session has an MCP bridge (bridge creation is best-effort; it fails gracefully).
- The BuiltinHarnessAdapter does not use MCP at all (it calls the tool registry directly).
- Backward compatibility: existing code that constructs SessionConfig without this field continues to work.

### What it carries

```typescript
interface McpConnectionInfo {
  readonly url: string;     // e.g. "http://localhost:3001/api/mcp/<token>"
  readonly token: string;   // the 64-char hex session token
}
```

This is a subset of what is already written to `.mcp.json` -- but having it in SessionConfig means adapters can inject it via environment variables or CLI args without re-reading the file.

---

## Concept 3: BuiltinHarnessAdapter (stub)

### What IS the stub?

X5 creates the adapter class shell with `startSession`/`streamEvents`/`stopSession`/`getCapabilities`. The actual agent loop (plan -> execute -> reflect -> stop) is X6's job.

### Why a stub in X5?

AC2(c) requires "at least three harness adapters exist." The builtin adapter must exist and be registerable in the pool, even if its `startSession` throws "not yet implemented." This satisfies the AC and lets X6 fill in the implementation without modifying the registration infrastructure.

---

## Vocabulary / naming decisions

| Term | Meaning | Avoid |
|------|---------|-------|
| `CliHarnessAdapter` | Adapter that wraps CLI tools | "ShellAdapter", "ProcessAdapter", "ExecAdapter" |
| `BuiltinHarnessAdapter` | The built-in harness adapter (X6 fills it) | "InternalAdapter", "NativeAdapter" |
| `McpConnectionInfo` | MCP bridge coordinates for a session | "McpConfig" (overloaded), "McpEndpoint" |
| `CliAdapterConfig` | Configuration for how to invoke a specific CLI tool | "CliProfile", "ToolConfig" |
| `harnessType` | The string discriminator for adapter selection | "adapterKind" (conflicts with `AdapterMeta.kind`) |

---

## Rejection list (what X5 explicitly does NOT do)

1. Does NOT change the HarnessAdapter interface.
2. Does NOT implement the built-in agent loop (X6).
3. Does NOT auto-install external binaries.
4. Does NOT add a harness-specific UI.
5. Does NOT support hot-swapping mid-session.
6. Does NOT create a new adapter pool -- uses the existing one.
7. Does NOT add new provisioning phases -- the existing Phase 8b (MCP bridge) and Phase 9 (harness start) are sufficient.
8. Does NOT proxy LLM calls for CLI tools -- it passes credentials via env vars and lets the tool make its own calls.

---

## Open questions resolved

**Q: Should the CLI adapter use stdio (stdin/stdout) or a socket for communication?**
A: Stdout (NDJSON). Reasoning: (1) universally supported by all CLI tools, (2) no port allocation needed, (3) follows the pattern of LSP/MCP stdio transport, (4) simpler than WebSocket for ephemeral processes. Stdin is available for future interactive commands (e.g. "stop gracefully").

**Q: How does the CLI adapter know when the tool is done?**
A: Process exit. Exit code 0 = completed. Non-zero = crashed. This is the universal Unix contract. No special "done" event needed (though a tool CAN emit one).

**Q: Should adapters declare MCP support capability?**
A: Yes. Add `mcpSupport: boolean` to HarnessCapabilities. When false, the provisioning orchestrator knows to handle tool calls via event-stream interception (the existing Phase 10 path). This does NOT change the HarnessAdapter interface -- HarnessCapabilities is already a return type, not a method signature.

**Q: Where does `CliAdapterConfig` live?**
A: Passed at registration time, stored in the adapter instance. Not in the DB (that would be X3 scope expansion). A future workpackage could add DB-stored harness configs. For now, registration is programmatic (in `createLocalAdapterPool` or via the worker WS route).
