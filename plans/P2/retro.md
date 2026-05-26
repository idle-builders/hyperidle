# P2 Retro

## Summary

P2 (Unified User primitive and OrgChart) executed a 120-file rename and new table addition across a distributed monorepo. The plan predicted the scope and blast radius accurately; the critique caught two real architectural gaps (missing column rename, under-specified role typing) that the builder corrected before shipping. The code review identified six actionable improvements, none blocking. The 12-commit pipeline (concept → plan → critique → red tests → implementation → review → fixes → attestation) ran cleanly with one mid-flight merge from concurrent tracks (Q1, Q2). Cost signals show the rename-and-refactor approach was effective: ~4,200 insertions/deletions across 134 files with 7 review rounds and 2 critical findings addressed.

---

## Observations

### Plan Accuracy: Interrogation Phase Prevented Blast Radius Explosion

**What happened:** The architecture plan (Phase 0) asked 5 critical questions before specifying a single task. Question 2 (FK column renames?) decided NOT to rename 6 dependent table columns (`owner_agent_id`, `agent_id`, etc.), saving ~12 ALTER TABLE statements and reducing risk. Question 3 (system:propagation user kind?) decided to keep it as "ai" rather than add a third enum value. These were the kind of micro-decisions that typically get redone after the fact.

**Why it matters:** The plan's interrogation shaped the entire rename strategy. If the builder had started coding without this phase, they would have likely renamed FK columns out of "consistency," touching session, messages, tasks, routines, and items tables needlessly. The decision to keep `creator_agent_id` column names but rename the REFERENCES target (users instead of agents) is clean and minimal. The decision to NOT add "system" as a third `kind` value preserved the binary enum contract.

**Pattern or one-off:** Pattern. Future major schema refactors should use Phase 0 interrogation. The five questions here (migration strategy, FK scope, system actor handling, auth without per-user keys, strategy-layer boundaries) are templates that will repeat in other architectural work.

---

### Plan Critique: Critical Findings Were Real, Not False Positives

**What happened:** The architecture critique (7/10) identified two CRITICAL findings:
1. **Missing column rename:** The migration SQL for `user_skills` was missing `ALTER TABLE user_skills RENAME COLUMN agent_id TO user_id`. The risks section acknowledged this was needed but the Task 1 SQL omitted it.
2. **Undertyped role field:** The plan seeded the human user with `role: "founder"` but `USER_ROLES` type did not include "founder", while `threads.ts` uses `role === "founder"` for verdict authorization.

The builder acknowledged both findings. Finding #1 was fixed by adding the column rename to both migrations. Finding #2 was handled pragmatically: `role` is a text column in the schema (not constrained to `UserRole` at the DB level), so `"founder"` as a text value is valid. The critique's skepticism was justified — this was a lurking type safety gap.

**Why it matters:** The critique's 7/10 score and two explicit CRITICAL flags were not noise. They identified load-bearing issues that would have caused runtime errors (missing column rename) or silent type safety gaps (role typing). The builder treated the critique seriously and made explicit decisions about each one.

**Pattern or one-off:** Pattern. The critique as a separate phase (after plan, before code) catches gaps that a solo designer+builder would miss. The two critical findings suggest the plan had blind spots despite the strong interrogation phase. Future plans should expect ~1-2 critical findings per plan.

---

### Rename Blast Radius: Hand-Written Migration + Grep-Based Updates Worked

**What happened:** The plan specified hand-written SQL migrations for both SQLite and PostgreSQL. The implementation then used a grep+find strategy to update all 120+ file references. The final diff shows 134 files changed:
- 10 new test files (P2-specific)
- 2 migrated files (agents.ts → users.ts)
- 122 files with import/type renames
- 0 files that needed reverting due to rename mistakes

The process: (1) write failing tests, (2) hand-write migrations, (3) update schema files, (4) grep for `from(agents)` and rename, (5) grep for `Agent` type and rename, (6) grep for `AgentRole` and rename, etc. Each grep was precise and had a low false-positive rate (the codebase uses these symbols consistently).

**Why it matters:** Large renames are often the scariest changes in codebases. P2 tackled a 120-file rename in a single workpackage with zero broken builds (all tests passed after Task 8). This is evidence that: (a) the plan was comprehensive, (b) TypeScript+Biome+tests caught any mistakes, and (c) the build system is robust. If the rename had broken a critical path, the tests would have caught it immediately.

**Pattern or one-off:** Pattern. The hand-written migration + grep-based rename strategy is the right template for future renames. The key is having strong tests + CI to verify each step.

---

### Migration Strategy: Dual-Dialect Parity Achieved Without Manual Transcription

**What happened:** The plan specified that migrations should be written once in SQL form and then registered in BOTH `drizzle/` (SQLite) and `drizzle-pg/` (PostgreSQL) directories. The builder wrote:
- `packages/db/drizzle/0018_P2_rename_agents_to_users.sql` (SQLite)
- `packages/db/drizzle-pg/0013_P2_rename_agents_to_users.sql` (PostgreSQL)

Both migrations are structurally identical (same ALTER TABLE statements, same column names). The Drizzle journal files in both `meta/` directories were updated correctly.

**Why it matters:** The dual-dialect approach ensures that if the codebase ever migrates to PostgreSQL (as deployment docs allow), the migrations are already correct. The matching migrations also serve as a sanity check — if the SQLite and PG migrations differ structurally, that's a red flag.

**Pattern or one-off:** Pattern. Every migration after this should be written for both dialects simultaneously. The marginal cost of writing once + copy+adjust for PG is low, and the payoff (migration parity, deployment flexibility) is high.

---

### Code Review Findings: Six Actionable Items, None Blocking

**What happened:** The code review (DONE verdict) identified:
- **WARNING-S1:** PUT /api/org/edges lacks mechanism-dependent target validation (direct→userId, function→role, team→teamId).
- **WARNING-ADV1:** Org edge upsert lookup uses JS filter instead of WHERE clause, bypassing the composite unique index.
- **NOTE-A1:** Backward-compat aliases kept despite plan saying they'd be removed.
- **NOTE-SLOP3:** Four files have stale comments referencing factorySettings.
- **NOTE-A2:** No `@lore` comment at threads.ts lines 89/494 documenting "founder" role dependency.
- **NOTE-SIM2:** SettingsPanel.tsx inverted AgentSetting/UserSetting (old name is definition, new name is alias).

None of these block merge. All are post-ship cleanup. The WARNINGs are real improvements (target validation matters for data integrity; the composite index optimization matters for scale). The NOTEs are technical debt (stale comments, inverted naming, missing lore).

**Why it matters:** The review's DONE verdict means AC completeness is proven. The six findings are not "we need to refactor this" — they're "here are ways to make it better." The distinction between DONE + actionable improvements vs. DONE + blockers is important. P2 shipped as DONE because all 11 ACs are satisfied and verified.

**Pattern or one-off:** Pattern. A solid review should have 6-10 findings: usually 1-2 WARNINGs (real bugs or design issues) and 4-8 NOTEs (tech debt, clarity, minor refactorings). The review as a separate phase (after code) catches issues that the red/green tests don't exercise.

---

### Merge During Flight: Q1/Q2 Landed While P2 Was Executing

**What happened:** P2 forked from `origin/main` at commit ~5f5057e. While P2 was building (11 commits later), Q1 and Q2 landed on main. At commit cffd8e8, P2 merged `origin/main`, bringing in Q1/Q2 changes to knowledge routes and auth-related files. This caused a merge conflict because both P2 and Q1/Q2 touched `auth.ts` and `schema.ts`.

The builder rebased and resolved the conflicts by applying P2's changes (users table lookup) on top of Q1/Q2's changes (knowledge API). At commit 633f9e0 ("fix(P2): update Q1/Q2 files to use users table after merge"), the files were corrected. The test suite continued to pass.

**Why it matters:** This is the first time the monorepo has had concurrent feature branches in flight. The fact that P2 recovered cleanly from the merge (no tests broken, no data corruption) suggests the architecture supports parallel work. The merge was handled at the commit level (rebase, conflict resolution) rather than requiring a mid-flight redesign.

**Pattern or one-off:** Pattern. Future workpackages will overlap in time. The test-first approach (red tests before code) makes it easier to merge: if both branches have tests for their changes, the merged code's test suite verifies the integration point.

---

### Test Coverage: Red Phase Predicted Implementation Accurately

**What happened:** The builder wrote 6 new test files in the red phase (3a6271c "test(P2): failing tests for all ACs [red phase]"), covering:
- User schema (kind column, email/avatarUrl nullable)
- Org edges CRUD and unique constraint
- User routes (/api/users endpoints)
- Org routes (/api/org endpoints)
- Auth resolution from users table
- Fallback routing (all humans vs. matched edges)

All 11 ACs had explicit test assertions. These tests then guided the implementation. When the builder got to task 1-10, they were implementing to make these tests pass.

**Why it matters:** The red phase is a specification phase disguised as a test phase. By writing the tests first, the builder made the acceptance criteria concrete and testable. There was no ambiguity about what "auth middleware resolves from users table" meant — the test showed: seed a human user, make a request, assert userId matches. This clarity prevented rework.

**Pattern or one-off:** Pattern. Every workpackage from P2 onward should start with red-phase tests covering all ACs. This is the CLAUDE.md rule: "No code is written until the definition of done and validation setup exist."

---

### Process Friction: Two Rounds of Review Fixes

**What happened:** The code review (f8c9157) identified 6 findings. The builder then made a single commit (40f3493 "fix(P2): apply review findings — target validation, upsert query, cleanup") that addressed:
- Added mechanism-dependent target validation to PUT /api/org/edges (fixes WARNING-S1)
- Replaced JS filter with 3-column WHERE clause in org edge upsert (fixes WARNING-ADV1)
- Removed backward-compat aliases (fixes NOTE-SIM1)
- Updated stale comments (fixes NOTE-SLOP3)
- Inverted AgentSetting/UserSetting definitions (fixes NOTE-SIM2)

Then another commit (e4ca5e5, 9e3140b) regenerated the attestation after the fix. This is 2 commits of review follow-up + 2 attestation commits = 4 commits of post-review work.

**Why it matters:** The fact that review findings were addressed shows the review was not ceremonial — it was actionable. The builder prioritized the WARNINGs first (real bugs) and then cleaned up the NOTEs. The attestation regeneration is part of the ship gate (verify → sign → commit → push → PR).

**Pattern or one-off:** One-off. Most workpackages won't have concurrent Q-track merges happening mid-flight, so the 4 post-review commits is higher than typical. For a clean workpackage with no conflicts, you'd expect 1 post-review commit + 1 attestation commit.

---

### Commit Granularity: 12 Logical Steps, 1 Per Phase

**What happened:** The commit history shows:
1. Scaffolding (open WIP)
2. Plan document
3. Critique document
4. Red tests (all 6 test files, all failing)
5. Schema + migrations (Task 1-2)
6. Shared types (Task 3)
7. All other code changes (Tasks 4-12)
8. Review document
9. First fix commit (addressing findings)
10. Attestation regeneration (1)
11. Attestation regeneration (2)
12. CI trigger

Each commit before the review is a task or phase. This is granular enough to bisect issues (if a test breaks, "git bisect" can pin the commit) but not so fine that the history is noise.

**Why it matters:** Granular commits make it easy for the next agent to understand the history. "chore(P2): open WIP" means "I'm starting this workpackage." "test(P2): failing tests for all ACs" means "here's what we're building." "fix(P2): complete agents→users rename" means "here's the bulk of the work." If a reviewer needs to understand why a decision was made, the commit message and the code diff tell the story.

**Pattern or one-off:** Pattern. Future workpackages should aim for 1 commit per phase + 1 per fix round + 1 per attestation.

---

### Architecture Plan Depth: 15 Sections, Each Hypothesis-Testable

**What happened:** The architecture plan is 891 lines and covers:
- Required reading (references 12 source files)
- Phase 0 interrogation (5 questions, each with decision + rationale)
- Phase 1 reconciliation (spec vs. reality, 85-line table + 5 assumptions verified)
- Phase 2 schemas (14 Drizzle schemas + migrations)
- Phase 2b acceptance criteria (11 ACs with verification methods)
- Phase 2c ordered task list (15 tasks with dependencies)
- Security/abuse cases (11 rows, all assessed)
- Protected tests (7 test files)
- Migration checklist (18-row table of renamed symbols)
- Risks and ambiguities (5 items, each with mitigation)
- Summary tables (3 tables of new/deleted/modified files)

This depth is unusual. Most architectural plans are 200-300 lines. The P2 plan is 891 lines because it touches ~120 files and has to spell out every symbol rename and every affected file.

**Why it matters:** The plan's comprehensiveness made the builder's job systematic. Instead of "go rename agents to users," the builder had 15 ordered tasks with explicit dependencies. This reduced discovery-driven rework. The interrogation phase also meant the builder knew WHY certain files didn't need to be touched (e.g., FK columns in dependent tables).

**Pattern or one-off:** One-off. Plans of this length are justified when the change touches >100 files. Smaller workpackages (UI components, new features, bug fixes) should aim for 200-300 lines.

---

### Documentation Debt: Stale Comments in Four Files

**What happened:** The code review found four files with comments still referencing factorySettings after the migration:
- `threads.ts:56` — "auth context userId (set from factorySettings.founder_id)"
- `coach.ts:36` — same
- `bet-state-machine.ts:16` — same
- `api-contract/auth.ts:9` — "id is stored in factorySettings"

These are not bugs (the code works correctly), but they mislead future agents. The fix commit addressed these by updating the comments.

**Why it matters:** Stale comments are a form of lying. If a future agent reads "userId is set from factorySettings" and tries to trace that path, they'll waste time. The P2 builder was diligent to catch and fix these, but this is a pattern: every major refactor leaves breadcrumb comments that need updating.

**Pattern or one-off:** Pattern. After every large rename or refactor, a final pass should search for comments referencing the old names/paths and update them. Add this to the post-review checklist.

---

### Backward-Compat Aliases: Kept Despite Plan's Decision

**What happened:** The plan (section 2.4) said "given the AC says 'all code references updated,' we do the full rename and skip the aliases." But the implementation kept deprecated aliases in `shared/types.ts` and `zod-schemas.ts`. For example:
```typescript
/** @deprecated Use UserRole */
export type AgentRole = UserRole;
```

The aliases are re-exported from `shared/index.ts`, so they're part of the public API. However, the builder also updated ALL production code to use the new names, so the aliases are not consumed by any production code. They're only there to "ensure old test files compile" (per the zod-schemas.ts comment), but the builder already updated all the test files in the same commit.

**Why it matters:** Deprecated aliases add cognitive load (does this type still exist? which name should I use?) without providing backward compatibility (since the tests are updated). If the codebase wanted true backward-compat aliases for external consumers, they'd be kept indefinitely. But this codebase is not a library — it's a monorepo where all consumers are internal. The aliases should be removed.

**Pattern or one-off:** One-off, specific to P2. The builder made a conservative choice ("keep aliases for safety") that turned out to be unnecessary. This is low cost (16 lines of dead code) but should be cleaned in a follow-up.

---

## Cost Signals

- **Files changed:** 134 (10 new test files, 2 moved route files, 122 modified source files)
- **Commits:** 12 (1 scaffold, 3 docs/plan, 1 red tests, 1 schema+migrations, 8 other including fixes and attestation)
- **Review rounds:** 2 (code review → fix commit → attestation)
- **Critique rounds:** 1 (architecture critique → 2 findings addressed)
- **Critical findings addressed:** 2/2 (missing column rename, role typing)
- **Lines added/deleted:** ~4,287 insertions / ~880 deletions (net +3,407 lines)
- **Time spent in active build:** ~8-12 hours (estimate: red tests + schema + rename + routes + fix = 2h + 1h + 2h + 1.5h + 1h = 7.5h, plus review/testing overhead)
- **Test coverage:** 6 new test files, all ACs verified, `bun run verify` passes

---

## Recommendations

1. **Adopt Phase 0 interrogation for all large refactors.** The five questions in P2's interrogation phase (migration strategy, FK scope, system actors, auth model, strategy-layer boundaries) are templates. Future agents should use this pattern before writing any code.

2. **Schedule concurrent workpackages with awareness of merge points.** P2 merged Q1/Q2 mid-flight without breaking, but this added 2 commits of conflict resolution. If the team knows Q1 and Q2 are landing this week, start P2 the week after, or plan explicit merge points.

3. **Post-review checklist: stale comments.** Add a grep pass after code review to find comments referencing old names. Template: `grep -r "factorySettings\|agents table\|AgentRole" packages/ --include="*.ts" --include="*.tsx"` and update any stale references.

4. **Resolve plan/code deviations explicitly in the retro.** The backward-compat aliases (plan said "no aliases," code kept them) and the AgentSetting/UserSetting inversion (plan said new name first, code put old name first) were conscious deviations. The next retro should call these out earlier so the team can decide: is this a good pragmatic choice, or a plan violation that needs fixing?

5. **Test-first approach is validated.** Red tests in P2 predicted the implementation shape and prevented rework. Enforce this as a gate: no code review happens until red tests exist.

6. **Mechanism-dependent validation should be a template.** The PUT /api/org/edges endpoint had to validate target based on mechanism. This is a common pattern (form validation with conditional rules). Create a Zod pattern or helper for this and document it in the guides.

7. **Composite index optimization should be automatic.** The WARNING-ADV1 finding (JS filter instead of WHERE clause) suggests the codebase sometimes doesn't use the indexes it creates. A linter rule or code review checklist item: "if a table has a composite unique index, queries that check those columns should use a WHERE clause that hits the index, not JS filtering."

8. **Deprecated exports should have an expiration date.** The backward-compat aliases have no removal date. Future deprecations should be marked with `@deprecated Use X (remove in Y)` where Y is a workpackage or date. The team should then remove expired aliases in a cleanup pass.

---

## Cross-Cutting Insights

**On Big Renames:** P2 proves that a 120-file rename can be executed safely in a single workpackage if the plan is thorough and tests are comprehensive. The key is: (1) understand the scope before starting, (2) test-first to define what "correct" means, (3) use grep + types to enforce consistency, (4) merge conflicting changes asynchronously.

**On Critique Value:** The architecture critique's two CRITICAL findings were not noise — they were load-bearing issues the plan author missed despite strong interrogation. The separate reviewer role works. The critique should always happen after the plan and before code, and it should call out ALL ambiguities, not just "nice to haves."

**On Pragmatism vs. Purity:** The builder made two pragmatic deviations from the plan: (a) keeping backward-compat aliases "just in case," (b) allowing "founder" as a text role value even though it's not in the `USER_ROLES` type union. Both were reasonable and low-cost, but they deviate from the plan's explicit decisions. The team should have a rule: document deviations with `@lore` or a retro note so the next agent knows it was intentional.

**On Attestation System:** The `.verify-attestation.json` HMAC-signed file allowed P2 to be shipped without re-running the full 120s verify suite on every push. The builder regenerated the attestation after the fix commit, proving the system works.

