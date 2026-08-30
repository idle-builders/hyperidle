# Harness Capability Descriptor

A **harness capability descriptor** is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it. Descriptors are evidence-first: a field may only claim a capability backed by real source research or a passing real integration test. Unproven claims use `unknown`, `unavailable`, or are absent.

The descriptor exposes models, access mode, auth action, discovery state, runtime capabilities, and event normalization commitments — without leaking API keys, base URLs, or provider subscription tokens (route tests assert this: `layers/core-api/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts`). It describes the harness only: what an agent may **reach** is a separate concept owned by the [Connection model](../architecture/connection-model.md) — the descriptor carries no reach field (AU36).

```ts
// framework/harness-capability/src/harness/harness-capability-descriptor.ts (authoritative)
interface HarnessCapabilityDescriptor {
  type: string;              // "builtin", "codex", "claude-code", "opencode", "cursor-agent"
  name: string;
  kind: "local" | "remote";
  accessMode: "api-gateway" | "provider-subscription-cli" | "external-byo";
  authAction: HarnessAuthActionDescriptor;
  discovery: HarnessDiscoveryStatus;          // state, version?, reason?, disabled? (AM4)
  models: readonly HarnessModelDescriptor[];
  runtime: HarnessRuntimeCapabilities;
  modelProviders: readonly string[];
}
```

One additive field postdates the original AM2 shape:

- **`discovery.disabled?: boolean`** (AM4) — stamped by the route handler (not the pool, which is DB-free) from `server_config.harnessDisabled`. `builtin` is always exempt. See [Enable/Disable](#enabledisable-and-adapterpoolselect).

`inheritedTools?` (AN1) was DELETED by AU36 — reach moved into the connections domain (`InheritedConnectionFact`, probed and cached by `@hyperidle/connections`). No compatibility field remains. The held/inherited Connection split lives in [connection-model](../architecture/connection-model.md).

---

## Discovery and Readiness States

`discoverLocalHarnesses()` (`layers/agent-execution/harness-registry/src/harness-discovery.ts`) probes the five known families concurrently (`Promise.all`). Probes run version and auth-status commands — never provider credential files, never token values. (The harness-config MCP-name probes AN1 added here moved to the connections domain under AU36 — see the [Connection model](../architecture/connection-model.md) reach seam.)

| State | Meaning |
|---|---|
| `missing` | Binary not found on PATH |
| `installed` | Binary present; auth/readiness unknown |
| `unauthenticated` | Binary present; user must run the CLI login flow |
| `ready` | Binary present and authenticated (or credential present for builtin) |
| `unavailable` | Cannot be used; explicit reason provided |

---

## First-Class Families

### `builtin` (API-gateway harness)

**Access mode:** `api-gateway`. Users make it ready by storing a model gateway credential in HyperIdle.

**Discovery:** `probeBuiltinGateway` (`harness-discovery.ts`) checks the ordered gateway-usable credential set:
1. `ANTHROPIC_API_KEY` → `anthropic_api_key`
2. `OPENAI_API_KEY` → `openai_compatible_api_key`
3. `OPENROUTER_API_KEY` → `openrouter_api_key`

Reports `ready` when any credential is present, with the matched credential name in the auth action. Reports `unauthenticated` with the full checked-key list otherwise.

**Real gateway call proven:** `AM2-builtin-gateway.integration.test.ts` drives one harmless turn through `BuiltinHarnessAdapter` via the `openai-compatible` path (live OpenRouter call — no stub, no cassette) and asserts real normalized `token_usage` and `completion` events with a non-empty `completion.text` differing from the probe prompt. (`cost_update` was removed — harness telemetry is token usage only.)

**Runtime caps:** `fileEditing`/`toolUse` resolve `true` via the `?? true` defaults in `runtimeFromCapabilities` (`harness-capability-descriptors.ts`) — the builtin adapter does not declare them itself, and it declares `mcpSupport: false`. Builtin does not use the session-probe gate.

### `codex` (OpenAI Codex CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `codex login`.

**Discovery probes** (`probeCodexCli`, `harness-discovery.ts`): `codex --version`; `codex login status` checked for the "Logged in using" prefix on stdout **or** stderr (codex writes it to stderr).

**Session probe:** `probeCodexSession` (`layers/agent-execution/harness-registry/src/harness-session-probe.ts`) runs `codex exec "reply with the single word OK" --json` with stdin ignored (prevents blocking on "Reading additional input from stdin..."). Captures the usage-bearing `turn.completed` JSONL line. Committed fixture: `layers/agent-execution/harness-registry/src/__tests__/fixtures/codex-exec.jsonl`.

**Production headless invocation:** `codex exec --sandbox workspace-write --model {{model}} {{prompt}} --json` (`adapter-pool.ts`). `--sandbox workspace-write` is required — codex defaults to a read-only sandbox and refuses all file writes without it.

**MCP delivery:** per-session `writeCliMcpConfig({ dialect: "codex-toml" })` appends `[mcp_servers.hyperidle]` to `<sandbox>/.codex-home/config.toml`. The token is delivered via the `HYPERIDLE_MCP_TOKEN` env var — `bearer_token_env_var` points codex at it; the token is never inline in the TOML.

### `claude-code` (Claude Code CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `claude auth login`.

**Discovery probes** (`probeClaudeCodeCli`, `harness-discovery.ts`): `claude --version`; `claude auth status` JSON-parsed for `loggedIn: true`.

**Session probe:** `probeClaudeSession` (`harness-session-probe.ts`) runs `claude -p "say OK" --output-format stream-json --verbose --no-session-persistence`. Captures the usage-bearing `result` NDJSON event carrying `usage.{input_tokens, output_tokens}`. The line also carries `total_cost_usd`, but the adapter no longer captures it — harness telemetry is token usage only. Committed fixture: `fixtures/claude-stream.jsonl`.

**Production adapter is the real `claude` CLI:** `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (`adapter-pool.ts`). The former SDK adapter (`ClaudeAgentSdkAdapter`) is deleted — CLI login IS the production auth path, so there is no SDK-vs-CLI credential mismatch.

**MCP delivery:** `.mcp.json` written into the sandbox at provisioning time (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) — `{ mcpServers: { hyperidle: { url: "${mcpBaseUrl}/api/mcp/${token}", type: "streamable-http" } } }`.

### `opencode` (OpenCode CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `opencode providers login`.

**Discovery probes** (`probeOpenCodeCli`, `harness-discovery.ts`): `opencode --version`; `opencode providers list` checked for `/\d+\s+credentials/` regex or `"environment variable"` string on stdout. Ready state keeps `fileEditing`/`toolUse` conservatively `false` until a session probe proves launchability.

**Session probe:** `probeOpenCodeSession` (`harness-session-probe.ts`) runs `opencode run "say OK" --format json`, capturing the first parsable JSON line. Committed fixture: `fixtures/opencode-run.json`.

**Production headless invocation:** `opencode run {{prompt}} --dir {{sandbox}} --format json --pure --model {{model}}` (`adapter-pool.ts`). The model id must be provider-prefixed (e.g. `openrouter/...`) — a bare id fails.

**MCP delivery:** `writeCliMcpConfig({ dialect: "opencode-json" })` writes `opencode.json` into the sandbox cwd; token inline in `headers.Authorization`. The config path is also injected via the `OPENCODE_CONFIG` env var so opencode loads it regardless of cwd resolution (`cli-mcp-config.ts`).

### `cursor-agent` (Cursor Agent)

**Discovery probes** (`probeCursorAgentCli`, `harness-discovery.ts`): `cursor-agent --version`; `cursor-agent status` checked for a `"Logged in"` substring on stdout or stderr. Four outcomes:

- `missing` — binary not on PATH.
- `ready` — logged in. Declares `runtime: { fileEditing: true, toolUse: true }` directly from the probe.
- `unauthenticated` — installed but `status` reports not logged in.
- `installed` — installed, auth state unparseable; the reason echoes the first 120 chars of the observed output.

Every non-`missing` state carries `authAction: { kind: "native_cli_login", command: ["cursor-agent", "login"] }`, so the settings row has a real login CTA.

**Production headless invocation:** `cursor-agent -p {{prompt}} --print --output-format stream-json --model {{model}} --trust --approve-mcps` (`adapter-pool.ts`). Event shapes match claude's, so it reuses the `claude-stream-json` dialect. Auth is inherited from the Cursor login — no key in `envMap`. `--trust` + `--approve-mcps` allow headless workspace + MCP without interactive prompts.

**MCP delivery:** `writeCliMcpConfig({ dialect: "cursor-json" })`. Its declared `returnEnforcementChannel` is `"none"` — no hook artifact is written, so the drain-gate floor is its only return enforcement (see [return-gate-enforcement](./return-gate-enforcement.md)).

---

## Evidence-First Contract

A descriptor field is only `ready` or `true` when real evidence backs it:

```
research dossier → architecture decision → implementation → real integration test
```

If any link is missing for a claimed-ready family, the descriptor must report `unknown` or `unavailable` instead.

**Key rule:** `runtimeFromDiscovery` (`harness-capability-descriptors.ts`) gates `fileEditing` and `toolUse` on `sessionProbe?.ok === true`. An `auth status` probe that proves login does NOT prove launchability — only a real one-shot session execution flips these flags.

**Scope caveat:** the session-probe gate covers the **discovery path only** — unregistered/missing families. A binary on PATH gets a registered adapter (`registerCliAdaptersIfAvailable`), and a registered adapter's descriptor goes through `runtimeFromCapabilities` (`harness-capability-descriptors.ts`), where `fileEditing ?? true` / `toolUse ?? true` resolve `true` without any session probe.

**Session probe wiring:** `probeHarnessSession` still has no production caller — discovery intentionally skips it for latency (adapter-pool `@lore`); its callers are integration tests. Event normalization, by contrast, IS production-wired (see below).

---

## Adapter Contract and Pre-Compaction

`HarnessCapabilities` (`framework/harness-protocol/src/harness/harness-adapter.ts`) is what every adapter declares; the descriptor's `runtime` block projects from it:

- `preCompactionTrigger` — whether the adapter can signal imminent context compaction
- `subAgents`, `mcpSupport`, `modelProviders`, optional `fileEditing`/`toolUse`
- `returnEnforcement` — non-optional per-harness channel; mechanism owned by [return-gate-enforcement](./return-gate-enforcement.md)
- `mcpConfig` dialect — which per-session MCP config file the CLI needs (see MCP bridge below)

**Pre-compaction:** adapters with `preCompactionTrigger: true` emit a `pre_compaction` event (`PreCompactionEvent { type: "pre_compaction", contextTokens, maxTokens }`, `framework/harness-protocol/src/harness/harness-events.ts`) when context pressure crosses a threshold. The correct signal is the **latest call's** `inputTokens` against the model context window — not a cumulative sum, which over-counts by the number of calls (`layers/agent-execution/harness-registry/src/context-window.ts`). The builtin adapter emits it (`layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts`); normalization passes it through unchanged. What a session does with the trigger (final note-writing pass) is a session-boundary concern — see [tasks-and-sessions](../process-layer/tasks-and-sessions.md).

---

## Production MCP Bridge (stateful)

CLI harnesses (claude-code, codex, opencode) reach HyperIdle's tool registry via the production MCP bridge at `/api/mcp/:token`:

```
CLI binary → [HTTP POST /api/mcp/:token] → createMcpRoute → bridgeRegistry.handleRequest → createMcpBridge instance → registry.invoke
```

**Bridge is stateful.** `createMcpBridge` (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts`) constructs one `WebStandardStreamableHTTPServerTransport` per session token with `sessionIdGenerator: () => crypto.randomUUID()`. Stateful mode is required because real CLI MCP clients issue separate HTTP requests for `initialize` → `tools/list` → `tools/call`; the stateless transport throws on the second request. The SDK issues an `mcp-session-id` response header on `initialize`; subsequent requests carry it. The bridge registry (same file) stores one transport per session token in a `Map<token, McpBridgeInstance>`; teardown calls only `mcpServer.close()` — the transport closes transitively (an explicit second `transport.close()` would double-close).

**Two routing keys coexist.** The URL-path token is HyperIdle's routing key (bridge registry lookup; 401 on unknown). The SDK's `mcp-session-id` header is the MCP-protocol session managed transparently by the transport. Both are independent; a valid `mcp-session-id` with an unknown path token still 401s.

**Proven in tests:** `mcp-bridge-stateful.integration.test.ts` drives the production factory+route through init→list→call via the SDK `Client` + `StreamableHTTPClientTransport`; sanity-break: POST without `mcp-session-id` → 400/404.

Per-CLI config delivery is listed under each family above. The gate that routes a consequential action to a human is being rebuilt; no document describes a live mechanism for it until it lands.

---

## Event Normalization Architecture

Two code paths converge on the `HarnessEvent` union — consumers cannot tell which path produced an event:

**Path 1: `builtin`** — `BuiltinHarnessAdapter` emits `token_usage`, `completion` directly in union shape. No pre-normalizer. (`cost_update` was removed — harness telemetry is token usage only; see `layers/agent-execution/harness-registry/src/__testing__/llm-cassette.ts` lore.)

**Path 2: CLI families** — everything flows through `normalizeHarnessEvent` (`framework/harness-protocol/src/harness/harness-event-normalization.ts`) with per-family pre-maps:

- **claude-code:** `preMapClaudeEvent` (`:79`) translates stream-json types (`assistant`/`result`/`system`) to canonical types before normalization; applied explicitly by the CLI adapter when `eventDialect === "claude-stream-json"`, not inside `normalizeHarnessEvent`. `result.usage` → `token_usage`. `result.total_cost_usd` is present on the wire but no longer captured — no `cost_update` event exists.
- **codex:** `turn.completed.usage.{input_tokens, output_tokens}` → `token_usage`, handled inside `normalizeHarnessEvent` (`:254`).
- **opencode:** `preMapOpencodeEvent` (`:139`) translates raw JSONL types: `step_finish` → `completion`, `tool` → `tool_call`, plus `step_start` and `text` branches (AR2). Required for the MCP-routed loop to see opencode tool calls and turn completions.
- Unrecognized types for any family → `UnknownHarnessEvent` (an `error` event preserving the raw type string — graceful degradation).

**Production caller:** `cli-harness-adapter.ts` — the production event loop calls `normalizeHarnessEvent` on every parsed line.

**Locked in CI:** three-way field equivalence (codex ≡ claude-code ≡ builtin all produce `{ type: "token_usage", inputTokens, outputTokens }`, no native snake_case downstream) and the opencode pre-map, in `framework/harness-protocol/src/harness/__tests__/harness-event-normalization.test.ts` + `harness-event-normalization-codex.test.ts`. Harness test enforcement (locked models, and the symmetry expectation that no longer has an enforcer) is owned by [harness-coverage-enforcement](./harness-coverage-enforcement.md).

---

## API Surface

### `GET /api/harnesses` → `HarnessCapabilityDescriptor[]`

The route handler (`layers/core-api/src/routes/harnesses.ts`):
1. Calls `pool.describe()` — descriptors for all registered adapters (deduped by type) plus `missingKnownHarnessDescriptors()` for unregistered first-class families (`adapter-pool.ts`).
2. Stamps `discovery.disabled: true` from `readServerConfig(db).harnessDisabled`; `builtin` is never stamped.
3. Returns the stamped list. The response never includes API keys, base URLs, subscription tokens, or credential file contents.

### `POST /api/harnesses/redetect` → `HarnessCapabilityDescriptor[]`

Re-runs `discoverLocalHarnesses()` server-side, refreshes the pool's discovery snapshot, stamps `discovery.disabled`, and returns the fresh list. Since AU36 the same moment also refreshes inherited reach (the Application wires the connections domain's `inheritedReach.refresh` via `onHarnessRedetect`, awaited alongside the discovery refresh before the response returns).

- Auth boundary: `requireBoundary({ kind: "public-data" })` — same as GET.
- Rate limit: dedicated `createRateLimiter({ limit: 1, windowMs: 5000 })` scoped to this route (`layers/core-api/src/routes/harnesses.ts`), not the global limiter. Excess returns 429. Rationale: discovery spawns ~10 `execFile` probes each with a 15s timeout — fork-bomb amplification guard.
- Refreshes readiness state, version, auth status. Does NOT re-run the session probe or refresh runtime capabilities.

### `POST /api/harnesses/:type/disabled`

Persists per-harness disabled state to `server_config.harnessDisabled: string[]` (`layers/core-api/src/routes/harnesses.ts`).

- Body: `{ disabled: boolean }`
- Unknown `:type` → 400 (prevents arbitrary key injection into the config blob).
- `{ disabled: true }` for `builtin` → **409** (the always-present fallback cannot be disabled; enforced as a write-boundary trust check independent of the UI).
- Returns the fresh descriptor list with `discovery.disabled` re-stamped.
- Auth boundary: same as GET. Rate limit: global (single DB write, no CLI spawns).

---

## Enable/Disable and `AdapterPool.select()`

When a backend is disabled:

1. **UI:** the backend row renders dimmed with the toggle off; the capabilities fold hides (`layers/core-ui/src/settings/SettingsHarnesses.tsx`, `layers/core-ui/src/settings/harness-presentation.ts`).
2. **Session selection:** `AdapterPool.select()` skips it via `SelectRequirements.disabledTypes` (`adapter-pool.ts`). The pool is DB-free and synchronous — the **caller** supplies the set: `admitSession` (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) reads `readServerConfig(db).harnessDisabled` and spreads it into the requirements.
3. **Builtin hard-exemption:** `select()` HARD-EXEMPTS `type === "builtin"` from the disabled filter regardless of the persisted set — a back-stop against hand-edited or stale config stranding the fallback.

The `builtin` exemption is enforced in two independent places: the `select()` filter (back-stop) and the `POST /:type/disabled` 409 (front-door) — both, not either/or. In the web UI the single allowed `harnessType` literal check is `"builtin"` in `showsToggle`, ESLint-enforced (`layers/core-ui/src/settings/harness-presentation.ts`).

---

## What This Is Not

- Not a Model Gateway replacement. The gateway owns model credential resolution and tier fallback — see [model-routing-and-cost](./model-routing-and-cost.md).
- Not a session launch request. `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. UI controls render from option descriptors — no `harnessType` checks (ESLint-enforced, single `"builtin"` exception).
- Not Strategy-owned. Descriptors are Kernel-governed; Strategy reads them but cannot mutate or install harness extensions.
- Not a plugin marketplace. Extension trust policy is closed: first-party bundled and deployment-configured BYO only.

---

## Research Basis

- `plans/AM2/research/cli-harness-surface.md` — local CLI probe results: binary versions, auth behavior, launch commands, event format captures; Cursor absence confirmed.
- `plans/AM2/research/t3code-source-map.md` — t3code source paths for provider/harness discovery, auth, launch, status/version, event handling, and UI metadata.

---

Next: [Model Routing and Cost](./model-routing-and-cost.md) — how descriptors integrate with model selection and cost enforcement.
