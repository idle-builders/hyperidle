# BA9b — Skills, rules and agent files are knowledge

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/plan.md` first — it carries
the founder decisions and is authority alongside this plan. Depends on **BA9a**.

## Outcome

Knowledge documents carry a **role**, and context assembly materialises each role where the harness
looks for it in the session sandbox, so an agent genuinely uses them. A plugin's `skills/` folder,
rules and agent files become knowledge items — editable in the knowledge view, ranked and assembled
like any other knowledge. Its `mcp.json` reaches the session too.

**Why.** Founder: *"Skills are knowledge. And skills MUST come back — that is the most essential
feature of all harnesses."* Skills and MCP servers are also the **entire portable half** of the
Agent Plugins standard: without this, a plugin written for another tool contributes nothing.

| Role | Materialises as |
|---|---|
| ordinary | `knowledge/...` files, exactly as today — unchanged |
| **skill** | a directory with `SKILL.md`, where the harness discovers it |
| **rule** | plain knowledge with a destination |
| **agent file** | AGENTS.md-shaped, bound to one agent so the right content reaches the right session |

## Acceptance criteria

A knowledge item carries a role; existing items behave exactly as now, and all four roles are
editable in the knowledge view through the same versioning and edit log. Context assembly
materialises each role where the running harness actually reads — **proven per harness, not
asserted** — and a plugin skill is **used by an agent in a real session**, observed in the run, not
inferred from a row. An agent-file item reaches only its bound agent. A plugin's `mcp.json` reaches
the session **merged with** the tool-bridge config already there, in each harness's dialect, with
`${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expanded. A team-scoped plugin reaches only that team's
sessions, the `team → null` layer mapping resolved rather than worked around.

**Out of scope.** Installing plugins (BA9a), event context (BA9c), the rituals plugin and the
`strategy` purge (BA9d); reworking the knowledge store, its layers or scoring.

**Constraints.** A skill is a knowledge item with a role — not a new table, not a second store; do
not resurrect the `skills` column on agent run config, which the schema forbids. Extend the existing
knowledge assembly rather than bypassing it, and do not break
`knowledge/practices|decisions|failures` or the AGENTS.md + CLAUDE.md dual write.

# As built

One column on `knowledge_items` (migration 0062, `NOT NULL DEFAULT 'ordinary'` plus a check
constraint) and a materialiser that knows each role's destination. No skills table, no second store.

## Where each harness actually reads skills from — established by running the binaries

Four skills were planted, one per candidate directory with a distinct name, and every real binary
was asked to list the skills available to it — a harness cannot name a skill it never discovered.

| Harness | Probe skills visible | Directories it scans |
|---|---|---|
| `claude` | `probe-claudedir` | `.claude/skills` |
| `opencode` | `probe-claudedir`, `probe-opencodedir`, `probe-agentsdir` | `.claude`, `.opencode`, `.agents` |
| `codex` | `probe-agentsdir` | `.agents/skills` |
| `cursor-agent` | `probe-claudedir`, `probe-agentsdir` | `.claude/skills`, `.agents/skills` |

**`.claude/skills` plus `.agents/skills` covers all four**, and that is what `HARNESS_SKILL_DIRS`
holds (`.agents` had to be added to `SANDBOX_SCAFFOLDING_PATHS`). Nothing reads `.codex-home/skills`
— that is Codex's *config* directory. **Re-run this probe when a harness is added or upgraded:**
skill discovery is the harness's behaviour, not ours. And **OpenCode loads skills on demand**,
exposing name and description at startup and fetching the body only if the agent decides it is
relevant — a skill's `description` is not documentation, it decides whether the skill is ever used.

## MCP dialects, also established by running the binaries

Plugin MCP servers route through `cli-mcp-config.ts`, the canonical owner — one implementation per
dialect, not two. Probing found a defect the file could never have revealed: **opencode requires
`command` as a single merged array** `[binary, ...args]`, not separate `command` and `args`. The
separate form is silently rejected with *"Ignoring MCP config entry without type"*, so plugin
servers would have been dropped there with every test green. Codex's `[mcp_servers.key]` block with
separate fields is correct.

## The failure shape the reviews kept finding

Three review rounds found one shape at three levels, every instance passing its tests: skill
directories chosen by plausible name (one right, one redundant, one dead), with unit tests that only
asserted the writer matched the constant the same author picked; a harness test that imported no
production code and hardcoded the directories, so repointing `HARNESS_SKILL_DIRS` at a dead path
stayed green with real model calls; and a model-output assertion blind to a wrong path for codex and
cursor-agent, which scan every file and found the skill at the dead path anyway. **Breaking the
constant redirects the write; it does not suppress it.** The fix pairs a file-presence assertion at
the expected path with the model-output proof.

`agentId` was also optional on `SessionKnowledgeInput` with no production caller passing it, so
agent-file binding never ran and its test passed on a path production never took — now required.
**An optional parameter that defaults to the feature being off is the same trap as a compatibility
shim.**

## Known limitations

- **`agentBindingId` derivation is scopeKind-blind** (`framework/domain-model/src/work-intent.ts`):
  a team-scoped `agent_file` yields a binding id equal to the team id, matching no agent, so it
  silently reaches nobody. Latent; needs a misconfigured item to trigger.
- **No budget guard on capability items.** Appended unranked and unbudgeted — a deliberate decision,
  but a large plugin skill can crowd the context window with nothing to stop it.
- **Uninstall hard-deletes a user-edited skill** (`routes/plugins.ts`), awkwardly beside the
  detach-and-restore decision. Open founder question.
