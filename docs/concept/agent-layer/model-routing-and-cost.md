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

The factory has a daily cost ceiling (see `PROCESS_LAYER.md` §10.3). When cost burn approaches the ceiling:

1. New sessions that would use Reasoning tier are downgraded to Workhorse.
2. Low-priority routines are deferred.
3. If the ceiling is breached, non-essential work pauses and a review thread fires to the founder.

The model tier is a suggestion, not a hard contract — the deployer configures which actual model each tier maps to. A solo builder on a laptop might map all three tiers to Claude Sonnet. A funded team might map Reasoning to Claude Opus and Fast to a local Llama model. The meta layer doesn't care which model it is; it cares about the tier.

---
