# Model Routing and Cost

How a session gets its model: per-agent model first, tier fallback second. This doc owns the **ModelTier vocabulary** (`reasoning | workhorse | fast`).

## 1. Per-agent model

Each agent can have a **per-agent model** (`agent_run_config.model_id` + `agent_run_config.model_provider`, `framework/db/src/schema.ts` — AU26 moved these off `users` into the agent-orchestration-owned `agent_run_config` table), set in Settings → Agents (options come from `MODEL_CATALOG`). Two agents can run different models during the same bet — a PM on Opus while a builder runs Sonnet.

Resolution order (`resolveModel`, `framework/domain-model/src/model-gateway.ts`) — a single discriminated entry point that replaced the former separate `resolveAgentModel`/`resolveModelTier` pair:

1. **Per-agent path** (`{ kind: "agent", modelId, modelProvider, tierFallback }`) — if `modelId` is set, resolve it directly using `modelProvider` for the credential lookup. Supported providers: `anthropic`, `openrouter`. `openai-compatible` throws `UnsupportedAgentProviderError` — configure it at the tier level instead.
2. **Tier fallback** (`{ kind: "tier", tier }`) — no `modelId` → the tier → model mapping from Settings → Models. Session provisioning computes the tier as `params.modelTier ?? agent tier preference ?? "workhorse"` (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`).

Default per-agent model for new agents: `DEFAULT_AGENT_MODEL_ID = "claude-sonnet-4-6"` (`framework/domain-model/src/model-gateway.ts`).

## 2. Model tiers

The tier is a fallback and cost vocabulary, not the primary model selector. The vocabulary is **closed**: `MODEL_TIERS = ["reasoning", "workhorse", "fast"]` (`framework/domain-model/src/types.ts`).

| Tier | When to use | Default mapping |
|------|-------------|-----------------|
| **Reasoning** | Complex analysis, code generation, product decisions | `claude-opus-4-8` |
| **Workhorse** | Standard task execution, content creation, routine code, most sessions | `claude-sonnet-4-6` |
| **Fast** | Formatting, classification, bulk processing, summarization | `claude-haiku-4-5` |

The default mapping is `BUILT_IN_GATEWAY_CONFIG` (`framework/domain-model/src/model-gateway.ts`). The deployer reconfigures it per tier in Settings → Models (`ModelTierConfig`: provider + model + optional `baseUrl`, `framework/domain-model/src/model-gateway.ts`) — a solo builder might map all three tiers to Sonnet; another team maps Fast to a local OpenAI-compatible endpoint. The process layer cares about the tier, not the model behind it.

Handling of a tier name outside the closed enum (coerce-and-flag, `ModelTierUnknownWarning`) is owned by [`docs/process-layer/canonical-shapes.md`](../process-layer/canonical-shapes.md).

## 3. Model catalog

`MODEL_CATALOG` (`framework/domain-model/src/model-gateway.ts`) is the closed set of supported Anthropic models:

`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`

An anthropic `modelId` outside the catalog is rejected during agent creation/update (`UNKNOWN_MODEL`, `layers/agent-orchestration/agent-run-config/src/validate-agent-config.ts`).

## 4. Cost

Token accounting uses the same tier vocabulary: `TokenUsage.byTier` is keyed by `ModelTier` (`framework/domain-model/src/types/money.ts`), so a session's reported spend lines up with the routing decision that produced it.

Cost caps — the Money-only agent < team < factory hierarchy, the no-duration rule, and the recorded gaps — are owned by [`docs/process-layer/wip-and-cost-limits.md`](../process-layer/wip-and-cost-limits.md).
