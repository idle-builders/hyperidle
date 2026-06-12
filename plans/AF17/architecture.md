# AF17 — Architecture: Seed factory split and Nimmly purge

**Workpackage:** AF17 (TRACK-AF). Complexity L. **Concept (fixed input):** `plans/AF17/concept.md`.
**No UI surface** — `/design` skipped. Backend + data + desktop/deploy wiring + a text purge.

---

## Required reading (engineer, before implementing)

- `plans/AF17/concept.md` — the locked factory/team/fixture boundary + the six hard rules. **Do not re-litigate.**
- `packages/db/src/seed.ts` — the monolith to split (lines 60-424).
- `packages/db/src/seed-fixtures.ts` — `BUILTIN_ROUTINE_SEEDS`, `PRACTICE_COMMUNITIES`, `COMMUNITY_DISPLAY_NAMES`, `FACILITATOR_TOOLS`.
- `packages/db/src/setup-cli.ts` (`applyLaptopMigrations` L141-153) + `packages/db/src/seed-pg-cli.ts`.
- `packages/desktop/src/migrate.ts` + `packages/desktop/src/main.ts` (`bootLocalMode` L411-, `runMigrationsWithRetry`).
- `packages/server/src/routes/teams-routes.ts` POST `/` handler (L320-513) — **the onboarding team-creation seam**.
- `packages/server/src/skill-tools/create-team.ts` — the agent-facing team-creation seam (second path).
- `packages/fabric/src/services/builtin-routines.ts` (`seedBuiltinRoutines(db, teamId)` L204, `BUILTIN_SPECS` L121).
- `packages/eval/src/seeding.ts` (`seedBuiltinAgents` L521-569).
- `chart/values.yaml` (`migration` L31-35), `chart/templates/deployment.yaml` (initContainers L28-65), `.github/workflows/deploy.yml`, `packages/db/src/migrate-pg.ts`, `Dockerfile.deploy` (CMD L59).
- `docs/deployment/shared-backend.md` (updated by concept), `docs/guides/developer/mock-data-policy.md`, `scripts/mock-inventory.ts` (guard precedent), `package.json` (`verify`, `mock-inventory:check`).

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "the only seed path plants a fake Nimmly team … desktop runs no seed" | Confirmed. `seed()` inserts `seed-product-1` "Nimmly" + founder + demo agents + daily-digest; desktop `migrate.ts` "Does NOT seed". | Split `seed()`; wire `applyFactoryBootstrap` into desktop boot + deploy. |
| "SetupFlow calls create-user and create-team" | SetupFlow → `POST /api/users` (creates human+assistant) and **`POST /api/teams`** (NOT the `create_team` skill tool). The skill tool is a *separate* agent-facing path. | Built-in routine provisioning added to **both** `teams-routes.ts` POST and `create-team.ts` tool — concept hard-rule 3 applies wherever a team is born. |
| "built-in routines scoped to the demo team" | Confirmed: `seed-fixtures.ts BUILTIN_ROUTINE_SEEDS` and `fabric BUILTIN_SPECS` both hardwire `teamId:"seed-product-1"` / `ownerAgentId:"seed-agent-pm-nimmly"`/`seed-agent-cos`/`seed-agent-pf-facilitation`. | Move built-in routines to per-team provisioning; owners become **this team's own roster agents** (see Design-it-twice §A). Delete the `seed.ts` builtin-insert loop (L404-423) and the `seed-fixtures.ts BUILTIN_ROUTINE_SEEDS` copy. |
| "seedBuiltinRoutines(db, teamId)" is the per-team hook | Confirmed, parameterized by teamId, defaults `"prod-1"`. But its `BUILTIN_SPECS` owners are factory `seed-agent-*` ids — wrong for a real team. | Re-shape `seedBuiltinRoutines` to take an **owner-resolution map** (role→agentId) or accept explicit owner ids; see §A. |
| deploy "migrates but does not seed" | Confirmed: `migration.command = migrate-pg.ts`; no seed/bootstrap step. | Add a **second init-container** running `bootstrap-pg.ts` after migrate (concept: idempotent, every deploy). |
| "~10 db integration tests call seed() directly" | `seed.integration.test.ts` + others import `seed`. | Those tests assert "≥1 row per major table" incl `teams`/`team_members`. After the split, factory bootstrap alone won't create `teams`/`team_members` — tests migrate to call bootstrap + a fixture helper. See Migrations + protectedTests. |
| `system:propagation` FK | Confirmed: `users(id="system:propagation")` is factory. Bet→review authors via it. | Stays in factory bootstrap — present in every environment (AC5). |
| "~148 / 160 Nimmly refs" | Fresh `grep -ril nimmly` (excl `node_modules`/`.git`): hits across docs, tests, db, eval, fabric, web settings tests + stories + e2e, **design-system L11 mockups (4 files, 5 hits)**, `.claude/skills/design/SKILL.md`, pipeline, archive. | Purge in code/tests/docs/mockups/skill-doc; **out-of-scope (guard-excluded, only these two):** `.pipeline/work-packages/` (the spec itself) and `docs/archive/` — see Risks. The design-system mockups are **in scope** (live assets) — guard stays clean over them. Full file list in task 11. |

No spec/concept contradiction. The concept already added the factory-bootstrap row to `docs/deployment/shared-backend.md`.

---

## The split — what moves where

### (a) Factory bootstrap — `applyFactoryBootstrap(db)` in `packages/db/src/factory-bootstrap.ts`

Pure, idempotent, team-agnostic. Inserts (all `team_id` null/absent):

- `users`: `system:propagation`; the system-assistant singleton (`seed-agent-cos` → rename display to "System Agent", `agentCategory:"individual"`, `team_id:null`); facilitator agents per `PRACTICE_COMMUNITIES` (`seed-agent-pf-<community>`, `agentCategory:"strategy"`, `team_id:null`). **Removed from factory:** the demo builder (`seed-agent-builder`), the demo PM (`seed-agent-pm-nimmly`), the "Founder" human (`u-founder`).
- `factory_settings`: `cost_cap`, `cost_cycle`, `soul_template:<role>` (read from `docs/souls/`, `onConflictDoUpdate`). Plus the existing `categoryByRole` + `soulPrompt` backfills (idempotent updates) — **scoped to factory agents only** now.
- `knowledge_items` + `knowledge_strategy_fabric`: the `scope_kind="factory"` "Boil the Lake" principle (`seed-ki-1`/`seed-ksf-1`), `updatedBy:"seed-agent-cos"`.

Reuses `stripFrontmatter`/`readSoulTemplate` (move with the function or keep in `seed.ts`-adjacent helper).

### (b) Team provisioning — at every team-creation site

Built-in routines join the existing roster+soul-prompt provisioning in:
1. `packages/server/src/routes/teams-routes.ts` POST `/` (onboarding) — after `leadAgentId` is set (L424), call the per-team builtin provisioner.
2. `packages/server/src/skill-tools/create-team.ts` (agent path) — after roster loop, same call.

The provisioner creates the 5 built-in routines (`practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion`) with `team_id = <this team>` and `owner_agent_id` resolved to **this team's roster agents** (see §A). Idempotency is **per-team** via a per-team id scheme (see §A — global `builtin:*` ids would collide on a second team).

**`teams.id` vs `team_members.id` — load-bearing, do not confuse (schema-verified):** `routines.team_id` references **`teams.id`** (`schema.ts` L267-269, NOT NULL, `onDelete: restrict`); `routines.owner_agent_id` references **`users.id`** (L256-258). Separately, roster agents are inserted with `users.team_id = team_members.id` (`schema.ts` L46) and `leadAgentId` points at a roster `users.id`. Therefore `provisionTeamRoutines` MUST receive **`teams.id`** (the `teamId` local var at the call site) for `routines.team_id` — **NOT** the `team_members.id` (the more "team-like"-sounding membership row id, also in scope at both seams). `ownerByRole` values and `leadAgentId` are **`users.id`** (agent) values from the just-created roster. Passing `team_members.id` as `teamId` produces an FK violation. Both call sites have both ids in scope under confusable names — the builder must pass the `teams.id`.

### (c) Test/demo fixture — `packages/db/src/demo-fixture.ts` + eval stubs

The "Nimmly" team/founder/demo-agents/daily-digest-trio move into a `seedDemoWorld(db)` helper under a **neutral fictional name** (lock: **`Acme`**, team id `demo-team-acme`, agents `demo-agent-*`). Used only by `setup-cli` demo mode (opt-in flag) and tests. `eval/seeding.ts seedBuiltinAgents` stub `seed-agent-pm-nimmly` → renamed (see §A decision; eval owns its own stub ids so it can rename to `demo-agent-pm` freely).

---

## Phase 0 — Interrogation (resolved)

1. **Owner of built-in routines on a real team?** Today they reference factory agents (`seed-agent-cos`, `seed-agent-pf-facilitation`, `seed-agent-pm-nimmly`). On a real team those agents don't exist as team members. → **Resolve owners to the team's own roster by role** (see §A). Confirmed by AC3 ("owned by that team's own agents").
2. **Does the deploy bootstrap run per-pod or once?** It's idempotent → safe per-pod, but cleanest as an init-container (runs once per rollout, gates readiness like migrate). → **Second init-container** after migrate.
3. **Does factory bootstrap run on desktop every launch or once?** Idempotent → every launch (concept hard-rule 4); no first-run flag needed. → call in `bootLocalMode` after `runMigrationsWithRetry`.
4. **Should `seed-agent-cos`/`seed-agent-pf-*` ids be renamed (they're factory, fine) but `seed-agent-pm-nimmly` (Nimmly)?** It's a demo PM, not factory → it leaves the production path entirely; the *built-in routine owner* that pointed at it is re-resolved per-team. The eval stub renames. → No factory row keeps a Nimmly id.
5. **Neutral fictional name?** → **`Acme`** (clearly fictional, no real-product collision). Pinned here so it isn't re-debated.

---

## Phase 3 — Design-it-twice

### §A — How built-in routine owners resolve to a real team's agents

**Option A1 — role-map resolution.** `seedBuiltinRoutines(db, { teamId, ownerByRole })` where the caller passes `{ product_manager: agentId, facilitator: agentId, … }` built from the just-created roster. Each spec declares the *role* it needs (`product_manager` for post-bet-retro; `facilitator`-ish for practice/decay/promotion; lead/PM for portfolio). The provisioner maps role→agentId, falling back to the team lead when the role is absent from this team's functions.
- Trade-off: specs must carry a `ownerRole` instead of a hardcoded id; one extra map build at the call site.
- Reject reason: none material — this is the honest model (a routine is owned by whoever on *this* team plays that role).

**Option A2 — always own by the team lead.** Every built-in routine `owner_agent_id = leadAgentId`.
- Trade-off: trivial; one id.
- Reject reason: loses the editorial meaning (knowledge-decay is a facilitation concern, post-bet-retro is a PM concern); a team without a PM still works but a team *with* a PM mis-attributes. Acceptable only as the fallback.

**Synthesis (chosen): A1 with A2 fallback.** Specs gain `ownerRole: UserRole`. Provisioner resolves `ownerByRole[spec.ownerRole] ?? leadAgentId`. This keeps attribution honest and total (every team has a lead). The two duplicate spec copies (`db/seed-fixtures.ts`, `fabric/builtin-routines.ts`) → **collapse to one** in `fabric/builtin-routines.ts` (`BUILTIN_SPECS` already the runtime source); delete `BUILTIN_ROUTINE_SEEDS` from `seed-fixtures.ts` and the `seed.ts` insert loop. (Removes the "keep in sync" lore debt — a net simplification the concept invited.)

**Per-team routine id scheme (Finding 4 — load-bearing, with a dispatch ripple).** Today `seedBuiltinRoutines` inserts routines keyed by the spec's **global** id (`builtin:post-bet-retro`, etc.) with `onConflictDoNothing`. With a single team that is fine, but `provisionTeamRoutines` running for a **second** team (the `create_team` skill-tool path can create N teams) would conflict on the same global `builtin:*` id and silently insert nothing — team 2 would get **zero** built-in routines.

Fix: derive the stored routine id per team — **`routines.id = \`${spec.kind}:${teamId}\``** where `spec.kind` is the stable global kind (`builtin:post-bet-retro`, …). `onConflictDoNothing` then gives **per-team** idempotency: re-provisioning the same team is a no-op; each new team gets its own 5 rows.

**Dispatch ripple (do not miss — verified in code).** The stored `routines.id` is currently ALSO the dispatch key. Both `runBuiltinRoutine(db, eventBus, routineId)` (`builtin-routines.ts` L258-307: looks the row up by `routines.id = routineId` AND `switch (routineId)` on the global id) and its two callers gate on `isBuiltinRoutineId(routine.id)` then pass `routine.id` through — `routine-scheduler.ts` L618-630 and `routines-routes.ts` L559-574. A team-scoped `routines.id` (`builtin:post-bet-retro:<teamId>`) would fail `isBuiltinRoutineId` (membership check over the 5 global ids) and never dispatch. So the kind must be **recoverable from the stored id**:
- Change `runBuiltinRoutine`'s dispatch to key on the **kind prefix** of the stored id, not the whole id: parse `kind = routine.id.split(":").slice(0,2).join(":")` (→ `builtin:post-bet-retro`) and `switch (kind)`. The DB lookup stays `eq(routines.id, routineId)` with the full team-scoped id.
- Change `isBuiltinRoutineId(id)` (and the two call-site guards) to test the **kind prefix** (`id.startsWith("builtin:") && BUILTIN_ROUTINE_IDS.includes(kindPrefix)`), not exact equality.
- `BUILTIN_ROUTINE_IDS`/`BuiltinRoutineId` continue to enumerate the 5 **kinds**; the post-bet-retro event path (`runBuiltinRoutine(..., "builtin:post-bet-retro", {betId})`) must resolve the **team-scoped** routine row for the bet's team before dispatch (look up by `kind` + `teamId`), not pass the bare kind.

This keeps the dispatch contract on the 5 kinds while making storage + idempotency per-team. **Verification:** AC3 must provision a second team against a DB already holding team 1's routines and assert team 2 receives its own 5 (no collision); the dispatch tests in `protectedTests` must keep passing against the kind-prefix dispatch.

### §B — Deploy bootstrap: extend migrate command vs second init-container

**Option B1 — append bootstrap to the migrate init-container command** (`&&` two tsx calls).
- Trade-off: one container, one image pull.
- Reject reason: conflates two failure domains (a bootstrap error would read as a migration failure); harder to reason about idempotency separately.

**Option B2 (chosen) — second init-container `bootstrap`** after `migrate`, gated by `.Values.bootstrap.enabled`, command `["npx","tsx","packages/db/src/bootstrap-pg.ts"]`. Init-containers run sequentially in order, so `migrate` (tables) completes before `bootstrap` (rows). Mirrors the existing migrate container's env/volumes/securityContext exactly.
- Trade-off: a few lines of chart duplication.
- Reason: clean separation; a bootstrap failure is its own `Init:Error`; matches the concept's "migrate then bootstrap, separate ordered steps."

---

## Phase 2 — Acceptance criteria → verification

| # | AC (from spec) | Verification method |
|---|---|---|
| AC1 | Fresh desktop has complete factory layer (system identities, facilitators, soul templates, factory principle) without manual step | **Integration test** (`factory-bootstrap.integration.test.ts`): run `applyFactoryBootstrap(db)` on empty PGlite, assert rows: `system:propagation` exists; ≥1 `seed-agent-pf-*` per community; `soul_template:<role>` keys present for templated roles; `seed-ki-1` with `scope_kind="factory"`. Plus a desktop boot unit test asserting `bootLocalMode` calls bootstrap after migrate (mock `applyFactoryBootstrap`, assert call order). |
| AC2 | Fresh shared backend has same layer; re-apply changes nothing (idempotent) | **Integration test**: call `applyFactoryBootstrap(db)` twice; snapshot all factory tables after run 1 and run 2; assert deep-equal (row counts + values identical). Covers PG semantics via the PG test fixture. |
| AC3 | User's own team + automation (roster + built-in routines) created at team creation, owned by that team's own agents, local + shared | **Integration test** hitting `POST /api/teams` with `functions:["development","product"]`: assert team + `team_members` + roster agents exist with this team's `team_id`; assert 5 `routines` rows with `owner_agent_id ∈ roster agentIds`. **FK assertion (Finding 2):** assert each provisioned routine's `routines.team_id` equals the returned `teams.id` (NOT the `team_members.id`) and that the FK resolves (insert succeeded → no FK violation). Same assertion via the `create_team` skill-tool test. **Per-team non-collision (Finding 4):** run a second `create_team` against a DB already holding the first team's routines and assert the second team gets its own 5 routines (10 total, no silent zero) — proves the per-team id scheme. |
| AC4 | Real user's DB (desktop or shared) contains no demo/example team/user/agent | **Integration test**: after `applyFactoryBootstrap(db)` only (no demo helper), assert `teams` count = 0, no `users` row with `kind="human"`, no `seed-product-1`/`Acme`/demo-agent rows. **Import guard** (lint rule / grep script): the demo fixture `packages/db/src/demo-fixture.ts` may be imported ONLY by an explicit allowlist; importing it from any other source file fails the guard. **Allowlist (permitted importers):** `packages/db/src/setup-cli.ts` (the sanctioned demo caller — imports `seedDemoWorld` behind the `--demo` flag) and the test files that seed a demo world. **Forbidden set (the four pure-production paths that must NEVER import `demo-fixture`):** `packages/db/src/seed-pg-cli.ts`, `packages/db/src/bootstrap-pg.ts`, `packages/db/src/factory-bootstrap.ts`, and the deploy entrypoint (`packages/db/src/migrate-pg.ts` / chart bootstrap command). State the allowlist explicitly so `setup-cli`'s conditional `--demo` import is not a false positive. |
| AC5 | Bet→review never fails because propagation/review-thread system identity missing | **Integration test**: bootstrap a fresh DB (no demo), drive a bet into `review`, assert the review thread authored by `system:propagation` is created (no FK error). Reuses existing lifecycle-propagation fixture. |
| AC6 | Zero "Nimmly" anywhere (code/seed/tests/stories/docs/design-mockups); remaining example data uses neutral fictional name | **Guard script** `scripts/nimmly-guard.ts` (`--check`): case-insensitive `rg "nimmly"` over the repo excluding **only** `node_modules`, `.pipeline/work-packages/` (the spec), `docs/archive/` (superseded history), and the guard script itself; exit non-zero on any hit. The guard does **NOT** exclude `packages/design-system/html` — the four L11 mockups (5 hits) are live design assets and MUST be purged so the guard stays clean over them. The "files to clean" therefore include `packages/design-system/html/L11-*/mockup.html` and `.claude/skills/design/SKILL.md` (see task 11 for the full set). Wired into `npm run verify` (the `verify` script string — see task 12). A unit test asserts the guard exits non-zero on a planted fixture string and zero on clean input. |

---

## Type signatures / contracts

```ts
// packages/db/src/factory-bootstrap.ts
export async function applyFactoryBootstrap(db: HyperIdleDb): Promise<void>;

// packages/db/src/demo-fixture.ts  (test + setup-cli demo only)
export async function seedDemoWorld(db: HyperIdleDb): Promise<{ teamId: string; founderId: string }>;

// packages/fabric/src/services/builtin-routines.ts  (reshaped)
interface BuiltinSpec {
  readonly id: BuiltinRoutineId;
  readonly name: string;
  readonly ownerRole: UserRole;          // NEW — replaces hardcoded ownerAgentId
  readonly triggerType: "heartbeat" | "calendar" | "event";
  readonly triggerConfig: Record<string, unknown>;
  readonly skillId: string;
  readonly doneCondition: string;
  readonly humanReview: boolean;
  readonly silent: boolean;
}
export async function provisionTeamRoutines(
  db: HyperIdleDb,
  opts: {
    teamId: string;        // teams.id — for routines.team_id FK. NOT team_members.id.
    ownerByRole: Partial<Record<UserRole, string>>;  // role → users.id (roster agent)
    leadAgentId: string;   // users.id of the team lead (owner fallback)
  },
): Promise<void>;
// (replaces seedBuiltinRoutines(db, teamId="prod-1"))
// Routine ids are derived per-team (see §A) so a second team does not collide.

// packages/db/src/bootstrap-pg.ts  — CLI: connects via DATABASE_URL, calls applyFactoryBootstrap, exits.
```

`seed-pg-cli.ts` and `setup-cli.ts applyLaptopMigrations` switch from `seed(db)` to `applyFactoryBootstrap(db)` (+ optional `seedDemoWorld` only behind a `--demo` flag in setup-cli). `packages/db/src/index.ts` exports `applyFactoryBootstrap` (and removes/retains `seed` per knip).

---

## Ordered tasks (three sub-batches)

### Batch 1 — Seed split + factory-bootstrap wiring (desktop + deploy)
1. Create `packages/db/src/factory-bootstrap.ts` with `applyFactoryBootstrap` (factory rows only; move `stripFrontmatter`/`readSoulTemplate`). **Test:** AC1, AC2 integration tests (red first).
2. Create `packages/db/src/bootstrap-pg.ts` CLI (mirror `seed-pg-cli.ts`). Export `applyFactoryBootstrap` from `index.ts`.
3. Wire desktop: in `packages/desktop/src/main.ts bootLocalMode`, after `runMigrationsWithRetry`, call `applyFactoryBootstrap` against the PGlite handle. **Test:** boot-order unit test (AC1).
4. Wire deploy: `chart/values.yaml` add `bootstrap.enabled:true` + `bootstrap.command`; `chart/templates/deployment.yaml` add a second init-container `bootstrap` after `migrate`. Add `package.json` script `db:bootstrap:pg`. **Verify:** `helm template` renders both init-containers in order (lint/template check).
5. Update `seed-pg-cli.ts` + `setup-cli.ts` to call `applyFactoryBootstrap` (laptop: bootstrap always; demo gated by `--demo`). Update `docs/deployment/shared-backend.md` migrate→bootstrap note (already drafted in concept) and `setup-cli` usage text.

### Batch 2 — Per-team routine + roster provisioning
6. Reshape `fabric/builtin-routines.ts`: `BuiltinSpec.ownerRole`; add `provisionTeamRoutines` with the **per-team id scheme** (§A); update `runBuiltinRoutine` + `isBuiltinRoutineId` to dispatch/guard on the **kind prefix** of the stored id (§A dispatch ripple), and update the two callers `fabric/routine-scheduler.ts` (L618-630) + `server/routines-routes.ts` (L559-574) to the kind-prefix guard. The post-bet-retro event path must resolve the team-scoped routine row before calling `runBuiltinRoutine`. Delete `seedBuiltinRoutines`. **Test:** AC3 (routine owners resolve to roster; per-team non-collision); `protectedTests` dispatch tests stay green.
7. Delete `seed-fixtures.ts BUILTIN_ROUTINE_SEEDS` (single source now in fabric); keep `PRACTICE_COMMUNITIES`/`COMMUNITY_DISPLAY_NAMES`/`FACILITATOR_TOOLS` (used by factory bootstrap). Delete the `seed.ts` builtin-insert loop.
8. Call `provisionTeamRoutines` in `teams-routes.ts` POST `/` (after L424) and in `create-team.ts` (after roster loop), building `ownerByRole` from the created roster. **Test:** AC3 via both paths (integration + skill-tool test).
9. Confirm onboarding still sole creator of team/human/assistant (concept hard-rule 2) — no seed path creates a user-facing team. **Test:** AC4 (bootstrap-only DB has 0 teams, 0 humans).

### Batch 3 — Nimmly purge + guard
10. Create `packages/db/src/demo-fixture.ts seedDemoWorld` (Acme team + demo founder + demo agents + daily-digest trio). Rename all ids to `demo-*`/`Acme`. Wire into `setup-cli --demo` + the db integration tests that needed `teams`/`team_members` rows.
11. Purge "Nimmly" across the **complete live-hit set** (fresh `grep -ril nimmly` excluding `node_modules`, `.git`, and the two guard-excluded paths `.pipeline/work-packages/` + `docs/archive/`). The purge batch MUST touch every one of these files (replace with `Acme` or generic phrasing):
    - **db:** `packages/db/src/seed.ts` (deleted/emptied), `packages/db/src/seed-fixtures.ts`, `packages/db/src/__tests__/seed.integration.test.ts`, `packages/db/src/__tests__/schema.integration.test.ts`, `packages/db/src/__tests__/U1-schema-migration.integration.test.ts`, `packages/db/src/__tests__/X3-agent-config.integration.test.ts`.
    - **fabric:** `packages/fabric/src/services/builtin-routines.ts` (owner now role-based).
    - **eval:** `packages/eval/src/seeding.ts` (`seed-agent-pm-nimmly`→`demo-agent-pm`, "Nimmly Product Manager"→"Acme Product Manager"). _(Note: `eval/scenarios/builtin-routines.ts` references `seedBuiltinRoutines` but holds no literal "Nimmly" string — covered by the rename in §Migrations, not the purge grep.)_
    - **server tests:** `packages/server/src/__tests__/builtin-routines.integration.test.ts`, `af9-attention-population.integration.test.ts`, `af9-promotion-routine.integration.test.ts`, `git-export.integration.test.ts`.
    - **web tests/stories/e2e:** `packages/web/src/settings/SettingsAgents.stories.tsx`, `packages/web/src/settings/__tests__/X3-SettingsAgents.test.tsx`, `packages/web/e2e/L16-bet-pitch.spec.ts`, `packages/web/e2e/L17-cost-tokens.spec.ts`, `packages/web/e2e/L21-coc-overlay.spec.ts`, `packages/web/e2e/bet-description-edit.spec.ts`.
    - **design-system mockups (CRITICAL — not archive, guard must stay clean over them):** `packages/design-system/html/L11-approved/mockup.html`, `packages/design-system/html/L11-thread-flow/mockup.html`, `packages/design-system/html/L11-message-card/mockup.html`, `packages/design-system/html/L11-anchored-strip/mockup.html` (5 hits total — "Pricing overhaul (Nimmly)" / `host-banner__title` / `thin-header__host` → "Pricing overhaul (Acme)").
    - **skill doc:** `.claude/skills/design/SKILL.md` (one illustrative "Nimmly" example string → neutral phrasing; not excluded by the guard).
    - **non-archive docs:** `docs/architecture/deployment-architecture.md`, `docs/architecture/data-flow-examples.md`, `docs/guides/user/getting-started.md`, `docs/human-interface-layer/content-examples-for-design-reference.md`, `docs/human-interface-layer/interaction-cadences-notification-discipline.md`, `docs/information-architecture/knowledge-view.md`, `docs/information-architecture/work-view.md`, `docs/knowledge-architecture/the-facilitators-the-most-undervalued-role-in-the-factory.md`, `docs/knowledge-architecture/the-five-layers.md`, `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md`, `docs/process-layer/handoff-the-coordination-primitive.md`, `docs/product/how-knowledge-compounds.md`, `docs/product/how-work-flows.md`, `docs/product/human-ai-collaboration.md`, `docs/product/vision-gap-audit.md`, `docs/product/what-is-hyperidle.md`.
12. Create `scripts/nimmly-guard.ts` (`--check`) + a `package.json` script `"nimmly-guard:check": "npx tsx scripts/nimmly-guard.ts --check"` (mirrors `mock-inventory:check`). **Exact `verify` edit:** the `verify` script string becomes `… && npm run mock-inventory:check && npm run nimmly-guard:check && npm run build && …` — insert `&& npm run nimmly-guard:check` immediately after `mock-inventory:check`. (Static guard belongs in `verify`, which runs no tests; the AC behavioral tests run under `test`/`test:integration`, not `verify`.) The guard's own **planted-fixture unit test** (AC6: exits non-zero on a planted "nimmly" string, zero on clean input) lives under `test` (runtime behavior of the guard fn). **Test:** guard unit test (AC6). Update `mock-data-policy.md` to name Nimmly as banned and `Acme` as the sanctioned fictional name.

---

## Migrations (rename/move call-sites)

- `seed()` removed → callers updated: `seed-pg-cli.ts`, `setup-cli.ts`, `index.ts`, **and all `__tests__` importing `seed`**: `db/__tests__/seed.integration.test.ts`, `seed-then-migrate.integration.test.ts`, `X3-agent-config.integration.test.ts`, `U1-schema-migration.integration.test.ts`, `setup-cli.test.ts`, `schema.integration.test.ts`, plus `eval/runner.ts`, `eval/scenarios/poc-session-notes.ts`. Each: switch to `applyFactoryBootstrap` (+ `seedDemoWorld` where a team row was assumed).
- `seedBuiltinRoutines` → `provisionTeamRoutines`: **verified by grep — there is NO production caller today.** `seedBuiltinRoutines` is reachable in prod only through the now-deleted `seed.ts` builtin loop (which inlines the spec, never calls the fabric fn). Its only non-test references are: the re-export in `fabric/index.ts` (L37), `eval/seeding.ts` (doc comment + FK stub), `eval/scenarios/builtin-routines.ts`, and the integration tests `server/__tests__/builtin-routines.integration.test.ts`, `af9-attention-population.integration.test.ts`, `af9-promotion-routine.integration.test.ts`. → Rename to `provisionTeamRoutines`, update the `fabric/index.ts` re-export, update the eval scenarios + those three test files to pass `{teamId, ownerByRole, leadAgentId}`. **The two NEW production call sites are the team-creation seams in Batch 2** (`teams-routes.ts` POST, `create-team.ts`) — they did not previously call any per-team routine seeder.
- `seed-agent-pm-nimmly` id (eval stub + spec owners) → removed from factory; eval stub renamed `demo-agent-pm`. Update `eval/seeding.ts`, `eval/scenarios/builtin-routines.ts`.
- `BUILTIN_ROUTINE_SEEDS` deleted → no importers outside `seed.ts`.

## protectedTests
- `packages/server/src/__tests__/lifecycle-propagation*.integration.test.ts` (AC5 — propagation identity must keep passing).
- `packages/server/src/__tests__/builtin-routines.integration.test.ts` (routine dispatch behavior unchanged; only owner-resolution shape changes — assertions on *firing* must not weaken).
- `packages/db/src/__tests__/foreign-keys.integration.test.ts` (FK integrity).

## sharedFiles
`packages/db/src/seed.ts`, `packages/db/src/index.ts`, `packages/db/src/seed-fixtures.ts`, `packages/server/src/routes/teams-routes.ts`, `packages/server/src/skill-tools/create-team.ts`, `packages/fabric/src/services/builtin-routines.ts`, `packages/fabric/src/services/routine-scheduler.ts` (kind-prefix dispatch guard — §A), `packages/server/src/routes/routines-routes.ts` (kind-prefix dispatch guard — §A), `packages/eval/src/seeding.ts`, `chart/values.yaml`, `chart/templates/deployment.yaml`, `package.json`, `docs/deployment/shared-backend.md`, `docs/guides/developer/mock-data-policy.md`.

## route-checklist (team-creation seam — built-in routine provisioning must reach every path that creates a team)
- `POST /api/teams` — `packages/server/src/routes/teams-routes.ts` L320 — add `provisionTeamRoutines`. **Pass `teams.id`** (the `teamId` local) as `opts.teamId`, NOT the `team_members.id` (membership row). `ownerByRole`/`leadAgentId` are `users.id` values from the just-created roster.
- `create_team` skill tool — `packages/server/src/skill-tools/create-team.ts` handler — add `provisionTeamRoutines`. Same id discipline: `opts.teamId = teams.id`; owners = roster `users.id`.
- (No other team-creating writer — **verified**: `team-management.ts createTeam` is a low-level membership helper; its only importer is `team-management.integration.test.ts` (zero production callers). Not a third hidden seam.)

## Security & abuse cases
- **Rate-limit on POST:** `POST /api/teams` already idempotent (returns existing team if any) — bounded to one team at setup; no new unbounded write. N/A (existing guard).
- **Input-trust boundary:** `functions[]` is user-supplied → already validated via `defaultRoster` (rejects empty roster, L349). Built-in routine `triggerConfig` is server-authored constants, not user input. Addressed.
- **Secret-handling:** `bootstrap-pg.ts` reads `DATABASE_URL` only (same as `migrate-pg.ts`); no new secret surface. Addressed.
- **Path-traversal:** `readSoulTemplate` reads fixed `docs/souls/<role>.md` from a closed role list — no user path. Addressed.
- **SSRF:** no outbound URL. N/A.
- **Idempotency abuse (deploy):** bootstrap runs per rollout; idempotent upserts mean a re-run cannot duplicate or corrupt. Covered by AC2.

---

## Risks / ambiguities (builder must know)

1. **`docs/archive/` and `.pipeline/work-packages/` retain "Nimmly".** The AF17 spec text itself names Nimmly (it's describing the purge), and archive is superseded history. The guard **excludes** both — purging the spec would corrupt the workpackage record, purging archive is churn with no value. AC6 says "code, seed, tests, stories, or docs" — interpret `docs` as **non-archive** docs. State this exclusion in the guard's comment.
2. **Two duplicate built-in spec copies collapse to one.** This is a structural change beyond a pure purge; it deletes the `seed.ts`↔`seed-fixtures.ts` sync-comment debt. If the builder hits unexpected importers of `BUILTIN_ROUTINE_SEEDS`, fall back to keeping the db copy but re-pointing owners — but prefer the single source.
3. **Existing seed integration tests assume `teams`/`team_members` rows** ("≥1 row per major table"). After the split those are demo/test concern — migrate the assertion to call `applyFactoryBootstrap` + `seedDemoWorld`, or split into "factory tables" vs "world tables." Do NOT weaken the factory-table assertions.
4. **`seed-agent-cos` keeps its id but is "System Agent" / individual category.** It is genuinely factory (the system-assistant singleton + owner of nothing team-scoped after the split). Confirm no built-in routine still references it as owner (post-bet-retro/portfolio moved to role resolution).
5. **Owner fallback when a team lacks a role.** A `marketing`-only team has no `product_manager`; `provisionTeamRoutines` must fall back to `leadAgentId` (always present). Test this path.
6. **`createTeam` in `team-management.ts`** is a separate low-level helper — verify it isn't a third hidden team-creation path that would silently skip routine provisioning. If a production caller exists, route it through the provisioner too.

---

## Definition of done
`npm run check` + `npm run lint` + `npm run test` + `npm run test:integration` green; `npm run verify` passes (now includes `nimmly-guard:check`); `rg -i nimmly` over the repo (excluding archive + work-packages + guard) returns zero; AC1-AC6 tests green.
