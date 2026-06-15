## 2. Agent Identity

Agent identity is stored in the `users` table (kind = `'ai'`). The canonical fields are:

| Field | Column | Purpose |
|---|---|---|
| System prompt | `system_prompt` (text, nullable) | System prompt injected at session start — who this agent is, its personality, its constraints |
| Harness type | `harness_type` (text, nullable) | Which adapter type to prefer (`claude-code`, `openai`, etc.) — null means any available adapter |
| Model tier | `model_tier_preference` (text, nullable) | Preferred model cost tier (`reasoning`, `workhorse`, `haiku`) — null means system default |
| Concurrency | `max_concurrent_sessions` (int) | Maximum parallel sessions this agent runs |
| Role | `role` (text) | Functional role (`builder`, `product_manager`, `facilitator` <!-- @lore AD8c: renamed from practice_facilitator -->, `chief_of_staff` <!-- @lore AD8a: renamed to "assistant" in AD8b -->, …) |
| Status | `status` (text) | Lifecycle state (`active`, `retired`) |

The system prompt defines personality, constraints, and the agent's relationship to its role. A builder's system prompt defines it as an engineer who thinks → plans → builds → reviews → tests. A Practice Facilitator's system prompt defines how it surfaces patterns and synthesizes, not decides. System prompts are short — ideally under 500 tokens — because they're loaded into every session.

System prompt templates for standard roles are seeded into the `factory_settings` table at setup time with the key prefix `system_template:<role>`. Founders can pre-fill a new agent's system prompt from the matching template or write a custom one. The `system_prompt` column is the single source of truth at runtime; the template is only a starting point for the UI.

> **X3 migration note:** The prior `system_prompt_path` column (which pointed to a file on disk) is deprecated. The column still exists in the schema for backward compatibility but is ignored by all runtime code. A future migration will drop it. All system prompt content is now stored inline in `system_prompt`.

When the Knowledge Fabric builds an L0 session context for this agent, it loads the system prompt from `users.system_prompt`, queries the knowledge layers for the relevant context, and packs it into TOON format. The agent doesn't "know" about layers; it just gets a context pack.

---
