# AU50 — Reflection rituals ship as a plugin, not as core machinery

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

**Missing delta.** A plugin that provides these rituals, and their removal from core once it does.

**Depends on.** None. **This work package blocks the plugin-marked deletions elsewhere in the audit** —
until it exists, removing them from core loses the capability rather than relocating it.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Refinement required — which rituals are worth re-providing at all, versus simply dropped,
is not settled. Some of this machinery is convicted on its own merits and should not be carried into a
plugin: the contradiction detector inside the promotion sweep is provably dead logic, and per-team
firing of global sweeps is a defect, not a behaviour to preserve.

**Constraints.**
- Nothing may be carried into the plugin that is already convicted as broken or dead. This is a
  relocation of capability, not of code.
- The plugin uses ordinary agents, skills, routines and triggers. It must not require a new runtime
  path, and specifically must not reproduce the builtin-routine path that bypasses the agent-run
  architecture.
- A team that does not install the plugin must see a coherent product, not one with visible holes where
  the rituals used to be.

**Out of scope.** Building a plugin marketplace or distribution mechanism. Reworking the knowledge store
itself. Deciding whether teams should hold retros.

## Acceptance criteria

- The rituals are available as a plugin a team can install.
- A team that installs it gets working retros and the knowledge upkeep that supports them, driven by
  ordinary routines and skills rather than a dedicated code path.
- A team that does not install it sees a coherent product with no orphaned surfaces.
- Core no longer contains the ritual machinery, its dedicated tables, routes and scheduled jobs.
- Global upkeep runs once, not once per team.

## Validation scenarios

- Given a team that has installed the plugin, when a bet finishes, then a retro happens as it does today.
- Given a fresh install without the plugin, when someone uses the product, then nothing refers to retros
  or practice communities.
- Given several teams on one backend with the plugin installed, when the knowledge upkeep runs, then it
  runs once rather than once per team.
