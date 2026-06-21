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

**Event normalization: `unknown`.** `normalizeNativeHarnessEvent("opencode", line)` has no recognized shapes and falls through to `normalizeHarnessEvent` → `UnknownHarnessEvent`. The descriptor reports `runtime.fileEditing: false`, `runtime.toolUse: false`. This is the honest conservative state — no guessed normalization claim.

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

## Event Normalization Architecture

Two code paths converge on the `HarnessEvent` union — consumers cannot tell which path produced an event:

**Path 1: `builtin`** — `BuiltinHarnessAdapter.trackUsage` emits `token_usage`, `cost_update`, `completion` directly in union shape. No pre-normalizer.

**Path 2: CLI families** — `normalizeNativeHarnessEvent(family, nativeLine)` (`packages/shared/src/harness/harness-native-normalization.ts`) maps native shapes to union events:
- Codex `turn.completed.usage` → `token_usage`
- Claude `result.usage` → `token_usage`; `result.total_cost_usd` → `cost_update` (with `extractCost: true`)
- OpenCode: no recognized shapes → falls through to `normalizeHarnessEvent` → `UnknownHarnessEvent`
- Unrecognized types for any family → `normalizeHarnessEvent` → `UnknownHarnessEvent` (graceful degradation)

Three-way field equivalence (codex ≡ claude-code ≡ builtin) is asserted in `harness-event-normalization.test.ts`: all produce `{ type: "token_usage", inputTokens: number, outputTokens: number }` — no native snake_case leaks downstream.

**Note for AM3:** `normalizeNativeHarnessEvent` is exported from `packages/shared/src/harness/` but has no production caller yet. The session probe (`probeHarnessSession`) also has no production caller — `createLocalAdapterPool` intentionally omits the probe for latency reasons. AM3 should wire both into the dial-in session-routing pipeline.

---

## API Surface

`GET /api/harnesses` → `HarnessCapabilityDescriptor[]`

The route calls `pool.listCapabilityDescriptors()`, which:
1. Emits descriptors for all registered adapters (deduped by harness type).
2. Appends `missingKnownHarnessDescriptors()` for any of the four first-class families not yet registered, using discovery probe results.

The response never includes API keys, base URLs, subscription tokens, or credential file contents. Route tests assert `not.toContain("apiKey" | "baseUrl" | "sk-" | "subscriptionToken")`.

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

---

## Research Basis

- `plans/AM2/research/cli-harness-surface.md` — local CLI probe results: binary versions, auth behavior, launch commands, event format captures for Codex, Claude Code, OpenCode; Cursor absence confirmed.
- `plans/AM2/research/t3code-source-map.md` — t3code source paths for provider/harness discovery, auth, launch, status/version, event handling, and UI metadata across all five providers.

Both dossiers remain in `plans/AM2/research/` as permanent evidence records.

---

Next: [Model Routing and Cost](./model-routing-and-cost.md) — how descriptors integrate with model selection and cost enforcement.
