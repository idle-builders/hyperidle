# Model Routing and Cost

How a session gets its model: the agent's own model, handed to the harness that runs it. This doc
owns the **ModelTier vocabulary** (`reasoning | workhorse | fast`), which is now a **cost-reporting
label only** — see §2.

## 1. The agent's model

Each agent has a **model** (`agent_run_config.model_id` + `agent_run_config.model_provider`,
`framework/db/src/schema.ts`), set in Settings → Agents. The options come from the **harness itself**
— each CLI reports the models it can run, and discovery reads that list (`harness-discovery.ts`).
Two agents can run different models during the same task — a PM on Opus while a builder runs Sonnet.

There is one resolution step, and it is not a lookup: `agent_run_config.model_id` becomes
`SessionConfig.selectedModel` (`provisioner.ts`), and the harness adapter passes it to the binary as
`--model` (`cli-harness-adapter.ts`). No provider is contacted, no credential is resolved, and there
is no fallback — a harness told nothing runs its own default, which is a real answer rather than a
missing one.

An agent's model is **not** validated against a central list. A harness that publishes a model list
has its own ids checked against it (`UNKNOWN_MODEL`,
`layers/core-api/src/routes/validate-agent-config.ts`); one that publishes nothing accepts anything,
because an empty list means either "this harness manages its own models" or "the probe failed", and
those are indistinguishable from here.

> **Removed.** A model gateway used to sit between the agent and the model: `resolveModel` turned a
> tier or a per-agent pair into a `ResolvedModel` (provider + model + apiKey + baseUrl) out of
> `Settings → Models` and a credential store. It existed for the built-in harness, the only one that
> called a provider API itself. Every harness now authenticates through its own login. Gone with it:
> `ModelGatewayConfig`, `BUILT_IN_GATEWAY_CONFIG`, `MODEL_CATALOG`, `DEFAULT_AGENT_MODEL_ID`,
> `PATCH /api/model-gateway`, the Settings → Models screen, and the three model-provider credentials.
> See [`docs/architecture/credential-model.md`](../architecture/credential-model.md).

## 2. Model tiers — a cost label, not a selector

The vocabulary is **closed**: `MODEL_TIERS = ["reasoning", "workhorse", "fast"]`
(`framework/domain-model/src/types.ts`).

A tier **selects nothing**. It used to name which gateway entry a session resolved against; with the
gateway gone, the only thing a tier still does is key the token-usage bucket a session's spend is
reported in (`TokenUsage.byTier`, `cli-harness-adapter.ts`). Session provisioning still computes one
— `params.modelTier ?? agent tier preference ?? "workhorse"` (`provisioner.ts`) — and hands it
through as that label.

There is **no per-agent tier dial**. `agent_run_config.model_tier_preference` was removed (migration
`0066`): it named a gateway entry, selected nothing once the gateway went, and was unreachable
anyway on the path every real session takes — the durable drain always passes a tier of its own, so
`params.modelTier ?? agentPreference` never reached the second operand. People choose a **model** per
agent, which is the thing that reaches the harness.

Handling of a tier name outside the closed enum (coerce-and-flag, `ModelTierUnknownWarning`) is owned
by [`docs/process-layer/canonical-shapes.md`](../process-layer/canonical-shapes.md).

## 3. Cost

Token accounting uses the tier vocabulary: `TokenUsage.byTier` is keyed by `ModelTier`
(`framework/domain-model/src/types/money.ts`), so a session's reported spend lines up with the bucket
its agent was configured with.

Cost caps — the Money-only agent < team < factory hierarchy, the no-duration rule, and the recorded
gaps — are owned by [`docs/process-layer/wip-and-cost-limits.md`](../process-layer/wip-and-cost-limits.md).
