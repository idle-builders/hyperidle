# Destroyer input — `harness-registry` (agent-execution)

Package: `layers/agent-execution/harness-registry`
Surface: 20 exported functions, 6 classes (34 member methods), 14 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `createLocalAdapterPool` | yes | `layers/agent-execution/harness-registry/src/adapter-pool.ts:584` |
| 2 | `modelContextWindow` | internal | `layers/agent-execution/harness-registry/src/context-window.ts:29` |
| 3 | `createHarnessAdapter` | yes | `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:147` |
| 4 | `createHarnessAdapter` | yes | `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:148` |
| 5 | `createHarnessAdapter` | yes | `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:149` |
| 6 | `createHarnessAdapter` | yes | `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:150` |
| 7 | `createHarnessAdapter` | yes | `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:151` |
| 8 | `createCapabilityCatalog` | internal | `layers/agent-execution/harness-registry/src/harness-capability-descriptors.ts:235` |
| 9 | `discoverLocalHarnesses` | internal | `layers/agent-execution/harness-registry/src/harness-discovery.ts:834` |
| 10 | `probeHarnessSession` | internal | `layers/agent-execution/harness-registry/src/harness-session-probe.ts:272` |
| 11 | `setLlmInterceptor` | internal | `layers/agent-execution/harness-registry/src/llm-client.ts:657` |
| 12 | `callLlm` | internal | `layers/agent-execution/harness-registry/src/llm-client.ts:670` |
| 13 | `createMcpToolBridge` | internal | `layers/agent-execution/harness-registry/src/mcp/index.ts:19` |
| 14 | `openMcpBridgeSession` | internal | `layers/agent-execution/harness-registry/src/mcp/index.ts:74` |
| 15 | `closeMcpBridgeSession` | internal | `layers/agent-execution/harness-registry/src/mcp/index.ts:88` |
| 16 | `createMcpSession` | internal | `layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts:119` |
| 17 | `createMcpRouter` | internal | `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:66` |
| 18 | `provisionHarnessEnvironment` | yes | `layers/agent-execution/harness-registry/src/provision-harness-environment.ts:14` |
| 19 | `createReturnEnforcement` | yes | `layers/agent-execution/harness-registry/src/return-enforcement.ts:75` |
| 20 | `createSandboxAdapter` | yes | `layers/agent-execution/harness-registry/src/sandbox-adapter.ts:25` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `AdapterPool` — `layers/agent-execution/harness-registry/src/adapter-pool.ts:54` (public)
- `AdapterPool.refresh`
- `AdapterPool.size`
- `AdapterPool.register`
- `AdapterPool.unregister`
- `AdapterPool.has`
- `AdapterPool.list`
- `AdapterPool.pause`
- `AdapterPool.resume`
- `AdapterPool.select`
- `AdapterPool.describe`
- `AdapterPool.release`

### `BuiltinHarnessAdapter` — `layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts:135` (internal)
- `BuiltinHarnessAdapter.setSessionToolRegistry`
- `BuiltinHarnessAdapter.startSession`
- `BuiltinHarnessAdapter.streamEvents`
- `BuiltinHarnessAdapter.stopSession`
- `BuiltinHarnessAdapter.getCapabilities`
- `BuiltinHarnessAdapter.getForceReturnCount`

### `CliHarnessAdapter` — `layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:427` (internal)
- `CliHarnessAdapter.checkAvailability`
- `CliHarnessAdapter.startSession`
- `CliHarnessAdapter.streamEvents`
- `CliHarnessAdapter.stopSession`
- `CliHarnessAdapter.getCapabilities`

### `DisabledSandboxAdapter` — `layers/agent-execution/harness-registry/src/disabled-sandbox-adapter.ts:12` (internal)
- `DisabledSandboxAdapter.spawn`
- `DisabledSandboxAdapter.exec`
- `DisabledSandboxAdapter.destroy`

### `LocalSandboxAdapter` — `layers/agent-execution/harness-registry/src/local-sandbox-adapter.ts:56` (internal)
- `LocalSandboxAdapter.spawn`
- `LocalSandboxAdapter.exec`
- `LocalSandboxAdapter.destroy`
- `LocalSandboxAdapter.exists`

### `RemoteHarnessAdapter` — `layers/agent-execution/harness-registry/src/remote-harness-adapter.ts:80` (internal)
- `RemoteHarnessAdapter.startSession`
- `RemoteHarnessAdapter.streamEvents`
- `RemoteHarnessAdapter.stopSession`
- `RemoteHarnessAdapter.getCapabilities`
- `RemoteHarnessAdapter.dispatchMessage`

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `SelectRequirements` (interface, public) `layers/agent-execution/harness-registry/src/adapter-pool.ts:28` — members: `modelProviders`, `harnessType`, `disabledTypes`
- `AdapterFilter` (interface, public) `layers/agent-execution/harness-registry/src/adapter-pool.ts:47` — members: `type`, `kind`, `includeKnownMissing`
- `HarnessAdapterSpec` (type, public) `layers/agent-execution/harness-registry/src/harness-adapter-factory.ts:48`
- `CallLlmOptions` (interface, internal) `layers/agent-execution/harness-registry/src/llm-client.ts:33` — members: `model`, `messages`, `tools`, `maxTokens`, `system`, `timeoutMs`, `signal`
- `LlmInterceptor` (type, internal) `layers/agent-execution/harness-registry/src/llm-client.ts:639`
- `LlmContentBlock` (type, internal) `layers/agent-execution/harness-registry/src/llm-types.ts:30`
- `LlmMessage` (interface, internal) `layers/agent-execution/harness-registry/src/llm-types.ts:32` — members: `role`, `content`
- `LlmResponse` (interface, internal) `layers/agent-execution/harness-registry/src/llm-types.ts:38` — members: `stopReason`, `content`, `usage`
- `McpToolBridge` (interface, public) `layers/agent-execution/harness-registry/src/mcp/index.ts:9` — members: `router`, `open`, `close`
- `ProvisionOptions` (interface, public) `layers/agent-execution/harness-registry/src/provision-harness-environment.ts:5` — members: `sandboxPath`, `mcpUrl`, `token`, `dialect`, `channel`, `forceBudget`
- `ReturnEnforcementSpec` (interface, public) `layers/agent-execution/harness-registry/src/return-enforcement.ts:8` — members: `isolated`
- `SandboxHandle` (interface, public) `layers/agent-execution/harness-registry/src/sandbox-adapter.ts:8` — members: `sandboxId`, `path`
- `ExecResult` (interface, public) `layers/agent-execution/harness-registry/src/sandbox-adapter.ts:13` — members: `stdout`, `stderr`, `exitCode`
- `SandboxAdapter` (interface, public) `layers/agent-execution/harness-registry/src/sandbox-adapter.ts:19` — members: `spawn`, `exec`, `destroy`

## D. Const / enum exports

- `returnStatusTool` (const, internal) `layers/agent-execution/harness-registry/src/return-status-tool.ts:159`
