# BA9b — Skills, rules and agent files are knowledge

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/founder-decisions.md` first —
it is authority alongside this plan. Depends on **BA9a** (a plugin can be installed).

## Outcome

Knowledge documents carry a **role**. Context assembly materialises each role into the place the harness
looks for it in the session sandbox, so an agent genuinely uses them. A plugin's `skills/` folder and its
rules and agent files become knowledge items — editable in the knowledge view, ranked and assembled like
any other knowledge, because that is what they are. A plugin's `mcp.json` reaches the session too.

## Why this matters

Founder, verbatim: *"Skills are knowledge. And skills MUST come back that is the most essential feature
of all harnesses... skills should edit in the knowledge view and via context of the knowledge element
become part of the context assembly and feed into the agent setup. That was the original idea and is
still the best idea. Skills are just very powerful knowledge documents which have a specific role."*

Skills and MCP servers are also the **entire portable half** of the Agent Plugins standard. Without this,
a plugin written for another tool installs and contributes nothing, and "general plugins should work" is
not true.

## What exists today

**Skills do not exist in any form.** No `skills` table, no route, no loader. `skill` appears only as a
value in two configuration-kind lists (`framework/domain-model/src/configuration.ts:3`,
`framework/domain-model/src/agent-behavior-config.ts:1`). An older `skills` column on agent run config was
dropped with zero production readers, and the schema says not to bring it back as a column
(`framework/db/src/schema.ts:103`). This package does not bring it back as a column — it makes skills
knowledge.

**Knowledge items** (`framework/db/src/schema.ts:793`): `id`, `scopeKind`, `scopeId`, `topic`, `title`,
`body`, `format`, `status`, `version`, `updatedBy`, timestamps. There is **no role field** — that is the
one column this package adds.

**Scopes and layers** (`framework/domain-model/src/knowledge.ts:1-18`): scopes are `factory`, `product`,
`practice`, `task`, `bet`, `team`, `user`. `SCOPE_TO_LAYER` maps `factory → L4`, `product → L2`,
`practice → L3`, `task → L1`, and `bet`/`team`/`user → null`. **The team case having no layer needs
resolving here**, because BA9a lets a plugin install at team scope.

**Context assembly already writes knowledge into the sandbox** as files the agent is told it can read and
update — `knowledge/practices`, `knowledge/decisions`, `knowledge/failures`
(`layers/agent-orchestration/run-orchestration/src/context.ts:342,577-579`).

**The sandbox already reserves every folder the harnesses look in**
(`layers/agent-orchestration/run-orchestration/src/scaffolding-paths.ts:1`): `.fabric`, `context`,
`knowledge`, `work`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude`, `.codex`, `.codex-home`,
`.opencode`, `opencode.json`.

**AGENTS.md and CLAUDE.md are already written** from the assembled prompt
(`run-orchestration/src/context.ts:397-402`; `framework/harness-protocol/src/harness/harness-adapter.ts:81`).
The dual write is deliberate: `AGENTS.md` is the cross-vendor convention, `CLAUDE.md` is what current
harness auto-discovery reads.

**Per-session MCP config is already written into the sandbox** in a per-harness dialect —
`codex-toml`, `opencode-json`, `cursor-json` (`harness-adapter.ts:246-252`) — for the tool bridge. A
plugin's `mcp.json` has to **merge with** that, not replace it.

**Knowledge is already ranked into the session bundle** with weights, including `attentionScore`
(`layers/core-api/knowledge/src/scoring-config.ts:25`, consumed at
`layers/core-api/knowledge/src/session-knowledge-assembler.ts:192,200,209`), and L3 is scoped by
`communityForRole` (`session-knowledge-assembler.ts:305-311`).

## The standard

From Agent Plugins 1.0.0 (`spec/1.0.0.md`): *"Each immediate child directory containing a path named
exactly `SKILL.md` that resolves to a regular file is treated as one skill."* MCP servers are declared in
`mcp.json`. Clients must expand `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` in MCP `args`, `env` and `cwd`,
resolve `command` as a single executable token, and default the working directory to the plugin root.
Rules, hooks, commands and agents are **explicitly outside v1** and belong to our namespace.

## Corrections from BA9a (2026-08-26) — read before building

Three things learned while building and proving BA9a change what this package can assume.

**1. `plugin_configuration_defaults` is NOT empty on an existing install.** Earlier refinement recorded
that nothing writes that table. True of the code at HEAD — but a real database carries **orphan `builtin`
rows** (33 on the dev install: agents, tools, a routine, a harness descriptor). The writer existed, added
by AU2 (`#414`), and was deleted by the AU20 cleanup in `3efc6c573`. Nothing writes or maintains them
now, and the settings pane on a real install is populated by them. Do not design against a blank slate,
and decide what these rows mean once a real plugin surface exists beside them.

**2. Scope enforcement is this package's, and it does not exist yet.** BA9a stores the install scope
(`plugins.scope_kind`, `plugins.scope_team_id`) and shows it, but nothing filters by it — a `team`-scoped
plugin's contributions currently apply everywhere. The resolver cannot do it: `listConfiguration`
(`layers/core-api/settings/src/plugin-configuration.ts:365`) takes only `kind`/`key`, its inner query
(`:238-258`) joins defaults→plugins→overrides with no scope predicate, and it serves an admin surface
that is not session-specific. The filtering belongs where session assembly happens and the team is known
— `layers/agent-orchestration/run-orchestration/` — which is exactly where this package materialises
knowledge into the sandbox. **AC7 of this plan is where scope starts to bite.** Do not leave it silently
global a second time.

**3. `validateConfigurationValue` will block MCP contributions from being edited.**
`layers/core-api/settings/src/plugin-configuration.ts:92` rejects values containing fields named
`command`, `env`, `secret` and similar. It runs only on the user-edit path, not on install — so a plugin
can contribute an `mcp_server`, but a person cannot then edit it, and a command is exactly what an MCP
server carries. This looks like preemptive security of the kind ETHOS argues against. **Raise it with the
founder rather than working around it.**

Also worth knowing when proving anything by hand: PGlite is single-writer, so reading its data directory
from a second process while the dev server holds it returns a stale snapshot. Verify through the app with
a full page reload, or stop the server first.

## The four roles

| Role | Materialises as |
|---|---|
| ordinary knowledge | `knowledge/...` files, exactly as today — unchanged behaviour |
| **skill** | a skill where the harness discovers it: a directory with `SKILL.md` |
| **rule** | plain knowledge with a destination; founder: *"the rules are easy those are just standard knowledge pieces"* |
| **agent file** | AGENTS.md-shaped, and **bound to a particular agent** so the right content reaches the right session |

Founder on the hard part: *"the agent files are maybe a bit more complex since we have match agent
knowledge files to an agent so that the context assembly works there."*

## Acceptance criteria

1. A knowledge item carries a **role**. Existing items keep behaving exactly as they do now.
2. All four roles are **editable in the knowledge view** like any other knowledge item, and go through
   the same versioning and edit log.
3. Context assembly materialises each role into the session sandbox at the location the running harness
   actually reads — proven per harness, not asserted.
4. An **agent-file** item is bound to a specific agent, and only that agent's session receives it.
5. A skill installed by a plugin is **used by an agent in a real session** — observed in the run, not
   inferred from a row.
6. A plugin's `mcp.json` reaches the session **merged with** the tool-bridge config already written
   there, in each harness's own dialect, with `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expanded.
7. A plugin installed at **team** scope reaches only that team's sessions; at whole-backend scope it
   reaches all of them. The `team → null` layer mapping is resolved, not worked around.
8. Skills, rules and agent files are **ranked and budgeted** by the existing knowledge assembly rather
   than bypassing it — or, where a role must always be present, that is a stated decision with a reason.

## Validation scenarios

- Given a plugin with one skill installed at whole-backend scope, when an agent session starts, then the
  skill is present where that harness looks for it, and the agent uses it during the run.
- Given the same, on each supported harness in turn, then the skill lands in that harness's own location.
- Given a rule item, when a session starts, then the rule is in the assembled context.
- Given two agents and an agent-file bound to one of them, when each runs, then only the bound one
  receives it.
- Given a plugin installed at team scope, when an agent of another team runs, then none of it is present.
- Given a plugin declaring an MCP server, when a session starts, then both that server and the tool
  bridge are configured and reachable.
- Given a plugin skill that a person has edited, when a session starts, then the session gets the edited
  version.

## Out of scope

Installing plugins (BA9a). Event context (BA9c). The rituals plugin and the `strategy` purge (BA9d).
Reworking the knowledge store, its layers, or its scoring. A skills marketplace or authoring UI beyond
editing knowledge.

## Constraints

- A skill is a knowledge item with a role. **Not** a new table, not a new subsystem, not a second store.
- Do not resurrect a `skills` column on agent run config — the schema explicitly forbids it.
- Do not bypass the existing knowledge assembly and scoring; extend it.
- Materialising must not break the existing `knowledge/practices|decisions|failures` files or the
  AGENTS.md + CLAUDE.md dual write.
