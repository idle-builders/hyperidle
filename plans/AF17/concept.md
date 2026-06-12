# AF17 — Concept: Factory Bootstrap layer

**Workpackage:** AF17 — Seed factory split and Nimmly purge
**Phase:** 1 (concept). Skip `/design` (no UI surface).
**Load-bearing noun:** **Factory bootstrap** (a reshape of today's monolithic `seed()`).

---

## Required reading (downstream `/architecture` + `/pipeline`)

- `.pipeline/work-packages/TRACK-AF.md` § AF17 — ACs, contracts, out-of-scope, Plan calls.
- `packages/db/src/seed.ts` — the welded monolith to split.
- `packages/db/src/seed-fixtures.ts` — `BUILTIN_ROUTINE_SEEDS`, `PRACTICE_COMMUNITIES`, `FACILITATOR_TOOLS` (one of two duplicate built-in routine spec copies).
- `packages/db/src/setup-cli.ts` (`applyLaptopMigrations` calls `seed()`), `packages/db/src/seed-pg-cli.ts`.
- `packages/desktop/src/migrate.ts` (`runMigrations` — "Does NOT seed") + `packages/desktop/src/main.ts` (`runMigrationsWithRetry`, boot sequence ~L406-428).
- `packages/server/src/routes/users.ts` (`createUserSetupRoute` — creates human + assistant), `packages/server/src/skill-tools/create-team.ts` (`create_team` tool — creates team + roster + soul prompts, does NOT create routines today).
- `packages/server/src/services/team-management.ts` (`createTeam` membership helper).
- `packages/fabric/src/services/builtin-routines.ts` (`seedBuiltinRoutines(db, teamId)` — the parameterized per-team provisioning hook; second duplicate spec copy `BUILTIN_SPECS`).
- `packages/eval/src/seeding.ts` (`seedBuiltinAgents` — eval stubs with hardcoded `seed-agent-*` ids).
- `chart/templates/deployment.yaml` (migrate init-container), `.github/workflows/deploy.yml`, `packages/db/src/migrate-pg.ts`.
- `docs/deployment/shared-backend.md` (§ "Provisioning vs Deploy" — the seam belongs here), `docs/guides/developer/mock-data-policy.md` (seed bootstrap is a permitted-mock surface), `docs/agent-layer/agent-identity.md` (soul templates seeded into `factory_settings`).

**No existing concept doc defines "factory bootstrap" as a primitive.** `docs/deployment/shared-backend.md` already separates *provisioning* (one-time) from *deploy* (every release) and asserts "A Deploy never provisions"; AF17 adds an idempotent factory-bootstrap step that runs on every deploy/launch — that is a refinement, not a contradiction. Surface for `/architecture`: the deploy table must gain a third column/row.

---

## Phase 0 — Identify the thing

| Noun | Working definition | Classification |
|---|---|---|
| **Factory bootstrap** | The team-agnostic baseline rows every HyperIdle environment needs to function — system identities, facilitator agents, soul-prompt templates, the factory principle, factory cost settings. Applied idempotently at desktop launch and on every shared-backend deploy. | **New primitive** (carved out of `seed()`) |
| **Team provisioning** | The rows created when a *user's own team* is created at onboarding — agent roster (from team functions), per-agent soul prompts, and the team's built-in routines. Owned by that team. | **Reshaped** (today welded into `seed()` + partially in `create_team`; built-in routines not yet team-provisioned) |
| **Test/demo fixture** | Example world-state inserted only by tests, stories, e2e, and `setup-cli` demo mode, under a neutral, clearly-fictional name. Never reaches a real user's DB. | **Reshaped** (today the "Nimmly" demo is welded into the production seed) |
| `seed()` | The current monolithic function. | Dissolved — replaced by the three above. |
| Facilitator / system identity / soul template / factory principle | Existing stable concepts (`docs/agent-layer/agent-identity.md`). | **Stable** — inputs; factory bootstrap is their *delivery mechanism*. |

Only the first three nouns enter the rest of this doc.

---

## Phase 1 — Probe the essence

### Factory bootstrap

1. **Identity.** Factory bootstrap is an **idempotent baseline-write operation** (a verb that produces a fixed row-set), not a team and not demo data. It is the set of rows that are true for *any* HyperIdle instance regardless of who uses it. My read: a pure function `(db) → void` that upserts a closed, team-agnostic row-set.
2. **Essential properties.** Every factory-bootstrap row is (a) **team-agnostic** — `team_id` is `null` or absent, no FK to any user-facing team; (b) **idempotent** — re-applying writes the same values (`onConflictDoNothing` / `onConflictDoUpdate`); (c) **not user-facing as an identity** — system/strategy/individual-singleton agents, never a "Founder" human or a named product team; (d) **environment-independent** — identical on desktop (PGlite) and shared backend (Postgres).
3. **Rejection list** — see Phase 2.
4. **Composition.** Factory bootstrap inserts into: `users` (system + facilitator + system-assistant agents — all with `team_id = null`), `factory_settings` (cost cap/cycle + `soul_template:<role>`), `knowledge_items` + `knowledge_strategy_fabric` (the `scope_kind="factory"` principle). It does **not** touch `teams`, `team_members`, `bets`, `tasks`, or `routines`.
5. **Lifecycle.** No state machine. One transition: *absent → present*. Re-application is a no-op. There is no "un-bootstrap."
6. **Authority.** Owned by the platform/factory, not by any team or user. Source of truth = the bootstrap function in `@hyperidle/db`. The desktop main process and the deploy pipeline are its only two callers in production; `setup-cli` calls it for the laptop profile.
7. **Vocabulary collision.** "Factory" already names a scope (`scope_kind="factory"`, `factory_settings`) and the company-as-a-whole metaphor across docs — **consistent**, no collision. Distinguish from `factoryDbPath` (a per-team column, unrelated — a repo path). "Bootstrap" is new and unused elsewhere.

### Team provisioning

1. **Identity.** The per-team **creation effect**: given a team's id + functions, produce its agent roster, their soul prompts, and its built-in routines.
2. **Essential properties.** Every team-provisioned row carries a real `team_id`; owner agents are that team's own agents. The roster is derived from `teams.functions` via the shared `defaultRoster` catalog. Built-in routines are owned by team-scoped/strategy agents that exist *in that team's roster*.
3. **Rejection list** — see Phase 2.
4. **Composition.** Inserts into `teams`, `team_members`, `users` (the roster), and `routines` (the team's built-ins). Reads `factory_settings` (`soul_template:<role>`) — so factory bootstrap must run **before** the first team is provisioned.
5. **Lifecycle.** Tied to team lifecycle: created at onboarding/`create_team`, dissolved with the team.
6. **Authority.** Owned by **onboarding** (the sole creator of a user's team/human/assistant) and the `create_team` skill tool. The seed never creates a user-facing team.
7. **Vocabulary collision.** `createTeam` exists twice: `team-management.ts` (`team_members` membership helper) and `create-team.ts` (skill tool that also builds the roster). Built-in routine provisioning attaches to the **skill tool / onboarding path**, not the low-level membership helper. Call it out in `/architecture`.

### Test/demo fixture

1. **Identity.** Example world-state for tests and demo, never a production row.
2. **Essential properties.** Lives only in the permitted-mock surface (`__tests__`, `*.spec`, `*.stories`, `e2e`, `seed*` files, `setup-cli` demo path). Uses a **neutral, clearly-fictional name** — never "Nimmly" (a real, separate product).
3. **Rejection / authority / lifecycle** — see Phase 2; owned by test authors / `setup-cli` demo mode; ephemeral.

---

## Phase 2 — Rejection list

### Factory bootstrap is NOT…

- **…demo or example data.** Because a real user's DB must contain only the factory baseline + their own team — never a second product's rows (AC4). The "Nimmly" team, "Founder" human, demo builder/PM agents, and the daily-digest bet/task/routine are demo, not factory: they go to the test/`setup-cli` surface, not bootstrap.
- **…a team.** Because factory rows are team-agnostic; the moment a row carries a user-facing `team_id` it is team provisioning, not factory. Hard consequence: built-in routines (`routines.team_id` + `routines.owner_agent_id` are **NOT NULL**) **cannot** be factory-level and must be created at team-creation time.
- **…user-facing identities.** Because the human founder and the per-user assistant are created by onboarding (`createUserSetupRoute`), never seeded. Factory agents are system (`system:propagation`), strategy (facilitators), and the system-assistant singleton — none of which represent a named human or a named team.
- **…schema migration.** Because migrations create *tables* (additive DDL, already owned by `migrate-pg.ts` + desktop `migrate.ts`); bootstrap inserts *rows*. The deploy runs migrate (init-container) then bootstrap as separate, ordered steps.
- **…the daily-digest bet/task/routine.** That trio is demo scaffolding bound to the demo team — it leaves the production path entirely.

### Team provisioning is NOT…

- **…factory bootstrap.** Because it is per-team and team-scoped; it runs once per team, not once per environment.
- **…done by the seed.** Onboarding/`create_team` owns it. The seed must never create a user-facing team, in local or shared mode.
- **…limited to the roster.** Built-in routines move here too (they need a real `team_id` + a real owner agent from this team's roster), reversing today's hard-wiring to `seed-product-1` / `seed-agent-*`.

### Test/demo fixture is NOT…

- **…allowed in any production seed path.** Because AC4 forbids demo rows in real DBs and the mock-data policy already scopes bootstrap seeds to "the system of record itself," not example content.
- **…named "Nimmly."** Nimmly is a real, separate product (per the Nimmly-purge directive, same class as Rail/CoC). Example data uses a neutral clearly-fictional name (e.g. `Acme`, `Demo Co`, `Test Team` — `/architecture` picks one and pins it).

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Factory bootstrap** | Idempotent, team-agnostic baseline row-set applied at desktop launch + every deploy. | "the seed", "seed data", `seed()` (the old monolith), "factory seed" |
| **Team provisioning** | Per-team rows (roster + soul prompts + built-in routines) created at team creation, owned by that team. | "seed the team", "team seed", "roster seed" |
| **Test/demo fixture** | Example world-state confined to tests / stories / e2e / `setup-cli` demo. | "demo seed", "sample data", anything named **Nimmly** |
| **(banned) Nimmly** | A separate product. Zero occurrences anywhere — code, seed, tests, stories, docs. | n/a — purge entirely |

Canonical operation name for `/architecture` to lock: prefer **`applyFactoryBootstrap(db)`** (verb + noun, idempotent) over re-using `seed`. The word `seed` may survive only in the test/demo fixture surface and the `setup-cli` demo helper.

---

## Phase 4 — Contracts

- **Cardinality.** Factory bootstrap: exactly one row-set per environment (singleton). Team provisioning: one row-set per team. Test/demo fixture: 0..N, only outside production paths.
- **Closure.** The factory row-set is **closed** — adding a factory row requires editing the bootstrap function (and this doc's composition list). The built-in routine spec is closed and currently **duplicated** across `db/seed-fixtures.ts` and `fabric/builtin-routines.ts`; `/architecture` must decide whether AF17 deduplicates (single source) or leaves the sync-comment pattern — but it must **re-point owners away from the demo team**.
- **Mutability.** Factory rows are upserted idempotently; `soul_template:<role>` uses `onConflictDoUpdate` (re-reads docs/souls), the rest `onConflictDoNothing`. Re-running mutates nothing observable (AC2 idempotency).
- **Identity.** Factory rows use stable, non-UUID ids (`system:propagation`, `seed-agent-pf-<community>`, the system-assistant id, `soul_template:<role>` keys). These ids are FK targets the rest of the system depends on — **do not rename them** (renaming `seed-agent-pm-nimmly` is in-scope only for the Nimmly purge, and ripples to both spec copies + eval stubs + the agent that owns `builtin:post-bet-retro`). Team-provisioned rows use generated UUIDs **with one exception: built-in routines use a deterministic team-scoped id `builtin:<kind>:<teamId>`** (not an opaque UUID), because the routine dispatcher recovers the routine *kind* from the stored id (`runBuiltinRoutine` / `isBuiltinRoutineId` switch on the kind prefix). A global `builtin:<kind>` id would collide across teams (second team gets zero routines); a pure UUID would lose the dispatch-key kind. `/architecture` locks the exact id scheme + the dispatch-guard change.
- **Hard rules.**
  1. **No team_id on factory rows.** A factory row with a user-facing `team_id` is a concept violation.
  2. **The seed never creates a user-facing team, human, or assistant** — onboarding owns those (local + shared).
  3. **Built-in routines are team-provisioned, never factory** (NOT NULL `team_id` + `owner_agent_id`).
  4. **Factory bootstrap is idempotent** — safe on every desktop launch and every deploy.
  5. **No demo/example data in any production seed path**; example data only in the permitted-mock surface under a neutral fictional name.
  6. **Zero "Nimmly" occurrences** repo-wide; a guard prevents reintroduction.

---

## Phase 5 — The three-way boundary (the locked decision)

| Layer | What | Where it runs | team_id? | Idempotent? |
|---|---|---|---|---|
| **(a) Factory bootstrap** | `system:propagation`; system-assistant singleton; facilitator agents per community of practice; `soul_template:<role>` settings; `cost_cap`/`cost_cycle`; the `scope_kind="factory"` principle (`knowledge_items` + `knowledge_strategy_fabric`). | Desktop launch (main process, after migrate) **and** every shared-backend deploy (new bootstrap step after the migrate init-container). `setup-cli` laptop profile. | **No** (null) | **Yes** |
| **(b) Team provisioning** | The team row + `team_members`; the agent roster (from `teams.functions` via `defaultRoster`); per-agent soul prompts; the team's **built-in routines** (`practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion`) owned by this team's own agents. | Onboarding (`createUserSetupRoute` creates human+assistant; `create_team` creates team+roster) — in **both** local and shared mode. | **Yes** | New team each time; routine insert idempotent per team |
| **(c) Test/demo fixture** | The "Nimmly"→neutral demo team, a demo founder, demo builder/PM agents, the daily-digest bet/task/routine, the `seedBuiltinAgents` eval stubs. | Tests / stories / e2e / `setup-cli` demo mode only. | n/a | n/a |

**The single hard constraint that forces this split:** `routines.team_id` and `routines.owner_agent_id` are NOT NULL → built-in routines **cannot** live in (a); they must be (b), created when the team and its roster exist.

**Where the existing factory principle (`seed-ki-1`) and `factory_settings` rows sit:** (a) — they are genuinely environment-wide and already `scope_kind="factory"`.

---

## Phase 6 — Self-critique

- **Rejection list distinct?** Yes — "not demo data," "not a team," "not user-facing identities," "not migration," "not the daily-digest trio" are five genuinely different rejections, each with a hard consequence (the routine NOT-NULL constraint is the load-bearing one).
- **Term collision?** `grep` confirms "factory" is already used consistently (`factory_settings`, `scope_kind="factory"`); `factoryDbPath` is the only near-miss and is clearly a per-team repo path, not the bootstrap. No collision.
- **Contracts complete?** Cardinality, closure, mutability, identity, and six hard rules are all pinned. The one open implementation question — deduplicate the two built-in-routine spec copies vs keep the sync-comment — is correctly deferred to `/architecture` (it is a structure decision, not a concept decision).
- **Rationale concrete?** Yes — driven by a real bug (desktop skips the seed → missing facilitators/routines/soul-templates and a `system:propagation` FK failure on bet→review), a real cross-product contamination ("Nimmly" in the production seed), and a hard schema constraint (routines NOT NULL).
- **Right files touched?** Concept → `plans/AF17/concept.md`. Ground truth → `docs/deployment/shared-backend.md` gains a factory-bootstrap row in the Provisioning-vs-Deploy table; `docs/guides/developer/mock-data-policy.md` already covers the demo-fixture rejection (no change needed beyond noting Nimmly is banned). `/architecture` will reference these.

**Concept is LOCKED.** Downstream explores *inside* this boundary; it does not re-litigate which rows are factory vs team vs fixture.

---

## Rationale (for future agents)

Today `seed()` welds three different things into one function because, historically, there was one environment (the dev laptop) where "the seed" meant "make the app demoable." The shared backend and the real desktop user broke that assumption: the desktop must boot with the factory layer but **without** demo data, and the shared backend must apply the factory layer on deploy. The split exists so that "what every instance needs" (factory bootstrap), "what a user's team needs" (team provisioning), and "what a demo/test needs" (fixture) can each run in exactly the environments where they belong — and so a real user never sees another product's rows. "Nimmly" is purged because it is a different, real product that was accidentally smeared across the codebase as placeholder demo content.
