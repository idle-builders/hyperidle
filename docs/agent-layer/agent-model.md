# Agent model

Who agents are: identity, categories, lifecycle, and how they run.

## Agent = a user row

Agents and humans are both `users` rows. The only difference is `users.kind`: `'human'` or `'ai'`. Every action that applies to a user applies to an agent — the same `search_users`, `open_user`, `edit_user`.

Agent identity has two parts:

- **Who the agent is** — `users`: the stable `users.id` (kind `'ai'`), plus `status`, its one team (`user_teams`), `agentCategory`, and `health` (a freeform crash note, written by the orchestrator on session failure).
- **How the agent runs** — `agent_run_config` (`framework/runner-db/src/schema.ts`): one row per `agent_user_id`, holding `harness_type`, `model_id`, `model_provider`, `model_options_json`, and `max_concurrent_sessions` (default 1). This table lives in the runner's own database, not in the core database. An absent row is identical to an all-null row.

### Identity document

Who an agent is lives in a document: an `agent_file` document with `parentKind = 'agent'` and `parentId = agent.id`, `slot = 'agent_file'`. Its body loads into every session as the `## Identity` section. An agent with no identity document runs without that section — a valid state.

The identity is seeded at agent creation. HyperIdle ships no role personas. A Builder, a Designer, a Product Manager are things a plugin brings: see [plugins](../architecture/plugins.md).

### Status

`users.status` closed set: `active | idle | inactive | retired` (`USER_STATUSES` in `framework/domain-model/src/actions/user.ts`).

## Two categories

Every AI agent has exactly one category, stored in `users.agentCategory`:

| Category | Binding | Typical source |
|---|---|---|
| `team` | Works for a team | You or a plugin |
| `individual` | Owned by a person (`ownerUserId` non-null) | Per-user at registration, or a plugin |

Every agent is in exactly one team — an owned agent in one of its owner's teams. A person may be in several. The only agents in no team are the ones a plugin brings for everyone. `edit_user` keeps these rules (see [User](../objects/user.md#teams)).

Creating a team does not create an agent. You staff the team, or install a plugin that does.

### The assistant

Every human has one personal assistant: an `individual`-category agent, `ownerUserId = me`, installed at registration. It subscribes to all nine object events by default. When you send a message to it, the message lands in its inbox and it replies in a turn in that thread ([How an agent gets work](../architecture/overview.md#how-an-agent-gets-work)).

## Model

Model is per agent: `agent_run_config.model_id` and `agent_run_config.model_provider`. At session start the provisioner reads these and passes them to the harness as `selectedModel` in `SessionConfig`. The tier label is recorded on `sessions.model_tier` (used for token-usage bucketing in `TokenUsage.byTier`), not for routing.

HyperIdle holds no model API key. The harness brings its own login. See [harnesses.md](./harnesses.md).

## Trust

Agents hold their own credentials, run their own tools, and work with broad self-permission. Humans step in at consequential moments via review — a collaboration checkpoint, not a cage. Every review waits for a human's verdict; an agent's verdict-history approval rate (`layers/core-api/policy/src/approval-rate.ts`) is shown on its profile, never used to auto-resolve or skip a review.
