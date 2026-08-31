# System Prompts

This folder holds one file: the persona for the per-user **Assistant**.

Every other role persona moved into the `role-personas` plugin
(`plugins/role-personas/personas/`). HyperIdle ships no opinion about what a
Builder or a Product Manager is — a new team is one agent with a bare identity,
and roles arrive with a plugin or with you. See
[agent-model §2.1](../agent-layer/agent-model.md).

## How an identity reaches a session

An agent's identity is an `agent_file` knowledge document bound to that agent —
`scope_kind='user'`, `scope_id` the agent's id. It is read and edited like any
other document, through the one knowledge edit endpoint, and editing it changes
what the agent's next session runs with. The document body becomes the
`## Identity` section of the AGENTS.md written into the session's sandbox.

Nothing reads a persona off disk at runtime any more. The old mechanism — a
frozen `SYSTEM_PROMPT_TEMPLATE_FILES` allowlist mapping role → filename, read at
boot and again at request time through `GET /api/agents/templates/:role`, with
the live copy in `agent_run_config.system_prompt` — was removed in BA9f and
BA9g, along with the route, the column and the map.

A plugin seeds an identity by naming an `identity` file on the agent it
contributes; installing the plugin materialises the document.

## The one file here

- [assistant.md](assistant.md) — the persona for the user's personal Assistant.

The Assistant is the exception, deliberately: it is the single agent HyperIdle
ships, one per human, and it carries extra rights. It is what you talk to on a
fresh install, so it arrives with a persona rather than a blank identity.
