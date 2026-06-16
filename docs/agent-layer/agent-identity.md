## 2. Agent Identity

Agent identity has two parts with different owners:

- **Agent user-id** — the stable `users.id` (kind = `'ai'`) the Kernel owns. Every session attaches to a user-id; it is immutable once a session has attached. The Kernel owns the `users` table and all account/mechanism fields.
- **Agent persona** — the AGENTS.md / system prompt / role that defines *who the agent is*. This is **Strategy-owned knowledge** (see `docs/architecture/kernel-strategy-split.md` §2a and §3a). The active Strategy decides which agents exist, what role each carries, and what system prompt each receives — the Kernel never hard-codes these.

The persona is delivered to the Kernel as an `AgentScaffoldSpec` from the active Strategy at creation time. The Kernel persists the spec's `systemPrompt` field into `users.system_prompt` and attaches mechanism fields. After creation, the Fabric Strategy may further evolve an agent's persona through its knowledge-management routines.

### `users` table fields

| Field | Column | Owner | Purpose |
|---|---|---|---|
| System prompt | `system_prompt` (text, nullable) | **Strategy** (content) / **Kernel** (persistence) | System prompt injected at session start — who this agent is. Supplied by the Strategy at creation; null under the Minimal Strategy. |
| Harness type | `harness_type` (text, nullable) | **Kernel** | Which adapter type to prefer (`claude-code`, `openai`, etc.) — null means any available adapter. Set by `persistScaffoldedAgents`; never carried on the Strategy spec. |
| Model tier | `model_tier_preference` (text, nullable) | **Kernel** | Preferred model cost tier (`reasoning`, `workhorse`, `haiku`) — null means system default. |
| Concurrency | `max_concurrent_sessions` (int) | **Kernel** | Maximum parallel sessions this agent runs. Set by the Kernel persist helper based on role. |
| Role | `role` (text) | **Strategy** (decision) / **Kernel** (persistence) | Functional role (`builder`, `product_manager`, `facilitator` <!-- @lore AD8c: renamed from practice_facilitator -->, `assistant` <!-- @lore AD8a: renamed from chief_of_staff in AD8b -->, …). Supplied by the Strategy's `AgentScaffoldSpec`. |
| Status | `status` (text) | **Kernel** | Lifecycle state (`active`, `retired`). |

System prompts are short — ideally under 500 tokens — because they're loaded into every session.

System prompt templates for standard roles are seeded into the `factory_settings` table at setup time with the key prefix `system_template:<role>`. The Fabric Strategy reads these templates when composing a scaffold spec; founders can customise an agent's system prompt after creation. The `system_prompt` column is the single source of truth at runtime; the template is a Strategy-side starting point, not a Kernel asset.

> **X3 migration note:** The prior `system_prompt_path` column (which pointed to a file on disk) is deprecated. The column still exists in the schema for backward compatibility but is ignored by all runtime code. A future migration will drop it. All system prompt content is now stored inline in `system_prompt`.

When the Knowledge Fabric builds an L0 session context for this agent, it loads the system prompt from `users.system_prompt`, queries the knowledge layers for the relevant context, and packs it into TOON format. The agent doesn't "know" about layers; it just gets a context pack.

---
