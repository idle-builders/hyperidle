# BA9 — Reflection rituals ship as a plugin, not as core machinery

## Work package

**Outcome.** The rituals *about* the work — retros, practice communities, and the knowledge sweeps that
serve them — leave core and are re-provided as a plugin: ordinary agents, skills, routines and triggers
that a team can install, change, or not install at all. Core keeps the knowledge store people and agents
actually read and write while working.

**Why this matters.** These are opinions about how a team should reflect, wired into the product as
tables, routes, scheduled jobs and hardcoded personas. A team that does not work that way still carries
the machinery and cannot change it. Preconfiguring agents, skills, routines and triggers is precisely
what the plugin surface is for, so this is the difference between the product having a method and the
product supporting yours.

**What exists today.** Two independent audits converged on the same unit: five hardcoded facilitator
personas seeded on first run for "communities of practice" that appear nowhere in the product, and the
two knowledge sweeps those personas own, plus post-bet and portfolio retros, attention scoring and the
promotion pipeline. They run through a builtin-routine path that bypasses the normal agent-run
architecture, are seeded per team so global sweeps fire once per team, and are anchored by a route whose
only purpose is creating them. Twenty-one rows across the audit are marked as belonging here.

**Missing delta.** A plugin that provides these rituals, and their removal from core once it does —
**plus the mechanism by which a plugin is installed at all, which does not exist.** See "What
refinement found" below; this is the single largest correction to this work package's original size.

**Absorbs AU35 and AU39 (2026-08-24, founder decision).** Both were registered in track AU as separate
purges and both were refined into this row, because neither can be finished on its own:

- **AU35 — delete `strategy` as an agent category.** The value is carried by exactly one kind of agent:
  the five facilitators seeded on first boot. They are the agents leaving core here. Deleting the value
  first strands them; moving them into the plugin deletes the value as a side effect.
- **AU39 — remove the built-in routine feature and redesign wildcard event subscription.** The four
  built-in routines *are* the two sweeps and the two retros this work package relocates. Removing the
  built-in mechanism is the same act as re-providing them as ordinary plugin routines.

The founder's bar for the combined work is end-to-end: *"the concept of strategy is completely purged
and the plugins are proven to be working — and to end that means installing a plugin and seeing the
agents work."* Iterations are fine; the verification is not. *"Things should happen in iterations but
still it has to be planned and verified in the end as one, since only full verification guarantees all
parts are done and work."*

**Depends on.** BA1 — the plugin re-provides these rituals as triggers and routines, and the trigger
substrate currently runs nothing. Built first, this would ship a plugin that installs and never fires.
**This work package in turn blocks the plugin-marked deletions in the AU20 audit** — until it exists,
removing them from core loses the capability rather than relocating it.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Refinement ran on 2026-08-24 (see "What refinement found" below). **Settled there:** all
four built-in routines travel — the founder ruled retros are knowledge management too, *"the purpose of
retros is to improve the process and setup"*; the facilitators become part of this
knowledge-management plugin; the work is planned and verified as one even if it is built in iterations;
restarting between install and proof is acceptable; and a **routine** is the umbrella noun, firing either
on a clock or on an event.

**Still open, and needed before build:**
- Which rituals are worth re-providing at all versus simply dropped. Nothing convicted on its own merits
  travels: the contradiction detector inside the promotion sweep is provably dead logic, and per-team
  firing of global sweeps is a defect, not a behaviour to preserve.
- What happens to the "App-managed" edit-lock that the `strategy` value currently drives (below).
- ~~Whether the six-name trigger vocabulary converges onto the event union in this package or in BA1.~~
  **Answered by BA1's refinement (2026-08-25): in BA1.** The trigger-rule entity retires and routines
  absorb it, so the six-name list dies with the thing it validated. A plugin contributes **routines** —
  `CONFIGURATION_KINDS` already carries a `routine` kind — and those routines name any of the 34 event
  types. Two consequences for this package: its plugin ships routines rather than triggers, and the
  per-team duplication of global sweeps is fixed at its cause in BA1 (a routine takes its scope from its
  owning agent, so a global routine runs once) rather than worked around here.

**Design:** light. Two panes change when the category goes, and the plugin's install surface is new. No
new view; confirm against the design system rather than exploring variants.

**Human review gate:** yes, and load-bearing. This migrates live rows, changes a taxonomy a user sees, and
decides whether app-provisioned agents can be edited.

**Constraints.**
- Nothing may be carried into the plugin that is already convicted as broken or dead. This is a
  relocation of capability, not of code.
- The plugin uses ordinary agents, skills, routines and triggers. It must not require a new runtime
  path, and specifically must not reproduce the builtin-routine path that bypasses the agent-run
  architecture.
- A team that does not install the plugin must see a coherent product, not one with visible holes where
  the rituals used to be.

**Out of scope.** Building a plugin marketplace or distribution mechanism. Reworking the knowledge store
itself. Deciding whether teams should hold retros. The `knowledge_strategy_fabric` and
`task_strategy_fabric` tables and their `@lore O2` columns — a third, unrelated sense of the word
`strategy`, which this package must not touch. The kernel-versus-strategy package split, already purged.
Emitting the five events that have no emitter — that is BA8.

**Re-provide what the cleanup removed.** The delete pass removed the knowledge merge and split
operations from core, including their routes. Two destroyers reached that outcome by different
routes — one convicted the implementation as unreachable bulk curation, the other marked the doors
as leaving core for this plugin — and both measured zero callers, so nothing reachable was lost.
Re-providing merge, split and flag-for-review is this package's obligation, not a regression to
investigate. Recover the deleted implementations from git history rather than rewriting them blind.

## What refinement found (2026-08-24)

Read this before sizing the work. Every claim below was checked against `main` at `827adbb24`.

### There is no way to install a plugin

The plugin *configuration* half is real and works: three tables (`plugins`,
`plugin_configuration_defaults`, `configuration_overrides`) and a resolution engine in
`layers/core-api/settings/src/plugin-configuration.ts` where a plugin default loses to a user override
and the origin of each value is tracked.

The other half was never built. **Nothing anywhere writes a `plugins` row.** There is no plugin format,
no loader, no install route, no CLI. The `plugins` table is read-only in practice — the join in
`plugin-configuration.ts` is its only use. `docs/architecture/runtime-simplification.md` describes the
concept ("plugins are preconfiguration bundles... once installed, those contributions appear as editable
app configuration") and no code implements the "once installed" part.

So "ship the rituals as a plugin" is not a relocation onto an existing substrate. The substrate is a
config resolver with no intake. Building the intake is inside this work package.

### The trigger vocabulary is a sixth the size of the event vocabulary

The bus carries **34 event types** (29 entity-lifecycle events — bet state changed, task state changed,
thread created, knowledge created / updated / archived / accessed, artifact created, team created, agent
added, session started / ended, and so on — plus 5 more). A trigger rule may name **6**: `task.accepted`,
`assistant.message`, `routine.fire`, `work.decompose_requested`, `knowledge.action`,
`proposed_call.granted` (`framework/domain-model/src/trigger.ts`).

Two vocabularies for one idea, and the small one is the one a person or a plugin can attach to. Combined
with BA1 — the saved trigger rules are read by no code at all — the honest answer to "what do our plugins
attach to?" is: nothing, and there are no plugins.

**Naming ruling (founder, 2026-08-24).** A **routine** is the umbrella noun, and a routine fires either
on a clock or on an event. What the code calls a "trigger" on a routine is the event-fired case of a
routine, not a separate primitive. Converge the two vocabularies on that, rather than keeping a parallel
six-name list beside the real event union.

### Event-fired routines already work generically — only the hardcoding has to go

`registerEventTriggers` (`layers/core-api/routine/src/routine-scheduler.ts`) already subscribes a
non-builtin routine to **any** `EventType` named in its trigger config. So a plugin-supplied retro can
fire on a bet closing today with no new mechanism. What disappears when the built-ins go is the
in-process coded handler: `fireBuiltinRoutine` runs the work itself, while a generic routine enqueues a
work intent for an agent to do it. That difference is the point — it is the plugin model.

**One real gap:** those subscriptions are registered once, at startup, from the routines present in the
database. A plugin installed while the app runs registers nothing until a restart. The founder accepted
restarts as part of the proof — *"do whatever it takes to prove this, and if that means multiple times
installing and starting"* — so a live-install path is not required, but the restart must be a named,
deliberate step rather than an undocumented surprise.

### `strategy` is doing a second job nobody recorded

The category is not only a dead label. In the interface it renders as the tag **"App-managed"**, shows a
note saying operational configuration may refresh when defaults change, and **disables the harness-type
and model-tier fields** (`layers/core-ui/src/pages/work/AgentDetailPane.tsx`, five uses of `isStrategy`;
`layers/core-ui/src/pages/AgentProfile.tsx`). Deleting the value without deciding what happens to that
lock silently makes app-provisioned agents freely editable, while app defaults keep overwriting them and
nothing says so.

**This is an open decision for this work package**, not something refinement settled. Three live options:
drop the lock and trust the human (matches the ethos, smallest change); keep the behaviour but move it
onto its own explicit "provisioned by a plugin" flag; or keep a third category under an honest name. Note
that `docs/agent-layer/agent-model.md` states category must never be a permission check — which the
current lock arguably already is.

Two further corrections to AU35's original text: it says four *factory roles* carry the category —
it is four **catalog** roles (`facilitator`, `scout`, `infra`, `platform`) and **five seeded agent rows**,
all of role `facilitator` (build, product, growth, ops, facilitation). And `scout`, `infra` and `platform`
are never instantiated by anything — they exist only in the catalog and in Storybook stories. Also live:
`POST /agents` derives the category from the catalog, so creating an agent with one of those four role
names still mints a `strategy` agent today.

### The bus change is now one caller, not three

AU39 was written when three places subscribed to every event. Two are already gone. The only one left is
the runtime wake-up hint (`layers/agent-orchestration/run-orchestration/src/start-runtime.ts`), and it is
a latency shortcut, not a dependency: the runtime drains its queue on a one-second timer, and the
subscription only makes it drain immediately. The code says so — *"EventBus is a latency hint only;
polling remains the process-death recovery path."* It needs to know that something may have been queued,
not what happened, so a named signal or an explicit infrastructure-only hook replaces it without changing
behaviour beyond up to a second of latency.

### Three convicted symbols travel with this work

From the AU43 delete list, still standing and still unexplained: `StrategyEvent` and `KernelEvent`
(`framework/domain-model/src/events.ts`) and `PostBetRetroArgs`
(`layers/core-api/routine/src/routine-scheduler.ts`). `StrategyEvent` is the same dead word; the other two
belong to the built-in retro path. Delete them here rather than in a separate accounting pass.

### What AU44 deliberately left standing for this package

Two things were deleted during the consolidation pass and put back on purpose, because this plugin does
not exist yet: the bet-retro knowledge upsert, and the facilitator roster seeding in
`layers/core-api/src/bootstrap/factory-state.ts` (which carries a `@lore` note saying exactly that). Both
are this package's to remove, once the plugin takes over.

## Acceptance criteria

**The plugin substrate**

- A plugin can actually be installed: there is a plugin format, an intake that writes the `plugins` and
  `plugin_configuration_defaults` rows, and a way to disable and remove one again.
- An installed plugin's contributions — agents, skills, routines, triggers — appear as editable app
  configuration, and a user's edit still wins over the plugin's default.

**The rituals as a plugin**

- The rituals are available as a plugin a team can install.
- A team that installs it gets working retros and the knowledge upkeep that supports them, driven by
  ordinary routines and skills rather than a dedicated code path.
- A team that does not install it sees a coherent product with no orphaned surfaces.
- Core no longer contains the ritual machinery, its dedicated tables, routes and scheduled jobs.
- Global upkeep runs once, not once per team.

**The purge (absorbed from AU35 and AU39)**

- No agent can be created, stored, sent over the wire or displayed in a `strategy` category. The value is
  gone from the type, the schema, the wire contract and the interface, and every row that carried it
  holds a category that exists.
- Whatever the "App-managed" edit-lock becomes, it is a decided, named thing — not a side effect of a
  category value. An agent provisioned by a plugin either is editable, or says why it is not.
- The routine scheduler dispatches no hardcoded built-in routine. `BUILTIN_ROUTINE_IDS`,
  `fireBuiltinRoutine`, the builtin specs and their seed rows are gone.
- Knowledge decay and promotion still happen — fired by the plugin's routines, not by core.
- A normal caller cannot subscribe to every event. The runtime wake-up hint uses an explicit
  infrastructure-only capability, or named events, and the runtime still drains promptly.
- Nothing in code or docs offers `strategy` as an agent category, and `StrategyEvent`, `KernelEvent` and
  `PostBetRetroArgs` are gone. The unrelated `knowledge_strategy_fabric` / `task_strategy_fabric` tables
  and their `@lore O2` columns are untouched — different concept, same word.

**The proof**

- The whole thing is verified once, end to end, as one: install the plugin into a running install, watch
  the agents it provides actually do the work, and see the same install without it stay coherent.
  Restarting between install and proof is allowed and expected — say so as a step rather than hiding it.

## Validation scenarios

- Given a team that has installed the plugin, when a bet finishes, then a retro happens as it does today.
- Given a fresh install without the plugin, when someone uses the product, then nothing refers to retros
  or practice communities.
- Given several teams on one backend with the plugin installed, when the knowledge upkeep runs, then it
  runs once rather than once per team.
- Given a running install with no plugins, when the knowledge-management plugin is installed and the app
  is restarted, then its agents, skills and routines are present as editable configuration and its
  routines fire on their events and schedules — watched happening, not inferred from a table.
- Given the plugin is disabled or removed, when the same events occur, then nothing fires and the product
  still holds together.
- Given a client sends `agentCategory: "strategy"` to the org endpoint, when the request is validated,
  then it is rejected — the value is not in the contract.
- Given a database seeded by an older first-boot routine, when it is upgraded, then no row holds
  `strategy`, no agent is stranded without a category, and the row count is unchanged.
- Given the repo is searched for `strategy` as an agent category afterwards, when the results are read,
  then every remaining hit is the unrelated knowledge/task fabric sense.


---

# As refined and delivered

Consolidated at ship. `requirements.md` and `refine-critique.md` are folded in here and deleted.
`founder-decisions.md` stays — it is founder authority, not a phase artifact, and the four package
plans cite it.

## BA9 was split into four packages (founder decision, 2026-08-25)

A live interview settled the substrate, and the work was too large for one package. The split, in
build order, with each package's own `plan.md` carrying its "As built" record:

| Package | Outcome | Shipped |
|---|---|---|
| **BA9a** | A plugin can be installed | PR #513 |
| **BA9b** | Skills, rules and agent files are knowledge | PR #515 |
| **BA9c** | A routine that fires on an event knows what happened | PR #516 |
| **BA9d** | The rituals become a plugin, and `strategy` is purged | PR #517 |

## Three more batches (founder, 2026-08-29) — BA9 is not done

Proving a–d end to end on the packaged desktop app found the capability half of BA9b unbuilt and the
plugin boundary in the wrong place. These are batches of BA9, not follow-on work. BA9 is delivered
when all seven are done, and everything is proven end to end on the packaged app.

| Batch | Outcome | Depends on |
|---|---|---|
| **BA9e** | Role and scope are editable on any knowledge document | — |
| **BA9f** | Rule, agent file and routine prompt are knowledge documents | BA9e |
| **BA9g** | The plugin service owns what it installed | BA9f |

**BA9e — role and scope are editable.** Founder: *"role and scope should be editable"*. The read side
is built and proven live: a factory-scoped skill reaches a team agent and a team-less one alike, a
team-scoped one reaches only that team, an agent-bound one reaches only its agent. The write side does
not exist. `createKnowledgeSchema` has no `role`; `updateKnowledgeSchema` cannot change `role`,
`scopeKind` or `scopeId`; **nothing anywhere writes `scopeKind:'user'`**, so the agent binding the
reader supports has no producer; and no `.tsx` mentions `skill`, `rule` or `agent_file`. Only
`upsertPluginSkill` writes a role today, so a capability exists only if a plugin brought it.

**BA9f — the other three become knowledge documents.** Founder: *"rule, agent file, skills files,
routine prompt should all be knowledge documents"*, and the routine prompt belongs here *"since
otherwise the plugin stuff is directly broken again"*. `rule` and `agent_file` are materialised by
`context.ts` and have no writer and no manifest key. `agent_file` is written into `knowledge/rules/`
as a self-described supplement while the real AGENTS.md is generated from the assembled prompt — the
opposite of the intent that an agent file IS that agent's AGENTS.md. `routines.prompt` is a plain
`text` column; existing prompts migrate.

**BA9g — the plugin service owns what it installed.** Founder: *"the plugin is not purely a writer it
also needs to know the provenance and be able to update… the plugin service keeps track of which
entities belong to a certain plugin"*. Provenance is recorded three ways: `users.plugin_id`,
`routines.plugin_id` and `plugin_configuration_defaults.plugin_id` are real columns, while skills use
`topic = "plugin:<id>"` — editing a skill's topic orphans it from uninstall and enable permanently.
The contributions view reads only the configuration tables, so skills never appear and the decided
detach/restore has no surface. `mergePluginMcpContributions` expands `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`
at session-provisioning time; that moves to install.

Found during review of the a–d follow-on fixes, and belonging to this batch: installing over a
**disabled** plugin re-enables the plugin row (`state: "enabled"`, `disabledAt: null`, unconditionally
on conflict) but leaves its agents `inactive` and its routines `active: false` — only the enable route
restores those. So a reinstall of a disabled plugin yields a plugin that reports enabled with a dead
agent and dead routines. Pre-existing; the ownership registry is where the lifecycle becomes one
operation instead of three that can disagree.

## What refinement established, and what it got wrong

Refinement plus an independent critique corrected five claims in the original plan. Each was
re-tested against the tree; all five held:

1. **No restart is needed** after installing a routine. The event matcher subscribes once per member
   of a compile-time constant and reads the database on delivery, so the subscription set cannot go
   stale. The plan's restart step was dropped from the proof.
2. **Practice communities are live**, not absent — `communityForRole` scopes which L3 knowledge every
   agent session loads. Only the facilitator *agents* were invisible.
3. **Skills did not exist** in any form — no table, no route, no loader. Of "agents, skills, routines
   and triggers", two existed, one retired in BA1, one never existed. BA9b built skills as knowledge.
4. **The per-team duplication fix was not inherited from BA1.** It came from an explicit `scope`
   field on the builtin specs that BA9d deletes, so the property had to be re-established rather than
   assumed. The track registry asserted the opposite; building on that would have reintroduced the bug.
5. **Both tables the plan carved out as "different sense of the word" were already gone.**

The ritual inventory was the other product of refinement: most candidates did **not** travel. Practice
communities, the attention score with its session ranking and manual door, the human bet-retro save and
the manual promote door all stayed in core because something reads them while working. The five
facilitator personas, the portfolio retro and the contradiction detector died because they never worked.
What shipped as a plugin is small — one agent and a few routines carrying prompts.

## The pattern worth carrying forward

The same failure shape appeared at four levels across this track, and every instance passed its tests:

- Skill directories chosen by plausible name — one right, one redundant, one that nothing reads —
  while unit tests asserted the writer matched the constant the same author had picked.
- A harness test that imported no production code and hardcoded the directories itself; repointing the
  production constant at a dead path left it green, with real model calls.
- An `agentId` parameter that was optional and that no production caller passed, so agent-file binding
  never ran — and its test passed by supplying the parameter itself.
- MCP dialect shapes written from plausibility; probing the real binary showed opencode silently
  rejects the `command`/`args` form and needs a merged array.

**The lesson: evidence that confirms the author's own setup is not evidence.** What settled each of
these was running the real binary and asking it what it saw, then breaking the production constant and
confirming the test went red.
