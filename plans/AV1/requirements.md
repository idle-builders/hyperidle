# AV1 — Requirements (refined, post human-concept-review)

## Goal
Make onboarding actually **configure the machine**: discover the harnesses the user
has installed, let them pick a **primary harness** that becomes a **persisted default
consumed by every agent HyperIdle creates thereafter**, register the folder they
select as a real filesystem (with git branch detection), and make the freshly-created
Assistant open **ready** for interaction — not fire a burst of missing-key/
missing-harness notice cards. When setup finishes, agents run on the chosen harness,
the repo is connected, and the Assistant is talkable — instead of everything silently
defaulting to `builtin`/`sonnet-4-6` with a bare `teams.factoryDbPath` and a
notice-card burst.

## Value / who
The first-run user (and the founder demoing to them). Onboarding is the
highest-traffic flow and today it mis-configures every new user. A user who
follows setup and gets agents that ignore their tools — plus an Assistant that greets
them with error cards — concludes the product is broken. Cost of not building: the
single most-used flow keeps producing broken first sessions.

## Boundary (Track AV frame)
**Consolidate onto the app's existing solved patterns; do not invent.** Reuse
`GET /api/harnesses` / `discoverLocalHarnesses`, `POST /api/filesystems` + the
`filesystems` table, the landed `CreateTeamRequest.primaryHarness` seam, the
existing `persistScaffoldedAgents` writer, and the existing `GitRunner` /
`createGitRunner` for all git invocation. No new discovery path, no new
folder-registration model, no new git-spawn path, no new notification system. The
**one** genuinely new persisted thing is a team-level default harness column
(justified below) — it is the founder-mandated shape, not an invention of scope.

---

## Pinned noun — **Primary harness** (RE-PINNED after founder review)

The founder overrode the prior "setup-time stamp" pinning. Founder's words:
*"Isn't this a setting default? this should be set wherever the harness information
about what is connected is stored and then consumed there for every agent that is
created."*

### IS
- **A persisted default setting**, stored where the team's connection/harness
  configuration lives, that **every newly-created agent adopts** as its
  `users.harnessType` (+ default `modelId`/`modelProvider`) when the creator does not
  pass an explicit harness.
- **Team-scoped.** It is stored on `teams` (new `default_harness_type` /
  `default_model_id` / `default_model_provider` columns — see architecture §"Persistence
  home"). Onboarding writes it; every downstream agent-creation path reads it.
- **Consumed at EVERY agent-creation path**, not just onboarding: the onboarding
  team scaffold, the add-agent-later path (`teams-routes.ts:663`), and the per-user
  Assistant creation. When no explicit harness is supplied, the creator reads the
  team default; only if the team default is unset does it fall back to
  `builtin`/`claude-sonnet-4-6`/`anthropic`.
- Carried into the system via the already-landed
  `CreateTeamRequest.primaryHarness` (`{ harnessType, modelId, modelProvider }`,
  `packages/shared/src/team.ts:123`) — the onboarding entry point. That request now
  **writes the persisted team default** (in addition to stamping the first roster).

### ISN'T
- **Not** a one-time stamp applied only to the first team's scaffolded agents at
  setup time. (That was the rejected prior pinning.) The default persists and
  auto-applies to agents added later.
- **Not** a runtime router, a per-agent override system, or multi-harness
  assignment. It sets one default harness for the team; per-agent edits still happen
  later in Settings, and an explicit harness passed to a creation path still wins.
- **Not** a global/workspace singleton. It is team-scoped because agents belong to a
  team and `filesystems`/`connections` are already team-scoped — the "wherever
  connection info is stored" home the founder pointed at is the team.
- **Not** a re-implementation of `serviceConnections` (AN1). Connections store
  *held/inherited external tool credentials* per user; the primary harness is a
  *default engine choice* for a team's agents. They are orthogonal; the harness
  default rides `teams`, next to the team's other configuration.

### Default (fallback chain)
When an agent is created:
1. If the creator passes an explicit harness → use it (unchanged behavior).
2. Else read the team's `default_harness_type` (+ model/provider) → use it.
3. Else fall back to `builtin` / `claude-sonnet-4-6` / `anthropic` (the existing
   baked-in default at `scaffold-agents.ts:112-114`).

Picking `builtin` explicitly in the onboarding UI writes `builtin` as the team
default (equivalent to the step-3 fallback, but now recorded explicitly).

### Derivation (UI → seam)
`derivePrimaryHarness(descriptor)` maps a chosen `HarnessCapabilityDescriptor`
(`harness-capability-descriptor.ts:101`) to the seam — unchanged from before:
- `firstSelectableModel = descriptor.models.find(m => m.selectable === true)`
  — filters explicitly on `.selectable` (`HarnessModelDescriptor.selectable:57`); a
  CLI harness can list non-selectable / inherited-from-gateway models that must not
  become the primary model.
- `harnessType = descriptor.type`
- `modelId = firstSelectableModel?.id ?? "claude-sonnet-4-6"`
- `modelProvider = firstSelectableModel?.provider ?? descriptor.modelProviders[0] ?? "anthropic"`

Only **selectable** (installed/ready) harnesses can be derived — a greyed
(non-installed) row is not choosable, so `derivePrimaryHarness` is never called on
one (see §"Harness picker" below).

## Guide-draft paragraph (first-run user)
> **Choosing your primary harness.** A *harness* is the engine your agents think
> and act through — the built-in model gateway, or a coding CLI like Claude Code or
> Codex. During setup HyperIdle looks for the harnesses on your machine and lets you
> pick one as your **primary harness**: the default engine for **every agent on your
> team, including ones you add later**. Harnesses you don't have installed still show
> up, greyed out, with a hint on how to add them — so you know what's possible. If
> you'd rather keep it simple, leave it on the built-in gateway and add your API key.
> You can change any agent's harness later in Settings.

## Harness picker (RE-SPEC after founder review)
The picker lists **claude/codex/opencode even when not on PATH**, rendered
**greyed/disabled with an install hint** — so users discover harnesses they could
add. Only installed/ready (`.selectable`) harnesses are choosable. On a fresh
machine the built-in gateway is the default-selected choosable row; the external
harnesses show greyed with an "install to use" affordance. `GET /api/harnesses`
already returns all registered descriptors (installed or not) with a
`discovery.state` of `missing | installed | unauthenticated | ready | unavailable`
(`harness-capability-descriptor.ts:9`); the picker renders every descriptor and
gates choosability on that state — it does NOT filter non-installed ones out.

## DOC-CLASS: **significant** (RECLASSIFIED — was incremental)
Reclassified honestly: AV1 now introduces a **persisted team-level default-harness
concept + a schema migration** (three new `teams` columns) and rewires **every**
agent-creation path to read it. That is a real durable concept and a data-model
change, not just a descriptive name for an existing field. It updates the
harness/onboarding docs *and* the team data-model docs. → `significant`.

## Success
- Onboarding lists **all** registered harnesses (installed choosable + non-installed
  greyed with install hint) and lets the user pick a primary; the choice is
  **persisted as the team default** and **every agent** — the first roster, agents
  added later, and the Assistant — adopts it (observable via `GET /api/agents` and by
  adding an agent after setup and seeing it inherit the default).
- The selected folder becomes a `kind:"code"` filesystem for the team with its git
  branch detected when it's a repo with a resolvable branch; a git repo with no
  resolvable branch and a non-git folder both register as `doc_set`, never 400. All
  onboarding registrations use `writeback:"none"`.
- After setup the Assistant **opens ready**: the entered Anthropic key is present and
  the Assistant carries a real harness (the persisted primary, or builtin), so its
  first turn does NOT render `missing_key`/`missing_harness` notice cards. The
  Assistant auto-opens (`?onboarding=true` kept) and is talkable.
- Setup still completes with zero external harnesses (builtin key path), never
  hard-blocking on discovery.

## Out of scope
- Name-placeholder fix (POLISH-060). Settings harness-list redesign (AV2).
- Multi-harness-per-agent / per-agent overrides beyond the team default.
- A global/workspace (cross-team) harness default.
- Deeper Assistant configuration owned by AV2 (persona, tools) — AV1 guarantees the
  Assistant has a **harness + a present key** so it opens ready; anything beyond
  runnable-readiness is AV2.
