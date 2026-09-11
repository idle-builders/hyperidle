# One User Substrate — the model

Founder direction, 2026-09-09. This is the target architecture, captured before
the audit that decides what survives into it.

## The idea

Humans and agents are the same thing: users. `kind` is a **representation detail**,
not a structural one. Everything underneath is shared.

Two assignable primitives:

| Primitive | Human sees | Agent sees |
|---|---|---|
| **Capability** | an action in the UI | an MCP tool |
| **Event** | a notification they can switch on/off | a routine trigger |

## Rules

1. **The route is the capability.** Hand-written. The route surface is designed from
   what we offer a user — never from what the layer underneath happens to expose.

2. **A capability is one thing a person would say they're doing** — not one internal
   function, not one table write. *Post a message*, *submit a review* and *record a
   verdict* are three acts. *Change the title* and *change the status* are both
   "edit this knowledge item" — one act.

3. **Everything counts.** Reads and writes are equal. Literally anything a user can
   do is a capability.

4. **Scope: global > team > user.** Every capability and every event lives at a level.
   Global things belong to the global owner. Team things belong to that team — "edit the
   team" is held by the team's owner and their assistant. User things belong to that one
   user — "message my assistant" is only ever theirs. Scope plus ownership is what decides
   whether something is in your reach at all.

5. **Within your reach, everything is on by default.** You are not handed an empty list to
   fill. Every capability in your scope is available and every event in your scope reaches
   you, and you switch off the ones you don't want. Same rule for both kinds of user:
   a person mutes a notification, an agent has a trigger turned off. Anything can also be
   assigned explicitly.

6. **This is spam control and ownership, not security.** Per ETHOS: security is never
   preemptive. No threat model, no gate-by-default classifier, no hardening, and above all
   no empty-by-default permission list — that is the enterprise pattern the ethos rejects.
   The scope levels exist so people aren't flooded and so ownership is legible.

7. **Lint enforces it.** A route with no tool, or no UI component, fails the build.
   That is what makes the design automatic rather than merely intended.

## The default install

The app ships with **nothing**. No teams, no roster, no personas — empty prompts, and a
**single agent** that holds every capability and receives every event through one routine.
Everything beyond that arrives from a **plugin** or from the user.

That resolves what "on by default" means. There is no question of what an agent does when an
event fires and nobody wrote a prompt, because on a fresh install there is one agent, one
routine, and it gets everything. Scope levels (global > team > user) are not the starting
structure — they are what appears once a plugin or a person adds teams and agents.

### Already half-built

The configuration layer is the right shape already:

- `CONFIGURATION_KINDS` = `agent | skill | routine | tool | mcp_server | harness_descriptor`
  — a plugin can already contribute all six, including tools.
- `ConfigurationOrigin.type` = `builtin | plugin | user`, with
  `ConfigurationValueSource` = `default | user_override | user_owned`.
- `builtin` is a reserved plugin id that cannot be disabled or removed.

So "default empty, customization by plugin or user" is already the declared model.

### But the app ships with opinions anyway

None of the built-in content is expressed as a `builtin` contribution — it is hardcoded:

- `AGENT_ROLE_CATALOG` — 16 roles with labels, categories, descriptions and team functions,
  a plain const in `framework/domain-model/src/agent-roles.ts`.
- System prompt templates read off the filesystem by
  `readSystemPromptTemplateForRole` (`layers/core-api/org/src/system-prompt-templates.ts`),
  plus a hardcoded `APP_ASSISTANT_SYSTEM_PROMPT`.
- `POST /teams` defaults `functions` to `["development","product"]` and scaffolds a roster
  from that catalog, rejecting with 400 if it produces no agents — the app insisting a team
  must have the agents it thinks a team needs.

Only one real plugin exists in the repo: `plugins/knowledge-management/`.

### What that fixes for free

Divergence 1 from the parity audit — "create a team" built twice — dissolves rather than
being repaired. `POST /teams` scaffolding a roster is the app having an opinion. Once the
roster moves to a plugin, the route just creates a team, and there is nothing for the agent
path to diverge from.

## The test

You should not be able to tell whether a user is an agent or a human without looking
at `kind`.

## Why the current mess exists

The reach-parity audit found 17 things only a person can do, 15 only an agent can do,
4 capabilities built twice, and 6 dead doors. Those are not independent bugs. They are
what a system produces when there is nowhere to declare a capability once — so it gets
spelled twice, once as a route the UI calls and once as a tool, and nothing forces the
two spellings to agree.

## What happens next

A brutal census, then a cull. Every capability candidate and every event candidate gets
judged: **keep**, **fold into another**, or **delete**. The cull test is rule 1 — is this
something we offer a user, or is it something the layer underneath happens to expose?
