## 2. Agent Identity

Agent identity is stored in the `users` table (kind = `'ai'`). The canonical fields are:

| Field | Column | Purpose |
|---|---|---|
| Soul prompt | `soul_prompt` (text, nullable) | System prompt injected at session start — who this agent is, its personality, its constraints |
| Harness type | `harness_type` (text, nullable) | Which adapter type to prefer (`claude-code`, `openai`, etc.) — null means any available adapter |
| Model tier | `model_tier_preference` (text, nullable) | Preferred model cost tier (`reasoning`, `workhorse`, `haiku`) — null means system default |
| Concurrency | `max_concurrent_sessions` (int) | Maximum parallel sessions this agent runs |
| Role | `role` (text) | Functional role (`builder`, `product_manager`, `facilitator` <!-- @lore AD8c: renamed from practice_facilitator -->, `chief_of_staff` <!-- @lore AD8a: renamed to "assistant" in AD8b -->, …) |
| Status | `status` (text) | Lifecycle state (`active`, `retired`) |

**Soul prompt** defines personality, constraints, and the agent's relationship to its role. A Builder's soul knows it's an engineer who thinks → plans → builds → reviews → tests. A Practice Facilitator's soul knows it surfaces patterns and synthesizes, not decides. Souls are short — ideally under 500 tokens — because they're loaded into every session.

Soul prompt templates for standard roles are seeded into the `factory_settings` table at setup time with the key prefix `soul_template:<role>`. Founders can pre-fill a new agent's soul from the matching template or write a custom one. The `soul_prompt` column is the single source of truth at runtime; the template is only a starting point for the UI.

> **X3 migration note:** The prior `soul_prompt_path` column (which pointed to a file on disk) is deprecated. The column still exists in the schema for backward compatibility but is ignored by all runtime code. A future migration will drop it. All soul content is now stored inline in `soul_prompt`.

When the Knowledge Fabric builds an L0 session context for this agent, it loads the soul prompt from `users.soul_prompt`, queries the knowledge layers for the relevant context, and packs it into TOON format. The agent doesn't "know" about layers; it just gets a context pack.

---
