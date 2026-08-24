# AU35 — Delete `strategy` as an agent category

> **FOLDED INTO BA9 — do not build this as its own work package.** Refined 2026-08-24 with the founder
> and absorbed into `.pipeline/work/BA9/plan.md`. `strategy` is carried by exactly one kind of agent — the
> five facilitators seeded on first boot — and those facilitators leave core for the knowledge-management
> plugin. The purge and the move are one job. Two things this spec did not know, now recorded in BA9: the
> value also drives a live edit-lock in the interface ("App-managed", greyed-out harness and model
> fields), and three of its four catalog roles (`scout`, `infra`, `platform`) are never instantiated by
> anything. Kept below as the original record.

## Work package

**Work package.** As a maintainer, I want the `strategy` agent category gone from the schema, the code and the product — so that the taxonomy a user sees and an agent is filed under contains only categories that mean something. An agent is `team`, `strategy` or `individual` today, and `strategy` names a concept the founder confirmed dead: *"strategy was completely killed a long time ago and shouldn't exist."* Four factory roles are still created carrying it, the enum still offers it, the column still stores it, and the interface still branches on it. When this ships, the category is `team` or `individual`, the existing rows carrying `strategy` have been migrated to whatever they should have been, and nothing in the tree offers the value.

**Why this matters.** This is not tidiness — it is a live product surface. `AgentProfile.tsx` and `AgentDetailPane.tsx` both branch on `agentCategory === "strategy"` and render differently for it, so a user can see and be confused by a category that means nothing. `scaffold-agents.ts` and `factory-bootstrap.ts` actively *create* agents in it on every first boot, so the dead concept is still being manufactured. The maintainer's cost of not fixing this is the same one the Rail and CoS purges were run to stop: a dead word that stays in the enum keeps getting new code written against it, because the next person to read the type has no way to know it is dead. The founder has already made the call twice; what is left is executing it.

**Type.** backend + frontend + schema migration.

**What exists today.** `AGENT_CATEGORIES = ["team", "strategy", "individual"]` (`framework/shared/src/types.ts:134`) with `AgentCategory` derived from it. The `users.agent_category` column (`framework/db/src/schema.ts:82`) stores it, nullable — system users are null. **Four roles in `framework/shared/src/agent-roles.ts` carry `category: "strategy"`** (lines 152, 162, 171, 180) and `framework/db/src/factory-bootstrap.ts` writes `agentCategory: "strategy"` for every facilitator on first boot, so live databases have rows in this category. The zod enum at `layers/core-api/src/routes/org.ts:72` accepts it over the wire. `layers/core-api/org/src/scaffold-agents.ts:78` and `framework/shared/src/team.ts` carry the union in their types. Two UI surfaces branch on it: `layers/core-ui/src/pages/AgentProfile.tsx:299` and `layers/core-ui/src/pages/work/AgentDetailPane.tsx:135`. `tools/eval/src/seeding.ts:529` seeds it. 117 code files and 37 doc files mention `strategy` in some sense — the count includes the unrelated senses below, so the real blast radius must be re-derived, not taken from that number.

**What's genuinely missing.** One decision, and it is the whole work package: **what the four facilitator roles become.** They are real agents that exist in every installation; the category they are filed under is dead but they are not. Deleting the value without deciding their destination would either strand them on `null` or silently reclassify them. That is a product decision about what a facilitator *is*, not a migration detail.

**Depends on.** None. Independent of the governance work packages — no shared files.

**Complexity.** M

**Engineering tier.** production — a schema migration against live rows plus a user-visible taxonomy change.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first, on the noun **facilitator**. What a facilitator is once `strategy` is gone, and therefore which category it belongs to, is the decision this work package exists to execute. Everything else follows mechanically from it.
- **Design:** Light — two existing panes branch on the category and will render differently once it is gone. No new surface; confirm the changed panes against the design system rather than exploring variants.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: this changes what users see and migrates live rows, and it is the third purge of this shape (Rail, CoS) — the founder should confirm the facilitator destination before any migration is written.

**Plan calls.** Standard architecture pass, with the migration planned against real data rather than an empty database: the four facilitator rows exist in every installation that has ever booted, so plan the forward migration and verify it against a database seeded by the current `applyFactoryBootstrap`, not a fresh one. Separate the three senses of the word before touching anything — this work package is **only** the agent category. The kernel-vs-strategy package split (sense 1) was already purged in AU28 step 6. The knowledge/task strategy-layer tables (`knowledge_strategy_fabric`, `task_strategy_fabric`, the `@lore O2` columns) are a **third, unrelated** sense that this work package must not touch; if the naming collision is itself worth fixing, that is a rename, and its own work package.

**Contracts / constraints.**
- The end state is stated as the end state. No deprecated enum member kept "for back-compat", no dual-write.
- Migration is forward-only, and no row is left in a category that no longer exists.
- The facilitator agents keep working — this changes how they are filed, never whether they run.
- Purge completely, the way Rail and CoS were purged: enum, column value, types, zod schema, UI branches, seeds, docs. A surviving mention is a future author's licence to use it.
- Do not touch `knowledge_strategy_fabric` / `task_strategy_fabric` or any `@lore O2` strategy-layer column — different concept, same word.

**Out of scope.**
- The kernel-vs-strategy package split — already purged (AU28 step 6, founder Ruling step 6 sense 1).
- The knowledge/task strategy-layer tables and their columns — a third sense of the word, untouched here.
- Any change to what a facilitator *does*.

**Effort.** M (~1d)

## Acceptance criteria

- No agent can be created, stored, transmitted or displayed in a `strategy` category; the value is absent from the type, the schema, the wire contract and the interface.
- Every row that carried the category has been migrated to a category that exists, and the agents concerned still run exactly as before.
- The two interface surfaces that branched on the category render correctly for every remaining category — verified by looking at the painted output, not by reading the code.
- No mention of `strategy` as an agent category survives anywhere in code or docs; the knowledge/task strategy-layer tables are untouched.
- `npm run verify` is green and a database that predates this work package upgrades cleanly — proven by running the migration against one.

## Validation scenarios

**Given** a database seeded by the current first-boot routine, **when** the migration runs, **then** no row holds `strategy`, every previously-`strategy` agent holds a category that exists, and the row count is unchanged.

**Given** a client sends `agentCategory: "strategy"` to the org endpoint, **when** the request is validated, **then** it is rejected — the value is not in the contract.

**Given** the agent profile and agent detail panes are opened for a former facilitator, **when** they render, **then** the category shown is correct and no branch is dead.

**Given** the repo is searched for `strategy` as an agent category after this ships, **when** the results are read, **then** every remaining hit is the unrelated knowledge/task strategy-layer sense.
