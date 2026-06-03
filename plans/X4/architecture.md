# X4 Architecture: Model Gateway (OpenRouter + Direct Providers)

## Overview

Replace the hardcoded `MODEL_TIER_MAP` in `model-tier-map.ts` with a configurable gateway that resolves `ModelTier` to a `ResolvedModel` tuple. The gateway reads configuration from the `serverConfig` table, resolves credentials via the existing `CredentialResolver`, and surfaces configuration through a Settings UI section.

The gateway is a resolution layer. It does not make API calls, proxy requests, or manage connections. It answers one question: "for this ModelTier, what provider, model, API key, and base URL should the caller use?"

---

## Part 1: Shared Types

### File: `packages/shared/src/model-gateway.ts`

New file. Export from `packages/shared/src/index.ts`.

```typescript
import type { ModelTier } from "./types.js";

/**
 * X4: The set of supported model provider kinds.
 * "anthropic" = direct Anthropic Messages API
 * "openrouter" = OpenRouter (OpenAI-compatible with extensions)
 * "openai-compatible" = any OpenAI-compatible endpoint (Together, Groq, etc.)
 */
export const MODEL_PROVIDERS = ["anthropic", "openrouter", "openai-compatible"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/**
 * X4: Per-tier gateway configuration as stored in serverConfig.
 * Each tier maps to one provider + model + optional base URL.
 */
export interface ModelTierConfig {
  readonly provider: ModelProvider;
  readonly model: string;
  /** Only used for "openai-compatible" provider. Ignored for anthropic/openrouter. */
  readonly baseUrl?: string;
}

/**
 * X4: Full gateway configuration — one entry per tier.
 * Stored in serverConfig.config JSON under the "modelGateway" key.
 */
export type ModelGatewayConfig = Record<ModelTier, ModelTierConfig>;

/**
 * X4: Resolved model info returned by the gateway.
 * Includes everything a harness adapter needs to make an LLM call.
 */
export interface ResolvedModel {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
}
```

### Design decisions

- `ModelProvider` is a closed union (3 values). Adding a new provider kind requires a code change. This is intentional -- each provider has different request/response normalization needs, so "adding a provider" is never just a config change.
- `baseUrl` is only meaningful for `openai-compatible`. For `anthropic`, the base URL is always `https://api.anthropic.com`. For `openrouter`, it is always `https://openrouter.ai/api`. The gateway hardcodes these.
- API keys are NOT stored in the gateway config. They are resolved at runtime via `CredentialResolver`. The gateway config stores the provider + model mapping; the credential resolver stores the secrets. Exception: `openai-compatible` providers need per-endpoint API keys that don't fit the fixed 3-entry credential catalog. See the "OpenAI-compatible credential storage" section below.

---

## Part 2: Gateway Service

### File: `packages/server/src/services/model-gateway.ts`

New file. Pure function, no class, no state.

```typescript
export async function resolveModelTier(
  tier: ModelTier,
  config: ModelGatewayConfig,
  credentialResolver: CredentialResolver,
): Promise<ResolvedModel>
```

**Resolution logic:**

1. Look up `config[tier]` to get `{ provider, model, baseUrl }`.
2. Based on `provider`:
   - `"anthropic"` → resolve `anthropic_api_key` from `credentialResolver`. Base URL = `https://api.anthropic.com`.
   - `"openrouter"` → resolve `openrouter_api_key` from `credentialResolver`. Base URL = `https://openrouter.ai/api`.
   - `"openai-compatible"` → API key comes from the tier config itself (stored in serverConfig, see below). Base URL comes from `config[tier].baseUrl`.
3. If the required API key is null, throw `MissingCredentialError` with a message identifying the provider and tier (AC: "error is clear and identifies which provider failed").
4. Return `{ provider, model, apiKey, baseUrl }`.

**Default config (fallback when no gateway config exists):**

```typescript
export const DEFAULT_GATEWAY_CONFIG: ModelGatewayConfig = {
  reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
  workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  fast:      { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
};
```

This matches the current `MODEL_TIER_MAP` values exactly, ensuring zero behavior change when no gateway config is set (AC: "falls back to the default, Anthropic direct, same as today").

### Replacing `model-tier-map.ts`

The existing `resolveModel(tier)` returns a string. The new `resolveModelTier(tier, config, resolver)` returns a `ResolvedModel`. Call sites must be updated:

**`claude-agent-sdk-adapter.ts` line 103:**
Currently: `const model = resolveModel(config.modelTier);`
After: The adapter receives the resolved model via `SessionConfig` (see Part 5). It no longer calls `resolveModel` directly.

**Test file `claude-agent-sdk-adapter.test.ts` lines 155-167:**
Tests that assert on `resolveModel()` directly become tests on the gateway service.

After X4 merges, `model-tier-map.ts` is deleted. The `resolveModel` function and `MODEL_TIER_MAP` constant are removed.

---

## Part 3: Server Config Extension

### File: `packages/server/src/services/server-config.ts` (modify)

Extend the `ServerConfigSchema` to include the `modelGateway` key.

```typescript
const ModelTierConfigSchema = z.object({
  provider: z.enum(MODEL_PROVIDERS),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  /** X4: API key for openai-compatible providers. Stored in config, not credential catalog. */
  apiKey: z.string().optional(),
});

const ModelGatewayConfigSchema = z.object({
  reasoning: ModelTierConfigSchema,
  workhorse: ModelTierConfigSchema,
  fast: ModelTierConfigSchema,
});

const ServerConfigSchema = z.object({
  notifications: NotificationsSchema.optional(),
  modelGateway: ModelGatewayConfigSchema.optional(),
});
```

**Corresponding type and defaults updates:**

```typescript
export type ServerConfig = {
  notifications: z.infer<typeof NotificationsSchema>;
  modelGateway: ModelGatewayConfig;
};

const DEFAULTS: ServerConfig = {
  notifications: NotificationsSchema.parse({}),
  modelGateway: DEFAULT_GATEWAY_CONFIG,
};
```

The `applyDefaults` function gets a new branch for `modelGateway`:

```typescript
function applyDefaults(raw: RawServerConfig): ServerConfig {
  return {
    notifications: NotificationsSchema.parse(raw.notifications ?? {}),
    modelGateway: raw.modelGateway
      ? ModelGatewayConfigSchema.parse(raw.modelGateway)
      : DEFAULT_GATEWAY_CONFIG,
  };
}
```

The `updateServerConfig` function gets a new merge branch:

```typescript
const merged: ServerConfig = {
  ...current,
  notifications: patch.notifications !== undefined
    ? { ...current.notifications, ...patch.notifications }
    : current.notifications,
  modelGateway: patch.modelGateway !== undefined
    ? patch.modelGateway  // Full replacement, not deep merge -- 3 tiers is the complete shape
    : current.modelGateway,
};
```

The `ServerConfigPatch` type gets a new optional field:

```typescript
type ServerConfigPatch = {
  notifications?: DeepPartialNotifications;
  modelGateway?: ModelGatewayConfig;
};
```

### OpenAI-compatible credential storage

For `openai-compatible` providers, the API key is stored in the `ModelTierConfig.apiKey` field within `serverConfig`. This is a pragmatic trade-off:

**Why not the credential catalog?** The `CREDENTIAL_NAMES` tuple is fixed at 3 entries (`anthropic_api_key`, `openrouter_api_key`, `shared_backend_key`). Making it dynamic would require a migration, new UI, and changes to the Electron bridge. That's scope creep for X4.

**Security concern:** API keys in `serverConfig` are stored as plain JSON in the `server_config.config` text column. In shared mode, this is less secure than the AES-256-GCM encrypted `server_credentials` table. Mitigation: (a) `openai-compatible` is an advanced feature -- users choosing it understand the trade-off; (b) a follow-up workpackage can add dynamic credential catalog entries. The architecture document for X4 captures this as a known gap.

**In the Settings UI:** The `openai-compatible` provider shows an API key input field. The value is sent to the server and stored in `serverConfig.modelGateway[tier].apiKey`. It is never returned to the client in GET responses -- the API strips it (returns `apiKey: "***"` if present, `undefined` if absent).

---

## Part 4: API Endpoints

### File: `packages/server/src/routes/model-gateway.ts`

New file. Two endpoints.

**GET /api/model-gateway**

Returns the current gateway config. Strips `apiKey` values for security.

```typescript
// Response shape:
{
  reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
  workhorse: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
  fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" }
}
```

API keys are never returned. The UI shows credential status (valid/present/absent) by reading from the existing `GET /api/credentials/status` endpoint (or the Electron bridge).

Implementation: `readServerConfig(db)` then return `config.modelGateway` with `apiKey` fields stripped.

**PATCH /api/model-gateway**

Accepts a full `ModelGatewayConfig` object. Validates with `ModelGatewayConfigSchema`. Writes to `serverConfig` via `updateServerConfig`.

```typescript
// Request body:
{
  reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
  workhorse: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
  fast: { provider: "openai-compatible", model: "gemma-3", baseUrl: "https://api.together.xyz/v1", apiKey: "sk-..." }
}
```

Validation:
- Each tier must have a valid `provider` and non-empty `model`.
- `baseUrl` is required when `provider` is `"openai-compatible"`, optional otherwise.
- `apiKey` is allowed only when `provider` is `"openai-compatible"`.

Returns the saved config (with `apiKey` stripped).

### Route registration

In `app.ts`:

```typescript
import { createModelGatewayRoutes } from "./routes/model-gateway.js";
// ...
api.route("/model-gateway", createModelGatewayRoutes(options.db));
```

---

## Part 5: SessionConfig Extension

### File: `packages/shared/src/harness/harness-adapter.ts` (modify)

Add `resolvedModel` to `SessionConfig`:

```typescript
export interface SessionConfig {
  readonly workspacePath: string;
  /** @deprecated Use composedPrompt instead. Retained for path validation. */
  readonly soulPromptPath: string;
  /** X1: fully composed prompt text, written as CLAUDE.md in the workspace. */
  readonly composedPrompt: string;
  readonly modelTier: ModelTier;
  readonly tools: readonly string[];
  /** X4: Resolved model configuration from the gateway. */
  readonly resolvedModel?: ResolvedModel;
}
```

`resolvedModel` is optional to maintain backward compatibility during migration. When present, adapters use it instead of calling `resolveModel(tier)`.

### Adapter update: `claude-agent-sdk-adapter.ts`

```typescript
async startSession(config: SessionConfig): Promise<SessionHandle> {
  // X4: Use resolved model from gateway if available, fall back to legacy resolution
  let model: string;
  let apiKey: string | null | undefined;

  if (config.resolvedModel) {
    model = config.resolvedModel.model;
    apiKey = config.resolvedModel.apiKey;
  } else {
    // Legacy path: resolve from tier map + credential resolver
    model = resolveModel(config.modelTier);
    if (this.credentialResolver) {
      apiKey = await this.credentialResolver.resolve("anthropic_api_key");
    } else {
      apiKey = process.env[this.apiKeyEnvVar];
    }
  }

  if (!apiKey) {
    throw new MissingCredentialError(/* ... */);
  }
  // ... rest unchanged
}
```

### Session provisioning update: `session-lifecycle.ts`

The provisioning orchestrator (or the session routes layer) resolves the model before creating the session:

```typescript
// In the session creation flow (sessions-routes.ts or provisioning orchestrator):
const serverCfg = await readServerConfig(db);
const resolvedModel = await resolveModelTier(
  body.modelTier,
  serverCfg.modelGateway,
  credentialResolver,
);

// Pass to adapter via SessionConfig:
const sessionConfig: SessionConfig = {
  workspacePath,
  soulPromptPath: agent.soulPromptPath ?? "",
  composedPrompt: composedPrompt,
  modelTier: body.modelTier,
  tools: toolNames,
  resolvedModel,
};
```

---

## Part 6: Settings UI Component

### File: `packages/web/src/settings/SettingsModels.tsx`

New file. Follows the pattern of `SettingsAgents.tsx` and `SettingsBackend.tsx`.

**Structure:**
- Fetches from `GET /api/model-gateway` on mount
- Renders 3 collapsible tier rows
- Each expanded row has: Provider dropdown, Model input, optional Base URL input, optional API key input
- Changes auto-save via `PATCH /api/model-gateway` on blur/change (debounced 500ms)
- Uses `useToast` for save feedback
- States: loading (skeleton), error (inline message), populated (tier rows)

**No new custom components.** Uses DaisyUI `select`, `input`, `badge`, and manual expand/collapse with disclosure pattern (button + hidden div).

### Registration: `packages/web/src/pages/SettingsPage.tsx`

Add the Models section between Agents and Appearance:

```tsx
import { SettingsModels } from "../settings/SettingsModels.js";

// In the JSX:
<section data-testid="settings-section-models" className="flex flex-col gap-3">
  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Models</h2>
  <SettingsModels />
</section>
```

### Known Anthropic models (client-side list)

A const array in `SettingsModels.tsx` with known model IDs for the Anthropic provider dropdown:

```typescript
const KNOWN_ANTHROPIC_MODELS = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-haiku-3-5-20241022",
] as const;
```

This list is hardcoded. Adding new models requires a code change. Acceptable for v1 -- the alternative (API-based model discovery) adds external dependencies and complexity.

---

## Part 7: External Harness Integration

External harnesses (X5) receive the resolved model via `SessionConfig.resolvedModel`. They use it to configure themselves:

- **Claude Code adapter:** Uses `resolvedModel.model` as the `model` option and `resolvedModel.apiKey` as the API key.
- **CLI adapter (future):** Injects `resolvedModel.model`, `resolvedModel.apiKey`, and `resolvedModel.baseUrl` as environment variables for the subprocess.
- **Built-in harness (X6):** Uses `resolvedModel` directly to construct API client calls.

The gateway provides the config; each adapter decides how to consume it. This is the "resolution layer, not proxy" contract.

---

## Task Ordering

### Task 1: Shared types
- Create `packages/shared/src/model-gateway.ts` with `ModelProvider`, `ModelTierConfig`, `ModelGatewayConfig`, `ResolvedModel`
- Export from `packages/shared/src/index.ts`
- Verification: `npm run check` passes

### Task 2: Gateway service + server config extension
- Create `packages/server/src/services/model-gateway.ts` with `resolveModelTier()` and `DEFAULT_GATEWAY_CONFIG`
- Extend `ServerConfigSchema` in `server-config.ts` with `modelGateway` field
- Update `ServerConfig` type, `DEFAULTS`, `applyDefaults`, `updateServerConfig`, `ServerConfigPatch`
- Write tests: resolveModelTier returns correct ResolvedModel for each provider, throws MissingCredentialError on missing key, DEFAULT_GATEWAY_CONFIG matches current MODEL_TIER_MAP values
- Verification: tests pass, `npm run check` passes

### Task 3: API endpoints
- Create `packages/server/src/routes/model-gateway.ts` with GET and PATCH
- Register in `app.ts`
- Write tests: GET returns config with apiKey stripped, PATCH validates and persists, PATCH with invalid provider returns 400, GET returns defaults when no config exists
- Verification: tests pass

### Task 4: SessionConfig extension + adapter update
- Add `resolvedModel` to `SessionConfig` in `packages/shared/src/harness/harness-adapter.ts`
- Update `ClaudeAgentSdkAdapter.startSession()` to use `resolvedModel` when present
- Update session creation flow in `sessions-routes.ts` to resolve model via gateway before passing to adapter
- Update existing adapter tests
- Verification: tests pass, `npm run check` passes

### Task 5: Settings UI
- Create `packages/web/src/settings/SettingsModels.tsx`
- Register in `SettingsPage.tsx`
- Write tests: renders 3 tier rows, shows loading/error states, provider change shows correct fields
- Verification: tests pass, visual check of Settings page

### Task 6: Delete model-tier-map.ts
- Delete `packages/server/src/harness/model-tier-map.ts`
- Remove all imports of `resolveModel` and `MODEL_TIER_MAP`
- Update any remaining tests that reference the old module
- Verification: `npm run check` passes, `npm run test -- --all` passes, no imports of model-tier-map remain

### Dependency graph

```
Task 1 (shared types)
  └── Task 2 (gateway service + config)
        ├── Task 3 (API endpoints)
        │     └── Task 5 (Settings UI)
        └── Task 4 (SessionConfig + adapter)
              └── Task 6 (delete model-tier-map)
```

Tasks 3 and 4 can run in parallel after Task 2. Task 5 depends on Task 3. Task 6 depends on Task 4.

---

## File Inventory

| Action | File |
|--------|------|
| Create | `packages/shared/src/model-gateway.ts` |
| Modify | `packages/shared/src/index.ts` (add exports) |
| Modify | `packages/shared/src/harness/harness-adapter.ts` (add `resolvedModel` to `SessionConfig`) |
| Modify | `packages/server/src/services/server-config.ts` (extend schema + types) |
| Create | `packages/server/src/services/model-gateway.ts` |
| Create | `packages/server/src/routes/model-gateway.ts` |
| Modify | `packages/server/src/app.ts` (register route) |
| Modify | `packages/server/src/harness/claude-agent-sdk-adapter.ts` (use `resolvedModel`) |
| Modify | `packages/server/src/routes/sessions-routes.ts` (resolve model before adapter call) |
| Delete | `packages/server/src/harness/model-tier-map.ts` |
| Create | `packages/web/src/settings/SettingsModels.tsx` |
| Modify | `packages/web/src/pages/SettingsPage.tsx` (add Models section) |
| Create | `packages/server/src/__tests__/X4-model-gateway.test.ts` |
| Create | `packages/web/src/settings/__tests__/X4-SettingsModels.test.ts` |
| Modify | `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts` (update tests) |

---

## AC Completeness Checklist

| AC | How verified |
|----|-------------|
| Gateway config in Settings allows provider per tier | Task 5: SettingsModels UI with provider dropdown per tier |
| Gateway resolves ModelTier to `{ provider, model, apiKey, baseUrl }` | Task 2: unit tests on `resolveModelTier` |
| Built-in harness (X6) uses gateway | Task 4: SessionConfig carries `resolvedModel`, X6 reads it (future) |
| External harnesses receive resolved model in SessionConfig | Task 4: `resolvedModel` field on SessionConfig |
| OpenRouter supported as provider | Task 2: resolveModelTier handles `"openrouter"` provider, resolves `openrouter_api_key` |
| Direct Anthropic and OpenAI-compatible supported | Task 2: resolveModelTier handles all 3 providers |
| Config stored in serverConfig, editable via Settings UI | Task 2 (storage) + Task 3 (API) + Task 5 (UI) |
| model-tier-map.ts replaced by gateway | Task 6: file deleted, all references removed |
| Fallback to Anthropic direct when no config | Task 2: DEFAULT_GATEWAY_CONFIG = current MODEL_TIER_MAP values |
| Clear error on invalid API key | Task 2: MissingCredentialError with provider + tier in message |

---

## Known Gaps & Future Work

1. **OpenAI-compatible API keys in plain JSON** -- see Part 3. A follow-up should add dynamic credential catalog entries or encrypt the serverConfig blob.
2. **Model list maintenance** -- KNOWN_ANTHROPIC_MODELS is hardcoded. A model registry endpoint could be added later.
3. **No per-agent overrides** -- explicitly out of scope for v1. The gateway resolves at the tier level only.
4. **No failover** -- explicitly out of scope. One provider per tier, no retry on alternative.
5. **OpenRouter response normalization** -- the spec says "OpenRouter responses normalized to same shape as direct providers for cost/token tracking." This is a concern for X6 (Built-in Harness), not X4. The gateway only provides config; the harness that makes the actual API call is responsible for normalizing responses. The Claude Agent SDK adapter (current) only supports Anthropic direct, so normalization is not yet needed.
