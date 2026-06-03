# X5 Architecture: Multi-Harness Adapter Layer

## Overview

X5 adds two new adapter implementations (CliHarnessAdapter, BuiltinHarnessAdapter stub), expands SessionConfig with MCP connection metadata, expands HarnessCapabilities with `mcpSupport`, updates `createLocalAdapterPool()` to register all local adapters, and wires adapter-specific config injection (MCP, model, workspace) into the session provisioning flow.

The HarnessAdapter interface is NOT changed. The AdapterPool is NOT changed (X3 already added harnessType filtering). The provisioning orchestrator gains minimal changes -- passing McpConnectionInfo through SessionConfig and conditionally skipping event-stream tool interception when the adapter declares MCP support.

---

## AC-to-implementation mapping

| AC | Implementation | Verification |
|----|---------------|--------------|
| AC1: HarnessAdapter interface unchanged | No edits to `harness-adapter.ts` interface | Type system (tsc) -- if interface changes, all adapters break |
| AC2a: Existing Claude SDK adapter | Already exists, no changes needed (X1 composed prompt, X4 resolved model already wired) | Existing tests pass |
| AC2b: CLI adapter | New file `cli-harness-adapter.ts` | Unit tests |
| AC2c: Built-in adapter stub | New file `builtin-harness-adapter.ts` | Unit tests |
| AC3: Pool selects by harnessType | Already implemented in X3 | Existing X3 tests pass |
| AC4: SessionConfig includes MCP + model info | Add `mcpConnectionInfo` to SessionConfig; `resolvedModel` already exists | Type check + unit tests |
| AC5: Adapters with MCP include connection info | CLI adapter writes env vars / passes args; Claude SDK adapter: `.mcp.json` (already written by provisioning) | Integration test |
| AC6: Non-MCP adapters fall back to event-stream | `mcpSupport` capability flag; provisioning checks it | Unit test |
| AC7: New adapters via register, no orchestrator changes | Registration in adapter pool is already generic | Structural (demonstrated by adding 2 new adapters without orchestrator changes) |

---

## File plan

### New files

| File | Package | Purpose |
|------|---------|---------|
| `packages/server/src/harness/cli-harness-adapter.ts` | server | CliHarnessAdapter implementation |
| `packages/server/src/harness/builtin-harness-adapter.ts` | server | BuiltinHarnessAdapter stub (X6 fills in) |
| `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts` | server | CLI adapter unit tests |
| `packages/server/src/harness/__tests__/X5-builtin-harness-adapter.test.ts` | server | Builtin adapter stub tests |
| `packages/server/src/harness/__tests__/X5-adapter-pool-multi.test.ts` | server | Multi-adapter registration + selection tests |
| `packages/server/src/harness/__tests__/X5-session-config-mcp.test.ts` | server | SessionConfig MCP info propagation tests |

### Modified files

| File | Change |
|------|--------|
| `packages/shared/src/harness/harness-adapter.ts` | Add `McpConnectionInfo` interface, add optional `mcpConnectionInfo` to `SessionConfig`, add `mcpSupport` to `HarnessCapabilities` |
| `packages/shared/src/harness/index.ts` | Export `McpConnectionInfo` |
| `packages/server/src/harness/adapter-pool.ts` | Update `createLocalAdapterPool()` to register CLI + builtin adapters alongside Claude SDK |
| `packages/server/src/services/session-provisioning.ts` | Pass `mcpConnectionInfo` into `SessionConfig` when bridge is created; conditionally skip tool_call event handling when adapter has `mcpSupport: true` |
| `packages/server/src/harness/claude-agent-sdk-adapter.ts` | Update `getCapabilities()` to include `mcpSupport: true` |
| `packages/server/src/harness/isolated-harness-adapter.ts` | Update `getCapabilities()` to include `mcpSupport: true` |
| `packages/server/src/harness/remote-harness-adapter.ts` | Update `getCapabilities()` to include `mcpSupport: false` (conservative default; remote workers declare their own capabilities) |
| `packages/shared/src/harness/mock-harness-adapter.ts` | Add `mcpSupport: false` to mock capabilities |

---

## Type changes

### packages/shared/src/harness/harness-adapter.ts

```typescript
/** X5: MCP bridge connection coordinates for a session. */
export interface McpConnectionInfo {
  readonly url: string;   // Full URL: "http://localhost:3001/api/mcp/<token>"
  readonly token: string; // 64-char hex session token
}

export interface SessionConfig {
  readonly workspacePath: string;
  /** @deprecated Use composedPrompt instead. Retained for path validation. */
  readonly soulPromptPath: string;
  /** X1: fully composed prompt text, written as CLAUDE.md in the workspace. */
  readonly composedPrompt: string;
  readonly modelTier: ModelTier;
  readonly tools: readonly string[];
  /**
   * X4: Resolved model configuration from the gateway.
   * When present, adapters use this instead of looking up by modelTier.
   * Optional for backward compatibility during migration.
   */
  readonly resolvedModel?: ResolvedModel;
  /**
   * X5: MCP bridge connection info for this session.
   * When present, adapters that support MCP can use this to configure
   * their harness's MCP client connection. Optional because:
   * - Bridge creation is best-effort (fails gracefully)
   * - BuiltinHarnessAdapter calls tool registry directly (no MCP needed)
   */
  readonly mcpConnectionInfo?: McpConnectionInfo;
}

export interface HarnessCapabilities {
  readonly preCompactionTrigger: boolean;
  readonly subAgents: boolean;
  readonly modelProviders: readonly string[];
  /**
   * X5: Whether this adapter supports MCP for tool calling.
   * When true, the provisioning orchestrator skips event-stream tool
   * interception -- the harness handles tools via MCP directly.
   * When false, tool_call events in the stream are intercepted and
   * dispatched to the tool registry by the provisioner.
   */
  readonly mcpSupport: boolean;
}
```

### Backward compatibility

Adding `mcpConnectionInfo` as optional to SessionConfig and `mcpSupport` to HarnessCapabilities is additive. Existing code that constructs SessionConfig without the new field continues to compile. Existing code that reads HarnessCapabilities will see the new field but doesn't break because it's accessed explicitly (not spread).

**However:** `mcpSupport` is a required field on `HarnessCapabilities`, which means all existing adapters must be updated to return it. This is intentional -- the field is load-bearing (provisioner uses it to decide tool interception), so it must not be accidentally omitted. Cost: 5 files updated with one line each.

---

## CliHarnessAdapter design

### Constructor and registration

```typescript
export interface CliAdapterConfig {
  /** Executable name or absolute path. Checked via `which` at registration. */
  readonly binary: string;
  /** CLI arguments with template variables: {{workspace}}, {{model}}, {{apiKey}}, {{baseUrl}}, {{mcpUrl}}. */
  readonly args: readonly string[];
  /** Environment variable mappings with same template variables. */
  readonly envMap: Readonly<Record<string, string>>;
  /** How to parse stdout. "ndjson" = one JSON HarnessEvent per line. "text" = raw text -> completion events. */
  readonly eventFormat: "ndjson" | "text";
  /** Env vars from host process to forward (same pattern as IsolatedHarnessAdapter). */
  readonly envAllowlist: readonly string[];
}

export class CliHarnessAdapter implements HarnessAdapter {
  private readonly config: CliAdapterConfig;
  private readonly sessions: Map<string, CliSession>;

  constructor(config: CliAdapterConfig) { ... }
  
  /** Check binary availability. Call before registering in pool. */
  static async checkAvailability(binary: string): Promise<boolean> { ... }
}
```

### startSession flow

1. Resolve template variables in `args` and `envMap` using values from `SessionConfig`:
   - `{{workspace}}` -> `config.workspacePath`
   - `{{model}}` -> `config.resolvedModel?.model ?? ""` 
   - `{{apiKey}}` -> `config.resolvedModel?.apiKey ?? ""`
   - `{{baseUrl}}` -> `config.resolvedModel?.baseUrl ?? ""`
   - `{{mcpUrl}}` -> `config.mcpConnectionInfo?.url ?? ""`
2. Build sandboxed env from `envAllowlist` + resolved `envMap` entries.
3. Spawn child process: `child_process.spawn(binary, resolvedArgs, { cwd: workspacePath, env: sandboxedEnv, stdio: ["pipe", "pipe", "pipe"] })`.
4. Return `SessionHandle` with a generated ID.

### streamEvents flow

1. Read `child.stdout` line by line (using readline or manual newline splitting).
2. For each line:
   - If `eventFormat === "ndjson"`: try `JSON.parse(line)`. If it has a `type` field matching a HarnessEvent type, yield it. Otherwise, yield `{ type: "completion", text: line }`.
   - If `eventFormat === "text"`: yield `{ type: "completion", text: line }`.
3. Also read `child.stderr` and yield as `{ type: "error", message: line, code: "CliStderr" }`.
4. When child process exits, the generator returns.

### stopSession flow

1. If child is still running: send SIGTERM.
2. Wait up to 5 seconds for exit.
3. If still running after 5s: send SIGKILL.
4. Map exit code to outcome: `0 -> "completed"`, `non-zero -> "crashed"`, `null (killed) -> "stopped"`.
5. Return `SessionResult` with zero cost/tokens (CLI tools don't report these through our channel; they may report via MCP or not at all).

### getCapabilities

```typescript
getCapabilities(): HarnessCapabilities {
  return {
    preCompactionTrigger: false, // External CLI tools don't expose compaction signals
    subAgents: false,            // External CLI tools manage their own sub-agents
    modelProviders: [],          // CLI tool brings its own provider; pool matches on harnessType, not provider
    mcpSupport: true,            // CLI tools use MCP (via .mcp.json) for tool calling
  };
}
```

Note: `modelProviders: []` is intentional. CLI adapters are selected by `harnessType`, not by provider capability. The CLI tool handles its own LLM calls. An empty array means the provider filter is never applied (it only filters when `requirements.modelProviders` is specified, which the provisioner currently does not do -- it only passes `harnessType`).

### Env sandboxing

Same pattern as IsolatedHarnessAdapter: explicit allowlist, never `...process.env`. The resolved API key from `resolvedModel` is injected through the `envMap` template, not by name. This keeps the security model consistent.

---

## BuiltinHarnessAdapter stub

```typescript
export class BuiltinHarnessAdapter implements HarnessAdapter {
  async startSession(_config: SessionConfig): Promise<SessionHandle> {
    // X6 implements the real agent loop.
    throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
  }

  async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
    throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
  }

  async stopSession(_handle: SessionHandle): Promise<SessionResult> {
    throw new Error("BuiltinHarnessAdapter: not yet implemented (see X6)");
  }

  getCapabilities(): HarnessCapabilities {
    return {
      preCompactionTrigger: true,
      subAgents: false,
      modelProviders: ["anthropic", "openrouter", "openai-compatible"],
      mcpSupport: false, // Builtin harness calls tool registry directly, no MCP
    };
  }
}
```

The stub throws on `startSession` so that if an agent is configured with `harnessType: "builtin"` before X6 lands, provisioning fails loudly rather than silently doing nothing.

---

## createLocalAdapterPool() changes

```typescript
export function createLocalAdapterPool(): AdapterPool {
  const pool = new AdapterPool();

  // 1. Claude Code adapter (existing)
  const claudeAdapter = new ClaudeAgentSdkAdapter();
  pool.register("local-claude-code", claudeAdapter, {
    name: "Claude Code",
    kind: "local",
    type: "claude-code",
    modelProviders: ["anthropic"],
    maxConcurrent: Number.parseInt(
      process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10
    ),
  });

  // 2. Built-in harness adapter (X6 fills in the implementation)
  const builtinAdapter = new BuiltinHarnessAdapter();
  pool.register("local-builtin", builtinAdapter, {
    name: "Built-in Harness",
    kind: "local",
    type: "builtin",
    modelProviders: ["anthropic", "openrouter", "openai-compatible"],
    maxConcurrent: Number.parseInt(
      process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10
    ),
  });

  // 3. CLI adapters: registered dynamically when available.
  // Each CLI tool gets its own adapter instance. Registration checks
  // binary availability and silently skips unavailable tools.
  registerCliAdaptersIfAvailable(pool);

  return pool;
}
```

### registerCliAdaptersIfAvailable

```typescript
/** Well-known CLI tool configurations. */
const CLI_TOOL_CONFIGS: Record<string, CliAdapterConfig> = {
  aider: {
    binary: "aider",
    args: ["--no-auto-commits", "--no-git", "{{workspace}}"],
    envMap: {
      ANTHROPIC_API_KEY: "{{apiKey}}",
      OPENAI_API_KEY: "{{apiKey}}",
    },
    eventFormat: "text",
    envAllowlist: ["PATH", "HOME", "LANG"],
  },
  goose: {
    binary: "goose",
    args: ["session", "--workspace", "{{workspace}}"],
    envMap: {
      ANTHROPIC_API_KEY: "{{apiKey}}",
    },
    eventFormat: "text",
    envAllowlist: ["PATH", "HOME", "LANG"],
  },
  opencode: {
    binary: "opencode",
    args: ["--dir", "{{workspace}}"],
    envMap: {
      ANTHROPIC_API_KEY: "{{apiKey}}",
    },
    eventFormat: "text",
    envAllowlist: ["PATH", "HOME", "LANG"],
  },
};

async function registerCliAdaptersIfAvailable(pool: AdapterPool): Promise<void> {
  for (const [name, config] of Object.entries(CLI_TOOL_CONFIGS)) {
    const available = await CliHarnessAdapter.checkAvailability(config.binary);
    if (available) {
      const adapter = new CliHarnessAdapter(config);
      pool.register(`local-cli-${name}`, adapter, {
        name: `CLI: ${name}`,
        kind: "local",
        type: "cli",
        modelProviders: [],
        maxConcurrent: Number.parseInt(
          process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "2", 10
        ),
      });
    }
  }
}
```

**Design decision:** All CLI tools register with `type: "cli"`, not `type: "aider"`. The agent config specifies `harnessType: "cli"` and the pool picks the least-loaded CLI adapter. Future: if per-tool selection is needed, change `type` to `"cli:aider"` and have agents specify `harnessType: "cli:aider"`.

**Correction after self-review:** This is wrong. An agent wanting to use Aider specifically should be able to get Aider, not Goose. Each CLI tool should register with its own type: `type: "aider"`, `type: "goose"`, `type: "opencode"`. The `harnessType` on the agent config is the selector. A generic `"cli"` type is meaningless -- the founder chose a specific tool. Revised:

```typescript
pool.register(`local-cli-${name}`, adapter, {
  name: `CLI: ${name}`,
  kind: "local",
  type: name, // "aider", "goose", "opencode"
  modelProviders: [],
  maxConcurrent: ...,
});
```

And the agent's `harnessType` column would be `"aider"`, `"goose"`, or `"opencode"`. Not `"cli"`.

---

## Session provisioning changes

### Passing McpConnectionInfo

In `session-provisioning.ts`, after the MCP bridge is created (Phase 8b), pass the connection info through to SessionConfig:

```typescript
// In Phase 9: start the harness session
harnessHandle = await harness.startSession({
  workspacePath,
  soulPromptPath: "",
  composedPrompt,
  modelTier,
  tools: allowedToolNames,
  resolvedModel: params.resolvedModel,
  // X5: MCP connection info when bridge was created successfully
  mcpConnectionInfo: mcpBridgeToken
    ? { url: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`, token: mcpBridgeToken }
    : undefined,
});
```

### Conditional tool_call interception

In Phase 10 (event stream drain), only intercept `tool_call` events when the adapter does NOT support MCP:

```typescript
// Before the event loop, check adapter capabilities
const adapterCapabilities = harness.getCapabilities();
const interceptToolCalls = !adapterCapabilities.mcpSupport || !mcpBridgeToken;

// In the event loop:
} else if (event.type === "tool_call") {
  eventBus.emit({ ... }); // Always emit for observability
  if (interceptToolCalls) {
    await registry.invoke(event.toolName, event.args);
  }
  // When mcpSupport is true and bridge is active, tool calls go through MCP.
  // The tool_call event in the stream is informational only -- the actual
  // invocation already happened via MCP before the event was emitted.
}
```

**Why check both `mcpSupport` AND `mcpBridgeToken`?** If the adapter claims MCP support but the bridge failed to create (mcpBridgeToken is undefined), we must fall back to event-stream interception. The bridge failure is already logged in Phase 8b.

---

## Capability declaration summary

| Adapter | mcpSupport | preCompactionTrigger | subAgents | modelProviders |
|---------|-----------|---------------------|-----------|---------------|
| ClaudeAgentSdkAdapter | true | true | true | ["anthropic"] |
| IsolatedHarnessAdapter | true | true | true | ["anthropic"] |
| RemoteHarnessAdapter | false | false | false | (from registration) |
| CliHarnessAdapter | true | false | false | [] |
| BuiltinHarnessAdapter | false | true | false | ["anthropic", "openrouter", "openai-compatible"] |
| MockHarnessAdapter | false | true | true | ["anthropic"] |

---

## HarnessType vocabulary

The `harnessType` values are free-form strings in the DB (`text` column) and adapter registration (`AdapterMeta.type`). X5 establishes these well-known values:

| harnessType | Adapter | Notes |
|-------------|---------|-------|
| `"claude-code"` | ClaudeAgentSdkAdapter | Existing from X3 |
| `"builtin"` | BuiltinHarnessAdapter | X6 fills in implementation |
| `"aider"` | CliHarnessAdapter (Aider config) | Only registered if `aider` binary found |
| `"goose"` | CliHarnessAdapter (Goose config) | Only registered if `goose` binary found |
| `"opencode"` | CliHarnessAdapter (OpenCode config) | Only registered if `opencode` binary found |

The `harnessType` is NOT an enum. New values can be added by registering new adapters. The DB column is `text`, not `enum`. The UI dropdown (X3) should be dynamically populated from `GET /api/workers` (which returns `AdapterInfo` including `type`).

---

## Task ordering

### Phase 1: Types (shared package)

1. Add `McpConnectionInfo` interface to `harness-adapter.ts`.
2. Add `mcpConnectionInfo?: McpConnectionInfo` to `SessionConfig`.
3. Add `mcpSupport: boolean` to `HarnessCapabilities`.
4. Export `McpConnectionInfo` from `harness/index.ts`.

### Phase 2: Update existing adapters (one-line each)

5. Add `mcpSupport: true` to `ClaudeAgentSdkAdapter.getCapabilities()`.
6. Add `mcpSupport: true` to `IsolatedHarnessAdapter.getCapabilities()`.
7. Add `mcpSupport: false` to `RemoteHarnessAdapter.getCapabilities()`.
8. Add `mcpSupport: false` to `MockHarnessAdapter.getCapabilities()`.

### Phase 3: New adapters

9. Create `CliHarnessAdapter` in `cli-harness-adapter.ts`.
10. Create `BuiltinHarnessAdapter` stub in `builtin-harness-adapter.ts`.

### Phase 4: Registration

11. Update `createLocalAdapterPool()` to register all three adapters.
12. Move `registerCliAdaptersIfAvailable` into adapter-pool.ts or a new `cli-adapter-configs.ts`.

### Phase 5: Provisioning integration

13. Update `session-provisioning.ts` to pass `mcpConnectionInfo` in SessionConfig.
14. Update Phase 10 event loop to conditionally skip tool_call interception.

### Phase 6: Tests

15. Write `X5-cli-harness-adapter.test.ts`.
16. Write `X5-builtin-harness-adapter.test.ts`.
17. Write `X5-adapter-pool-multi.test.ts`.
18. Write `X5-session-config-mcp.test.ts`.

---

## Trade-off analysis

### Template variables in CLI args vs. config file generation

**Chosen: template variables.** `{{workspace}}`, `{{model}}`, `{{apiKey}}`, `{{baseUrl}}`, `{{mcpUrl}}` in args and envMap.

Alternative: generate a config file per CLI tool (e.g. `.aider.conf.yml`, `goose.toml`) in the workspace.

| Dimension | Template vars | Config files |
|-----------|--------------|-------------|
| Complexity | Low -- string replacement | Medium -- per-tool file format knowledge |
| Coupling | Low -- adapter only knows arg shape | High -- adapter knows each tool's config format |
| Maintenance | Easy -- add new variables as needed | Hard -- track config format changes across tools |
| Flexibility | Medium -- some tools need files anyway | High -- any config option expressible |

Template variables win for v1. Config file generation can be added later as a `configFileTemplate` field in `CliAdapterConfig` if needed.

### One CLI adapter class vs. per-tool adapter classes

**Chosen: one parameterized class.** `CliHarnessAdapter` with `CliAdapterConfig`.

Alternative: `AiderAdapter extends HarnessAdapter`, `GooseAdapter extends HarnessAdapter`, etc.

| Dimension | Parameterized | Per-tool classes |
|-----------|--------------|-----------------|
| Code volume | 1 class + N configs | N classes with duplicated process management |
| Adding a tool | Add config object | Create new file + class |
| Tool-specific behavior | Must be in config | Can override methods |
| Testability | Test the class once with different configs | Test each class separately |

Parameterized wins. If a tool ever needs truly custom behavior (e.g. Aider's `/add` command protocol), a subclass can override specific methods.

### mcpSupport as capability flag vs. separate interface

**Chosen: field on HarnessCapabilities.** Simple boolean.

Alternative: `McpAwareAdapter extends HarnessAdapter` with `setupMcp(info: McpConnectionInfo)`.

The separate interface would be more type-safe but adds interface proliferation. A boolean on capabilities is sufficient because the provisioner's behavior change is binary (intercept tool_call or not). No adapter-specific MCP setup method is needed -- adapters read McpConnectionInfo from SessionConfig in their own `startSession`.

---

## Failure modes

1. **CLI binary not found at registration:** `checkAvailability` returns false, adapter not registered, no error. Agent with `harnessType: "aider"` gets `null` from pool.select(), provisioning throws "No available adapter."
2. **CLI process crashes during session:** Process exits with non-zero code. `streamEvents` generator returns. `stopSession` returns `outcome: "crashed"`. Provisioning flow handles this via existing crash path.
3. **CLI process hangs:** `stopSession` sends SIGTERM, waits 5s, sends SIGKILL. Same escalation as IsolatedHarnessAdapter. Session times out via existing provisioning timeout.
4. **NDJSON parse failure:** Malformed JSON line is yielded as `{ type: "completion", text: rawLine }`. No crash, no data loss. Logged to stderr.
5. **MCP bridge fails but adapter declared mcpSupport:** `interceptToolCalls` check uses `!mcpBridgeToken` as fallback condition. Tool calls from the event stream are intercepted. The CLI tool itself will fail on MCP calls (connection refused) -- its tool calls will error, which surfaces as error events.
6. **BuiltinHarnessAdapter selected before X6:** `startSession` throws "not yet implemented." Provisioning catches the error, reverts task to accepted, returns 500.

---

## Self-critique

**Scope risk:** The CLI adapter configs for Aider/Goose/OpenCode are best-guess. The actual CLI flags may differ. Mitigation: mark configs as provisional with a comment; they will be validated during X7 (E2E evals) or manual testing.

**NDJSON assumption:** Most CLI tools do NOT output structured JSON events on stdout. They output human-readable text. The `eventFormat: "text"` mode handles this, but it means no token/cost tracking for those tools. This is acceptable for v1 -- the MCP bridge provides the tool-call channel, and the harness's own cost tracking is a nice-to-have.

**Pool registration is sync but binary check is async:** `createLocalAdapterPool` is currently synchronous (returns `AdapterPool`). Adding async CLI registration means it needs to return `Promise<AdapterPool>` or the CLI registration must be deferred. Best approach: make `createLocalAdapterPool` async and update `server-factory.ts` (it's already in an async function). Cost: 2-3 call sites updated.

**Adapter ID change:** Changing the local Claude Code adapter ID from `"local"` to `"local-claude-code"` is a breaking change for any code that references the ID directly. Search the codebase: the only reference is in `createLocalAdapterPool` itself and tests. Tests should use pool.list() not hardcoded IDs. Acceptable.
