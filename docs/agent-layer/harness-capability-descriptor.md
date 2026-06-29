# Harness Capability Descriptor

A **harness capability descriptor** is the Kernel-owned, queryable declaration of what one registered harness backend can run and how downstream consumers may configure and interpret it. Descriptors are evidence-first: a field may only claim a capability backed by real source research or a passing real integration test. Unproven claims use `unknown`, `unavailable`, or are absent.

The descriptor exposes models, access mode, auth action, discovery state, runtime capabilities, and event normalization commitments — without leaking API keys, base URLs, or provider subscription tokens.

```ts
// packages/shared/src/harness/harness-capability-descriptor.ts
interface HarnessCapabilityDescriptor {
  type: string;              // e.g. "builtin", "codex", "claude-code", "opencode", "cursor-agent"
  name: string;
  kind: "local" | "remote";
  accessMode: "api-gateway" | "provider-subscription-cli" | "external-byo";
  authAction: HarnessAuthActionDescriptor;
  discovery: { state: HarnessReadinessState; version?: string; reason?: string };
  models: readonly HarnessModelDescriptor[];
  runtime: HarnessRuntimeCapabilities;
  modelProviders: readonly string[];
}
```

---

## Discovery and Readiness States

`discoverLocalHarnesses()` (`packages/server/src/harness/harness-discovery.ts`) runs public, non-destructive probes concurrently — version and auth-status commands only. It never reads provider credential files.

Possible states:

| State | Meaning |
|---|---|
| `missing` | Binary not found on PATH |
| `installed` | Binary present; auth/readiness unknown |
| `unauthenticated` | Binary present; user must run the CLI login flow |
| `ready` | Binary present and authenticated (or credential present for builtin) |
| `unavailable` | Cannot be used; explicit reason provided |

---

## First-Class Families — As-Built Proof Status

### `builtin` (API-gateway harness)

**Access mode:** `api-gateway`. Users make it ready by storing a model gateway credential in HyperIdle.

**Discovery:** `probeBuiltinGateway` checks the ordered gateway-usable credential set:
1. `ANTHROPIC_API_KEY` → `anthropic_api_key`
2. `OPENAI_API_KEY` → `openai_compatible_api_key`
3. `OPENROUTER_API_KEY` → `openrouter_api_key`

Reports `ready` when any credential is present, with the matched credential name in the auth action. Reports `unauthenticated` with the full checked-key list otherwise.

**Real gateway call proven:** Integration test `AM2-builtin-gateway.integration.test.ts` drives one harmless turn through `BuiltinHarnessAdapter` using the `openai-compatible` path (live call to `https://openrouter.ai/api`, 861ms round-trip on the proof machine). Asserts real normalized `token_usage`, `cost_update`, and `completion` events with a non-empty `completion.text` that differs from the probe prompt — the discriminator that forces a live provider call. No stub, no cassette.

**Runtime caps:** `fileEditing: true`, `toolUse: true` (builtin adapter declares them; builtin does not use the session-probe gate).

---

### `codex` (OpenAI Codex CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `codex login`.

**Discovery probes:**
- `codex --version` → version string (e.g. `codex-cli 0.141.0`)
- `codex login status` → stdout/stderr checked for "Logged in using" prefix

**Auth status observed:** `Logged in using ChatGPT` (writes to stderr; probe reads both stdout and stderr).

**Session probe proven:** `probeCodexSession` runs `codex exec "reply with the single word OK" --json` via `spawn` with `stdin: ignore` (prevents blocking on "Reading additional input from stdin..."). Captures the usage-bearing `turn.completed` JSONL line. Committed fixture: `packages/server/src/harness/__tests__/fixtures/codex-exec.jsonl`.

**Event normalization proven:** `normalizeNativeHarnessEvent("codex", line)` in `harness-native-normalization.ts` maps `turn.completed.usage.{input_tokens, output_tokens}` → `token_usage { inputTokens, outputTokens }`. Three-way equivalence with `claude-code` and `builtin` asserted in `harness-event-normalization.test.ts`.

**MCP delivery (AL7):** per-session `writeCliMcpConfig({ dialect: "codex-toml" })` appends `[mcp_servers.hyperidle]` to `$CODEX_HOME/config.toml` in the sandbox. The token is delivered via `HYPERIDLE_MCP_TOKEN` env var (not inline in the TOML — `bearer_token_env_var` field points codex at the env var). AL6 already injects `CODEX_HOME=<sandbox>/.codex-home`; AL7 appends the MCP block to that same config file. **Headless invocation:** `codex exec <prompt> --json --dangerously-bypass-approvals-and-sandbox`. Proven live against the PRODUCTION `createMcpBridge` + `createMcpRoute` at `/api/mcp/:token` (June 2026).

**Runtime caps:** `fileEditing` and `toolUse` are gated on `sessionProbe.ok === true` by `runtimeFromDiscovery`. In production today, `createLocalAdapterPool` does not run the session probe (cost/latency tradeoff), so these caps stay `false` until AM3 wires the probe.

---

### `claude-code` (Claude Code CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `claude auth login`.

**Discovery probes:**
- `claude --version` → `2.1.170 (Claude Code)`
- `claude auth status` → JSON parsed for `loggedIn: true`

**Auth status observed:** `{ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }`.

**Session probe proven:** `probeClaudeSession` runs `claude -p "say OK" --output-format stream-json --verbose --no-session-persistence`. Captures the usage-bearing `result` NDJSON event carrying `usage.{input_tokens, output_tokens}` and `total_cost_usd`. Committed fixture: `packages/server/src/harness/__tests__/fixtures/claude-stream.jsonl`.

**Event normalization proven:** `normalizeNativeHarnessEvent("claude-code", line)` maps:
- `result.usage.{input_tokens, output_tokens}` → `token_usage`
- `result.total_cost_usd` → `cost_update` (when called with `extractCost: true`)

**Runtime boundary note:** The production `claude-code` adapter is `ClaudeAgentSdkAdapter` (uses `@anthropic-ai/claude-agent` SDK + `ANTHROPIC_API_KEY`). The local `claude` CLI is authenticated separately via `claude.ai`. A user whose `claude` CLI is logged in but has no Anthropic API key gets a `ready` descriptor but an SDK session fails with `MissingCredentialError`. Full SDK-vs-CLI alignment is AM3+ scope.

---

### `opencode` (OpenCode CLI)

**Access mode:** `provider-subscription-cli`. Auth method: `native_cli_login` → `opencode providers login`.

**Discovery probes:**
- `opencode --version` → `1.17.8`
- `opencode providers list` → checked for credential or environment-variable presence

**Auth status observed:** OpenRouter credential + `OPENAI_API_KEY` environment variable detected.

**Session probe:** `probeOpenCodeSession` runs `opencode run "say OK" --format json`. The probe captured a `step_start` event (first parsable JSON line) — not a usage-bearing line. Committed fixture: `packages/server/src/harness/__tests__/fixtures/opencode-run.json`.

**Event normalization: pre-mapped (AL7).** opencode `--format json` emits raw JSONL types (`step_finish`, `tool`) that do not match the canonical `HarnessEventType` set. `preMapOpencodeEvent` in `packages/shared/src/harness/harness-event-normalization.ts` translates these before `normalizeHarnessEvent` runs:
- `step_finish` → `completion` (text extracted from `properties.output`, `output`, or `text`)
- `tool` → `tool_call` (toolName from `tool` or `name`; args from `input` or `args`)

This pre-map is required for the MCP-routed two-session loop to see opencode tool calls and turn completions. Proven live: opencode session-2 lane asserts `normalizeHarnessEvent` produces ≥1 non-error event (`AL7-two-session-trust-first.integration.test.ts`, June 2026). Locked in CI by `packages/shared/src/harness/__tests__/harness-event-normalization.test.ts`.

**MCP delivery (AL7):** per-session `writeCliMcpConfig({ dialect: "opencode-json" })` writes `opencode.json` into the sandbox cwd. opencode reads it at spawn, registering `mcp.hyperidle` as a remote MCP server. Token is inline in `headers.Authorization`. **Headless invocation:** `opencode run <prompt> --format json --pure --dir <sandbox> --model <provider/model>`. Proven live against the PRODUCTION `createMcpBridge` + `createMcpRoute` at `/api/mcp/:token` (June 2026).

---

### `cursor-agent` (Cursor Agent)

**Status: `unavailable`.**

`cursor` and `cursor-agent` binaries are not installed. Cursor integrates with the local Cursor IDE via its Agent CLI or ACP endpoint — there is no documented, scriptable headless local CLI surface that HyperIdle can drive without the IDE running.

`probeCursorAgentCli` reports `state: "unavailable"` with reason: `cursor / cursor-agent CLI is not installed or not on PATH and no documented headless local CLI surface exists`. The descriptor is emitted with no model claims, `runtime` caps all `false`.

AM4 onboarding should treat `unavailable` differently from `missing` — no install prompt for Cursor (there is nothing to install that provides a headless surface).

---

## Evidence-First Contract

A descriptor field is only `ready` or `true` when the evidence chain holds:

```
research dossier → architecture decision → implementation → real integration test
```

If any link is missing for a claimed-ready family, the descriptor must report `unknown` or `unavailable` instead. The AM2 reviewer verified this chain for every family before approving.

**Key rule:** `runtimeFromDiscovery` gates `fileEditing` and `toolUse` on `sessionProbe?.ok === true`. An `auth status` probe that proves login does NOT prove launchability. Only a real one-shot session execution flips these flags.

---

## Production MCP Bridge (AL7 — stateful)

CLI harnesses (claude-code, codex, opencode) that have no in-process SDK adapter reach HyperIdle's tool registry via the production MCP bridge at `/api/mcp/:token`:

```
CLI binary → [HTTP POST /api/mcp/:token] → createMcpRoute → bridgeRegistry.handleRequest → createMcpBridge instance → registry.invoke
```

**Bridge is stateful (AL7).** `createMcpBridge` (`packages/server/src/mcp/mcp-bridge.ts`) constructs one `WebStandardStreamableHTTPServerTransport` per session token with `sessionIdGenerator: () => crypto.randomUUID()`. Stateful mode is required because real CLI MCP clients issue separate HTTP requests for `initialize` → `tools/list` → `tools/call`; the stateless transport throws on the second request (`Stateless transport cannot be reused across requests`). The SDK issues a `mcp-session-id` response header on `initialize`; subsequent requests carry it. The bridge registry (`mcp-bridge-registry.ts`) stores one transport per session token in a `Map<token, McpBridgeInstance>` — the transport persists across requests and is freed on `unregister()` → `mcpServer.close()` → `transport.close()`.

**Two routing keys coexist.** The URL-path token (`/api/mcp/:token`) is HyperIdle's routing key (bridge registry lookup; 401 on unknown). The SDK's `mcp-session-id` header is the MCP-protocol session managed transparently by the transport. Both are independent; a request with a valid `mcp-session-id` but unknown path token still 401s at the registry.

**Session-capability proven in CI.** `mcp-bridge-stateful.integration.test.ts` drives the production factory+route through init→list→call via the SDK `Client` + `StreamableHTTPClientTransport`; sanity-break: POST without `mcp-session-id` → 400/404.

**How each CLI receives the MCP server URL:**
- **claude-code:** `.mcp.json` in the sandbox (`session-provisioning.ts` Phase 8b) — `{ mcpServers: { hyperidle: { url: "${mcpBaseUrl}/api/mcp/${token}", type: "streamable-http" } } }`.
- **codex:** `[mcp_servers.hyperidle]` block appended to `$CODEX_HOME/config.toml` by `writeCliMcpConfig({ dialect: "codex-toml" })`; token delivered via `HYPERIDLE_MCP_TOKEN` env var (`bearer_token_env_var` field).
- **opencode:** `opencode.json` written to sandbox cwd by `writeCliMcpConfig({ dialect: "opencode-json" })`; token inline in `headers.Authorization`.

---

## Event Normalization Architecture

Two code paths converge on the `HarnessEvent` union — consumers cannot tell which path produced an event:

**Path 1: `builtin`** — `BuiltinHarnessAdapter.trackUsage` emits `token_usage`, `cost_update`, `completion` directly in union shape. No pre-normalizer.

**Path 2: CLI families** — `normalizeNativeHarnessEvent(family, nativeLine)` (`packages/shared/src/harness/harness-native-normalization.ts`) maps native shapes to union events:
- Codex `turn.completed.usage` → `token_usage`
- Claude `result.usage` → `token_usage`; `result.total_cost_usd` → `cost_update` (with `extractCost: true`)
- OpenCode: `preMapOpencodeEvent` translates raw JSONL types before normalization: `step_finish`→`completion`, `tool`→`tool_call`. All other types fall through to `UnknownHarnessEvent` (graceful degradation).
- Unrecognized types for any family → `normalizeHarnessEvent` → `UnknownHarnessEvent`

Three-way field equivalence (codex ≡ claude-code ≡ builtin) is asserted in `harness-event-normalization.test.ts`: all produce `{ type: "token_usage", inputTokens: number, outputTokens: number }` — no native snake_case leaks downstream. The opencode pre-map (`step_finish`→`completion`, `tool`→`tool_call`, unmapped→`UnknownHarnessEvent`) is also asserted in `harness-event-normalization.test.ts` (AL7 NIT-3, locked in CI).

**Note for AM3:** `normalizeNativeHarnessEvent` is exported from `packages/shared/src/harness/` but has no production caller yet. The session probe (`probeHarnessSession`) also has no production caller — `createLocalAdapterPool` intentionally omits the probe for latency reasons. AM3 should wire both into the dial-in session-routing pipeline.

---

## API Surface (as-built — AM2 + AM4)

### `GET /api/harnesses` → `HarnessCapabilityDescriptor[]`

The route handler:
1. Calls `pool.listCapabilityDescriptors()` — emits descriptors for all registered adapters (deduped by harness type), then appends `missingKnownHarnessDescriptors()` for any of the four first-class families not yet registered.
2. Reads `readServerConfig(db).harnessDisabled` and stamps `discovery.disabled: true` on each descriptor whose `type` appears in the set. `builtin` is hard-exempt — it is never stamped disabled regardless of config.
3. Returns the stamped list.

The response never includes API keys, base URLs, subscription tokens, or credential file contents. Route tests assert `not.toContain("apiKey" | "baseUrl" | "sk-" | "subscriptionToken")`.

### `POST /api/harnesses/redetect` → `HarnessCapabilityDescriptor[]`

Re-runs `discoverLocalHarnesses()` server-side, refreshes the pool's discovery snapshot, stamps `discovery.disabled`, and returns the fresh descriptor list. Same shape as GET.

- Auth boundary: `requireBoundary({ kind: "public-data" })` — same as GET.
- Rate limit: dedicated `createRateLimiter({ limit: 1, windowMs: 5000 })` scoped to this route only (not the global 300/min). Excess returns 429. Rationale: `discoverLocalHarnesses()` spawns ~10 `execFile` probes each with a 15 000ms timeout — the global limiter would not protect against fork-bomb amplification.
- **What re-detect refreshes:** readiness state, version, auth status. **What it does NOT refresh:** runtime capabilities (`fileEditing`, `toolUse`, `mcpSupport`, `subAgents`). Those are gated on `sessionProbe.ok === true` and the session probe is not re-run on re-detect (cost/latency tradeoff; see AM2 `@lore`). Runtime caps remain `false` until AM3 wires the session probe into the dial-in pipeline.

### `POST /api/harnesses/:type/disabled` — enable/disable a backend

Persists the per-harness disabled state by writing to `server_config.harnessDisabled: string[]`.

- Body: `{ disabled: boolean }`
- `:type` must be a known harness type from `listCapabilityDescriptors()` → 400 on unknown type (prevents arbitrary key injection into the config blob).
- `{ disabled: true }` for `builtin` → 400/409 (the built-in harness is the always-present fallback and cannot be disabled; enforced as a write-boundary trust check independent of the UI).
- Returns the fresh `HarnessCapabilityDescriptor[]` with `discovery.disabled` re-stamped.
- Auth boundary: same as GET. Rate limit: global 300/min (single DB write, no CLI spawns, no amplification).

### `discovery.disabled` field

`HarnessDiscoveryStatus` carries an optional `discovery.disabled?: boolean` field (additive, does not break AM2/AH2 contract tests). It is **stamped in the route handler** — not by `listCapabilityDescriptors()` — because the pool is DB-free and `listCapabilityDescriptors()` is synchronous. The handler reads `readServerConfig(db).harnessDisabled` and maps disabled state over the descriptor list on every GET/redetect/disable response.

---

## Enable/Disable and `AdapterPool.select()`

AM4 adds a real per-harness enable/disable control backed by persisted config. When a backend is disabled:

1. **UI:** the backend row renders dimmed with `Toggle` off and "Disabled — …" status line; the capabilities fold hides.
2. **Session selection:** `AdapterPool.select()` skips the disabled backend. The disabled set is passed in by the **caller** (`admitSession` in `session-provisioning.ts`) via a new `disabledTypes?: readonly string[]` field on `SelectRequirements`. The pool itself is DB-free and synchronous — it cannot read config. `admitSession` reads `readServerConfig(db).harnessDisabled` and spreads `disabledTypes` into `selectRequirements` before calling `select()`.
3. **Builtin hard-exemption:** `select()` HARD-EXEMPTS `type === "builtin"` from the disabled filter regardless of what the persisted set contains. This is a back-stop against hand-edited or stale config — the always-present fallback can never be stranded.

The `builtin` hard-exemption is enforced in two independent places: the `select()` filter (back-stop) and the `POST /:type/disabled` write boundary (front-door) — both, not either/or.

---

## What This Is Not

- Not a Model Gateway replacement. The gateway owns model credential resolution and tier fallback.
- Not a session launch request. `SessionConfig` remains the concrete per-run input.
- Not backend-specific UI branching. UI controls render from option descriptors — no `harnessType` checks.
- Not Strategy-owned. Descriptors are Kernel-governed; Strategy reads them but cannot mutate or install harness extensions.
- Not a plugin marketplace. Extension trust policy is closed: first-party bundled and deployment-configured BYO only.

---

## Vocabulary

| Term | Definition |
|---|---|
| **Harness capability descriptor** | Queryable declaration of a harness backend's models, options, runtime support, status, and event normalization commitments |
| **Real harness capability** | A descriptor claim backed by source research, official CLI docs, or a passing real integration test |
| **Harness autodiscovery** | Kernel probe that finds known local harness CLIs and reports install/auth/readiness state |
| **Session probe** | One-shot harmless launch of a harness binary that proves launchability and captures a real event fixture |
| **Evidence chain** | The traceable path: dossier → architecture → implementation → real integration test |
| **Normalized harness event** | Backend-native event mapped into `HarnessEvent` before downstream consumers see it |
| **`UnknownHarnessEvent`** | Fallback for unrecognized native event types; preserves the raw type string in an `error` event |
| **`discovery.disabled`** | Optional boolean stamped by the route handler (not the pool) from `server_config.harnessDisabled`; `true` means the user has disabled this backend |
| **`harnessDisabled`** | `string[]` key in the `server_config` blob listing harness types the user has disabled; `builtin` is always exempt |

---

## Research Basis

- `plans/AM2/research/cli-harness-surface.md` — local CLI probe results: binary versions, auth behavior, launch commands, event format captures for Codex, Claude Code, OpenCode; Cursor absence confirmed.
- `plans/AM2/research/t3code-source-map.md` — t3code source paths for provider/harness discovery, auth, launch, status/version, event handling, and UI metadata across all five providers.

Both dossiers remain in `plans/AM2/research/` as permanent evidence records.

---

Next: [Model Routing and Cost](./model-routing-and-cost.md) — how descriptors integrate with model selection and cost enforcement.
