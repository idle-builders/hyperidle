# AM2 Architecture — Harness Capability Descriptor & Normalization

## Required Reading

Implementer must read:

- `.pipeline/work-packages/TRACK-AM.md` § AM2.
- `plans/AM2/concept.md`.
- `docs/agent-layer/harness-capability-descriptor.md`.
- `docs/architecture/kernel-strategy-split.md` § 1 and § 2a.
- `docs/architecture/components.md` § 2.7.
- `docs/agent-layer/model-routing-and-cost.md` § 6.
- `docs/process-layer/canonical-shapes.md` Money and TokenUsage entries.
- `docs/agent-layer/harness-error-taxonomy.md`.
- `packages/shared/src/harness/harness-adapter.ts`.
- `packages/shared/src/harness/harness-events.ts`.
- `packages/shared/src/model-gateway.ts`.
- `packages/server/src/harness/adapter-pool.ts`.
- `packages/server/src/routes/harnesses.ts`.

## Phase 0 — Understanding

AM2 is backend/contract substrate. `/design` is skipped because there is no rendered surface; AM3 consumes the descriptor in UI later.

No unresolved concept questions remain. The locked concept decides:

- All concrete harnesses are extension-provided.
- `builtin` is the first-party API-gateway/direct-key harness for OpenRouter and similar gateways.
- `codex`, `claude-code`, `cursor-agent`, and `opencode` are first-class CLI/subscription harness families.
- CLI login is a standardized HyperIdle action that delegates to native CLI login; HyperIdle observes readiness and does not copy provider subscription tokens.
- Strategy reads descriptor facts and may express preferences, but Kernel owns registry, admission, session, sandbox, cost, and execution.

## Plan Reconciliation

| Spec assumption | Reality | Plan handling |
|---|---|---|
| `HarnessAdapter.getCapabilities()` exists. | It returns only `preCompactionTrigger`, `subAgents`, `modelProviders`, `mcpSupport`. | Preserve existing flags and extend the shared type with descriptor fields instead of replacing the method. Existing consumers keep working. |
| `/api/harnesses` is UI-queryable. | Route returns legacy selector entries `{ type, name, modelProviders }[]` and tests protect auth/dedup/no-secret behavior. | Return enriched descriptor entries that retain legacy fields. SettingsAgents can continue reading `type/name/modelProviders`; AM3 can read `models/options/readiness`. |
| Event normalization exists. | `HarnessEvent` union already covers `tool_call`, `completion`, `error`, `cost_update`, `token_usage`, `pre_compaction`. CLI adapter currently casts parsed NDJSON with only loose shape checks. | Add a normalization/validation helper that coerces unknown native event-like input into the closed `HarnessEvent` union or an `error` event. Use it in CLI parsing and tests. Do not widen the event union. |
| External backend detection exists. | `registerCliAdaptersIfAvailable()` checks `aider/goose/opencode` availability and silently skips missing tools. No descriptor for missing first-class harnesses. | Add descriptor/discovery module that emits readiness entries for `codex`, `claude-code`, `cursor-agent`, `opencode`, including missing/unauthenticated/unavailable states. AM2 may not execute installs or real work. |
| Builtin model list exists. | `MODEL_CATALOG` exists and builtin supports `anthropic`, `openrouter`, `openai-compatible` providers through gateway resolution. | Builtin descriptor uses `MODEL_CATALOG` for model descriptors and reports `accessMode: "api-gateway"` plus key-entry auth action. |
| Per-model options exist. | No generic option descriptor type exists. | Introduce closed control kinds `select | boolean | number | text` and model option descriptors in shared. Builtin may have no options initially; tests use fixture descriptors to prove generic renderability. Claude/CLI descriptors can expose known options such as permission mode where adapter supports them. |

## Acceptance Criteria & Verification

| AC | Verification |
|---|---|
| Each harness exposes a normalized descriptor declaring available models and per-model options, queryable by UI. | Unit test `packages/shared/src/harness/__tests__/harness-capability-descriptor.test.ts` imports descriptor builders/types and asserts a descriptor with two models and different options is valid. Integration test `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts` hits `GET /api/harnesses` and asserts builtin descriptor has models, access mode, runtime flags, auth action, and no secrets. |
| A model option is generic enough for UI rendering without backend-specific code. | Shared unit test asserts every option has closed `control.kind`, stable key, label, value semantics, and select choices/ranges where applicable; no `harnessType` branch is needed to inspect options. |
| Backend-native runtime events normalize into one model; two backends performing same action are indistinguishable downstream. | Shared/server unit test `packages/server/src/harness/__tests__/AM2-harness-event-normalization.test.ts` feeds native builtin-style and CLI NDJSON-style inputs for completion/tool/cost/error/token/pre_compaction and asserts identical `HarnessEvent` shapes. CLI adapter tests assert parsed NDJSON is normalized through this helper. |
| Harness-scope decision is reflected in descriptor shape. | Server integration test asserts `GET /api/harnesses` includes `builtin` as `accessMode: "api-gateway"` and first-class known CLI family descriptors/readiness entries for `codex`, `claude-code`, `cursor-agent`, `opencode` even when missing or unauthenticated. |

Final verification before ship: `npm run check`, `npm run lint`, `npm run test`, then `npm run verify` in `/ship`.

## Type Contracts

Add `packages/shared/src/harness/harness-capability-descriptor.ts`.

```ts
export const HARNESS_OPTION_CONTROL_KINDS = ["select", "boolean", "number", "text"] as const;
export type HarnessOptionControlKind = (typeof HARNESS_OPTION_CONTROL_KINDS)[number];

export type HarnessAccessMode = "api-gateway" | "provider-subscription-cli" | "external-byo";
export type HarnessReadinessState =
  | "missing"
  | "installed"
  | "unauthenticated"
  | "ready"
  | "unavailable";

export type HarnessAuthActionKind = "enter_api_key" | "native_cli_login" | "none";

export interface HarnessAuthActionDescriptor {
  readonly kind: HarnessAuthActionKind;
  readonly label: string;
  readonly description?: string;
  readonly command?: readonly string[];
  readonly credentialNames?: readonly string[];
}

export interface HarnessOptionChoice {
  readonly value: string;
  readonly label: string;
}

export interface HarnessModelOptionDescriptor {
  readonly key: string;
  readonly label: string;
  readonly helpText?: string;
  readonly control:
    | { readonly kind: "select"; readonly choices: readonly HarnessOptionChoice[] }
    | { readonly kind: "boolean" }
    | { readonly kind: "number"; readonly min?: number; readonly max?: number; readonly step?: number }
    | { readonly kind: "text"; readonly placeholder?: string };
  readonly required: boolean;
  readonly scope: "launch" | "durable";
  readonly defaultValue?: string | number | boolean;
}

export interface HarnessModelDescriptor {
  readonly id: string;
  readonly label: string;
  readonly provider?: ModelProvider;
  readonly contextWindow?: number;
  readonly selectable: boolean;
  readonly inheritedFromGateway: boolean;
  readonly options: readonly HarnessModelOptionDescriptor[];
}

export interface HarnessRuntimeCapabilities {
  readonly preCompactionTrigger: boolean;
  readonly subAgents: boolean;
  readonly mcpSupport: boolean;
  readonly modelProviders: readonly ModelProvider[];
  readonly fileEditing: boolean;
  readonly toolUse: boolean;
}

export interface HarnessDiscoveryStatus {
  readonly state: HarnessReadinessState;
  readonly version?: string;
  readonly reason?: string;
}

export interface HarnessCapabilityDescriptor {
  readonly type: string;
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly accessMode: HarnessAccessMode;
  readonly authAction: HarnessAuthActionDescriptor;
  readonly discovery: HarnessDiscoveryStatus;
  readonly models: readonly HarnessModelDescriptor[];
  readonly runtime: HarnessRuntimeCapabilities;
  /** Legacy compatibility for existing SettingsAgents selector. */
  readonly modelProviders: readonly ModelProvider[];
}
```

Export from `packages/shared/src/harness/index.ts` and `packages/shared/src/index.ts`.

Extend `HarnessCapabilities` in `harness-adapter.ts` conservatively:

```ts
export interface HarnessCapabilities extends HarnessRuntimeCapabilities {
  readonly descriptorModels?: readonly HarnessModelDescriptor[];
  readonly accessMode?: HarnessAccessMode;
  readonly authAction?: HarnessAuthActionDescriptor;
  readonly discovery?: HarnessDiscoveryStatus;
}
```

This keeps current adapter implementations structurally valid while allowing richer adapters/extensions to declare descriptor-specific facts.

## Server Contracts

### AdapterPool

Add methods to `packages/server/src/harness/adapter-pool.ts`:

```ts
listCapabilityDescriptors(options?: {
  includeKnownMissing?: boolean;
}): HarnessCapabilityDescriptor[];

getCapabilityDescriptorByType(harnessType: string | null): HarnessCapabilityDescriptor | null;
```

`listCapabilityDescriptors()` dedupes by harness type, preserving old `/api/harnesses` behavior. It composes:

- `AdapterMeta` (`name`, `kind`, `type`, `modelProviders`).
- `adapter.getCapabilities()`.
- default descriptor policy per harness family.
- discovery entries for known missing first-class CLI families.

### Descriptor Builders

Add `packages/server/src/harness/harness-capability-descriptors.ts`.

Responsibilities:

- `describeRegisteredHarness(meta, caps): HarnessCapabilityDescriptor`.
- `builtinHarnessDescriptor(meta, caps)`: uses `MODEL_CATALOG`, `accessMode: "api-gateway"`, `authAction.kind: "enter_api_key"`, `credentialNames: ["anthropic_api_key", "openrouter_api_key", "openai_compatible_api_key"]`.
- `cliHarnessDescriptor(meta, caps)`: uses `accessMode: "provider-subscription-cli"`, `authAction.kind: "native_cli_login"`, and CLI-specific command metadata where known.
- `missingKnownHarnessDescriptors(registeredTypes)`: emits `missing` entries for `codex`, `claude-code`, `cursor-agent`, `opencode` that are not registered.
- `KNOWN_HARNESS_FAMILIES`: closed const list for AM2.

Initial command metadata:

```ts
codex: ["codex", "login"]
claude-code: ["claude", "login"]
cursor-agent: ["cursor-agent", "login"]
opencode: ["opencode", "auth", "login"]
```

No command is executed by descriptor construction. AM4 can use these actions later.

### Route

Update `packages/server/src/routes/harnesses.ts`:

- Keep `GET /api/harnesses`.
- Keep founder auth boundary `requireBoundary({ kind: "public-data" })`.
- Return `HarnessCapabilityDescriptor[]`.
- Preserve top-level `type`, `name`, `modelProviders` for existing web SettingsAgents.
- Do not include `apiKey`, `baseUrl`, or provider subscription tokens.

No new endpoint is required for AM2. AM4 can add POST login/key actions later.

## Event Normalization

Add `packages/shared/src/harness/harness-event-normalization.ts` or server-local equivalent if import direction requires it.

Recommended shared API:

```ts
export function normalizeHarnessEvent(input: unknown): HarnessEvent;
export function isHarnessEvent(input: unknown): input is HarnessEvent;
```

Rules:

- Known well-shaped `HarnessEvent` values pass through with only field whitelisting.
- Unknown event-like objects become `{ type: "error", code: "UnknownHarnessEvent", message: ... }`.
- CLI `result` lines are not widened into a new event type; cost extraction remains adapter-local and emits `cost_update`.
- Token tier names outside `reasoning | workhorse | fast` are not accepted as new tiers. Existing cost/tier coercion rules still apply at adapter boundary.

Use in `CliHarnessAdapter.parseStdoutLine()` instead of `return parsed as HarnessEvent`.

## Ordered Tasks

1. **Shared descriptor types.**
   - Files: `packages/shared/src/harness/harness-capability-descriptor.ts`, `packages/shared/src/harness/harness-adapter.ts`, `packages/shared/src/harness/index.ts`, `packages/shared/src/index.ts`.
   - Tests: shared descriptor unit tests compile/import all exported types and assert closed option kinds.

2. **Event normalization helper.**
   - Files: `packages/shared/src/harness/harness-event-normalization.ts`, exports.
   - Tests: normalize equivalent native event inputs to identical `HarnessEvent` shapes; reject unknown events as error events.

3. **Server descriptor builders.**
   - Files: `packages/server/src/harness/harness-capability-descriptors.ts`.
   - Tests: builder unit tests for builtin, registered CLI, and missing first-class CLI descriptors.

4. **AdapterPool descriptor API.**
   - File: `packages/server/src/harness/adapter-pool.ts`.
   - Tests: unit tests for `listCapabilityDescriptors()` dedupe, legacy fields, missing known harness entries, and `getCapabilityDescriptorByType()`.

5. **Route returns enriched descriptors.**
   - File: `packages/server/src/routes/harnesses.ts`.
   - Tests: integration tests extend existing AH2 harness route coverage with model/options/access/readiness/no-secret assertions.

6. **CLI event normalization integration.**
   - File: `packages/server/src/harness/cli-harness-adapter.ts`.
   - Tests: existing CLI tests plus AM2 normalization case for NDJSON completion/tool/cost/error.

7. **Docs and compatibility check.**
   - Ensure existing SettingsAgents tests still pass because top-level `type/name/modelProviders` remain.
   - Ensure no UI code branches on backend-specific descriptor fields in AM2; AM3 will consume the descriptor.

## Security & Abuse Cases

- Rate limit on POST/PATCH: N/A. AM2 adds no POST/PATCH endpoint.
- Input-trust boundary: descriptor builders must treat adapter metadata and CLI stdout as untrusted. Runtime event normalization whitelists fields instead of casting arbitrary JSON.
- Secret handling: route must not expose API keys, base URLs containing credentials, or provider subscription tokens. Auth readiness is status only.
- Path traversal: N/A for descriptor route; CLI discovery may check binary presence by fixed names only, not user-supplied paths.
- SSRF: N/A. No outbound URL fetches.
- Command execution: descriptor construction must not execute login or agent work. Discovery/readiness can check binary presence/version/auth only through bounded fixed commands when implemented. AM2 descriptor builders should not run login commands.

## Protected Tests

Do not weaken assertions in:

- `packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts`
- `packages/server/src/harness/__tests__/adapter-pool-ab1.test.ts`
- `packages/shared/src/harness/__tests__/harness-capabilities.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts`
- `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts`
- `packages/server/src/harness/__tests__/builtin-harness-adapter.test.ts`

## Migrations

- `HarnessCapabilities` grows optional descriptor fields and a runtime-compatible shape; existing adapter implementations remain valid.
- `/api/harnesses` response becomes a superset of the old shape. Existing consumers reading `type/name/modelProviders` require no migration.
- `CliHarnessAdapter.parseStdoutLine()` changes from loose cast to normalization helper; tests must assert existing text mode behavior remains unchanged.

## Shared Files

```json
[
  "packages/shared/src/harness/harness-adapter.ts",
  "packages/shared/src/harness/index.ts",
  "packages/shared/src/index.ts",
  "packages/server/src/harness/adapter-pool.ts",
  "packages/server/src/routes/harnesses.ts"
]
```

## Risks

- `HarnessCapabilities` is widely instantiated in tests. Keep new fields optional or provide defaults through helper builders to avoid broad churn.
- Existing SettingsAgents assumes `/api/harnesses` array, not envelope. Keep array response.
- CLI auth/readiness can become unsafe if implementation runs arbitrary command strings. AM2 must use fixed known command metadata only and not execute login.
- Some CLI model catalogs are provider-owned and not queryable. Represent that honestly with `models: []` or non-selectable native/default descriptors rather than inventing fake model support.

## Design-It-Twice

### Option A — Make `getCapabilities()` return the full descriptor

Shape: change `HarnessAdapter.getCapabilities()` to return `HarnessCapabilityDescriptor`.

Trade-off: conceptually direct, but adapters do not know registry metadata such as stable `harnessType`, display name, pool kind, current load, or missing-known-family status.

Rejected because it pushes registry-owned facts into concrete adapters and forces broad test churn.

### Option B — Keep adapter runtime flags; compose descriptors at registry boundary

Shape: adapters expose runtime facts; AdapterPool/descriptor builders compose full descriptors from adapter facts, registry metadata, model catalog, and known-family discovery policy.

Trade-off: one more builder layer, but ownership matches concept: Kernel registry owns descriptor aggregation, extensions/adapters own backend-specific facts.

Chosen. This preserves existing callers and gives AM4 a single registry-level place to add readiness/login behavior.
