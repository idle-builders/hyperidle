# Founder rulings — table ownership work package

Recorded at the concept gate, 2026-08-09. Each ruling is binding on every downstream phase.
Where a ruling contradicts `plan.md`, the ruling wins and `plan.md` is amended by it.

---

## Ruling 1 — `sessions` is owned by the existing `run-orchestration` service. No new package.

**Amends `plan.md:5,13`,** which stated a sessions service "does not exist and has to be
created — that is the one piece of new construction here." It does not have to be created.
With Ruling 4 also taken, **this work package creates no new package at all.**

Evidence the ruling rests on: `sessions` is the product primitive Session, distinct from
`loginSessions` (owned by `users`), `agentSessionRequests` (owned by `session-requests`) and
the in-memory `sessionRunRegistry`. `run-orchestration` already consumes the row for its own
decisions — capacity gating, boot recovery, and the live-runtime terminal writes. Naming it
owner legalises 74 sites with zero code change; any other owner leaves 30 additional sites,
every one inside `run-orchestration`, each needing an injected port. The planner and an
independent reviewer reached this separately, and the 191 → 117 / 147 measurement was
reproduced file-for-file.

## Ruling 2 — Correct the `filesystemCaptures` registry entry to `filesystem-mounting`.

Both options were legal here. The registry entry names `filesystems`, which never touches the
table; `filesystem-mounting/src/index.ts:2-20` already records founder-approved ownership.
Clears 2 sites with no code.

## Ruling 3 — Correct the `serverCredentials` registry entry to `core-api/credentials`.

Presented as forced rather than chosen, and not objected to. The table is registered to
`connections`, which never touches it — `connections/src/index.ts:16-18` states the catalog
"genuinely stays core-side", so the code itself documents the entry as stale. Routing through
the registered owner would be cross-layer, where DI is forbidden
(`governance-model.ts:265-289`), so acceptance criteria 2 and 3 would be **unsatisfiable** for
those 8 sites under any other choice. Clears 8 sites with no code.

## Ruling 4 — Delete the `user_skills` table. Do not assign it an owner.

**This is a scope change from `plan.md`, granted deliberately, and it executes the charter of
the registered-but-never-started work package AL9 inside this one.**

The question "which service owns `userSkills`" was rejected as the wrong question. The
evidence:

- The table is `agent_skills` renamed. `framework/db/drizzle/0013_P2_rename_agents_to_users.sql:11-15`
  renamed the table and its column as part of a mechanical `agents` → `users` sweep. It was
  never re-scoped. Every reader renames it back — `select({ agentId: userSkills.userId })`
  at `routine-scheduler-bindings.ts:75`, feeding a port named `listAgentIdsBySkill`.
- It is not user-scoped in any meaningful sense. `users` holds humans and agents on the same
  rows (`kind: "human" | "ai"`, defaulting to `"ai"` — `schema.ts:60-83`).
- It is not a skill model. `skill_id` is free text with no foreign key and no catalog to point
  at, unlike tools, which have a real `BUILTIN_TOOL_CATALOG`. What it holds is a
  per-agent-per-skill autonomy score sheet: `autonomyLevel`, `successCount`, `failureCount`,
  `promotedAt`.
- Those columns are dead **by ruling, not by neglect**: "No per-skill autonomy controls, ever"
  (`docs/product/product-decisions.md:13`). AD4 shipped the removal and deliberately left the
  table; AL9 was registered to delete the remainder and never started.
- **No production insert exists anywhere** — no bootstrap seed, no endpoint, no scaffolding
  hook. Only `tools/eval/src/seeding.ts:609` and tests write rows, so a production database
  has this table permanently empty. `GET /api/users/:id` returns `skills: []` to no UI caller;
  the PATCH endpoint returns 404 unconditionally; Settings renders a permanently empty
  "Skills" category.

Deletion satisfies "every table names exactly one owning service" by removing the table, and
clears 9 production sites without adding a single accessor.

**In scope for the deletion:** the table and its migration, the two dead endpoints on
`layers/core-api/src/routes/users.ts`, the unreachable `listAgentIdsBySkill` delegation port,
the `plugin-configuration.ts` seed scan, and the resulting empty Settings category. The three
eval scenarios that seed skills (`skill-autonomy`, `delegation`, `routine-sessions`) must be
reworked or removed — they may not be left broken.

**Explicitly NOT decided by this ruling:** whether skills should become knowledge items. That
remains the open product question recorded at `docs/product/product-decisions.md:24`. Both
plausible destinations — a knowledge kind, or capability-side alongside the tool catalog where
`ConfigurationKind` already reserves a `"skill"` slot — lead away from this table, so deleting
it forecloses nothing.

## Ruling 5 — Accept the one net-new warning from the `tool-handlers` sessions wiring, for now.

AU31 is far along (47 commits ahead of `origin/main`, mid wave A) and will likely merge first.
The warning lands in `layer → service (other layer) [import]` (36 → 37), a group AU31 clears
entirely.

**Standing instruction:** when this branch rebases onto AU31, this wiring must be resolved
rather than carried — and it should be resolved **by copying the pattern AU31 introduces**,
not by inventing a second one. Do not build the zero-crossing alternative (constructing the
tool context inside the owner) in this work package.

---

## Corrections the founder made to the pipeline's own reporting

`AU31` was reported here as unstarted, inferred from the absence of a committed
`progress.json`. That was wrong: the work is live on `backend/AU31-layer-composition-boundary`,
47 commits ahead of `origin/main`, mid wave A, with uncommitted changes in the working tree.
Absence of pipeline state is not absence of work.
