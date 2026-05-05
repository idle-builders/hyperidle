## 6. Model Routing and Cost

Agents don't pick their own model. The meta layer assigns models based on the task's requirements, the agent's role, and the factory's current cost posture.

### 6.1 Model tiers

| Tier | When to use | Examples (as of April 2026) |
|------|------------|-----------------------------|
| **Reasoning** | Complex analysis, code generation, product decisions, skill execution for high-risk tasks | Claude Opus, o3, Gemini Ultra |
| **Workhorse** | Standard task execution, content creation, routine code, most sessions | Claude Sonnet, GPT-4o, Gemini Pro |
| **Fast** | Formatting, classification, bulk processing, context compaction, summarization, sleep-time routine runs | Claude Haiku, Gemini Flash, Cerebras, local models (Ollama) |

### 6.2 Routing logic

The Scheduler (see `ARCHITECTURE.md` §2.3) picks the model tier when starting a session:

- **Risk tier high** → Reasoning tier.
- **Risk tier medium** → Workhorse tier.
- **Risk tier low** → Workhorse tier (default), Fast tier if the skill declares it.
- **Sleep-time routines** → Fast tier (they're memory-only, no artifact production).
- **Context compaction / session note writing** → Fast tier.
- **Facilitator synthesis** → Workhorse or Reasoning, depending on scope (portfolio-level retros → Reasoning; weekly practice meeting → Workhorse).

### 6.3 Cost posture

The factory has a daily **Money ceiling** and an optional daily **TokenUsage ceiling** (see `docs/process-layer/wip-and-cost-limits.md` §10.3). Money and TokenUsage shapes are defined in `docs/process-layer/canonical-shapes.md`. When burn against either ceiling approaches the threshold:

1. New sessions that would use Reasoning tier are downgraded to Workhorse.
2. Low-priority routines are deferred.
3. If either ceiling is breached, non-essential work pauses and a review thread fires to the founder.

There is no duration ceiling. Wall-clock time is informational only — see `docs/process-layer/wip-and-cost-limits.md` §10.6 for the rationale and §10.7 for the anti-pattern rule that rejects any duration-shaped budget axis.

The model tier is a suggestion, not a hard contract — the deployer configures which actual model each tier maps to. A solo builder on a laptop might map all three tiers to Claude Sonnet. A funded team might map Reasoning to Claude Opus and Fast to a local Llama model. The meta layer doesn't care which model it is; it cares about the tier. The tier vocabulary (`reasoning | workhorse | fast`) is the same vocabulary that `TokenUsage.byTier` uses, so a session's reported token spend lines up directly with the routing decision that produced it.

The tier vocabulary is **closed**. Adding a new tier (for example `local`, `frontier`, or a provider-specific tier name a future harness might emit) requires an explicit concept-doc update to this section AND to `docs/process-layer/canonical-shapes.md` Money/TokenUsage entry, in the same change. If a harness reports tokens against a tier name outside the closed enum, the Harness Adapter is contractually required to *coerce-and-flag* (bucket the spend into the closest known tier per the adapter's mapping and emit a `ModelTierUnknownWarning` so the deployer can update the mapping) — never silently drop tokens, never widen the enum at runtime. See `docs/process-layer/canonical-shapes.md` for the rule.

---
