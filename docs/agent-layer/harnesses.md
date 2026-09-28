# Harnesses

A **harness** is a CLI tool or remote endpoint that runs an agent. HyperIdle supports four families.

## Capability descriptor

Each harness adapter declares a `HarnessCapabilityDescriptor` (`framework/harness-capability/src/harness/harness-capability-descriptor.ts`). The key fields:

| Field | What it is |
|---|---|
| `type` | `"claude-code"` · `"codex"` · `"opencode"` · `"cursor-agent"` |
| `kind` | `"local"` · `"remote"` |
| `authAction` | How to authenticate (kind, label, command) |
| `discovery` | Readiness state: `missing · installed · unauthenticated · ready · unavailable` |
| `models` | List of model descriptors the harness accepts |
| `returnEnforcement` | Non-optional — how HyperIdle provisions the return hook for this adapter |

`returnEnforcement` is declared on `HarnessCapabilities` in `framework/harness-protocol/src/harness/harness-adapter.ts` and is the enforcement channel used by the [return gate](./return-gate.md).

The descriptor describes the harness only. What an agent can reach through connections is a separate concept — see [connections](../architecture/connections.md).

## Discovery

`discoverLocalHarnesses()` (`layers/agent-execution/harness-registry/src/harness-discovery.ts`) probes the four families concurrently. Probes run version and auth-status commands — never provider credential files, never token values.

| State | Meaning |
|---|---|
| `missing` | Binary not found on PATH |
| `installed` | Binary present; auth state unknown |
| `unauthenticated` | Binary present; user must run the CLI login flow |
| `ready` | Binary present and authenticated |
| `unavailable` | Cannot be used; explicit reason provided |

The adapter pool (`layers/agent-execution/harness-registry/src/adapter-pool.ts`) selects the first ready adapter when no harness is specified for an agent.

## The four families

### `codex` (OpenAI Codex CLI)

Auth: `native_cli_login` → `codex login`. Discovery: `codex --version`; `codex login status` (checks "Logged in using" on stdout or stderr).

**Headless invocation:** `codex exec --sandbox workspace-write --model {{model}} {{prompt}} --json`. `--sandbox workspace-write` is required — codex defaults to read-only.

**MCP delivery:** `writeCliMcpConfig({ dialect: "codex-toml" })` appends `[mcp_servers.hyperidle]` to `<sandbox>/.codex-home/config.toml`. The token is delivered via `HYPERIDLE_MCP_TOKEN` (bearer_token_env_var in the TOML — never inline).

**Return enforcement:** `settings-codex` — a per-session `CODEX_HOME` is provisioned at `<sandbox>/.codex-home/` with `hooks.json` using the nested codex format. `CODEX_HOME` is injected into the spawn env; `--dangerously-bypass-hook-trust` bypasses the hook hash check.

### `claude-code` (Claude Code CLI)

Auth: `native_cli_login` → `claude auth login`. Discovery: `claude --version`; `claude auth status` JSON-parsed for `loggedIn: true`.

**Headless invocation:** `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` — the `claude` CLI; there is no SDK adapter.

**MCP delivery:** `.mcp.json` written into the sandbox at provisioning time (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) — `{ mcpServers: { hyperidle: { url: "…/api/mcp/${token}", type: "streamable-http" } } }`. Also written as `AGENTS.md` + `CLAUDE.md` (dual-write: `CLAUDE.md` is what current harnesses auto-discover; `AGENTS.md` is the cross-vendor standard).

**Return enforcement:** `settings-claude` — `.claude/settings.json` with a `hooks.Stop` entry whose command calls the return-status bridge.

### `opencode` (OpenCode CLI)

Auth: `native_cli_login` → `opencode providers login`. Discovery: `opencode --version`; `opencode providers list`.

**Headless invocation:** `opencode run {{prompt}} --dir {{sandbox}} --format json --pure --model {{model}}`. The model id must be provider-prefixed (e.g. `openrouter/...`).

**MCP delivery:** `writeCliMcpConfig({ dialect: "opencode-json" })` writes `opencode.json` into the sandbox; also injected via `OPENCODE_CONFIG` env var.

**Return enforcement:** `process-reengage` — no native blocking Stop hook. The adapter parses `step_finish` events in the stdout stream at turn end and re-invokes `opencode run <forceMessage>` when the agent has not returned. Bounded by `MAX_FORCE_RETURNS`.

### `cursor-agent` (Cursor Agent)

Auth: `native_cli_login` → `cursor-agent login`. Discovery: `cursor-agent --version`; `cursor-agent status`.

**Headless invocation:** `cursor-agent -p {{prompt}} --print --output-format stream-json --model {{model}} --trust --approve-mcps`. Auth is inherited from the Cursor login. Event shapes match claude-code's, so it reuses the `claude-stream-json` dialect.

**MCP delivery:** `writeCliMcpConfig({ dialect: "cursor-json" })`.

**Return enforcement:** `none` — no hook artifact written. The drain-gate floor is the only enforcement. See [return-gate.md](./return-gate.md).

## Bring your own key

HyperIdle holds no model API key. Each harness authenticates itself at login. An agent's `agent_run_config` names the harness and model; no key flows through HyperIdle.

## MCP bridge

CLI harnesses reach HyperIdle's tool registry through the stateful MCP bridge at `POST /api/mcp/:token` (`layers/agent-execution/harness-registry/src/mcp/`). One bridge instance per session token; the bridge stores a `WebStandardStreamableHTTPServerTransport` per token. The same route serves `POST /api/mcp/:token/return-status` — the return-gate adjudication endpoint.

## Event normalization

Raw harness output is normalized to the `HarnessEvent` union (`framework/harness-protocol/src/harness/harness-events.ts`) before consumers see it. The normalizer (`layers/agent-execution/harness-registry/src/harness-event-normalization.ts`) handles dialect differences across families. Event types: `token_usage`, `tool_call`, `completion`, `error`.
