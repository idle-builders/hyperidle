# Model Routing and Cost

How a session gets its model: per-agent model first, tier fallback second. This doc owns the **ModelTier vocabulary** (`reasoning | workhorse | fast`).

## 1. Per-agent model

Each agent can have a **per-agent model** (`users.modelId` + `users.modelProvider`, `packages/db/src/schema.ts:79-87`), set in Settings → Agents (options come from `MODEL_CATALOG`). Two agents can run different models during the same bet — a PM on Opus while a builder runs Sonnet.

Resolution order (`resolveAgentModel`, `packages/server/src/services/model-gateway.ts:188-206`):

1. **Per-agent path** — if the agent has `modelId` set, resolve it directly using `modelProvider` for the credential lookup. Supported providers: `anthropic`, `openrouter`. `openai-compatible` throws `UnsupportedAgentProviderError` — configure it at the tier level instead.
2. **Tier fallback** — no `modelId` → `resolveModelTier()` applies the tier → model mapping from Settings → Models. Session provisioning computes the tier as `params.modelTier ?? agent tier preference ?? "workhorse"` (`packages/server/src/services/session-provisioning.ts:670-673`).

Default per-agent model for new agents: `DEFAULT_AGENT_MODEL_ID = "claude-sonnet-4-6"` (`packages/shared/src/model-gateway.ts`).

## 2. Model tiers

The tier is a fallback and cost vocabulary, not the primary model selector. The vocabulary is **closed**: `MODEL_TIERS = ["reasoning", "workhorse", "fast"]` (`packages/shared/src/types.ts:116`).

| Tier | When to use | Default mapping |
|------|-------------|-----------------|
| **Reasoning** | Complex analysis, code generation, product decisions | `claude-opus-4-8` |
| **Workhorse** | Standard task execution, content creation, routine code, most sessions | `claude-sonnet-4-6` |
| **Fast** | Formatting, classification, bulk processing, summarization | `claude-haiku-4-5` |

The default mapping is `BUILT_IN_GATEWAY_CONFIG` (`packages/server/src/services/model-gateway.ts:57-59`). The deployer reconfigures it per tier in Settings → Models (`ModelTierConfig`: provider + model + optional `baseUrl`, `packages/shared/src/model-gateway.ts:22-40`) — a solo builder might map all three tiers to Sonnet; another team maps Fast to a local OpenAI-compatible endpoint. The process layer cares about the tier, not the model behind it.

Handling of a tier name outside the closed enum (coerce-and-flag, `ModelTierUnknownWarning`) is owned by [`docs/process-layer/canonical-shapes.md`](../process-layer/canonical-shapes.md).

## 3. Model catalog

`MODEL_CATALOG` (`packages/shared/src/model-gateway.ts:81-90`) is the closed set of supported Anthropic models:

`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`

An anthropic `modelId` outside the catalog is rejected at the agents API boundary (`UNKNOWN_MODEL`, `packages/server/src/routes/agents.ts:139-144`).

## 4. Cost

Token accounting uses the same tier vocabulary: `TokenUsage.byTier` is keyed by `ModelTier` (`packages/shared/src/types/money.ts:66`), so a session's reported spend lines up with the routing decision that produced it.

Cost caps — the Money-only agent < team < factory hierarchy, the no-duration rule, and the recorded gaps — are owned by [`docs/process-layer/wip-and-cost-limits.md`](../process-layer/wip-and-cost-limits.md). A breach throws `CostCapExceededError` before provisioning (`session-provisioning.ts:676-692`) — the session is rejected outright, not paused and routed to a review thread.
