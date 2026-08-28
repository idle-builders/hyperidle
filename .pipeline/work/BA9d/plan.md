# BA9d — The rituals become a plugin, and `strategy` is purged

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/founder-decisions.md`, and the
evidence in `.pipeline/work/BA9/requirements.md` and `.pipeline/work/BA9/refine-critique.md`.
**Depends on BA9a, BA9b and BA9c.** This is where BA9's original outcome and its end-to-end proof land.

## Outcome

The rituals *about* the work leave core and are re-provided as an installable plugin: an agent and its
routines, carrying prompts, using ordinary machinery. The `strategy` agent category is gone. The built-in
routine mechanism is gone. A team that installs the plugin gets working retros and knowledge upkeep; a
team that does not sees a coherent product with no holes.

Founder's bar, verbatim: *"the concept of strategy is completely purged and the plugins are proven to be
working — and to end that means installing a plugin and seeing the agents work."*

## What travels, what dies, what stays

Settled during refinement and independently re-tested. The test is Ruling 3 — *is this the machinery of
working, or a ritual about the work?* — plus this package's own constraint: **nothing already convicted as
broken or dead travels.**

| Candidate | Verdict | Reason |
|---|---|---|
| Five seeded facilitator personas | **DROP** | They own nothing. All five carry `role: "facilitator"`, and `communityForRole("facilitator")` falls back to `ops` (`agent-roles.ts:155`), so all five resolve to the same community. Their `community` field only builds a display name (`factory-state.ts:96-103`). They are not five things. |
| Practice communities (`communityForRole`) | **CORE** | Decides which L3 knowledge every agent session loads (`session-knowledge-assembler.ts:305-311`; used at `run-orchestration/src/context.ts:271,494`). BA9's plan said communities "appear nowhere in the product" — that was wrong about the communities; it is true only of the facilitator agents. |
| Knowledge decay sweep | **TRAVEL** | Works, output visible, a scheduled ceremony. |
| Knowledge promotion sweep | **TRAVEL** | Same. |
| Contradiction detector inside it | **DROP** | `promotion-pipeline.ts:319-321` short-circuits on empty `forbids`, and `meta` has exactly one writer (`knowledge-repository.ts:253`) that no route or tool ever supplies — so `meta` is null on every production row and it can never run. |
| Attention **score**, session ranking, manual `PATCH /:id/attention-score` | **CORE** | A ranking weight in every agent's knowledge bundle (`scoring-config.ts:25`, `session-knowledge-assembler.ts:192,200,209`). Move it and agent context silently gets worse. |
| Scheduled attention recompute | **TRAVEL** | Deciding on a schedule what deserves attention is the ritual. |
| `POST /:id/recompute-attention` | **CORE** | It is the seam behind `score_attention(mode:"recompute")`: `tool-definitions.ts:722` → `core-api-port-composition.ts:790-796` → `knowledge.ts:700-704`. Removing it leaves a live agent tool failing at the seam. |
| Automated post-bet retro | **TRAVEL**, needs BA9c | Founder ruled retros are knowledge work: *"the purpose of retros is to improve the process and setup."* Cannot be an ordinary routine until an event-fired routine can learn which bet — that is BA9c. |
| Human bet-retro form (save) | **CORE** | A person recording their bet's outcome is how a bet ends. |
| Portfolio retro | **DROP** | Its thread's participants list is `[routine.ownerAgentId]` — an agent (`routine-scheduler.ts:344-347`) — and `GET /api/threads` refuses a foreign participant (`threads.ts:781-795`), so no human can open it. Its `items` row is `kind: "review"` with no bet, unreachable from `ReviewPage`. |
| Knowledge merge / split | **REBUILD** — see open question | The audit's `DEAD` is the caller-trace column; the **verdict** column says `PLUGIN` on rows 58 and 59. `.pipeline/work/AU44/FEATURE-LEDGER.md` records their deletion as a scope breach and says this track must rebuild them. |
| Flag-for-review | **DROP** | The record contradicts itself — route row says PLUGIN, service rows 3 and 27 say DELETE with "dead door end to end". The rows that examined the implementation said delete. |
| Manual knowledge promote door | **CORE** | An independent agent-tool caller; the triage flow needs it. |
| `POST /api/org/team-routines` | **DROP** | Exists only to seed the built-ins. |
| Built-in routine mechanism | **DROP** | The thing being replaced. |

**What the plugin actually ships:** one agent, and routines for decay, promotion-with-recompute, and the
post-bet retro. That is the whole plugin.

## The per-team trap — read this before touching scope

The BA9 plan and the BA track registry both say per-team duplication of global sweeps was fixed at its
cause by BA1's owner-agent change. **That is wrong**, and building on it would reintroduce the bug.

Scope does now come from the owning agent (`routine-service.ts:465-467`) and `routines.teamId` is gone.
But what actually stopped the duplication is an explicit `scope: "team" | "once"` field on the builtin
specs (`routine-scheduler.ts:116-133`), used at `:194-196` to seed a `"once"` spec under a bare id so the
second team's attempt is a no-op under `onConflictDoNothing` at `:215`. `provisionTeamRoutines` is still
called once per team. **When the builtin specs are deleted, that field goes with them** — so whatever
seeds the plugin's routines must decide "one row globally" versus "one per team" for itself.

## The purge (absorbed from AU35 and AU39)

- `strategy` gone from the type, the schema, the wire contract and the interface. `POST /api/agents`
  currently derives the category from the catalog (`agents.ts:268-269`), as does the `agent_added` branch
  of `resolve-scaffold-specs.ts:56-66`, so creating an agent with role `facilitator`, `scout`, `infra` or
  `platform` still mints a `strategy` agent today. `scout`, `infra` and `platform` are never instantiated
  by anything — catalog and Storybook only.
- **The "App-managed" edit lock is deleted, not moved** (founder decision D5). Detach-and-restore replaces
  it. The lock was never enforced server-side (`agents.ts:321-357` checks role, never category) and its
  warning text is backwards, because the system prompt is overwritten on **every** launch for any role
  with a template (`factory-run-config.ts:82-97` via `agent-run-config-store.ts:152`). That every-launch
  overwrite must stop being a silent surprise.
- `BUILTIN_ROUTINE_IDS`, `fireBuiltinRoutine`, the builtin specs **and their seed rows** are gone. Two
  further live surfaces the earlier list missed: the dispatch branch at
  `layers/core-api/src/services/routine-scheduler-bindings.ts:167-190` (`extractBuiltinKind` →
  `fireBuiltinRoutine`) and `tools/eval/src/scenarios/builtin-routines.ts`, which stops compiling once the
  specs go.
- **The seed rows need a migration shape.** `routine_runs.routineId` references `routines.id` with
  `onDelete: "restrict"` (`schema.ts:636-638`), so any install where a retro ever ran cannot hard-delete
  them. Use the product's own soft-delete (`routines-routes.ts:232-237`).
- A normal caller cannot subscribe to every event. The only remaining wildcard subscriber is the runtime
  wake-up hint (`start-runtime.ts:327`), which is a latency shortcut, not a dependency — the runtime
  drains on a one-second timer and the subscription only makes it drain sooner.
- `StrategyEvent`, `KernelEvent` (`framework/domain-model/src/events.ts`) and `PostBetRetroArgs`
  (`routine-scheduler.ts`) are gone.
- Two things AU44 deliberately left standing for this package are now removed: the bet-retro knowledge
  upsert, and the facilitator roster seeding in `layers/core-api/src/bootstrap/factory-state.ts`, which
  carries a `@lore` note saying exactly that.

## Migration

- Every row that held `strategy` holds a category that exists. Those rows are the five seeded
  facilitators (`factory-state.ts:105`) plus any agent created with one of the four catalog roles.
- Prefer rewriting the category and marking the agent inactive over deleting the row: `users.id` is
  referenced with `restrict` from `items.sourceAgentId` and `routines.ownerAgentId`, so a delete fails on
  any install where a retro ever ran. The row count must be unchanged.
- `builtin:*` routine rows soft-deleted, not dropped.

## Acceptance criteria

1. The rituals are available as an installable plugin, and a team that installs it gets working retros
   and the knowledge upkeep that supports them, driven by ordinary routines and prompts — no dedicated
   code path.
2. A team that does not install it sees a coherent product with no orphaned surfaces.
3. Core contains none of the ritual machinery, its dedicated routes or its scheduled jobs.
4. Global upkeep runs **once**, not once per team — and the mechanism that guarantees it is stated, not
   inherited.
5. No agent can be created, stored, sent over the wire or displayed in a `strategy` category. Every row
   that carried it holds a category that exists, the row count is unchanged, and no agent is stranded.
6. The routine scheduler dispatches no hardcoded built-in routine; the specs, the ids, the dispatcher and
   the seed rows are all gone.
7. Knowledge decay and promotion still happen, fired by the plugin's routines.
8. A normal caller cannot subscribe to every event; the runtime still drains promptly.
9. `StrategyEvent`, `KernelEvent` and `PostBetRetroArgs` are gone. Remaining hits of the word are
   migration history, the `strategy` knowledge topic (`attention-classifier.ts:20`), or prose about the
   retired kernel/strategy split — none of them an agent category. The `knowledge_app_projection` table
   and its `@lore O2` columns are untouched.
10. Docs made false by this are corrected: `docs/agent-layer/agent-model.md` §3 and its table,
    `docs/knowledge-architecture/facilitators.md`, and
    `docs/knowledge-architecture/sync-and-conflict-resolution.md:51`.

## The proof — for all four packages, run once

Founder's bar. Install the plugin into a running install, watch the agents it provides actually do the
work, and see the same install without it stay coherent. Specifically:

- Given a running install with no plugins, when the knowledge-management plugin is installed and enabled,
  then its agent, skills and routines are present as editable configuration, and its routines fire on
  their events and schedules — **watched happening, not inferred from a table**.
- Given a team that has installed it, when a bet finishes, then a retro happens as it does today.
- Given several teams on one backend, when the knowledge upkeep runs, then it runs once.
- Given the plugin is disabled or removed, when the same events occur, then nothing fires and the product
  still holds together.
- Given a fresh install without the plugin, when someone uses the product, then nothing refers to retros
  or practice communities.
- Given a client sends `agentCategory: "strategy"`, when the request is validated, then it is rejected.
- Given a database seeded by an older first-boot routine, when it is upgraded, then no row holds
  `strategy`, no agent is stranded, and the row count is unchanged.

No restart is needed between installing and seeing a routine fire — the matcher reads the database on
every event and the clock tick re-reads every tick. If the intake needs a restart for its own reasons,
that is a named step, not a surprise.

## Open questions for the founder — bring these up when this package starts

1. **Do knowledge merge and split come back?** The ledger says this track owes them. Recommendation:
   rebuild them as agent-reachable doors, recovered from history at `3efc6c573^`; drop flag-for-review.
2. **May the retro routine fire on every bet state change**, rather than only on completion as today?
   With BA9c delivering the event the prompt can read the state and stop early — but it still starts a
   session each time, which is real spend on a shared backend.
3. **Does the "Draft with AI" button stay** on the bet retro pane? It is a stub that composes strings with
   no model call (`routes/bets.ts:625-631,652-686`). Deleting it is a product call the plan does not
   cover.

## Out of scope

A plugin marketplace or distribution. Reworking the knowledge store. Deciding whether teams should hold
retros. Emitting the five events that have no emitter — that is BA8. The `knowledge_app_projection` table
and its `@lore O2` columns.


---

# As built

Consolidated at ship. The live proof this section summarises was folded in from `proof.md`.

Built in three waves: the routine transition constraint, the plugin itself, then the purge.

## What shipped

**A routine can name a transition, not only an event type** (D8/D11). Stored in the existing
`trigger_config` as JSON — no new column, because it is filtered in memory and never needs an index. A
routine with no constraint behaves exactly as before. A routine naming a transition on an event type that
never carries one is now **rejected at creation** rather than silently never firing.

**The knowledge-management plugin** — one agent (Knowledge Librarian), three routines and three skills,
in Agent Plugins 1.0.0 format at `plugins/knowledge-management/`. The post-task retro fires on
`task_state_changed` with `transitionTo: "done"`, which is D8's "a retro runs at the end of something,
most typically a task".

**Decay and promotion keep their deterministic operation.** The sweep is exposed as an agent-callable
tool (`run_knowledge_sweep`) and the plugin's routines instruct the Librarian to call it. This is the
split the plan already drew for attention scoring — the **ritual** (weekly, at 3am) belongs to the
plugin, the **operation** (what "stale" means, what gets archived) stays in core where it is tested. An
earlier version had the routines as prompt-only sessions, which left the tested sweep orphaned in core
with no caller and reduced knowledge upkeep to an LLM approximating it.

**The purge.** `strategy` gone from the type, schema, wire contract and interface. `BUILTIN_ROUTINE_IDS`,
`fireBuiltinRoutine`, the builtin specs, `extractBuiltinKind`, `provisionTeamRoutines`,
`POST /org/team-routines`, `StrategyEvent`, `KernelEvent`, `PostBetRetroArgs` — all removed outright, not
stubbed. The five seeded facilitators and the "Draft with AI" stub are gone. Migration 0065 rewrites
`strategy` → `individual` and **soft-deletes** the `builtin:*` routine rows, because
`routine_runs.routineId` is `onDelete: "restrict"` and a hard delete would abort any install where a
retro ever ran.

**The App-managed lock is deleted, and the behaviour behind it fixed.** D5 removes the lock;
`writeAgentRunConfigIfAbsent` makes the run-config and system-prompt write **first-boot only**, so a
person's edits survive. Deleting the warning while keeping the every-launch overwrite would have removed
the disclosure and kept the surprise.

**The wildcard subscription is gone.** `on("*")` became `on("agent_work_intent_recorded")`, and the
comment names which paths get a sub-second wake and which fall back to the one-second poll — a behaviour
change that is written down rather than discovered.

## Two mechanisms that must not be deleted by accident

**"Global upkeep runs once" lives in the id hash.** `agentItemId`/`routineItemId` include the install
scope, so a factory-scoped install produces one constant id — one row, fired once — while a team-scoped
install produces one row per team. This is *not* inherited from BA1's owner-agent change, whatever the
track registry says; the previous guarantee came from a `scope` field on the builtin specs that this
package deletes. It carries a `@lore` where the ids are derived.

**The demo world must not seed the rituals.** It did, and the live proof caught it.

## Proven in the running app

Full record in the commit history and summarised here. On a freshly bootstrapped install: no `strategy`
category, no facilitators, no `builtin:*` routines, one routine (the daily digest). Installing the plugin
through its real HTTP door created the Librarian agent (`agent_category: individual`), three routines and
three skills as knowledge items at factory scope. Triggering the promotion routine produced a run whose
prompt instructs the agent to call `run_knowledge_sweep`. Four routines after install — one of each, no
duplicates.

All four packages appear in that one flow: BA9a installed it, BA9b carried its skills to the session,
BA9c tells the retro which task finished, BA9d is what was installed.

## The defect the tests could not have caught

The first proof run showed seven routines where there should have been four — the demo world seeded the
rituals and the plugin added its own. Every test passed, because each set was individually correct.
Nothing was wrong until they were in the same database. That is the third time in this track that running
the real product found what a green suite could not: BA9a shipped an installer with no door, BA9b wrote
skills into directories nothing reads, and this.

## Known limitations

- A brownfield upgrade soft-deletes the old builtin routines, so an existing install **loses automated
  knowledge upkeep until it installs the plugin**. By design, but it belongs in release notes.
- `parsePluginAgent` accepts any string as `agentCategory`, so a plugin could declare a value the API
  would reject. Recorded as a deliberate decision — per ETHOS this is not a rogue-plugin guard — but it
  is the one remaining surface that could reintroduce the purged value.
- Actor identity in event context is partial, inherited from BA9c: several events carry no actor field.


## Re-proved after the final fixes (2026-08-28)

The first end-to-end proof ran **before** the last round of fixes, which changed real behaviour — so it
was stale and had to be repeated. Re-run from a clean bootstrap at `ea3b41757`:

**Migration 65 now actually applies.** A fresh install reports **66** migrations applied where it
previously reported 65. The migration had been silently skipped because its journal `when` was written in
**seconds instead of milliseconds**, and drizzle decides what to apply by comparing that timestamp — a
fact established back in BA9a. So the `strategy` purge would never have run on any real database while
every local gate reported the package complete. Its own brownfield test caught it, which is the second
migration defect that test family has found.

**A fresh install is clean:** zero `strategy` rows, zero facilitators, one routine (the daily digest).

**Installing the plugin** through its real HTTP door: 201, and four routines afterwards — one of each,
no duplicates.

**The sweep does real work.** With 27 knowledge items backdated past the 90-day threshold, calling the
sweep door in the running server returned `processed: 27`, and the statuses moved from 27 active / 2
stale to **0 active / 29 stale**. This is the operation the plugin's routine instructs the Librarian to
call, so "knowledge decay still happens" is now evidenced rather than asserted — and it matters, because
one of the bugs in the final round was `recomputeAttention` never being called after candidates were
loaded.
