# BA9 — Requirements

**Status:** second refinement pass, 2026-08-25; revised after independent critique
(`.pipeline/work/BA9/refine-critique.md`). Checked against the worktree at `dc8d1cbd7` (BA1 merged at
`2cb492a68`, PR #510).

`plan.md` is authority. This document does not add an outcome. It answers the two items `plan.md` lists
under "Still open, and needed before build", establishes the concrete shape of the missing plugin intake,
and records where the first pass's findings no longer match the tree.

**DOC-CLASS: update.** Three docs describe things this work makes false:

- `docs/agent-layer/agent-model.md:58-92` — §3 describes `strategy` as a live category and its table at
  `:66` claims a strategy agent's system prompt is editable. Both stop being true.
- `docs/knowledge-architecture/facilitators.md:12-21` — describes one facilitator per community as the
  shipped design.
- `docs/knowledge-architecture/sync-and-conflict-resolution.md:51` — states layer precedence is *"Enforced
  at **promotion time**"* by `detectLayerContradiction`, with file:line citations. §3.4 below shows that
  detector can never fire; dropping it makes this paragraph false.

No new doc is needed.

### Where the record lives

Two evidence files this document cites are **not on `main`**, so a builder cannot open them from the
worktree:

- **AU20 destroyer audit** — `git show au20-audit-evidence:.pipeline/work/AU20/destroy/FULL-AUDIT.md`
  (tag `au20-audit-evidence`). Every audit row cited below names its line number in that file.
- **AU44 feature ledger** — this one *is* on the tree at `.pipeline/work/AU44/FEATURE-LEDGER.md`
  (committed in `23c160242`), despite being described elsewhere as branch-only. Read it from the worktree.

Two column headers matter, because the first pass misread one of them. The audit's "What changed after
the rulings" table is `| # | Door | Old | New | Moved by |` (audit `:92`). Its route inventory is
`| # | Door | Reach | Verdict | Reason |` (audit `:307`). **In the inventory, `DEAD` is the reach column,
not the verdict.**

---

## 1. What changed under this package since the first pass

The first pass was written against `827adbb24`. BA1 has merged since. Five of the first pass's statements
are now wrong or stale. They are corrected here so nobody builds against them.

### 1.1 The trigger-rule entity is gone

`framework/domain-model/src/trigger.ts` no longer exists (`ls` returns "No such file or directory"). The
six-name trigger vocabulary died with it. A routine now names any of the **34** event types in
`EVENT_TYPES` (`framework/event-bus/src/events.ts:678-713`), validated on the way in
(`layers/core-api/src/routes/routines-routes.ts:65`, `eventType: z.enum(EVENT_TYPE_VALUES)`).

### 1.2 No restart is needed after installing a routine — for either kind

`plan.md:145-149` says event subscriptions are "registered once, at startup, from the routines present in
the database", and that a plugin installed while the app runs "registers nothing until a restart". That is
no longer true.

`registerRoutineEventMatcher` (`layers/core-api/routine/src/routine-scheduler.ts:754-812`) subscribes once
per member of `EVENT_TYPES` — a compile-time constant — and on delivery **queries the database** for the
routines that name that event (`listRoutines(db, { triggerType: "event", eventType, active: true })`,
`:780-784`). The subscription set cannot go stale because it is not derived from anything mutable.

The clock path is the same: each tick calls `listRoutines(db, { active: true })` fresh
(`routine-scheduler.ts:889`).

**Consequence for this package:** the founder's accepted "restart between install and proof" is no longer
required by the mechanism. The proof should show a routine firing without a restart. If the intake needs a
restart for some other reason — for example, if it reads a plugin file at boot — that is a property of the
intake we build, not of the routine substrate, and it should be a deliberate choice rather than inherited.

### 1.3 The per-team duplication of global sweeps is fixed, but not the way `plan.md` describes

`plan.md:68-70` and `.pipeline/BA.md:53` both say the fix is "a routine takes its scope from its owning
agent, so a global routine runs once". Scope *does* now come from the owning agent
(`layers/core-api/routine/src/routine-service.ts:465-467`) and `routines.teamId` is gone from the schema
(`framework/db/src/schema.ts:524-599`).

But that is not what stopped the duplication. `BuiltinRoutineSpec` gained an explicit
`scope: "team" | "once"` field (`routine-scheduler.ts:120-133`), and `provisionTeamRoutines` seeds a
`"once"`-scoped spec under a bare id so the second team's attempt is a no-op under `onConflictDoNothing`
(`routine-scheduler.ts:196-198, 215`). Portfolio retro, knowledge decay and knowledge promotion are
`"once"`; post-bet retro stays `"team"` (`routine-scheduler.ts:134-176`). `provisionTeamRoutines` is
still called once per team (`layers/core-api/src/routes/teams-routes.ts:329`), so removing
`routines.teamId` alone would not have stopped anything.

**Consequence:** when the built-in specs are deleted, the `scope` field goes with them. Whatever seeds the
plugin's routines has to decide "one row globally" versus "one row per team" for itself. It does not come
free from the owner-agent change.

### 1.4 A routine owned by a team-less agent gets no knowledge context

`resolveRoutineRunRequest` reads the team off the owner agent and, when there is none, bakes `team: null`
and `knowledge: []` (`routine-service.ts:465-491`, and the `@lore BA1 D4` comment at `:471-475` says so
explicitly: "assembling knowledge needs a team; this resolver does not invent a global query").

All five seeded facilitators have `teamId: null` (`layers/core-api/src/bootstrap/factory-state.ts:106`).
So a plugin routine owned by a global agent runs with an empty knowledge bundle today. §3.15 resolves what
that means for the plugin's actual shape.

### 1.5 Two out-of-scope tables no longer exist

`plan.md:88-90` carves out `knowledge_strategy_fabric` and `task_strategy_fabric` as a different sense of
the word. Both were renamed in migration `0050_AU19_rename_strategy_fabric_tables.sql`:
`knowledge_strategy_fabric` → `knowledge_app_projection` (live, `framework/db/src/schema.ts:914`) and
`task_strategy_fabric` → `task_planning_signals` (`0050_*.sql:20`), which was then dropped entirely
(`framework/db/drizzle/0057_AU43_drop_five_tables.sql:37`).

The carve-out is therefore already satisfied. But the acceptance criterion that says every remaining hit
of the word is "the unrelated knowledge/task fabric sense" needs restating, because that sense is gone and
three others remain:

- migration history — `0011_o2_kernel_strategy_separation.sql`, `0050_*`, and every `drizzle/meta/*.json`
  snapshot (14 hits each across ~22 snapshot files). Frozen files; not editable.
- a knowledge **topic** called `strategy` in the taste classifier
  (`layers/core-api/knowledge/src/attention-classifier.ts:20`) — a topic name, not a category.
- prose `@lore` comments about the retired kernel/strategy split.

**Proposed plan amendment (wording only, no scope change):** restate that criterion as "every remaining
hit is migration history, the `strategy` knowledge topic, or prose about the retired kernel/strategy
split — none of them an agent category."

### 1.6 What still holds, and one thing the first pass got wrong

Verified again and unchanged: the runtime wake-up hint is the only wildcard subscriber
(`layers/agent-orchestration/run-orchestration/src/start-runtime.ts:327`); `POST /agents` still mints a
`strategy` agent from a catalog role (`layers/core-api/src/routes/agents.ts:268-269`);
`StrategyEvent`/`KernelEvent` (`framework/event-bus/src/events.ts:611, 650`) and `PostBetRetroArgs`
(`routine-scheduler.ts:231`) are all still on the tree.

**Correction — a `plugins` row does exist.** The first pass said nothing anywhere writes one. Migration
`framework/db/drizzle/0044_AU2_plugin_configuration.sql:36-38` inserts
`('builtin', 'HyperIdle Built-ins', '0', 'enabled', …) ON CONFLICT DO NOTHING`. Every install has exactly
one plugin row, `id='builtin'`, `state='enabled'`, and the resolver branches on it: `originFor` stamps
`type: "builtin"` when `plugin.id === BUILTIN_PLUGIN_ID`
(`layers/core-api/settings/src/plugin-configuration.ts:230`, constant at
`framework/domain-model/src/configuration.ts:18`).

What is still true, and is the fact that matters, is the narrower one: **nothing writes a
`plugin_configuration_defaults` row**, so the `builtin` plugin owns no defaults and the resolver's join
returns nothing. See §2.4.

---

## 2. The plugin intake — what actually exists to build on

### 2.1 The three tables

`plugins` (`framework/db/src/schema.ts:1141-1154`): `id`, `name`, `version`, `state`, `installedAt`,
`updatedAt`, `disabledAt`, `removedAt`. A check constraint pins `state` to `enabled | disabled | removed`.
**One row is reserved:** `builtin`, seeded by migration (§1.6).

`plugin_configuration_defaults` (`schema.ts:1156-1182`): `pluginId` (FK to `plugins`, **`onDelete:
"restrict"`**), `kind`, `key`, `defaultValueJson`, `defaultVersionHash`. Unique on
`(pluginId, kind, key)`. A check constraint pins `kind` to the six configuration kinds.

`configuration_overrides` (`schema.ts:1184-1213`): `defaultId` (FK, `onDelete: "set null"`), `kind`,
`key`, `userValueJson`, `state` (`active | deleted`), `createdByUserId`. Unique on `(kind, key)` —
**globally, not per plugin.** Two plugins that both declare `agent/librarian` collide on one override row.

### 2.2 What `plugin-configuration.ts` resolves

`listConfiguration` (`layers/core-api/settings/src/plugin-configuration.ts:365-378`) joins defaults to
their plugin, left-joins the matching active override, and returns a `ResolvedConfigurationItem` per key:
the active value (override wins), the default, the origin, and an `active` flag.

Four behaviours worth naming:

- **A user override survives its plugin.** `active: hasOverride || plugin.state === "enabled"`
  (`plugin-configuration.ts:199`). Disabling or removing a plugin does **not** deactivate an item the user
  has edited; the display says "Override still runs"
  (`layers/core-api/src/routes/agent-behavior-config-impl.ts:232-234`).
- **Overrides can outlive any plugin at all.** An override with no matching default is returned as
  `valueSource: "user_owned"` (`plugin-configuration.ts:206-224`), so it stays visible after the plugin
  row is gone.
- **Secrets are rejected on write.** Any field named token/secret/credential/password/apikey/env/command,
  at any depth, throws (`plugin-configuration.ts:81-90, 139-147`). A plugin cannot ship a credential
  through this table.
- **`builtin` is a reserved id in the same namespace an installer would write into.** The resolver's only
  branch on plugin identity is that id (`:230`). Two consequences for the intake: it must refuse to let an
  installed plugin claim `builtin`, and any "installed plugins" surface must decide whether to list
  `HyperIdle Built-ins` as a plugin the user can disable. **Recommend:** reject `builtin` as an
  installable id, and filter it out of an installed-plugins list — it is a provenance label for
  first-party defaults, not something a user installed or can uninstall.

### 2.3 `CONFIGURATION_KINDS` today

Six values: `agent`, `skill`, `routine`, `tool`, `mcp_server`, `harness_descriptor`
(`framework/domain-model/src/configuration.ts:1-8`). The `trigger` kind was removed by BA1 — migration
`0060_BA1_one_routine_primitive.sql:124, 127` respells both check constraints without it.

Each kind has a validation schema (`plugin-configuration.ts:127-134`). Five of the six are a bare
`z.record(z.string(), JsonValue)` — any object passes. Only `mcp_server` checks anything (that
`serverUrl`, when present, is http/https). **So a plugin's `agent` or `routine` declaration has no
required shape today.** The intake has to define one.

### 2.4 The one thing that reads any of this

`listConfiguration` and `writeConfigurationOverride` have exactly one consumer:
`agent-behavior-config-impl.ts:74, 89, 104`, itself consumed only by
`layers/core-api/src/routes/settings-agent-behavior.ts` — `GET /config` and `PATCH /config/:id`. That is a
settings list.

**This is the load-bearing fact about the intake.** The configuration tables are a *display and editing*
surface, not a provisioning surface. Nothing turns an `agent` configuration row into a `users` row.
Nothing turns a `routine` configuration row into a `routines` row. The projection only builds labels,
status strings and deep-links (`agent-behavior-config-impl.ts:147-282`), and it offers exactly two
editable fields anywhere: an agent's `name` and a tool's `enabled` toggle (`:243-255`).

The "Agent behavior" settings section renders "No agent behavior configuration"
(`layers/core-ui/src/settings/SettingsAgentBehavior.tsx:175-182`) on every install today. **The cause is
zero `plugin_configuration_defaults` rows, not zero plugin rows** — the `builtin` plugin row exists
(§1.6), but `listResolvedConfiguration` drives its outer query from the defaults table
(`plugin-configuration.ts:248`), so a plugin with no defaults contributes nothing.

### 2.5 Where the plugin's contributions would actually have to land

For a ritual to run, real rows have to exist in the tables the runtime reads:

| Contribution | Runtime table | Existing writer the intake can reuse |
|---|---|---|
| Agent | `users` (kind `ai`) | `POST /api/agents` (`layers/core-api/src/routes/agents.ts:224`), or `insertUser` via `@hyperidle/users` as `factory-state.ts:100` does |
| Agent run config (prompt, harness, model) | `agent_run_config` | `writeAgentRunConfig` (`layers/agent-orchestration/run-orchestration/src/agent-run-config-store.ts:121`) |
| Routine | `routines` | `POST /api/routines` (`routines-routes.ts:128`), or `insertRoutine` |
| Skill | **nothing** | — |

**There is no skill entity.** Repository-wide, `skill` in production code is either the
`CONFIGURATION_KINDS` value and its display projection, or the phrase "skill tool" meaning an agent tool
(`framework/harness-protocol/src/harness/tool-seam.ts:45`). The `users.skills` column was dropped
(`framework/db/drizzle/0055_AU26_agent_run_config.sql:83`) and `user_skills` was dropped
(`0056_drop_user_skills.sql`). There is no `skills` table, no skill route, no skill loader. The
`bet_retro` and `portfolio_retro` skills the AU20 audit names (audit `:240`) do not exist anywhere in the
tree — a repo-wide search returns zero files.

**Consequence:** `plan.md:81` says the plugin "uses ordinary agents, skills, routines and triggers". Of
those four nouns, **two exist** (agents, routines), **one retired in BA1** (triggers), and **one has never
existed** (skills). What a routine actually carries instead is a **prompt** — `routines.prompt`
(`framework/db/src/schema.ts:530-536`), baked into the run (`routine-service.ts:499`). A prompt can name a
skill in words; nothing resolves it.

**Proposed plan amendment (wording):** restate the constraint and the acceptance criterion as "agents,
routines and prompts" rather than "agents, skills, routines and triggers". This narrows the intake to what
can be built and removes a phantom entity from the acceptance criteria.

### 2.6 What "disable and remove" would mean against these tables

- **Disable** is a `plugins.state` write plus `disabledAt`. Today it changes the settings display only —
  the resolver marks unedited items inactive, and nothing runtime reads that flag. For a disable to
  actually stop the rituals, it must also pause the plugin's `routines` rows, using the same three-field
  write the delete route already performs (`deletedAt` / `state: "paused"` / `active: false`,
  `routines-routes.ts:232-237`) or just the latter two; and, if agents should stop too, set the agents'
  `users.status`.
- **Remove** cannot be a row delete while defaults exist: `plugin_configuration_defaults.pluginId` is
  `onDelete: "restrict"` (`schema.ts:1160-1162`). Either the defaults go first, or `state: "removed"` is
  the whole mechanism — that value exists, and the display already handles it with "Needs attention:
  origin removed" (`agent-behavior-config-impl.ts:237`). The overrides survive either way: `defaultId` is
  `onDelete: "set null"` and an orphan override renders as `user_owned`.
- Removing the plugin's **runtime** rows is a separate act with a separate hazard: a `routines` row cannot
  be hard-deleted while a `routine_runs` row references it (`routine_runs.routineId` is
  `onDelete: "restrict"`, `schema.ts:636-638`), which is why routines soft-delete via `deletedAt`
  (`schema.ts:573`; `listRoutines` excludes them by default, `routine-service.ts:175`). The agent rows
  have the same shape — `users.id` is referenced with `restrict` from `items.sourceAgentId` and
  `routines.ownerAgentId`.

**Recommendation:** "remove" means `state: "removed"` plus soft-deleting the plugin's routines and
deactivating its agents. Nothing is hard-deleted. This is the smallest mechanism that satisfies "the same
events occur, nothing fires, and the product still holds together" without fighting three restrict
constraints. It is also the shape §3.13 needs for the existing `builtin:*` rows.

---

## 3. Open question 1 — which rituals travel, which are dropped, which stay

The test from Ruling 3: *is this the machinery of working, or a ritual about the work?* Plus this
package's own constraint: **nothing already convicted as broken or dead travels** (`plan.md:79-80`).

Two clarifications the record forces:

- The constraint bites on **conviction**, not on deletion. A row the audit marked `PLUGIN` and a later
  pass deleted anyway is not convicted — it is an IOU. §3.9 is that case.
- Several candidates have a **scheduled/automated half** (ritual) and a **stored value or manual door**
  that something else reads (machinery). Where that is true, the two halves get different verdicts.

### 3.1 The five seeded facilitator agents — **DROP**

**What it does today.** `factory-state.ts:98-110` seeds five `users` rows on every boot — Build, Product,
Growth, Ops and Facilitation Facilitator — with `role: "facilitator"`, `agentCategory: "strategy"`,
`teamId: null`.

**Does it work?** No. They own nothing and do nothing.

- They are not owners of the sweeps they are supposed to own. `provisionTeamRoutines` builds `ownerByRole`
  only from agents whose `teamId` equals the team being created (`teams-routes.ts:319-322`, and
  `listUsers`'s `teamIds` filter is `inArray(users.teamId, ...)` —
  `layers/core-api/users/src/user-store.ts:78-79`, which a null never matches). Facilitators have
  `teamId: null`, so `ownerByRole["facilitator"]` is always undefined and both sweeps fall back to
  `leadAgentId` (`routine-scheduler.ts:198`) — a team agent.
- The same is true of the portfolio retro, whose `ownerRole` is `"assistant"`, a category-`individual`
  role that `defaultRoster` never puts in a team roster (`agent-roles.ts:251-259` filters to
  `category === "team"`). It also falls back to the team lead.
- **The five are not five.** The seed's `community` field is used for exactly one thing — building the
  display name (`factory-state.ts:99, 103`). Every row carries the same `role: "facilitator"`, and
  `communityForRole` reads the role, not the seed
  (`framework/domain-model/src/agent-roles.ts:242-245`). The catalog's `facilitator` entry says
  `community: "ops"` (`agent-roles.ts:155`), which is also the unknown-role fallback. So all five
  resolve to the identical community, asserted by the test at
  `framework/domain-model/src/__tests__/agent-roles.test.ts:160`. Even if they owned something, four of
  the five would be indistinguishable from the fifth.
- Their names do not match the product's communities either. The seed's five are
  `build, product, growth, ops, facilitation` (`factory-state.ts:41-47`); the catalog's four are
  `building, product, growth, ops` (`agent-roles.ts:51, 60, 69, 78, 87, 96, 105, 114, 123, 132, 141, 155,
  164, 173, 182, 194`). "build" is not "building", and "facilitation" is not a community at all.
- No UI lists them. `WorkTeam` lists team members and they have no team; the only surface that would show
  one is `/agents/:id`, reachable only if you already have the id.

**Anything read their output?** They have no output.

**Recommendation: DROP.** Do not re-provide five personas. The plugin should provide **one** knowledge
agent that owns the upkeep routines, because that is what a routine needs — an owner. Five identical
personas exist to mirror a matrix (`docs/knowledge-architecture/facilitators.md:19`) the code never built,
and the code cannot even tell them apart.

This does **not** delete the `facilitator` **role** from the catalog: three agent tools
(`score_attention`, `promote_knowledge`, `create_conflict_review`) list it in their `roles` allowlist
(`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:708, 790, 847`). All three also list
`assistant` and `product_manager`, so removing the role would not orphan a tool — but the plugin's own
agent will want it.

### 3.2 Practice communities — **CORE (do not move)**

**What it does today.** `communityForRole(role)` maps an agent's role to one of four communities
(`agent-roles.ts:242-245`).

**Does it work?** Yes, and it is load-bearing. `assembleSessionKnowledge` fetches L3 knowledge *filtered
by the calling agent's community* (`layers/core-api/knowledge/src/session-knowledge-assembler.ts:305-311`),
scores role match against it (`:100-110`), and the run context substitutes it into the agent's persona
template (`layers/agent-orchestration/run-orchestration/src/context.ts:271, 494`).

**This contradicts `plan.md:17-18`.** The plan says the facilitators were seeded "for 'communities of
practice' that appear nowhere in the product". The *facilitators* appear nowhere. The *communities* decide
what knowledge every agent in the product reads. Moving them out breaks session context assembly for every
agent, plugin or no plugin.

**Recommendation: CORE.** The community vocabulary stays. The audit's `COMMUNITY_DISPLAY_NAMES → PLUGIN`
row (audit `:3271`, tag `au20-audit-evidence`) is only about the five display names used to build
facilitator agent names (`factory-state.ts:33-39`) — those die with the personas. `communityForRole` and
the catalog's `community` field are a different thing and must not travel.

### 3.3 Knowledge decay sweep — **TRAVEL**

**What it does today.** `runStaleSweep` (`layers/core-api/knowledge/src/promotion-pipeline.ts:522-556`)
finds `active` items untouched for 90+ days and sets `status: "stale"` with a `system:auto-promotion`
edit-log entry. Seeded as `builtin:knowledge-decay`, daily at 02:00 UTC, `silent: true`
(`routine-scheduler.ts:155-164`).

**Does it work?** Yes. The write path is sound.

**Anything read its output?** Yes — the knowledge list renders the status as a badge
(`layers/core-ui/src/pages/KnowledgeList.tsx:539, 589-591`) and the `promote_knowledge` tool's transition
map treats `stale` as a state (`tool-definitions.ts:768`). It does **not** affect what agents read:
`assembleSessionKnowledge` has no status filter (confirmed — zero `status` references in that file). So a
stale item still lands in agent context.

**Recommendation: TRAVEL.** It is a scheduled ceremony about the knowledge, it works, and its result is
visible. Re-provide it as a plugin routine whose prompt tells an agent to review long-untouched items,
rather than as a code sweep — that is the whole point of the plugin model. §3.15 confirms the plugin's
agent has the tools to do it.

### 3.4 Knowledge promotion sweep — **TRAVEL, minus the contradiction detector**

**What it does today.** `runAutoPromotionSweep` (`promotion-pipeline.ts:422-489`) scans `provisional`
items and promotes to `validated` any that appear across 5+ distinct scopes with no open conflict. Seeded
as `builtin:knowledge-promotion`, daily at 03:00 UTC (`routine-scheduler.ts:165-175`).

**Does it work?** The promotion half does. The **contradiction detector inside it does not.**
`detectLayerContradiction` (`promotion-pipeline.ts:264-…`) compares `meta.claims` on an L3 item against
`meta.forbids` on L4 principles, and short-circuits when `forbids.length === 0` (`:319-321`). The proof it
can never fire: `knowledgeAppProjection.meta` has exactly one writer,
`layers/core-api/knowledge/src/knowledge-repository.ts:253` (`meta: input.meta ?? null`), and no route or
agent tool supplies `input.meta` — so `meta` is null on every production row and both `claims` and
`forbids` are always absent. The audit reached the same verdict independently (audit `:5057`: "plain
delete even in the plugin conception").

**Anything read its output?** Yes, same as decay — the status badge, and `validated` is a real state in
the tool's transition map (`tool-definitions.ts:766`).

**Recommendation: TRAVEL for the promotion, DROP the contradiction detector.** Delete
`detectLayerContradiction`, the `contradiction_flagged` action, and the paragraph at
`docs/knowledge-architecture/sync-and-conflict-resolution.md:51` that says it is enforced.

### 3.5 Attention scoring — **split: the sweep-time recompute TRAVELS, everything else stays CORE**

**What it does today.** Three distinct things share the name.

1. **The stored score.** `knowledge_app_projection.attentionScore` (`framework/db/src/schema.ts:924`).
2. **The on-demand doors.** `PATCH /api/knowledge/:id/attention-score` and
   `POST /api/knowledge/:id/recompute-attention` (`layers/core-api/src/routes/knowledge.ts:687-705`), both
   reached by the `score_attention` agent tool.
3. **The scheduled recompute.** The batch recompute that piggybacks on the promotion sweep
   (`routine-scheduler.ts:388-406`, via `ports.knowledge.recomputeAttentionForCandidates`), and
   `recomputeScope` (`layers/core-api/knowledge/src/attention-service.ts:327`).

**Does it work?** Yes. Crossing the threshold creates a review item and a thread hosted on the knowledge
item (`layers/core-api/knowledge/src/review-item-factory.ts:87`), navigable at `/knowledge/:id`
(`layers/core-ui/src/services/host-route.ts:29-30`).

**Anything read its output?** Yes, and this is the part the audit missed. The stored score is a **ranking
input to every agent session's knowledge bundle**: `DEFAULT_WEIGHTS.attentionScore: 0.1`
(`layers/core-api/knowledge/src/scoring-config.ts:25`), consumed at
`session-knowledge-assembler.ts:192, 200, 209`. An item with a higher attention score is more likely to be
in an agent's context.

**Recommendation:**

- **CORE** — the `attentionScore` column, the session ranking that reads it, and **both** on-demand
  routes. That is the machinery of what agents read, not a ritual. If the column travels, agent context
  ranking silently loses a weight.
- **TRAVEL** — only the *scheduled* recompute: the sweep-time batch at `routine-scheduler.ts:388-406`, the
  `RoutineSchedulerPorts.knowledge.recomputeAttentionForCandidates` port member
  (`layers/core-api/routine/src/ports.ts:82`), and `recomputeScope`. Deciding on a schedule what deserves
  human attention is exactly the "scoring systems that decide what is important" the ruling names. In the
  plugin it becomes the agent's judgment inside its routine prompt, not a heuristic batch.

**Why `POST /:id/recompute-attention` must not travel.** The first pass sent it out with the plugin. That
would break a live agent tool at the seam. The chain, opened end to end:

- `tool-definitions.ts:722` — `score_attention`'s recompute branch calls
  `ports.coreApi.recomputeAttentionScoreForItem`
- `layers/agent-orchestration/src/services/core-api-port-composition.ts:790-796` — that port member posts
  to `client.knowledge[":id"]["recompute-attention"].$post`
- `layers/core-api/src/routes/knowledge.ts:700-704` — the route, commented as "the collapsed
  `score_attention(mode:"recompute")` helper"

Remove the route and every agent's `score_attention(mode:"recompute")` fails at the seam. The audit priced
the alternative — tool table row 11 (audit `:6640`): *"SIMPLIFY. … Survivor: knowledge_item override only,
one mode, no superRefine. `recomputeAttentionScoreForItem` port member dies."* **Recommend keeping the
route** rather than taking that option: the tool's recompute mode is an agent asking for a score on one
item it is looking at, which is the same shape as the manual override door, and removing a working agent
capability is not something `plan.md` asks for.

### 3.6 Post-bet retro (the automated one) — **TRAVEL in principle, but it cannot be an ordinary routine today**

**What it does today.** On `bet_state_changed` with `toState === "completed"`,
`registerBuiltinRoutineHandlers` (`routine-scheduler.ts:501-537`) resolves the per-team routine row from
the shipping bet's team (`:512-526`) and runs `runPostBetRetro` (`:244-311`) in process: it composes a
hypothesis-versus-reality body from the bet row, opens a thread on the bet, and creates a `kind: "review"`
item.

**Does it work?** Yes. BA1 fixed the double-fire — the event matcher now drops any id
`extractBuiltinKind` recognises (`routine-scheduler.ts:785`), so a bet completion no longer runs the
in-process retro *and* starts a generic session.

**Anything read its output?** Yes. The thread is hosted on the bet (`hostKind: "bet"`), which resolves to
`/work/bet/:id` (`host-route.ts:12-13`), and the bet page loads its host threads
(`layers/core-ui/src/pages/WorkBet.tsx:264, 737`). It is visible where you would expect it.

**Should it travel?** Yes on the merits — it is the founder's own ruling that retros are knowledge work,
it works, and it is visible.

**But an ordinary routine cannot do this job today, and that is a hard finding, not a detail.** Three
things block it, in increasing order of severity:

1. **A routine matches on event type only.** `listRoutines(db, { triggerType: "event", eventType, active:
   true })` (`routine-scheduler.ts:780-784`) has no condition on the payload. The in-process handler's
   `if (event.toState !== "completed") return;` (`:504`) has no equivalent. So a plugin retro routine
   fires on every bet state change.
2. **A routine run carries no team when its owner has none.** §1.4. Post-bet retro is the one builtin that
   is `scope: "team"` and `ownerRole: "product_manager"` (`routine-scheduler.ts:134-142`) — a team agent.
   Owned by one global plugin agent it loses the team, and with it `{{product}}` in the persona
   (`context.ts:490-494`) and the whole knowledge bundle.
3. **A routine run carries no event.** This is the blocker. `fireGenericRoutine(db, eventBus, routine,
   ports)` is called with the routine and nothing else (`routine-scheduler.ts:791`; signature at
   `:577-583`). `resolveRoutineRunRequest` takes no event parameter and the baked bundle it returns is
   `{ routine: {id, name, prompt, lastRunSummary}, agent, team, knowledge }`
   (`routine-service.ts:477-506`). **The agent never learns which bet completed.** And there is no tool it
   could use to find out: the full tool list is `send_message, reply, query_practice, write_memory,
   handoff_to, create_item, create_task, submit_review, score_attention, promote_knowledge,
   create_conflict_review, create_team, add_agent, create_bet, edit_bet, create_routine, update_routine,
   log_task, create_artifact` (`tool-definitions.ts:65-1404`). `create_bet` and `edit_bet` write; nothing
   reads a bet.

**This is a founder question, not a recommendation I can make** — see §8 Q3. §3.15 states what the plugin
can ship without answering it.

Note also that `humanReview: true` on this spec (`routine-scheduler.ts:141`) is read by nothing in the
execution path — the only reader is `GET /routines/:id`'s response shaping (`routines-routes.ts:307`). It
is a second dead field of the same family as the `skillId` BA1 deleted. Do not carry it.

### 3.7 The human bet-retro pane — **CORE**

**What it does today.** A separate thing that shares the word. `WorkBet.tsx` has a retro form a person
fills in: verdict, summary, learnings. It posts to `POST /api/bets/:id/retro`
(`layers/core-api/src/routes/bets.ts:697`), which writes the bet outcome and upserts a retro knowledge
item in one transaction (`bets.ts:742-838`). There is also `POST /:id/retro/draft` (`bets.ts:632-688`)
behind a "Draft with AI" button (`WorkBet.tsx:1126-1129`).

**Does it work?** The save works and is used from the UI. The **draft is a stub** — it composes strings
from task outcome verdicts with no model call at all, and says so (`bets.ts:627-631`: *"a stub for AC2…
When LLM integration lands, replace this logic"*).

**Recommendation: CORE.** A person recording the outcome of their own bet on the bet page is the machinery
of working, not a ritual about it — it is how a bet reaches a verdict. The audit marked both routes PLUGIN
(audit `:102-103`, `:340-341`) on the grounds that "retros are named ceremony"; that reasoning does not
survive looking at the pane, which is a person writing down what happened. The AU44 ledger records the
save as deliberately retained pending this track (`.pipeline/work/AU44/FEATURE-LEDGER.md:137`) — retaining
it permanently is the smaller change.

The "Draft with AI" button is a shipped user-facing control inside a surface this document calls CORE, and
no acceptance criterion covers it. **It is a founder question, not a verdict** — see §8 Q5.

This makes `plan.md:240-241`'s validation scenario — *"a fresh install without the plugin… nothing refers
to retros"* — need a boundary. **Recommend:** the bet's own outcome form stays and keeps its name; what
disappears without the plugin is the *automatic* retro that fires on completion, the monthly portfolio
retro, and the knowledge upkeep.

### 3.8 Portfolio retro — **DROP**

**What it does today.** `runPortfolioRetro` (`routine-scheduler.ts:313-375`) lists L3/L4 items updated in
the last 30 days, formats them as a bullet list, opens a thread and creates a review item. Monthly, first
Monday (`routine-scheduler.ts:146-154`).

**Does it work?** It writes its rows. But nobody can reach them. The thread is created with
`hostKind: "factory"`, `hostId: "portfolio"`, and `participants: JSON.stringify([routine.ownerAgentId])`
(`routine-scheduler.ts:344-347`) — an agent, never a human. `GET /api/threads` requires either a host
scope or a `participant_id`, and a `participant_id` that is not the authenticated human is rejected 403
(`layers/core-api/src/routes/threads.ts:781-795`). So:

- No human's participant-scoped thread list can ever include it — the participants array holds an agent id.
- No client asks for the host scope that would return it: a repo-wide search for `host_kind=factory` in
  `layers/core-ui/src` returns nothing, and `ReviewPage` only ever resolves `task` or `bet` as its host
  kind (`layers/core-ui/src/pages/review/ReviewPage.tsx:132`).
- `resolveHostRoute("factory")` returns `null` (`host-route.ts:38-39`), so even holding the thread there
  is no page to link back to.

**Anything read its output?** No. This is the one candidate on the list whose product is genuinely
unreachable from every surface.

**Recommendation: DROP.** A monthly "here are the items that changed" list, written into a thread with no
human participant and no page, is not a capability being relocated. If a team wants a monthly review, that
is a routine they author with a prompt — which is exactly what the plugin substrate gives them for free.
Re-providing this specific body would be carrying a dead thing, which the plan's own constraint forbids.

Its data door, `list({recentByLayers})` (audit `:5072`), dies with it —
`ports.knowledge.listRecentByLayers` (`routine-scheduler.ts:324`) is the sole caller.

### 3.9 Knowledge merge and split — **REBUILD (the first pass had the record backwards)**

**Correction.** The first pass read audit rows 58 and 59 as convictions and called merge and split "dead on
their own merits". That was a misreading of a column header. In the route inventory
(`| # | Door | Reach | Verdict | Reason |`, audit `:307`) rows 58 and 59 read
`DEAD | PLUGIN` — `DEAD` is the **reach**, `PLUGIN` is the **verdict** (audit `:366-367`). In the
verdict-movement table (`| # | Door | Old | New | Moved by |`, audit `:92`) the same rows read
`DELETE | PLUGIN` — the first wave said delete, the ruling moved them to plugin (audit `:104-105`).
**Neither destroyer convicted them. Both routed them here.**

**What the record says happened.** `.pipeline/work/AU44/FEATURE-LEDGER.md:121-129`, under "A scope breach
worth recording": merge, split and flag *"were deleted although all three carried PLUGIN verdicts —
explicitly out of scope for both passes… The sibling PLUGIN rows (`/promote`, `/attention-score`, both
retro routes, `POST /api/org/team-routines`) were correctly kept, which makes these three an inconsistency
rather than a policy."* And then, in bold: **"Track BA must rebuild these rather than relocate them."**

**What exists today.** Nothing. `POST /api/knowledge/:id/merge` and `/split` and their
`transition({target: "merge"|"split"})` implementations are gone; the current `transition` union carries
only `recomputeAttention | promote | changeScope`
(`layers/core-api/knowledge/src/knowledge-repository.ts:906-924`). Recoverable from `3efc6c573^`.

**Recommendation: rebuild, and rebuild them agent-reachable.** The plan's constraint about dead code bites
on a convicted *implementation*; the capability here was never convicted, and the ledger names this track
as the one that owes it. The honest smallest rebuild is to recover the two doors from `3efc6c573^` and
give the plugin's agent a way to call them — note the plugin agent has `write_memory` (create) but **no
archive tool**, so "consolidate two items" is not something a prompt alone can do with today's tool
surface. **This is founder question 1** (§8 Q1), because "rebuild" is the record's word and the first
pass asked the founder to decide against a reversed version of it.

### 3.10 Flag-for-review — **DROP, and the record genuinely disagrees with itself here**

**What exists today.** Nothing. `POST /api/knowledge/:id/flag` was removed in the same pass.

**The audit is split on this one, unlike merge and split.** Its route row says PLUGIN
(audit `:106`, `:369`: "Flag-for-review ritual → plugin"). Its knowledge-service rows say DELETE, twice,
and give a reason:

- row 3 (audit `:5224`) — `resolveKnowledgeActionRequest`: *"Dead door end to end; re-provision is a
  conversation with an agent, no plugin machinery needed."*
- row 27 (audit `:5248`) — `transition({target:"flag"})`: *"Re-examined: dead door, and no plugin-worthy
  ritual behind it."*

The AU44 ledger groups flag with merge and split as a scope breach
(`.pipeline/work/AU44/FEATURE-LEDGER.md:123`), so the record does not settle it either.

**Recommendation: DROP.** The more specific rows examined the implementation and re-examined it under
Ruling 3 before reaching DELETE; the route row is a one-line classification. "A human asks an agent in
conversation to fix an item" needs no preconfiguration, so there is nothing for a plugin to ship. Folded
into §8 Q1 so the founder answers all three routes in one conversation.

Note that `knowledge_conflicts` and the `create_conflict_review` tool are a *different* mechanism —
write-time conflict surfacing, which the audit kept in core (audit route inventory rows 62-63,
`:370-371`) and which this package must not touch.

### 3.11 Knowledge promote door — **CORE**

`POST /api/knowledge/:id/promote` (`layers/core-api/src/routes/knowledge.ts:670-685`) and the
`promote_knowledge` agent tool (`tool-definitions.ts:786-790`) are the manual lifecycle transition — a
person or an agent deciding an item is ready. That is the same shape as the human bet-retro pane: a
decision made while working, not a schedule.

**Recommendation: CORE.** The *sweep* that promotes automatically travels (§3.4); the *door* that lets
someone promote deliberately stays. The audit's row 64 (audit `:107`, `:372`) marked the door PLUGIN
because it is "driven by the `builtin:knowledge-promotion` ceremony routine" — but the route has an
independent caller in the agent tool surface, the triage flow in the knowledge list depends on status
transitions (`KnowledgeList.tsx:817-822`), and §3.15 makes it the tool the plugin's own agent calls.

### 3.12 `POST /api/org/team-routines` — **DROP**

**What it does today.** Its only job is calling `provisionTeamRoutines`
(`layers/core-api/src/routes/org.ts:340-346`). Its only caller is the `create_team` agent tool, through
the core-api port (`layers/agent-orchestration/src/services/core-api-port-composition.ts:647`).

**Recommendation: DROP.** When the built-in specs go, this route has nothing to seed. The UI flow's own
call at `teams-routes.ts:329` goes too. Matches the audit's row 105 (audit `:110`, `:413`).

### 3.13 The built-in routine mechanism — **DROP, code and rows**

**The code.** `BUILTIN_ROUTINE_IDS`, `extractBuiltinKind`, `BUILTIN_SPECS`, `provisionTeamRoutines`,
`fireBuiltinRoutine`, `registerBuiltinRoutineHandlers`, `PostBetRetroArgs`, `RunBuiltinResult`, the three
cron constants, `PORTFOLIO_WINDOW_MS`, and the `extractBuiltinKind` filter inside the event matcher
(`routine-scheduler.ts:785`) and the clock tick (`:898-903`).

**Two live surfaces the first pass's list missed:**

- `layers/core-api/src/services/routine-scheduler-bindings.ts:177-193` — `fireRoutine` branches on
  `extractBuiltinKind` and routes builtin ids to `fireBuiltinRoutine`. Its callers are the manual-trigger
  route (`routines-routes.ts:372`) and test helpers. The branch goes; `fireRoutine` becomes a
  `fireGenericRoutine` call.
- `tools/eval/src/scenarios/builtin-routines.ts` — imports `provisionTeamRoutines`
  (`:20`, called at `:69`) and exists solely to exercise the four builtins. It stops compiling when the
  specs go. Delete the scenario file; it tests the mechanism being removed.

**The seed rows — this is the part `plan.md:222-223` asks for and the first pass did not answer.** Every
existing install carries `builtin:*` rows in `routines`, written by `provisionTeamRoutines` at team
creation: `builtin:post-bet-retro:<teamId>` per team, plus the three bare global ids
(`routine-scheduler.ts:194-198`). Fresh installs after this change get none, because the only writer is
gone.

They cannot be hard-deleted. `routine_runs.routineId` references `routines.id` with `onDelete: "restrict"`
(`schema.ts:636-638`), so on any install where a retro or sweep ever ran, a `DELETE FROM routines WHERE
id LIKE 'builtin:%'` fails on the first row with history.

**Recommendation for the migration:** use the same three-field write the product's own delete route
performs — `deletedAt = now()`, `state = 'paused'`, `active = false`
(`routines-routes.ts:232-237`). That is enough to make them invisible and inert: `listRoutines` excludes
soft-deleted rows by default (`routine-service.ts:175`), so they never appear in the event matcher's query
(`routine-scheduler.ts:780-784`), never appear in the clock tick's due list (`:889`), and never appear in a
team's routine list (`teams-routes.ts:626`). Their run history survives, which is the point of the
constraint. **The AC's "their seed rows are gone" is satisfied in the sense that matters — no builtin
routine exists as far as any reader is concerned — and this document recommends reading it that way rather
than as a hard delete the schema forbids.**

### 3.14 Summary table

Verdicts this document reaches. Rows the founder must decide are in §8, not here.

| Candidate | Verdict | One-line reason |
|---|---|---|
| Five facilitator personas | **DROP** | Own nothing, and all five resolve to the same community — they are not five |
| Practice communities (`communityForRole`) | **CORE** | Decides which L3 knowledge every agent session loads |
| Knowledge decay sweep | **TRAVEL** | Works, output visible, scheduled ceremony |
| Knowledge promotion sweep | **TRAVEL** | Works, output visible, scheduled ceremony |
| Contradiction detector inside it | **DROP** | `meta` has one writer and no caller supplies it; the branch cannot be reached |
| Attention score column + session ranking | **CORE** | A ranking weight in every agent's knowledge bundle |
| Both on-demand attention routes | **CORE** | `score_attention` calls one of them at the seam; removing it breaks the tool |
| Scheduled attention recompute | **TRAVEL** | Deciding on a schedule what deserves attention is the ritual |
| Human bet-retro form (save) | **CORE** | A person recording their bet's outcome is how a bet ends |
| Portfolio retro | **DROP** | Thread has no human participant, no host page, and no client asks for it |
| Flag-for-review | **DROP** | The two rows that examined the implementation both say DELETE (see §8 Q1) |
| Manual knowledge promote door | **CORE** | The tool the plugin's own agent calls |
| `POST /org/team-routines` | **DROP** | Exists only to seed the built-ins |
| Built-in routine mechanism, code and rows | **DROP** | The thing being replaced |

### 3.15 What the plugin can actually ship

`plan.md:209-211` requires that an installing team gets "working retros and the knowledge upkeep that
supports them, driven by ordinary routines and skills rather than a dedicated code path". §1.4 and §3.6
show that is not uniformly achievable today. Splitting it by candidate:

**The two upkeep routines work as ordinary routines, with one global agent, with no new mechanism.**
Neither needs a team and neither needs an event payload:

- They are clock-fired, so there is no event to lose.
- `query_practice` searches the knowledge fabric by free text and layer with no team scope
  (`tool-definitions.ts:189-201` — it calls `ports.coreApi.search` and filters by layer). The empty
  `knowledge: []` bundle costs the agent its pre-loaded context, not its ability to look.
- `promote_knowledge` performs the status transition (`tool-definitions.ts:786-790`), and `write_memory`
  writes findings back (`:245`). Both list `facilitator` among their allowed roles (`:790`, and
  `FACILITATOR_ROLES` at `:236-240`).

So the plugin's decay and promotion routines can be exactly what the plan describes: a routine, a prompt,
and an agent that searches, judges and transitions. **That is the shape to build first, and it satisfies
"knowledge decay and promotion still happen, fired by the plugin's routines, not by core"
(`plan.md:224`) on its own.**

**The post-bet retro does not, for the reason in §3.6 item 3.** The three ways out, with what each costs:

- **Per-team plugin agent.** The plugin provisions one agent per team and one `scope: "team"` retro
  routine per team, mirroring what `provisionTeamRoutines` does today. Restores the team and the knowledge
  bundle. Does **not** restore the event: the agent still does not learn which bet, so it would have to
  re-derive "which bet just completed" — and no tool reads a bet.
- **Give the routine session its triggering event.** Add the event to the baked request so the prompt can
  name it. Touches `fireGenericRoutine`'s signature (`routine-scheduler.ts:577-583`),
  `resolveRoutineRunRequest`, and `BakedContextBundle`. This is the only option that actually makes an
  event-fired plugin routine useful for anything — and it is a substrate change, which is arguably inside
  `plan.md`'s "the plugin substrate" acceptance criteria and arguably a new mechanism its constraints
  forbid.
- **Defer.** Ship the plugin with the two upkeep routines, keep the automatic post-bet retro out of the
  first version, and record that an event-fired routine cannot yet do work that depends on the event.

**Founder question 3** (§8). Whichever is chosen, this document recommends **not** keeping the in-process
retro handler in core as an exception — `plan.md:81-83` forbids reproducing the builtin path, and an
exception for one ritual is how the current situation arose.

---

## 4. Open question 2 — the "App-managed" edit lock

### 4.1 What the lock is today

`layers/core-ui/src/pages/work/AgentDetailPane.tsx:135` computes `isStrategy` from the agent's category
and uses it five times:

- shows a warning box: *"This agent is managed by app defaults. Your system prompt edits are preserved,
  but operational configuration may refresh when defaults change."* (`:207-217`)
- relabels the config toggle "Show configuration (app-managed)" (`:251-257`)
- **disables** the Harness field (`:272`), the Model tier field (`:291`) and the Max sessions field
  (`:313`)

`layers/core-ui/src/pages/AgentProfile.tsx:396-397` and `layers/core-ui/src/pages/WorkTeam.tsx:567-568`
render the category as a tag reading "App-managed".

### 4.2 Four facts that should decide this

**Fact 1 — the lock is cosmetic. The server does not enforce it.** `PATCH /api/agents/:id`
(`layers/core-api/src/routes/agents.ts:321`) rejects only `role === "system"` (`:328-330`) and
`systemPrompt` writes to `ast-*` assistants (`:339-357`). There is no category check anywhere in the
handler. A direct API call changes a strategy agent's harness and model tier today. So "make them freely
editable" is not a change in what is *possible* — only in what the interface admits.

**Fact 2 — the warning's promise is backwards.** It says system prompt edits are preserved and operational
config may refresh. The opposite is closer to true. `applyFactoryRunConfigDefaults` runs on every launch
(`layers/agent-orchestration/src/factory-run-config.ts:76-97`, called from
`applications/desktop/src/main.ts:460` and `tools/setup/src/factory-bootstrap-runner.ts:20`). It calls
`writeAgentRunConfig` twice per roster agent, and that function does `onConflictDoUpdate` on exactly the
keys present in the patch (`agent-run-config-store.ts:137-152`). So on every start:

- `harnessType`, `modelId`, `modelProvider`, `maxConcurrentSessions` are overwritten with `AH2_DEFAULTS`
  (`factory-run-config.ts:59-64, 82-84`) — the fields the UI disables. True.
- `systemPrompt` is overwritten from `docs/system-prompts/facilitator.md` for every agent whose role has a
  template (`factory-run-config.ts:93-97`); `facilitator` does (`:31`). **A user's system prompt edit to a
  facilitator is destroyed on the next restart** — the exact opposite of what the box promises.

`docs/agent-layer/agent-model.md:66` repeats the same false claim in its table ("Editability: System
prompt editable").

**Fact 3 — the lock is already inconsistent.** The System Agent (`seed-agent-cos`) is in the same roster
and gets the same every-launch overwrite of its operational config (`factory-state.ts:81-89` seeds it;
`factory-run-config.ts:82-84` overwrites it). Its category is `individual`, so the UI does **not** lock it
and shows no warning. Same treatment, opposite affordance.

**Fact 4 — the category the agents would fall to does not exist.** After BA1, an agent belongs to a team
(`teamId`), a person (`ownerUserId`), or neither — enforced by `users_belonging_ck`
(`framework/db/src/schema.ts:83-86`). A plugin-provided global agent belongs to **neither**. Of the two
surviving categories, `team` means a team binding and `individual` means a person binding
(`docs/agent-layer/agent-model.md:64-68`). Neither describes it honestly. Nothing in code enforces the
correspondence today — the check constraint looks at the two id columns, not at `agentCategory` — so both
are *possible*; the question is which is true.

### 4.3 The three options, with what each actually costs

**Option A — drop the lock; trust the human.**

*Changes:* delete `isStrategy` and its five uses (`AgentDetailPane.tsx:135, 207, 251, 272, 291, 313`),
delete the "App-managed" tag branches (`AgentProfile.tsx:396`, `WorkTeam.tsx:567`), delete the warning box.
Every agent's config fields become editable in the UI, matching what the API already allows.

*What breaks:* nothing mechanically. The remaining honesty problem is Fact 2 — the every-launch overwrite
is still there, and now nothing warns about it. That has to be fixed too: either
`applyFactoryRunConfigDefaults` stops overwriting (use `onConflictDoNothing` for the fields it seeds), or
the plugin-provided agents are not in the roster it iterates. **The second is what this package does
anyway** — once the facilitators leave core, the roster reduces to the System Agent, and its config
overwrite becomes the one remaining case.

*Against ETHOS:* this is what §2 says. *"We trust agents. We trust humans… give people and agents real
power and assume competence."* Locking three fields against a hypothetical bad edit, in a UI whose API is
already open, is friction with no learning behind it.

*Against `docs/agent-layer/agent-model.md`:* §3.4 (`:92`) says *"Category is not a permission system."*
Dropping the lock is the doc's own position. It is also the smallest change.

**Option B — move the lock onto an explicit "provisioned by a plugin" flag.**

*Changes:* a new column or a derived flag saying an agent came from a plugin; the same three fields
disabled when it is set; a truthful message. Plus a decision about what the flag means when the plugin is
disabled or removed.

*What breaks:* nothing today, but it adds a field to the agent row and a rule to the UI. And the rule it
would encode is the one Fact 2 shows is currently false — you would be building an affordance for a
refresh behaviour that this package is about to remove for exactly these agents. The plugin does not need
to overwrite its agents' config on every boot; the configuration resolver's whole design is that a user
override wins (`plugin-configuration.ts:196-198`).

*Against ETHOS:* §2 again — a preemptive lock with no learning behind it. And §1: a flag whose only job is
to stop the user editing is "a step whose only job is to slow the user down".

**Option C — keep a third category under an honest name.**

*Changes:* rename the enum value rather than removing it — for example `shared` or `global` — migrate the
rows, and keep or drop the lock separately.

*What breaks:* the acceptance criterion. `plan.md:217-219` requires that no agent can be created, stored,
sent over the wire or displayed in a `strategy` category, and that the value is gone from the type,
schema, wire contract and interface. A rename satisfies that literally. But it keeps a three-valued enum
whose third value the product does not otherwise need, and the whole absorbed AU35 exists to remove it.

*Where it has a real point:* Fact 4. A plugin's global agent honestly belongs to nobody, and neither
surviving category says that. If the founder's answer to "what category does a plugin agent hold" is that
it must be truthful, Option C is the truthful one.

### 4.4 Recommendation

**Take Option A: drop the lock, and give plugin-provided global agents the `individual` category with
`ownerUserId` and `teamId` both null — then fix the two things that made the lock look necessary.**

Reasoning:

1. The lock does not do what it claims and does not enforce what it appears to. Deleting it removes an
   untruth from the interface rather than removing a safeguard. ETHOS §2: *"Security is never
   preemptive."* Nothing here was earned from a learning.
2. `docs/agent-layer/agent-model.md:92` already says category is not a permission system. The current lock
   is the doc's own counter-example. Option A brings the code to the doc; Options B and C keep the
   contradiction and move it.
3. It is the smallest change, and the two follow-on fixes are inside this package anyway: the roster that
   `applyFactoryRunConfigDefaults` overwrites shrinks to the System Agent when the facilitators leave, and
   the plugin re-provides its agents through the configuration resolver, where a user edit already wins by
   design.
4. On the category value: `individual` with a null owner is a small stretch, but it is the value that
   already means "not a team's agent", and the check constraint permits it. Option C's third category is
   more truthful but costs the enum this package exists to collapse.

**This is the founder's call, and the sub-question is genuinely open:** if the founder wants the category
to stay truthful about who an agent belongs to, Option C under a name like `shared` is the honest answer
and the acceptance criterion should be re-read as "the word `strategy` is gone" rather than "the enum is
two-valued". I recommend against it, but the trade is real and it is a taxonomy a user sees.

**Whichever is chosen, two things must ship with it:**

- The every-launch overwrite must stop being a silent surprise. Either it stops overwriting fields a user
  has set, or nothing user-editable is in its roster.
- `docs/agent-layer/agent-model.md` §3 and its table need rewriting. It currently describes `strategy` as
  a live category with editable system prompts, both of which stop being true.

### 4.5 What happens to the rows that already say `strategy`

The AC requires that every row that carried the value holds a category that exists. Today those rows are
exactly the five seeded facilitators on any existing install (`factory-state.ts:105`), plus any agent
someone created with role `facilitator`, `scout`, `infra` or `platform` — `POST /api/agents` derives the
category from the catalog (`agents.ts:268-269`) and `resolveAgentScaffoldSpecs`'s `agent_added` branch
does the same (`layers/core-api/org/src/resolve-scaffold-specs.ts:56-66`).

`scout`, `infra` and `platform` are never instantiated by any code path — they exist only in the catalog
(`agent-roles.ts:159-185`) and in Storybook. Confirmed unchanged from the first pass.

The migration therefore has to decide, for each existing facilitator row, between rewriting the category
and deactivating the agent. **Recommend:** rewrite the category to whatever value 4.4 settles on and set
`status` to inactive, rather than deleting the row — `users.id` is referenced with `restrict` from
`items.sourceAgentId` and `routines.ownerAgentId`, so a delete would fail on any install where a retro
ever ran. The AC's "the row count is unchanged" (`plan.md:252`) already implies this.

---

## 5. The wildcard subscription

`plan.md:225-226` requires that a normal caller cannot subscribe to every event, that the runtime wake-up
hint uses "an explicit infrastructure-only capability, or named events", and that the runtime still drains
promptly. What that could mean, from the code:

**What exists.** `EventBus.on` carries a public `"*"` overload
(`framework/event-bus/src/event-bus.ts:42-47`) and a `WildcardHandler` type exported from
`framework/event-bus/src/events.ts:723`. There is no capability gate of any kind. The single production
caller is `deps.eventBus?.on("*", () => void wake())`
(`layers/agent-orchestration/run-orchestration/src/start-runtime.ts:327`), and its handler **ignores its
argument entirely** — it wants "something happened", not what.

**Why "named events" is not one line.** The obvious name is `agent_work_intent_recorded`, but the only
emitter of it in the whole tree is the routine scheduler (`routine-scheduler.ts:683`). Every other intent
producer goes through `enqueueWorkIntent`
(`layers/agent-orchestration/session-requests/src/service.ts:1186`) or the intake route
(`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:98`), neither of which emits
anything — and the intake route has no event bus handle at all
(`createAgentOrchestrationIntakeRoutes(db: HyperIdleDb)`, `:92`). So subscribing by that name today would
wake the runtime for routine-fired intents and miss every other kind, restoring the one-second polling
latency for the common case.

**Three shapes, and what each costs:**

- **Move the emission to where the fact becomes true.** Emit `agent_work_intent_recorded` from
  `enqueueWorkIntent` itself, then subscribe by name. Needs an event bus threaded into that function and
  the intake route. This is the same principle `plan.md` states for BA8 ("emit where the fact becomes
  true") applied to an event that already exists, so it is not BA8's work.
- **Delete the subscription instead of narrowing it.** For the in-process transport the intake runs in the
  same process as the runtime, so it could call `wake()` directly. Removes the wildcard with no bus
  change, but couples intake to the runtime handle and does nothing for a networked transport.
- **Give the bus a separate activity channel.** Remove the `"*"` overload and `WildcardHandler`, and add a
  payload-free `onActivity` / `notifyActivity` pair handed out only at the composition root. Satisfies
  "explicit infrastructure-only capability" literally, but it is a second pub/sub mechanism beside the
  one that exists.

**Recommend the first.** It removes the wildcard, keeps drains prompt for every intent kind, and puts an
existing event where it belongs rather than inventing a channel. The second is smaller but leaves the
wildcard overload on the bus for the next caller to find.

---

## 6. Load-bearing nouns

**Routine.** The umbrella noun, as the founder ruled. One row in `routines`. Fires on a clock
(`triggerType: "calendar"`, a cron in `triggerConfig`) or on an event (`triggerType: "event"`, an
`eventType` naming one of the 34 bus events). Carries a `prompt` — the instruction handed to its owner
agent when it fires. Takes its team and its person from its owner agent, not from itself. There is no
separate trigger primitive, no condition language, and **no delivery of the triggering event to the
run** (§3.6): a routine matches on event type and the session that results knows only the routine.

**Plugin.** Today: a row in `plugins` plus rows in `plugin_configuration_defaults`, together making a list
of key/value defaults a user can override. It is a *preconfiguration record*, not a package, not a loader,
not a runtime. Exactly one row exists on every install — the reserved `builtin` sentinel — and it owns no
defaults. For this package a plugin must additionally become the thing that creates the real rows — the
agent and the routines — because the configuration tables do not do that.

**Skill.** Not a noun in this system. Rejected as a plugin contribution kind for this package. A routine's
prompt is what carries the instruction. The `skill` value in `CONFIGURATION_KINDS` is a display label with
no entity behind it.

**Practice community.** One of `building | product | growth | ops`, derived from an agent's *role*
(`communityForRole`). It scopes L3 knowledge into agent sessions. It is machinery, not ritual, and it stays
in core. It is not the same thing as the five facilitator persona names, which are being dropped — and
because it reads the role, all five of those personas resolve to the same community anyway.

**Ritual (the boundary test).** Something is a ritual — and travels — when it is *scheduled or automatic*
and its subject is the knowledge rather than the work. Something is machinery — and stays — when a person
or an agent reaches for it while working, or when its stored result changes what agents read. Applied
strictly, that test splits attention scoring and it splits the two things called "bet retro".

---

## 7. Scope and non-goals

**In scope, restated after this pass:**

- The plugin intake: a format, something that reads it and writes both the configuration rows and the real
  `users` / `agent_run_config` / `routines` rows, and a disable/remove path (§2.6).
- A knowledge-upkeep plugin providing one agent and two clock-fired routines — decay and
  promotion-with-recompute — each carrying a prompt (§3.15). Whether a post-bet retro routine joins them
  is §8 Q3.
- Deleting the built-in routine mechanism, its two extra surfaces, and neutralising its seeded rows
  (§3.13).
- Purging `strategy` as an agent category from type, schema, wire contract and interface, and deciding
  what the "App-managed" affordance becomes (§4).
- Removing the wildcard event subscription (§5).
- Deleting `StrategyEvent`, `KernelEvent` and `PostBetRetroArgs`.
- Rebuilding `POST /api/knowledge/:id/merge` and `/split` if the founder confirms §8 Q1, since the AU44
  ledger names this track as owing them.

**Non-goals, unchanged from `plan.md:87-91`:** a marketplace or distribution mechanism; reworking the
knowledge store; deciding whether teams should hold retros; the `@lore O2` projection columns; emitting
the five events with no emitter (BA8).

**Non-goals this pass adds:**

- **A condition language on routines.** A routine matches on event type. Filtering belongs in the prompt.
- **A global knowledge query for team-less routine owners.** §1.4 named this as the gap. §3.15 shows the
  two upkeep routines do not need it — `query_practice` is not team-scoped — so it is not a precondition
  for the plugin. It stays out of scope.
- **Reproducing the in-process retro handler in core under any exception** (§3.15).
- **Removing the `facilitator` role from the catalog.** Three agent tools name it; the plugin's own agent
  will want it. Only the five seeded persona rows and their display names go.

**Explicitly *not* a non-goal any more:** delivering the triggering event to a routine run. §3.6 shows it
is the thing standing between "post-bet retro travels" and "post-bet retro works". It is §8 Q3's middle
option, not something to rule out here.

---

## 8. Mapping to `plan.md`'s acceptance criteria

| AC | What this pass established |
|---|---|
| A plugin can be installed; intake writes `plugins` + defaults; disable and remove | §2. The tables and resolver exist; `builtin` is a reserved id in the same namespace (§2.2). The intake must also write real `users`/`routines` rows, since the configuration tables provision nothing. Disable/remove shape in §2.6 |
| Contributions appear as editable app configuration; a user edit wins | §2.2, §2.4. The resolver already does this; the settings page is its only reader and offers two editable fields. Widening those fields is part of the intake |
| Rituals available as a plugin | §3.15. One agent and two routines for certain; a third depends on §8 Q3 |
| An installing team gets working retros and the knowledge upkeep, driven by ordinary routines | §3.15. The upkeep half is achievable today with no new mechanism. The retro half is §8 Q3 |
| A non-installing team sees a coherent product, no orphaned surfaces | §3.7. The boundary: the bet outcome form stays; the automatic retro, portfolio retro and upkeep go |
| Core no longer contains the ritual machinery, its tables, routes and jobs | §3.12, §3.13. No dedicated *tables* exist — the machinery is code plus seeded rows, and §3.13 answers both |
| Global upkeep runs once, not once per team | §1.3. Already true for the three global builtins via `scope: "once"`; the property must be re-established by whatever seeds the plugin's routines |
| No `strategy` category anywhere; every row holds a category that exists | §4.5 |
| The edit-lock becomes a decided, named thing | §4. Recommendation in §4.4 |
| No hardcoded builtin dispatch; `BUILTIN_ROUTINE_IDS`, `fireBuiltinRoutine`, specs **and their seed rows** gone | §3.13, including the two missed surfaces and the migration shape the `restrict` constraint forces |
| Decay and promotion still happen, fired by the plugin | §3.3, §3.4, §3.15 |
| No normal caller can subscribe to every event | §5 |
| Nothing offers `strategy`; three convicted symbols gone; fabric tables untouched | §1.5, §1.6. The fabric carve-out is moot — both tables were renamed or dropped |
| Verified once end to end, install → agents working → coherent without it | §1.2. No restart step is required by the routine substrate |

---

## 9. Questions for the founder

Not batched — each is a separate conversation. One-line recommendation on each.

**Q1 — Do knowledge merge, split and flag-for-review come back?**
The AU44 ledger says *"Track BA must rebuild these rather than relocate them"*
(`.pipeline/work/AU44/FEATURE-LEDGER.md:129`); all three carried `PLUGIN` verdicts and were deleted anyway,
which the ledger itself calls a scope breach. *Recommendation: rebuild merge and split as agent-reachable
doors recovered from `3efc6c573^`, because the record says this track owes them; drop flag, because the
two audit rows that examined its implementation both reached DELETE with "no plugin-worthy ritual behind
it".* (§3.9, §3.10)

**Q2 — What does the "App-managed" edit lock become?**
*Recommendation: delete it — the server never enforced it, and its warning text is the opposite of what
the code does. The live alternative is a third category under an honest name, more truthful about an agent
that belongs to nobody but keeping the enum this package exists to collapse.* (§4)

**Q3 — How does the automatic post-bet retro get re-provided, if at all?**
A routine run carries no event, so a plugin retro agent cannot learn which bet completed, and no tool
reads a bet. Three ways out: a per-team plugin agent (restores team and knowledge, not the event); deliver
the triggering event to the routine run (the only one that actually works, and a substrate change); or
defer it and ship the two upkeep routines first. *Recommendation: deliver the event — an event-fired
routine that cannot see its event is not a substrate a plugin can use for anything, and this is the one
place the plan's proof depends on it.* (§3.6, §3.15)

**Q4 — If the retro becomes an ordinary routine, do we accept it firing on every bet state change?**
Only arises if Q3 is answered by re-providing it as a routine. Today the in-process handler filters to
`toState === "completed"` (`routine-scheduler.ts:504`); a routine matches on event type alone
(`:780-784`), so every draft→active, active→completed and any→killed transition would start an agent
session that reads the situation and decides to stop. Real spend and real noise on a shared backend.
*Recommendation: accept it only if Q3 delivers the event, so the prompt can see `toState` and return
immediately; without the event the agent burns a session to learn nothing.* (§3.6)

**Q5 — Does the "Draft with AI" button on the bet retro pane stay?**
It is a shipped control (`WorkBet.tsx:1126-1129`) inside a surface this document calls CORE, backed by a
stub that composes strings with no model call and says so (`bets.ts:625-631, 652-686`). No acceptance
criterion covers it and it is not travelling anywhere. *Recommendation: delete the button and the route —
a control that has never done what its label says is worse than no control — but this is a product call
outside the plan, so it should be an explicit yes.* (§3.7)

---

## 10. Proposed plan amendments

Wording, not scope. None of these adds an outcome.

1. Replace "agents, skills, routines and triggers" (`plan.md:81`) with "agents, routines and prompts" in
   the constraint and the acceptance criteria. Skills have never existed; triggers retired in BA1. (§2.5)
2. Restate the final search criterion (`plan.md:253-254`): the remaining unrelated senses of the word are
   migration history, the `strategy` knowledge topic, and prose about the retired kernel/strategy split —
   not the fabric tables, which no longer exist. (§1.5)
3. Drop the restart step from the proof (`plan.md:145-149`, `:233-235`). The event matcher reads the
   database on every event and the clock tick reads it every tick, so no restart is needed. (§1.2)
4. Correct "communities of practice… appear nowhere in the product" (`plan.md:17-18`). The facilitator
   *agents* appear nowhere; the *communities* decide which L3 knowledge every agent session loads. (§3.2)
5. Record that the per-team duplication fix came from an explicit `scope` field on the builtin specs, not
   from the owner-agent change, so the property has to be re-established rather than inherited. Correct
   `.pipeline/BA.md:53` to match. (§1.3)
6. Read "and their seed rows are gone" (`plan.md:222-223`) as "no builtin routine exists as far as any
   reader is concerned". `routine_runs.routineId` is `onDelete: "restrict"`, so a hard delete fails on any
   install where a retro ever ran. (§3.13)
7. Re-scope the "Re-provide what the cleanup removed" paragraph (`plan.md:93-98`) once Q1 is answered: it
   currently names merge, split *and* flag together, and §3.10 recommends splitting flag off.
