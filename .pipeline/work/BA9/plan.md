# BA9 — Reflection rituals ship as a plugin, not as core machinery

**Status: not done.** Batches a–d and g shipped (#513, #515, #516, #517, #531); e and f remain. BA9 is
delivered only when all seven are done and proven end to end on the packaged app.

## What we need

The rituals *about* the work — retros, practice communities, and the knowledge sweeps that serve them — leave
core and are re-provided as a plugin: ordinary agents, skills and routines a team can install, change, or not
install at all. Core keeps the knowledge store people and agents read and write while working. Today these are
opinions about how a team should reflect, wired in as tables, routes, jobs and hardcoded personas, so a team
that does not work that way carries machinery it cannot change. **It also absorbs two purges that cannot be
finished alone:** deleting `strategy` as an agent category strands the five facilitator personas that alone
carry it, and the four built-in routines *are* the sweeps and retros being relocated — each purge is the same
act as this move. The founder's bar is end-to-end: *"the concept of strategy is completely purged and the
plugins are proven to be working — and to end that means installing a plugin and seeing the agents work,"*
built in iterations but verified at the end as one.

Done means: a plugin can genuinely be installed, disabled and removed, its contributions appearing as editable
app configuration where a user's edit still wins; a team that installs the rituals gets working retros and the
knowledge upkeep behind them from ordinary routines rather than a dedicated code path, and a team that does
not sees a coherent product with no orphaned surfaces; global upkeep runs once rather than per team; no agent
can be created, stored, sent or displayed in a `strategy` category; the scheduler dispatches no hardcoded
built-in routine; no normal caller can subscribe to every event. **Nothing convicted travels** — this
relocates capability, not code, and must never reproduce the builtin-routine path that bypasses the agent-run
architecture. Out of scope: a marketplace, reworking the knowledge store, the unrelated `strategy` fabric
tables.

## How it works

**The Agent Plugins 1.0.0 standard is adopted wholly**, so a plugin written for another tool genuinely does
something here rather than merely installing. `plugin.json` is taken verbatim; each immediate child of
`skills/` holding a `SKILL.md` is one skill; `mcp.json` becomes MCP server configuration; every
package-supplied path must resolve inside the plugin root; unknown top-level fields are reported, not fatal.
The spec leaves agents, routines and rules to clients, so those land under our own reverse-domain namespace,
and install/update/disable/removal are ours too. Plugins come from a git URL, a zip or a folder path — the git
URL being the one that works on a shared backend.

**A skill is a knowledge document with a role**, not a new subsystem, table or screen — the role tells context
assembly where to materialise it in the session sandbox, and the same is true of a rule, an agent file and a
routine prompt. **The installer chooses the scope**, a team or the whole backend, mapping onto scopes
knowledge already has. **Your edit wins, you are told the item detached, and you can restore it** — restore
means re-importing from the plugin, because the plugin *is* the original: install copies it into a managed
directory and records the location, so the source is on disk however it arrived.

**That settles the "App-managed" edit lock: it is deleted**, not moved to another flag and not renamed to a
third category. It existed to stop people editing app-provisioned agents while app defaults silently overwrote
them anyway, and detach-and-restore solves that honestly. It was never enforced (the patch route checks role,
never category), its warning text is backwards (the system prompt is overwritten on *every* launch for any
role with a template), and the agent model already says a category is never a permission check.

**An event-fired routine learns what happened.** A subject carrying only entity kind and id is the floor, not
the goal — every core entity an event names arrives assembled. And **a routine may name a transition, not only
an event type**, so a retro that runs at the end of a task fires on that transition rather than waking on
every state change and burning a session to decide it is not the end; filtering in the prompt costs a session
per transition, and a dedicated completion event would be cleanest but needs new emitters that belong
elsewhere. **No restart is needed after installing a routine** — the event matcher subscribes once per member
of a compile-time constant and reads the database on delivery, so the subscription set cannot go stale.

## How we work on this

Four packages shipped: a plugin installs; skills, rules and agent files are knowledge; an event-fired routine
knows what happened; the rituals become a plugin and `strategy` is purged. Proving those on the packaged app
found the second's capability half unbuilt and the plugin boundary misplaced, producing three further batches.

**BA9e — role and scope become editable on any knowledge document.** The read side is built and proven live: a
factory-scoped skill reaches a team agent and a team-less one alike, a team-scoped one only that team, an
agent-bound one only its agent. The write side does not exist — the create schema has no role, the update
schema cannot change role or scope, nothing writes a user scope so the agent binding has no producer, and no
UI mentions these roles. The capability exists only if a plugin brought it.

**BA9f — rule, agent file and routine prompt become knowledge documents too.** Rules and agent files are
materialised by context assembly with no writer and no manifest key, and an agent file is written as a
self-described supplement while the real AGENTS.md is generated from the assembled prompt — the opposite of the
intent that an agent file *is* that agent's AGENTS.md. The routine prompt is a plain text column whose values
migrate.

**BA9g — the plugin service owns what it installed (shipped, #531).** Provenance was recorded three ways and
skills keyed off a topic prefix, so editing a topic orphaned a skill from uninstall permanently; an ownership
registry makes that lifecycle one operation instead of three that can disagree. Installing over a **disabled**
plugin re-enabled the row but left agents inactive and routines off, reporting enabled with a dead agent. The
batch's MCP item was aimed at the wrong thing: expansion **stays at session provisioning**, because it had
never run in production at all — `pluginsBaseDir` was set by nothing but a test fixture, so `install_path` was
null on every real install and a plugin's MCP servers never reached a session. Both Applications wire it now.
Moving expansion to install would bake a machine path into `default_value_json`, whose hash exists to answer
whether the plugin's shipped default changed, not whether the app moved.

**Most candidate rituals did not travel.** Practice communities, the attention score, the human bet-retro save
and the manual promote door stayed in core because something reads them while working; the five facilitator
personas, the portfolio retro and the contradiction detector died because they never worked. What shipped is
small — one agent and a few routines carrying prompts. Knowledge merge and split come back from history;
flag-for-review does not.

**The pattern worth carrying forward.** The same failure shape appeared at four levels, every instance passing
its tests: skill directories chosen by plausible name while a unit test asserted the writer matched the
constant the same author picked; a harness test importing no production code and hardcoding the directories
itself, so repointing the production constant at a dead path left it green with real model calls; an optional
`agentId` no production caller passed, whose test supplied it itself; and MCP dialect shapes written from
plausibility that the real binary silently rejects. **Evidence that confirms the author's
own setup is not evidence** — what settled each was running the real binary and asking what it saw, then
breaking the production constant and watching the test go red.
