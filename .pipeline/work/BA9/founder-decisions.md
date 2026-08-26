# BA9 — Founder decisions (live interview, 2026-08-25)

Settled in conversation with the founder. These are authority for design and build.
Open items are at the bottom.

## D1 — Follow the Agent Plugins standard, wholly

Adopt **Agent Plugins 1.0.0** (spec: https://github.com/agentplugins/agent-plugins-spec,
published 2026-08-06; proposed by Vercel, refined with AWS, Anysphere, GitHub, Microsoft, OpenAI).

Founder: *"plugins for agentic tools have half way become a standard... so we should stick to typical
plugin ways and typical ways of installing plugins"*, and *"general plugins should work"* — a plugin
written for another tool must genuinely do something here, not merely install.

What the spec normatively covers (verified against `spec/1.0.0.md`):

- `plugin.json` at the plugin root. Only `$schema` and `name` are required; the permitted top-level
  fields are exactly `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`,
  `license`, `keywords`, `extensions`. Unknown top-level fields are reported and ignored, not fatal.
- **Skills** — each immediate child directory of `skills/` containing a regular file named exactly
  `SKILL.md` is one skill.
- **MCP servers** — `mcp.json`.
- Package containment: every package-supplied path MUST resolve inside the plugin root.
- Client extensions: a reverse-domain namespace, both as a top-level directory (`com.example.client/`)
  and as a key under `extensions`. A client MUST ignore namespaces it does not implement.
- Explicitly **out of v1**: commands, hooks, agents, rules, LSP servers — *"too client-specific for a
  stable portable contract"*.
- Install, update, disable and removal are **out of scope** of the spec. Every client defines its own.

Mapping for HyperIdle:

| Standard | Lands as |
|---|---|
| `plugin.json` | adopted verbatim |
| `skills/` | knowledge items of role `skill` |
| `mcp.json` | `mcp_server` configuration |
| agents, routines, rules | our own reverse-domain namespace — the slot the spec leaves to clients |

`CONFIGURATION_KINDS` already carries `agent`, `skill`, `routine`, `tool`, `mcp_server`,
`harness_descriptor` (`framework/domain-model/src/configuration.ts:1`), which matches this split.

## D2 — Skills are knowledge, and they come back

Founder: *"Skills are knowledge. And skills MUST come back that is the most essential feature of all
harnesses... skills should edit in the knowledge view and via context of the knowledge element become
part of the context assembly and feed into the agent setup. That was the original idea and is still
the best idea. Skills are just very powerful knowledge documents which have a specific role."*

A skill is **not** a new subsystem, a new table or a new screen. It is a knowledge item with a role
that tells context assembly where to materialise it in the session sandbox.

Correction on the record: skills do **not** exist today in any form. There is no skills table, no route
and no loader; `skill` appears only as a value in two configuration-kind lists
(`framework/domain-model/src/configuration.ts:3`). The old `skills` column on agent run config was
dropped with zero production readers and the schema says not to resurrect it as a column
(`framework/db/src/schema.ts:103`) — this decision does not resurrect it; it makes skills knowledge.

Why this fits the existing machinery:

- Knowledge items already carry `scopeKind`, `scopeId`, `topic`, `title`, `body`, `format`, `status`,
  `version` (`framework/db/src/schema.ts:793`).
- Context assembly already materialises knowledge into sandbox files — `knowledge/practices`,
  `knowledge/decisions`, `knowledge/failures` (`run-orchestration/src/context.ts:577`), described to the
  agent as files it can read and update.
- The sandbox already reserves the folders the harnesses look in — `.claude`, `.codex`, `.opencode`,
  `.mcp.json`, `AGENTS.md`, `CLAUDE.md` (`run-orchestration/src/scaffolding-paths.ts:1`).

## D3 — Four roles of knowledge document

Founder: *"we support agents & rules also as special knowledge documents. The rules are easy those are
just standard knowledge pieces. The agent files are maybe a bit more complex since we have match agent
knowledge files to an agent so that the context assembly works there."*

| Role | Materialises as |
|---|---|
| ordinary knowledge | `knowledge/...` files, as today |
| skill | a skill the harness discovers (`SKILL.md` in the harness's skills location) |
| rule | plain knowledge with a destination |
| agent file | AGENTS.md-shaped, and **bound to a particular agent** so the right content reaches the right session |

The agent-file binding is the one with real work in it. There is no role field on `knowledge_items`
today — one column plus a materialiser that knows each role's destination.

## D4 — The installer chooses the scope: a team, or the whole backend

Founder: *"the person installing a plugin has to define the scope team versus global."*

Maps onto scopes knowledge already has: `factory` is the whole install, `team` is one team
(`framework/domain-model/src/knowledge.ts:6`). Note `SCOPE_TO_LAYER` maps `factory → L4` and
`team → null`; the team case needs checking during design.

## D5 — Your edit wins, you are told it detached, and you can restore

Founder: *"your edit wins but you are told that your file detached from the plugin. And maybe we add a
button to bring back a file to the plugin state."*

Not overkill: `plugin_configuration_defaults` already stores the plugin's value and a version hash of
it, so the original is retained by construction. Restore is writing that value back.

**This also settles the "App-managed" edit lock** (an open item from the plan). The lock existed to stop
people editing app-provisioned agents while app defaults silently overwrote them anyway. Detach-and-
restore solves the same problem honestly, so the lock is **deleted**, not moved to another flag and not
renamed to a third agent category. Supporting facts, independently verified: `PATCH /api/agents/:id`
never enforced it (`layers/core-api/src/routes/agents.ts:321-357` checks role, never category); the
warning text is backwards, because the system prompt is overwritten on **every** launch for any role
with a template (`layers/agent-orchestration/src/factory-run-config.ts:82-97`); and
`docs/agent-layer/agent-model.md:92` already says category must never be a permission check.

Ships with it either way: the every-launch overwrite stops being a silent surprise.

## D6 — Plugins come from a git URL, a zip, or a folder path. No marketplace.

Founder: *"most plugins these days come from github urls, but i guess also zips or folder paths should
work. Marketplace is definitely too early."*

A git URL is the primary path and the one that works on a shared backend. Zip and folder path also
work. A marketplace is explicitly out of scope and can sit on top later without changing anything
underneath.

---

## D7 — Core entities get rich event subjects, not just an id (2026-08-27)

Founder, on BA9c: *"why do only task and bet get a canonically rich shape. even though thread and block
are next to task the core objects in our system. Also the others there artifact, team, ... a lot of those
are valuable insights that should have rich shape."*

So a `generic` subject carrying only entity kind and id is the floor, not the goal. Every core entity an
event names should arrive assembled — thread, item/block, artifact, team, session, agent — reusing the
canonical assembly where one already exists. Note the bundle union already carries a
`kind: "knowledge"` variant that a knowledge event should be using.

## D8 — A retro runs at the end of something, most typically a task (2026-08-27)

Founder: *"retro runs at the end of something, most typically I would say a task."*

So the answer to "may the retro fire on every bet state change" is **no** — it fires at completion. And
the primary subject is a **task** finishing, not only a bet. BA9d must decide how the routine only wakes
at the end: the prompt can read the transition BA9c now delivers and stop early, but that still starts a
session per transition, which is real spend on a shared backend. Filtering at the routine is the
alternative and is new machinery. **Bring this to the founder when BA9d starts.**

## D9 — Merge and split come back; flag-for-review does not (2026-08-27)

Founder approved the recommendation. Rebuild knowledge merge and split as agent-reachable doors,
recovered from history at `3efc6c573^` — the AU44 ledger records their deletion as a scope breach and
says this track must rebuild them. Drop flag-for-review: both audit rows that examined its
implementation reached DELETE.

## D10 — Delete the "Draft with AI" stub (2026-08-27)

Founder: *"yeah if its a stub delete."* It composes strings with no model call
(`layers/core-api/src/routes/bets.ts:625-631,652-686`). Remove the button and its stub route; the human
bet-retro pane itself stays in core.

## Still open

- Do knowledge merge, split and flag-for-review come back? (The AU44 ledger records their deletion as a
  scope breach and says this track must rebuild them; the two rows that examined flag's implementation
  both said delete.)
- How is the automatic post-bet retro re-provided, given that an event-fired routine never learns which
  event fired it?
- If the retro becomes an ordinary routine, is firing on every bet state change acceptable?
- Does the "Draft with AI" button on the bet retro pane stay? (It is a stub with no model call.)
- How the whole thing is split into iterations, verified once as a whole.
