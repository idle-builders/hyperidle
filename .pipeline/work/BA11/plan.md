# BA11 — Rule, agent file and routine prompt are knowledge documents

## What we need

**Why this exists.** Four kinds of document feed an agent session — the skill, the rule, the agent
file and the prompt a routine fires with — and they are meant to be the same thing wearing different
roles: a knowledge document, editable in one place, reaching whoever its scope says. Only the skill
actually is one. A rule and an agent file can be read but never written, and a routine's prompt is a
column of loose text with no home in knowledge at all. The cost of not doing it: a routine's
instruction cannot be edited, reviewed or reused like the knowledge it plainly is, and a plugin that
contributes one has nothing to contribute it *to* — which breaks the plugin story again the moment it
ships a routine.

**What exists today.** Context assembly materialises all four roles. `rule` writes into
`knowledge/rules/`; `agent_file` writes into `knowledge/rules/` as well, described in its own comment
as a supplement to AGENTS.md, while the real AGENTS.md is generated from the assembled prompt.
`routines.prompt` is a nullable `text` column, renamed from `description` on the grounds that "the
prompt never had a home of its own; this column IS it". The plugin manifest can declare agents,
routines and skills, and has no concept of a rule or an agent file.

**Missing delta.** Producers for the roles that have none, materialisation that matches what each
role is for, and a real home for the routine prompt. An agent file should be that agent's AGENTS.md
rather than another file in the rules folder. A rule should land where the harness in use actually
looks for rules. A routine should point at a knowledge document instead of carrying its prompt
inline, and moving existing prompts across is part of the work.

**Depends on.** BA10 — a rule or an agent file cannot be authored until a role can be set on a
knowledge document, and this item is the producers for those roles.

**Dials (provisional).** complexity: feature · ambiguity: new context, little knowledge · exposure:
user-facing surface

## How it works

## How we work on this

## Confusions

## Proposed items
