# AF17 — Code Review (Phase 4)

**Reviewer:** reviewer persona (Phase 2 critique context carried forward).
**Diff:** `git diff origin/main...HEAD` on `feat/AF17-seed-factory-nimmly-purge` (PR #266).
**Verify:** GREEN — `npm run verify` exit 0, 2782 passed / 6 skipped, attestation status=passed.
**Verdict:** **NOT DONE.** One CRITICAL contract violation (seed not split → AC4 guard never built), plus a CRITICAL doc-describes-nonexistent-behavior (`--demo`), plus error-swallowing on the AC3 production seams.

Verify being green does NOT prove the ACs — the builder deferred the seed split and the `--demo` implementation, and the test suite was left pointed at the OLD demo path. The deferrals leave AC4 only partially proven and three documents lying about behavior.

---

## AC-by-AC

| AC | Met? | Proven by | Notes |
|----|------|-----------|-------|
| **AC1** — fresh desktop/env has full factory layer | **PASS** | `AF17-factory-bootstrap.integration.test.ts` (system:propagation, seed-agent-cos individual, ≥5 facilitators null team_id, soul_template:* present, cost_cap/cycle, seed-ki-1 factory + L4 principle) + desktop wiring in `main.ts bootLocalMode`. | Solid. |
| **AC2** — idempotent re-apply | **PASS** | `AF17-factory-bootstrap.integration.test.ts` AC2 block (counts equal, deep-equal soul_template + system:propagation rows after 2nd run, no throw) on the PG fixture. | Solid. |
| **AC3** — team + automation provisioned at team creation, owned by team's own agents, both seams | **PASS** | `AF17-team-routines.integration.test.ts`: 5 routines via POST `/api/teams`; FK assertion (`team_id == teams.id`, ≠ `team_members.id`); owners ∈ roster; per-team non-collision (10 rows, disjoint ids); owner fallback to lead. Both seams wired (`teams-routes.ts` + `create-team.ts`). Dispatch ripple correct: `extractBuiltinKind` used in `routine-scheduler.ts`, `routines-routes.ts`, and `registerBuiltinRoutineHandlers` (looks up `builtin:post-bet-retro:<teamId>` with legacy fallback). | Behaviorally proven. BUT both production call sites wrap `provisionTeamRoutines(...)` in `.catch(() => {})` — see CRITICAL-3: a real-world provisioning failure is silently swallowed with no signal. |
| **AC4** — real user DB has no demo/example team/user/agent | **PARTIAL / AT RISK** | `AF17-factory-isolation.integration.test.ts` proves a *bootstrap-only* DB has 0 teams, 0 humans, no seed-product-1/demo-team-acme/demo-agent/u-founder rows. Production entrypoints (`seed-pg-cli`, `bootstrap-pg`, `setup-cli`) confirmed to call only `applyFactoryBootstrap`. | The contract is met for the *current* entrypoints, but the **structural guarantee the plan required was not built** (CRITICAL-1). `seed()` still inserts the full demo world and is still exported from `index.ts`; the `demo-fixture.ts`/`seedDemoWorld` split never happened; the AC4 **import-allowlist guard does not exist**. Nothing prevents a future caller from importing `seed()` into a production path. |
| **AC5** — bet→review never fails on missing propagation identity | **PASS** | `AF17-propagation-bootstrap.integration.test.ts`: `system:propagation` present after bootstrap-only; review-thread insert authored by it resolves without FK error; PATCH bet→review returns non-500/non-422. | Solid. |
| **AC6** — zero "Nimmly" anywhere; remaining example data neutral | **PASS (with guard-scope caveat)** | `npm run nimmly-guard:check` exits 0; `grep -ril nimmly` over live code/tests/stories/non-archive docs returns only `docs/archive/` (legitimately excluded). `checkContent` unit-tested. Demo data renamed to `Acme`/`demo-agent-*`. | Guard broadened its exclusions beyond the plan (`plans/`, entire `.pipeline/`, `dist`, `build`) — see WARNING-1. Guard NAMED `nimmly-guard` is acceptable (mirrors `mock-inventory`, self-excluded). |

---

## CRITICAL

### CRITICAL-1 — Seed split deferred: demo world still lives in production `src`, AC4 import-guard never built
`packages/db/src/seed.ts` (L60-424) still inserts the full demo world: team `seed-product-1` "Acme", human `u-founder`, `seed-agent-builder`, `demo-agent-pm`, daily-digest bet/task/routine, and the `BUILTIN_ROUTINE_SEEDS` loop. The approved plan (§(c), Type signatures, Batch 3 task 10) required this to move into `packages/db/src/demo-fixture.ts` as `seedDemoWorld(db)`. **That file does not exist.** `seed()` remains exported from `packages/db/src/index.ts:118`.

The plan's AC4 verification was a two-part mechanism: (a) the isolation test (built — passes) AND (b) an **import-allowlist guard** (lint rule) so only `setup-cli` + tests may import the demo fixture, with the four production paths forbidden. Part (b) was never built because there is no `demo-fixture.ts` to guard. The contract — *"example data lives only in test / setup-cli fixtures under a neutral name"* — is **violated**: the demo data lives in a production package's `src/` (`seed.ts`), behind a function exported from the package barrel, with no static guard preventing a production import.

Severity: the demo data is currently unreachable from any production entrypoint (traced: `seed-pg-cli`, `bootstrap-pg`, `setup-cli applyLaptopMigrations` all call `applyFactoryBootstrap` only; the only importers of `seed` are db `__tests__`). So today's real DB is clean. But the structural barrier the WP exists to install is absent, so AC4 is one careless import away from regressing and nothing stops it.

**Fix:** Move the demo world out of `seed.ts` into `packages/db/src/demo-fixture.ts seedDemoWorld(db)`; delete/empty `seed.ts`; remove `seed` from `index.ts` (or re-export `seedDemoWorld`); migrate the four db tests still importing `seed` (`seed.integration`, `U1-schema-migration`, `X3-agent-config`, `AD8a-category-rename`) to `applyFactoryBootstrap` + `seedDemoWorld`; add the import-allowlist guard (lint rule or guard script) permitting `demo-fixture` import only from `setup-cli.ts` and test files, forbidding it from `seed-pg-cli.ts`/`bootstrap-pg.ts`/`factory-bootstrap.ts`/`migrate-pg.ts`.

### CRITICAL-2 — Docs describe a `--demo` flag that does not exist
Three documents now promise a `--demo` setup flag:
- `docs/guides/user/getting-started.md` — *"To start with a demo team pre-populated, add `--demo` (creates an example 'Acme' team with assistant, Product Manager, and Builder agents)."*
- `docs/guides/developer/mock-data-policy.md` — *"Setup-cli demo mode (`--demo` flag)"*.
- `packages/db/src/seed-pg-cli.ts:6` — *"For demo mode, use `npm run setup -- --demo`"*.

**`setup-cli.ts` does not implement `--demo`.** `ParsedArgs`, `parseArgs`, `USAGE`, and `runLaptop` have no `demo` handling; the `default:` case silently ignores the unknown flag, so `npm run setup -- --demo` runs a normal bootstrap and the user gets no demo team — silently. And even if parsed, there is no `seedDemoWorld` to call (see CRITICAL-1). This is a `/write-docs` rubric failure (documenting non-existent behavior) and an AI-slop tell ("for now"-style aspirational doc). A user following the getting-started guide hits a no-op.

**Fix:** Either implement the `--demo` flag in `setup-cli.ts` (parse it, call `seedDemoWorld` behind it) — preferred, since the plan scoped it — or remove all three `--demo` references until it exists. Do not ship a doc that lies.

### CRITICAL-3 — AC3 production seams swallow provisioning errors silently
Both team-creation call sites swallow every error from `provisionTeamRoutines`:
- `packages/server/src/routes/teams-routes.ts` (~L440): `await provisionTeamRoutines(...).catch(() => { /* Non-fatal: log but don't fail team creation */ })` — comment says "log" but it does NOT log.
- `packages/server/src/skill-tools/create-team.ts:149`: `.catch(() => { /* Non-fatal: don't fail tool invocation */ })`.

This violates `.claude/rules/typescript.md` ("Let unexpected errors propagate — no swallowing with try-catch") and the plan's whole point: routine provisioning is a load-bearing FK operation the plan flagged as the #1 confusion risk (`teams.id` vs `team_members.id`). If provisioning throws (FK mismatch, a future schema change, a missing roster), the team is created with **zero built-in routines and no error, no log** — exactly the silent-degradation failure mode AF17 exists to eliminate. The AC3 test only passes because the happy path succeeds; the swallow means a production failure is invisible.

**Fix:** Remove the empty `.catch()`. Let it propagate (team creation should fail loudly if its automation can't be provisioned), or at minimum log the error through the observability adapter and surface a degraded-state signal. An empty catch is not acceptable.

---

## WARNING

### WARNING-1 — nimmly-guard exclusions broadened beyond the plan
`scripts/nimmly-guard.ts` `EXCLUDED_DIR_PATTERNS` excludes the **entire `.pipeline/`** and **all of `plans/`** (plus `dist`/`build`/`.next`/desktop+design-system out). The approved plan (AC6 verification) specified excluding **only** `node_modules`, `.pipeline/work-packages/`, `docs/archive/`, and the guard file. Consequence: "Nimmly" can be reintroduced anywhere under `plans/` or `.pipeline/progress/` and the guard stays green. `grep` confirms `plans/` still contains many live nimmly hits (AA1 mockups, X8, U9, Z2, AF17). These are transient artifacts so this is not a shipped-surface leak, but it is a deviation from the locked plan that weakens the regression gate. Either narrow the exclusion back to `.pipeline/work-packages/` + the guard file (and purge `plans/` or accept it explicitly), or document the broadened scope in the plan. Build-output excludes (`dist`/`build`) are fine.

### WARNING-2 — `seed.integration.test.ts` still tests the un-split demo monolith
The test still `import { seed } from "../seed.js"` and asserts `teams`/`team_members` ≥1 (only renaming the nimmly owner id to `demo-agent-pm`). The plan (Risks §3, Migrations) required migrating this to `applyFactoryBootstrap` + `seedDemoWorld` — "do NOT weaken the factory-table assertions" but split world vs factory. As-is, the only thing proving the demo-world rows exist is a test of `seed()`, which is the function the plan said to delete. This test must move with CRITICAL-1's fix. (Same for `U1-schema-migration`, `X3-agent-config`, `AD8a-category-rename` which still call `seed()`.)

### WARNING-3 — `seedBuiltinRoutines` kept as a `@deprecated` shim instead of deleted
`packages/fabric/src/services/builtin-routines.ts:315-358` retains `seedBuiltinRoutines` (global-id, factory-agent owners) purely for test backward-compat, re-exported from `fabric/index.ts`. The plan (§A synthesis, Migrations) said **delete** `seedBuiltinRoutines` and migrate the three callers (`builtin-routines.integration`, `af9-attention-population`, `af9-promotion-routine`, eval scenarios) to `provisionTeamRoutines`. Keeping both is exactly the duplicate-spec / keep-in-sync debt AF17 was meant to remove — now there are two routine seeders with divergent id schemes (global vs per-team). Migrate the tests and delete the shim.

---

## NIT

- **NIT-1 — Dead red-phase scaffolding (AI slop).** `AF17-factory-bootstrap`, `AF17-factory-isolation`, `AF17-propagation-bootstrap`, `AF17-team-routines`, `AF17-nimmly-guard` tests all retain the `try { const mod = await import(...).catch(() => null); fn = mod?.x ?? (() => { throw "not implemented yet (red phase)" }) }` fallback with `biome-ignore noExplicitAny: Red phase — module doesn't exist yet`. The modules now exist; this is dead defensive scaffolding that should be a direct static import. It hides real import failures behind a thrown stub and litters `any`. Replace with plain `import { applyFactoryBootstrap } from "../factory-bootstrap.js"`.
- **NIT-2 — `void factoryAgentIds` dead binding.** `factory-bootstrap.ts:184-198` builds `factoryAgentIds`, never uses it for the backfill (the backfill is unscoped `WHERE role=? AND kind='ai'`), then `void factoryAgentIds` to silence the unused warning, with a comment claiming it's "conceptually used." It is not. The backfill comment claims scoping to factory agents but the query has no such filter — on a fresh DB it's harmless (only factory agents exist), but the variable + comment are misleading dead code. Delete `factoryAgentIds` and the `void`, or actually scope the UPDATE with `inArray(users.id, factoryAgentIds)` to match the comment.
- **NIT-3 — Stray compiled artifacts in `scripts/`.** `scripts/nimmly-guard.{js,js.map,d.ts,d.ts.map}` are untracked build outputs sitting in the tree; verify-attest already warns "working tree is dirty." Add them to `.gitignore` or remove — they will block the clean-tree attestation commit at ship.
- **NIT-4 — `seed.ts` comment references wrong path.** `seed.ts:400` comment points at `packages/server/src/services/builtin-routines.ts` but the specs live in `packages/fabric/src/services/builtin-routines.ts`. (Moot once seed.ts is split per CRITICAL-1.)

---

## Lens summary
- **Architecture:** FK discipline (`teams.id` vs `team_members.id`) correctly honored at both seams and asserted. Dispatch ripple (kind-prefix) correctly threaded through all 3 callers. Layer boundaries intact (db leaf, fabric per-team provisioner, server seams). Stale docs: 3 files describe `--demo` that doesn't exist (CRITICAL-2). Seed split not delivered (CRITICAL-1).
- **Design:** N/A (no UI).
- **Security:** No new attack surface. `bootstrap-pg`/`seed-pg-cli` read `DATABASE_URL` only. `readSoulTemplate` reads a closed role list (no traversal). POST `/api/teams` provisioning is server-authored constants, not user input. Empty `.catch()` is a robustness/observability defect, not a security hole.
- **Adversarial:** The Saboteur's win is CRITICAL-3 — a swallowed provisioning failure ships a team with no automation, invisibly. The New Hire trips on NIT-2 (`void factoryAgentIds` + lying comment) and the dual seeders (WARNING-3). The Auditor catches the PR/plan mismatch: "seed split" claimed by plan, not delivered.
- **Simplification:** Two routine seeders where the plan wanted one (WARNING-3). Dead red-phase import scaffolding across 5 test files (NIT-1). Dead `factoryAgentIds` (NIT-2).
- **AI Slop:** "not implemented yet (red phase)" stubs on implemented modules (NIT-1); doc text promising `--demo` "to start with a demo team" that no-ops (CRITICAL-2); comment claiming scoping that the query doesn't do (NIT-2).

**Verdict: NOT DONE.**

---

# AF17 — Code Review Round 2 (re-review of builder fixes)

**Verify:** GREEN — full `npm run verify` exit 0 (check + lint + knip + mock-inventory + nimmly-guard + demo-fixture-guard + build + desktop build + attestation). 2781 passed / 6 skipped. Attestation status=passed.
**Verdict:** **NOT DONE.** One re-opened CRITICAL: the demo-fixture import-guard's regex cannot match the only realistic forbidden import form (`"./demo-fixture.js"`), so the AC4 structural barrier is non-functional. Plus the tree is not clean (3 untracked stray progress files).

The other two CRITICALs (`--demo` flag, swallowed errors) and all WARNINGs/NITs are genuinely resolved — verified against the live diff, not prose.

## Round-1 finding disposition

| Finding | Status | Evidence |
|---|---|---|
| **CRITICAL-1** seed split + import-guard | **PARTIAL — guard defective** | Split is real: `seed.ts` is a thin wrapper (`applyFactoryBootstrap` + `seedDemoWorld`); demo world fully in `demo-fixture.ts`. Guard exists (`scripts/demo-fixture-guard.ts`) and is wired into `verify` (`demo-fixture-guard:check`). **BUT the guard regex is blind to the real attack** — see CRITICAL-1-R2. |
| **CRITICAL-2** `--demo` flag | **RESOLVED** | `setup-cli.ts` parses `--demo` (ParsedArgs.demo, USAGE line, `runLaptop`→`applyLaptopMigrations(…, args.demo)` → `if (demo) seedDemoWorld(handle.db)`). Default = factory only. `setup-cli.test.ts` grew +95 lines proving `--demo` yields the demo team and default does not (per stat). |
| **CRITICAL-3** swallowed errors | **RESOLVED** | Both empty `.catch(() => {})` blocks gone. `teams-routes.ts` L442 and `create-team.ts` L148 now `await provisionTeamRoutines(...)` bare — errors propagate (500 / tool failure). Happy path unaffected (provisioning runs inline, AC3 test green). |
| **WARNING-1** guard scope | **RESOLVED** | nimmly-guard narrows `.pipeline` → `.pipeline/work-packages` + `.pipeline/progress` only; keeps `plans/`, `docs/archive`, build outputs; scans all shipped source (packages/scripts/docs-non-archive). Documented rationale in header. |
| **WARNING-3** `@deprecated` shim | **RESOLVED** | Production `seedBuiltinRoutines` deleted from `fabric/services/builtin-routines.ts` (no `@deprecated`, not exported). Remaining refs are per-file local test helpers wrapping `provisionTeamRoutines` (per-team ids) — single seeder, no divergent-id duplicate in shipped code. |
| **NIT-1** red-phase scaffolding | **RESOLVED** | All 5 AF17 test files use static top-level imports (`import { applyFactoryBootstrap } from "../factory-bootstrap.js"` etc.). No `await import(...)`, no "not implemented yet", no `any`/`biome-ignore` scaffolding. |
| **NIT-2** `void factoryAgentIds` | **RESOLVED** | `factory-bootstrap.ts` L193 now actually scopes the backfill: `.where(and(eq(role), eq(kind,'ai'), inArray(users.id, factoryAgentIds)))`. No `void`. |
| **NIT-3** stray compiled artifacts | **RESOLVED (for scripts/)** | `scripts/nimmly-guard.{js,js.map,d.ts,d.ts.map}` no longer block — gitignored (absent from `git status`). |
| **NIT-4** stale comment | **RESOLVED** | `seed.ts` fully rewritten as wrapper; stale `packages/server/.../builtin-routines.ts` path comment gone. |

## CRITICAL-1-R2 — demo-fixture guard regex is blind to the only realistic forbidden import

`scripts/demo-fixture-guard.ts:33`:
```ts
const DEMO_FIXTURE_IMPORT_RE = /['"](\.\.\/)*demo-fixture(\.js)?['"]/;
```
This matches `"demo-fixture.js"` and `"../demo-fixture.js"` but **NOT `"./demo-fixture.js"`** — there is no alternative for a leading single-dot `./`. All four forbidden files (`seed-pg-cli.ts`, `bootstrap-pg.ts`, `factory-bootstrap.ts`, `migrate-pg.ts`) are **siblings** of `demo-fixture.ts` in `packages/db/src/`, so a real forbidden import would be `import { seedDemoWorld } from "./demo-fixture.js"` — the exact form the guard cannot see.

**Defeat test (reproduced):** planted `import { seedDemoWorld } from "./demo-fixture.js";` into both `factory-bootstrap.ts` and `seed-pg-cli.ts` (forbidden paths) — guard exited **0 / "clean"** both times. The guard does not red on the attack it exists to prevent.

Compounding: the two *permitted* importers (`setup-cli.ts:5`, `seed.ts:20`) also use `"./demo-fixture.js"`, which the regex also can't match — so the guard has effectively **zero true detection coverage** in the current layout. It passes green by never matching anything, not by enforcing the allowlist. There is also no unit test for `runDemoFixtureGuard` to have caught this.

Additional blind spots in the same regex: `"./demo-fixture"` / `"demo-fixture"` without the `.js` extension, and the workspace subpath form `"@hyperidle/db/demo-fixture"`.

**Fix:** broaden the matcher to cover the leading `./` (and ideally extensionless + workspace forms), e.g. `/from\s+['"](?:\.\.?\/)+demo-fixture(?:\.js)?['"]/` plus a `@hyperidle/db/demo-fixture` clause; then add a unit test that (a) reds on a `./demo-fixture.js` import in a forbidden path and (b) stays green for `setup-cli.ts`/`seed.ts`/test files. The fix is not done until the planted-`./`-import defeat test exits 1.

## WARNING-R2 — working tree not clean (blocks ship)

`git status` shows three untracked files: `.pipeline/progress/AD8.json`, `AE2.json`, `AE3.json`. They are not on `origin/main` (only `AD8a/b/c` are), not part of AF17's diff, and not gitignored — stray local pipeline artifacts from other workpackages. `verify-attest` already warns "working tree is dirty." Ship requires a clean tree; these must be removed (or the attestation re-run on a clean tree) before `/ship`. Not AF17-authored, but it blocks the gate. (The `.verify-attestations/*` churn is normal verify output that `/ship` commits.)

## AC-by-AC (round 2)

| AC | Met? | Notes |
|----|------|-------|
| **AC1** factory layer on fresh env | **PASS** | Unchanged — `applyFactoryBootstrap` + desktop/setup-cli wiring; integration test green. |
| **AC2** idempotent re-apply | **PASS** | Unchanged. |
| **AC3** team automation provisioned, team-owned, both seams | **PASS** | Both seams now propagate errors (CRITICAL-3 fixed). Test green. |
| **AC4** no demo data in real user DB | **PARTIAL / AT RISK** | Split delivered; demo world isolated to `demo-fixture.ts`; no production entrypoint imports it today. **BUT the import-allowlist guard is non-functional** (CRITICAL-1-R2) — it cannot detect a `./demo-fixture.js` import from a forbidden sibling, so the structural guarantee AC4 requires is not actually enforced. |
| **AC5** bet→review never fails on missing propagation identity | **PASS** | Unchanged. |
| **AC6** zero "Nimmly"; neutral example data | **PASS** | Full `verify` (incl. `nimmly-guard:check`) green; guard scope now principled (WARNING-1 fixed). |

**Verdict Round 2: NOT DONE.** Two CRITICALs and CRITICAL-3 resolved; CRITICAL-1's guard is structurally defective (re-opened as CRITICAL-1-R2) and the tree is not clean. Fix the regex + add the defeat-test, and clean the tree, then re-review.

---

# AF17 — Code Review Round 3 (FINAL — re-review of R2 fixes)

**Verify:** GREEN — full `npm run verify` exit 0 (check + lint + knip + mock-inventory + nimmly-guard + demo-fixture-guard + build + desktop build + attestation). 2781 passed / 6 skipped. Attestation status=passed (HEAD `8ab37680`). Only post-verify tree churn is the attestation JSON itself (normal; `/ship` commits it).
**Verdict:** **DONE.**

Both R2 blockers verified resolved against live code, not prose.

## R2 finding disposition

| Finding | Status | Evidence (independently reproduced) |
|---|---|---|
| **CRITICAL-1-R2** guard regex blind to `./demo-fixture.js` | **RESOLVED** | New regex `/['"](?:\.{1,2}\/(?:\.\.\/)*demo-fixture(?:\.js)?\|@hyperidle\/db\/demo-fixture)['"]/` covers `./`, `../`, deep `../../`, extensionless, and workspace subpath. **Live defeat test reproduced:** planted `import { seedDemoWorld } from "./demo-fixture.js";` into `factory-bootstrap.ts` → `demo-fixture-guard:check` exits **1** ("FORBIDDEN production path imports demo-fixture"); reverted → exits **0**. Planted `@hyperidle/db/demo-fixture` into `seed-pg-cli.ts` → exits **1**; reverted → **0**. Permitted importers (`setup-cli.ts`, `seed.ts`, `index.ts`, test files) stay green. Tree clean after each revert. |
| **CRITICAL-1-R2** unit test vacuity | **RESOLVED** | `packages/db/src/__tests__/AF17-demo-fixture-guard.test.ts` (12 tests, all green) builds real temp-dir trees and calls `runDemoFixtureGuard(tmpRoot)`. Genuinely asserts RED (`ok===false`, `reason:"forbidden"`) for `./demo-fixture.js` / no-extension / `../` / workspace-subpath forms in forbidden paths AND `unlisted-non-test` for a stray non-test importer; asserts GREEN for `setup-cli.ts`, `seed.ts`, integration + unit test files, clean files, and empty root. Not vacuous. |
| **WARNING-R2** tree not clean (3 stray progress files) | **RESOLVED** | `git status --porcelain` shows no untracked source/progress files — only normal `.verify-attestations/*` churn. |

## Final AC audit

| AC | Met? | Proven by |
|----|------|-----------|
| **AC1** — fresh desktop/env has full factory layer (no manual step) | **PASS** | `AF17-factory-bootstrap.integration.test.ts` + desktop `main.ts bootLocalMode` wiring. Unchanged, green. |
| **AC2** — shared deploy applies factory layer, idempotent re-run | **PASS** | `AF17-factory-bootstrap.integration.test.ts` AC2 block (equal counts + deep-equal rows after 2nd run, no throw). Unchanged, green. |
| **AC3** — team + automation provisioned at team creation, team-owned, both seams | **PASS** | `AF17-team-routines.integration.test.ts` (FK `team_id==teams.id`, owners∈roster, per-team non-collision, lead fallback). Both seams (`teams-routes.ts` L442, `create-team.ts` L148) `await provisionTeamRoutines(...)` bare — **no `.catch`**, errors propagate (500 / tool failure); CRITICAL-3 fix lore-documented. |
| **AC4** — real DB has no demo data **AND** structural import-allowlist guard enforces it | **PASS** | `AF17-factory-isolation.integration.test.ts` (bootstrap-only DB: 0 teams/humans, no demo rows). Demo world isolated in `demo-fixture.ts`; `seed.ts` is a thin `applyFactoryBootstrap + seedDemoWorld` wrapper. All four forbidden production paths (`seed-pg-cli`, `bootstrap-pg`, `factory-bootstrap`, `migrate-pg`) confirmed clean of any demo-fixture import. **Guard now functional** — live defeat test reds correctly (CRITICAL-1-R2 resolved) + 12 unit tests. |
| **AC5** — bet→review never fails on missing propagation identity | **PASS** | `AF17-propagation-bootstrap.integration.test.ts` (`system:propagation` present post-bootstrap; review-thread insert resolves; PATCH bet→review non-500/422). Unchanged, green. |
| **AC6** — zero "Nimmly" in shipped source; neutral example name; reintroduction guard real | **PASS** | `nimmly-guard:check` green. Grep over `.ts/.tsx` source (excl `dist/`, the guard, the nimmly-guard test) finds only `AF17-factory-isolation.integration.test.ts` — a test asserting absence of nimmly-named rows (legitimate; guard self-excludes test files). Example data renamed `Acme`/`demo-agent-*`. Guard scope principled (WARNING-1 fixed in R2). |

## Lens summary (delta from R2)
- **Architecture:** Seed split complete and correct — leaf `demo-fixture.ts`, thin `seed.ts` wrapper, four forbidden paths clean. Import-allowlist guard is now a real static barrier (verified by live planted-import defeat test, both `./` and workspace forms). FK discipline and dispatch ripple unchanged from R2-green.
- **Security:** No new surface. Empty-catch observability defects gone (R2). Guard reads files only, no traversal risk.
- **Adversarial / Simplification / Slop:** The Saboteur's remaining win (a careless production import of demo data) is now closed by a guard that actually reds. No dead scaffolding, no `--demo` doc-lie, no dual seeders (all resolved R1/R2).

**Verdict: DONE.** Ready for retro + ship.
